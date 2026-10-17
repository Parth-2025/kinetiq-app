import * as THREE from "three";

export type DisplayJoint = {
  name: string;
  parent: number | null;
  rest_position_m: [number, number, number] | null;
  length_m: number | null;
};
export type DisplayFrame = { sample_index: number; time_s: number; quality: string; positions_m: ([number, number, number] | null)[] };
export type DisplayRig = { joints: DisplayJoint[]; frames: DisplayFrame[] };
export type LimbChain = { root: THREE.Bone; elbow: THREE.Bone; end: THREE.Bone; skeleton: THREE.Skeleton; mesh: THREE.SkinnedMesh; length1: number; length2: number };

const chains = {
  left_arm: [4, 6, 8], right_arm: [5, 7, 9], left_leg: [2, 10, 12], right_leg: [3, 11, 13],
} as const;

export function supportedChain(rig: DisplayRig, key: keyof typeof chains) {
  const [a, b, c] = chains[key];
  const joints = rig.joints;
  return [a, b, c].every((i) => joints[i]?.rest_position_m?.every(Number.isFinite) && Number.isFinite(joints[i]?.length_m) && joints[i]!.length_m! > 0);
}

export function createLimbChain(length1: number, length2: number, radius: number, material: THREE.Material, radialSegments = 12, rings = 20): LimbChain {
  const total = length1 + length2;
  const positions: number[] = [], indices: number[] = [], skinIndices: number[] = [], skinWeights: number[] = [];
  for (let j = 0; j <= rings; j++) {
    const y = -total * j / rings;
    const t = j / rings;
    const r = radius * (0.82 + 0.18 * Math.sin(Math.PI * t));
    for (let i = 0; i < radialSegments; i++) {
      const theta = i * Math.PI * 2 / radialSegments;
      positions.push(Math.cos(theta) * r, y, Math.sin(theta) * r);
      // Blend over a finite region around the elbow, with normalized linear weights.
      const band = length1 * 0.14;
      const distal = THREE.MathUtils.clamp(0.5 - (y + length1) / (2 * band), 0, 1);
      const w0 = 1 - distal, w1 = distal;
      skinIndices.push(0, 1, 0, 0); skinWeights.push(w0, w1, 0, 0);
    }
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < radialSegments; i++) {
    const a = j * radialSegments + i, b = j * radialSegments + (i + 1) % radialSegments;
    const c = (j + 1) * radialSegments + (i + 1) % radialSegments, d = (j + 1) * radialSegments + i;
    indices.push(a, b, d, b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeights, 4));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const root = new THREE.Bone(); root.name = "segment-root";
  const elbow = new THREE.Bone(); elbow.name = "elbow-knee"; elbow.position.y = -length1; root.add(elbow);
  const end = new THREE.Bone(); end.name = "segment-end"; end.position.y = -length2; elbow.add(end);
  const skeleton = new THREE.Skeleton([root, elbow]);
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.add(root); mesh.bind(skeleton);
  return { root, elbow, end, skeleton, mesh, length1, length2 };
}

export function updateLimbChain(chain: LimbChain, start: THREE.Vector3, joint: THREE.Vector3, end: THREE.Vector3) {
  const down = new THREE.Vector3(0, -1, 0);
  const q1 = new THREE.Quaternion().setFromUnitVectors(down, joint.clone().sub(start).normalize());
  const q2 = new THREE.Quaternion().setFromUnitVectors(down, end.clone().sub(joint).normalize());
  chain.root.position.copy(start); chain.root.quaternion.copy(q1);
  chain.elbow.quaternion.copy(q1.clone().invert().multiply(q2));
  chain.mesh.updateWorldMatrix(true, true);
  chain.skeleton.update();
}

export function disposeLimbChain(chain: LimbChain) {
  chain.mesh.geometry.dispose();
  chain.skeleton.boneTexture?.dispose();
  chain.skeleton.boneTexture = null;
}
