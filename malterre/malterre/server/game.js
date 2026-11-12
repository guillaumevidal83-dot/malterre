'use strict';
/* Malterre — simulation du monde (le serveur fait autorité). */
const crypto = require('crypto');
const D = require('../shared/data.js');

const W = D.WORLD, TAU = Math.PI * 2, RAD = W.radius, LANDS = D.LANDS;
const landing = L => ({ x: L.x, z: L.z - L.r + 14 });
const landAt = (x, z) => LANDS.find(L => Math.hypot(x - L.x, z - L.z) < L.r + 30) || null;
const have = (rec, r) => (r in D.ITEMS ? (rec.items || {})[r] : rec.res[r]) || 0;
const canPay = (rec, cost) => Object.keys(cost).every(r => have(rec, r) >= cost[r]);
const pay = (rec, cost) => { for (const r in cost) { if (r in D.ITEMS) rec.items[r] -= cost[r]; else rec.res[r] -= cost[r]; } };
const now = () => Date.now();
const rnd = (a, b) => a + Math.random() * (b - a);
const irnd = (a, b) => Math.floor(rnd(a, b + 1));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return Math.abs(d); };
function mulberry(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const NODE_OF = { wood: 'tree', stone: 'rock', gold: 'vein', spec: 'remains' };
const GATHER = ['wood', 'stone', 'gold', 'spec'];
const NAME_RE = /^[\p{L}\p{N} _-]{2,14}$/u;

class Game {
  constructor(saved) {
    saved = saved || {};
    this.cfg = Object.assign({}, D.CONFIG, saved.cfg || {});
    if (saved.cfg && (saved.cfgV || 1) < 2) { // nouveaux réglages de base, appliqués une fois aux mondes existants
      this.cfg.respawnBoss = Math.min(this.cfg.respawnBoss, 900); this.cfg.respawnElite = Math.min(this.cfg.respawnElite, 600);
      this.cfg.villageMax = 99; this.cfg.xpMult = this.cfg.xpMult * 0.5;
    }
    this.players = saved.players || {};
    this.seed = saved.seed || 1337;
    this.created = saved.created || now();
    this.ents = new Map();
    this.nextId = 1;
    this.online = new Map();      // clé joueur → session
    this.dungeons = new Map();
    this.events = [];
    this.fails = new Map();       // anti-force brute sur les codes
    this.rosterDirty = false;
    this.nodeChanges = [];
    this.secTimer = 0;
    this.genWorld(saved);
  }

  /* ---------- Génération du monde ---------- */
  genWorld(saved) {
    const R = mulberry(this.seed);
    this.forts = [];
    for (let s = 0; s < W.slots; s++) {
      const a = s / W.slots * TAU;
      this.forts.push({ s, x: Math.sin(a) * W.fortRing, z: Math.cos(a) * W.fortRing, rot: a + Math.PI, owner: null, near: {} });
    }
    for (const k in this.players) { const f = this.forts[this.players[k].slot]; if (f) f.owner = k; }

    // Villages : 8 entre les forteresses (zone calme) et 4 plus riches en zone intermédiaire.
    this.villages = [];
    for (let i = 0; i < W.slots; i++) { const a = (i + 0.5) / W.slots * TAU; this.villages.push({ id: i, kind: 'village', x: Math.sin(a) * (W.tier1 + 45), z: Math.cos(a) * (W.tier1 + 45), rich: 1, owner: null, shieldUntil: 0, gar: null, regarAt: 0, spawns: [] }); }
    for (let i = 0; i < 4; i++) { const a = (i + 0.25) / 4 * TAU; this.villages.push({ id: W.slots + i, kind: 'village', x: Math.sin(a) * (W.tier2 + 55), z: Math.cos(a) * (W.tier2 + 55), rich: 2, owner: null, shieldUntil: 0, gar: null, regarAt: 0, spawns: [] }); }
    if (saved.villages) for (const v of this.villages) { const sv = saved.villages[v.id]; if (sv && this.players[sv[0]]) { v.owner = sv[0]; v.shieldUntil = sv[1] || 0; } }
    const farV = (x, z, d) => this.villages.every(v => (v.x - x) ** 2 + (v.z - z) ** 2 > d * d);
    const nodes = this.nodes = [];
    const ok = (x, z, minFort) => x * x + z * z < (RAD - 7) * (RAD - 7) &&
      this.forts.every(f => (f.x - x) ** 2 + (f.z - z) ** 2 > minFort * minFort) &&
      nodes.every(n => (n.x - x) ** 2 + (n.z - z) ** 2 > 12) && farV(x, z, 17);
    const add = (type, x, z, rich) => {
      const max = D.NODES[type].stock * rich;
      nodes.push({ id: nodes.length, type, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, rich, max, stock: max, ts: 0, vis: 3 });
    };
    for (const f of this.forts) {
      for (const [type, n] of [['tree', 12], ['rock', 7], ['vein', 2], ['remains', 5]]) {
        let left = n, tries = 0;
        while (left > 0 && tries++ < 400) {
          const a = R() * TAU, d = 30 + R() * 32, x = f.x + Math.sin(a) * d, z = f.z + Math.cos(a) * d;
          if (ok(x, z, 28)) { add(type, x, z, 1); left--; }
        }
      }
    }
    const scatter = (type, n, r0, r1, rich) => {
      let tries = 0;
      while (n > 0 && tries++ < 6000) {
        const a = R() * TAU, r = Math.sqrt(r0 * r0 + R() * (r1 * r1 - r0 * r0)), x = Math.sin(a) * r, z = Math.cos(a) * r;
        if (ok(x, z, 28)) { add(type, x, z, rich); n--; }
      }
    };
    scatter('tree', 230, W.tier1, RAD - 7, 1); scatter('rock', 85, W.tier1, RAD - 7, 1); scatter('remains', 34, W.tier1, RAD - 7, 1); scatter('vein', 18, W.tier1, RAD - 7, 1);
    scatter('tree', 130, W.tier2, W.tier1, 2); scatter('rock', 65, W.tier2, W.tier1, 2); scatter('vein', 30, W.tier2, W.tier1, 2); scatter('remains', 34, W.tier2, W.tier1, 2);
    scatter('tree', 45, 14, W.tier2, 3); scatter('rock', 22, 14, W.tier2, 3); scatter('vein', 22, 14, W.tier2, 4); scatter('remains', 22, 14, W.tier2, 4);
    if (saved.nodes && saved.v === 4) for (const id in saved.nodes) { const n = nodes[id]; if (n) { n.stock = saved.nodes[id][0]; n.ts = saved.nodes[id][1]; } }
    for (const L2 of LANDS) { // Contrées lointaines : gisements très riches, ajoutés en fin de liste pour ne pas décaler les autres.
      let tries = 0; const left = Object.assign({}, L2.nodes), ld = landing(L2);
      for (const type in left) while (left[type] > 0 && tries++ < 9000) {
        const a = R() * TAU, r = Math.sqrt(R()) * (L2.r - 8), x = L2.x + Math.sin(a) * r, z = L2.z + Math.cos(a) * r;
        if (Math.hypot(x - ld.x, z - ld.z) < 22 || Math.hypot(x - L2.x, z - L2.z) < 26 || !nodes.every(n => (n.x - x) ** 2 + (n.z - z) ** 2 > 16)) continue;
        add(type, x, z, L2.rich); left[type]--;
      }
    }
    for (const n of nodes) n.vis = this.visOf(n);
    // Gisements proches de chaque forteresse, triés par distance (pour les ouvriers).
    for (const f of this.forts) for (const res of GATHER) {
      f.near[res] = nodes.filter(n => n.type === NODE_OF[res] && dist(n, f) < 150).sort((a, b) => dist(a, f) - dist(b, f));
    }

    // Points d'apparition des mobs.
    const spawns = this.spawns = [];
    const sp = (type, x, z, roam, village) => { const o = { id: spawns.length, type, x, z, roam: !!roam, deadUntil: 0, ent: null, village: village || null }; spawns.push(o); if (village) village.spawns.push(o); };
    const packs = (type, n, min, max, r0, r1, minFort, roam) => {
      let tries = 0;
      while (n > 0 && tries++ < 4000) {
        const a = R() * TAU, r = Math.sqrt(r0 * r0 + R() * (r1 * r1 - r0 * r0)), x = Math.sin(a) * r, z = Math.cos(a) * r;
        if (!this.forts.every(f => (f.x - x) ** 2 + (f.z - z) ** 2 > minFort * minFort) || !farV(x, z, 34)) continue;
        const c = min + Math.floor(R() * (max - min + 1));
        for (let i = 0; i < c; i++) sp(type, x + (R() - 0.5) * 9, z + (R() - 0.5) * 9, roam);
        n--;
      }
    };
    packs('wolf', 34, 2, 3, W.tier1 + 5, RAD - 12, 50); packs('boar', 24, 1, 2, W.tier1 + 5, RAD - 12, 46); packs('bandit', 20, 2, 3, W.tier1 + 5, RAD - 12, 55);
    packs('wolf', 16, 1, 1, W.tier1 + 10, RAD - 20, 42, true);
    packs('spriggan', 18, 2, 3, W.tier1 + 5, RAD - 12, 46); packs('rockling', 16, 1, 2, W.tier1 + 5, RAD - 12, 46); packs('wanderer', 16, 2, 3, W.tier1 + 5, RAD - 12, 50);
    packs('treant', 14, 1, 2, W.tier2 + 5, W.tier1 - 5, 0); packs('golem', 14, 1, 2, W.tier2 + 5, W.tier1 - 5, 0);
    packs('spider', 26, 2, 3, W.tier2 + 5, W.tier1 - 5, 0); packs('orc', 24, 2, 2, W.tier2 + 5, W.tier1 - 5, 0);
    packs('broodmother', 3, 1, 1, W.tier2 + 20, W.tier1 - 20, 0); packs('warlord', 3, 1, 1, W.tier2 + 10, W.tier1 - 30, 0);
    packs('knight', 16, 2, 2, 24, W.tier2 - 4, 0); packs('troll', 10, 1, 1, 24, W.tier2 - 6, 0);
    sp('guardian', 0, 0);
    for (const v of this.villages) { const n = v.rich > 1 ? 6 : 4; for (let i = 0; i < n; i++) { const a = i / n * TAU; sp('militia', v.x + Math.sin(a) * 6, v.z + Math.cos(a) * 6, false, v); } sp('captain', v.x + 2, v.z + 2, false, v); }
    for (const L2 of LANDS) { // Monstres des contrées lointaines.
      const ld = landing(L2), far = (x, z) => Math.hypot(x - ld.x, z - ld.z) > 38 && Math.hypot(x - L2.x, z - L2.z) > 36;
      for (const [type, n, c] of L2.mobs) {
        let left = n, tries = 0;
        while (left > 0 && tries++ < 3000) { const a = R() * TAU, r = Math.sqrt(R()) * (L2.r - 14), x = L2.x + Math.sin(a) * r, z = L2.z + Math.cos(a) * r; if (!far(x, z)) continue; for (let k = 0; k < c; k++) sp(type, x + (R() - 0.5) * 8, z + (R() - 0.5) * 8); left--; }
      }
      sp(L2.boss, L2.x, L2.z);
    }
    const t = now();
    for (const s of spawns) {
      if (saved.v === 4 && saved.dead && saved.dead[s.id] > t) { const d = D.MOBS[s.type]; s.deadUntil = Math.min(saved.dead[s.id], t + (d.boss ? this.cfg.respawnBoss : d.elite ? this.cfg.respawnElite : this.cfg.respawnMob) * 1000); } else if (!(s.village && s.village.owner)) this.spawnMob(s);
    }
    for (const v of this.villages) if (v.owner) this.spawnVillageGuards(v);
  }

  visOf(n) { return Math.ceil(this.nodeStock(n) / n.max * 3); }
  nodeStock(n) {
    if (n.stock < n.max) {
      const step = this.cfg.regenNode * 1000, g = Math.floor((now() - n.ts) / step);
      if (g > 0) { n.stock = Math.min(n.max, n.stock + g); n.ts += g * step; }
    }
    return n.stock;
  }
  takeNode(n, amt) {
    const s = this.nodeStock(n);
    if (s >= n.max) n.ts = now();
    const take = Math.min(amt, s);
    n.stock -= take;
    return take;
  }
  fortPos(f, lx, lz) { const c = Math.cos(f.rot), s = Math.sin(f.rot); return { x: f.x + lx * c + lz * s, z: f.z - lx * s + lz * c }; }
  fortInfo(f) {
    const p = f.owner && this.players[f.owner];
    const sh = p ? Math.max(0, Math.round(((p.shield || 0) - now()) / 1000)) : 0;
    return { s: f.s, x: f.x, z: f.z, rot: f.rot, o: p ? p.name : null, c: p ? p.cls : null, b: p ? p.b : null, l: p ? p.lvl : 0, sh };
  }

  /* ---------- Entités ---------- */
  spawnMob(sp) {
    const def = D.MOBS[sp.type];
    const e = { id: this.nextId++, k: 2, t: sp.type, x: sp.x, z: sp.z, r: rnd(0, TAU), hp: def.hp, mh: def.hp, a: 0, sp, def, rad: def.rad,
      tgt: null, nextAtk: 0, think: now() + rnd(0, 500), wx: sp.x, wz: sp.z, wt: 0, dmgBy: {}, slowUntil: 0, stunUntil: 0, nextSlam: 0, atkAnim: 0, active: false, ret: false };
    this.ents.set(e.id, e); sp.ent = e; sp.deadUntil = 0;
    return e;
  }
  spawnMinion(sess, rec, temp) {
    const def = D.MINIONS[rec.t], f = this.forts[sess.rec.slot], hero = sess.ent;
    const at = temp ? { x: hero.x + rnd(-3, 3), z: hero.z + rnd(-3, 3) } : this.fortPos(f, rnd(-8, 8), rnd(2, 12));
    const hp = Math.round(def.hp * sess.st.mHp);
    const e = { id: this.nextId++, k: 1, t: rec.t, x: at.x, z: at.z, r: rnd(0, TAU), hp, mh: hp, a: 0, owner: sess.key, oid: hero.id, rec, def, rad: 0.5,
      st: 'idle', node: null, carry: 0, tgt: null, threat: null, nextAtk: 0, timer: 0, think: 0, atkAnim: 0, temp: !!temp, expire: temp ? now() + 25000 : 0 };
    this.ents.set(e.id, e); sess.minions.push(e);
    return e;
  }
  alive(e) { return !!e && !e.dead && this.ents.has(e.id); }
  ev(x, z, d, only) { this.events.push({ x, z, d, only }); }
  move(e, tx, tz, speed, dt) {
    const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
    if (d < 1e-3) return;
    const step = Math.min(d, speed * dt);
    e.x += dx / d * step; e.z += dz / d * step; e.r = Math.atan2(dx, dz);
  }
  ownerKey(e) { return !e ? null : e.k === 0 ? e.key : e.k === 1 ? e.owner : null; }
  // Tous les bonus d'un joueur : bâtiments, fabrications de l'atelier et reliques équipées.
  stats(rec) {
    const c = rec.craft || {}, eq = rec.eq || {}, b = rec.b, has = id => eq.h === id || eq.m === id || eq.f === id, p = D.CLASSES[rec.cls].passive || {};
    return {
      hp: (1 + 0.15 * (b.blessing || 0)) * (1 + 0.1 * (b.altar || 0)) * (1 + 0.12 * (c.armor || 0)) * (has('h_stone') ? 1.3 : 1),
      dmg: (1 + 0.15 * (b.blessing || 0)) * (1 + 0.1 * (b.altar || 0)) * (1 + 0.12 * (c.weapon || 0)) * (has('h_fury') ? 1.2 : 1) * (p.dmg || 1),
      speed: 1 + 0.04 * (c.boots || 0), mount: 1 + 0.2 * (b.stable || 0), cd: has('h_haste') ? 0.75 : 1, vamp: (has('h_vamp') ? 0.08 : 0) + (p.vamp || 0), regen: (has('f_regen') ? 3 : 1) * (p.regen || 1),
      mHp: (1 + 0.1 * (b.barracks || 0)) * (1 + 0.12 * (c.marmor || 0)) * (has('m_iron') ? 1.4 : 1) * (p.mHp || 1),
      mDmg: (1 + 0.1 * (b.barracks || 0)) * (1 + 0.12 * (c.mweapon || 0)) * (has('m_venom') ? 1.3 : 1),
      mSpeed: has('m_swift') ? 1.25 : 1,
      work: (1 + 0.2 * (b.workshop || 0)) * (1 + 0.15 * (c.tools || 0)) * (has('m_swift') ? 1.25 : 1) * (p.work || 1),
      revive: p.revive || 1, heroHarvest: p.heroHarvest || D.HERO_HARVEST,
      carry: 5 + (b.workshop || 0) + (has('f_harvest') ? 2 : 0),
      cap: Math.round(D.cap(b) * (has('f_vault') ? 1.5 : 1)), mcap: Math.round(D.minionCap(b) * (p.mcapMul || 1)) + (has('m_swarm') ? 3 : 0),
      gar: (has('f_ward') ? 1.5 : 1) * (1 + 0.15 * (b.walls || 0)), lootTaken: (has('f_ward') ? 0.5 : 1) * (1 - 0.08 * (b.walls || 0)),
    };
  }
  heroMh(rec, st) { return Math.round((D.CLASSES[rec.cls].hp + 18 * (rec.lvl - 1)) * (st || this.stats(rec)).hp); }
  // Recalcule les bonus d'un joueur en ligne et les applique à son héros et à ses serviteurs.
  refresh(sess) {
    const st = sess.st = this.stats(sess.rec), e = sess.ent, r = e.hp / e.mh;
    e.mh = this.heroMh(sess.rec, st); e.hp = Math.max(1, Math.round(e.mh * r));
    for (const m of sess.minions) { const k = m.hp / m.mh; m.mh = Math.round(m.def.hp * st.mHp); m.hp = Math.max(1, Math.round(m.mh * k)); }
    sess.dirty = true;
  }
  shielded(f) { const p = f.owner && this.players[f.owner]; return !!p && (p.shield || 0) > now(); }
  // Zone de raid : autour d'une forteresse possédée et non protégée.
  zoneOf(e) {
    for (const f of this.forts) if (f.owner && Math.hypot(f.x - e.x, f.z - e.z) < D.FORT.zone && !this.shielded(f)) return f;
    const t = now();
    for (const v of this.villages) if (v.owner && Math.hypot(v.x - e.x, v.z - e.z) < D.VILLAGE.zone && v.shieldUntil <= t) return v;
    return null;
  }
  villInfo(v) { const p = v.owner && this.players[v.owner]; return { id: v.id, x: v.x, z: v.z, rich: v.rich, o: p ? p.name : null, c: p ? p.cls : null, s: p ? p.slot : -1, sh: Math.max(0, Math.round((v.shieldUntil - now()) / 1000)) }; }
  villBroadcast(v) { const info = this.villInfo(v); for (const s of this.online.values()) this.send(s, { t: 'vill', v: info }); }
  villagesOf(key) { return this.villages.filter(v => v.owner === key); }
  villageIncome(key) { const out = {}; for (const v of this.villagesOf(key)) for (const r in D.VILLAGE.income) out[r] = (out[r] || 0) + D.VILLAGE.income[r] * v.rich * this.cfg.villageIncome; return out; }
  // Gardes d'un village conquis : ils défendent pour leur seigneur, même absent.
  spawnVillageGuards(v) {
    this.clearGarrison(v);
    const rec = this.players[v.owner]; if (!rec) { v.owner = null; return; }
    const st = this.stats(rec), ms = D.CLASSES[rec.cls].minions, types = [ms[0], ms[0], ms[2], ms[4], ms[4]];
    v.gar = types.map((mt, i) => {
      const def = D.MINIONS[mt], a = i / types.length * TAU, p = { x: v.x + Math.sin(a) * 6, z: v.z + Math.cos(a) * 6 }, hp = Math.round(def.hp * st.mHp * 1.5 * v.rich);
      const e = { id: this.nextId++, k: 1, t: mt, x: p.x, z: p.z, r: a, hp, mh: hp, a: 0, owner: v.owner, oid: 0, def, mult: st.mDmg * 1.5, rad: 0.5, gar: v, vg: true, post: p, tgt: null, nextAtk: 0, think: 0, atkAnim: 0 };
      this.ents.set(e.id, e); return e;
    });
  }
  freeVillage(v) { this.clearGarrison(v); v.owner = null; v.shieldUntil = 0; for (const s of v.spawns) s.deadUntil = 0; this.villBroadcast(v); }
  captureVillage(sess, v) {
    const t = now(), prev = v.owner && this.players[v.owner], prevSess = v.owner && this.online.get(v.owner);
    for (const s of v.spawns) if (s.ent) { this.ents.delete(s.ent.id); s.ent = null; }
    v.owner = sess.key; v.shieldUntil = t + this.cfg.villageShieldMin * 60000;
    this.spawnVillageGuards(v);
    this.villBroadcast(v);
    this.ev(v.x, v.z, ['fx', 'loot', Math.round(v.x), Math.round(v.z), 9, sess.ent.id]);
    sess.dirty = true;
    if (prevSess) { prevSess.dirty = true; this.send(prevSess, { t: 'alert', m: '🚩 ' + sess.rec.name + ' t\'a pris un village !' }); }
    else if (prev) { prev.reports = prev.reports || []; prev.reports.push({ by: sess.rec.name, at: t, down: 0, lost: null, village: 1 }); if (prev.reports.length > 5) prev.reports.shift(); }
    this.say('🚩 ' + sess.rec.name + ' conquiert un village' + (prev ? ' de ' + prev.name : '') + ' !');
  }
  // Deux unités de joueurs sont ennemies seulement dans une zone de raid, et si l'une d'elles défend cette forteresse.
  // Alliance : active quand les deux seigneurs se sont choisis l'un l'autre.
  allied(ka, kb) { const a = this.players[ka], b = this.players[kb]; return !!a && !!b && (a.allies || []).includes(kb) && (b.allies || []).includes(ka); }
  enemyU(a, b) {
    const ka = this.ownerKey(a), kb = this.ownerKey(b);
    if (!ka || !kb || ka === kb || !a.zone || a.zone !== b.zone || this.allied(ka, kb)) return false;
    // Le défenseur et ses alliés font front commun contre les intrus.
    const o = a.zone.owner, da = o === ka || this.allied(o, ka), db = o === kb || this.allied(o, kb);
    return da !== db;
  }
  foe(a, o) { return o !== a && !o.dead && (o.k === 2 || this.enemyU(a, o)); }
  fortBroadcast(f) { const info = this.fortInfo(f); for (const s of this.online.values()) this.send(s, { t: 'fort', f: info }); }
  report(rec, by) {
    const t = now(); rec.reports = rec.reports || [];
    let r = rec.reports[rec.reports.length - 1];
    if (!r || r.by !== by || t - r.at > 600000 || r.lost) { r = { by, at: t, down: 0, lost: null }; rec.reports.push(r); if (rec.reports.length > 5) rec.reports.shift(); }
    return r;
  }
  // Combat au corps à corps commun aux serviteurs et aux garnisons. Renvoie true si l'unité est occupée à se battre.
  fight(m, speed, dmg, dt, t) {
    if (m.tgt && !this.alive(m.tgt)) m.tgt = null;
    const tg = m.tgt; if (!tg) return false;
    const d = dist(m, tg), rng = m.def.range || 1.8, reach = rng + (tg.rad || 0.5);
    if (d > reach) { this.move(m, tg.x, tg.z, speed, dt); m.a = 1; }
    else {
      m.r = Math.atan2(tg.x - m.x, tg.z - m.z);
      if (t >= m.nextAtk) { m.nextAtk = t + 1100; m.atkAnim = t + 300; this.damage(m, tg, dmg * rnd(0.85, 1.15), rng > 3 ? 'b' : 'm'); }
      m.a = t < m.atkAnim ? 2 : 0;
    }
    return true;
  }
  spawnGarrison(f) {
    const rec = this.players[f.owner], st = this.stats(rec), mult = st.mDmg * 1.25 * st.gar, t = now();
    const list = rec.minions.filter(m => !m.deadUntil || m.deadUntil <= t).slice(0, 16);
    f.gar = list.map((m, i) => {
      const def = D.MINIONS[m.t], a = i / Math.max(1, list.length) * TAU, p = this.fortPos(f, Math.sin(a) * 9, 2 + Math.cos(a) * 8), hp = Math.round(def.hp * st.mHp * 1.25 * st.gar);
      const e = { id: this.nextId++, k: 1, t: m.t, x: p.x, z: p.z, r: f.rot, hp, mh: hp, a: 0, owner: f.owner, oid: 0, rec: m, def, mult, rad: 0.5, gar: f, post: p, tgt: null, nextAtk: 0, think: 0, atkAnim: 0 };
      this.ents.set(e.id, e); return e;
    });
    f.garSeen = t;
  }
  clearGarrison(f) { if (f.gar) { for (const e of f.gar) this.ents.delete(e.id); f.gar = null; } }
  tickGarrison(m, f, dt, t) {
    if (t >= m.think) {
      m.think = t + 400 + rnd(0, 100);
      let best = null, bd = 1e9;
      for (const o of this.ents.values()) if ((o.k === 2 && dist(o, f) < 26) || (o.k !== 2 && !o.dead && this.enemyU(m, o))) { const d = dist(o, m); if (d < bd) { bd = d; best = o; } }
      m.tgt = best;
    }
    if (this.fight(m, m.def.speed, m.def.dmg * m.mult, dt, t)) return;
    if (Math.hypot(m.post.x - m.x, m.post.z - m.z) > 1) { this.move(m, m.post.x, m.post.z, m.def.speed, dt); m.a = 1; } else m.a = 0;
    if (m.hp < m.mh) m.hp = Math.min(m.mh, m.hp + m.mh * 0.03 * dt);
  }

  damage(src, tgt, amt, kind, crit) {
    if (!this.alive(tgt)) return;
    amt = Math.max(1, Math.round(amt));
    tgt.hp -= amt; tgt.lastHit = now();
    this.ev(tgt.x, tgt.z, ['h', src ? src.id : 0, tgt.id, amt, crit ? 1 : 0, kind || 'm']);
    if (src && src.k === 0 && src.sess && src.sess.st.vamp && !src.dead) src.hp = Math.min(src.mh, src.hp + amt * src.sess.st.vamp);
    if (tgt.k === 2) {
      const o = this.ownerKey(src);
      if (o) tgt.dmgBy[o] = (tgt.dmgBy[o] || 0) + amt;
      if (src && this.alive(src) && (!this.alive(tgt.tgt) || Math.random() < (src.k === 0 ? 0.2 : src.def && src.def.taunt ? 0.75 : 0.3))) { tgt.tgt = src; tgt.ret = false; }
      tgt.active = true;
    } else if (tgt.k === 1 && src) tgt.threat = src;
    if (tgt.hp <= 0) this.kill(tgt, src);
  }

  kill(tgt, src) {
    const t = now();
    if (tgt.k === 2) {
      const def = tgt.def, cfg = this.cfg;
      this.ev(tgt.x, tgt.z, ['d', tgt.id, 2, tgt.t]);
      this.ents.delete(tgt.id);
      tgt.sp.ent = null;
      tgt.sp.deadUntil = t + (def.boss ? cfg.respawnBoss : def.elite ? cfg.respawnElite : cfg.respawnMob) * 1000;
      const names = [];
      for (const key in tgt.dmgBy) {
        const sess = this.online.get(key);
        if (!sess || (!def.boss && dist(sess.ent, tgt) > 70)) continue;
        const xp = Math.round(def.xp * cfg.xpMult), loot = {};
        for (const r of D.LOOT_KEYS) if (def[r]) { const n = Math.round(irnd(def[r][0], def[r][1]) * cfg.lootMult); if (n > 0) { this.addRes(sess.rec, r, n); loot[r] = n; } }
        sess.rec.kills = (sess.rec.kills || 0) + 1;
        this.ev(tgt.x, tgt.z, ['lt', xp, loot, Math.round(tgt.x), Math.round(tgt.z)], sess);
        this.addXp(sess, xp);
        if (def.item) { sess.rec.items = sess.rec.items || {}; sess.rec.items[def.item] = (sess.rec.items[def.item] || 0) + 1; this.send(sess, { t: 'msg', m: D.ITEMS[def.item].icon + ' Trophée obtenu : ' + D.ITEMS[def.item].name + ' !' }); }
        const chance = (def.relic !== undefined ? def.relic : def.tier >= 2 ? 0.012 : 0.004) * cfg.relicMult;
        if (Math.random() < chance) this.giveRelic(sess);
        sess.dirty = true; names.push(sess.rec.name);
      }
      if (tgt.t === 'guardian' && !tgt.sp.dungeon) for (const s2 of this.online.values()) this.send(s2, { t: 'boss', s: Math.round(cfg.respawnBoss) });
      if (tgt.sp.dungeon) { const g = tgt.sp.dungeon; g.mobs = g.mobs.filter(m => m !== tgt); }
      if (def.boss && names.length && !tgt.sp.dungeon) this.say('⚔️ ' + names.join(', ') + (names.length > 1 ? ' ont' : ' a') + ' vaincu le ' + def.name + ' !');
    } else if (tgt.k === 1) {
      this.ev(tgt.x, tgt.z, ['d', tgt.id, 1, tgt.t]);
      this.ents.delete(tgt.id);
      if (tgt.vg) { const v = tgt.gar; if (v.gar) v.gar = v.gar.filter(m => m !== tgt); v.regarAt = t + 300000; return; }
      if (tgt.gar) {
        const f = tgt.gar, by = this.ownerKey(src);
        if (f.gar) f.gar = f.gar.filter(m => m !== tgt);
        tgt.rec.deadUntil = t + this.cfg.raidDown * 1000;
        if (by && this.players[by] && this.players[f.owner]) this.report(this.players[f.owner], this.players[by].name).down++;
        return;
      }
      const sess = this.online.get(tgt.owner);
      if (sess) {
        sess.minions = sess.minions.filter(m => m !== tgt);
        if (!tgt.temp) { tgt.rec.deadUntil = t + this.cfg.minionRevive * 1000 * sess.st.revive; sess.dirty = true; }
      }
    } else {
      tgt.dead = true; tgt.hp = 0; tgt.a = 0; tgt.respawnAt = t + this.cfg.playerRespawn * 1000;
      if (tgt.sess && tgt.sess.loot) { tgt.sess.loot = null; this.send(tgt.sess, { t: 'lootx', m: '' }); }
      this.ev(tgt.x, tgt.z, ['d', tgt.id, 0, tgt.t]);
      this.send(tgt.sess, { t: 'dead', s: this.cfg.playerRespawn });
    }
  }

  addRes(rec, res, n) { rec.res[res] = Math.max(0, Math.min(this.stats(rec).cap, (rec.res[res] || 0) + n)); }
  addXp(sess, n) {
    const rec = sess.rec;
    if (rec.lvl >= D.MAX_LEVEL) return;
    rec.xp += n;
    while (rec.lvl < D.MAX_LEVEL && rec.xp >= D.xpNeed(rec.lvl)) {
      rec.xp -= D.xpNeed(rec.lvl); rec.lvl++;
      sess.ent.mh = this.heroMh(rec, sess.st); sess.ent.hp = sess.ent.mh;
      this.ev(sess.ent.x, sess.ent.z, ['lv', sess.ent.id, rec.lvl]);
      this.rosterDirty = true;
    }
    sess.dirty = true;
  }

  /* ---------- Boucle de jeu ---------- */
  tick(dt) {
    const t = now();
    const friends = [];
    for (const e of this.ents.values()) if (e.k !== 2) { e.zone = this.zoneOf(e); if (!e.dead) friends.push(e); }
    this.friends = friends;

    this.secTimer += dt;
    if (this.secTimer >= 1) {
      this.secTimer = 0;
      for (const s of this.spawns) if (!s.ent && t >= s.deadUntil && !(s.village && s.village.owner)) this.spawnMob(s);
      for (const v of this.villages) {
        if (!v.owner) continue;
        if (!this.players[v.owner]) { this.freeVillage(v); continue; }
        if ((!v.gar || v.gar.length < D.VILLAGE.guards) && t >= v.regarAt && ![...this.online.values()].some(s => s.key !== v.owner && dist(s.ent, v) < 45)) this.spawnVillageGuards(v);
      }
      for (const f of this.forts) {
        const p = f.owner && this.players[f.owner], lvl = p ? (p.b.tower || 0) : 0;
        if (!lvl) continue;
        let best = null, bd = 30;
        for (const o of this.ents.values()) {
          const d = Math.hypot(o.x - f.x, o.z - f.z); if (d >= bd) continue;
          if (o.k === 2 ? d < 28 : (!o.dead && o.zone === f && this.ownerKey(o) !== f.owner && !this.allied(f.owner, this.ownerKey(o)))) { bd = d; best = o; }
        }
        if (best) { const tp = this.fortPos(f, D.PLOTS.tower[0], D.PLOTS.tower[1]); this.ev(best.x, best.z, ['fx', 'tower', Math.round(tp.x * 10) / 10, Math.round(tp.z * 10) / 10, 0, 0, Math.round(best.x * 10) / 10, Math.round(best.z * 10) / 10]); this.damage(null, best, 8 + 12 * lvl, 's'); }
      }
      for (const g of [...this.dungeons.values()]) this.dgTick(g, t);
      this.incomeT = (this.incomeT || 0) + 1;
      if (this.incomeT >= 60) { this.incomeT = 0; for (const sess of this.online.values()) { const inc = this.villageIncome(sess.key); for (const r in inc) this.addRes(sess.rec, r, Math.round(inc[r])); if (Object.keys(inc).length) sess.dirty = true; } }
      for (const n of this.nodes) { const v = this.visOf(n); if (v !== n.vis) { n.vis = v; this.nodeChanges.push([n.id, v]); } }
      for (const sess of this.online.values()) {
        for (const rec of sess.rec.minions) if (rec.deadUntil && t >= rec.deadUntil) { delete rec.deadUntil; this.spawnMinion(sess, rec); sess.dirty = true; }
      }
      // Garnisons des absents et alertes de raid.
      for (const f of this.forts) {
        if (!f.owner) continue;
        const owner = this.online.get(f.owner), open = !this.shielded(f);
        let near = null, inside = null;
        for (const s of this.online.values()) { if (s.key === f.owner || s.ent.dead) continue; const d = dist(s.ent, f); if (d < 65) near = s; if (d < D.FORT.zone) inside = s; }
        if (!owner && open && near) { if (!f.gar) this.spawnGarrison(f); f.garSeen = t; }
        else if (f.gar && (owner || !open || t - f.garSeen > 15000)) this.clearGarrison(f);
        if (owner && open && inside && t - (f.alertAt || 0) > 45000) { f.alertAt = t; this.send(owner, { t: 'alert', m: '⚠️ ' + inside.rec.name + ' attaque ta forteresse !' }); }
      }
    }
    for (const f of this.forts) if (f.gar) for (const m of [...f.gar]) if (this.ents.has(m.id)) this.tickGarrison(m, f, dt, t);
    for (const v of this.villages) if (v.gar) for (const m of [...v.gar]) if (this.ents.has(m.id)) this.tickGarrison(m, v, dt, t);
    for (const e of [...this.ents.values()]) if (e.k === 2 && this.ents.has(e.id)) this.tickMob(e, dt, t);
    for (const sess of this.online.values()) {
      this.tickPlayer(sess, dt, t);
      for (const m of [...sess.minions]) if (this.ents.has(m.id)) this.tickMinion(m, sess, dt, t);
    }
    this.broadcast(t);
  }

  nearestFriend(m, maxD) {
    let best = null, bd = maxD;
    for (const f of this.friends) { if (f.dead) continue; const d = dist(m, f); if (d < bd) { bd = d; best = f; } }
    return best;
  }

  tickMob(m, dt, t) {
    const def = m.def, sp = m.sp;
    if (t >= m.think) {
      m.think = t + 500;
      if (m.tgt && (!this.alive(m.tgt) || dist(m, m.tgt) > def.aggro * 2 + 12)) m.tgt = null;
      if (m.tgt && dist(m, sp) > (sp.roam ? 75 : 48)) { m.tgt = null; m.ret = true; }
      if (!m.tgt && !m.ret) m.tgt = this.nearestFriend(m, def.aggro);
      m.active = !!(m.tgt || m.ret || this.nearestFriend(m, 75));
    }
    if (t < m.stunUntil) { m.a = 0; return; }
    const speed = def.speed * (t < m.slowUntil ? 0.5 : 1);
    if (m.ret) {
      this.move(m, sp.x, sp.z, speed * 1.3, dt); m.a = 1;
      m.hp = Math.min(m.mh, m.hp + m.mh * 0.25 * dt);
      if (dist(m, sp) < 1.5) { m.ret = false; m.dmgBy = {}; }
      return;
    }
    if (m.tgt) {
      const tg = m.tgt, d = dist(m, tg), reach = def.range + (tg.rad || 0.5);
      if (d > reach) { this.move(m, tg.x, tg.z, speed, dt); m.a = 1; }
      else {
        m.r = Math.atan2(tg.x - m.x, tg.z - m.z);
        if (t >= m.nextAtk) { m.nextAtk = t + def.cd * 1000; m.atkAnim = t + 350; this.damage(m, tg, def.dmg * rnd(0.85, 1.15), 'm'); }
        m.a = t < m.atkAnim ? 2 : 0;
      }
      if (def.boss && t >= m.nextSlam) {
        m.nextSlam = t + 7000;
        this.ev(m.x, m.z, ['fx', 'slam', Math.round(m.x), Math.round(m.z), 9, m.id]);
        for (const f of this.friends) if (this.alive(f) && dist(m, f) < 9) this.damage(m, f, def.dmg * 0.7, 's');
      }
      return;
    }
    if (!m.active) { m.a = 0; return; }
    if (t >= m.wt) { m.wt = t + rnd(3000, 9000); const a = rnd(0, TAU), r = rnd(0, sp.roam ? 45 : 6); m.wx = sp.x + Math.sin(a) * r; m.wz = sp.z + Math.cos(a) * r; }
    if (Math.hypot(m.wx - m.x, m.wz - m.z) > 0.6) { this.move(m, m.wx, m.wz, speed * 0.4, dt); m.a = 1; } else m.a = 0;
    if (m.hp < m.mh) m.hp = Math.min(m.mh, m.hp + m.mh * 0.05 * dt);
  }

  tickPlayer(sess, dt, t) {
    const e = sess.ent, rec = sess.rec, f = this.forts[rec.slot];
    if (e.dead) {
      if (t >= e.respawnAt) {
        const p = this.fortPos(f, D.FORT.spawn[0], D.FORT.spawn[1]);
        this.dgExit(sess, false);
        e.dead = false; e.hp = e.mh; e.x = p.x; e.z = p.z; e.lastHit = 0;
        this.send(sess, { t: 'tp', x: p.x, z: p.z, alive: 1 });
      }
      return;
    }
    if (sess.loot && sess.loot.v) {
      const v = sess.loot.v;
      if (dist(e, v) > 10 || v.owner === sess.key) { sess.loot = null; this.send(sess, { t: 'lootx', m: 'Conquête interrompue : tu t\'es éloigné.' }); }
      else if (this.villageGuarded(v)) { sess.loot = null; this.send(sess, { t: 'lootx', m: 'Conquête interrompue : des gardes sont revenus.' }); }
      else if (t >= sess.loot.until) { sess.loot = null; this.captureVillage(sess, v); }
    } else if (sess.loot) {
      const lf = sess.loot.f, sp = this.fortPos(lf, D.PLOTS.storage[0], D.PLOTS.storage[1]);
      if (e.zone !== lf || Math.hypot(sp.x - e.x, sp.z - e.z) > 9.5) { sess.loot = null; this.send(sess, { t: 'lootx', m: 'Pillage interrompu : tu t\'es éloigné.' }); }
      else if (t >= sess.loot.until) { sess.loot = null; this.finishLoot(sess, lf); }
    }
    if (t - (e.lastHit || 0) > 6000 && e.hp < e.mh) e.hp = Math.min(e.mh, e.hp + e.mh * (dist(e, f) < 30 ? 0.1 : 0.025 * sess.st.regen) * dt);
    if (e.a === 2 && t >= e.atkAnim) e.a = 0;
  }

  tickMinion(m, sess, dt, t) {
    const hero = sess.ent, f = this.forts[sess.rec.slot], rec = m.rec, role = m.temp ? 'escort' : rec.role;
    if (m.temp && t >= m.expire) { this.ev(m.x, m.z, ['d', m.id, 1, m.t]); this.ents.delete(m.id); sess.minions = sess.minions.filter(x => x !== m); return; }
    const st = sess.st, buff = t < hero.buffUntil, speed = m.def.speed * st.mSpeed * (buff ? 1.3 : 1);
    if (t >= m.think) {
      m.think = t + (role === 'escort' ? 180 : 400) + rnd(0, 80);
      let best = null, bd = 1e9;
      if (role === 'escort' && sess.order && this.alive(sess.order.tgt) && t < sess.order.until && !hero.dead) best = sess.order.tgt;
      else if (role === 'escort') {
        if (!hero.dead) for (const o of this.ents.values()) {
          if (o.dead) continue;
          const dh = dist(o, hero);
          if (o.k === 2 ? (dh < 16 && (o.tgt || dh < 12 || o === sess.tgt)) : (dh < 16 && this.enemyU(m, o))) { const d = dist(o, m); if (d < bd) { bd = d; best = o; } }
        }
      } else if (role === 'guard') {
        for (const o of this.ents.values()) if (!o.dead && (o.k === 2 ? dist(o, f) < 30 : (dist(o, f) < 40 && this.enemyU(m, o)))) { const d = dist(o, m); if (d < bd) { bd = d; best = o; } }
      } else if (this.alive(m.threat) && dist(m, m.threat) < 8 && (m.threat.k === 2 || this.enemyU(m, m.threat))) best = m.threat;
      m.tgt = best;
    }
    if (this.fight(m, speed * (role === 'escort' ? 1.25 : 1), m.def.dmg * st.mDmg * (buff ? 1.5 : 1), dt, t)) return;
    const goto = (x, z, tol, sp) => { if (Math.hypot(x - m.x, z - m.z) > tol) { this.move(m, x, z, sp || speed, dt); m.a = 1; return false; } m.a = 0; return true; };
    if (role === 'escort') {
      if (hero.dead) { const p = this.fortPos(f, 0, 8); goto(p.x, p.z, 4); return; }
      const esc = sess.minions.filter(x => x.temp || x.rec.role === 'escort'), i = esc.indexOf(m);
      const ang = hero.r + Math.PI + (i % 2 ? 1 : -1) * (0.5 + 0.55 * (Math.floor(i / 2) % 3)), rad = 3.4 + Math.floor(i / 6) * 2.2;
      const px = hero.x + Math.sin(ang) * rad, pz = hero.z + Math.cos(ang) * rad, d = Math.hypot(px - m.x, pz - m.z);
      if (d > 60) { m.x = px; m.z = pz; }
      else goto(px, pz, 1.2, speed * (d > 7 ? 1.5 : 1.1));
      return;
    }
    if (role === 'guard') {
      const g = sess.minions.filter(x => !x.temp && x.rec.role === 'guard'), i = g.indexOf(m), a = i / Math.max(1, g.length) * TAU;
      const p = this.fortPos(f, Math.sin(a) * 6, 6 + Math.cos(a) * 5);
      goto(p.x, p.z, 1);
      return;
    }
    // Récolte.
    if (m.st === 'idle') {
      const home = this.fortPos(f, (m.id % 7) - 3, 5 + (m.id % 3) * 2);
      if (t < m.timer) { goto(home.x, home.z, 1.5); return; }
      if (sess.rec.res[role] >= st.cap) { m.timer = t + 3000; return; }
      const avail = f.near[role].filter(n => this.nodeStock(n) > 0).slice(0, 4);
      if (!avail.length) { m.timer = t + 4000; return; }
      m.node = avail[Math.floor(Math.random() * avail.length)]; m.st = 'go';
    } else if (m.st === 'go') {
      const n = m.node;
      if (this.nodeStock(n) <= 0) { m.st = 'idle'; return; }
      if (goto(n.x, n.z, 1.7)) { m.st = 'work'; m.timer = t + 4000 / (m.def.work * st.work); }
    } else if (m.st === 'work') {
      m.a = 2; m.r = Math.atan2(m.node.x - m.x, m.node.z - m.z);
      if (t >= m.timer) { m.carry = this.takeNode(m.node, st.carry); m.st = m.carry > 0 ? 'back' : 'idle'; }
    } else if (m.st === 'back') {
      const p = this.fortPos(f, D.PLOTS.storage[0] + 4, D.PLOTS.storage[1] + 3);
      if (goto(p.x, p.z, 2.5)) { this.addRes(sess.rec, role, m.carry); m.carry = 0; m.st = 'idle'; sess.dirty = true; }
    }
  }

  /* ---------- Réseau ---------- */
  send(sess, obj) { if (sess && sess.conn && sess.conn.open) sess.conn.send(JSON.stringify(obj)); }
  say(text) { for (const s of this.online.values()) this.send(s, { t: 'msg', m: text }); }
  roster() { return [...this.online.values()].map(s => ({ id: s.ent.id, n: s.rec.name, c: s.rec.cls, l: s.rec.lvl, s: s.rec.slot, st: s.rec.b.stable || 0 })); }

  mePayload(sess) {
    const rec = sess.rec, t = now();
    return { t: 'me', name: rec.name, cls: rec.cls, lvl: rec.lvl, xp: rec.xp, need: D.xpNeed(rec.lvl), res: rec.res, cap: sess.st.cap, b: rec.b,
      mcap: sess.st.mcap, slot: rec.slot, dmg: Math.round(this.heroDmg(sess)), kills: rec.kills || 0, speed: sess.st.speed,
      craft: rec.craft || {}, relics: rec.relics || [], eq: rec.eq || {}, vill: this.villagesOf(sess.key).length, vinc: this.villageIncome(sess.key), allies: this.allyList(sess.key), dgBest: rec.dgBest || 0, items: rec.items || {}, mount: sess.st.mount,
      minions: rec.minions.map(m => [m.t, m.role, m.deadUntil ? Math.max(1, Math.ceil((m.deadUntil - t) / 1000)) : 0]) };
  }

  broadcast(t) {
    const V = W.view, V2 = V * V;
    const roster = this.rosterDirty ? this.roster() : null; this.rosterDirty = false;
    const nodeCh = this.nodeChanges.length ? this.nodeChanges : null; this.nodeChanges = [];
    for (const sess of this.online.values()) {
      const me = sess.ent, list = [];
      for (const e of this.ents.values()) {
        const dx = e.x - me.x, dz = e.z - me.z;
        if (dx * dx + dz * dz > V2) continue;
        let fl = 0;
        if (e.k === 2) { if (t < e.slowUntil) fl |= 1; if (t < e.stunUntil) fl |= 8; }
        else if (e.k === 1) { if (e.carry) fl |= 4; if (t < me.buffUntil && e.oid === me.id) fl |= 2; if (this.enemyU(me, e)) fl |= 32; }
        else { if (t < e.buffUntil) fl |= 2; if (e.dead) fl |= 16; if (this.enemyU(me, e)) fl |= 32; }
        list.push([e.id, e.k, e.t, Math.round(e.x * 10), Math.round(e.z * 10), Math.round(e.r * 100), Math.max(0, Math.round(e.hp)), e.mh, e.a, e.k === 1 ? e.oid : 0, fl]);
      }
      const evs = [];
      for (const ev of this.events) {
        if (ev.only ? ev.only === sess : ((ev.x - me.x) ** 2 + (ev.z - me.z) ** 2 < V2)) evs.push(ev.d);
      }
      const msg = { t: 's', e: list };
      if (evs.length) msg.ev = evs;
      if (nodeCh) msg.n = nodeCh;
      this.send(sess, msg);
      if (roster) this.send(sess, { t: 'roster', r: roster });
      if (sess.dirty) { sess.dirty = false; this.send(sess, this.mePayload(sess)); }
    }
    this.events = [];
  }

  /* ---------- Connexion ---------- */
  hashPin(pin, salt) { return crypto.scryptSync(String(pin), salt, 32).toString('hex'); }
  hashTok(tok) { return crypto.createHash('sha256').update(String(tok)).digest('hex'); }

  handle(conn, msg) {
    const sess = conn.sess;
    if (!sess) {
      if (msg.t === 'login') this.login(conn, msg);
      else if (msg.t === 'resume') this.resume(conn, msg);
      return;
    }
    switch (msg.t) {
      case 'mv': this.onMove(sess, msg); break;
      case 'atk': this.onAttack(sess); break;
      case 'sk': this.onSkill(sess, msg.i | 0); break;
      case 'build': this.onBuild(sess, String(msg.b)); break;
      case 'summon': this.onSummon(sess, String(msg.m)); break;
      case 'role': this.onRole(sess, String(msg.r), msg.d > 0 ? 1 : -1); break;
      case 'order': this.onOrder(sess); break;
      case 'role2': this.onRole2(sess, String(msg.m), String(msg.r), msg.d > 0 ? 1 : -1); break;
      case 'ally': this.onAlly(sess, String(msg.n)); break;
      case 'fly': this.onFly(sess, msg.to | 0); break;
      case 'dgenter': this.dgEnter(sess); break;
      case 'dgnext': this.dgNext(sess); break;
      case 'dgexit': this.dgExit(sess, true); break;
      case 'setrole': this.onSetRole(sess, msg.i | 0, String(msg.r)); break;
      case 'dismiss': this.onDismiss(sess, String(msg.m)); break;
      case 'recall': this.onRecall(sess); break;
      case 'loot': this.onLoot(sess); break;
      case 'craft': this.onCraft(sess, String(msg.c)); break;
      case 'equip': this.onEquip(sess, String(msg.r)); break;
      case 'ping': this.send(sess, { t: 'pong', c: msg.c }); break;
    }
  }

  login(conn, msg) {
    const name = String(msg.name || '').trim(), pin = String(msg.pin || ''), key = name.toLowerCase();
    const err = m => conn.send(JSON.stringify({ t: 'err', m, login: 1 }));
    if (!NAME_RE.test(name)) return err('Pseudo invalide (2 à 14 lettres ou chiffres).');
    if (pin.length < 4 || pin.length > 12) return err('Le code doit faire 4 à 12 caractères.');
    const t = now(), fl = this.fails.get(key);
    if (fl && fl.until > t) return err('Trop d\'essais. Réessaie dans une minute.');
    let rec = this.players[key];
    if (rec) {
      if (!crypto.timingSafeEqual(Buffer.from(this.hashPin(pin, rec.salt)), Buffer.from(rec.pin))) {
        const n = (fl ? fl.n : 0) + 1;
        this.fails.set(key, { n: n >= 5 ? 0 : n, until: n >= 5 ? t + 60000 : 0 });
        return err('Ce pseudo existe déjà et le code ne correspond pas.');
      }
      this.fails.delete(key);
    } else {
      const cls = String(msg.cls || '');
      if (!msg.create) return conn.send(JSON.stringify({ t: 'need_class' }));
      if (!D.CLASSES[cls]) return err('Choisis une classe.');
      const f = this.forts.find(x => !x.owner);
      if (!f) return err('Le monde est plein (' + W.slots + ' royaumes).');
      const salt = crypto.randomBytes(8).toString('hex');
      rec = this.players[key] = { name, pin: this.hashPin(pin, salt), salt, tok: null, cls, slot: f.s, lvl: 1, xp: 0,
        res: Object.assign({}, D.START.res), b: { throne: 1, storage: 0, barracks: 0, altar: 0, workshop: 0 },
        minions: D.START.roles.map(r => ({ t: D.CLASSES[cls].minions[0], role: r })), lastSeen: t, created: t, kills: 0, shield: t + this.cfg.newShieldH * 3600e3, reports: [], allies: [], items: {}, craft: {}, relics: [], eq: {} };
      f.owner = key;
      this.fortBroadcast(f);
      this.say('🏰 ' + name + ' fonde un royaume en Malterre.');
    }
    const tok = crypto.randomBytes(18).toString('hex');
    rec.tok = this.hashTok(tok);
    this.enter(conn, key, tok);
  }

  resume(conn, msg) {
    const key = String(msg.name || '').trim().toLowerCase(), rec = this.players[key];
    if (!rec || !rec.tok || typeof msg.tok !== 'string' || this.hashTok(msg.tok) !== rec.tok) return conn.send(JSON.stringify({ t: 'err', m: '', login: 1, silent: 1 }));
    this.enter(conn, key, msg.tok);
  }

  enter(conn, key, tok) {
    const old = this.online.get(key);
    if (old) { this.send(old, { t: 'kick', m: 'Connecté depuis un autre appareil.' }); this.leave(old); old.conn.sess = null; old.conn.close(); }
    const rec = this.players[key], t = now(), f = this.forts[rec.slot], cfg = this.cfg;
    this.clearGarrison(f);
    const reports = rec.reports && rec.reports.length ? rec.reports : null; rec.reports = [];
    // Rattrapage : ce que les ouvriers ont récolté pendant l'absence.
    const el = Math.min(t - rec.lastSeen, cfg.offlineMaxH * 3600e3) / 1000;
    let offline = null;
    if (el > 120) {
      const os = this.stats(rec), gains = {};
      for (const m of rec.minions) {
        if (!GATHER.includes(m.role)) continue;
        const work = D.MINIONS[m.t].work * os.work;
        gains[m.role] = (gains[m.role] || 0) + os.carry / (22 + 4 / work) * el * cfg.offlineRate;
      }
      const vinc = this.villageIncome(key); for (const r in vinc) gains[r] = (gains[r] || 0) + vinc[r] * el / 60;
      const got = {};
      for (const r in gains) { const before = rec.res[r]; this.addRes(rec, r, Math.floor(gains[r])); if (rec.res[r] > before) got[r] = rec.res[r] - before; }
      offline = { sec: Math.round(t - rec.lastSeen) / 1000 | 0, got };
    }
    rec.lastSeen = t;
    const p = this.fortPos(f, D.FORT.spawn[0], D.FORT.spawn[1]);
    rec.craft = rec.craft || {}; rec.relics = rec.relics || []; rec.eq = rec.eq || {}; rec.allies = rec.allies || []; rec.items = rec.items || {};
    const st = this.stats(rec), mh = this.heroMh(rec, st);
    const ent = { id: this.nextId++, k: 0, t: rec.cls, key, x: p.x, z: p.z, r: f.rot, hp: mh, mh, a: 0, dead: false, rad: 0.6,
      nextAtk: 0, cds: [0, 0, 0], buffUntil: 0, lastHit: 0, atkAnim: 0, recallAt: 0 };
    const sess = { conn, key, rec, ent, st, minions: [], dirty: true, lastMv: t, lastTp: 0, tgt: null };
    ent.sess = sess; conn.sess = sess;
    this.ents.set(ent.id, ent); this.online.set(key, sess);
    for (const m of rec.minions) {
      if (m.deadUntil > t + 120000) m.deadUntil = t + 120000; // les blessés d'un raid reviennent vite une fois le seigneur de retour
      if (!m.deadUntil || m.deadUntil <= t) { delete m.deadUntil; this.spawnMinion(sess, m); }
    }
    this.send(sess, { t: 'welcome', id: ent.id, name: rec.name, cls: rec.cls, tok, x: p.x, z: p.z, r: f.rot, cfg, offline, reports,
      nodes: this.nodes.map(n => [n.id, n.type, n.x, n.z, n.rich, n.vis]), forts: this.forts.map(x => this.fortInfo(x)), villages: this.villages.map(v => this.villInfo(v)), boss: this.bossLeft(), lords: Object.keys(this.players).map(k => ({ n: this.players[k].name, c: this.players[k].cls, l: this.players[k].lvl })) });
    this.rosterDirty = true;
    this.say('👋 ' + rec.name + ' entre en Malterre.');
  }

  leave(sess) {
    if (this.online.get(sess.key) !== sess) return;
    this.dgExit(sess, false);
    sess.rec.lastSeen = now();
    this.ents.delete(sess.ent.id);
    for (const m of sess.minions) this.ents.delete(m.id);
    for (const e of this.ents.values()) if (e.k === 2 && e.tgt && (e.tgt === sess.ent || e.tgt.owner === sess.key)) e.tgt = null;
    this.online.delete(sess.key);
    this.rosterDirty = true;
  }

  /* ---------- Actions du joueur ---------- */
  onMove(sess, msg) {
    const e = sess.ent, t = now();
    if (e.dead) return;
    let x = +msg.x, z = +msg.z; const r = +msg.r;
    if (!isFinite(x) || !isFinite(z) || !isFinite(r)) return;
    const el = Math.min(1, (t - sess.lastMv) / 1000); sess.lastMv = t;
    const max = D.CLASSES[e.t].speed * sess.st.speed * sess.st.mount * el * 1.6 + 1.5;
    let dx = x - e.x, dz = z - e.z, d = Math.hypot(dx, dz), fix = false;
    if (d > max) { x = e.x + dx / d * max; z = e.z + dz / d * max; fix = true; }
    const rr = Math.hypot(x, z);
    if (sess.dg) { const g = sess.dg, dd = Math.hypot(x - g.cx, z - g.cz), lim = D.DUNGEON.radius - 1; if (dd > lim) { x = g.cx + (x - g.cx) / dd * lim; z = g.cz + (z - g.cz) / dd * lim; fix = true; } }
    else if (landAt(e.x, e.z)) { const L2 = landAt(e.x, e.z), dd = Math.hypot(x - L2.x, z - L2.z), lim = L2.r - 3; if (dd > lim) { x = L2.x + (x - L2.x) / dd * lim; z = L2.z + (z - L2.z) / dd * lim; fix = true; } }
    else if (rr > RAD - 3) { x *= (RAD - 3) / rr; z *= (RAD - 3) / rr; fix = true; }
    e.x = x; e.z = z; e.r = r;
    if (e.a !== 2) e.a = msg.a ? 1 : 0;
    if (fix && t - sess.lastTp > 400) { sess.lastTp = t; this.send(sess, { t: 'tp', x, z }); }
  }

  pickTarget(e, range, cone) {
    let best = null, bs = 1e9;
    for (const o of this.ents.values()) {
      if (!this.foe(e, o)) continue;
      const d = dist(e, o) - o.rad;
      if (d > range) continue;
      const ad = angDiff(Math.atan2(o.x - e.x, o.z - e.z), e.r);
      if (cone && ad > cone && d > 1.2) continue;
      const s = d + (ad > 1.2 ? 9 : ad * 2);
      if (s < bs) { bs = s; best = o; }
    }
    return best;
  }
  heroDmg(sess) { return (D.CLASSES[sess.rec.cls].dmg + 1.6 * (sess.rec.lvl - 1)) * sess.st.dmg; }

  onAttack(sess) {
    const e = sess.ent, t = now(), cls = D.CLASSES[e.t];
    if (e.dead || t < e.nextAtk) return;
    const tg = this.pickTarget(e, cls.range, cls.ranged ? 0 : 1.7);
    e.a = 2; e.atkAnim = t + 300;
    if (!tg) {
      // Pas d'ennemi à portée : le héros récolte le gisement le plus proche.
      let node = null, nd = 3.6;
      for (const n of this.nodes) { if (Math.abs(n.x - e.x) > 4 || Math.abs(n.z - e.z) > 4) continue; const d = Math.hypot(n.x - e.x, n.z - e.z); if (d < nd && this.nodeStock(n) > 0) { nd = d; node = n; } }
      if (node) {
        const res = D.NODES[node.type].res, got = this.takeNode(node, sess.st.heroHarvest);
        e.nextAtk = t + 800; e.r = Math.atan2(node.x - e.x, node.z - e.z);
        this.addRes(sess.rec, res, got); sess.dirty = true;
        this.ev(e.x, e.z, ['fx', 'chop', node.x, node.z, got, e.id, res]);
        return;
      }
      e.nextAtk = t + 450; this.ev(e.x, e.z, ['fx', 'swing', Math.round(e.x), Math.round(e.z), 0, e.id]); return;
    }
    e.nextAtk = t + cls.atkCd * 1000;
    e.r = Math.atan2(tg.x - e.x, tg.z - e.z);
    sess.tgt = tg;
    const crit = Math.random() < 0.12;
    this.damage(e, tg, this.heroDmg(sess) * rnd(0.9, 1.1) * (crit ? 1.8 : 1), cls.ranged ? 'b' : 'm', crit);
  }

  onSkill(sess, i) {
    const e = sess.ent, t = now(), cls = D.CLASSES[e.t], sk = cls.skills[i];
    if (!sk || e.dead || t < e.cds[i]) return;
    const dmg = this.heroDmg(sess), fx = (name, x, z, r, x2, z2) => this.ev(e.x, e.z, ['fx', name, Math.round(x * 10) / 10, Math.round(z * 10) / 10, r, e.id, x2, z2]);
    const mobsNear = (x, z, r) => [...this.ents.values()].filter(o => this.foe(e, o) && Math.hypot(o.x - x, o.z - z) - o.rad < r);
    if (sk.kind === 'bolt') {
      const tg = this.pickTarget(e, 20, 0);
      if (!tg) return this.send(sess, { t: 'err', m: 'Aucune cible à portée.' });
      e.r = Math.atan2(tg.x - e.x, tg.z - e.z); sess.tgt = tg;
      fx('bolt', e.x, e.z, 0, Math.round(tg.x * 10) / 10, Math.round(tg.z * 10) / 10);
      this.damage(e, tg, dmg * sk.mult * rnd(0.9, 1.1), 's', true);
    } else if (sk.kind === 'nova') {
      fx('nova', e.x, e.z, sk.r);
      for (const o of mobsNear(e.x, e.z, sk.r)) { if (sk.slow) o.slowUntil = t + sk.slow; if (sk.stun) o.stunUntil = t + sk.stun; this.damage(e, o, dmg * sk.mult * rnd(0.9, 1.1), 's'); }
    } else if (sk.kind === 'summon') {
      fx('raise', e.x, e.z, 4);
      for (let n = 0; n < sk.n; n++) this.spawnMinion(sess, { t: sk.unit, role: 'escort' }, true);
    } else if (sk.kind === 'smash') {
      const px = e.x + Math.sin(e.r) * 2.5, pz = e.z + Math.cos(e.r) * 2.5;
      fx('smash', px, pz, sk.r);
      for (const o of mobsNear(px, pz, sk.r)) { o.stunUntil = t + sk.stun; this.damage(e, o, dmg * sk.mult * rnd(0.9, 1.1), 's', true); }
    } else if (sk.kind === 'bomb') {
      const tg = this.pickTarget(e, 16, 0);
      const px = tg ? tg.x : e.x + Math.sin(e.r) * 9, pz = tg ? tg.z : e.z + Math.cos(e.r) * 9;
      if (tg) { e.r = Math.atan2(tg.x - e.x, tg.z - e.z); sess.tgt = tg; }
      fx('bomb', px, pz, sk.r);
      for (const o of mobsNear(px, pz, sk.r)) this.damage(e, o, dmg * sk.mult * rnd(0.9, 1.1), 's');
    } else if (sk.kind === 'warcry') {
      e.buffUntil = t + 10000; e.hp = Math.min(e.mh, e.hp + e.mh * 0.15);
      fx('warcry', e.x, e.z, 12);
    } else if (sk.kind === 'heal') {
      e.hp = Math.min(e.mh, e.hp + e.mh * sk.pct);
      for (const m of sess.minions) if (dist(m, e) < sk.r) m.hp = Math.min(m.mh, m.hp + m.mh * sk.pct);
      fx('heal', e.x, e.z, sk.r);
    }
    e.a = 2; e.atkAnim = t + 400;
    const cd = sk.cd * sess.st.cd;
    e.cds[i] = t + cd * 1000;
    this.send(sess, { t: 'cd', i, s: cd });
  }

  onBuild(sess, b) {
    const rec = sess.rec, def = D.BUILDINGS[b], err = m => this.send(sess, { t: 'err', m });
    if (!def) return;
    const lvl = rec.b[b] || 0;
    if (lvl >= def.max) return err('Niveau maximum atteint.');
    if (b !== 'throne' && lvl >= rec.b.throne) return err('Améliore d\'abord ton trône.');
    if (b === 'throne' && rec.lvl < D.throneNeed(lvl)) return err('Ton héros doit être niveau ' + D.throneNeed(lvl) + '.');
    const cost = D.cost(b, lvl, rec.cls);
    if (!canPay(rec, cost)) return err(Object.keys(cost).some(r => r in D.ITEMS && have(rec, r) < cost[r]) ? 'Il te manque un trophée de boss.' : 'Ressources insuffisantes.');
    pay(rec, cost);
    rec.b[b] = lvl + 1;
    const e = sess.ent, f = this.forts[rec.slot];
    this.refresh(sess);
    const pl = D.PLOTS[b] || [0, 0], p = this.fortPos(f, pl[0], pl[1]);
    if (b === 'stable') this.rosterDirty = true;
    this.ev(p.x, p.z, ['fx', 'build', Math.round(p.x), Math.round(p.z), 5, e.id]);
    for (const s of this.online.values()) this.send(s, { t: 'fort', f: this.fortInfo(f) });
    sess.dirty = true;
  }

  onSummon(sess, mt) {
    const rec = sess.rec, def = D.MINIONS[mt], err = m => this.send(sess, { t: 'err', m });
    if (!def || !D.CLASSES[rec.cls].minions.includes(mt)) return;
    if ((rec.b.barracks || 0) < def.unlock) return err('Bâtiment niveau ' + def.unlock + ' requis.');
    if (rec.minions.length >= sess.st.mcap) return err('Limite de serviteurs atteinte.');
    const mc = D.minionCost(mt, rec.cls);
    for (const r in mc) if ((rec.res[r] || 0) < mc[r]) return err('Ressources insuffisantes.');
    for (const r in mc) rec.res[r] -= mc[r];
    const m = { t: mt, role: 'guard' };
    rec.minions.push(m);
    const e = this.spawnMinion(sess, m);
    this.ev(e.x, e.z, ['fx', 'summon', Math.round(e.x), Math.round(e.z), 2, sess.ent.id]);
    sess.dirty = true;
  }

  onRole(sess, role, d) {
    const rec = sess.rec;
    if (!D.ROLES[role] || role === 'guard') return;
    const fit = m => role === 'escort' ? D.MINIONS[m.t].dmg : D.MINIONS[m.t].work;
    let pick = null;
    if (d > 0) { for (const m of rec.minions) if (m.role === 'guard' && (!pick || fit(m) > fit(pick))) pick = m; if (pick) pick.role = role; }
    else { for (const m of rec.minions) if (m.role === role && (!pick || fit(m) < fit(pick))) pick = m; if (pick) pick.role = 'guard'; }
    if (!pick) return;
    const e = sess.minions.find(x => x.rec === pick);
    if (e) { e.st = 'idle'; e.tgt = null; e.carry = 0; e.timer = 0; }
    sess.dirty = true;
  }

  bossLeft() { const sp = this.spawns.find(x => x.type === 'guardian'); return sp && !sp.ent ? Math.max(1, Math.round((sp.deadUntil - now()) / 1000)) : 0; }
  // Ordre d'attaque : toute l'escorte charge la cible visée par le héros.
  onOrder(sess) {
    const e = sess.ent; if (e.dead) return;
    const tg = this.pickTarget(e, 30, 0);
    if (!tg) { sess.order = null; return this.send(sess, { t: 'err', m: 'Aucune cible en vue : l\'escorte revient vers toi.' }); }
    sess.order = { tgt: tg, until: now() + 20000 }; sess.tgt = tg;
    for (const m of sess.minions) if (m.temp || m.rec.role === 'escort') { m.tgt = tg; m.think = 0; }
    this.ev(tg.x, tg.z, ['fx', 'order', Math.round(tg.x * 10) / 10, Math.round(tg.z * 10) / 10, tg.rad + 1.5, e.id], sess);
  }
  // Répartition par type : d = +1 envoie un serviteur de ce type (pris dans la garde) à la tâche, -1 le renvoie en garde.
  onRole2(sess, mt, role, d) {
    if (!D.ROLES[role] || role === 'guard') return;
    const m = sess.rec.minions.find(x => x.t === mt && x.role === (d > 0 ? 'guard' : role));
    if (!m) return;
    m.role = d > 0 ? role : 'guard';
    const e = sess.minions.find(x => x.rec === m);
    if (e) { e.st = 'idle'; e.tgt = null; e.carry = 0; e.timer = 0; }
    sess.dirty = true;
  }
  allyList(key) {
    const rec = this.players[key], out = [];
    for (const k in this.players) { if (k === key) continue; const mine = (rec.allies || []).includes(k), theirs = (this.players[k].allies || []).includes(key); if (mine || theirs) out.push([this.players[k].name, mine && theirs ? 'on' : mine ? 'sent' : 'recv']); }
    return out;
  }
  onAlly(sess, name) {
    const key = name.trim().toLowerCase(), other = this.players[key], rec = sess.rec;
    if (!other || key === sess.key) return;
    rec.allies = rec.allies || [];
    const had = rec.allies.includes(key);
    if (had) rec.allies = rec.allies.filter(k => k !== key); else rec.allies.push(key);
    const mutual = this.allied(sess.key, key), os = this.online.get(key);
    sess.dirty = true;
    if (os) { os.dirty = true; this.send(os, { t: 'msg', m: had ? '💔 ' + rec.name + ' rompt votre alliance.' : mutual ? '🤝 Alliance conclue avec ' + rec.name + ' !' : '🤝 ' + rec.name + ' te propose une alliance (onglet Héros).' }); }
    this.send(sess, { t: 'msg', m: had ? 'Alliance rompue avec ' + other.name + '.' : mutual ? '🤝 Alliance conclue avec ' + other.name + ' !' : 'Proposition envoyée à ' + other.name + '.' });
  }

  // Vol à dos de dragon : de l'aire du dragon vers les Terres brûlées, et retour depuis la pierre d'atterrissage.
  onFly(sess, to) {
    const e = sess.ent, rec = sess.rec, f = this.forts[rec.slot], err = m => this.send(sess, { t: 'err', m });
    if (e.dead || sess.dg) return;
    const here = landAt(e.x, e.z), rp = this.fortPos(f, D.PLOTS.roost[0], D.PLOTS.roost[1]);
    let dst = null;
    if (here) { const ld = landing(here); if (Math.hypot(e.x - ld.x, e.z - ld.z) > 14) return err('Retourne à la pierre d\'atterrissage.'); dst = this.fortPos(f, D.PLOTS.roost[0] + 6, D.PLOTS.roost[1] + 4); }
    else if (Math.hypot(e.x - rp.x, e.z - rp.z) < 12) {
      const L = LANDS[to] || LANDS[0];
      if ((rec.b.roost || 0) < L.need) return err(L.need > 1 ? 'Améliore l\'aire du dragon au niveau ' + L.need + '.' : 'Construis d\'abord l\'aire du dragon.');
      const ld = landing(L); dst = { x: ld.x + 5, z: ld.z + 3 };
    } else return err('Rends-toi à ton aire du dragon.');
    e.x = dst.x; e.z = dst.z;
    for (const m of sess.minions) if (m.temp || m.rec.role === 'escort') { m.x = e.x + rnd(-3, 3); m.z = e.z + rnd(-3, 3); m.tgt = null; }
    this.send(sess, { t: 'tp', x: e.x, z: e.z, fly: 1 });
  }

  /* ---------- Donjon ---------- */
  portalPos(f) { return this.fortPos(f, D.DUNGEON.portal[0], D.DUNGEON.portal[1]); }
  dgEnter(sess) {
    const e = sess.ent, err = m => this.send(sess, { t: 'err', m });
    if (e.dead || sess.dg) return;
    if (!this.forts.some(f => { const p = this.portalPos(f); return Math.hypot(p.x - e.x, p.z - e.z) < 9; })) return err('Approche-toi d\'un portail.');
    // Un allié déjà dans le donjon ? On le rejoint à son étage.
    let g = null;
    for (const d of this.dungeons.values()) if ([...d.members].some(s => this.allied(s.key, sess.key))) { g = d; break; }
    if (!g) {
      let i = 0; while ([...this.dungeons.values()].some(d => d.slot === i)) i++;
      g = { id: this.nextId++, slot: i, cx: 3000 + i * 300, cz: 0, floor: 0, mobs: [], members: new Set(), state: 'clear', back: {} };
      this.dungeons.set(g.id, g);
    }
    g.members.add(sess); sess.dg = g; g.back[sess.key] = { x: e.x, z: e.z };
    const a = Math.random() * TAU; e.x = g.cx + Math.sin(a) * 4; e.z = g.cz - 22 + Math.cos(a) * 2;
    for (const m of sess.minions) if (m.temp || m.rec.role === 'escort') { m.x = e.x + rnd(-3, 3); m.z = e.z + rnd(-3, 3); m.tgt = null; }
    this.send(sess, { t: 'tp', x: e.x, z: e.z, dg: { cx: g.cx, cz: g.cz, floor: Math.max(1, g.floor), state: g.floor ? g.state : 'fight' } });
    if (!g.floor) this.dgSpawn(g);
  }
  dgSpawn(g) {
    g.floor++; g.state = 'fight';
    const f = g.floor, k = f - 1, boss = f % 5 === 0, P = D.DUNGEON.pools[Math.min(2, Math.floor(k / 4))], list = [];
    const n = Math.min(14, 3 + f) + Math.max(0, g.members.size - 1) * 2;
    if (boss) list.push(D.DUNGEON.bosses[(f / 5 - 1) % D.DUNGEON.bosses.length]);
    for (let i = 0; i < (boss ? Math.floor(n / 2) : n); i++) list.push(P[Math.floor(Math.random() * P.length)]);
    list.forEach((type, i) => {
      const base = D.MOBS[type], top = boss && i === 0, a = i / list.length * TAU, r = top ? 0 : 10 + Math.random() * 14;
      const def = Object.assign({}, base, { hp: Math.round(base.hp * (1 + 0.18 * k) * (top && base.boss ? 0.5 : 1)), dmg: base.dmg * (1 + 0.1 * k) * (top && base.boss ? 0.7 : 1), xp: Math.round(base.xp * (1 + 0.15 * k)), relic: 0, item: null, boss: false, elite: top || base.elite, aggro: 60 });
      const sp = { id: -1, type, x: g.cx + Math.sin(a) * r, z: g.cz + 6 + Math.cos(a) * r, roam: true, deadUntil: 0, ent: null, dungeon: g };
      const m = this.spawnMob(sp); m.def = def; m.hp = m.mh = def.hp; g.mobs.push(m);
    });
    for (const s of g.members) this.send(s, { t: 'dg', floor: g.floor, state: 'fight', boss });
  }
  dgTick(g, t) {
    if (!g.members.size) { for (const m of g.mobs) { this.ents.delete(m.id); } this.dungeons.delete(g.id); return; }
    if (g.state !== 'fight' || g.mobs.length) return;
    g.state = 'clear';
    const f = g.floor, boss = f % 5 === 0;
    for (const s of g.members) {
      const rec = s.rec, reward = { gold: 20 * f, spec: 20 * f, wood: 12 * f, stone: 12 * f };
      for (const r in reward) this.addRes(rec, r, reward[r]);
      // (les éclats d'abîme s'ajoutent plus bas, hors stock)
      this.addXp(s, 40 * f);
      const best = f > (rec.dgBest || 0); if (best) rec.dgBest = f;
      if (boss) { rec.items = rec.items || {}; rec.items.shard = (rec.items.shard || 0) + f / 5; reward.shard = f / 5; }
      if (Math.random() < (boss ? 0.35 : Math.min(0.2, 0.02 * f)) * this.cfg.relicMult) this.giveRelic(s);
      s.dirty = true;
      this.send(s, { t: 'dg', floor: f, state: 'clear', reward, best });
      if (best && boss) this.say('🌀 ' + rec.name + ' a franchi l\'étage ' + f + ' du donjon !');
    }
  }
  dgNext(sess) { const g = sess.dg; if (g && g.state === 'clear' && !sess.ent.dead) this.dgSpawn(g); }
  dgExit(sess, tp) {
    const g = sess.dg; if (!g) return;
    g.members.delete(sess); sess.dg = null; sess.order = null;
    if (tp) {
      const b = g.back[sess.key] || this.fortPos(this.forts[sess.rec.slot], D.FORT.spawn[0], D.FORT.spawn[1]), e = sess.ent;
      e.x = b.x; e.z = b.z + 3;
      for (const m of sess.minions) if (m.temp || m.rec.role === 'escort') { m.x = e.x + rnd(-3, 3); m.z = e.z + rnd(-3, 3); m.tgt = null; }
      this.send(sess, { t: 'tp', x: e.x, z: e.z, dg: null });
    } else this.send(sess, { t: 'dg', state: 'out' });
  }

  // Affecte un serviteur précis à une tâche (pour envoyer les spécialistes au bon endroit).
  onSetRole(sess, i, role) {
    const m = sess.rec.minions[i];
    if (!m || !D.ROLES[role] || m.role === role) return;
    m.role = role;
    const e = sess.minions.find(x => x.rec === m);
    if (e) { e.st = 'idle'; e.tgt = null; e.carry = 0; e.timer = 0; }
    sess.dirty = true;
  }
  onDismiss(sess, mt) {
    const rec = sess.rec;
    if (rec.minions.length <= 1) return this.send(sess, { t: 'err', m: 'Garde au moins un serviteur.' });
    let i = rec.minions.findIndex(m => m.t === mt && m.role === 'guard');
    if (i < 0) i = rec.minions.findIndex(m => m.t === mt);
    if (i < 0) return;
    const [m] = rec.minions.splice(i, 1), e = sess.minions.find(x => x.rec === m), cost = D.minionCost(mt, rec.cls);
    if (e) { this.ev(e.x, e.z, ['d', e.id, 1, e.t]); this.ev(e.x, e.z, ['fx', 'summon', Math.round(e.x), Math.round(e.z), 2, sess.ent.id]); this.ents.delete(e.id); sess.minions = sess.minions.filter(x => x !== e); }
    for (const r in cost) this.addRes(rec, r, Math.floor(cost[r] * this.cfg.refund));
    sess.dirty = true;
  }

  onRecall(sess) {
    const e = sess.ent, t = now();
    if (e.dead) return;
    if (t - (e.lastHit || 0) < 5000) return this.send(sess, { t: 'err', m: 'Impossible en plein combat.' });
    if (t < e.recallAt) return this.send(sess, { t: 'err', m: 'Retour disponible dans ' + Math.ceil((e.recallAt - t) / 1000) + ' s.' });
    e.recallAt = t + 30000; this.dgExit(sess, false);
    const p = this.fortPos(this.forts[sess.rec.slot], D.FORT.spawn[0], D.FORT.spawn[1]);
    e.x = p.x; e.z = p.z;
    this.send(sess, { t: 'tp', x: p.x, z: p.z, recall: 1 });
  }

  onCraft(sess, id) {
    const rec = sess.rec, def = D.CRAFTS[id], err = m => this.send(sess, { t: 'err', m });
    if (!def) return;
    const tier = rec.craft[id] || 0;
    if (tier >= D.CRAFT_MAX) return err('Palier maximum atteint.');
    if (tier >= (rec.b.workshop || 0)) return err('Atelier niveau ' + (tier + 1) + ' requis.');
    const cost = D.craftCost(id, tier, rec.cls);
    for (const r in cost) if ((rec.res[r] || 0) < cost[r]) return err('Ressources insuffisantes.');
    for (const r in cost) rec.res[r] -= cost[r];
    rec.craft[id] = tier + 1;
    this.refresh(sess);
    const p = this.fortPos(this.forts[rec.slot], D.PLOTS.workshop[0], D.PLOTS.workshop[1]);
    this.ev(p.x, p.z, ['fx', 'build', Math.round(p.x), Math.round(p.z), 5, sess.ent.id]);
  }
  giveRelic(sess) {
    const rec = sess.rec, left = Object.keys(D.RELICS).filter(id => !rec.relics.includes(id));
    if (!left.length) { this.addRes(rec, 'gold', 100); return this.send(sess, { t: 'msg', m: '🏺 Relique en double : +100 or.' }); }
    const id = left[Math.floor(Math.random() * left.length)], type = D.RELICS[id].type;
    rec.relics.push(id);
    const auto = !rec.eq[type]; if (auto) rec.eq[type] = id;
    this.refresh(sess);
    this.send(sess, { t: 'relic', id, auto });
    this.say('🏺 ' + rec.name + ' a trouvé une relique : ' + D.RELICS[id].name + ' !');
  }
  onEquip(sess, id) {
    const rec = sess.rec, def = D.RELICS[id];
    if (!def || !rec.relics.includes(id)) return;
    rec.eq[def.type] = rec.eq[def.type] === id ? null : id;
    this.refresh(sess);
    // Un étendard retiré peut laisser trop de serviteurs : les derniers invoqués attendent sans être perdus.
  }
  villageGuarded(v) { return v.owner ? !!(v.gar && v.gar.length) : v.spawns.some(s => s.ent); }
  onLoot(sess) {
    const e = sess.ent, f = e.zone, err = m => this.send(sess, { t: 'err', m });
    if (e.dead || sess.loot) return;
    const v = this.villages.find(x => dist(x, e) < 9);
    if (v) {
      if (v.owner === sess.key) return err('Ce village est déjà à toi.');
      if (v.owner && this.allied(v.owner, sess.key)) return err('Ce village appartient à un allié.');
      if (v.shieldUntil > now()) return err('Ce village vient d\'être conquis, il est encore protégé.');
      if (this.villagesOf(sess.key).length >= this.cfg.villageMax) return err('Tu tiens déjà ' + this.cfg.villageMax + ' villages, le maximum.');
      if (this.villageGuarded(v)) return err('Élimine d\'abord tous les gardes du village.');
      sess.loot = { v, until: now() + this.cfg.captureTime * 1000 };
      this.send(sess, { t: 'lootc', s: this.cfg.captureTime });
      const owner = v.owner && this.online.get(v.owner);
      if (owner) this.send(owner, { t: 'alert', m: '🚨 ' + sess.rec.name + ' s\'empare d\'un de tes villages !' });
      return;
    }
    if (!f || f.owner === sess.key) return err('Aucune forteresse à piller ici.');
    if (this.allied(f.owner, sess.key)) return err('On ne pille pas un allié.');
    const sp = this.fortPos(f, D.PLOTS.storage[0], D.PLOTS.storage[1]);
    if (Math.hypot(sp.x - e.x, sp.z - e.z) > 8) return err('Approche-toi de la réserve.');
    const lt = this.cfg.lootTime + 3 * ((this.players[f.owner].b.moat) || 0);
    sess.loot = { f, until: now() + lt * 1000 };
    this.send(sess, { t: 'lootc', s: lt });
    const owner = this.online.get(f.owner);
    if (owner) { f.alertAt = now(); this.send(owner, { t: 'alert', m: '🚨 ' + sess.rec.name + ' pille ta réserve !' }); }
  }
  finishLoot(sess, f) {
    const rec = sess.rec, victim = this.players[f.owner], t = now(), got = {}, cap = sess.st.cap, frac = this.cfg.raidLoot * this.stats(victim || rec).lootTaken;
    if (!victim || this.shielded(f)) return;
    let total = 0;
    for (const r in D.RES) {
      const n = Math.max(0, Math.min(Math.floor((victim.res[r] || 0) * frac), cap - (rec.res[r] || 0)));
      victim.res[r] -= n; rec.res[r] = (rec.res[r] || 0) + n; got[r] = n; total += n;
    }
    victim.shield = t + this.cfg.raidShieldH * 3600e3;
    rec.shield = 0; // qui pille perd sa propre protection
    this.report(victim, rec.name).lost = got;
    this.clearGarrison(f);
    this.fortBroadcast(f); this.fortBroadcast(this.forts[rec.slot]);
    const sp = this.fortPos(f, D.PLOTS.storage[0], D.PLOTS.storage[1]);
    this.ev(sp.x, sp.z, ['fx', 'loot', Math.round(sp.x), Math.round(sp.z), 6, sess.ent.id]);
    this.send(sess, { t: 'looted', got, from: victim.name });
    sess.dirty = true;
    const owner = this.online.get(f.owner);
    if (owner) { owner.dirty = true; owner.rec.reports = []; this.send(owner, { t: 'alert', m: '💰 ' + rec.name + ' a pillé ta forteresse (' + total + ' ressources perdues).' }); }
    this.say('⚔️ ' + rec.name + ' a pillé le royaume de ' + victim.name + ' !');
  }

  /* ---------- Sauvegarde et administration ---------- */
  serialize() {
    const t = now(), nodes = {}, dead = {};
    for (const s of this.online.values()) s.rec.lastSeen = t;
    for (const n of this.nodes) if (this.nodeStock(n) < n.max) nodes[n.id] = [n.stock, n.ts];
    for (const s of this.spawns) if (s.deadUntil > t) dead[s.id] = s.deadUntil;
    const villages = {}; for (const v of this.villages) if (v.owner) villages[v.id] = [v.owner, v.shieldUntil];
    return { v: 4, cfgV: D.CONFIG_VERSION, epoch: D.WORLD_EPOCH, villages, seed: this.seed, created: this.created, cfg: this.cfg, players: this.players, nodes, dead };
  }

  adminState() {
    const t = now();
    return {
      created: this.created, cfg: this.cfg, defaults: D.CONFIG, labels: D.CONFIG_LABELS, slots: W.slots,
      mobs: [...this.ents.values()].filter(e => e.k === 2).length, mobsTotal: this.spawns.length, nodes: this.nodes.length,
      players: Object.keys(this.players).map(k => { const p = this.players[k]; return { name: p.name, cls: D.CLASSES[p.cls].name, lvl: p.lvl, slot: p.slot, online: this.online.has(k), res: p.res, b: p.b, minions: p.minions.length, kills: p.kills || 0, villages: this.villagesOf(k).length, shield: Math.max(0, Math.round(((p.shield || 0) - t) / 1000)), ago: Math.round((t - p.lastSeen) / 1000) }; }),
    };
  }

  kickAll(m) { for (const s of [...this.online.values()]) { this.send(s, { t: 'kick', m }); this.leave(s); s.conn.sess = null; s.conn.close(); } }

  admin(a) {
    const key = String(a.name || '').trim().toLowerCase(), rec = this.players[key];
    switch (a.action) {
      case 'give': {
        if (!rec) return { error: 'Joueur introuvable.' };
        for (const r in D.RES) { const n = Math.round(+((a.res || {})[r]) || 0); if (n) this.addRes(rec, r, n); }
        rec.items = rec.items || {}; for (const k in D.ITEMS) { const n = Math.round(+((a.items || {})[k]) || 0); if (n) rec.items[k] = Math.max(0, (rec.items[k] || 0) + n); }
        if (+a.xp > 0 && this.online.has(key)) this.addXp(this.online.get(key), Math.round(+a.xp));
        const s = this.online.get(key); if (s) s.dirty = true;
        return { ok: 'Ressources données à ' + rec.name + '.' };
      }
      case 'delPlayer': {
        if (!rec) return { error: 'Joueur introuvable.' };
        const s = this.online.get(key);
        if (s) { this.send(s, { t: 'kick', m: 'Ton royaume a été réinitialisé par l\'admin.' }); this.leave(s); s.conn.sess = null; s.conn.close(); }
        const f = this.forts[rec.slot]; this.clearGarrison(f); f.owner = null;
        delete this.players[key];
        for (const v of this.villagesOf(key)) this.freeVillage(v);
        this.fortBroadcast(f);
        return { ok: rec.name + ' supprimé.' };
      }
      case 'resetWorld': {
        for (const n of this.nodes) { n.stock = n.max; n.ts = 0; }
        for (const s of this.spawns) if (!s.ent) this.spawnMob(s); else { s.ent.hp = s.ent.mh; }
        return { ok: 'Gisements et mobs remis à neuf.' };
      }
      case 'resetFull': {
        this.kickAll('Le monde a été réinitialisé.');
        this.players = {}; this.ents.clear(); for (const f of this.forts) f.gar = null; this.seed = (Math.random() * 1e9) | 0; this.created = now();
        this.genWorld({});
        return { ok: 'Monde entièrement réinitialisé.' };
      }
      case 'setCfg': {
        for (const k in D.CONFIG) { const v = +((a.cfg || {})[k]); if (isFinite(v) && v >= 0 && v <= 1e6) this.cfg[k] = v; }
        if (this.cfg.regenNode < 1) this.cfg.regenNode = 1;
        return { ok: 'Réglages enregistrés.' };
      }
      case 'relic': {
        const s2 = this.online.get(key);
        if (!s2) return { error: 'Le joueur doit être en ligne.' };
        this.giveRelic(s2);
        return { ok: 'Relique donnée à ' + rec.name + '.' };
      }
      case 'shield': {
        if (!rec) return { error: 'Joueur introuvable.' };
        rec.shield = +a.hours > 0 ? now() + Math.min(720, +a.hours) * 3600e3 : 0;
        this.fortBroadcast(this.forts[rec.slot]);
        return { ok: (+a.hours > 0 ? 'Bouclier posé sur ' : 'Bouclier retiré de ') + rec.name + '.' };
      }
      case 'say': { const m = String(a.text || '').slice(0, 140); if (m) this.say('📣 ' + m); return { ok: 'Message envoyé.' }; }
      default: return { error: 'Action inconnue.' };
    }
  }
}

module.exports = { Game };
