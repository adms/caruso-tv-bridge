// Copyright (c) 2026 Adms Chung; SPDX-License-Identifier: Apache-2.0
// JXA. Input is a JSON argument, never executable source or a shell command.
function run(argv) {
 const input=JSON.parse(argv[0]||'{}');
 const music=Application('com.apple.Music');
 const allowed=['devices','search','prepare','play','pause','next','previous'];
 if(!allowed.includes(input.action))return JSON.stringify({ok:false,code:'action'});
 try {
  if(input.action==='devices')return JSON.stringify({ok:true,devices:music.AirPlayDevices().filter(d=>d.available()&&d.supportsAudio()).map(d=>({name:d.name(),selected:d.selected(),active:d.active()}))});
  if(input.action==='search') {
   const query=String(input.query||'').trim();if(!query||query.length>120)return JSON.stringify({ok:false,code:'query'});
   const found=music.search(music.libraryPlaylists[0],{'for':query});
   return JSON.stringify({ok:true,tracks:found.slice(0,30).map(t=>({id:t.persistentID(),title:t.name(),artist:t.artist(),album:t.album()}))});
  }
  if(['pause','next','previous'].includes(input.action)) {
   const selected=music.currentAirPlayDevices().map(d=>d.name());
   if(!input.target||selected.length!==1||selected[0]!==input.target)return JSON.stringify({ok:false,code:'route'});
   if(input.action==='pause')music.pause();else if(input.action==='next')music.nextTrack();else music.previousTrack();
   return JSON.stringify({ok:true,state:music.playerState()});
  }
  const devices=music.AirPlayDevices().filter(d=>d.available()&&d.supportsAudio());
  const matches=devices.filter(d=>input.target?d.name()===input.target:/caruso/i.test(d.name()));
  if(matches.length!==1)return JSON.stringify({ok:false,code:'target'});
  // Resolve a library track before modifying output; no arbitrary URL playback.
  let track=null;
  if(input.id) {
   if(!/^[A-Fa-f0-9]{16}$/.test(input.id))return JSON.stringify({ok:false,code:'track'});
   const found=music.libraryPlaylists[0].tracks.whose({persistentID:input.id})();
   if(found.length!==1)return JSON.stringify({ok:false,code:'track'});track=found[0];
  } else {try {if(!music.currentTrack.persistentID())return JSON.stringify({ok:false,code:'empty'});} catch(_) {return JSON.stringify({ok:false,code:'empty'});}}
  music.currentAirPlayDevices=[matches[0]];
  const actual=music.currentAirPlayDevices().map(d=>d.name());
  if(actual.length!==1||actual[0]!==matches[0].name())return JSON.stringify({ok:false,code:'route'});
  if(input.action==='prepare')return JSON.stringify({ok:true,target:actual[0],ready:true});
  if(track)music.play(track);else music.play();
  delay(1);
  let current=null;try{current={title:music.currentTrack.name(),artist:music.currentTrack.artist()};}catch(_){}
  return JSON.stringify({ok:true,target:actual[0],state:music.playerState(),track:current});
 } catch(error) {
  // No raw Apple event exception text or library contents in logs.
  return JSON.stringify({ok:false,code:Number(error.errorNumber||error.number)===-1743?'permission':'application',number:Number(error.errorNumber||error.number)||null,name:String(error.name||'Error'),reason:String(error.message||error).slice(0,180)});
 }
}
