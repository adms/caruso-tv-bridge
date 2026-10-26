// Copyright (c) 2026 Adms Chung; SPDX-License-Identifier: Apache-2.0
import test from 'node:test';import assert from 'node:assert/strict';import {KnobMute} from '../knob-mute.mjs';import {Knob} from '../knob.mjs';
function fixture(extra={}){
 const state={host:'10.0.0.1',nativeConnected:true,power:true,sourceId:49676,nativeVolumeSeenAt:new Date().toISOString(),volume:40,nativeVolume:25,...extra},calls=[],reports=[],persisted=[];
 // LUCI does not control the optical amplifier; only nativeVolume can mute it.
 const controller={snapshot:()=>({...state}),setAccessory:v=>reports.push(v),async command(action,value){calls.push([action,value]);if(action==='volume')state.volume=value;if(action==='nativeVolume')state.nativeVolume=value;if(action==='volumeStep')state.nativeVolume+=value;return {...state};}};
 return {state,calls,reports,persisted,controller,mute:new KnobMute(controller,{persist:v=>persisted.push(v)})};
}
const mutations=f=>f.calls.filter(x=>x[0]!=='refresh');
test('press mutes optical amplifier with one native write and restores its observed volume',async()=>{
 const f=fixture();await f.mute.toggle();assert.equal(f.state.nativeVolume,0);assert.equal(f.reports.at(-1).knobMuted,true);await f.mute.toggle();assert.equal(f.state.nativeVolume,25);assert.equal(f.state.volume,40);assert.equal(f.reports.at(-1).knobMuted,false);assert.deepEqual(mutations(f),[['nativeVolume',0],['nativeVolume',25]]);assert.equal(f.persisted.at(-1),null);
});
test('in-flight presses cannot duplicate a mute write',async()=>{
 const f=fixture();let release,started;const ready=new Promise(r=>started=r),normal=f.controller.command;f.controller.command=async(a,v)=>{if(a==='nativeVolume'){started();await new Promise(r=>release=r);}return normal(a,v);};const first=f.mute.toggle();await ready;await f.mute.toggle();release();await first;assert.equal(mutations(f).length,1);
});
test('unknown zero, standby or disconnected native state cannot invent restore volume or wake receiver',async()=>{
 for(const extra of [{nativeVolume:0},{power:false},{nativeConnected:false},{nativeVolume:null},{nativeVolumeSeenAt:null},{nativeVolumeSeenAt:new Date(Date.now()-18000).toISOString()}]){const f=fixture(extra);await f.mute.toggle();assert.equal(mutations(f).length,0);}
});
test('uncertain acknowledgement is never automatically retried and next explicit press can restore from zero',async()=>{
 const f=fixture();const normal=f.controller.command;let failed=false;f.controller.command=async(a,v)=>{const result=await normal(a,v);if(!failed&&a==='nativeVolume'){failed=true;throw Error('confirmation unavailable');}return result;};await f.mute.toggle();assert.equal(mutations(f).length,1);assert.ok(f.mute.saved);await f.mute.toggle();assert.equal(f.state.nativeVolume,25);assert.equal(f.mute.saved,null);
});
test('restore survives reconstruction but never raises a different device from zero',async()=>{
 const f=fixture();await f.mute.toggle();await new KnobMute(f.controller,{saved:f.mute.saved}).toggle();assert.equal(f.state.nativeVolume,25);
 const g=fixture({nativeVolume:0});await new KnobMute(g.controller,{saved:{host:'10.0.0.3',nativeVolume:50}}).toggle();assert.equal(mutations(g).length,0);
});
test('external volume changes replace old restore memory instead of restoring a stale level',async()=>{
 const f=fixture();await f.mute.toggle();f.state.nativeVolume=30;await f.mute.toggle();assert.equal(f.mute.saved.nativeVolume,30);await f.mute.toggle();assert.equal(f.state.nativeVolume,30);
});
test('held press is suppressed and rotation after mute cancels restore and adjusts from zero',async()=>{
 const f=fixture(),knob=new Knob(f.controller,f.mute,{pushUsage:226});knob.receive({type:'key',usage:226,down:true});knob.receive({type:'key',usage:226,down:true});while(f.mute.busy)await new Promise(r=>setImmediate(r));assert.deepEqual(mutations(f),[['nativeVolume',0]]);knob.receive({type:'key',usage:233,down:true});while(knob.running)await new Promise(r=>setImmediate(r));assert.equal(f.mute.saved,null);assert.equal(f.state.nativeVolume,1);assert.deepEqual(f.calls.at(-1),['volumeStep',1]);
});
test('mismatched native volume acknowledgement cannot publish successful mute or retry',async()=>{
 const f=fixture();f.controller.command=async(a,v)=>f.calls.push([a,v]);await f.mute.toggle();assert.match(f.reports.at(-1).status,/尚未確認/);assert.equal(f.reports.at(-1).knobMuted,false);assert.equal(mutations(f).length,1);
});
