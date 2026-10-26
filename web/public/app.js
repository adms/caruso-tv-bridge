// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: Apache-2.0
const $ = id => document.getElementById(id);
let state = {}, token = '', busy = false, editing = false, events, toastTimer, streamAlive = true;
const appleTVTransport=()=>state.sourceName==='OPTICAL'&&state.externalTransport?.available===true;
const appleTVMedia=()=>{const m=state.externalTransport?.metadata;return m?.connected&&Date.now()-Date.parse(m.observedAt)<15000?m:null;};
const appleTVPlaying=()=>appleTVMedia()?.deviceState==='Playing';
const minutes = ms => `${Math.floor(Math.max(0, ms) / 60000)}:${String(Math.floor(Math.max(0, ms) / 1000) % 60).padStart(2, '0')}`;
function drawVolume(value) {
  $('volume-number').textContent = Number.isInteger(value) ? value : '—';
  const angle = Math.max(0, Math.min(100, value || 0)) * 2.8;
  $('dial').style.background = `conic-gradient(from 220deg,var(--accent) ${angle}deg,var(--line) ${angle}deg 280deg,transparent 280deg 360deg)`;
  $('volume').value = value ?? 0;
}
function render(next = state) {
  state = next;
  const online = (state.connected||state.nativeConnected) && streamAlive;
  const discovery=state.discovery||{};
  $('network-permission').hidden=online;
  $('network-reason').textContent=discovery.policyDenied?'macOS 尚未允許區域網路探索。請在系統提示選擇「允許」。':discovery.message||'正在重新連線並搜尋區網中的 Caruso…';
  $('discovery-status').textContent=online?'音響已連線 · '+(state.host||''):discovery.message||'會自動搜尋與重新連線';
  $('discover-devices').disabled=discovery.phase==='searching'||discovery.phase==='verifying';
  $('network-settings').hidden=!discovery.policyDenied&&!state.networkAccessHint;
  document.body.classList.toggle('offline', !online);
  $('connection').className = `status ${online ? 'online' : 'offline'}`;
  $('connection-label').textContent=online?'已連線':discovery.policyDenied?'等待網路授權':['searching','verifying'].includes(discovery.phase)?'正在搜尋音響':discovery.phase==='found'?'找到音響 · 連線中':'正在重新連線';
  $('device-ip').textContent = state.host || '—';
  const actual = state.nativeConnected, on = state.power === true, external=appleTVTransport(), canTransport=state.canTransport||external;
  const media=external?appleTVMedia():null, playing=external?media?.deviceState==='Playing':state.playState===0;
  window.dispatchEvent(new CustomEvent('caruso-media',{detail:external&&on&&streamAlive?media:null}));
  const t = on ? external?media?.track:state.canTransport?state.track:null : null;
  $('power-state').textContent = !actual ? '未確認' : on ? '已開機' : 'Comfort 待機';
  $('power-on').disabled = busy || !actual || on;
  $('power-off').disabled = busy || !actual || !on;
  $('refresh-state').disabled = busy;
  const sources = state.sources || [];
  const select = $('source-select'), signature = JSON.stringify(sources.map(s=>[s.id,s.name]));
  if (select.dataset.signature !== signature) { select.replaceChildren(...sources.map(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=s.name==='OPTICAL'?'Digital In 1 / 光纖':s.name;return o;}));select.dataset.signature=signature; }
  if(document.activeElement!==select) select.value=state.sourceId;
  select.disabled=busy || !actual;
  $('set-source').disabled=select.disabled || !sources.length;
  $('set-source').textContent=on?'切換':'開機並切換';
  $('apple-tv-source').disabled=busy || !actual || !sources.some(s=>s.id===0xc20c);
  $('request-knob-access').hidden=state.accessory?.inputPermissionNeeded!==true;
  $('native-status').textContent=actual?`目前音源：${state.sourceName} · 原機音量 ${state.nativeVolume} / ${state.nativeMaxVolume}`:'尚未取得音響實際狀態';
  $('transport-note').textContent=external?media?'Apple TV 即時同步':state.externalTransport?.metadata?.needsPairing?'等待 Apple TV 媒體資料配對；播放按鍵仍可使用。':'正在連接 Apple TV 歌曲與封面資料…':state.transportReason || '';
  $('quiet-label').textContent=state.accessory?.knobMuted&&state.nativeVolume===0?'已靜音 · 按旋鈕恢復':'音量歸零';
  $('knob-status').textContent=state.accessory?.status || 'USB 旋鈕可在 Mac App 使用';
  const signal=state.accessory?.lastSignal;
  $('knob-signal').textContent=signal?`最近訊號：${({233:'音量＋',234:'音量－',226:'按下'})[signal]||('按鍵 '+signal)}`:'';
  $('input-permission').hidden=state.accessory?.inputPermissionNeeded!==true;
  $('restart-app').hidden=false;

  $('source').textContent = external?'Apple TV · 光纖':state.sourceName || '—';
  $('track-title').textContent = t?.title || (!actual ? '等待音響狀態' : !on ? 'Caruso 待機中' : external?'Apple TV 播放器':state.sourceName);
  $('artist').textContent = (external?'':t?.artist) || (external?media?[t?.artist,t?.album].filter(Boolean).join(' · '):'控制 Apple TV 目前播放的內容':state.transportReason) || '選一首音樂，從音響開始播放';
  for(const id of ['track-title','artist','transport-note'])$(id).title=$(id).textContent;
  $('play-state').textContent = !actual ? '等待實際狀態' : !on ? 'COMFORT STANDBY' : external?media?`${media.appId==='com.apple.TVMusic'?'Apple Music':media.app||'Apple TV'} · ${{Playing:'正在播放',Paused:'已暫停',Stopped:'已停止',Idle:'待命',Loading:'載入中',Unknown:'狀態未確認'}[media.deviceState]||'狀態未確認'}`:'APPLE TV 媒體遙控':!state.canTransport ? '外部音源' : !online ? '等待重新連線' : ({0:'正在播放',1:'已停止 · 上次播放',2:'已暫停',5:'正在載入'})[state.playState] || '等待播放資訊';
  if (t?.artwork && $('artwork').getAttribute('src') !== t.artwork) { $('artwork').src = t.artwork; $('artwork').hidden = false; }
  if (!t?.artwork) $('artwork').hidden = true;
  $('position').textContent = external&&!media?'—':minutes(t?.position || 0); $('duration').textContent = external&&!media?'—':minutes(t?.duration || 0);
  $('progress-fill').style.width = `${t?.duration > 0 ? Math.min(100, (t.position || 0) / t.duration * 100) : 0}%`;
  $('play-icon').toggleAttribute('hidden',!!playing); $('pause-icon').toggleAttribute('hidden',!playing);
  const record=document.querySelector('.record');record.classList.toggle('artwork-motion',!!(online&&on&&playing&&t?.artwork));record.title=t?.artwork?'90 秒一圈的舒緩旋轉 · 暫停回正 · 16 秒深呼吸縮放':'';
  $('play').setAttribute('aria-label', playing ? '暫停' : '播放');
  for (const id of ['play','stop','next','previous']) $(id).disabled = !online || !actual || !on || !canTransport || busy;
  $('stop').textContent=external?'暫停':'停止播放';
  if (!external && t && !t.next) $('next').disabled = true;
  if (!external && t && !t.previous) $('previous').disabled = true;
  for (const id of ['volume','plus','minus','quiet']) $(id).disabled = !online || !on || !actual || busy || !Number.isInteger(state.volume);
  if (state.volume === 0) { $('minus').disabled = true; $('quiet').disabled = true; }
  if (state.volume === 100) $('plus').disabled = true;
  if (!editing) drawVolume(state.volume);
  $('volume-caption').textContent = busy ? '等待音響確認…' : online ? '音響回傳音量' : '上次收到的音量';
  $('session-copy').textContent = online ? '音量與播放資訊隨音響同步。' : '請確認音響與 Mac 在同一個網路，會自動重新連線。';
  $('updated').textContent = state.lastSeen ? `最後同步 ${new Date(state.lastSeen).toLocaleTimeString('zh-TW', {hour12:false})}` : '等待第一次同步';
}
function toast(message, error = false) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').className = error ? 'error' : ''; $('toast').hidden = false; toastTimer = setTimeout(() => $('toast').hidden = true, error ? 6500 : 2200); }
async function command(action, value) {
  if (busy) return;
  busy = true; render();
  try {
    if(appleTVTransport()&&['PLAY','PAUSE','STOP','NEXT','PREV'].includes(action)){
      const key=({PLAY:'play',PAUSE:'pause',STOP:'pause',NEXT:'next',PREV:'previous'})[action];
      const response=await fetch('/api/music',{method:'POST',headers:{'Content-Type':'application/json','X-Caruso-Token':token},body:JSON.stringify({action:'transport',provider:'apple-tv',key}),signal:AbortSignal.timeout(35000)});const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||result.message||'Apple TV 未完成');if(result.media)state={...state,externalTransport:{...state.externalTransport,metadata:result.media}};toast(result.message);return;
    }
    const response = await fetch('/api/command', {method:'POST',headers:{'Content-Type':'application/json','X-Caruso-Token':token},body:JSON.stringify({action,value}),signal:AbortSignal.timeout(20000)});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    render(result.state); toast(action === 'volume' ? `音量已確認：${result.state.volume}` : ['power','source','refresh'].includes(action) ? '已確認音響實際狀態' : '音響已接收指令');
  } catch (error) { toast(error.message.includes('confirmation') ? '尚未收到音響確認，請查看實際狀態。' : `操作未完成：${error.message}`, true); }
  finally { busy = false; editing = false; render(); }
}
$('artwork').addEventListener('error', () => { $('artwork').hidden = true; });
$('volume').addEventListener('input', e => { editing = true; drawVolume(Number(e.target.value)); });
$('volume').addEventListener('change', e => command('volume', Number(e.target.value)));
$('minus').addEventListener('click', () => command('volume', Math.max(0,state.volume-1)));
$('plus').addEventListener('click', () => command('volume', Math.min(100,state.volume+1)));
$('quiet').addEventListener('click', () => command('volume', 0));
$('play').addEventListener('click', () => command((appleTVTransport()?appleTVPlaying():state.playState === 0) ? 'PAUSE' : 'PLAY'));
for (const b of document.querySelectorAll('[data-command]')) b.addEventListener('click', () => command(b.dataset.command));
async function connect() {
  try {
    const response = await fetch('/api/state'); if (!response.ok) throw new Error('Local service unavailable');
    const data = await response.json(); token = data.token; delete data.token; streamAlive = true; render(data);
    events?.close(); events = new EventSource('/api/events');
    events.onmessage = event => { streamAlive = true; render(JSON.parse(event.data)); };
    events.onerror = () => { streamAlive = false; render(); };
    events.onopen = () => { if (!streamAlive) { events.close(); connect(); } };
  } catch { streamAlive = false; render(); setTimeout(connect,3000); }
}
connect();

$('power-on').addEventListener('click',()=>command('power',true));
$('power-off').addEventListener('click',()=>command('power',false));
$('refresh-state').addEventListener('click',()=>command('refresh'));
$('set-source').addEventListener('click',()=>command('source',Number($('source-select').value)));
$('input-permission').addEventListener('click',()=>window.carusoDesktop?.openInputSettings());

$('restart-app').addEventListener('click',()=>window.carusoDesktop?.reconnectKnob());
$('request-knob-access').addEventListener('click',()=>window.carusoDesktop?.requestKnobAccess());
$('apple-tv-source').addEventListener('click',()=>command('source',0xc20c));

$('network-settings').addEventListener('click',()=>window.carusoDesktop?.openNetworkSettings());

function showActivityStatus(value){
  $('watch-community').disabled=!value.configured||value.busy;
  $('activity-profile').textContent=value.profile?'使用者 · '+value.profile:'使用上次選定的使用者';
  $('activity-status').textContent=!value.configured?'請在 Mac App 設定 Apple TV 控制':value.busy?'正在確認使用者與《廢柴聯盟》…':value.shortcutRegistered?'⌃⌥⌘N · 續播《廢柴聯盟》':'可使用按鈕開啟；快捷鍵尚未註冊';
}
if(window.carusoDesktop?.activityStatus){
  window.carusoDesktop.activityStatus().then(showActivityStatus);
  window.carusoDesktop.onActivityState(showActivityStatus);
  window.carusoDesktop.onActivityResult(result=>{toast(result.message,!result.ok);$('activity-status').textContent=result.message;});
  $('watch-community').addEventListener('click',async()=>{const result=await window.carusoDesktop.watchCommunity();$('activity-status').textContent=result.message;toast(result.message,!result.ok);});
}else $('activity-status').textContent='快捷啟動可在 Mac App 使用';

for(const id of ['discover-devices','discover-again'])$(id).addEventListener('click',()=>window.carusoDesktop?.discoverDevices());
