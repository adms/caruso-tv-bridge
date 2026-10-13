// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: MIT
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Caruso } from './protocol.mjs';
import { settingsView, observation, inspectBackup } from './settings.mjs';
const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
export async function startServer({ host = process.env.CARUSO_HOST, port = 43186, client } = {}) {
  if (!host) throw new Error('Set CARUSO_HOST to your Caruso private IPv4 address before starting');
  if (!/^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(host) || host.split('.').some(x => +x > 255)) throw new Error('Use a private IPv4 device address');
  const caruso = client || new Caruso(host), token = randomBytes(32).toString('hex'), streams = new Set(); let origin;
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: http: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const json = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
    if (req.headers.host !== new URL(origin).host) return json(403, { error: 'Invalid host' });
    if (req.headers.origin && req.headers.origin !== origin) return json(403, { error: 'Invalid origin' });
    if (req.headers['sec-fetch-site'] === 'cross-site') return json(403, { error: 'Cross-site requests are not allowed' });
    const pathname = new URL(req.url, origin).pathname;
    if (req.method === 'GET' && pathname === '/api/settings') return json(200, settingsView(caruso.snapshot()));
    if (req.method === 'GET' && pathname === '/api/settings/observation') {
      res.setHeader('Content-Disposition', 'attachment; filename="caruso-observation-not-backup.json"');
      return json(200, observation(caruso.snapshot()));
    }
    if (pathname === '/api/settings/restore' || pathname === '/api/settings/backup') return json(409, {error:'音場設定尚未完整讀取與驗證，備份及還原目前鎖定。', canRestore:false});
    if (req.method === 'POST' && pathname === '/api/settings/inspect-backup') {
      const sent = Buffer.from(req.headers['x-caruso-token'] || ''), expected = Buffer.from(token);
      if (sent.length !== expected.length || !timingSafeEqual(sent, expected)) return json(403, { error: 'Invalid session' });
      if (!req.headers['content-type']?.startsWith('application/json')) return json(415, {error:'JSON required'});
      try {
        let size=0; const chunks=[];
        for await (const part of req) { size+=part.length; if(size>262144)return json(413,{error:'檔案超過 256 KiB。'});chunks.push(part); }
        return json(200, inspectBackup(JSON.parse(Buffer.concat(chunks)),settingsView(caruso.snapshot())));
      } catch { return json(400,{error:'無法讀取 JSON 檔案。'}); }
    }
    if (req.method === 'GET' && pathname === '/api/state') return json(200, { ...caruso.snapshot(), token });
    if (req.method === 'GET' && pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' }); res.write(`data: ${JSON.stringify(caruso.snapshot())}\n\n`);
      streams.add(res); req.on('close', () => streams.delete(res)); return;
    }
    if (req.method === 'POST' && pathname === '/api/command') {
      const sent = Buffer.from(req.headers['x-caruso-token'] || ''), expected = Buffer.from(token);
      if (sent.length !== expected.length || !timingSafeEqual(sent, expected)) return json(403, { error: 'Invalid session' });
      if (!req.headers['content-type']?.startsWith('application/json')) return json(415, { error: 'JSON required' });
      try {
        const chunks = []; let size = 0;
        for await (const part of req) { size += part.length; if (size > 1024) return json(413, { error: 'Request too large' }); chunks.push(part); }
        const body = JSON.parse(Buffer.concat(chunks)); const state = await caruso.command(body.action, body.value); return json(200, { ok: true, state });
      } catch (e) { return json(400, { error: e.message }); }
    }
    const files = { '/settings': ['settings.html', 'text/html'], '/settings.js': ['settings.js', 'text/javascript'], '/settings.css': ['settings.css', 'text/css'], '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
    if (req.method === 'GET' && files[pathname]) {
      try { const [file, type] = files[pathname]; const body = await readFile(path.join(publicDir, file)); res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); res.end(body); }
      catch { json(500, { error: 'Interface unavailable' }); } return;
    }
    json(404, { error: 'Not found' });
  });
  const announce = state => { for (const stream of streams) stream.write(`data: ${JSON.stringify(state)}\n\n`); }; caruso.on('state', announce);
  const keepAlive = setInterval(() => { for (const stream of streams) stream.write(': heartbeat\n\n'); }, 15000);
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); }
  catch (error) { clearInterval(keepAlive); caruso.off('state', announce); throw error; }
  origin = `http://127.0.0.1:${server.address().port}`; caruso.start();
  return { url: origin, caruso, close: async () => { clearInterval(keepAlive); caruso.off('state', announce); caruso.stop(); for (const s of streams) s.end(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const app = await startServer({ port: Number(process.env.PORT || 43186) }); console.log(`Caruso Remote: ${app.url}\nDevice: ${app.caruso.host}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
}
