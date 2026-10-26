// Copyright (c) 2026 Adms Chung; SPDX-License-Identifier: Apache-2.0
import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {startServer} from '../server.mjs';
test('music HTTP control requires same-origin host, session token and bounded JSON',async t=>{
 const client=Object.assign(new EventEmitter(),{start(){},stop(){},snapshot(){return {};}});const calls=[];const server=await startServer({host:'10.0.0.1',port:0,client,music:async data=>{calls.push(data);return {ok:true,devices:[]};}});t.after(()=>server.close());const base=server.url;const {token}=await (await fetch(base+'/api/state')).json();
 const post=(body,headers={})=>fetch(base+'/api/music',{method:'POST',headers:{'content-type':'application/json','x-caruso-token':token,...headers},body});
 assert.equal((await post('{}',{'x-caruso-token':'wrong'})).status,403);assert.equal((await post('{}',{origin:'https://attacker.test'})).status,403);assert.equal((await post('x'.repeat(2049))).status,413);assert.equal(calls.length,0);
 assert.equal((await post(JSON.stringify({action:'devices',provider:'apple'}))).status,200);assert.equal(calls.length,1);
});
