// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: MIT
import net from 'node:net';
import { EventEmitter } from 'node:events';
// LUCI wire format reference: drsound/aiolibresync (MIT), protocol-media.md.
export const MID = { REGISTER: 3, TRANSPORT: 40, METADATA: 42, POSITION: 49, PLAY_STATE: 51, VOLUME: 64 };
export function encodeFrame(mid, payload = '', type = 1) {
  const body = Buffer.from(payload);
  if (body.length > 5120) throw new Error('Payload too large');
  const f = Buffer.alloc(10 + body.length); f[2] = type;
  f.writeUInt16LE(mid, 3); f.writeUInt16LE(body.length, 8); body.copy(f, 10); return f;
}
export function crc16(f) {
  let crc = 0;
  for (const byte of Buffer.concat([f.subarray(0, 6), f.subarray(8)])) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 0xffff;
  }
  return crc;
}
export class FrameDecoder {
  buffer = Buffer.alloc(0);
  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]); const out = [];
    while (this.buffer.length >= 10) {
      const n = this.buffer.readUInt16BE(8);
      if (n > 5120) throw new Error('Invalid frame length');
      if (this.buffer.length < 10 + n) break;
      const f = this.buffer.subarray(0, 10 + n); this.buffer = this.buffer.subarray(10 + n);
      if (crc16(f) !== f.readUInt16BE(6)) throw new Error('Device checksum mismatch');
      out.push({ mid: f.readUInt16BE(3), type: f[2], status: f[5], payload: f.subarray(10).toString('utf8') });
    }
    return out;
  }
}
export class Caruso extends EventEmitter {
  constructor(host, { port = 7777 } = {}) {
    super(); this.host = host; this.port = port; this.closed = false; this.pending = null; this.retry = 1000;
    this.state = { host, connected: false, connection: 'connecting', volume: null, playState: null, track: null, lastSeen: null, lastError: null };
  }
  snapshot() { return structuredClone(this.state); }
  update(values) { Object.assign(this.state, values); this.emit('state', this.snapshot()); }
  start() { this.connect(); }
  connect() {
    if (this.closed) return;
    this.registered = false; this.lastReceived = Date.now(); this.decoder = new FrameDecoder(); this.update({ connected: false, connection: 'connecting' });
    const s = this.socket = net.createConnection({ host: this.host, port: this.port });
    const timeout = setTimeout(() => s.destroy(new Error('Device connection timed out')), 5000);
    s.setNoDelay(true);
    s.on('connect', () => {
      clearTimeout(timeout); this.send(MID.REGISTER, s.localAddress.replace(/^::ffff:/, ''), 2);
      this.registrationTimeout = setTimeout(() => s.destroy(new Error('Registration timed out')), 5000);
    });
    s.on('data', chunk => { try { for (const f of this.decoder.push(chunk)) this.receive(f); } catch (e) { s.destroy(e); } });
    s.on('error', e => this.update({ lastError: e.message }));
    s.on('close', () => {
      clearTimeout(timeout); clearTimeout(this.registrationTimeout); clearTimeout(this.initialQuery); clearInterval(this.poll);
      this.registered = false; this.rejectPending(new Error('Device disconnected')); this.update({ connected: false, connection: 'offline' });
      if (!this.closed) { this.reconnect = setTimeout(() => this.connect(), this.retry); this.retry = Math.min(this.retry * 2, 15000); }
    });
  }
  send(mid, payload = '', type = 1) {
    if (!this.socket || this.socket.destroyed || !this.socket.writable) throw new Error('Device unavailable');
    this.socket.write(encodeFrame(mid, payload, type));
  }
  refresh() { if (this.registered) for (const mid of [64, 51, 42]) this.send(mid); }
  receive({ mid, status, payload }) {
    this.lastReceived = Date.now();
    if (status === 2 || status === 3) {
      if (this.pending?.mid === mid || status === 3) this.rejectPending(new Error('Device refused the request'));
      if (status === 3) this.socket.destroy(new Error('Session registration lost')); return;
    }
    if (mid === 3 && status === 1) {
      clearTimeout(this.registrationTimeout); this.registered = true; this.retry = 1000;
      this.update({ connected: true, connection: 'online', lastError: null });
      this.initialQuery = setTimeout(() => this.refresh(), 120); this.poll = setInterval(() => {
        if (Date.now() - this.lastReceived > 25000) this.socket.destroy(new Error('Device stopped responding'));
        else this.refresh();
      }, 10000);
    }
    const change = { lastSeen: new Date().toISOString() };
    if (mid === 64 && /^\d+$/.test(payload) && +payload <= 100) change.volume = +payload;
    if (mid === 51 && /^[0125]$/.test(payload)) change.playState = +payload;
    if (mid === 49 && /^-?\d+$/.test(payload) && this.state.track) change.track = { ...this.state.track, position: Math.max(0, +payload) };
    if ((mid === 42 || mid === 45) && payload) {
      try {
        const d = JSON.parse(payload)['Window CONTENTS'];
        if (d && typeof d === 'object') {
          const str = v => typeof v === 'string' && v !== 'null' ? v : '';
          const url = str(d.CoverArtUrl);
          change.track = { title: str(d.TrackName), artist: str(d.Artist), album: str(d.Album), artwork: /^https?:\/\//.test(url) ? url : '',
            source: str(d.PlayUrl).startsWith('spotify:') ? 'Spotify' : `Source ${d['Current Source'] ?? '—'}`,
            duration: Number(d.TotalTime) || 0, position: Math.max(0, Number(d.Current_time) || 0), next: d.Next === true, previous: d.Prev === true };
          if ([0, 1, 2, 5].includes(d.PlayState)) change.playState = d.PlayState;
        }
      } catch { /* Ignore unrelated vendor messages. */ }
    }
    this.update(change);
    const p = this.pending;
    if (p && p.mid === mid && (mid === 64 ? /^\d+$/.test(payload) && +payload === p.value : status === 1)) {
      clearTimeout(p.timer); this.pending = null; p.resolve(this.snapshot());
    }
  }
  rejectPending(error) { if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(error); this.pending = null; } }
  command(action, value) {
    if (!this.registered) return Promise.reject(new Error('Device is offline'));
    if (this.pending) return Promise.reject(new Error('Another command is still pending'));
    let mid, payload;
    if (action === 'volume') {
      if (!Number.isInteger(value) || value < 0 || value > 100) return Promise.reject(new Error('Volume must be an integer from 0 to 100'));
      mid = 64; payload = String(value);
    } else if (['PLAY', 'PAUSE', 'STOP', 'NEXT', 'PREV'].includes(action)) { mid = 40; payload = action; }
    else return Promise.reject(new Error('Unsupported command'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.rejectPending(new Error('No device confirmation; result is unknown')), 3500);
      this.pending = { mid, value, resolve, reject, timer };
      try { this.send(mid, payload, 2); if (mid === 64) this.send(64); else this.refresh(); }
      catch (e) { this.rejectPending(e); }
    });
  }
  stop() {
    this.closed = true; clearTimeout(this.reconnect); clearTimeout(this.registrationTimeout); clearTimeout(this.initialQuery); clearInterval(this.poll);
    this.rejectPending(new Error('Controller closed')); this.socket?.destroy();
  }
}
