const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const source = fs.readFileSync("features/studio/display-motion.ts", "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
vm.runInNewContext(`(function(require,module,exports){${js}\n})`, {})(require, mod, mod.exports);
const { prepareDisplayMotion, sampleDisplayMotion } = mod.exports;
function frame(t, shift=0) {
  const points = Array.from({length:33},()=>null);
  const xy = {23:[0,0,0],24:[.2,0,0],11:[0,1,0],12:[.2,1,0],13:[-.2,1,0],14:[.4,1,0],15:[-.4,1,0],16:[.6,1,0],25:[0,-.5,0],26:[.2,-.5,0],27:[0,-1,0],28:[.2,-1,0],31:[0,-1.1,0],32:[.2,-1.1,0],0:[.1,1.3,0]};
  for(const [i,p] of Object.entries(xy)) points[i]=[p[0]+shift,p[1],p[2],1];
  return {time_ms:t,quality:"usable",points,elbow_flexion:null,knee_flexion:null};
}
const frames=[frame(0),frame(50,0.01),frame(100,2),frame(150,.03),frame(200,.04)];
const before=JSON.stringify(frames);
const prepared=prepareDisplayMotion(frames);
assert.equal(JSON.stringify(frames),before,"raw frames are not mutated");
assert.ok(prepared[2].positions[0][0] < 1,"isolated pelvis spike is rejected");
assert.ok(prepared[0].positions[16][1] < 0,"raw camera Y is flipped into Y-up coordinates");
const mid=sampleDisplayMotion(prepared,25);
assert.ok(Math.abs(Math.hypot(...mid[2].map((v,k)=>v-mid[0][k])) - Math.hypot(...prepared[0].positions[2].map((v,k)=>v-prepared[0].positions[0][k]))) < 1e-6);
const missing=frame(250); missing.points[15]=null;
const withMissing=prepareDisplayMotion([frame(0),frame(100),missing]);
assert.equal(sampleDisplayMotion(withMissing,225)[8],null,"missing wrist stays missing");
assert.equal(sampleDisplayMotion(prepareDisplayMotion([frame(0),frame(300)]),150)[0],null,"large gaps are not bridged");
const rig = { joints: Array.from({length:17},(_,i)=>({length_m:i===1?1:null})), frames: [
  {time_s:0,quality:"usable",positions_m:Array(17).fill(null)},
  {time_s:.1,quality:"usable",positions_m:Array(17).fill(null)},
] };
rig.frames[0].positions_m[0]=[0,0,0]; rig.frames[0].positions_m[1]=[0,1,0];
rig.frames[1].positions_m[0]=[0,0,0]; rig.frames[1].positions_m[1]=[1,0,0];
const rigPrepared=prepareDisplayMotion([],rig);
assert.equal(JSON.stringify(rigPrepared[0].positions[1]),JSON.stringify([0,1,0]),"saved rig positions work without raw source landmarks");
const angleMid=sampleDisplayMotion(rigPrepared,50);
assert.ok(angleMid[1][0]>0 && angleMid[1][1]>0 && Math.abs(Math.hypot(...angleMid[1])-1)<1e-6,"interpolation uses blended child direction");
const fast = [frame(0),frame(50),frame(100),frame(150)];
fast[2].points[15][0]=1.2; fast[3].points[15][0]=2.2;
const fastPrepared=prepareDisplayMotion(fast);
assert.ok(fastPrepared[2].positions[8][0] > fastPrepared[1].positions[8][0],"coherent fast movement is not treated as an isolated spike");
const gapFrames=[frame(0),frame(50),frame(400,2),frame(450,2.1)];
const gapPrepared=prepareDisplayMotion(gapFrames);
assert.equal(gapPrepared[2].positions[0][0],0,"smoothing resets across long gaps");
console.log("display motion smoothing checks passed");
