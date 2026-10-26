// Copyright (c) 2026 Adms Chung; SPDX-License-Identifier: Apache-2.0
import {trackSignature,freshMedia,lyricFrame,ambientFrame} from './lyrics-sync.mjs';
import {ZenSand} from './zen-sand.mjs';
const root=document.getElementById('lyrics-panel'),status=document.getElementById('lyrics-status'),previous=document.getElementById('lyric-previous'),current=document.getElementById('lyric-current'),next=document.getElementById('lyric-next'),light=document.getElementById('lyric-light'),fill=document.getElementById('lyric-fill'),spot=document.getElementById('lyric-spot'),credit=document.getElementById('lyrics-credit');
let media=null,payload=null,token='',request=null,timer,sequence=0,events=0,lastDraw=0;
const sand=new ZenSand(document.getElementById('zen-sand')),effects=document.querySelectorAll('[data-visual-mode]');
let visualMode='zen';try{if(localStorage.getItem('caruso-visual-mode')==='off')visualMode='off';}catch{}
function setVisualMode(mode){visualMode=mode==='off'?'off':'zen';root.dataset.visual=visualMode;for(const button of effects)button.setAttribute('aria-pressed',String(button.dataset.visualMode===visualMode));try{localStorage.setItem('caruso-visual-mode',visualMode);}catch{}if(visualMode==='off')sand.clear();render();}
for(const button of effects)button.addEventListener('click',()=>setVisualMode(button.dataset.visualMode));
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const put=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
function quiet(state,label,message,clearCanvas=true){root.dataset.state=state;put(status,label);put(previous,'');put(current,message);put(next,'');put(credit,'歌詞 · LRCLIB');if(clearCanvas)sand.clear();light.classList.remove('has-line','has-ambient','has-progress');fill.style.transform='scaleX(0)';spot.style.left='0%';}
function drawAmbience(now){const frame=ambientFrame(media,now,reduced.matches);if(!frame.active){light.classList.remove('has-ambient');sand.clear();return frame;}light.classList.add('has-ambient','has-progress');const progress=Math.max(0,Math.min(1,frame.position/(media.track.duration/1000)));fill.style.transform=`scaleX(${progress})`;spot.style.left=`${progress*100}%`;light.dataset.progressKind='song';light.style.setProperty('--ambient-energy',frame.energy);if(visualMode==='zen')sand.draw(frame,trackSignature(media).key,reduced.matches);else sand.clear();return frame;}
const tempoLabel=frame=>visualMode==='zen'?`Zen Sand · ${frame?.tempoSource==='metadata'?'':'預設 '}${frame?.bpm||90} BPM`:'沙畫已關閉';
function showAmbience(message,now){quiet('ambient','霓虹沙畫',message,false);const frame=drawAmbience(now);if(!frame.active)return;root.dataset.state=frame.playing?'ambient-playing':'ambient-paused';put(status,frame.playing?'播放中':'已暫停');put(credit,tempoLabel(frame));}
function render(now=Date.now()){
 if(!media||!trackSignature(media)){quiet('idle','等待歌曲','播放歌曲後自動顯示歌詞');return;}
 if(!freshMedia(media,now)){quiet('stale','等待同步','播放資訊暫時中斷');return;}
 const sig=trackSignature(media),data=payload?.key===sig.key?payload:null;
 if(!data||data.status==='loading'){showAmbience('正在尋找同步歌詞…',now);return;}
 if(data.status!=='ready'||!Array.isArray(data.lines)||!data.lines.length){const message=({instrumental:'純音樂 · 無歌詞',error:'歌詞服務暫時無法使用',unavailable:'這首歌沒有可用的同步歌詞'})[data.status]||'沒有同步歌詞';showAmbience(message,now);return;}
 const frame=lyricFrame(media,data.lines,now),line=data.lines[frame.index];
 root.dataset.state=frame.moving?'playing':media.deviceState==='Paused'?'paused':line?.text?'ready':'gap';
 put(status,media.deviceState==='Paused'?'已暫停':!line?'等待歌詞開始':!line.text?'間奏':'歌詞同步');
 put(previous,data.lines[frame.index-1]?.text||'');put(current,line?.text||(!line?'等待歌詞開始':'間奏'));put(next,data.lines[frame.index+1]?.text||'');const ambienceFrame=drawAmbience(now);put(credit,`LRCLIB · 逐句同步 ／ ${tempoLabel(ambienceFrame)}`);
 const active=!!line?.text;light.classList.toggle('has-line',active);
}
async function poll(){
 clearTimeout(timer);if(!token||!freshMedia(media))return;
 request?.abort();const controller=new AbortController();request=controller;const serial=++sequence;
 try{const response=await fetch('/api/lyrics',{headers:{'X-Caruso-Token':token},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(6000)])});if(!response.ok)throw Error('lyrics unavailable');const data=await response.json();if(serial===sequence&&data.key===trackSignature(media)?.key){payload=data;render();}}
 catch(error){if(!controller.signal.aborted&&serial===sequence){payload={key:trackSignature(media)?.key,status:'error',lines:[]};render();}}
 finally{if(request===controller){request=null;timer=setTimeout(poll,1800);}}
}
function update(value){const before=trackSignature(media)?.key;media=value;const after=trackSignature(media)?.key;if(before!==after){sequence++;request?.abort();request=null;clearTimeout(timer);payload=null;if(after&&token)poll();}render();}
window.addEventListener('caruso-media',event=>{events++;update(event.detail);});
async function initialize(){try{const response=await fetch('/api/state');if(!response.ok)throw Error();const data=await response.json();token=data.token;if(!events)update(data.power===true&&data.sourceName==='OPTICAL'?data.externalTransport?.metadata:null);else if(media)poll();}catch{setTimeout(initialize,3000);}}
function draw(now){requestAnimationFrame(draw);if(now-lastDraw<32)return;lastDraw=now;render();}
setVisualMode(visualMode);quiet('idle','等待歌曲','播放歌曲後自動顯示歌詞');initialize();requestAnimationFrame(draw);
