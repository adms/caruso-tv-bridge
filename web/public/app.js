// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: Apache-2.0
const $ = id => document.getElementById(id);
let state = {}, token = '', busy = false, editing = false, events, toastTimer, streamAlive = true;
const minutes = ms => `${Math.floor(Math.max(0, ms) / 60000)}:${String(Math.floor(Math.max(0, ms) / 1000) % 60).padStart(2, '0')}`;
function drawVolume(value) {
  $('volume-number').textContent = Number.isInteger(value) ? value : '—';
  const angle = Math.max(0, Math.min(100, value || 0)) * 2.8;
  $('dial').style.background = `conic-gradient(from 220deg,var(--accent) ${angle}deg,var(--line) ${angle}deg 280deg,transparent 280deg 360deg)`;
  $('volume').value = value ?? 0;
}
function render(next = state) {
  state = next;
  const online = state.connected && streamAlive;
  document.body.classList.toggle('offline', !online);
  $('connection').className = `status ${online ? 'online' : 'offline'}`;
  $('connection-label').textContent = online ? '已連線' : state.connection === 'connecting' ? '正在連線' : '連線中斷';
  $('device-ip').textContent = state.host || '—';
  const t = state.track;
  $('source').textContent = t?.source || '—';
  $('track-title').textContent = t?.title || '你的下一首好音樂';
  $('artist').textContent = t?.artist || (online ? '選一首音樂，從音響開始播放' : '等待連接 Caruso');
  $('play-state').textContent = !online ? '等待重新連線' : ({0:'正在播放',1:'已停止 · 上次播放',2:'已暫停',5:'正在載入'})[state.playState] || '等待播放資訊';
  if (t?.artwork && $('artwork').getAttribute('src') !== t.artwork) { $('artwork').src = t.artwork; $('artwork').hidden = false; }
  if (!t?.artwork) $('artwork').hidden = true;
  $('position').textContent = minutes(t?.position || 0); $('duration').textContent = minutes(t?.duration || 0);
  $('progress-fill').style.width = `${t?.duration > 0 ? Math.min(100, (t.position || 0) / t.duration * 100) : 0}%`;
  $('play-icon').hidden = state.playState === 0; $('pause-icon').hidden = state.playState !== 0;
  $('play').setAttribute('aria-label', state.playState === 0 ? '暫停' : '播放');
  for (const id of ['play','stop','next','previous']) $(id).disabled = !online || busy;
  if (t && !t.next) $('next').disabled = true;
  if (t && !t.previous) $('previous').disabled = true;
  for (const id of ['volume','plus','minus','quiet']) $(id).disabled = !online || busy || !Number.isInteger(state.volume);
  if (state.volume === 0) { $('minus').disabled = true; $('quiet').disabled = true; }
  if (state.volume === 100) $('plus').disabled = true;
  if (!editing) drawVolume(state.volume);
  $('volume-caption').textContent = busy ? '等待音響確認…' : online ? '音響回傳音量' : '上次收到的音量';
  $('session-copy').textContent = online ? '音量與播放資訊隨音響同步。' : '請確認音響與 Mac 在同一個網路，會自動重新連線。';
  $('updated').textContent = state.lastSeen ? `最後同步 ${new Date(state.lastSeen).toLocaleTimeString('zh-TW', {hour12:false})}` : '等待第一次同步';
}
function toast(message, error = false) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').className = error ? 'error' : ''; $('toast').hidden = false; toastTimer = setTimeout(() => $('toast').hidden = true, error ? 6500 : 2200); }
async function command(action, value) {
  if (busy || !state.connected) return;
  busy = true; render();
  try {
    const response = await fetch('/api/command', {method:'POST',headers:{'Content-Type':'application/json','X-Caruso-Token':token},body:JSON.stringify({action,value}),signal:AbortSignal.timeout(6000)});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    render(result.state); toast(action === 'volume' ? `音量已確認：${result.state.volume}` : '音響已接收指令');
  } catch (error) { toast(error.message.includes('confirmation') ? '尚未收到音響確認，請查看實際狀態。' : `操作未完成：${error.message}`, true); }
  finally { busy = false; editing = false; render(); }
}
$('artwork').addEventListener('error', () => { $('artwork').hidden = true; });
$('volume').addEventListener('input', e => { editing = true; drawVolume(Number(e.target.value)); });
$('volume').addEventListener('change', e => command('volume', Number(e.target.value)));
$('minus').addEventListener('click', () => command('volume', Math.max(0,state.volume-1)));
$('plus').addEventListener('click', () => command('volume', Math.min(100,state.volume+1)));
$('quiet').addEventListener('click', () => command('volume', 0));
$('play').addEventListener('click', () => command(state.playState === 0 ? 'PAUSE' : 'PLAY'));
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
