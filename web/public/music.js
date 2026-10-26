// Copyright (c) 2026 Adms Chung; SPDX-License-Identifier: Apache-2.0
(()=>{
 const $=id=>document.getElementById(id);let pending=false,provider=null;
 async function request(input){
  // The same authenticated route works in the desktop window and its local browser view.
  const stateResponse=await fetch('/api/state',{signal:AbortSignal.timeout(5000)});if(!stateResponse.ok)throw Error('無法讀取本機連線');const state=await stateResponse.json();
  const response=await fetch('/api/music',{method:'POST',headers:{'Content-Type':'application/json','X-Caruso-Token':state.token},body:JSON.stringify(input),signal:AbortSignal.timeout(90000)});const result=await response.json();if(!response.ok)throw Error(result.error||'音樂操作未完成');return result;
 }
 function message(text){$('music-tv-status').textContent=text;$('music-quick-status').textContent=text;}
 function render(result){if(result.active){provider=result.active;$('music-tv-name').textContent=provider==='spotify'?'Apple TV · Spotify':'Apple TV · Apple Music';}if(result.capturedAt)$('music-tv-captured').textContent='畫面快照 · '+new Date(result.capturedAt).toLocaleTimeString('zh-TW',{hour12:false});if(result.image){$('music-tv-frame').src=result.image;$('music-tv-frame').hidden=false;$('music-tv-placeholder').hidden=true;}if(result.frameUnavailable){$('music-tv-frame').hidden=true;$('music-tv-placeholder').hidden=false;$('music-tv-captured').textContent='預覽暫時無法更新，請按「更新畫面」';}if(result.message)message(result.message);}
 async function send(action,selected=provider,fields={}){
  if(pending)return;if(!selected){message('請先開啟 Spotify 或 Apple Music。');return;}
  pending=true;document.querySelectorAll('[data-music-provider],[data-tv-key],#music-tv-refresh,#music-tv-close,#music-tv-submit').forEach(b=>b.disabled=true);message(action==='resume'?'正在開啟音樂 App 並確認光纖音源…':'正在操作 Apple TV…');
  try{const result=await request({action,provider:selected,...fields});render(result);if(!result.ok)return;if(action==='close'){provider=null;$('music-tv-frame').removeAttribute('src');$('music-tv-frame').hidden=true;$('music-tv-placeholder').hidden=false;}}
  catch(error){message(error.name==='TimeoutError'?'Apple TV 等待逾時，請重試；沒有自動重送按鍵。':error.message||'Apple TV 操作未完成。');}
  finally{pending=false;document.querySelectorAll('[data-music-provider]').forEach(b=>b.disabled=false);document.querySelectorAll('[data-tv-key],#music-tv-refresh,#music-tv-close,#music-tv-submit').forEach(b=>b.disabled=!provider);}
 }
 $('show-music').addEventListener('click',()=>$('tab-music-pane').click());
 for(const b of document.querySelectorAll('[data-music-provider]'))b.addEventListener('click',()=>{$('tab-music-pane').click();send('resume',b.dataset.musicProvider);});
 for(const b of document.querySelectorAll('[data-tv-key]'))b.addEventListener('click',()=>send('key',provider,{key:b.dataset.tvKey}));
 $('music-tv-refresh').addEventListener('click',()=>send('capture'));
 $('music-tv-close').addEventListener('click',()=>send('close'));
 $('music-tv-search').addEventListener('submit',event=>{event.preventDefault();send('text',provider,{query:$('music-tv-query').value});});
})();
