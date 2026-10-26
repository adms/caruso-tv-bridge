// Copyright (c) 2026 Adms Chung; SPDX-License-Identifier: Apache-2.0
// Rotate the disc wrapper so image breathing remains independent.
const record=document.querySelector('.record'),disc=record?.querySelector('.artwork-disc');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let spin=null,returning=null;
function angle(){const transform=getComputedStyle(disc).transform;if(transform==='none')return 0;const m=new DOMMatrixReadOnly(transform);return Math.atan2(m.b,m.a)*180/Math.PI;}
function update(){
 if(!disc)return;
 const playing=record.classList.contains('artwork-motion')&&!reduced.matches;
 if(playing){
  if(spin)return;
  const from=angle();returning?.cancel();returning=null;
  spin=disc.animate([{transform:`rotate(${from}deg)`},{transform:`rotate(${from+360}deg)`}],{duration:90000,iterations:Infinity,easing:'linear'});
  spin.id='vinyl-slow';
 }else if(spin||returning){
  if(!spin&&!reduced.matches)return;
  const from=angle();spin?.cancel();spin=null;returning?.cancel();returning=null;
  if(reduced.matches){disc.style.transform='rotate(0deg)';return;}
  const settle=disc.animate([{transform:`rotate(${from}deg)`},{transform:'rotate(0deg)'}],{duration:2400,easing:'cubic-bezier(.22,.61,.36,1)',fill:'forwards'});returning=settle;settle.id='vinyl-return-upright';
  settle.onfinish=()=>{if(returning!==settle)return;disc.style.transform='rotate(0deg)';settle.cancel();returning=null;};
 }
}
if(record&&disc){new MutationObserver(update).observe(record,{attributes:true,attributeFilter:['class']});reduced.addEventListener('change',update);update();}
