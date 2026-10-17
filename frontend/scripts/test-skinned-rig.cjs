const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const THREE = require("three");

const source = fs.readFileSync("features/studio/skinned-rig.ts", "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const rigModule = { exports: {} };
vm.runInNewContext(`(function(require,module,exports){${js}\n})`, { THREE })(require, rigModule, rigModule.exports);
const { createLimbChain, supportedChain, updateLimbChain, disposeLimbChain } = rigModule.exports;

const rig = { joints: Array.from({ length: 17 }, (_, i) => ({ name: `j${i}`, parent: null, rest_position_m: [0, 0, 0], length_m: 1 })) };
assert.equal(supportedChain(rig, "left_arm"), true);
rig.joints[8].length_m = null;
assert.equal(supportedChain(rig, "left_arm"), false);
assert.equal(supportedChain(rig, "right_leg"), true);

const chain = createLimbChain(1, 2, 0.1, new THREE.MeshStandardMaterial());
const g = chain.mesh.geometry, pos = g.getAttribute("position"), weights = g.getAttribute("skinWeight");
for (let i = 0; i < pos.count; i++) {
  assert.ok(Number.isFinite(pos.getX(i)) && Number.isFinite(pos.getY(i)) && Number.isFinite(pos.getZ(i)));
  const sum = weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i);
  assert.ok(Math.abs(sum - 1) < 1e-6, `skin weights sum to ${sum}`);
}
const ys = Array.from({ length: pos.count }, (_, i) => pos.getY(i));
const normals = g.getAttribute("normal");
for (let i = 0; i < pos.count; i++) {
  assert.ok(pos.getX(i) * normals.getX(i) + pos.getZ(i) * normals.getZ(i) > 0,
    "limb surface normals must face outward");
}
assert.ok(Math.abs(Math.max(...ys)) < 1e-6);
assert.ok(Math.abs(Math.min(...ys) + 3) < 1e-6);
assert.ok(weights.getX(0) > weights.getY(0), "proximal vertices belong to shoulder/hip bone");
const belowElbow = 15 * 12;
assert.ok(weights.getY(belowElbow) > 0.45, "elbow blend includes distal bone");
chain.mesh.updateMatrixWorld(true); chain.skeleton.update();
const idx = 18 * 12;
const before = new THREE.Vector3(pos.getX(idx), pos.getY(idx), pos.getZ(idx));
chain.mesh.applyBoneTransform(idx, before);
chain.elbow.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
chain.mesh.updateMatrixWorld(true); chain.skeleton.update();
const after = new THREE.Vector3(pos.getX(idx), pos.getY(idx), pos.getZ(idx));
chain.mesh.applyBoneTransform(idx, after);
assert.ok(before.distanceTo(after) > 0.2, "elbow bend deforms the skinned surface");
const start = new THREE.Vector3(1, 1, 0), middle = new THREE.Vector3(2, 1, 0), end = new THREE.Vector3(2, 3, 0);
updateLimbChain(chain, start, middle, end);
assert.ok(chain.root.getWorldPosition(new THREE.Vector3()).distanceTo(start) < 1e-6);
assert.ok(chain.elbow.getWorldPosition(new THREE.Vector3()).distanceTo(middle) < 1e-6);
assert.ok(chain.end.getWorldPosition(new THREE.Vector3()).distanceTo(end) < 1e-6);
let geometryDisposed = false, textureDisposed = false;
g.addEventListener("dispose", () => { geometryDisposed = true; });
chain.skeleton.computeBoneTexture();
chain.skeleton.boneTexture.addEventListener("dispose", () => { textureDisposed = true; });
disposeLimbChain(chain);
assert.ok(geometryDisposed && textureDisposed, "geometry and skeleton GPU texture are released");
chain.mesh.material.dispose();
console.log("skinned rig geometry checks passed");
