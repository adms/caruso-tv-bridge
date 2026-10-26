// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {EventEmitter} from 'node:events';
import {frame,Decoder,accept,McuClient} from '../mcu.mjs';
import {capabilities,DeviceController} from '../device-controller.mjs';
import {Knob} from '../knob.mjs';
import {GroupPower} from '../sony.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function reply(source,info,data){const p=frame(0xee,0x3f,Buffer.from([source>>8,source&255,info,...data]));p[2]=0xc2;p[p.length-1]=p.subarray(0,-1).reduce((a,b)=>a+b,0)&255;return p;}
test('MCU fragmented replies, extended commands, checksum and descriptor identity',()=>{
 assert.equal(frame(0,0x3f).toString('hex'),'a900ee013fd7');
 assert.equal(frame(0xc2,0x1a8)[4],0xa8);assert.equal(frame(0xc2,0x1a8)[5],1);
 const p=reply(0xc20c,1,[0x5e,...Buffer.from('OPTICAL')]),d=new Decoder();assert.deepEqual(d.push(p.subarray(0,3)),[]);
 const state={sources:{}};accept(state,d.push(p.subarray(3))[0]);assert.equal(state.opticalVerified,true);assert.equal(state.sources[0xc20c].command,0xde);
 const broken=Buffer.from(p);broken[6]^=1;assert.throws(()=>new Decoder().push(broken),/checksum/);
 const ext=reply(0xc214,0x81,[0xa8,1,...Buffer.from('Spotify')]);accept(state,new Decoder().push(ext)[0]);assert.equal(state.sources[0xc214].command,0x1a8);
});
test('transport stays blocked for standby, stale status, optical and unknown sources',()=>{
 const n={connected:true,on:true,lastSeen:new Date().toISOString(),sourceId:0xc20c,sources:[{id:0xc20c,name:'OPTICAL'}]};
 assert.equal(capabilities(n).canTransport,false);assert.match(capabilities(n).transportReason,/光纖/);
 assert.equal(capabilities({...n,sourceId:0xc214}).canTransport,true);
 assert.equal(capabilities({...n,on:false,sourceId:0xc214}).canTransport,false);
 assert.equal(capabilities({...n,lastSeen:'2000-01-01',sourceId:0xc214}).canTransport,false);
 assert.equal(capabilities({...n,sourceId:1}).canTransport,false);
});
test('backend refuses optical transport before writing LUCI command',async()=>{
 const media=Object.assign(new EventEmitter(),{snapshot:()=>({connected:true}),command:()=>{throw Error('must not reach media')}});
 const native=Object.assign(new EventEmitter(),{snapshot:()=>({connected:true,on:true,lastSeen:new Date().toISOString(),sourceId:0xc20c}),refresh:async()=>{}});
 await assert.rejects(new DeviceController('10.0.0.1',{media,native}).command('PLAY'),/光纖/);
});
test('knob holds trigger the configured press action once and reject unrelated usages',async()=>{
 let toggles=0;const steps=[],controller={setAccessory(){},async command(a,d){steps.push([a,d]);}};
 const knob=new Knob(controller,{toggle(){toggles++;}},{pushUsage:0xe2});
 knob.receive({type:'key',usage:0xe2,down:true});knob.receive({type:'key',usage:0xe2,down:true});assert.equal(toggles,1);
 knob.receive({type:'key',usage:0xe2,down:false});knob.receive({type:'key',usage:0xe2,down:true});assert.equal(toggles,2);
 knob.receive({type:'key',usage:0xcd,down:true});assert.equal(toggles,2);
 knob.receive({type:'key',usage:0xea,down:true});await delay(0);assert.deepEqual(steps,[['volumeStep',-1]]);
});
test('group power fails closed when TV power is unknown',async()=>{
 let writes=0,status;const c={setAccessory(v){status=v.status;},command(){writes++;}};
 const g=new GroupPower({async status(){throw Error('TV unavailable');},async setPower(){writes++;}},c,{delayFn:async()=>{}});
 await g.toggle();assert.equal(writes,0);assert.equal(status,'TV unavailable');
});
test('group waits for existing bridge and avoids duplicate Caruso toggle',async()=>{
 const calls=[];let on=true;const c={setAccessory(){},async command(a,v){calls.push([a,v]);},snapshot(){return {power:false};}};
 const tv={async status(){return {on,method:'sony'};},async setPower(v){on=v;}};
 const g=new GroupPower(tv,c,{delayFn:async()=>{}});await Promise.all([g.toggle(),g.toggle()]);assert.deepEqual(calls,[['refresh',undefined]]);
});
test('cached power-on settles to off; already-off sends no power mutation',async t=>{
 const mutations=[];const server=net.createServer(socket=>{const d=new Decoder();socket.on('data',bytes=>{for(const p of d.push(bytes)){if(!p.data)continue;if(p.command===0x3f){socket.write(Buffer.concat([reply(0xc20c,1,[0x5e,...Buffer.from('OPTICAL')]),reply(0xc200,5,[20,0,63]),reply(0xc20c,8,[]),reply(0xc200,2,[128,0,2])]));setTimeout(()=>{if(!socket.destroyed)socket.write(reply(0xc200,2,[0,0,2]));},200);}else{mutations.push(p.command);socket.write(Buffer.from([0x99]));}}});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const c=new McuClient('127.0.0.1',{port:server.address().port});t.after(()=>{c.stop();server.close();});c.start();await c.wait(()=>c.ready());assert.equal(c.snapshot().on,false);await c.command('power',false);assert.deepEqual(mutations,[]);
 await assert.rejects(c.command('source',1234),/Unknown source/);assert.deepEqual(mutations,[]);
});
test('unknown TV power only attempts explicit wake and never powers receiver without confirmation',async()=>{
 let wakes=0,writes=0,status;const c={setAccessory(v){status=v.status;},command(){writes++;}};
 const tv={mac:'00:00:00:00:00:00',async status(){throw Error('unreachable');},async wake(){wakes++;}};
 await new GroupPower(tv,c,{delayFn:async()=>{}}).toggle();assert.equal(wakes,1);assert.equal(writes,0);assert.match(status,/未操作音響/);
});
test('power ACK without reported power change never counts as confirmation or retries',async t=>{
 const mutations=[];const server=net.createServer(socket=>{const decoder=new Decoder();socket.on('data',bytes=>{for(const p of decoder.push(bytes)){if(!p.data)continue;if(p.command===0x3f)socket.write(Buffer.concat([reply(0xc20c,1,[0x5e,...Buffer.from('OPTICAL')]),reply(0xc200,5,[20,0,63]),reply(0xc20c,8,[]),reply(0xc200,2,[0,0,2])]));else{mutations.push(p.command);socket.write(Buffer.from([0x99]));}}});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const client=new McuClient('127.0.0.1',{port:server.address().port});t.after(()=>{client.stop();server.close();});const wait=client.wait.bind(client);client.wait=(fn,ms)=>wait(fn,ms===8000?80:ms);client.start();await assert.rejects(client.command('power',true),/confirmation/);assert.deepEqual(mutations,[0xd7]);
});
test('USB listener checks permission in the app, never requests at startup, and observes later grants',()=>{
 let granted=false,requests=0,stops=0;const states=[];const api={start(_v,_p,callback){callback({type:'ready',granted});},stop(){stops++;},checkAccess(){return granted;},requestAccess(){requests++;granted=true;}};
 const controller={setAccessory(v){states.push(v);}};const knob=new Knob(controller,{toggle(){}},{api,vendor:1,product:2});
 try{knob.start();assert.equal(requests,0);knob.requestPermission();assert.equal(requests,1);assert.equal(states.at(-1).permissionGranted,true);knob.restart();assert.equal(requests,1);}finally{knob.stop();}assert.ok(stops>=2);
});
test('known source selection wakes standby then selects; unknown source never wakes',async()=>{
 const calls=[];const media=Object.assign(new EventEmitter(),{snapshot:()=>({})});const native=Object.assign(new EventEmitter(),{snapshot:()=>({connected:true,on:false,sources:[{id:0xc20c,name:'OPTICAL'}]}),async refresh(){},async command(a,v){calls.push([a,v]);}});
 const controller=new DeviceController('10.0.0.1',{media,native});await assert.rejects(controller.command('source',1),/未知/);assert.deepEqual(calls,[]);await controller.command('source',0xc20c);assert.deepEqual(calls,[['power',true],['source',0xc20c]]);
});

test('scoped consumer listener works without global keyboard monitoring and only asks when its open fails',()=>{
 const states=[];let callback,requests=0;const api={start(_v,_p,cb){callback=cb;cb({type:'ready',granted:false});cb({type:'opened',granted:true});cb({type:'device',connected:true});},stop(){},checkAccess(){return false;},requestAccess(){requests++;}};const knob=new Knob({setAccessory(value){states.push(value);}}, {toggle(){}},{api,vendor:1,product:2});
 try{knob.start();assert.equal(knob.listenerReady,true);assert.equal(knob.deviceConnected,true);assert.equal(states.at(-1).inputPermissionNeeded,false);knob.syncPermission();assert.equal(states.at(-1).inputPermissionNeeded,false);assert.equal(requests,0);callback({type:'openError'});assert.equal(states.at(-1).inputPermissionNeeded,true);}finally{knob.stop();}
});

test('native status decodes actual amplifier mute without changing volume',()=>{
 const s={sources:{},volume:25};const decoder=new Decoder();accept(s,decoder.push(reply(0xc200,2,[132,0,2]))[0]);assert.equal(s.muted,true);assert.equal(s.on,true);assert.equal(s.volume,25);accept(s,decoder.push(reply(0xc200,2,[128,0,2]))[0]);assert.equal(s.muted,false);
});
test('native absolute volume uses one target byte, is idempotent and never treats ACK alone as confirmation',async t=>{
 let volume=25,confirm=true;const mutations=[];const server=net.createServer(socket=>{const decoder=new Decoder();socket.on('data',bytes=>{for(const p of decoder.push(bytes)){if(!p.data)continue;if(p.command===0x3f)socket.write(Buffer.concat([reply(0xc20c,1,[0x5e,...Buffer.from('OPTICAL')]),reply(0xc200,5,[volume,0,63]),reply(0xc20c,8,[]),reply(0xc200,2,[128,0,2])]));else{mutations.push({command:p.command,data:[...p.data]});socket.write(Buffer.from([0x99]));if(p.command===0xa0&&p.data.length===1&&confirm)volume=p.data[0];}}});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const c=new McuClient('127.0.0.1',{port:server.address().port});t.after(()=>{c.stop();server.close();});c.start();await c.wait(()=>c.ready());await c.command('nativeVolume',25);assert.deepEqual(mutations,[]);await c.command('nativeVolume',0);assert.equal(c.snapshot().volume,0);await c.command('nativeVolume',25);assert.equal(c.snapshot().volume,25);assert.deepEqual(mutations,[{command:0xa0,data:[0]},{command:0xa0,data:[25]}]);await assert.rejects(c.command('nativeVolume',64),/range/);assert.equal(mutations.length,2);confirm=false;const wait=c.wait.bind(c);c.wait=(fn,ms)=>wait(fn,ms===8000?80:ms);await assert.rejects(c.command('nativeVolume',0),/confirmation/);assert.equal(mutations.length,3);
});
