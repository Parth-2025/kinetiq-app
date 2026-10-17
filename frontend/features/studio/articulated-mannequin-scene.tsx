import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Text as NativeText, View } from "react-native";
import * as THREE from "three";
import { createMannequinFigure, updateMannequinFigure } from "./mannequin-figure";

type Props = { positions: (number[] | null)[]; angle: number; background: string; tone: string };

/** One neutral articulated figure for both live landmark and saved-rig replay. */
export function ArticulatedMannequinScene(props: Props) {
  const latest = useRef(props); latest.current = props;
  const context = useRef<{ gl: ExpoWebGLRenderingContext; renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; figure: THREE.Group } | null>(null);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);
  const active = useRef(AppState.currentState == null || AppState.currentState === "active");
  const raf = useRef<number | null>(null);
  const size = useRef({ width: 1, height: 420 });
  const dispose = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    const state = context.current;
    context.current = null;
    if (!state) return;
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    state.scene.traverse(object => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => materials.add(m));
      }
    });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    state.renderer.dispose();
  }, []);
  const schedule = useCallback(() => {
    if (!mounted.current || !active.current || !context.current || raf.current !== null) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = null;
      const state = context.current;
      if (!state || !mounted.current || !active.current) return;
      try {
        if (state.gl.isContextLost()) throw new Error("Context lost");
        const { positions, angle, background } = latest.current;
        state.scene.background = new THREE.Color(background);
        updateMannequinFigure(state.figure, positions);
        state.figure.rotation.y = angle * Math.PI / 180;
        state.renderer.render(state.scene, state.camera);
        state.gl.endFrameEXP();
      } catch { dispose(); if (mounted.current) setFailed(true); }
    });
  }, [dispose]);
  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    if (!mounted.current) return;
    dispose();
    try {
      const canvas = { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, style: {}, addEventListener: () => undefined, removeEventListener: () => undefined, clientHeight: gl.drawingBufferHeight } as unknown as HTMLCanvasElement;
      const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true, alpha: false });
      renderer.setPixelRatio(1); renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(35, gl.drawingBufferWidth / Math.max(1, gl.drawingBufferHeight), 0.05, 30);
      const figure = createMannequinFigure(); scene.add(figure);
      context.current = { gl, renderer, scene, camera, figure };
      scene.add(new THREE.HemisphereLight(0xfff4e5, 0x72706b, 2));
      const key = new THREE.DirectionalLight(0xffffff, 2.5); key.position.set(-3, 5, 4); scene.add(key);
      const fill = new THREE.DirectionalLight(0xffffff, 0.8); fill.position.set(3, 2, -3); scene.add(fill);
      // Fixed framing avoids camera pumping as hands and legs move.
      camera.position.set(0, 0.1, Math.max(3.7, 2.4 / camera.aspect)); camera.lookAt(0, 0.05, 0);
      setFailed(false); schedule();
    } catch { dispose(); if (mounted.current) setFailed(true); }
  }, [dispose, schedule]);
  useEffect(() => { schedule(); }, [props.positions, props.angle, props.background, schedule]);
  useEffect(() => {
    mounted.current = true;
    const listener = AppState.addEventListener("change", state => {
      active.current = state === "active";
      if (active.current) schedule();
      else if (raf.current !== null) { cancelAnimationFrame(raf.current); raf.current = null; }
    });
    return () => { mounted.current = false; listener.remove(); dispose(); };
  }, [dispose, schedule]);
  return <View style={{ height: 420, width: "100%", backgroundColor: props.background }} onLayout={event => {
    size.current = event.nativeEvent.layout;
    if (context.current) {
      const { camera } = context.current;
      camera.aspect = size.current.width / Math.max(1, size.current.height);
      camera.position.z = Math.max(3.7, 2.4 / camera.aspect); camera.updateProjectionMatrix(); schedule();
    }
  }}>
    <GLView style={{ flex: 1 }} onContextCreate={onContextCreate} />
    {failed && <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", backgroundColor: props.background }}><NativeText style={{ color: props.tone }}>3D preview is unavailable on this device.</NativeText></View>}
  </View>;
}
