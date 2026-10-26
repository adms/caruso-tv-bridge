// Copyright (c) 2026 Adms Chung; SPDX-License-Identifier: Apache-2.0
import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {startServer} from '../server.mjs';
test('lyrics uses only current receiver metadata, authenticates reads and never controls playback',async t=>{
 let commands=0,calls=[];let state={power:true,sourceName:'OPTICAL',externalTransport:{metadata:{track:{title:'current'}}}};
 const client=Object.assign(new EventEmitter(),{start(){},stop(){},snapshot(){return state;},command(){commands++;}});const lyrics={update(media){calls.push(media);return {status:'unavailable',lines:[]};},close(){}};
 const server=await startServer({host:'10.0.0.1',port:0,client,lyrics});t.after(()=>server.close());const {token}=await(await fetch(server.url+'/api/state')).json();
 assert.equal((await fetch(server.url+'/api/lyrics')).status,403);assert.equal((await fetch(server.url+'/api/lyrics',{headers:{'x-caruso-token':token,origin:'https://attacker.test'}})).status,403);assert.equal(calls.length,0);
 const headers={'x-caruso-token':token};assert.equal((await fetch(server.url+'/api/lyrics?url=http://attacker.test',{headers})).status,200);assert.equal(calls[0].track.title,'current');
 state={...state,sourceName:'AIRPLAY'};await fetch(server.url+'/api/lyrics',{headers});assert.equal(calls.at(-1),null);state={...state,sourceName:'OPTICAL',power:false};await fetch(server.url+'/api/lyrics',{headers});assert.equal(calls.at(-1),null);assert.equal(commands,0);
});
