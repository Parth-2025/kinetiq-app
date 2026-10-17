import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Text as NativeText, View } from "react-native";
import * as THREE from "three";

type SceneProps = {
  points: (number[] | null)[];
  angle: number;
  background: string;
  tone: string;
  accent: string;
};

const links: [number, number, number][] = [
  [11, 12, 0.07], [11, 23, 0.09], [12, 24, 0.09], [23, 24, 0.08],
  [11, 13, 0.055], [13, 15, 0.045], [12, 14, 0.055], [14, 16, 0.045],
  [23, 25, 0.07], [25, 27, 0.055], [24, 26, 0.07], [26, 28, 0.055],
  [27, 31, 0.035], [28, 32, 0.035],
];

function point3(point: number[] | null | undefined, origin: THREE.Vector3) {
  if (!point || point.length < 4 || !point.slice(0, 4).every(Number.isFinite) || point[3] < 0.65) return null;
  return new THREE.Vector3(
    (point[0] - origin.x) * 2.4,
    (origin.y - point[1]) * 2.4,
    (origin.z - point[2]) * 2.4,
  );
}

// World landmarks use downward Y and depth away from the camera; Three uses upward Y
// and positive Z toward the camera. Center on the hips; preserve metric proportions.
/** Actual WebGL 3D rendering of articulated capsule volumes, driven by pose landmarks. */
export function MannequinScene({ points, angle, background, tone, accent }: SceneProps) {
  const glRef = useRef<ExpoWebGLRenderingContext | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const figureRef = useRef<THREE.Group | null>(null);
  const limbsRef = useRef<THREE.Mesh[]>([]);
  const jointsRef = useRef<Map<number, THREE.Mesh>>(new Map());
  const sizesRef = useRef({ width: 1, height: 350 });
  const latestRef = useRef({ points, angle, background, tone, accent });
  const [failed, setFailed] = useState(false);
  const mountedRef = useRef(true);
  const activeRef = useRef(AppState.currentState === null || AppState.currentState === "active");
  const rafRef = useRef<number | null>(null);
  const drawRef = useRef<() => void>(() => undefined);
  const dispose = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    sceneRef.current?.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
        meshMaterials.forEach((material) => materials.add(material));
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    rendererRef.current?.dispose();
    rendererRef.current = null;
    sceneRef.current = null;
    cameraRef.current = null;
    figureRef.current = null;
    limbsRef.current = [];
    jointsRef.current.clear();
    glRef.current = null;
  }, []);
  const scheduleDraw = useCallback(() => {
    if (!mountedRef.current || !activeRef.current || rafRef.current !== null || !rendererRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (!mountedRef.current || !activeRef.current) return;
      try {
        if (glRef.current?.isContextLost()) throw new Error("GL context lost");
        drawRef.current();
      } catch {
        dispose();
        if (mountedRef.current) setFailed(true);
      }
    });
  }, [dispose]);
  latestRef.current = { points, angle, background, tone, accent };

  const onLayout = useCallback((event: { nativeEvent: { layout: { width: number; height: number } } }) => {
    sizesRef.current = event.nativeEvent.layout;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (renderer && camera) {
      // The native drawing buffer determines pixel resolution; layout only changes aspect.
      camera.aspect = sizesRef.current.width / Math.max(1, sizesRef.current.height);
      camera.updateProjectionMatrix();
      scheduleDraw();
    }
  }, [scheduleDraw]);

  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    if (!mountedRef.current) return;
    dispose();
    try {
      glRef.current = gl;
      const canvas = {
        width: gl.drawingBufferWidth,
        height: gl.drawingBufferHeight,
        style: {},
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        clientHeight: gl.drawingBufferHeight,
      } as unknown as HTMLCanvasElement;
      const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true, alpha: false });
      renderer.setPixelRatio(1);
      renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false);
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(latestRef.current.background);
      sceneRef.current = scene;
      scene.add(new THREE.HemisphereLight(0xffffff, 0x827c73, 2.1));
      const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
      keyLight.position.set(-3, 5, 6);
      scene.add(keyLight);
      const camera = new THREE.PerspectiveCamera(35, gl.drawingBufferWidth / Math.max(1, gl.drawingBufferHeight), 0.1, 100);
      camera.position.set(0, 0.15, 6.6);
      camera.lookAt(0, 0.05, 0);
      const figure = new THREE.Group();
      scene.add(figure);

      const material = new THREE.MeshStandardMaterial({ color: latestRef.current.tone, roughness: 0.88, metalness: 0 });
      const capsuleGeometry = new THREE.CylinderGeometry(1, 1, 1, 12, 1, false);
      const limbs = links.map(() => {
        const mesh = new THREE.Mesh(capsuleGeometry, material);
        figure.add(mesh);
        return mesh;
      });
      const jointMaterial = new THREE.MeshStandardMaterial({ color: latestRef.current.accent, roughness: 0.82 });
      const jointGeometry = new THREE.SphereGeometry(1, 12, 10);
      const joints = new Map<number, THREE.Mesh>();
      for (const index of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 31, 32]) {
        const joint = new THREE.Mesh(jointGeometry, jointMaterial);
        joint.visible = false;
        figure.add(joint);
        joints.set(index, joint);
      }
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), material);
      head.visible = false;
      figure.add(head);
      figure.userData.head = head;
      const chest = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), material);
      const pelvis = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), material);
      chest.visible = false;
      pelvis.visible = false;
      figure.add(chest, pelvis);
      figure.userData.chest = chest;
      figure.userData.pelvis = pelvis;

      sceneRef.current = scene;
      cameraRef.current = camera;
      figureRef.current = figure;
      limbsRef.current = limbs;
      jointsRef.current = joints;
      setFailed(false);
      scheduleDraw();
    } catch {
      dispose();
      setFailed(true);
    }
  }, [dispose, scheduleDraw]);

  drawRef.current = () => {
      const gl = glRef.current;
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const figure = figureRef.current;
      if (gl && renderer && scene && camera && figure) {
        const state = latestRef.current;
        scene.background = new THREE.Color(state.background);
        const bodyMaterial = limbsRef.current[0]?.material as THREE.MeshStandardMaterial | undefined;
        if (bodyMaterial) bodyMaterial.color.set(state.tone);
        for (const joint of jointsRef.current.values()) {
          (joint.material as THREE.MeshStandardMaterial).color.set(state.accent);
        }
        figure.rotation.y = (state.angle * Math.PI) / 180;

        const reliable = state.points.filter((p) => p && p.length >= 4 && p.slice(0, 4).every(Number.isFinite) && p[3] >= 0.65) as number[][];
        const hips = [state.points[23], state.points[24]].filter((p) => p && p.length >= 4 && p.slice(0, 4).every(Number.isFinite) && p[3] >= 0.65) as number[][];
        const origin = new THREE.Vector3(
          hips.length ? hips.reduce((sum, p) => sum + p[0], 0) / hips.length : reliable.reduce((sum, p) => sum + p[0], 0) / Math.max(1, reliable.length),
          hips.length ? hips.reduce((sum, p) => sum + p[1], 0) / hips.length : 0,
          hips.length ? hips.reduce((sum, p) => sum + p[2], 0) / hips.length : 0,
        );
        links.forEach(([a, b, radius], index) => {
          const start = point3(state.points[a], origin);
          const end = point3(state.points[b], origin);
          const mesh = limbsRef.current[index];
          mesh.visible = !!start && !!end;
          if (start && end) {
            const delta = new THREE.Vector3().subVectors(end, start);
            mesh.position.copy(start).add(end).multiplyScalar(0.5);
            mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
            mesh.scale.set(radius, delta.length(), radius);
          }
        });
        for (const [index, joint] of jointsRef.current) {
          const pos = point3(state.points[index], origin);
          joint.visible = !!pos;
          if (pos) {
            joint.position.copy(pos);
            joint.scale.setScalar(index >= 31 ? 0.035 : 0.05);
          }
        }
        const nose = point3(state.points[0], origin);
        const head = figure.userData.head as THREE.Mesh;
        head.visible = !!nose;
        if (nose) head.position.copy(nose).add(new THREE.Vector3(0, 0.2, 0));
        const leftShoulder = point3(state.points[11], origin);
        const rightShoulder = point3(state.points[12], origin);
        const leftHip = point3(state.points[23], origin);
        const rightHip = point3(state.points[24], origin);
        const chest = figure.userData.chest as THREE.Mesh;
        const pelvis = figure.userData.pelvis as THREE.Mesh;
        chest.visible = !!leftShoulder && !!rightShoulder && !!leftHip && !!rightHip;
        pelvis.visible = chest.visible;
        if (leftShoulder && rightShoulder && leftHip && rightHip) {
          const shoulderMid = leftShoulder.clone().add(rightShoulder).multiplyScalar(0.5);
          const hipMid = leftHip.clone().add(rightHip).multiplyScalar(0.5);
          const torsoAxis = new THREE.Vector3().subVectors(hipMid, shoulderMid);
          const shoulderWidth = leftShoulder.distanceTo(rightShoulder);
          const hipWidth = leftHip.distanceTo(rightHip);
          chest.position.copy(shoulderMid).addScaledVector(torsoAxis, 0.28);
          chest.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), torsoAxis.clone().normalize());
          chest.scale.set(Math.max(0.12, shoulderWidth * 0.58), Math.max(0.18, torsoAxis.length() * 0.48), 0.16);
          pelvis.position.copy(shoulderMid).addScaledVector(torsoAxis, 0.76);
          pelvis.quaternion.copy(chest.quaternion);
          pelvis.scale.set(Math.max(0.1, hipWidth * 0.55), Math.max(0.12, torsoAxis.length() * 0.28), 0.15);
        }
        renderer.render(scene, camera);
        gl.endFrameEXP();
      }
  };

  useEffect(() => {
    scheduleDraw();
  }, [points, angle, background, tone, accent, scheduleDraw]);

  useEffect(() => {
    mountedRef.current = true;
    const subscription = AppState.addEventListener("change", (state) => {
      activeRef.current = state === "active";
      if (activeRef.current) scheduleDraw();
      else if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    });
    return () => {
      mountedRef.current = false;
      subscription.remove();
      dispose();
    };
  }, [dispose, scheduleDraw]);

  return (
    <View onLayout={onLayout} style={{ height: 350, width: "100%", backgroundColor: background }}>
      <GLView style={{ flex: 1 }} onContextCreate={onContextCreate} />
      {failed ? (
        <View accessibilityLabel="3D renderer unavailable" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: background }}>
          <NativeText style={{ color: tone, textAlign: "center" }}>3D preview is unavailable on this device.</NativeText>
        </View>
      ) : null}
    </View>
  );
}
