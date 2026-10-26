// Copyright (c) 2026 Adms Chung; SPDX-License-Identifier: Apache-2.0
// Generated sand strokes: BPM controls drawing rate, not measured audio energy.
function random(seed,id,i){let n=(seed^Math.imul(id+19,1597334677)^Math.imul(i+1,3812015801))>>>0;n=Math.imul(n^(n>>>16),2246822507);n=Math.imul(n^(n>>>13),3266489909);return ((n^(n>>>16))>>>0)/4294967296;}
// A stroke keeps its own width and speed until it finishes, including after seeking.
export function brushStyle(seed,stroke){return {speed:1+2*random(seed,stroke,800001),width:1+2*random(seed,stroke,800002)};}
export class SandPacing {
 constructor(seed){this.seed=seed;this.ends=[0];}
 at(beat){
  beat=Math.max(0,Number.isFinite(beat)?beat:0);
  while(this.ends.at(-1)<=beat){const stroke=this.ends.length-1;this.ends.push(this.ends.at(-1)+4/brushStyle(this.seed,stroke).speed);}
  let lo=0,hi=this.ends.length-1;
  while(lo+1<hi){const mid=(lo+hi)>>1;if(this.ends[mid]<=beat)lo=mid;else hi=mid;}
  return {stroke:lo,progress:(beat-this.ends[lo])/(this.ends[lo+1]-this.ends[lo]),...brushStyle(this.seed,lo)};
 }
}
export class SandClock {
 constructor(){this.state=null;}
 reset(){this.state=null;}
 step(frame,key,now){
  const bpm=Number.isFinite(frame.bpm)?frame.bpm:90,p=this.state;
  const seek=p&&frame.position!==p.position&&Math.abs(frame.position-p.position)>3;
  const beat=!p||p.key!==key||seek?frame.position*bpm/60:p.beat+(frame.playing?Math.max(0,Math.min(.25,(now-p.now)/1000))*bpm/60:0);
  this.state={key,position:frame.position,beat,now};return beat;
 }
}
// Overscan is wider than all seven groove offsets plus their soft grain fringe.
export function rippleGuide(t,{width,height,arc,base,amplitude,frequency,phase,tilt}){
 const margin=Math.max(64,width*.12),dx=width+2*margin,x=-margin+dx*t;
 const a=phase+t*Math.PI*2*frequency;
 const y=arc?base+amplitude*(2*t-1)**2+tilt*(t-.5):base+amplitude*Math.sin(a);
 const dy=arc?8*amplitude*(t-.5)+tilt:amplitude*Math.cos(a)*Math.PI*2*frequency;
 const norm=Math.hypot(dx,dy);return {x,y,nx:-dy/norm,ny:dx/norm};
}
export class ZenSand {
 constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.last='';this.key='';this.seed=0;this.clock=new SandClock();this.pacing=new SandPacing(0);}
 clear(){this.canvas.hidden=true;this.last='';this.clock.reset();}
 draw(frame,key,reduced=false){
  const c=this.canvas,ctx=this.ctx;if(!ctx||!frame.active){this.clear();return;}
  c.hidden=false;const box=c.getBoundingClientRect();if(!box.width||!box.height)return;
  const dpr=Math.min(2,window.devicePixelRatio||1),w=Math.round(box.width*dpr),h=Math.round(box.height*dpr);
  if(c.width!==w||c.height!==h){c.width=w;c.height=h;this.last='';}
  if(key!==this.key){this.key=key;this.seed=2166136261;for(const ch of key)this.seed=Math.imul(this.seed^ch.charCodeAt(0),16777619);this.pacing=new SandPacing(this.seed);this.last='';}
  // Keep drawing between metadata polls; pause freezes, seeks restart at the new beat.
  const timing=this.pacing.at(reduced?8:this.clock.step(frame,key,performance.now())),{stroke,progress}=timing,beat=(stroke+progress)*4;
  const stamp=`${w}:${h}:${beat.toFixed(3)}`;if(stamp===this.last)return;this.last=stamp;
  c.dataset.drawSpeed=String(timing.speed);c.dataset.brushWidth=String(timing.width);c.dataset.phase=String(beat);c.dataset.stroke=String(stroke);c.dataset.progress=String(progress);
  ctx.setTransform(dpr,0,0,dpr,0,0);const width=box.width,height=box.height;
  const bg=ctx.createLinearGradient(0,0,width,height);bg.addColorStop(0,'#0c191b');bg.addColorStop(.5,'#141924');bg.addColorStop(1,'#191520');ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
  const tint=ctx.createLinearGradient(0,0,width,0);tint.addColorStop(0,'#79d9bd');tint.addColorStop(.45,'#87c6df');tint.addColorStop(.75,'#b2a0da');tint.addColorStop(1,'#d5a3c5');
  const rand=(id,i)=>random(this.seed,id,i);
  // Loose rake patterns vary in scale, centre and shape; the canvas clips their edges.
  const teeth=7;c.dataset.rakeTeeth=String(teeth);c.dataset.pattern='free-ripples';
  for(let age=3;age>=0;age--){
   const id=stroke-age,brushWidth=brushStyle(this.seed,id).width,end=age?1:progress,fade=age?Math.max(0,1-(age-1+progress)/3):1;
   if(end<=0||fade<=0)continue;
   const arc=rand(id,8)>.48,spacing=(1.8+rand(id,9)*2.4)*brushWidth;
   const parameters={width,height,arc,base:height*(.2+rand(id,5)*.6),amplitude:height*(arc ? .7+rand(id,0)*2.8 : .28+rand(id,6)*.8)*(arc&&rand(id,11)>.5?-1:1),frequency:.45+rand(id,7)*1.1,phase:rand(id,10)*6.28,tilt:(rand(id,4)-.5)*height};
   const guide=t=>rippleGuide(t,parameters);
   for(let tooth=0;tooth<teeth;tooth++){
    const offset=(tooth-3)*spacing,points=[];
    // A shared advancing tip draws all seven neighbouring grooves at the same time.
    for(let j=0;j<=Math.ceil(end*112);j++){
     const p=guide(Math.min(end,j/112));points.push({...p,x:p.x+p.nx*offset,y:p.y+p.ny*offset});
    }
    ctx.beginPath();for(let j=0;j<points.length;j++){const p=points[j];if(j)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);}
    ctx.strokeStyle=tint;ctx.lineCap='round';ctx.lineJoin='round';ctx.shadowColor='#86b9c5';ctx.shadowBlur=4*brushWidth;ctx.lineWidth=2.6*brushWidth;ctx.globalAlpha=.04*fade;ctx.stroke();
    ctx.shadowBlur=1.5*brushWidth;ctx.lineWidth=.9*brushWidth;ctx.globalAlpha=.17*fade;ctx.stroke();ctx.shadowBlur=0;
    // Grain positions stay attached to their grooves while a new stroke is revealed.
    for(let j=0;j<points.length;j+=3){const p=points[j];for(let k=0;k<2;k++){
     const n=tooth*2000+j*8+k*2,spread=(rand(id,n+20)-.5)*3.1*brushWidth,drift=(rand(id,n+21)-.5)*.7*brushWidth,size=(.40+rand(id,n+300)*.50)*brushWidth;
     ctx.globalAlpha=(.09+.17*rand(id,n+500))*fade;ctx.fillStyle=tint;
     ctx.fillRect(p.x+p.nx*spread-p.ny*drift,p.y+p.ny*spread+p.nx*drift,size,size*.8);
    }}
   }
  }
  ctx.globalAlpha=1;ctx.shadowBlur=0;
 }
}
