import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Text as NativeText, View } from "react-native";
import * as THREE from "three";
import { createLimbChain, supportedChain, updateLimbChain, type DisplayRig, type LimbChain } from "./skinned-rig";

type Props = { rig: DisplayRig; frameIndex: number; angle: number; background: string; tone: string; accent: string };
const specs = [
  { key: "left_arm", ids: [4, 6, 8], radius: 0.055, accent: false },
  { key: "right_arm", ids: [5, 7, 9], radius: 0.055, accent: false },
  { key: "left_leg", ids: [2, 10, 12], radius: 0.075, accent: false },
  { key: "right_leg", ids: [3, 11, 13], radius: 0.075, accent: false },
] as const;

/** Procedural display volumes; only supported estimated limb chains are shown. */
export function SkinnedMannequinScene({ rig, frameIndex, angle, background, tone, accent }: Props) {
  const glRef = useRef<ExpoWebGLRenderingContext | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const figureRef = useRef<THREE.Group | null>(null);
  const chainsRef = useRef<LimbChain[]>([]);
  const sizeRef = useRef({ width: 1, height: 350 });
  const latestRef = useRef({ rig, frameIndex, angle, background, tone, accent });
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true), active = useRef(AppState.currentState === null || AppState.currentState === "active");
  const raf = useRef<number | null>(null);
  const draw = useRef<() => void>(() => undefined);
  latestRef.current = { rig, frameIndex, angle, background, tone, accent };

  const dispose = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    sceneRef.current?.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        (Array.isArray(object.material) ? object.material : [object.material]).forEach((m) => materials.add(m));
        if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
      }
    });
    geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose());
    chainsRef.current = [];
    rendererRef.current?.dispose(); rendererRef.current = null;
    sceneRef.current = null; cameraRef.current = null; figureRef.current = null; glRef.current = null;
  }, []);
  const schedule = useCallback(() => {
    if (!mounted.current || !active.current || raf.current !== null || !rendererRef.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = null;
      if (!mounted.current || !active.current) return;
      try {
        if (glRef.current?.isContextLost()) throw new Error("GL context lost");
        draw.current();
      } catch { dispose(); if (mounted.current) setFailed(true); }
    });
  }, [dispose]);

  const onLayout = useCallback((event: { nativeEvent: { layout: { width: number; height: number } } }) => {
    sizeRef.current = event.nativeEvent.layout;
    const renderer = rendererRef.current, camera = cameraRef.current;
    if (renderer && camera) { camera.aspect = sizeRef.current.width / Math.max(1, sizeRef.current.height); camera.updateProjectionMatrix(); schedule(); }
  }, [schedule]);

  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    if (!mounted.current) return;
    dispose();
    try {
      glRef.current = gl;
      const canvas = { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, style: {}, addEventListener: () => undefined, removeEventListener: () => undefined, clientHeight: gl.drawingBufferHeight } as unknown as HTMLCanvasElement;
      const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true, alpha: false });
      renderer.setPixelRatio(1); renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false); rendererRef.current = renderer;
      const scene = new THREE.Scene(); sceneRef.current = scene;
      scene.background = new THREE.Color(latestRef.current.background);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x827c73, 2.1));
      const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-3, 5, 6); scene.add(key);
      const camera = new THREE.PerspectiveCamera(35, gl.drawingBufferWidth / Math.max(1, gl.drawingBufferHeight), 0.1, 100);
      camera.position.set(0, 0.15, 8.5); camera.lookAt(0, 0, 0);
      const material = new THREE.MeshStandardMaterial({ color: latestRef.current.tone, roughness: 0.88, metalness: 0 });
      const accentMat = new THREE.MeshStandardMaterial({ color: latestRef.current.accent, roughness: 0.82 });
      const figure = new THREE.Group(); scene.add(figure); figureRef.current = figure;
      for (const spec of specs) {
        const keyName = spec.key as "left_arm" | "right_arm" | "left_leg" | "right_leg";
        if (!supportedChain(latestRef.current.rig, keyName)) continue;
        const [root, mid, end] = spec.ids;
        const a = latestRef.current.rig.joints[mid]!.length_m!;
        const b = latestRef.current.rig.joints[end]!.length_m!;
        const chain = createLimbChain(a * 2.4, b * 2.4, spec.radius, keyName.endsWith("arm") ? material : accentMat);
        chain.mesh.frustumCulled = false;
        chain.mesh.userData.jointIds = spec.ids;
        // Scene owns geometry/material disposal once, even if a material is shared.
        figure.add(chain.mesh); chainsRef.current.push(chain);
      }
      const torsoGeo = new THREE.SphereGeometry(1, 16, 12);
      const torso = new THREE.Mesh(torsoGeo, material), pelvisMesh = new THREE.Mesh(torsoGeo, accentMat);
      torso.visible = false; pelvisMesh.visible = false; figure.add(torso, pelvisMesh);
      figure.userData.torso = torso; figure.userData.pelvis = pelvisMesh;
      const head = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), material); head.visible = false;
      figure.add(head); figure.userData.head = head;
      sceneRef.current = scene; cameraRef.current = camera; setFailed(false); schedule();
    } catch { dispose(); setFailed(true); }
  }, [dispose, schedule]);

  draw.current = () => {
    const gl = glRef.current, renderer = rendererRef.current, scene = sceneRef.current, camera = cameraRef.current;
    if (!gl || !renderer || !scene || !camera) return;
    const state = latestRef.current; scene.background = new THREE.Color(state.background);
    const figure = figureRef.current;
    if (!figure) return;
    const frame = state.rig.frames[state.frameIndex];
    const valid = (p: number[] | null | undefined): p is number[] => !!p && p.length === 3 && p.every(Number.isFinite);
    const point = (v: number[], origin: THREE.Vector3) => new THREE.Vector3((v[0] - origin.x) * 2.4, (v[1] - origin.y) * 2.4, (v[2] - origin.z) * 2.4);
    if (frame) {
      const pelvis = frame.positions_m[0];
      const origin = valid(pelvis) ? new THREE.Vector3(...pelvis) : new THREE.Vector3();
      for (const chain of chainsRef.current) {
        const ids = chain.mesh.userData.jointIds as number[];
        const [a, b, c] = ids.map((i) => frame.positions_m[i]);
        if (!valid(a) || !valid(b) || !valid(c)) { chain.mesh.visible = false; continue; }
        chain.mesh.visible = true;
        updateLimbChain(chain, point(a, origin), point(b, origin), point(c, origin));
        const mat = chain.mesh.material as THREE.MeshStandardMaterial;
        mat.color.set(ids[0] === 4 || ids[0] === 5 ? state.tone : state.accent);
      }
      const torso = figure.userData.torso as THREE.Mesh;
      const pelvisMesh = figure.userData.pelvis as THREE.Mesh;
      const head = figure.userData.head as THREE.Mesh;
      (torso.material as THREE.MeshStandardMaterial).color.set(state.tone);
      (pelvisMesh.material as THREE.MeshStandardMaterial).color.set(state.accent);
      const shoulderL = frame.positions_m[4], shoulderR = frame.positions_m[5];
      const hipL = frame.positions_m[2], hipR = frame.positions_m[3];
      const supportedTorso = [shoulderL, shoulderR, hipL, hipR].every(valid);
      torso.visible = supportedTorso; pelvisMesh.visible = supportedTorso;
      if (supportedTorso) {
        const sl = point(shoulderL!, origin), sr = point(shoulderR!, origin), hl = point(hipL!, origin), hr = point(hipR!, origin);
        const sm = sl.clone().add(sr).multiplyScalar(0.5), hm = hl.clone().add(hr).multiplyScalar(0.5);
        const axis = hm.clone().sub(sm), shoulderWidth = sl.distanceTo(sr), hipWidth = hl.distanceTo(hr);
        torso.position.copy(sm).addScaledVector(axis, 0.45); torso.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize());
        torso.scale.set(Math.max(0.12, shoulderWidth * 0.42), Math.max(0.15, axis.length() * 0.42), 0.14);
        pelvisMesh.position.copy(hm).addScaledVector(axis, -0.12); pelvisMesh.quaternion.copy(torso.quaternion);
        pelvisMesh.scale.set(Math.max(0.12, hipWidth * 0.55), Math.max(0.12, axis.length() * 0.2), 0.15);
      }
      const headPoint = frame.positions_m[16]; head.visible = valid(headPoint);
      if (valid(headPoint)) { head.position.copy(point(headPoint, origin)); head.scale.set(0.14, 0.18, 0.14); }
    } else {
      chainsRef.current.forEach((chain) => { chain.mesh.visible = false; });
      (figure.userData.torso as THREE.Mesh).visible = false;
      (figure.userData.pelvis as THREE.Mesh).visible = false;
      (figure.userData.head as THREE.Mesh).visible = false;
    }
    // Angle rotates the whole display around the canonical Y-up axis.
    figure.rotation.y = (state.angle * Math.PI) / 180;
    renderer.render(scene, camera); gl.endFrameEXP();
  };

  useEffect(() => { schedule(); }, [rig, frameIndex, angle, background, tone, accent, schedule]);
  useEffect(() => {
    mounted.current = true;
    const sub = AppState.addEventListener("change", (s) => { active.current = s === "active"; if (active.current) schedule(); else if (raf.current !== null) { cancelAnimationFrame(raf.current); raf.current = null; } });
    return () => { mounted.current = false; sub.remove(); dispose(); };
  }, [dispose, schedule]);

  return <View onLayout={onLayout} style={{ height: 350, width: "100%", backgroundColor: background }}>
    <GLView style={{ flex: 1 }} onContextCreate={onContextCreate} />
    {failed ? <View accessibilityLabel="3D renderer unavailable" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: background }}><NativeText style={{ color: tone, textAlign: "center" }}>3D preview is unavailable on this device.</NativeText></View> : null}
  </View>;
}
