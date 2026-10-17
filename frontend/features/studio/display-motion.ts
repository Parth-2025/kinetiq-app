import type { MotionFrame } from "./types";
import type { DisplayRig } from "./skinned-rig";

type Point = number[] | null;
type Prepared = { time_ms: number; positions: Point[] }[];
const topology: [number | null, number[]][] = [
  [null,[23,24]],[0,[11,12]],[0,[23]],[0,[24]],[1,[11]],[1,[12]],
  [4,[13]],[5,[14]],[6,[15]],[7,[16]],[2,[25]],[3,[26]],[10,[27]],
  [11,[28]],[12,[31]],[13,[32]],[1,[0]],
];
const goodQuality = (q?: string) => q === "usable" || q === "partial_body_or_occlusion";
const valid = (p: number[] | null | undefined) => !!p && p.length >= 4 && p.slice(0,3).every(Number.isFinite) && Number.isFinite(p[3]) && p[3] >= .65;
const dist = (a: number[], b: number[]) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
function canonical(f: MotionFrame): Point[] {
  return topology.map(([,src]) => {
    if (!src.every(i => valid(f.points[i]))) return null;
    // Convert retained MediaPipe coordinates into the existing Y-up convention.
    return [0,1,2].map(k => src.reduce((s,i) => s + f.points[i]![k] * (k === 0 ? 1 : -1),0)/src.length);
  });
}
function norm(v:number[]) { const n=Math.hypot(...v); return n > 1e-8 ? v.map(x=>x/n) : null; }
function constrain(raw: Point[], lengths: (number|null)[]): Point[] {
  const out: Point[] = Array(17).fill(null);
  if (!raw[0]) return out;
  out[0]=[0,0,0];
  for(let i=1;i<17;i++) {
    const parent=topology[i][0]!;
    if(!raw[i]||!raw[parent]||lengths[i]===null||!out[parent]) continue;
    const direction=norm(raw[i]!.map((v,k)=>v-raw[parent]![k]));
    if(direction) out[i]=out[parent]!.map((v,k)=>v+direction[k]*lengths[i]!);
  }
  return out;
}
export function prepareDisplayMotion(frames: MotionFrame[], rig?: DisplayRig): Prepared {
  const raw: Point[][] = rig
    ? rig.frames.map(f => goodQuality(f.quality) && Number.isFinite(f.time_s)
      ? f.positions_m.map(p => p && p.length >= 3 && p.slice(0,3).every(Number.isFinite) ? [...p] : null)
      : Array(17).fill(null))
    : frames.map(f=>goodQuality(f.quality)?canonical(f):Array(17).fill(null));
  const timeline = rig ? rig.frames.map(f => f.time_s * 1000) : frames.map(f => f.time_ms);
  const lengths=(rig?.joints?.length===17 ? rig.joints.map(j=>Number.isFinite(j.length_m)&&j.length_m!>0?j.length_m:null) : Array(17).fill(null)) as (number|null)[];
  if(!rig) for(let i=1;i<17;i++) {
    const p=topology[i][0]!, obs:number[]=[];
    raw.forEach((x,k)=>{ if(x[i]&&x[p]&&Number.isFinite(timeline[k])) { const d=dist(x[i]!,x[p]!); if(d>1e-6&&d<5)obs.push(d); }});
    if(obs.length>=3) { obs.sort((a,b)=>a-b); lengths[i]=obs[Math.floor(obs.length/2)]; }
  }
  let positions=raw.map(x=>constrain(x,lengths));
  // Replace isolated excursions only when both close neighbors support a stable location.
  positions=positions.map((row,i)=>row.map((p,j)=>{
    if(!p||i===0||i===positions.length-1) return p;
    const a=positions[i-1][j],b=positions[i+1][j];
    const dt1=timeline[i]-timeline[i-1],dt2=timeline[i+1]-timeline[i];
    if(!a||!b||dt1<=0||dt2<=0||dt1>200||dt2>200||dist(a,b)>Math.max(.18,(lengths[j]||.25)*.8)) return p;
    const mid=a.map((v,k)=>(v+b[k])/2);
    return dist(p,mid)>Math.max(.18, (lengths[j]||.25)*.8) ? mid : p;
  }));
  const smoothed=positions.map(x=>x.map(p=>p&&[...p]));
  for(let i=1;i<positions.length;i++) {
    const dt=timeline[i]-timeline[i-1];
    if(!Number.isFinite(dt)||dt<=0||dt>200) continue;
    for(let j=0;j<17;j++) if(positions[i][j]&&smoothed[i-1][j]) {
      // Settle small tremor more strongly while keeping fast athletic motion responsive.
      const speed=positions[i-1][j] ? dist(positions[i][j]!,positions[i-1][j]!) / (dt / 1000) : 0;
      const responseMs=90 / (1 + Math.min(speed, 6) * .5);
      const alpha=Math.max(.2,Math.min(.85,1-Math.exp(-dt/responseMs)));
      smoothed[i][j]=positions[i][j]!.map((v,k)=>smoothed[i-1][j]![k]+alpha*(v-smoothed[i-1][j]![k]));
    }
    smoothed[i]=constrain(smoothed[i],lengths);
  }
  return timeline.map((time_ms,i)=>({time_ms,positions:smoothed[i]}));
}
export function sampleDisplayMotion(prepared: Prepared, timeMs: number): Point[] {
  const exact=prepared.find(f=>f.time_ms===timeMs); if(exact) return exact.positions.map(p=>p&&[...p]);
  let lo=-1; for(let i=0;i<prepared.length;i++) if(Number.isFinite(prepared[i].time_ms)&&prepared[i].time_ms<timeMs)lo=i;
  const hi=lo+1; if(lo<0||hi>=prepared.length) return Array(17).fill(null);
  const a=prepared[lo],b=prepared[hi],dt=b.time_ms-a.time_ms;
  if(dt<=0||dt>200) return Array(17).fill(null);
  const t=(timeMs-a.time_ms)/dt, interpolated=a.positions.map((p,j)=>p&&b.positions[j]?p.map((v,k)=>v+(b.positions[j]![k]-v)*t):null);
  const raw: Point[] = Array(17).fill(null);
  if(interpolated[0]) raw[0]=[...interpolated[0]];
  // Interpolation preserves each supported segment length by projecting toward the endpoint direction.
  for(let i=1;i<17;i++) {
    const parent=topology[i][0]!; if(!raw[parent]||!interpolated[i]||!interpolated[parent]||!a.positions[i]||!a.positions[parent]||!b.positions[i]||!b.positions[parent]) continue;
    const length=(dist(a.positions[i]!,a.positions[parent]!)+dist(b.positions[i]!,b.positions[parent]!))/2;
    const d=norm(interpolated[i]!.map((v,k)=>v-interpolated[parent]![k])); if(d) raw[i]=raw[parent]!.map((v,k)=>v+d[k]*length);
  }
  return raw;
}
