import * as THREE from "three";

const up = new THREE.Vector3(0, 1, 0);
type Part = THREE.Mesh;

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, group: THREE.Group): Part {
  const result = new THREE.Mesh(geometry, material);
  result.visible = false;
  group.add(result);
  return result;
}

// Every profile is closed, with its two endpoints exactly at y = -0.5 and 0.5.
// Radial and longitudinal scales are independent, so measured bone lengths survive posing.
function profile(points: [number, number][]): THREE.LatheGeometry {
  return new THREE.LatheGeometry(points.map(([radius, y]) => new THREE.Vector2(radius, y)), 24);
}

function limbGeometry(distal: number): THREE.LatheGeometry {
  return profile([
    [0, -0.5], [0.48, -0.49], [0.83, -0.455], [1, -0.36],
    [0.99, -0.23], [0.88, -0.04], [distal * 1.12, 0.28],
    [distal, 0.43], [distal * 0.75, 0.48], [0, 0.5],
  ]);
}

function setSegment(part: Part, a: THREE.Vector3 | null, b: THREE.Vector3 | null, radius: number, depth = radius) {
  if (!a || !b) { part.visible = false; return; }
  const delta = b.clone().sub(a);
  const length = delta.length();
  if (!(length > 1e-5) || !Number.isFinite(length)) { part.visible = false; return; }
  part.visible = true;
  part.position.copy(a).add(b).multiplyScalar(0.5);
  part.quaternion.setFromUnitVectors(up, delta.multiplyScalar(1 / length));
  part.scale.set(radius, length, depth);
}

function valid(point: number[] | null | undefined): point is number[] {
  return !!point && point.length >= 3 && point.slice(0, 3).every(Number.isFinite);
}

function vec(point: number[] | null | undefined, origin: THREE.Vector3): THREE.Vector3 | null {
  return valid(point) ? new THREE.Vector3(point[0] - origin.x, point[1] - origin.y, point[2] - origin.z) : null;
}

// Keep a stable palm/sole roll using the anatomical body plane when it is available.
function orientAlong(part: Part, direction: THREE.Vector3, bodyBasis: THREE.Quaternion | null) {
  const y = direction.clone().normalize();
  const normal = new THREE.Vector3(0, 0, 1);
  if (bodyBasis) normal.applyQuaternion(bodyBasis);
  const x = y.clone().cross(normal);
  if (x.lengthSq() < 1e-8) {
    part.quaternion.setFromUnitVectors(up, y);
    return;
  }
  x.normalize();
  const z = x.clone().cross(y).normalize();
  part.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

export function createMannequinFigure(): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0xd4bda0, roughness: 0.88, metalness: 0 });
  const joints = new THREE.MeshStandardMaterial({ color: 0xb9a182, roughness: 0.92, metalness: 0 });
  const torso = mesh(profile([
    [0, -0.5], [0.68, -0.5], [0.77, -0.45], [0.86, -0.23],
    [0.98, 0.1], [1, 0.29], [0.95, 0.38], [0.65, 0.47], [0, 0.5],
  ]), body, group);
  const waist = mesh(profile([
    [0, -0.5], [0.88, -0.5], [1, -0.42], [1, 0.4], [0.9, 0.5], [0, 0.5],
  ]), body, group);
  const pelvis = mesh(profile([
    [0, -0.5], [0.4, -0.45], [0.86, -0.2], [1, 0.13],
    [0.95, 0.36], [0.82, 0.5], [0, 0.5],
  ]), body, group);
  const neck = mesh(limbGeometry(0.95), body, group);
  const head = mesh(new THREE.SphereGeometry(1, 24, 20), body, group);
  const limbs = Array.from({ length: 8 }, (_, i) => mesh(limbGeometry(i % 2 ? 0.64 : 0.7), body, group));
  const hands = [0, 1].map(() => mesh(new THREE.SphereGeometry(1, 16, 12), body, group));
  const thumbs = [0, 1].map(() => mesh(new THREE.SphereGeometry(1, 12, 10), body, group));
  const feet = [0, 1].map(() => mesh(new THREE.SphereGeometry(1, 20, 14), body, group));
  const jointMeshes = Array.from({ length: 12 }, () => mesh(new THREE.SphereGeometry(1, 16, 12), joints, group));
  group.userData.mannequin = { torso, waist, pelvis, neck, head, limbs, hands, thumbs, feet, jointMeshes };
  return group;
}

export function updateMannequinFigure(group: THREE.Group, positions: (number[] | null)[]): void {
  const parts = group.userData.mannequin;
  if (!parts) return;
  const root = valid(positions[0]) ? new THREE.Vector3(...positions[0].slice(0, 3)) : new THREE.Vector3();
  const p = (i: number) => vec(positions[i], root);
  const hl = p(2), hr = p(3), sl = p(4), sr = p(5);
  const hip = hl && hr ? hl.clone().add(hr).multiplyScalar(0.5) : null;
  const shoulder = sl && sr ? sl.clone().add(sr).multiplyScalar(0.5) : null;
  const axis = hip && shoulder ? shoulder.clone().sub(hip) : null;
  const torsoLength = axis?.length() ?? 0;
  const across = sl && sr ? sr.clone().sub(sl) : hl && hr ? hr.clone().sub(hl) : null;
  let basis: THREE.Quaternion | null = null;
  if (axis && across && torsoLength > 1e-5 && across.lengthSq() > 1e-8) {
    const y = axis.clone().divideScalar(torsoLength);
    const x = across.clone().addScaledVector(y, -across.dot(y));
    if (x.lengthSq() > 1e-8) {
      x.normalize();
      const z = x.clone().cross(y).normalize();
      basis = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    }
  }
  const torsoVisible = !!(basis && hip && shoulder);
  parts.torso.visible = torsoVisible;
  parts.waist.visible = torsoVisible;
  parts.pelvis.visible = torsoVisible;
  if (torsoVisible) {
    const shoulderWidth = sl!.distanceTo(sr!);
    const hipWidth = hl!.distanceTo(hr!);
    const place = (part: Part, center: number, width: number, height: number, depth: number) => {
      part.position.copy(hip!).addScaledVector(axis!, center);
      part.quaternion.copy(basis!);
      part.scale.set(width, torsoLength * height, depth);
    };
    // The lathed chest is flattened front-to-back; the waist and pelvis articulate separately.
    place(parts.torso, 0.72, shoulderWidth * 0.48, 0.64, shoulderWidth * 0.26);
    place(parts.waist, 0.29, shoulderWidth * 0.32, 0.34, shoulderWidth * 0.235);
    place(parts.pelvis, 0.04, hipWidth * 0.66, 0.34, hipWidth * 0.43);
  }
  const headPos = p(16);
  parts.head.visible = !!headPos;
  if (headPos) {
    parts.head.position.copy(headPos);
    parts.head.quaternion.copy(basis ?? new THREE.Quaternion());
    parts.head.scale.set(0.105, 0.145, 0.1);
  }
  const headDirection = shoulder && headPos ? headPos.clone().sub(shoulder) : null;
  const headDistance = headDirection?.length() ?? 0;
  const neckEnd = headDirection && headDistance > 1e-5
    ? headPos!.clone().addScaledVector(headDirection, -Math.min(0.13, headDistance * 0.55) / headDistance)
    : null;
  setSegment(parts.neck, shoulder, neckEnd, 0.052);

  const pairs: [number, number][] = [[4, 6], [6, 8], [5, 7], [7, 9], [2, 10], [10, 12], [3, 11], [11, 13]];
  const radii = [0.057, 0.047, 0.057, 0.047, 0.08, 0.063, 0.08, 0.063];
  pairs.forEach(([a, b], i) => setSegment(parts.limbs[i], p(a), p(b), radii[i]));
  for (let side = 0; side < 2; side++) {
    const wrist = p(side ? 9 : 8), elbow = p(side ? 7 : 6);
    const ankle = p(side ? 13 : 12), toe = p(side ? 15 : 14);
    const hand = parts.hands[side] as Part, thumb = parts.thumbs[side] as Part;
    const forearm = wrist && elbow ? wrist.clone().sub(elbow) : null;
    hand.visible = thumb.visible = !!(forearm && forearm.lengthSq() > 1e-8);
    if (hand.visible) {
      const direction = forearm!.normalize();
      orientAlong(hand, direction, basis);
      hand.position.copy(wrist!).addScaledVector(direction, 0.068);
      hand.scale.set(0.041, 0.078, 0.024);
      const thumbOffset = new THREE.Vector3(side ? -0.035 : 0.035, -0.019, 0.007).applyQuaternion(hand.quaternion);
      thumb.position.copy(hand.position).add(thumbOffset);
      thumb.quaternion.copy(hand.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), side ? -0.4 : 0.4));
      thumb.scale.set(0.018, 0.044, 0.019);
    }
    const foot = parts.feet[side] as Part;
    const footDirection = ankle && toe ? toe.clone().sub(ankle) : null;
    foot.visible = !!(footDirection && footDirection.lengthSq() > 1e-8);
    if (foot.visible) {
      const length = footDirection!.length();
      orientAlong(foot, footDirection!, basis);
      foot.position.copy(ankle!).add(toe!).multiplyScalar(0.5);
      foot.scale.set(0.052, length * 0.5 + 0.025, 0.04);
    }
  }
  const jointIds = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  jointIds.forEach((id, i) => {
    const point = p(id), joint = parts.jointMeshes[i] as Part;
    joint.visible = !!point;
    if (point) {
      joint.position.copy(point);
      joint.scale.setScalar(id < 4 ? 0.065 : id < 6 ? 0.05 : id < 10 ? 0.033 : id < 12 ? 0.048 : 0.035);
    }
  });
}
