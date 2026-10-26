// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {TvMessages} from '../tv-messages.mjs';import {startServer} from '../server.mjs';
const secret='A'.repeat(43)+'=';
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
test('pair credential stays server-side, persists once and survives new controller',async()=>{
 const config={tvHost:'10.0.0.124'};let writes=0,calls=[];
 const fetcher=async(url,options)=>{calls.push({url,options});return response(url.endsWith('/pair')?{token:secret}:{ready:true,overlayPermission:true,speechReady:true,speechState:'ready'});};
 const c=new TvMessages(config,()=>{writes++;},{fetcher});assert.equal((await c.status()).paired,false);assert.equal(calls.length,0);
 await assert.rejects(c.pair('abc'),/六位數/);assert.equal(calls.length,0);
 const result=await c.pair('123456');assert.deepEqual(result,{paired:true});assert.equal(config.tvMessageToken,secret);assert.equal(writes,1);assert.equal(calls[0].options.headers.Authorization,undefined);
 const restarted=new TvMessages(config,()=>{},{fetcher});const s=await restarted.status();assert.equal(s.connected,true);assert.equal(JSON.stringify(s).includes(secret),false);assert.equal(calls.at(-1).options.headers.Authorization,'Bearer '+secret);
});
test('messages validate text and options before any request; never replay an uncertain send',async()=>{
 let calls=0;const c=new TvMessages({tvHost:'10.0.0.124',tvMessageToken:secret},()=>{},{fetcher:async()=>{calls++;throw Error('timeout');}});
 for(const body of [{text:''},{text:'x'.repeat(281)},{text:'a',seconds:0},{text:'a',speechVolume:2},{text:'a',display:false,speak:false},{text:'a\0b'}])await assert.rejects(c.send(body));assert.equal(calls,0);
 await assert.rejects(c.send({text:'晚餐好了'}),/timeout/);assert.equal(calls,1);
});
test('paired messages carry independent speech level and request id, never device control commands',async()=>{
 let body;const c=new TvMessages({tvHost:'10.0.0.124',tvMessageToken:secret},()=>{},{fetcher:async(url,options)=>{assert.ok(url.endsWith('/message'));body=JSON.parse(options.body);return response({accepted:true,display:true,speechQueued:true});}});
 assert.deepEqual(await c.send({text:'晚餐好了',speechVolume:.4}),{accepted:true,display:true,speechQueued:true});assert.equal(body.speechVolume,.4);assert.match(body.requestId,/^[\da-f-]{36}$/);assert.equal(body.action,undefined);
});
test('remote receiver only accepts private configured IPv4, no redirect following',async()=>{
 let called=false;const fetcher=async(_url,options)=>{called=true;assert.equal(options.redirect,'error');return response({token:secret});};
 await assert.rejects(new TvMessages({tvHost:'8.8.8.8'},()=>{},{fetcher}).pair('123456'),/私有/);assert.equal(called,false);
 await new TvMessages({tvHost:'10.0.0.124'},()=>{},{fetcher}).pair('123456');assert.equal(called,true);
});
test('message API retains origin/token guards and never invokes Caruso commands',async t=>{
 let calls=0;const client=Object.assign(new EventEmitter(),{start(){},stop(){},snapshot(){return {};},command(){throw Error('Caruso must not be used');}});
 const messages={async status(){return {paired:false};},async send(){calls++;return {accepted:true};}};
 const server=await startServer({host:'10.0.0.123',port:0,client,messages});t.after(()=>server.close());
 assert.equal((await fetch(server.url+'/messages')).status,200);const {token}=await (await fetch(server.url+'/api/state')).json();
 const post=headers=>fetch(server.url+'/api/tv-message',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({action:'send',text:'hello'})});
 assert.equal((await post({})).status,403);assert.equal((await post({'X-Caruso-Token':token,Origin:'https://evil.test'})).status,403);assert.equal(calls,0);
 assert.equal((await post({'X-Caruso-Token':token})).status,200);assert.equal(calls,1);
});
