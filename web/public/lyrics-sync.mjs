// Copyright (c) 2026 Adms Chung; SPDX-License-Identifier: Apache-2.0
export const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[‘’]/g,"'").replace(/\s+/g,' ').trim();
export function trackSignature(media) {
 const t=media?.track;if(!t||!['com.apple.TVMusic','com.spotify.client'].includes(media.appId)||typeof t.title!=='string'||!t.title.trim()||typeof t.artist!=='string'||!t.artist.trim()||![t.duration,t.position].every(Number.isFinite)||t.duration<=0||t.duration>7200000||t.position<0||t.position>t.duration+2000)return null;
 if([t.title,t.artist,t.album||''].some(s=>typeof s!=='string'||s.length>500))return null;
 return {key:JSON.stringify([media.appId,t.title,t.artist,t.album||'',t.duration]),title:t.title,artist:t.artist,album:t.album||'',duration:t.duration/1000};
}
export function freshMedia(media, now=Date.now()) { const age=now-Date.parse(media?.observedAt);return !!(trackSignature(media)&&media.connected&&Number.isFinite(age)&&age>=-2000&&age<15000); }
export function parseLrc(value,duration) {
 if(typeof value!=='string'||value.length>200000||!Number.isFinite(duration))return [];
 // Nonzero global offsets have differing provider conventions: do not guess timing.
 if([...value.matchAll(/\[offset:\s*([+-]?\d+)\s*\]/gi)].some(m=>Number(m[1])!==0))return [];
 const rows=[];for(const raw of value.split(/\r?\n/).slice(0,2500)) {
  const tags=[...raw.matchAll(/\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g)];if(!tags.length)continue;
  const text=raw.slice(tags.at(-1).index+tags.at(-1)[0].length).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,500);
  for(const tag of tags){const time=Number(tag[1])*60+Number(tag[2])+Number('0.'+(tag[3]||'0'));if(time>=0&&time<=duration+2)rows.push({time,text});}
 }
 rows.sort((a,b)=>a.time-b.time);const lines=[];
 for(const row of rows.slice(0,2000)){const prev=lines.at(-1);if(prev?.time===row.time){if(row.text&&row.text!==prev.text)prev.text=[prev.text,row.text].filter(Boolean).join('\n').slice(0,500);}else lines.push(row);}
 return lines.some(l=>l.text)?lines:[];
}
export function selectLyrics(records, signature) {
 if(!Array.isArray(records)||!signature)return null;
 const matches=records.slice(0,20).filter(r=>r&&normalize(r.trackName)===normalize(signature.title)&&normalize(r.artistName)===normalize(signature.artist)&&Number.isFinite(r.duration)&&Math.abs(r.duration-signature.duration)<=2);
 matches.sort((a,b)=>Number(normalize(b.albumName)===normalize(signature.album))-Number(normalize(a.albumName)===normalize(signature.album))||Math.abs(a.duration-signature.duration)-Math.abs(b.duration-signature.duration));
 for(const r of matches){const lines=parseLrc(r.syncedLyrics,signature.duration);if(lines.length)return {kind:'ready',lines,recordId:Number.isSafeInteger(r.id)?r.id:null};}
 if(matches.some(r=>r.instrumental===true))return {kind:'instrumental',lines:[]};
 return null;
}
export function lyricFrame(media,lines,now=Date.now()) {
 if(!freshMedia(media,now))return {fresh:false,index:-1,position:0,progress:0,moving:false};
 const age=Math.max(0,now-Date.parse(media.observedAt));const playing=media.deviceState==='Playing';const duration=media.track.duration/1000;
 const position=Math.max(0,Math.min(duration,media.track.position/1000+(playing?Math.min(age/1000,3):0)));
 let lo=0,hi=lines.length;while(lo<hi){const mid=(lo+hi)>>1;if(lines[mid].time<=position)lo=mid+1;else hi=mid;}
 const index=lo-1,line=lines[index],end=lines[index+1]?.time??duration;
 return {fresh:true,index,position,progress:line?Math.max(0,Math.min(1,(position-line.time)/Math.max(.01,end-line.time))):0,moving:!!(playing&&line?.text&&position<duration)};
}
// Generated ambience: the beat rate is explicit, never presented as measured audio energy.
export function ambientFrame(media,now=Date.now(),reduced=false) {
 const frame=lyricFrame(media,[],now);if(!frame.fresh)return {active:false,playing:false,bars:Array(24).fill(0),flow:0,bpm:90,tempoSource:'default'};
 const supplied=media.track.bpm;const known=Number.isFinite(supplied)&&supplied>=30&&supplied<=240;const bpm=known?supplied:90;
 // Two bars of 4/4: rise, hold, release, then a quiet gap. No traveling sine wave.
 const beat=frame.position*bpm/60,phrase=Math.floor(beat/8),phase=(beat%8)/8;
 let seed=2166136261;for(const c of trackSignature(media).key)seed=Math.imul(seed^c.charCodeAt(0),16777619);
 const random=i=>{let n=(seed^Math.imul(reduced?1:phrase+1,1597334677)^Math.imul(i+1,3812015801))>>>0;n=Math.imul(n^(n>>>16),2246822507);n=Math.imul(n^(n>>>13),3266489909);return ((n^(n>>>16))>>>0)/4294967296;};
 const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
 const envelope=reduced?.5:phase<.22?smooth(phase/.22):phase<.36?1:phase<.82?1-smooth((phase-.36)/.46):0;
 // Neighbouring bars form small tonal groups; each phrase gets a new, stable silhouette.
 const bars=Array.from({length:24},(_,i)=>{
  const group=Math.floor(i/4),peak=.24+.68*random(group),detail=.78+.22*random(i+10);
  return .065+peak*detail*envelope;
 });
 return {active:true,position:frame.position,playing:media.deviceState==='Playing'&&frame.position<media.track.duration/1000,bars,flow:.5,bpm,tempoSource:known?'metadata':'default',energy:envelope};
}
