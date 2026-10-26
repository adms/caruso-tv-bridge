// Copyright (c) 2026 Adms Chung; SPDX-License-Identifier: Apache-2.0
import test from 'node:test';import assert from 'node:assert/strict';import {SandClock,rippleGuide,SandPacing,brushStyle} from '../public/zen-sand.mjs';
const frame=(extra={})=>({position:10,bpm:90,playing:true,...extra});
test('sand keeps drawing between metadata polls, even after the lyric extrapolation cap',()=>{
 const c=new SandClock();const first=c.step(frame(), 'song',0);let beat;
 for(let ms=100;ms<=5000;ms+=100)beat=c.step(frame({position:13}),'song',ms);
 assert.ok(Math.abs(beat-first-7.5)<.00001);
});
test('sand drawing rate follows supplied BPM and pauses without advancing or catching up',()=>{
 const run=bpm=>{const c=new SandClock();const start=c.step(frame({bpm}),'song',0);let beat;for(let ms=100;ms<=1000;ms+=100)beat=c.step(frame({bpm}),'song',ms);return beat-start;};
 assert.ok(Math.abs(run(120)/run(60)-2)<.00001);
 const c=new SandClock();c.step(frame(),'song',0);const before=c.step(frame(),'song',100);assert.equal(c.step(frame({playing:false}),'song',500),before);assert.equal(c.step(frame({playing:false}),'song',1500),before);assert.ok(Math.abs(c.step(frame(),'song',1600)-before-.15)<.00001);
});
test('sand clock follows deliberate seeks and resets its history on a different song',()=>{
 const c=new SandClock();c.step(frame(),'one',0);assert.equal(c.step(frame({position:30}),'one',100),45);assert.equal(c.step(frame({position:5}),'one',200),7.5);assert.equal(c.step(frame({position:0}),'two',300),0);c.reset();assert.equal(c.step(frame({position:2}),'two',400),3);
});

test('every rake groove enters and finishes outside the canvas, for random-sized arcs and ripples',()=>{
 for(const width of [200,500,1220])for(const height of [38,52,76])for(let seed=0;seed<80;seed++){
  const p={width,height,arc:seed%2===0,base:height*.5,amplitude:height*(.3+seed/22)*(seed%3?-1:1),frequency:.45+seed/50,phase:seed*.47,tilt:height*(seed%7-3)/6};
  for(const tooth of [-3,-2,-1,0,1,2,3]){const offset=tooth*12.6,start=rippleGuide(0,p),end=rippleGuide(1,p);assert.ok(start.x+start.nx*offset<-20);assert.ok(end.x+end.nx*offset>width+20);}
 }
});

test('each stroke has a stable random speed and width between one and three times baseline',()=>{
 const styles=Array.from({length:300},(_,i)=>brushStyle(4321,i));
 for(const style of styles){assert.ok(style.speed>=1&&style.speed<=3);assert.ok(style.width>=1&&style.width<=3);}
 assert.ok(styles.some(s=>s.speed<1.25)&&styles.some(s=>s.speed>2.75));assert.ok(styles.some(s=>s.width<1.25)&&styles.some(s=>s.width>2.75));assert.deepEqual(brushStyle(4321,12),brushStyle(4321,12));assert.notDeepEqual(brushStyle(4321,12),brushStyle(4321,13));
});
test('random pacing completes strokes at their selected speed and preserves style across pauses and seeks',()=>{
 const p=new SandPacing(4321),first=brushStyle(4321,0),duration=4/first.speed;
 const half=p.at(duration/2);assert.equal(half.stroke,0);assert.ok(Math.abs(half.progress-.5)<1e-10);assert.equal(half.speed,first.speed);assert.equal(half.width,first.width);
 const next=p.at(duration+4/brushStyle(4321,1).speed/2);assert.equal(next.stroke,1);assert.ok(Math.abs(next.progress-.5)<1e-10);assert.deepEqual(p.at(duration/2),half);assert.deepEqual(p.at(duration/2),half);
 const later=p.at(100);assert.deepEqual(new SandPacing(4321).at(100),later);
});
