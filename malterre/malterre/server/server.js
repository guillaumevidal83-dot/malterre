'use strict';
/* Malterre — serveur HTTP + WebSocket. Aucune dépendance obligatoire. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { upgrade } = require('./ws.js');
const { createStore } = require('./store.js');
const { Game } = require('./game.js');

const PORT = +process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const PUB = path.join(__dirname, '..', 'public');
const SHARED = path.join(__dirname, '..', 'shared');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

(async () => {
  const store = await createStore();
  let saved = null;
  try { saved = await store.load(); } catch (e) { console.error('[store] lecture impossible :', e.message); }
  const game = new Game(saved);
  console.log('[malterre] sauvegarde : ' + store.kind + ' — ' + Object.keys(game.players).length + ' joueur(s), ' + game.nodes.length + ' gisements, ' + game.spawns.length + ' mobs');
  if (!ADMIN_PASSWORD) console.log('[malterre] page admin désactivée : définis la variable ADMIN_PASSWORD pour l\'activer.');

  let saving = false;
  async function save() {
    if (saving) return; saving = true;
    try { await store.save(game.serialize()); } catch (e) { console.error('[store] sauvegarde impossible :', e.message); }
    saving = false;
  }

  function file(res, base, rel) {
    const p = path.normalize(path.join(base, rel));
    if (!p.startsWith(base + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(p, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Introuvable'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(data);
    });
  }
  const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  const adminFails = new Map();
  const pwOk = pw => { const h = s => crypto.createHash('sha256').update(String(s)).digest(); return !!ADMIN_PASSWORD && crypto.timingSafeEqual(h(pw), h(ADMIN_PASSWORD)); };

  async function adminApi(req, res, body) {
    const ip = req.socket.remoteAddress || '?', t = Date.now(), f = adminFails.get(ip);
    if (!ADMIN_PASSWORD) return json(res, 403, { error: 'Page admin désactivée : définis ADMIN_PASSWORD sur le serveur.' });
    if (f && f.n >= 5 && t < f.until) return json(res, 429, { error: 'Trop d\'essais, patiente une minute.' });
    if (!pwOk(body.pw)) { adminFails.set(ip, { n: (f && t < f.until ? f.n : 0) + 1, until: t + 60000 }); return json(res, 401, { error: 'Mot de passe incorrect.' }); }
    adminFails.delete(ip);
    let out = {};
    if (body.action === 'backup') return json(res, 200, { backup: game.serialize() });
    if (body.action === 'restore') {
      const d = body.data;
      if (!d || typeof d !== 'object' || typeof d.players !== 'object') return json(res, 400, { error: 'Fichier de sauvegarde invalide.' });
      try { await store.backup(game.serialize()); } catch (e) { /* on continue */ }
      game.kickAll('Une sauvegarde a été restaurée.');
      await store.save(d);
      Object.assign(game, { players: d.players || {}, cfg: Object.assign({}, game.cfg, d.cfg || {}), seed: d.seed || game.seed, created: d.created || game.created });
      game.ents.clear(); game.genWorld(d);
      out = { ok: 'Sauvegarde restaurée.' };
    } else if (body.action && body.action !== 'state') {
      if (body.action === 'resetFull' || body.action === 'delPlayer') { try { await store.backup(game.serialize()); } catch (e) { console.error('[store] copie de secours impossible :', e.message); } }
      out = game.admin(body);
      await save();
    }
    json(res, 200, Object.assign({ state: Object.assign(game.adminState(), { store: store.kind, uptime: Math.round(process.uptime()), online: game.online.size }) }, out));
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x'), p = url.pathname;
    if (req.method === 'POST' && p === '/api/admin') {
      let size = 0; const chunks = [];
      req.on('data', c => { size += c.length; if (size > 2e6) req.destroy(); else chunks.push(c); });
      req.on('end', () => { let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { return json(res, 400, { error: 'Requête invalide.' }); } adminApi(req, res, body || {}).catch(e => { console.error(e); json(res, 500, { error: 'Erreur serveur.' }); }); });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    if (p === '/healthz') return json(res, 200, { ok: true, online: game.online.size });
    if (p === '/') return file(res, PUB, 'index.html');
    if (p === '/admin') return file(res, PUB, 'admin.html');
    if (p === '/shared/data.js') return file(res, SHARED, 'data.js');
    file(res, PUB, decodeURIComponent(p));
  });

  const conns = new Set();
  server.on('upgrade', (req, socket) => {
    if (new URL(req.url, 'http://x').pathname !== '/ws' || conns.size > 200) return socket.destroy();
    const conn = upgrade(req, socket);
    if (!conn) return;
    conns.add(conn);
    let count = 0, windowStart = Date.now();
    conn.on('message', raw => {
      const t = Date.now();
      if (t - windowStart > 1000) { windowStart = t; count = 0; }
      if (++count > 80) return conn.close();
      let msg; try { msg = JSON.parse(raw); } catch (e) { return; }
      if (!msg || typeof msg !== 'object') return;
      try { game.handle(conn, msg); } catch (e) { console.error('[jeu] erreur message', msg.t, e); }
    });
    conn.on('close', () => { conns.delete(conn); if (conn.sess) { try { game.leave(conn.sess); } catch (e) { console.error(e); } conn.sess = null; } });
  });

  let last = Date.now();
  setInterval(() => {
    const t = Date.now(), dt = Math.min(0.25, (t - last) / 1000); last = t;
    try { game.tick(dt); } catch (e) { console.error('[jeu] erreur de simulation', e); }
  }, 100);
  setInterval(save, 20000);
  setInterval(() => { for (const c of conns) { if (!c.alive) { c.close(); continue; } c.alive = false; c.ping(); } }, 25000);

  const stop = async () => { await save(); process.exit(0); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  server.listen(PORT, () => console.log('[malterre] en ligne sur le port ' + PORT));
})();
