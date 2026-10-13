// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { startServer } from '../server.mjs';
class Fake extends EventEmitter {
  calls=[];start(){}stop(){}snapshot(){return {host:'10.0.0.123',connected:true,volume:23};}
  async command(action,value){this.calls.push({action,value});return this.snapshot();}
}
test('web control requires same origin, correct host and per-session token',async t=>{
  const client=new Fake(),s=await startServer({host:'10.0.0.123',port:0,client});t.after(()=>s.close());
  assert.equal((await fetch(s.url)).status,200);
  const {token}=await (await fetch(s.url+'/api/state')).json();
  const post=(extra={},body={action:'volume',value:23})=>fetch(s.url+'/api/command',{method:'POST',headers:{'Content-Type':'application/json',...extra},body:JSON.stringify(body)});
  assert.equal((await post()).status,403);
  assert.equal((await post({'X-Caruso-Token':token,Origin:'https://example.com'})).status,403);
  assert.equal((await post({'X-Caruso-Token':token,'Sec-Fetch-Site':'cross-site'})).status,403);
  assert.equal(client.calls.length,0);
  assert.equal((await post({'X-Caruso-Token':token,Origin:s.url})).status,200);
  assert.equal(client.calls.length,1);
  const badHost=await new Promise((resolve,reject)=>{const req=http.get(s.url+'/api/state',{headers:{Host:'evil.test'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});
  assert.equal(badHost,403);
});
test('controller never targets a public IPv4 address',async()=>{await assert.rejects(startServer({host:'8.8.8.8',port:0}),/private IPv4/);});

test('missing device address cannot silently connect to a default',async()=>{const previous=process.env.CARUSO_HOST;delete process.env.CARUSO_HOST;try{await assert.rejects(startServer({port:0}),/Set CARUSO_HOST/);}finally{if(previous!==undefined)process.env.CARUSO_HOST=previous;}});
