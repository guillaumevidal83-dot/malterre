'use strict';
/* Sauvegarde du monde : fichier JSON par défaut, PostgreSQL si DATABASE_URL est défini. */
const fs = require('fs');
const path = require('path');

function fileStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'world.json');
  return {
    kind: 'fichier (' + dir + ')',
    async load() { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; } },
    async save(obj) { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(obj)); fs.renameSync(tmp, file); },
    async backup(obj) { fs.writeFileSync(path.join(dir, 'backup-' + Date.now() + '.json'), JSON.stringify(obj)); },
  };
}

async function pgStore(url) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: url, max: 2 });
  await pool.query('CREATE TABLE IF NOT EXISTS malterre_kv (k text PRIMARY KEY, v jsonb NOT NULL, updated timestamptz NOT NULL DEFAULT now())');
  const put = (k, obj) => pool.query(
    'INSERT INTO malterre_kv (k, v, updated) VALUES ($1, $2, now()) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated = now()', [k, JSON.stringify(obj)]);
  return {
    kind: 'PostgreSQL',
    async load() { const r = await pool.query('SELECT v FROM malterre_kv WHERE k = $1', ['world']); return r.rows.length ? r.rows[0].v : null; },
    async save(obj) { await put('world', obj); },
    async backup(obj) { await put('backup', obj); },
  };
}

async function createStore() {
  if (process.env.DATABASE_URL) {
    try { return await pgStore(process.env.DATABASE_URL); }
    catch (e) { console.error('[store] PostgreSQL indisponible, retour au fichier :', e.message); }
  }
  return fileStore(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
}
module.exports = { createStore };
