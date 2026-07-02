'use strict';
/* ===================================================================
   RTApps Planning Suite (TPS) — standalone 2D teaching planner.
   Forward & inverse planning over a scrollable CT stack.
   Educational simulation only — simplified single-slice dose model.
   =================================================================== */

/* ----------------------------- DATASETS -----------------------------
   Add a series with ONE entry: pattern uses {i} for the zero-padded index.
   kind:'remote' (URL) | 'local' (relative folder, ship images alongside)
   seed: optional starting structures on the iso slice (image-fraction coords) */
const DATASETS = [
  { id:'brain', name:'Brain — Metastasis (remote)', kind:'remote', count:61, pad:3, iso:30,
    pattern:'https://rtapps79.github.io/rtt_e_workbook/Treatment_Planning/Brain_TPS/brain_mets/brain_mets_{i}.png',
    seed:{ target:{cx:0.50,cy:0.42,r:0.06,name:'PTV (met)'},
           oars:[{cx:0.50,cy:0.55,r:0.05,name:'Brainstem'},{cx:0.38,cy:0.40,r:0.05,name:'L Optic'} ] } },
  { id:'breast', name:'Breast — L chest wall (local)', kind:'local', count:36, pad:3, iso:15,
    pattern:'datasets/breast/breast_{i}.png',
    seed:{ target:{cx:0.32,cy:0.42,r:0.10,name:'PTV breast'},
           oars:[{cx:0.5,cy:0.5,r:0.12,name:'Heart'},{cx:0.40,cy:0.45,r:0.13,name:'L Lung'}] } },
  { id:'larynx', name:'Head & Neck — Larynx (local)', kind:'local', count:58, pad:3, iso:28,
    pattern:'datasets/larynx/larynx_{i}.png',
    seed:{ target:{cx:0.50,cy:0.52,r:0.08,name:'PTV larynx'},
           oars:[{cx:0.40,cy:0.40,r:0.04,name:'L Parotid'},{cx:0.60,cy:0.40,r:0.04,name:'R Parotid'},{cx:0.50,cy:0.66,r:0.05,name:'Cord'}] } },
  { id:'demo', name:'Demo slice (offline)', kind:'embedded', count:1, pad:3, iso:0,
    seed:{ target:{cx:0.34,cy:0.40,r:0.09,name:'PTV'}, oars:[{cx:0.5,cy:0.5,r:0.12,name:'Heart'},{cx:0.5,cy:0.46,r:0.16,name:'Lungs'}] } }
];
const STRUCT_COLORS = ['#fb7185','#ffb86b','#34d399','#6fb6ff','#b58bff','#04d9ff','#f472b6'];
const GRID = 100;                       // dose / mask resolution
const ISODOSE = [30,50,70,85,95,107];   // % levels
const ISO_COLORS = { 30:'#3b6bd6', 50:'#22a6c0', 70:'#34d399', 85:'#ffd35a', 95:'#ff8a3d', 107:'#ff4d6d' };

/* ----------------------------- STATE ----------------------------- */
const S = {
  ds:null, slices:[], cur:0, IMG:{w:512,h:512}, loaded:false,
  win:{ b:1.0, c:1.1 }, zoom:1.0, pan:{x:0,y:0},
  iso:{x:256,y:230},
  tool:'brush', brush:22,
  structs:[], activeStruct:0,
  beams:[], fieldW:70, rx:60,
  mode:'forward',
  dose:null, doseMax:1, calculated:false,
  poly:[], dragging:false, lastPaint:null,
  PX_PER_CM:512/45, MU_ATTEN:0.045, technique:'sad', ssd:100, SAD:100,
  // inverse
  nBeams:7, objectives:[], beamlets:null, optW:null, optRun:false, angleCache:{},
  mpr:{x:256,y:230}, vol:null, mprOn:false, optK:12
};

let cv, ctx, off, octx, vp, busyEl, dirty=true;
const $ = id => document.getElementById(id);
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
function setStatus(t){ $('status').textContent = t; }
function busy(on,t){ busyEl.classList.toggle('show',on); if(t)$('busyT').textContent=t; }

/* image px <-> grid cell */
function imgToGrid(ix,iy){ return [clamp(Math.floor(ix/S.IMG.w*GRID),0,GRID-1), clamp(Math.floor(iy/S.IMG.h*GRID),0,GRID-1)]; }
function gridToImg(gx,gy){ return [(gx+0.5)/GRID*S.IMG.w,(gy+0.5)/GRID*S.IMG.h]; }

/* ----------------------------- VIEW TRANSFORM ----------------------------- */
function placement(){
  const vw=cv.width, vh=cv.height;
  const fit=Math.min(vw/S.IMG.w, vh/S.IMG.h);
  const sc=fit*S.zoom;
  const ox=vw/2 - S.IMG.w*sc/2 + S.pan.x;
  const oy=vh/2 - S.IMG.h*sc/2 + S.pan.y;
  return {sc,ox,oy};
}
function screenToImg(mx,my){ const p=placement(); return [(mx-p.ox)/p.sc,(my-p.oy)/p.sc]; }

/* ----------------------------- DATASET LOADING ----------------------------- */
function buildDatasetSelect(){
  const sel=$('datasetSel'); sel.innerHTML='';
  DATASETS.forEach(d=>{ const o=document.createElement('option'); o.value=d.id; o.textContent=d.name; sel.appendChild(o); });
  sel.onchange=()=>loadDataset(DATASETS.find(d=>d.id===sel.value));
}
function idxStr(i,pad){ return String(i).padStart(pad,'0'); }

function loadDataset(ds){
  S.ds=ds; S.slices=[]; S.loaded=false; S.calculated=false; S.dose=null; S.angleCache={};
  S.structs=[]; S.beams=[]; S.poly=[];
  busy(true,'Loading CT series…');
  setStatus('Loading '+ds.name+' …');

  if(ds.kind==='embedded'){
    phantom();
    return;
  }
  // load stack with graceful per-image fallback
  const n=ds.count; let done=0, anyOk=false;
  const arr=new Array(n).fill(null);
  for(let i=0;i<n;i++){
    const url=ds.pattern.replace('{i}', idxStr(i,ds.pad)).replace('{iso}','');
    const img=new Image(); img.crossOrigin='anonymous';
    img.onload=()=>{ arr[i]=img; anyOk=true; if(++done>=n) afterStack(arr,anyOk); };
    img.onerror=()=>{ arr[i]=null; if(++done>=n) afterStack(arr,anyOk); };
    img.src=url;
  }
}
function afterStack(arr,anyOk){
  if(!anyOk){ setStatus('Could not load '+S.ds.name+' (offline or path missing) — using demo slice.'); synthFallback(); return; }
  S.slices=arr.map(a=>a||null);
  finishLoad();
}
function synthFallback(){
  // Procedural phantom slice — no network or embedded asset required.
  S.ds={...S.ds,count:1,iso:0,kind:'embedded'};
  phantom();
}
function phantom(){
  const c=document.createElement('canvas'); c.width=c.height=512; const g=c.getContext('2d');
  g.fillStyle='#000'; g.fillRect(0,0,512,512);
  const grd=g.createRadialGradient(256,236,40,256,236,210); grd.addColorStop(0,'#9aa3ad'); grd.addColorStop(1,'#3a4048');
  g.fillStyle=grd; g.beginPath(); g.ellipse(256,236,205,170,0,0,7); g.fill();
  g.fillStyle='#cfd6dd'; g.beginPath(); g.ellipse(256,300,22,22,0,0,7); g.fill();
  const img=new Image(); img.onload=()=>{ S.slices=[img]; finishLoad(); }; img.src=c.toDataURL();
}
function finishLoad(){
  const first=S.slices.find(s=>s)||S.slices[0];
  S.IMG={ w:first.naturalWidth||first.width||512, h:first.naturalHeight||first.height||512 };
  S.PX_PER_CM=S.IMG.w/45;
  S.cur=Math.min(S.ds.iso||Math.floor(S.slices.length/2), S.slices.length-1);
  S.iso={ x:S.IMG.w*0.5, y:S.IMG.h*0.46 };
  S.zoom=1.0; S.pan={x:0,y:0};
  $('sliceSlider').max=Math.max(0,S.slices.length-1); $('sliceSlider').value=S.cur;
  seedStructures();
  defaultBeams();
  S.loaded=true; busy(false); dirty=true;
  updateSliceInfo(); renderStructList(); renderBeamList(); buildObjectives(); refreshDVH(); refreshMetrics();
  setStatus(S.ds.name+' loaded · '+S.slices.filter(Boolean).length+'/'+S.slices.length+' slices · contour the target, then plan.');
  S.mpr={x:S.iso.x,y:S.iso.y}; S.vol=null; if(S.mprOn){ buildVolume(); renderMPR(); }
}
function updateSliceInfo(){
  const isoTag = (S.cur===(S.ds.iso))?' · ISO':'';
  $('sliceInfo').textContent = 'slice '+(S.cur+1)+'/'+S.slices.length+isoTag;
  $('vptag').innerHTML = `<b>${S.ds?S.ds.name.split(' (')[0]:''}</b> · WL ${Math.round(S.win.b*100)}/${Math.round(S.win.c*100)} · ISO (${S.iso.x|0},${S.iso.y|0})`;
}

/* ----------------------------- SEED STRUCTURES ----------------------------- */
function newStruct(name,type,color){ return { name, type, color, masks:{} }; }
function structMask(st,slice,make){
  if(!st.masks[slice] && make) st.masks[slice]=new Uint8Array(GRID*GRID);
  return st.masks[slice];
}
function seedStructures(){
  S.structs=[]; const seed=S.ds.seed; const isoS=S.cur;
  if(seed&&seed.target){
    const t=newStruct(seed.target.name,'target','#fb7185');
    paintCircleMask(t,isoS, seed.target.cx, seed.target.cy, seed.target.r);
    S.structs.push(t);
    (seed.oars||[]).forEach((o,i)=>{ const st=newStruct(o.name,'oar',STRUCT_COLORS[(i+1)%STRUCT_COLORS.length]); paintCircleMask(st,isoS,o.cx,o.cy,o.r); S.structs.push(st); });
  } else { S.structs.push(newStruct('PTV','target','#fb7185')); }
  S.activeStruct=0;
}
function paintCircleMask(st,slice,fcx,fcy,fr){
  const m=structMask(st,slice,true);
  const cgx=fcx*GRID, cgy=fcy*GRID, rg=fr*GRID;
  for(let gy=0;gy<GRID;gy++)for(let gx=0;gx<GRID;gx++){
    const dx=gx+0.5-cgx, dy=gy+0.5-cgy; if(dx*dx+dy*dy<=rg*rg) m[gy*GRID+gx]=1;
  }
}

/* ----------------------------- BODY MASK ----------------------------- */
let bodyMask=null, bodyDensity=null, bodyDensityHasPixels=false, bodyMaskSlice=-1;
/* 8-bit luminance -> relative electron density (simplified teaching proxy) */
function lumToDensity(l){
  if(l<=20) return 0.0;                              // air
  if(l<70)  return 0.30;                             // lung-equivalent low density
  if(l<170) return 1.0;                              // soft tissue
  return Math.min(1.85, 1.0 + (l-170)/85*0.85);      // bone, capped
}
function computeBodyMask(){
  if(bodyMaskSlice===S.cur && bodyMask) return bodyMask;
  const m=new Uint8Array(GRID*GRID), dens=new Float32Array(GRID*GRID);
  const img=S.slices[S.cur];
  let usedPixels=false;
  if(img){
    try{
      const c=document.createElement('canvas'); c.width=GRID; c.height=GRID;
      const g=c.getContext('2d',{willReadFrequently:true});
      g.drawImage(img,0,0,GRID,GRID);
      const d=g.getImageData(0,0,GRID,GRID).data;
      for(let i=0;i<GRID*GRID;i++){ const l=(d[i*4]+d[i*4+1]+d[i*4+2])/3; m[i]=l>20?1:0; dens[i]=m[i]?lumToDensity(l):0; }
      usedPixels=true;
    }catch(e){ usedPixels=false; }
  }
  if(!usedPixels){ // elliptical body fallback (uniform soft tissue)
    const cx=GRID*0.5, cy=GRID*0.46, rx=GRID*0.44, ry=GRID*0.38;
    for(let gy=0;gy<GRID;gy++)for(let gx=0;gx<GRID;gx++){ const dx=(gx-cx)/rx, dy=(gy-cy)/ry; const ib=(dx*dx+dy*dy<=1)?1:0; m[gy*GRID+gx]=ib; dens[gy*GRID+gx]=ib?1.0:0; }
  }
  bodyMask=m; bodyDensity=dens; bodyDensityHasPixels=usedPixels; bodyMaskSlice=S.cur; return m;
}
function inBodyGrid(gx,gy){ const m=computeBodyMask(); if(gx<0||gy<0||gx>=GRID||gy>=GRID)return 0; return m[gy*GRID+gx]; }

/* ----------------------------- RENDER ----------------------------- */
function resize(){ cv.width=vp.clientWidth; cv.height=vp.clientHeight; dirty=true; }
function draw(){
  requestAnimationFrame(draw);
  if(!dirty) return; dirty=false;
  ctx.clearRect(0,0,cv.width,cv.height);
  if(!S.loaded) return;
  const p=placement();
  // CT slice
  const img=S.slices[S.cur];
  ctx.save();
  ctx.filter=`brightness(${S.win.b}) contrast(${S.win.c})`;
  if(img) ctx.drawImage(img,p.ox,p.oy,S.IMG.w*p.sc,S.IMG.h*p.sc);
  else { ctx.fillStyle='#0a0f15'; ctx.fillRect(p.ox,p.oy,S.IMG.w*p.sc,S.IMG.h*p.sc); }
  ctx.restore();
  // dose wash + isodose lines
  if(S.calculated && S.dose) drawDose(p);
  // structures
  drawStructures(p);
  // beams (forward) / angle fan (inverse)
  drawBeams(p);
  // isocenter
  drawIso(p);
  // MPR plane crosshair on axial
  if(S.mprOn && S.mpr){ const x=p.ox+S.mpr.x*p.sc, y=p.oy+S.mpr.y*p.sc; ctx.save(); ctx.strokeStyle='rgba(4,217,255,0.45)'; ctx.setLineDash([4,4]); ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(p.ox,y); ctx.lineTo(p.ox+S.IMG.w*p.sc,y); ctx.moveTo(x,p.oy); ctx.lineTo(x,p.oy+S.IMG.h*p.sc); ctx.stroke(); ctx.restore(); }
  // polygon in progress
  drawPoly(p);
}
function drawDose(p){
  // wash via offscreen grid
  off.width=GRID; off.height=GRID;
  const im=octx.createImageData(GRID,GRID); const d=im.data;
  for(let i=0;i<GRID*GRID;i++){
    const v=S.dose[i]; let r=0,g=0,b=0,a=0;
    if(v>=20){ const col=doseColor(v); r=col[0]; g=col[1]; b=col[2]; a=110; }
    d[i*4]=r; d[i*4+1]=g; d[i*4+2]=b; d[i*4+3]=a;
  }
  octx.putImageData(im,0,0);
  ctx.save(); ctx.imageSmoothingEnabled=true; ctx.globalAlpha=0.85;
  ctx.drawImage(off,p.ox,p.oy,S.IMG.w*p.sc,S.IMG.h*p.sc); ctx.restore();
  // isodose lines
  ctx.save(); ctx.lineWidth=1.4;
  ISODOSE.forEach(lvl=>{ ctx.strokeStyle=ISO_COLORS[lvl]; marchingSquares(S.dose,lvl,(x0,y0,x1,y1)=>{
    const [a,b]=gridToImg(x0,y0), [c,e]=gridToImg(x1,y1);
    ctx.beginPath(); ctx.moveTo(p.ox+a*p.sc,p.oy+b*p.sc); ctx.lineTo(p.ox+c*p.sc,p.oy+e*p.sc); ctx.stroke();
  }); });
  ctx.restore();
}
function doseColor(v){
  if(v>=107) return [255,77,109];
  if(v>=95) return [255,138,61];
  if(v>=85) return [255,211,90];
  if(v>=70) return [52,211,153];
  if(v>=50) return [34,166,192];
  return [59,107,214];
}
function drawStructures(p){
  S.structs.forEach((st,idx)=>{
    const m=st.masks[S.cur]; if(!m) return;
    ctx.save();
    // translucent fill
    ctx.fillStyle=st.color+'2e';
    for(let gy=0;gy<GRID;gy++)for(let gx=0;gx<GRID;gx++){ if(m[gy*GRID+gx]){ const [ix,iy]=gridToImg(gx,gy);
      ctx.fillRect(p.ox+(ix-S.IMG.w/GRID/2)*p.sc, p.oy+(iy-S.IMG.h/GRID/2)*p.sc, (S.IMG.w/GRID)*p.sc+0.6,(S.IMG.h/GRID)*p.sc+0.6); } }
    // outline (edges where neighbor empty)
    ctx.strokeStyle=st.color; ctx.lineWidth=idx===S.activeStruct?2.2:1.2;
    for(let gy=0;gy<GRID;gy++)for(let gx=0;gx<GRID;gx++){ if(!m[gy*GRID+gx])continue;
      const [ix,iy]=gridToImg(gx,gy); const cw=(S.IMG.w/GRID)*p.sc, ch=(S.IMG.h/GRID)*p.sc;
      const sx=p.ox+(ix-S.IMG.w/GRID/2)*p.sc, sy=p.oy+(iy-S.IMG.h/GRID/2)*p.sc;
      if(!m[gy*GRID+(gx-1)]||gx===0){ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx,sy+ch);ctx.stroke();}
      if(!m[gy*GRID+(gx+1)]||gx===GRID-1){ctx.beginPath();ctx.moveTo(sx+cw,sy);ctx.lineTo(sx+cw,sy+ch);ctx.stroke();}
      if(!m[(gy-1)*GRID+gx]||gy===0){ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx+cw,sy);ctx.stroke();}
      if(!m[(gy+1)*GRID+gx]||gy===GRID-1){ctx.beginPath();ctx.moveTo(sx,sy+ch);ctx.lineTo(sx+cw,sy+ch);ctx.stroke();}
    }
    ctx.restore();
  });
}
function drawBeams(p){
  const isx=p.ox+S.iso.x*p.sc, isy=p.oy+S.iso.y*p.sc;
  const list = S.mode==='forward' ? S.beams.filter(b=>b.on) : angleList().map(a=>({angle:a,on:true,inv:true}));
  list.forEach(b=>{
    const rad=b.angle*Math.PI/180; const out={x:Math.sin(rad),y:-Math.cos(rad)};
    const len=Math.max(cv.width,cv.height);
    ctx.save();
    ctx.strokeStyle = b.inv ? 'rgba(120,200,210,0.35)' : 'rgba(255,184,107,0.8)';
    ctx.lineWidth = b.inv?1:2; ctx.setLineDash(b.inv?[4,5]:[]);
    ctx.beginPath(); ctx.moveTo(isx,isy); ctx.lineTo(isx+out.x*len,isy+out.y*len); ctx.stroke();
    if(!b.inv){ // source marker + field width markers
      ctx.setLineDash([]); ctx.fillStyle='#ffb86b';
      const sx=isx+out.x*S.IMG.w*0.55*p.sc, sy=isy+out.y*S.IMG.h*0.55*p.sc;
      ctx.beginPath(); ctx.arc(sx,sy,4,0,7); ctx.fill();
    }
    ctx.restore();
  });
}
function drawIso(p){
  const x=p.ox+S.iso.x*p.sc, y=p.oy+S.iso.y*p.sc;
  ctx.save(); ctx.strokeStyle='#04d9ff'; ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.moveTo(x-11,y);ctx.lineTo(x+11,y);ctx.moveTo(x,y-11);ctx.lineTo(x,y+11);ctx.stroke();
  ctx.beginPath(); ctx.arc(x,y,5,0,7); ctx.stroke(); ctx.restore();
}
function drawPoly(p){
  if(S.tool!=='poly'||!S.poly.length) return;
  ctx.save(); ctx.strokeStyle=S.structs[S.activeStruct]?.color||'#fff'; ctx.lineWidth=1.6; ctx.fillStyle='#04d9ff';
  ctx.beginPath();
  S.poly.forEach((pt,i)=>{ const x=p.ox+pt[0]*p.sc,y=p.oy+pt[1]*p.sc; i?ctx.lineTo(x,y):ctx.moveTo(x,y); });
  ctx.stroke();
  S.poly.forEach(pt=>{ ctx.beginPath(); ctx.arc(p.ox+pt[0]*p.sc,p.oy+pt[1]*p.sc,3,0,7); ctx.fill(); });
  ctx.restore();
}

/* marching squares producing line segments for a level over a GRID array */
function marchingSquares(field,level,emit){
  for(let gy=0;gy<GRID-1;gy++)for(let gx=0;gx<GRID-1;gx++){
    const v0=field[gy*GRID+gx], v1=field[gy*GRID+gx+1], v2=field[(gy+1)*GRID+gx+1], v3=field[(gy+1)*GRID+gx];
    let cidx=(v0>level?1:0)|(v1>level?2:0)|(v2>level?4:0)|(v3>level?8:0);
    if(cidx===0||cidx===15) continue;
    const ip=(a,b,va,vb)=>{ const t=(level-va)/((vb-va)||1e-6); return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]; };
    const TL=[gx,gy],TR=[gx+1,gy],BR=[gx+1,gy+1],BL=[gx,gy+1];
    const eT=()=>ip(TL,TR,v0,v1), eR=()=>ip(TR,BR,v1,v2), eB=()=>ip(BL,BR,v3,v2), eL=()=>ip(TL,BL,v0,v3);
    const seg=(p,q)=>emit(p[0],p[1],q[0],q[1]);
    switch(cidx){
      case 1: case 14: seg(eL(),eT()); break;
      case 2: case 13: seg(eT(),eR()); break;
      case 3: case 12: seg(eL(),eR()); break;
      case 4: case 11: seg(eR(),eB()); break;
      case 6: case 9:  seg(eT(),eB()); break;
      case 7: case 8:  seg(eL(),eB()); break;
      case 5: seg(eL(),eT()); seg(eR(),eB()); break;
      case 10: seg(eT(),eR()); seg(eL(),eB()); break;
    }
  }
}

/* ----------------------------- DOSE PHYSICS (teaching model) ----------------------------- */
function maxArr(a){ let m=0; for(let i=0;i<a.length;i++) if(a[i]>m)m=a[i]; return m; }
function pdd(dcm){ const dmax=1.5; if(dcm<=0) return 0.55; if(dcm<dmax) return 0.55+0.45*(dcm/dmax); return Math.exp(-S.MU_ATTEN*(dcm-dmax)); }
function pddBolus(dcm){ return Math.exp(-S.MU_ATTEN*Math.max(0,dcm)); } // bolus: skin sparing removed, dmax at surface
/* Technique-aware depth dose.
   base = pdd() interpreted as a TMR-shaped curve (buildup→1.0 at dmax→attenuation), SSD-independent.
   SAD (isocentric): dose ∝ TMR(d) × (SAD/(SAD+t))²  — inverse-square referenced to the isocenter (t = along-axis dist from iso).
   SSD (fixed surface): dose ∝ PDD(d) = TMR(d) × ((SSD+dmax)/(SSD+d))² — extra inverse-square baked in, referenced to d_max. */
function beamDepthFactor(dcm, axlPx, bolus){
  const dmax=1.5, base=bolus?pddBolus(dcm):pdd(dcm);
  if(S.technique==='ssd'){ const SSD=S.ssd||100; return base*Math.pow((SSD+dmax)/(SSD+Math.max(0,dcm)),2); }
  const SAD=S.SAD||100, t=axlPx/S.PX_PER_CM, r=Math.max(5,SAD+t); return base*Math.pow(SAD/r,2);
}
function profile(latPx,centerPx,halfPx){ const l=Math.abs(latPx-centerPx),pen=6; if(l<=halfPx-pen)return 1; if(l>=halfPx+pen)return 0; return (halfPx+pen-l)/(2*pen); }
/* wedge: linear transmission gradient across the field (teaching model) */
function wedgeFactor(L, ac, ah, deg, dir){ if(!deg||ah<=0) return 1; const x=clamp((L-(ac-ah))/(2*ah),0,1); const g=Math.min(0.5, Math.tan(deg*Math.PI/180)*0.32); return Math.max(0, 1 - g*(2*x-1)*(dir<0?-1:1)); }
/* lateral (beam's-eye-view) extent of a mask, used for MLC conformance & blocking */
function latExtentOfMask(A,m){ let mn=1e9,mx=-1e9,c=0; for(let i=0;i<m.length;i++){ if(m[i]){ const l=A.lat[i]; if(l<mn)mn=l; if(l>mx)mx=l; c++; } } return c?{min:mn,max:mx}:null; }
function targetLatExtent(A){ const t=S.structs.find(s=>s.type==='target'); const m=t&&t.masks[S.cur]; return m?latExtentOfMask(A,m):null; }
function oarLatExtent(A,i){ const st=S.structs[i]; const m=st&&st.masks[S.cur]; if(!m)return null; const e=latExtentOfMask(A,m); if(e){ e.min-=2; e.max+=2; } return e; }

function getAngleData(angle){
  const key=Math.round(angle*10)/10;
  if(S.angleCache[key]) return S.angleCache[key];
  const rad=angle*Math.PI/180, out={x:Math.sin(rad),y:-Math.cos(rad)}, u={x:-Math.sin(rad),y:Math.cos(rad)}, pp={x:u.y,y:-u.x};
  const depth=new Float32Array(GRID*GRID), lat=new Float32Array(GRID*GRID), axl=new Float32Array(GRID*GRID), inb=new Uint8Array(GRID*GRID);
  const stepPx=S.IMG.w/GRID, maxs=GRID*2;
  for(let gy=0;gy<GRID;gy++)for(let gx=0;gx<GRID;gx++){
    const idx=gy*GRID+gx, ib=inBodyGrid(gx,gy); inb[idx]=ib;
    const [ix,iy]=gridToImg(gx,gy); const rx=ix-S.iso.x, ry=iy-S.iso.y;
    lat[idx]=rx*pp.x+ry*pp.y;
    axl[idx]=rx*u.x+ry*u.y;          // signed along-axis (px); 0 at iso, + = downstream (away from source)
    if(!ib){ depth[idx]=0; continue; }
    let cx=ix, cy=iy, steps=0, radPx=0; const dx=-u.x*stepPx, dy=-u.y*stepPx;
    while(steps<maxs){ const [ggx,ggy]=imgToGrid(cx,cy); if(!inBodyGrid(ggx,ggy)) break;
      if(S.hetero && bodyDensity){ radPx += (bodyDensity[ggy*GRID+ggx]||1)*stepPx; }
      cx+=dx; cy+=dy; steps++; }
    depth[idx]=(S.hetero?radPx:steps*stepPx)/S.PX_PER_CM;
  }
  const data={depth,lat,axl,inb}; S.angleCache[key]=data; return data;
}
function normalizeToTarget(raw){
  const tgt=S.structs.find(s=>s.type==='target'); let ref=0,cnt=0;
  if(tgt&&tgt.masks[S.cur]){ const m=tgt.masks[S.cur]; for(let i=0;i<m.length;i++) if(m[i]){ref+=raw[i];cnt++;} ref=cnt?ref/cnt:0; }
  if(!cnt){ const [gx,gy]=imgToGrid(S.iso.x,S.iso.y); ref=raw[gy*GRID+gx]; }
  const scale=ref>1e-6?100/ref:0, out=new Float32Array(raw.length);
  for(let i=0;i<raw.length;i++) out[i]=raw[i]*scale; return out;
}
function computeForwardDose(){
  if(!S.loaded) return;
  const beams=S.beams.filter(b=>b.on);
  if(!beams.length){ S.dose=null; S.calculated=false; dirty=true; refreshDVH(); refreshMetrics(); setStatus('Add a beam to calculate dose.'); return; }
  busy(true,'Calculating dose…');
  setTimeout(()=>{
    const raw=new Float32Array(GRID*GRID), halfDefault=S.fieldW/2;
    beams.forEach(b=>{ const A=getAngleData(b.angle), w=b.weight;
      // aperture: conform MLC to target (+margin) or use jaw field width
      let aMin,aMax;
      if(b.conform!==false){ const e=targetLatExtent(A); const mg=(b.margin==null?0.8:b.margin)*S.PX_PER_CM;
        if(e){ aMin=e.min-mg; aMax=e.max+mg; } else { aMin=-halfDefault; aMax=halfDefault; } }
      else { aMin=-halfDefault; aMax=halfDefault; }
      const ac=(aMin+aMax)/2, ah=(aMax-aMin)/2;
      const blocks=(b.shield||[]).map(si=>oarLatExtent(A,si)).filter(Boolean);
      for(let i=0;i<GRID*GRID;i++){ if(!A.inb[i])continue; const L=A.lat[i];
        let f=profile(L,ac,ah); if(f<=0)continue;
        for(let k=0;k<blocks.length;k++){ const bk=blocks[k]; f*=1-profile(L,(bk.min+bk.max)/2,(bk.max-bk.min)/2); if(f<=0)break; }
        if(f<=0)continue;
        if(b.wedge) f*=wedgeFactor(L,ac,ah,b.wedge,b.wedgeDir||1);
        raw[i]+=w*beamDepthFactor(A.depth[i],A.axl[i],b.bolus)*f; } });
    S.dose=normalizeToTarget(raw); S.calculated=true; S.doseMax=maxArr(S.dose);
    dirty=true; refreshDVH(); refreshMetrics(); busy(false);
    const nBlk=beams.reduce((a,b)=>a+((b.shield&&b.shield.length)?1:0),0);
    const nWdg=beams.reduce((a,b)=>a+(b.wedge?1:0),0), nBol=beams.reduce((a,b)=>a+(b.bolus?1:0),0);
    setStatus('Forward dose · '+beams.length+' beams · '+(beams.every(b=>b.conform!==false)?'MLC-conformed':'mixed aperture')+(nBlk?' · '+nBlk+' blocked':'')+(nWdg?' · '+nWdg+' wedged':'')+(nBol?' · '+nBol+' bolus':'')+' · '+(S.technique==='ssd'?('SSD/PDD '+(S.ssd||100)+'cm'):'SAD/TMR')+(S.hetero?' · heterogeneity on':'')+'.');
  },20);
}

/* ----------------------------- DVH + METRICS ----------------------------- */
function structDoses(st){ const m=st.masks[S.cur]; if(!m||!S.dose) return null; const out=[]; for(let i=0;i<m.length;i++) if(m[i]) out.push(S.dose[i]); return out.length?out:null; }
function cumDVH(doses){ const bins=61,cum=new Array(bins); for(let b=0;b<bins;b++){ const lvl=b*2; let c=0; for(const d of doses) if(d>=lvl)c++; cum[b]=c/doses.length*100; } return cum; }
function refreshDVH(){
  const c=$('dvh'), g=c.getContext('2d'), W=c.width, H=c.height, mL=34,mB=22,mT=8,mR=8;
  g.clearRect(0,0,W,H); g.fillStyle='#06121d'; g.fillRect(0,0,W,H);
  const x0=mL,y0=H-mB,pw=W-mL-mR,ph=H-mT-mB;
  g.strokeStyle='rgba(120,200,210,0.18)'; g.lineWidth=1; g.fillStyle='#9fb0c5'; g.font='9px IBM Plex Mono'; g.textAlign='right';
  for(let v=0;v<=100;v+=25){ const y=y0-v/100*ph; g.beginPath(); g.moveTo(x0,y); g.lineTo(x0+pw,y); g.stroke(); g.fillText(v+'%',x0-3,y+3); }
  g.textAlign='center'; for(let d=0;d<=120;d+=30){ const x=x0+d/120*pw; g.beginPath(); g.moveTo(x,y0);g.lineTo(x,mT);g.strokeStyle='rgba(120,200,210,0.08)';g.stroke(); g.fillStyle='#9fb0c5'; g.fillText(d+'%',x,H-7); }
  // Rx line at 100%
  const rxX=x0+100/120*pw; g.strokeStyle='rgba(4,217,255,0.5)'; g.setLineDash([3,3]); g.beginPath(); g.moveTo(rxX,mT);g.lineTo(rxX,y0);g.stroke(); g.setLineDash([]);
  const leg=$('dvhLegend'); leg.innerHTML='';
  if(!S.dose){ g.fillStyle='#9fb0c5'; g.textAlign='center'; g.fillText('Calculate a plan to see DVH',W/2,H/2); return; }
  S.structs.forEach(st=>{ const ds=structDoses(st); if(!ds)return; const cum=cumDVH(ds);
    g.strokeStyle=st.color; g.lineWidth=st.type==='target'?2.2:1.6; g.beginPath();
    cum.forEach((v,b)=>{ const x=x0+(b*2)/120*pw, y=y0-v/100*ph; b?g.lineTo(x,y):g.moveTo(x,y); }); g.stroke();
    leg.innerHTML+=`<span><i style="background:${st.color}"></i>${st.name}</span>`;
  });
}
function pct(doses,p){ const s=[...doses].sort((a,b)=>a-b); return s[clamp(Math.floor((1-p/100)*s.length),0,s.length-1)]||0; }
function refreshMetrics(){
  const el=$('metrics'); if(!S.dose){ el.innerHTML='<div class="row"><span>Calculate a plan…</span><b></b></div>'; return; }
  let h=''; const Rx=S.rx;
  S.structs.forEach(st=>{ const ds=structDoses(st); if(!ds)return; const dmax=Math.max(...ds), dmean=ds.reduce((a,b)=>a+b,0)/ds.length;
    if(st.type==='target'){ const v95=ds.filter(d=>d>=95).length/ds.length*100, d95=pct(ds,95);
      h+=`<div class="row"><span>${st.name} D95</span><b>${(d95/100*Rx).toFixed(1)} Gy (${d95.toFixed(0)}%)</b></div>`;
      h+=`<div class="row"><span>${st.name} V95%</span><b style="color:${v95>=95?'#34d399':'#ffb86b'}">${v95.toFixed(1)}%</b></div>`;
      h+=`<div class="row"><span>${st.name} Dmax</span><b>${dmax.toFixed(0)}%</b></div>`;
    } else { h+=`<div class="row"><span>${st.name} Dmax</span><b>${(dmax/100*Rx).toFixed(1)} Gy</b></div>`;
      h+=`<div class="row"><span>${st.name} Dmean</span><b>${(dmean/100*Rx).toFixed(1)} Gy</b></div>`; }
  });
  el.innerHTML=h||'<div class="row"><span>No structures</span><b></b></div>';
}

/* ----------------------------- BEAM'S-EYE VIEW ----------------------------- */
function bevBeamOptions(){
  const sel=$('bevBeam'); if(!sel) return; const prev=S.bevBeam;
  sel.innerHTML='';
  S.beams.forEach((b,i)=>{ const o=document.createElement('option'); o.value=i; o.textContent='Beam '+(i+1)+' · '+b.angle+'\u00b0'+(b.on?'':' (off)'); sel.appendChild(o); });
  if(prev!=null && prev<S.beams.length){ sel.value=prev; } else { S.bevBeam=S.beams.length?0:null; if(S.bevBeam!=null) sel.value=S.bevBeam; }
}
function renderBEVIfOpen(){ if($('bevCanvas')) renderBEV(); }
function renderBEV(){
  const cvs=$('bevCanvas'); if(!cvs) return; const g=cvs.getContext('2d'); const W=cvs.width, H=cvs.height;
  g.clearRect(0,0,W,H); g.fillStyle='#06121d'; g.fillRect(0,0,W,H);
  const msg=t=>{ g.fillStyle='#9fb0c5'; g.font='11px IBM Plex Mono'; g.textAlign='center'; g.fillText(t,W/2,H/2); };
  if(!S.loaded||!S.beams.length){ msg('Add a beam'); return; }
  let bi=S.bevBeam; if(bi==null||bi>=S.beams.length) bi=0;
  const b=S.beams[bi]; const A=getAngleData(b.angle);
  const tgt=S.structs.find(s=>s.type==='target'); if(!tgt){ msg('Contour a target'); return; }
  const sl=S.slices.length; const margin=(b.margin==null?0.8:b.margin)*S.PX_PER_CM;
  const oarStructs=S.structs.map((s,i)=>({s,i})).filter(o=>o.s.type==='oar');
  const rows=[]; let uHalf=8, vMin=sl, vMax=-1;
  for(let s=0;s<sl;s++){
    const m=tgt.masks[s]; let tg=null;
    if(m){ let mn=1e9,mx=-1e9,c=0; for(let i=0;i<m.length;i++){ if(m[i]){ const l=A.lat[i]; if(l<mn)mn=l; if(l>mx)mx=l; c++; } } if(c){ tg={min:mn,max:mx}; if(s<vMin)vMin=s; if(s>vMax)vMax=s; uHalf=Math.max(uHalf,Math.abs(mn),Math.abs(mx)); } }
    const oars=[]; oarStructs.forEach(o=>{ const om=o.s.masks[s]; if(!om)return; let mn=1e9,mx=-1e9,c=0; for(let i=0;i<om.length;i++){ if(om[i]){ const l=A.lat[i]; if(l<mn)mn=l; if(l>mx)mx=l; c++; } } if(c){ oars.push({i:o.i,color:o.s.color,min:mn,max:mx,shield:(b.shield||[]).includes(o.i)}); uHalf=Math.max(uHalf,Math.abs(mn),Math.abs(mx)); } });
    rows.push({s,tg,oars});
  }
  if(vMax<vMin){ msg('Target not on these slices'); return; }
  if(b.conform===false) uHalf=Math.max(uHalf, S.fieldW/2);
  uHalf=(uHalf+margin)*1.12; vMin=Math.max(0,vMin-1); vMax=Math.min(sl-1,vMax+1);
  const pad=18, plotW=W-pad*2, plotH=H-pad*2, vSpan=Math.max(1,vMax-vMin);
  const ux=u=> pad+plotW*(u+uHalf)/(2*uHalf);
  const vy=v=> pad+plotH*(v-vMin)/vSpan;
  // field background
  g.fillStyle='rgba(120,200,210,0.05)'; g.fillRect(pad,pad,plotW,plotH);
  // target silhouette
  g.fillStyle='rgba(251,113,133,0.50)';
  rows.forEach(r=>{ if(!r.tg)return; const y0=vy(r.s-0.5),y1=vy(r.s+0.5); g.fillRect(ux(r.tg.min),y0,Math.max(1,ux(r.tg.max)-ux(r.tg.min)),Math.max(1,y1-y0)); });
  // OAR outlines
  rows.forEach(r=>{ r.oars.forEach(o=>{ const y0=vy(r.s-0.5),y1=vy(r.s+0.5); g.save(); g.globalAlpha=o.shield?0.85:0.45; g.strokeStyle=o.color; g.lineWidth=o.shield?1.4:0.8; g.strokeRect(ux(o.min),y0,Math.max(1,ux(o.max)-ux(o.min)),Math.max(1,y1-y0)); g.restore(); }); });
  // MLC leaves
  const nLeaf=24, leafH=plotH/nLeaf;
  g.fillStyle='rgba(150,170,185,0.85)'; g.strokeStyle='rgba(15,25,35,0.7)'; g.lineWidth=0.5;
  for(let li=0; li<nLeaf; li++){
    const vA=vMin+(li/nLeaf)*vSpan, vB=vMin+((li+1)/nLeaf)*vSpan;
    let aMin=1e9,aMax=-1e9,has=false;
    rows.forEach(r=>{ if(r.tg && r.s>=vA-0.5 && r.s<=vB+0.5){ aMin=Math.min(aMin,r.tg.min); aMax=Math.max(aMax,r.tg.max); has=true; } });
    if(b.conform===false){ aMin=-S.fieldW/2; aMax=S.fieldW/2; has=true; }
    const yTop=pad+li*leafH, lh=Math.max(1,leafH-0.6);
    if(!has){ g.fillRect(pad,yTop,plotW,lh); g.strokeRect(pad,yTop,plotW,lh); continue; }
    let oMin=aMin-margin, oMax=aMax+margin;
    rows.forEach(r=>{ if(r.s>=vA-0.5 && r.s<=vB+0.5){ r.oars.forEach(o=>{ if(o.shield){ const oc=(o.min+o.max)/2; if(oc<0) oMin=Math.max(oMin,o.max); else oMax=Math.min(oMax,o.min); } }); } });
    if(oMax<oMin) oMax=oMin;
    const lW=ux(oMin)-pad, rX=ux(oMax), rW=(pad+plotW)-ux(oMax);
    if(lW>0){ g.fillRect(pad,yTop,lW,lh); g.strokeRect(pad,yTop,lW,lh); }
    if(rW>0){ g.fillRect(rX,yTop,rW,lh); g.strokeRect(rX,yTop,rW,lh); }
  }
  // current-slice line
  if(S.cur>=vMin && S.cur<=vMax){ g.strokeStyle='rgba(4,217,255,0.6)'; g.setLineDash([3,3]); g.lineWidth=1; const yi=vy(S.cur); g.beginPath(); g.moveTo(pad,yi); g.lineTo(W-pad,yi); g.stroke(); g.setLineDash([]); }
  g.fillStyle='#9fb0c5'; g.font='9px IBM Plex Mono'; g.textAlign='center';
  g.fillText('Beam '+(bi+1)+' · '+b.angle+'\u00b0 · field \u2248'+(2*uHalf/S.PX_PER_CM).toFixed(0)+' cm'+(b.wedge?' · wedge '+b.wedge+'\u00b0':''), W/2, H-5);
}

/* ----------------------------- FORWARD UI ----------------------------- */
function defaultBeams(){ if(S.beams.length) return; S.beams=[{angle:0,weight:1,on:true},{angle:180,weight:1,on:true}]; }
function renderBeamList(){
  const host=$('beamList'); host.innerHTML='';
  const oars=S.structs.map((s,i)=>({s,i})).filter(o=>o.s.type==='oar');
  S.beams.forEach((b,i)=>{
    if(b.margin==null)b.margin=0.8; if(b.conform==null)b.conform=true; if(!b.shield)b.shield=[]; if(b.wedge==null)b.wedge=0; if(b.wedgeDir==null)b.wedgeDir=1; if(b.bolus==null)b.bolus=false;
    const d=document.createElement('div'); d.className='beam';
    d.innerHTML=`<input class="ang" type="number" min="0" max="359" value="${b.angle}" title="Gantry angle — editable"
        style="width:48px;background:#0a1726;color:inherit;border:1px solid rgba(120,200,210,.34);border-radius:6px;padding:3px 4px;font-family:'IBM Plex Mono',monospace;font-size:12px">
      <span style="color:#8da6b8;font-size:11px">°</span>
      <input class="wt" type="range" min="0" max="2" step="0.05" value="${b.weight}" style="flex:1">
      <span class="v" style="font-family:'IBM Plex Mono',monospace;font-size:11px;min-width:30px;text-align:right">${b.weight.toFixed(2)}</span>
      <span class="shp" title="Field shaping / MLC blocking" style="cursor:pointer;opacity:.85">⛶</span>
      <span class="del" style="cursor:pointer">✕</span>`;
    const ang=d.querySelector('.ang'), rng=d.querySelector('.wt'), v=d.querySelector('.v');
    ang.onchange=()=>{ b.angle=((Math.round(+ang.value||0)%360)+360)%360; ang.value=b.angle; dirty=true; if($('liveCalc').checked)computeForwardDose(); };
    rng.oninput=()=>{ b.weight=+rng.value; v.textContent=b.weight.toFixed(2); if($('liveCalc').checked)computeForwardDose(); };
    d.querySelector('.del').onclick=()=>{ S.beams.splice(i,1); renderBeamList(); dirty=true; if($('liveCalc').checked)computeForwardDose(); };
    // ---- MLC / blocking sub-panel ----
    const shape=document.createElement('div'); shape.className='shape';
    shape.style.cssText='display:none;margin:-2px 0 8px;padding:7px 9px;border:1px dashed rgba(120,200,210,.34);border-radius:8px;font-size:11px';
    shape.innerHTML=`<label style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><input type="checkbox" class="cf" ${b.conform?'checked':''}> Conform MLC to target (+margin)</label>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:7px"><span style="color:#8da6b8;min-width:42px">Margin</span><input type="range" class="mg" min="0" max="2.5" step="0.1" value="${b.margin}" style="flex:1"><span class="mgv" style="font-family:'IBM Plex Mono',monospace;min-width:42px;text-align:right">${b.margin.toFixed(1)} cm</span></div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><span style="color:#8da6b8;min-width:42px">Wedge</span>
        <select class="wd" style="flex:1;background:#0a1726;color:inherit;border:1px solid rgba(120,200,210,.34);border-radius:6px;padding:3px">
          <option value="0">None</option><option value="15">15&deg;</option><option value="30">30&deg;</option><option value="45">45&deg;</option><option value="60">60&deg;</option></select>
        <button class="wdir b sm" title="flip wedge direction" style="padding:2px 8px">&#8646;</button></div>
      <label style="display:flex;align-items:center;gap:6px;margin-bottom:8px"><input type="checkbox" class="bol" ${b.bolus?'checked':''}> Bolus (remove skin sparing)</label>
      <div style="color:#8da6b8;margin-bottom:4px">Block (shield) OAR shadow with MLC:</div>
      <div class="chips" style="display:flex;flex-wrap:wrap;gap:4px"></div>`;
    d.querySelector('.shp').onclick=()=>{ shape.style.display=shape.style.display==='none'?'block':'none'; };
    shape.querySelector('.cf').onchange=e=>{ b.conform=e.target.checked; dirty=true; if($('liveCalc').checked)computeForwardDose(); };
    const mg=shape.querySelector('.mg'), mgv=shape.querySelector('.mgv');
    mg.oninput=()=>{ b.margin=+mg.value; mgv.textContent=b.margin.toFixed(1)+' cm'; if($('liveCalc').checked)computeForwardDose(); renderBEVIfOpen(); };
    const wd=shape.querySelector('.wd'); wd.value=String(b.wedge||0);
    wd.onchange=()=>{ b.wedge=+wd.value; if($('liveCalc').checked)computeForwardDose(); };
    shape.querySelector('.wdir').onclick=()=>{ b.wedgeDir=(b.wedgeDir||1)*-1; if($('liveCalc').checked)computeForwardDose(); };
    shape.querySelector('.bol').onchange=e=>{ b.bolus=e.target.checked; if($('liveCalc').checked)computeForwardDose(); };
    const chips=shape.querySelector('.chips');
    if(!oars.length) chips.innerHTML='<span style="color:#8da6b8">no OARs contoured</span>';
    oars.forEach(o=>{ const on=b.shield.includes(o.i); const c=document.createElement('span');
      c.textContent=o.s.name;
      c.style.cssText=`cursor:pointer;padding:2px 8px;border-radius:999px;font-size:10px;border:1px solid ${o.s.color};`+(on?`background:${o.s.color};color:#06231f;font-weight:600`:`color:${o.s.color}`);
      c.onclick=()=>{ const k=b.shield.indexOf(o.i); if(k>=0)b.shield.splice(k,1); else b.shield.push(o.i); renderBeamList(); shape.style.display='block'; dirty=true; if($('liveCalc').checked)computeForwardDose(); };
      chips.appendChild(c); });
    host.appendChild(d); host.appendChild(shape);
  });
  bevBeamOptions(); renderBEVIfOpen();
}
function beamPreset(p){
  if(p==='2op') S.beams=[{angle:0,weight:1,on:true},{angle:180,weight:1,on:true}];
  else if(p==='4box') S.beams=[0,90,180,270].map(a=>({angle:a,weight:1,on:true}));
  else if(p==='imrt7') S.beams=[0,51,103,154,206,257,309].map(a=>({angle:a,weight:1,on:true}));
  renderBeamList(); dirty=true; if($('liveCalc').checked)computeForwardDose();
}

/* ----------------------------- INVERSE PLANNING ----------------------------- */
function angleList(){ const n=S.nBeams, out=[]; for(let i=0;i<n;i++) out.push(Math.round(i*360/n)); return out; }
function buildObjectives(){
  const host=$('objList'); if(!host) return; host.innerHTML=''; S.objectives=[];
  S.structs.forEach(st=>{ const isT=st.type==='target';
    const o={ struct:st, kind:isT?'target':'oar', val:isT?100:50, weight:isT?1:0.6 }; S.objectives.push(o);
    const d=document.createElement('div'); d.className='obj';
    d.innerHTML=`<div class="r"><i style="width:11px;height:11px;border-radius:3px;background:${st.color};display:inline-block"></i>
      <b style="flex:1">${st.name}</b><span>${isT?'min':'max'}</span><input type="number" value="${o.val}" min="0" max="120"> <span>%</span></div>`;
    d.querySelector('input').oninput=e=>{ o.val=+e.target.value; };
    host.appendChild(d);
  });
}
function precomputeBeamlets(){
  const angles=angleList(), K=12, span=Math.max(S.fieldW*1.5, S.IMG.w*0.22), binW=span/K, binHalf=binW*0.62;
  const beamlets=[];
  angles.forEach(a=>{ const A=getAngleData(a);
    for(let k=0;k<K;k++){ const center=(k-(K-1)/2)*binW; const Dmap=new Float32Array(GRID*GRID);
      for(let i=0;i<GRID*GRID;i++){ if(!A.inb[i])continue; const pr=profile(A.lat[i],center,binHalf); if(pr>0) Dmap[i]=beamDepthFactor(A.depth[i],A.axl[i])*pr; }
      beamlets.push(Dmap);
    } });
  S.beamlets=beamlets; S.optW=new Float32Array(beamlets.length).fill(0.4); S.optK=K;
}
function cellLists(){
  const tgt=[], oars=[]; S.objectives.forEach(o=>{ const m=o.struct.masks[S.cur]; if(!m)return; const cells=[]; for(let i=0;i<m.length;i++) if(m[i])cells.push(i);
    if(o.kind==='target') tgt.push({o,cells}); else oars.push({o,cells}); }); return {tgt,oars};
}
let optTimer=null;
function startOptimize(){
  if(!S.structs.some(s=>s.type==='target'&&s.masks[S.cur])){ setStatus('Contour a target on this slice first.'); return; }
  busy(true,'Preparing beamlets…');
  setTimeout(()=>{
    precomputeBeamlets(); const {tgt,oars}=cellLists(); busy(false);
    if(!tgt.length){ setStatus('No target cells on this slice.'); return; }
    S.optRun=true; $('optProg').value=0; let iter=0; const MAX=140, lr=0.0009;
    const B=S.beamlets.length, w=S.optW;
    const step=()=>{
      if(!S.optRun){ clearInterval(optTimer); return; }
      for(let rep=0;rep<3 && iter<MAX;rep++,iter++){
        // current raw dose on all cells we care about (compute full for scale)
        // scale from target mean
        let tmeanRaw=0,tc=0; const full=new Float32Array(GRID*GRID);
        for(let b=0;b<B;b++){ const wb=w[b]; if(wb<=0)continue; const D=S.beamlets[b]; for(let i=0;i<full.length;i++){ const v=D[i]; if(v)full[i]+=wb*v; } }
        tgt.forEach(t=>t.cells.forEach(i=>{tmeanRaw+=full[i];tc++;}));
        const scale=tmeanRaw>1e-6?100/(tmeanRaw/tc):0;
        const grad=new Float32Array(B); let cost=0;
        tgt.forEach(t=>{ const lim=t.o.val; t.cells.forEach(i=>{ const d=full[i]*scale;
          if(d<lim){ const diff=lim-d; cost+=t.o.weight*diff*diff; const f=-2*t.o.weight*diff*scale; for(let b=0;b<B;b++){ const v=S.beamlets[b][i]; if(v)grad[b]+=f*v; } }
          else if(d>107){ const diff=d-107; cost+=0.3*diff*diff; const f=2*0.3*diff*scale; for(let b=0;b<B;b++){ const v=S.beamlets[b][i]; if(v)grad[b]+=f*v; } }
        }); });
        oars.forEach(t=>{ const lim=t.o.val; t.cells.forEach(i=>{ const d=full[i]*scale; if(d>lim){ const diff=d-lim; cost+=t.o.weight*diff*diff; const f=2*t.o.weight*diff*scale; for(let b=0;b<B;b++){ const v=S.beamlets[b][i]; if(v)grad[b]+=f*v; } } }); });
        for(let b=0;b<B;b++){ w[b]-=lr*grad[b]; if(w[b]<0)w[b]=0; }
        $('costV').textContent=Math.round(cost).toLocaleString();
      }
      // update display dose
      const raw=new Float32Array(GRID*GRID);
      for(let b=0;b<B;b++){ const wb=w[b]; if(wb<=0)continue; const D=S.beamlets[b]; for(let i=0;i<raw.length;i++){ const v=D[i]; if(v)raw[i]+=wb*v; } }
      S.dose=normalizeToTarget(raw); S.calculated=true; dirty=true; refreshDVH(); refreshMetrics(); renderFluenceMaps();
      $('optProg').value=Math.round(iter/MAX*100);
      if(iter>=MAX){ S.optRun=false; clearInterval(optTimer); setStatus('Inverse optimization complete · '+S.nBeams+' beams, '+B+' beamlets.'); }
    };
    optTimer=setInterval(step,40);
    setStatus('Optimizing…');
  },20);
}
function stopOptimize(){ S.optRun=false; if(optTimer)clearInterval(optTimer); setStatus('Optimization stopped.'); }
function resetOptimize(){ stopOptimize(); S.dose=null; S.calculated=false; S.beamlets=null; S.optW=null; $('optProg').value=0; $('costV').textContent='—'; renderFluenceMaps(); dirty=true; refreshDVH(); refreshMetrics(); setStatus('Plan reset.'); }

/* ----------------------------- STRUCTURE UI ----------------------------- */
function renderStructList(){
  const host=$('structList'); host.innerHTML='';
  S.structs.forEach((st,i)=>{ const m=st.masks[S.cur]; let cnt=0; if(m)for(let k=0;k<m.length;k++)cnt+=m[k];
    const d=document.createElement('div'); d.className='struct'+(i===S.activeStruct?' sel':'');
    d.innerHTML=`<span class="sw" style="background:${st.color}"></span><span class="nm">${st.name}</span><span class="meta">${st.type==='target'?'TGT':'OAR'} ${cnt}</span><span class="del">✕</span>`;
    d.onclick=e=>{ if(e.target.classList.contains('del')){ S.structs.splice(i,1); if(S.activeStruct>=S.structs.length)S.activeStruct=0; renderStructList(); buildObjectives(); dirty=true; return; } S.activeStruct=i; renderStructList(); dirty=true; };
    d.querySelector('.nm').ondblclick=()=>{ const n=prompt('Structure name:',st.name); if(n){st.name=n;renderStructList();buildObjectives();} };
    host.appendChild(d);
  });
}
function addStructure(){
  const isTgt=!S.structs.some(s=>s.type==='target');
  const st=newStruct(isTgt?'PTV':'OAR '+(S.structs.length), isTgt?'target':'oar', STRUCT_COLORS[S.structs.length%STRUCT_COLORS.length]);
  S.structs.push(st); S.activeStruct=S.structs.length-1; renderStructList(); buildObjectives();
}

/* ----------------------------- CONTOURING / MOUSE ----------------------------- */
function paintAt(ix,iy,val){
  const st=S.structs[S.activeStruct]; if(!st) return; const m=structMask(st,S.cur,true);
  const [cgx,cgy]=imgToGrid(ix,iy); const rCells=S.brush/(S.IMG.w/GRID);
  const r2=rCells*rCells;
  for(let gy=Math.floor(cgy-rCells);gy<=cgy+rCells;gy++)for(let gx=Math.floor(cgx-rCells);gx<=cgx+rCells;gx++){
    if(gx<0||gy<0||gx>=GRID||gy>=GRID)continue; const dx=gx-cgx,dy=gy-cgy; if(dx*dx+dy*dy<=r2) m[gy*GRID+gx]=val;
  }
  dirty=true;
}
function rasterizePoly(){
  const st=S.structs[S.activeStruct]; if(!st||S.poly.length<3){ S.poly=[]; return; } const m=structMask(st,S.cur,true);
  for(let gy=0;gy<GRID;gy++)for(let gx=0;gx<GRID;gx++){ const [ix,iy]=gridToImg(gx,gy); if(pointInPoly(ix,iy,S.poly)) m[gy*GRID+gx]=1; }
  S.poly=[]; dirty=true; renderStructList(); afterContourChange();
}
function pointInPoly(x,y,poly){ let inside=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){ const xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1];
  if(((yi>y)!==(yj>y)) && (x<(xj-xi)*(y-yi)/((yj-yi)||1e-9)+xi)) inside=!inside; } return inside; }
function afterContourChange(){ S.angleCache=S.angleCache; if(S.calculated){ if(S.mode==='forward') computeForwardDose(); else { refreshDVH(); refreshMetrics(); } } else { refreshDVH(); refreshMetrics(); } }

function bindCanvas(){
  cv.addEventListener('pointerdown',e=>{ if(!S.loaded)return; const [ix,iy]=screenToImg(e.offsetX,e.offsetY);
    if(S.tool==='iso'){ S.iso={x:clamp(ix,0,S.IMG.w),y:clamp(iy,0,S.IMG.h)}; S.angleCache={}; S.mpr={x:S.iso.x,y:S.iso.y}; updateSliceInfo(); dirty=true; if(S.mprOn)renderMPR(); if(S.calculated&&S.mode==='forward')computeForwardDose(); return; }
    if(S.tool==='pan'){ S.dragging='pan'; S.lastPaint=[e.offsetX,e.offsetY]; return; }
    if(S.tool==='poly'){ if(S.poly.length>2){ const f=S.poly[0]; const p=placement(); const d=Math.hypot(e.offsetX-(p.ox+f[0]*p.sc),e.offsetY-(p.oy+f[1]*p.sc)); if(d<10){ rasterizePoly(); return; } } S.poly.push([ix,iy]); dirty=true; return; }
    if(S.tool==='brush'){ S.dragging='brush'; paintAt(ix,iy,1); }
    if(S.tool==='erase'){ S.dragging='erase'; paintAt(ix,iy,0); }
  });
  cv.addEventListener('pointermove',e=>{ if(!S.dragging)return; const [ix,iy]=screenToImg(e.offsetX,e.offsetY);
    if(S.dragging==='pan'){ S.pan.x+=e.offsetX-S.lastPaint[0]; S.pan.y+=e.offsetY-S.lastPaint[1]; S.lastPaint=[e.offsetX,e.offsetY]; dirty=true; }
    else if(S.dragging==='brush') paintAt(ix,iy,1);
    else if(S.dragging==='erase') paintAt(ix,iy,0);
  });
  window.addEventListener('pointerup',()=>{ if(S.dragging==='brush'||S.dragging==='erase'){ renderStructList(); afterContourChange(); } S.dragging=false; });
  cv.addEventListener('dblclick',()=>{ if(S.tool==='poly') rasterizePoly(); });
  cv.addEventListener('wheel',e=>{ e.preventDefault(); if(!S.loaded)return; if(e.ctrlKey){ S.zoom=clamp(S.zoom*(e.deltaY<0?1.1:0.9),0.6,3.2); $('zoom').value=S.zoom*100; $('zmV').textContent=S.zoom.toFixed(1)+'×'; } else { changeSlice(e.deltaY<0?-1:1); } dirty=true; },{passive:false});
  window.addEventListener('keydown',e=>{ if(e.key==='Enter'&&S.tool==='poly') rasterizePoly(); });
}
function changeSlice(delta){ const n=S.slices.length; S.cur=clamp(S.cur+delta,0,n-1); $('sliceSlider').value=S.cur; bodyMaskSlice=-1; S.angleCache={}; updateSliceInfo(); renderStructList(); dirty=true; if(S.calculated){ refreshDVH(); refreshMetrics(); } if(S.mprOn)renderMPR(); }

/* ----------------------------- SAVE / LOAD / EXPORT ----------------------------- */
function savePlan(){
  const data={ ds:S.ds.id, cur:S.cur, iso:S.iso, rx:S.rx, fieldW:S.fieldW, mode:S.mode, nBeams:S.nBeams,
    beams:S.beams, win:S.win,
    structs:S.structs.map(s=>({name:s.name,type:s.type,color:s.color, masks:Object.fromEntries(Object.entries(s.masks).map(([k,v])=>[k,Array.from(v)]))})),
    objectives:S.objectives.map(o=>({name:o.struct.name,kind:o.kind,val:o.val})) };
  dl(JSON.stringify(data),'rtapps_plan.json','application/json'); setStatus('Plan saved.');
}
function loadPlanFile(file){ const r=new FileReader(); r.onload=()=>{ try{ const d=JSON.parse(r.result);
  const ds=DATASETS.find(x=>x.id===d.ds); if(ds&&ds.id!==S.ds.id){ loadDataset(ds); setTimeout(()=>applyPlan(d),1200); } else applyPlan(d);
 }catch(e){ setStatus('Invalid plan file.'); } }; r.readAsText(file); }
function applyPlan(d){ S.cur=d.cur??S.cur; S.iso=d.iso||S.iso; S.rx=d.rx||60; S.fieldW=d.fieldW||70; S.nBeams=d.nBeams||7; S.beams=d.beams||S.beams; S.win=d.win||S.win;
  S.structs=(d.structs||[]).map(s=>({name:s.name,type:s.type,color:s.color,masks:Object.fromEntries(Object.entries(s.masks||{}).map(([k,v])=>[k,Uint8Array.from(v)]))}));
  S.activeStruct=0; S.angleCache={}; bodyMaskSlice=-1;
  $('rxDose').value=S.rx; $('rxV').textContent=S.rx.toFixed(1)+' Gy'; $('fieldW').value=S.fieldW; $('fwV').textContent=(S.fieldW/10).toFixed(1)+' cm'; $('sliceSlider').value=S.cur;
  renderStructList(); renderBeamList(); buildObjectives(); updateSliceInfo(); dirty=true; computeForwardDose(); setStatus('Plan loaded.');
}
function exportPlan(){
  let t=`RTApps Planning Suite — Plan Summary\nDataset: ${S.ds.name}\nMode: ${S.mode}\nTechnique: ${S.technique==='ssd'?('SSD / PDD (SSD '+(S.ssd||100)+' cm)'):'SAD / TMR (isocentric, SAD '+(S.SAD||100)+' cm)'}\nRx: ${S.rx} Gy\nIsocenter (px): ${S.iso.x|0},${S.iso.y|0}\n\nStructures:\n`;
  S.structs.forEach(s=>{ const ds=structDoses(s); t+=`  - ${s.name} [${s.type}]`; if(ds){ const dmax=Math.max(...ds).toFixed(0), dmean=(ds.reduce((a,b)=>a+b,0)/ds.length).toFixed(0); t+=` Dmax ${dmax}% Dmean ${dmean}%`; } t+='\n'; });
  if(S.mode==='forward'){ t+='\nBeams:\n'; S.beams.forEach(b=>t+=`  G${b.angle}°  w=${b.weight.toFixed(2)} ${b.on?'':'(off)'}\n`); }
  else { t+=`\nInverse: ${S.nBeams} beam angles, beamlet optimization\nObjectives:\n`; S.objectives.forEach(o=>t+=`  ${o.struct.name}: ${o.kind==='target'?'min':'max'} ${o.val}%\n`); }
  t+='\n(Educational simulation — not for clinical use.)\n';
  dl(t,'rtapps_plan_summary.txt','text/plain'); setStatus('Plan summary exported.');
}
function dl(text,name,type){ const b=new Blob([text],{type}); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=name; a.click(); URL.revokeObjectURL(a.href); }

/* ----------------------------- LOCAL FOLDER ----------------------------- */
function loadLocalFolder(files){
  const imgs=[...files].filter(f=>/\.(png|jpg|jpeg)$/i.test(f.name)).sort((a,b)=>a.name.localeCompare(b.name));
  if(!imgs.length){ setStatus('No images found in folder.'); return; }
  busy(true,'Loading folder…'); S.ds={id:'local',name:'Local folder ('+imgs.length+')',kind:'local',count:imgs.length,pad:3,iso:Math.floor(imgs.length/2),seed:null};
  S.slices=new Array(imgs.length).fill(null); let done=0;
  imgs.forEach((f,i)=>{ const url=URL.createObjectURL(f); const img=new Image(); img.onload=()=>{ S.slices[i]=img; if(++done>=imgs.length) finishLoad(); }; img.onerror=()=>{ if(++done>=imgs.length) finishLoad(); }; img.src=url; });
}

/* ----------------------------- MLC FLUENCE MAPS (inverse) ----------------------------- */
function fluColor(t){ t=clamp(t,0,1); const r=Math.round(18+t*235),g=Math.round(40+t*150),b=Math.round(70+t*30); return `rgb(${r},${g},${b})`; }
function renderFluenceMaps(){
  let host=$('fluenceMaps'); if(!host) return;
  if(!S.optW||!S.beamlets){ host.innerHTML=''; return; }
  const K=S.optK||12, angles=angleList(), mx=Math.max.apply(null,Array.from(S.optW)); const m=mx>1e-6?mx:1;
  let html='<div style="font-weight:600;color:var(--ink,#e6eef5);margin:8px 0 5px">MLC fluence maps <span style="color:#8da6b8;font-weight:400">(per beam · intensity = leaf open-time)</span></div>';
  angles.forEach((a,ai)=>{ html+=`<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px"><span class="mono" style="width:42px;color:#8da6b8;font-family:'IBM Plex Mono',monospace;font-size:11px">G ${a}°</span><span style="display:flex;flex:1;height:13px;gap:1px;border-radius:3px;overflow:hidden">`;
    for(let k=0;k<K;k++){ const w=S.optW[ai*K+k]/m; html+=`<i style="flex:1;background:${fluColor(w)}"></i>`; }
    html+='</span></div>'; });
  host.innerHTML=html;
}

/* ----------------------------- MPR (axial / coronal / sagittal) ----------------------------- */
function buildVolume(){
  S.vol=null; const n=S.slices.length; if(!n) return false;
  const VW=200,VH=200, c=document.createElement('canvas'); c.width=VW; c.height=VH;
  const g=c.getContext('2d',{willReadFrequently:true}); const data=[]; let ok=true;
  for(let z=0;z<n;z++){ const img=S.slices[z]; g.clearRect(0,0,VW,VH);
    if(img){ try{ g.drawImage(img,0,0,VW,VH); }catch(e){} }
    let id; try{ id=g.getImageData(0,0,VW,VH); }catch(e){ ok=false; break; }
    const gray=new Uint8Array(VW*VH), p=id.data;
    for(let i=0;i<VW*VH;i++) gray[i]=(p[i*4]*0.299+p[i*4+1]*0.587+p[i*4+2]*0.114)|0;
    data.push(gray);
  }
  if(ok){ S.vol={data,w:VW,h:VH,n}; return true; } S.vol=null; return false;
}
function buildMPR(){
  if($('mprToggle')) return; const vpEl=$('vp'); if(!vpEl) return;
  if(getComputedStyle(vpEl).position==='static') vpEl.style.position='relative';
  const btn=document.createElement('button'); btn.id='mprToggle'; btn.textContent='MPR: off';
  btn.style.cssText='position:absolute;top:10px;right:10px;z-index:20;font:600 11px/1 "IBM Plex Sans",sans-serif;color:#cfe;background:rgba(10,23,38,.85);border:1px solid rgba(120,200,210,.34);border-radius:8px;padding:7px 11px;cursor:pointer';
  vpEl.appendChild(btn);
  const wrap=document.createElement('div'); wrap.id='mprWrap';
  wrap.style.cssText='position:absolute;right:10px;bottom:10px;z-index:18;display:none;flex-direction:column;gap:6px';
  wrap.innerHTML=`<div style="position:relative"><canvas id="corCv" width="190" height="150" style="width:190px;height:150px;background:#000;border:1px solid rgba(120,200,210,.3);border-radius:8px;cursor:crosshair"></canvas><span style="position:absolute;top:4px;left:7px;font:600 9px 'IBM Plex Mono';color:#7fe0d6;letter-spacing:.5px">CORONAL</span></div>
    <div style="position:relative"><canvas id="sagCv" width="150" height="190" style="width:150px;height:190px;background:#000;border:1px solid rgba(120,200,210,.3);border-radius:8px;cursor:crosshair"></canvas><span style="position:absolute;top:4px;left:7px;font:600 9px 'IBM Plex Mono';color:#7fe0d6;letter-spacing:.5px">SAGITTAL</span></div>
    <div id="mprNote" style="max-width:190px;font:10px 'IBM Plex Sans';color:#8da6b8;line-height:1.4"></div>`;
  vpEl.appendChild(wrap);
  btn.onclick=()=>{ S.mprOn=!S.mprOn; btn.textContent='MPR: '+(S.mprOn?'on':'off');
    btn.style.color=S.mprOn?'#06231f':'#cfe'; btn.style.background=S.mprOn?'#3fd6cf':'rgba(10,23,38,.85)';
    wrap.style.display=S.mprOn?'flex':'none'; dirty=true; if(S.mprOn){ if(!S.vol)buildVolume(); renderMPR(); } };
  $('corCv').onclick=e=>mprClick('cor',e); $('sagCv').onclick=e=>mprClick('sag',e);
}
function mprClick(which,e){ if(!S.vol)return; const r=e.target.getBoundingClientRect();
  const fx=(e.clientX-r.left)/r.width, fy=(e.clientY-r.top)/r.height, n=S.vol.n;
  if(which==='cor'){ S.mpr.x=clamp(fx*S.IMG.w,0,S.IMG.w); setSliceTo(Math.round(fy*(n-1))); }
  else { S.mpr.y=clamp(fy*S.IMG.h,0,S.IMG.h); setSliceTo(Math.round(fx*(n-1))); }
  dirty=true; renderMPR();
}
function setSliceTo(z){ S.cur=clamp(z,0,S.slices.length-1); $('sliceSlider').value=S.cur; bodyMaskSlice=-1; S.angleCache={}; updateSliceInfo(); renderStructList(); dirty=true; if(S.calculated){refreshDVH();refreshMetrics();} }
function mprStructs(cx,which,outW,outH){
  const n=S.slices.length;
  const gFix = which==='cor' ? imgToGrid(0,S.mpr.y)[1] : imgToGrid(S.mpr.x,0)[0];
  S.structs.forEach(st=>{ cx.fillStyle=st.color+'bb';
    for(let z=0;z<n;z++){ const m=st.masks[z]; if(!m)continue;
      if(which==='cor'){ for(let gx=0;gx<GRID;gx++){ if(m[gFix*GRID+gx]){ cx.fillRect(gx/GRID*outW, z/(n-1)*outH, outW/GRID+0.6, outH/n+0.9); } } }
      else { for(let gy=0;gy<GRID;gy++){ if(m[gy*GRID+gFix]){ cx.fillRect(z/(n-1)*outW, gy/GRID*outH, outW/n+0.9, outH/GRID+0.6); } } }
    } });
}
function renderMPR(){
  if(!S.mprOn) return; const note=$('mprNote'); const cc=$('corCv'), sc=$('sagCv'); if(!cc||!sc) return;
  const ccx=cc.getContext('2d'), scx=sc.getContext('2d');
  if(!S.vol){ ccx.clearRect(0,0,cc.width,cc.height); scx.clearRect(0,0,sc.width,sc.height);
    if(note)note.textContent='MPR reconstruction needs same-origin pixels. It works with the served local datasets and the phantom; remote images may be blocked by cross-origin rules — run the bundled folder via a local server.'; return; }
  if(note)note.textContent='Click a view to move the planes · crosshair = current axial slice.';
  const {data,w:VW,h:VH,n}=S.vol;
  const vy=clamp(Math.round(S.mpr.y/S.IMG.h*VH),0,VH-1), vx=clamp(Math.round(S.mpr.x/S.IMG.w*VW),0,VW-1);
  // coronal reslice (VW x n)
  const cor=document.createElement('canvas'); cor.width=VW; cor.height=n; const cg=cor.getContext('2d'), cim=cg.createImageData(VW,n);
  for(let z=0;z<n;z++){ const row=data[z]; for(let x=0;x<VW;x++){ const gv=row?row[vy*VW+x]:0, o=(z*VW+x)*4; cim.data[o]=cim.data[o+1]=cim.data[o+2]=gv; cim.data[o+3]=255; } }
  cg.putImageData(cim,0,0);
  // sagittal reslice (n x VH)
  const sag=document.createElement('canvas'); sag.width=n; sag.height=VH; const sg=sag.getContext('2d'), sim=sg.createImageData(n,VH);
  for(let y=0;y<VH;y++){ for(let z=0;z<n;z++){ const row=data[z], gv=row?row[y*VW+vx]:0, o=(y*n+z)*4; sim.data[o]=sim.data[o+1]=sim.data[o+2]=gv; sim.data[o+3]=255; } }
  sg.putImageData(sim,0,0);
  ccx.save(); ccx.imageSmoothingEnabled=true; ccx.filter=`brightness(${S.win.b}) contrast(${S.win.c})`; ccx.clearRect(0,0,cc.width,cc.height); ccx.drawImage(cor,0,0,cc.width,cc.height); ccx.restore();
  scx.save(); scx.imageSmoothingEnabled=true; scx.filter=`brightness(${S.win.b}) contrast(${S.win.c})`; scx.clearRect(0,0,sc.width,sc.height); scx.drawImage(sag,0,0,sc.width,sc.height); scx.restore();
  mprStructs(ccx,'cor',cc.width,cc.height); mprStructs(scx,'sag',sc.width,sc.height);
  // crosshairs (cyan = current slice / plane)
  ccx.strokeStyle='#04d9ff'; ccx.lineWidth=1; const cZ=(S.cur/(n-1))*cc.height, cX=(vx/VW)*cc.width;
  ccx.beginPath(); ccx.moveTo(0,cZ);ccx.lineTo(cc.width,cZ);ccx.moveTo(cX,0);ccx.lineTo(cX,cc.height);ccx.stroke();
  scx.strokeStyle='#04d9ff'; scx.lineWidth=1; const sZ=(S.cur/(n-1))*sc.width, sY=(vy/VH)*sc.height;
  scx.beginPath(); scx.moveTo(sZ,0);scx.lineTo(sZ,sc.height);scx.moveTo(0,sY);scx.lineTo(sc.width,sY);scx.stroke();
}


function setMode(m){ S.mode=m; document.querySelectorAll('#modeSeg button').forEach(b=>b.classList.toggle('active',b.dataset.mode===m));
  $('forwardPanel').classList.toggle('hide',m!=='forward'); $('inversePanel').classList.toggle('hide',m!=='inverse');
  if(m==='inverse'){ S.calculated=false; S.dose=null; dirty=true; refreshDVH(); refreshMetrics(); buildObjectives(); }
  else { stopOptimize(); }
  dirty=true;
}
function setTool(t){ S.tool=t; document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===t)); $('toolIso').classList.toggle('active',t==='iso'); if(t!=='poly')S.poly=[]; dirty=true; }
function setTechnique(t){
  S.technique=t;
  document.querySelectorAll('#techSeg button').forEach(b=>b.classList.toggle('active',b.dataset.tech===t));
  if($('techV')) $('techV').textContent = t==='sad' ? 'SAD · isocentric (TMR)' : 'SSD · fixed surface (PDD)';
  if($('ssdRow')) $('ssdRow').style.display = t==='ssd' ? 'block' : 'none';
  if(S.calculated && S.mode==='forward') computeForwardDose();
  else if(S.mode==='inverse') setStatus('Technique set to '+t.toUpperCase()+' — re-run Optimize to apply.');
}

function init(){
  cv=document.createElement('canvas'); $('stage').appendChild(cv); ctx=cv.getContext('2d');
  off=document.createElement('canvas'); octx=off.getContext('2d'); vp=$('vp'); busyEl=$('busy');
  buildDatasetSelect();
  // controls
  $('brightness').oninput=e=>{ S.win.b=+e.target.value/100; $('brV').textContent=e.target.value; updateSliceInfo(); dirty=true; if(S.mprOn)renderMPR(); };
  $('contrast').oninput=e=>{ S.win.c=+e.target.value/100; $('ctV').textContent=e.target.value; updateSliceInfo(); dirty=true; if(S.mprOn)renderMPR(); };
  document.querySelectorAll('[data-wl]').forEach(b=>b.onclick=()=>{ if(b.dataset.wl==='soft'){S.win={b:1.0,c:1.1};}else{S.win={b:0.8,c:1.8};} $('brightness').value=S.win.b*100;$('contrast').value=S.win.c*100;$('brV').textContent=Math.round(S.win.b*100);$('ctV').textContent=Math.round(S.win.c*100); dirty=true; });
  $('zoom').oninput=e=>{ S.zoom=+e.target.value/100; $('zmV').textContent=S.zoom.toFixed(1)+'×'; dirty=true; };
  $('resetView').onclick=()=>{ S.zoom=1;S.pan={x:0,y:0};$('zoom').value=100;$('zmV').textContent='1.0×';dirty=true; };
  $('fitView').onclick=()=>{ S.zoom=1;S.pan={x:0,y:0};$('zoom').value=100;$('zmV').textContent='1.0×';dirty=true; };
  $('toolIso').onclick=()=>setTool('iso');
  document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
  $('brushSize').oninput=e=>{ S.brush=+e.target.value; $('brushV').textContent=e.target.value; };
  $('addStruct').onclick=addStructure;
  $('addBeam').onclick=()=>{ const last=S.beams.length?S.beams[S.beams.length-1].angle:0; S.beams.push({angle:(last+45)%360,weight:1,on:true,conform:true,margin:0.8,shield:[]}); renderBeamList(); dirty=true; if($('liveCalc').checked)computeForwardDose(); };
  // technique (SSD/PDD vs SAD/TMR) control — injected so it applies to both modes
  (function(){ const fp=$('forwardPanel'); if(fp && !$('techSeg')){
    const wrap=document.createElement('div'); wrap.style.cssText='margin:0 0 12px';
    wrap.innerHTML=`<div class="lab" style="display:flex;justify-content:space-between;margin-bottom:5px"><span>Technique</span><b id="techV">SAD · isocentric (TMR)</b></div>
      <div id="techSeg" style="display:flex;gap:6px;margin-bottom:6px">
        <button class="b sm active" data-tech="sad" style="flex:1">SAD · TMR</button>
        <button class="b sm" data-tech="ssd" style="flex:1">SSD · PDD</button></div>
      <div id="ssdRow" style="display:none"><div class="lab" style="display:flex;justify-content:space-between"><span>SSD</span><b id="ssdV">100 cm</b></div>
        <input type="range" id="ssdSl" min="80" max="120" value="100"></div>`;
    fp.insertBefore(wrap, fp.firstChild);
    document.querySelectorAll('#techSeg button').forEach(b=>b.onclick=()=>setTechnique(b.dataset.tech));
    $('ssdSl').oninput=e=>{ S.ssd=+e.target.value; $('ssdV').textContent=S.ssd+' cm'; if(S.calculated&&S.mode==='forward')computeForwardDose(); };
  } })();
  // heterogeneity correction toggle (applies to forward + inverse depth model)
  (function(){ const fp=$('forwardPanel'); if(fp && !$('heteroTog')){
    const w=document.createElement('label'); w.style.cssText='display:flex;align-items:center;gap:7px;margin:0 0 12px;font-size:12px;color:var(--ink)';
    w.innerHTML='<input type="checkbox" id="heteroTog"> Heterogeneity correction <span style="color:#8da6b8;font-size:10px">(lung / bone density)</span>';
    fp.insertBefore(w, fp.children[1]||null);
    $('heteroTog').onchange=e=>{ S.hetero=e.target.checked; S.angleCache={}; bodyMaskSlice=-1; dirty=true; if(S.calculated&&S.mode==='forward')computeForwardDose(); setStatus('Heterogeneity correction '+(S.hetero?'on \u2014 dose now follows tissue density (radiological depth) along each ray.':'off \u2014 uniform-density model.')); };
  } })();
  // beam's-eye view panel
  (function(){ const fp=$('forwardPanel'); if(fp && !$('bevCanvas')){
    const w=document.createElement('div'); w.style.cssText='margin:12px 0 4px';
    w.innerHTML=`<div class="lab" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px"><span>Beam&#39;s-eye view</span>
        <select id="bevBeam" style="background:#0a1726;color:inherit;border:1px solid rgba(120,200,210,.34);border-radius:6px;padding:2px 4px;font-size:11px"></select></div>
      <canvas id="bevCanvas" width="248" height="248" style="width:100%;background:#06121d;border:1px solid rgba(120,200,210,.18);border-radius:8px;display:block"></canvas>
      <div style="color:#8da6b8;font-size:10px;margin-top:4px">Target silhouette down the beam axis, with the multi-leaf collimator aperture and any shielded organs.</div>`;
    fp.appendChild(w);
    $('bevBeam').onchange=()=>{ S.bevBeam=+$('bevBeam').value; renderBEV(); };
    bevBeamOptions(); renderBEV();
  } })();
  // inverse fluence-map container
  (function(){ const ip=$('inversePanel'); if(ip && !$('fluenceMaps')){ const d=document.createElement('div'); d.id='fluenceMaps'; ip.appendChild(d); } })();
  buildMPR();
  document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>beamPreset(b.dataset.preset));
  $('rxDose').oninput=e=>{ S.rx=+e.target.value; $('rxV').textContent=S.rx.toFixed(1)+' Gy'; $('rxDose2').value=S.rx; $('rxV2').textContent=S.rx.toFixed(1)+' Gy'; refreshMetrics(); };
  $('rxDose2').oninput=e=>{ S.rx=+e.target.value; $('rxV2').textContent=S.rx.toFixed(1)+' Gy'; $('rxDose').value=S.rx; $('rxV').textContent=S.rx.toFixed(1)+' Gy'; refreshMetrics(); };
  $('fieldW').oninput=e=>{ S.fieldW=+e.target.value; $('fwV').textContent=(S.fieldW/10).toFixed(1)+' cm'; dirty=true; if($('liveCalc').checked)computeForwardDose(); };
  $('nBeams').oninput=e=>{ S.nBeams=+e.target.value; $('nbV').textContent=e.target.value; dirty=true; };
  $('calcDose').onclick=computeForwardDose;
  $('optimize').onclick=startOptimize; $('stopOpt').onclick=stopOptimize; $('resetOpt').onclick=resetOptimize;
  document.querySelectorAll('#modeSeg button').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
  $('sliceSlider').oninput=e=>{ S.cur=+e.target.value; bodyMaskSlice=-1; S.angleCache={}; updateSliceInfo(); renderStructList(); dirty=true; if(S.calculated){refreshDVH();refreshMetrics();} if(S.mprOn)renderMPR(); renderBEVIfOpen(); };
  $('savePlan').onclick=savePlan; $('exportPlan').onclick=exportPlan;
  $('loadPlanBtn').onclick=()=>$('loadPlanInput').click(); $('loadPlanInput').onchange=e=>{ if(e.target.files[0])loadPlanFile(e.target.files[0]); };
  $('loadFolder').onclick=()=>$('folderInput').click(); $('folderInput').onchange=e=>loadLocalFolder(e.target.files);
  // isodose legend
  $('isoLeg').innerHTML='<div style="color:var(--ink);font-weight:600;margin-bottom:4px">Isodose (% Rx)</div>'+ISODOSE.slice().reverse().map(l=>`<div class="l"><i style="background:${ISO_COLORS[l]}"></i>${l}%</div>`).join('');
  setTool('brush');
  window.addEventListener('resize',resize);
  bindCanvas();
  resize(); draw();
  loadDataset(DATASETS[0]);
}
window.addEventListener('DOMContentLoaded',init);
