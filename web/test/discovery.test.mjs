// Copyright (c) 2026 Adms Chung; SPDX-License-Identifier: Apache-2.0
import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {privateDeviceHost,selectDiscovered,verifyCaruso,LanDiscovery} from '../discovery.mjs';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
test('discovery refuses public/loopback addresses and ambiguous targets; a saved identity wins over address reuse',()=>{
 for(const host of ['127.0.0.1','8.8.8.8','192.168.1.999','10.0.0.1;open x','example.com'])assert.equal(privateDeviceHost(host),false);
 const a={address:'10.0.0.2',identity:'a'},b={address:'10.0.0.3',identity:'b'};
 assert.equal(selectDiscovered([a,b]),null);assert.equal(selectDiscovered([a,b],{host:a.address,identity:'b'}),b);assert.equal(selectDiscovered([a],{identity:'b'}),null);
});
test('native identity query is read only, requires both master and optical proof, and always stops',async()=>{
 let stopped=0,started=0;const client=Object.assign(new EventEmitter(),{start(){started++;queueMicrotask(()=>{this.emit('state',{connected:true,maxVolume:63,masterVerified:true,opticalVerified:false});this.emit('state',{connected:true,maxVolume:63,masterVerified:true,opticalVerified:true});});},stop(){stopped++;}});
 assert.equal(await verifyCaruso('10.0.0.2',{factory:()=>client}),true);assert.equal(started,1);assert.equal(stopped,1);
 assert.equal(await verifyCaruso('8.8.8.8',{factory:()=>{throw Error('must not probe');}}),false);
});
test('Bonjour candidate is verified before address persistence/retarget; duplicate services do not send commands',async()=>{
 let cb,saves=0,retargets=[],probes=0;const c={host:'10.0.0.1',snapshot:()=>({nativeConnected:false}),setDiscovery(){},setHost(h){retargets.push(h);}};
 const native={start(f){cb=f;},stop(){}};const config={host:c.host,carusoIdentity:'device-a'};
 const d=new LanDiscovery(c,config,()=>{saves++;},{native,resolve:async()=>({address:'10.0.0.2'}),verify:async()=>{probes++;return true;}});d.start();
 cb({type:'service',host:'caruso.local.',name:'Caruso._airplay._tcp.local.',identity:'device-a'});cb({type:'service',host:'caruso.local.',name:'Caruso._http._tcp.local.'});cb({type:'finished'});await wait(20);d.stop();
 assert.deepEqual(retargets,['10.0.0.2']);assert.equal(saves,1);assert.equal(probes,1);assert.equal(config.host,'10.0.0.2');
});
test('policy denial is explicit; hostile DNS resolution and a stopped scan cannot retarget',async()=>{
 let cb,changed=0;const c={host:'10.0.0.1',snapshot:()=>({nativeConnected:false}),setDiscovery(){},setHost(){changed++;}};
 const d=new LanDiscovery(c,{host:c.host},()=>{changed++;},{native:{start(f){cb=f;},stop(){}},resolve:async()=>({address:'8.8.8.8'}),verify:async()=>{throw Error('must not probe');}});d.start();cb({type:'service',host:'caruso.local.',name:'Caruso._http._tcp.local.'});cb({type:'finished'});await wait(10);assert.equal(d.state.phase,'not-found');
 d.scan();cb({type:'error',code:-65570});assert.equal(d.state.phase,'permission');assert.equal(d.state.policyDenied,true);d.stop();cb({type:'finished'});await wait(10);assert.equal(changed,0);
});
