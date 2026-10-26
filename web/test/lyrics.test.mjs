// Copyright (c) 2026 Adms Chung; SPDX-License-Identifier: Apache-2.0
import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,stat,rm,writeFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {LyricsService} from '../lyrics.mjs';import {trackSignature,parseLrc,selectLyrics,lyricFrame,freshMedia,ambientFrame} from '../public/lyrics-sync.mjs';
const epoch=1800000000000;
const media=(more={})=>({connected:true,appId:'com.apple.TVMusic',deviceState:'Playing',observedAt:new Date(epoch).toISOString(),track:{title:'A Song',artist:'An Artist',album:'A Record',duration:120000,position:11000},...more});
const record=(more={})=>({id:42,trackName:'A Song',artistName:'An Artist',albumName:'A Record',duration:120,syncedLyrics:'[00:05.00]First line\n[00:20.00]Second line\n[00:30.00]\n[00:40.00]Last line',...more});
const response=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers});
const ready=async(service,m=media())=>{service.update(m);await service.pending;return service.snapshot();};
test('LRC timestamps retain empty instrumental gaps, merge simultaneous translation and multiple tags',()=>{
 const rows=parseLrc('[ar:someone]\n[00:05.25]Hello\n[00:05.25]你好\n[00:10][00:20]Again\n[00:30]\n[00:61]bad\n[90:00]outside',120);
 assert.deepEqual(rows,[{time:5.25,text:'Hello\n你好'},{time:10,text:'Again'},{time:20,text:'Again'},{time:30,text:''}]);assert.deepEqual(parseLrc('[offset:500]\n[00:01]Uncertain',120),[]);assert.deepEqual(parseLrc('Untimed text',120),[]);
});
test('matching requires title, artist and version duration; exact album is preferred',()=>{
 const sig=trackSignature(media());assert.equal(selectLyrics([record({artistName:'Wrong Artist'}),record({duration:125})],sig),null);
 assert.equal(selectLyrics([record({id:1,albumName:'Other'}),record({id:2})],sig).recordId,2);assert.equal(selectLyrics([record({syncedLyrics:null,instrumental:true})],sig).kind,'instrumental');
});
test('clock follows playback, pause, forward seek, backward seek and silent gaps',()=>{
 const lines=parseLrc(record().syncedLyrics,120);let m=media({track:{...media().track,position:10000}});assert.equal(lyricFrame(m,lines,epoch+1000).index,0);assert.equal(lyricFrame(m,lines,epoch+1000).position,11);
 m={...m,deviceState:'Paused'};assert.equal(lyricFrame(m,lines,epoch+4000).position,10);assert.equal(lyricFrame(m,lines,epoch+4000).moving,false);
 m=media({track:{...media().track,position:25000}});assert.equal(lyricFrame(m,lines,epoch).index,1);
 m=media({track:{...media().track,position:7000}});assert.equal(lyricFrame(m,lines,epoch).index,0);
 m=media({track:{...media().track,position:35000}});assert.equal(lyricFrame(m,lines,epoch).moving,false);
 assert.equal(lyricFrame(media(),lines,epoch+15000).fresh,false);assert.equal(lyricFrame(media(),lines,epoch+14000).position,14);
});
test('metadata validation rejects stale, disconnected, movie and invalid track data',()=>{
 assert.equal(freshMedia(media(),epoch+16000),false);assert.equal(freshMedia(media({connected:false}),epoch),false);assert.equal(trackSignature(media({appId:'com.netflix.Netflix'})),null);assert.equal(trackSignature(media({track:{...media().track,duration:Infinity}})),null);
});
test('lookup is fixed-provider, query-encoded, deduplicated and rejects redirects',async()=>{
 const calls=[];const service=new LyricsService({now:()=>epoch,fetchImpl:async(url,options)=>{calls.push({url,options});return response([record()]);}});
 assert.equal((await ready(service)).status,'ready');service.update(media());service.update(media());assert.equal(calls.length,1);assert.equal(new URL(calls[0].url).origin,'https://lrclib.net');assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.headers['User-Agent'].includes('CarusoRemote'),true);service.close();
});
test('late result cannot overwrite a changed song; no previous lyrics survive a miss',async()=>{
 let resolve;const service=new LyricsService({now:()=>epoch,fetchImpl:(url)=>new URL(url).searchParams.get('track_name')==='A Song'?new Promise(r=>{resolve=r;}):Promise.resolve(response([],404))});
 service.update(media());await new Promise(r=>setImmediate(r));const old=service.pending;const changed=media({track:{...media().track,title:'Different Song'}});service.update(changed);assert.equal(service.snapshot().lines.length,0);await service.pending;assert.equal(service.snapshot().status,'unavailable');resolve(response([record()]));await old;assert.equal(service.snapshot().key,trackSignature(changed).key);assert.equal(service.snapshot().lines.length,0);service.close();
});
test('provider errors honor retry-after, keep light data empty and do not hammer another song',async()=>{
 let now=epoch,calls=0;const service=new LyricsService({now:()=>now,fetchImpl:async()=>{calls++;return response({},503,{'retry-after':'120'});}});assert.equal((await ready(service)).status,'error');assert.equal(service.snapshot().retryAt,epoch+120000);
 await ready(service,media({track:{...media().track,title:'Another'}}));assert.equal(calls,1);assert.deepEqual(service.snapshot().lines,[]);service.close();
});
test('unmatched and untimed lyrics never become ready, including plain-lyrics-only results',async()=>{
 const service=new LyricsService({now:()=>epoch,fetchImpl:async(url)=>response(new URL(url).pathname.endsWith('search')?[record({syncedLyrics:null,plainLyrics:'No time codes'})]:record({syncedLyrics:null}))});assert.equal((await ready(service)).status,'unavailable');assert.deepEqual(service.snapshot().lines,[]);service.close();
});
test('oversized provider responses are bounded',async()=>{
 const service=new LyricsService({now:()=>epoch,fetchImpl:async()=>response({},200,{'content-length':'2000000'})});assert.equal((await ready(service)).status,'error');assert.deepEqual(service.snapshot().lines,[]);service.close();
});
test('successful lyrics cache survives restart privately and avoids network',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'caruso-lyrics-'));t.after(()=>rm(directory,{recursive:true,force:true}));const cacheFile=path.join(directory,'lyrics.json');let calls=0;
 const first=new LyricsService({cacheFile,now:()=>epoch,fetchImpl:async()=>{calls++;return response([record()]);}});await ready(first);assert.equal((await stat(cacheFile)).mode&0o777,0o600);first.close();
 const second=new LyricsService({cacheFile,now:()=>epoch,fetchImpl:async()=>{throw Error('Must use cache');}});assert.equal((await ready(second)).status,'ready');assert.equal(second.snapshot().cached,true);assert.equal(calls,1);second.close();
});

test('generated fallback is deterministic, visibly uses default tempo and pulses with the playback clock',()=>{
 const a=ambientFrame(media(),epoch),b=ambientFrame(media(),epoch+150);assert.equal(a.bpm,90);assert.equal(a.tempoSource,'default');assert.equal(a.active,true);assert.notDeepEqual(a.bars,b.bars);assert.deepEqual(a,ambientFrame(media(),epoch));assert.ok(a.bars.every(x=>x>=0&&x<=1));
});
test('fallback freezes on pause, stops on stale metadata and changes its seed on a different song',()=>{
 const paused=media({deviceState:'Paused'});assert.deepEqual(ambientFrame(paused,epoch).bars,ambientFrame(paused,epoch+1000).bars);assert.equal(ambientFrame(paused,epoch).playing,false);assert.equal(ambientFrame(media(),epoch+15000).active,false);assert.notDeepEqual(ambientFrame(media(),epoch).bars,ambientFrame(media({track:{...media().track,title:'Other song'}}),epoch).bars);
});
test('fallback can use provided tempo and respects reduced motion',()=>{
 const m=media({track:{...media().track,bpm:120}});assert.equal(ambientFrame(m,epoch).bpm,120);assert.equal(ambientFrame(m,epoch).tempoSource,'metadata');assert.deepEqual(ambientFrame(m,epoch,true).bars,ambientFrame(m,epoch+1000,true).bars);
});

test('breathing phrase has a high plateau, a slow release and a quiet gap instead of continuous waves',()=>{
 const at=beat=>ambientFrame(media({track:{...media().track,position:beat*60000/90}}),epoch);
 const rest=at(7.1),nextRest=at(7.8),peak=at(2),hold=at(2.6),release=at(4.8),start=at(8);
 assert.deepEqual(rest.bars,nextRest.bars);assert.deepEqual(rest.bars,start.bars);assert.deepEqual(peak.bars,hold.bars);
 assert.ok(Math.max(...peak.bars)>.7);assert.ok(Math.max(...peak.bars)-Math.min(...peak.bars)>.2);
 assert.ok(release.bars.every((v,i)=>v>rest.bars[i]&&v<peak.bars[i]));assert.equal(peak.flow,.5);
 // At a phrase boundary only the seed changes; the envelope is zero on both sides.
 assert.deepEqual(at(7.999).bars,at(8).bars);
});
test('breathing motion has no discontinuities at rise, hold and release boundaries',()=>{
 const at=beat=>ambientFrame(media({track:{...media().track,position:beat*60000/90}}),epoch).bars;
 for(const boundary of [0,1.76,2.88,6.56,8]){const a=at(Math.max(0,boundary-.001)),b=at(boundary+.001);assert.ok(a.every((x,i)=>Math.abs(x-b[i])<.002));}
});
