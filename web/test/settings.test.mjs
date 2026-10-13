// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { settingsView, observation, inspectBackup, backupDigest, FIELDS } from '../settings.mjs';
import { startServer } from '../server.mjs';
class ReadOnlyDevice extends EventEmitter {
 calls=[];start(){}stop(){}snapshot(){return {host:'10.0.0.123',connected:true,volume:68,lastSeen:'2000-01-01T00:00:00Z'};}
 async command(action,value){this.calls.push({action,value});throw Error('Unexpected device write');}
}
test('unknown sound settings remain unknown, never zero or false defaults',()=>{
 const s=settingsView({host:'10.0.0.123',connected:true});assert.equal(s.coverage.verified,0);assert.equal(s.fields.length,14);
 assert.ok(s.fields.every(f=>f.value===null&&f.status==='not-read'&&!f.writable));assert.equal(s.capabilities.restoreAudioSettings,false);
});
test('observation export explicitly cannot be used as a sound-settings backup',()=>{
 const o=observation({host:'10.0.0.123',volume:68});assert.equal(o.restorable,false);assert.equal(o.kind,'observation-not-backup');assert.equal(inspectBackup(o).canRestore,false);assert.equal(inspectBackup(o).valid,false);
});
test('complete-looking file is only a file check and never unlocks device restore',()=>{
 const f={schema:'caruso-audio-backup/v1',complete:true,device:{serial:'TEST-ONLY',modelReference:'TEST',firmware:'TEST'},settings:Object.fromEntries(FIELDS.map(([id])=>[id,'test-only']))};
 f.integrity={algorithm:'sha256',value:backupDigest(f)};const r=inspectBackup(f);assert.equal(r.valid,true);assert.equal(r.canRestore,false);assert.equal(r.identityVerified,false);
 f.settings.bass='modified';assert.equal(inspectBackup(f).valid,false);
});
test('settings browsing, observation export and backup import never call device commands',async t=>{
 const client=new ReadOnlyDevice(),app=await startServer({host:'10.0.0.123',port:0,client});t.after(()=>app.close());
 const state=await(await fetch(app.url+'/api/state')).json();
 for(const route of ['/settings','/settings.js','/api/settings','/api/settings/observation'])assert.equal((await fetch(app.url+route)).status,200);
 const r=await fetch(app.url+'/api/settings/inspect-backup',{method:'POST',headers:{'Content-Type':'application/json','X-Caruso-Token':state.token},body:JSON.stringify(observation(client.snapshot()))});
 assert.equal(r.status,200);assert.equal((await r.json()).canRestore,false);assert.deepEqual(client.calls,[]);
});
test('both direct restore and fake complete backups remain blocked at the server',async t=>{
 const client=new ReadOnlyDevice(),app=await startServer({host:'10.0.0.123',port:0,client});t.after(()=>app.close());
 const {token}=await(await fetch(app.url+'/api/state')).json();
 for(const route of ['/api/settings/backup','/api/settings/restore'])for(const method of ['GET','POST','PUT']){
  const r=await fetch(app.url+route,{method,headers:{'X-Caruso-Token':token}});assert.equal(r.status,409);
 }
 assert.deepEqual(client.calls,[]);
});
test('backup inspection rejects missing session token without touching device',async t=>{
 const client=new ReadOnlyDevice(),app=await startServer({host:'10.0.0.123',port:0,client});t.after(()=>app.close());
 const r=await fetch(app.url+'/api/settings/inspect-backup',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,403);assert.deepEqual(client.calls,[]);
});
