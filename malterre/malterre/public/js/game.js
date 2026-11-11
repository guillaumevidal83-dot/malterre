/* Malterre — client : réseau, contrôles, rendu, interface. */
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const D = DATA, TAU = Math.PI * 2, WR = DATA.WORLD.radius;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* indisponible */ } }, del(k) { try { localStorage.removeItem(k); } catch (e) { /* indisponible */ } } };

  const cv = $('gl'), ov = $('ov'), octx = ov.getContext('2d');
  let eng;
  try { eng = new Engine(cv); } catch (e) { $('loginErr').textContent = 'Ton navigateur ne gère pas la 3D (WebGL).'; $('loginBtn').disabled = true; return; }
  Models.init(eng);

  const S = {
    ws: null, inGame: false, id: 0, me: null, ents: new Map(), nodes: [], forts: [], roster: new Map(), cfg: {},
    x: 0, z: 0, r: 0, moving: false, dead: false, hp: 1, mh: 1, atkT: -9, ph: 0,
    camYaw: 0, camPitch: 0.52, camDist: 15, lastDrag: -9,
    cds: [0, 0, 0], cdMax: [1, 1, 1], nextAtk: 0, atkHeld: false, recallAt: 0,
    shake: 0, floats: [], parts: [], rings: [], projs: [], time: 0, tier: 0, zoneKey: '', seen: 0, sfxBudget: 0,
    lootEnd: 0, lootDur: 1, quality: store.get('malterre_q') || 'med', tab: 'fort', sheet: false, deathAt: 0, lastSend: 0, lastSent: '', pending: null,
  };
  const ICON = { lich: '💀', goblin: '👺' };
  const BICON = { throne: '👑', storage: '📦', barracks: '⚰️', altar: '🔮', workshop: '⚒️' };
  const MICON = { skeleton: '💀', zombie: '🧟', goblin: '👺', brute: '👹' };
  const ZONES = ['', 'Terres calmes', 'Bois sombres', 'Terres maudites'];
  const ZSUB = ['', 'Les bêtes y sont faibles', 'Araignées et orcs rôdent', 'Seuls les plus forts en reviennent'];
  const SKY = [null,
    { fog: [0.62, 0.75, 0.84], amb: [0.56, 0.57, 0.6], sun: [0.68, 0.64, 0.56], near: 70, far: 122 },
    { fog: [0.3, 0.4, 0.38], amb: [0.44, 0.48, 0.47], sun: [0.42, 0.44, 0.38], near: 55, far: 108 },
    { fog: [0.2, 0.14, 0.2], amb: [0.42, 0.36, 0.44], sun: [0.4, 0.27, 0.27], near: 42, far: 96 }];
  const sky = { fog: [0.62, 0.75, 0.84], amb: [0.56, 0.57, 0.6], sun: [0.68, 0.64, 0.56], near: 70, far: 122 };
  const slotColor = s => hex(D.COLORS[s % D.COLORS.length]);

  /* ================= Réseau ================= */
  function connect() {
    const ws = S.ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    ws.onopen = () => {
      if (S.pending) { send(S.pending); }
      else { const n = store.get('malterre_name'), t = store.get('malterre_tok'); if (n && t) send({ t: 'resume', name: n, tok: t }); }
    };
    ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } try { handle(m); } catch (e) { console.error(e); } };
    ws.onclose = () => {
      if (S.ws !== ws) return;
      if (S.inGame) { $('net').hidden = false; S.pending = null; }
      setTimeout(connect, 2500);
    };
  }
  function send(o) { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(o)); }

  function handle(m) {
    switch (m.t) {
      case 'welcome': onWelcome(m); break;
      case 's': onSnap(m); break;
      case 'me': S.me = m; updHero(); updRes(); if (S.sheet) renderSheet(); break;
      case 'roster': S.roster.clear(); for (const p of m.r) S.roster.set(p.id, p); $('online').textContent = m.r.length + ' en ligne'; break;
      case 'fort': S.forts[m.f.s] = stamp(m.f); S.zoneKey = ''; if (S.sheet) renderSheet(); break;
      case 'relic': { const r = D.RELICS[m.id]; modal('<div style="font-size:54px">' + r.icon + '</div><h2>Relique trouvée !</h2><p class="gain">' + esc(r.name) + '</p><p>' + esc(r.desc) + '</p><p>' + (m.auto ? 'Elle est équipée (' + D.RELIC_TYPES[r.type] + ').' : 'Équipe-la depuis l\'onglet Héros.') + '</p><button class="btn gold wide" id="modalOk">Parfait</button>'); Sound.play('levelup'); Sound.vibrate([50, 50, 50, 50, 200]); break; }
      case 'alert': toast(m.m, 'err'); Sound.play('alert'); Sound.vibrate([80, 60, 80, 60, 160]); break;
      case 'lootc': S.lootEnd = S.time + m.s; S.lootDur = m.s; Sound.play('summon'); break;
      case 'lootx': S.lootEnd = 0; if (m.m) { toast(m.m, 'err'); Sound.play('error'); } break;
      case 'looted': { S.lootEnd = 0; const g = Object.keys(m.got).filter(r => m.got[r] > 0).map(r => '+' + m.got[r] + ' ' + resIcon(r)).join('  '); toast('💰 Royaume de ' + m.from + ' pillé !  ' + (g || 'Ses coffres étaient vides.'), 'good'); Sound.play('levelup'); Sound.vibrate([40, 40, 40, 40, 150]); break; }
      case 'msg': toast(m.m); break;
      case 'err':
        if (m.login) { $('loginBtn').disabled = false; if (!m.silent) $('loginErr').textContent = m.m; else { store.del('malterre_tok'); } S.pending = null; if (S.inGame) leaveGame(); }
        else { toast(m.m, 'err'); Sound.play('error'); }
        break;
      case 'need_class': $('classPick').hidden = false; $('loginBtn').disabled = false; $('loginBtn').textContent = 'Fonder mon royaume'; $('loginErr').textContent = ''; S.pending = null; break;
      case 'cd': S.cds[m.i] = S.time + m.s; S.cdMax[m.i] = m.s; break;
      case 'tp':
        S.x = m.x; S.z = m.z;
        if (m.alive) { S.dead = false; $('deathScreen').hidden = true; Sound.play('recall'); }
        if (m.recall) { Sound.play('recall'); ring(m.x, m.z, 0.5, 5, 0.6, [0.7, 0.5, 1.6]); S.recallAt = S.time + 30; }
        break;
      case 'dead': S.dead = true; S.deathAt = S.time + m.s; $('deathScreen').hidden = false; Sound.play('death'); Sound.vibrate([120, 60, 200]); S.shake = 1; break;
      case 'kick': toast(m.m, 'err'); store.del('malterre_tok'); leaveGame(); $('loginErr').textContent = m.m; break;
    }
  }

  const stamp = f => { f.shEnd = f.sh > 0 ? S.time + f.sh : 0; return f; };
  const fmtDur = s => s >= 3600 ? Math.floor(s / 3600) + ' h ' + Math.floor(s % 3600 / 60) + ' min' : Math.max(1, Math.ceil(s / 60)) + ' min';
  function onWelcome(m) {
    S.wcls = m.cls; S.id = m.id; S.x = m.x; S.z = m.z; S.r = m.r; S.camYaw = m.r; S.cfg = m.cfg; S.dead = false;
    S.nodes = m.nodes.map(n => ({ id: n[0], type: n[1], x: n[2], z: n[3], rich: n[4], vis: n[5], variant: n[0] % 3, rot: (n[0] * 2.399) % TAU, s: 0.85 + ((n[0] * 7) % 10) / 28 }));
    S.forts = m.forts.map(stamp); S.lootEnd = 0; S.zoneKey = ''; S.ents.clear(); S.parts = []; S.floats = []; S.rings = []; S.projs = [];
    store.set('malterre_name', m.name); store.set('malterre_tok', m.tok);
    S.pending = null; S.inGame = true;
    $('login').hidden = true; $('hud').hidden = false; $('net').hidden = true; $('deathScreen').hidden = true;
    let html = '';
    if (m.reports) for (const r of m.reports) {
      const lost = r.lost ? Object.keys(r.lost).filter(k => r.lost[k] > 0).map(k => '<div class="gain" style="color:var(--bad)">−' + r.lost[k] + ' ' + resIcon(k) + '</div>').join('') : '';
      html += '<h2>⚔️ Raid de ' + esc(r.by) + '</h2>' + (r.lost ? (lost || '<p>Il est reparti les mains vides.</p>') : '<p>Il n\'a pas réussi à piller ta réserve.</p>') + (r.down ? '<p>' + r.down + ' serviteur(s) de ta garnison mis hors de combat.</p>' : '');
    }
    if (m.offline) {
      const o = m.offline, h = Math.floor(o.sec / 3600), mn = Math.floor(o.sec % 3600 / 60);
      const lines = Object.keys(o.got).map(r => '<div class="gain">+' + o.got[r] + ' ' + resIcon(r) + '</div>').join('');
      html += '<h2>Pendant ton absence</h2><p>' + (h ? h + ' h ' : '') + mn + ' min se sont écoulées.</p>' + (lines || '<p>Tes serviteurs n\'ont rien rapporté (aucun ouvrier, ou stock plein).</p>');
    }
    if (html) modal(html + '<button class="btn gold wide" id="modalOk">Reprendre</button>');
  }
  function leaveGame() {
    S.inGame = false; S.sheet = false;
    $('hud').hidden = true; $('sheet').hidden = true; $('login').hidden = false; $('net').hidden = true; $('loginBtn').disabled = false;
  }

  function onSnap(m) {
    const seen = ++S.seen;
    for (const a of m.e) {
      let e = S.ents.get(a[0]);
      const x = a[3] / 10, z = a[4] / 10;
      if (!e) { e = { id: a[0], k: a[1], t: a[2], x, z, r: a[5] / 100, flash: 0, atkT: -9, ph: Math.random() * 6, born: S.time }; S.ents.set(e.id, e); }
      e.tx = x; e.tz = z; e.tr = a[5] / 100; e.hp = a[6]; e.mh = a[7]; e.a = a[8]; e.o = a[9]; e.fl = a[10]; e.seen = seen;
      if (e.id === S.id) { S.hp = e.hp; S.mh = e.mh; }
    }
    S.sfxBudget = 5;
    if (m.ev) for (const ev of m.ev) onEvent(ev);
    for (const [id, e] of S.ents) if (e.seen !== seen) S.ents.delete(id);
    if (m.n) for (const c of m.n) if (S.nodes[c[0]]) S.nodes[c[0]].vis = c[1];
    updHp();
  }
  const dme = (x, z) => Math.hypot(x - S.x, z - S.z);
  function sfx(name, x, z) { if (S.sfxBudget-- > 0) Sound.play(name, x === undefined ? 0 : dme(x, z)); }
  const isMine = e => e && (e.id === S.id || e.o === S.id);

  function onEvent(ev) {
    const k = ev[0];
    if (k === 'h') {
      const src = S.ents.get(ev[1]), tg = S.ents.get(ev[2]), dmg = ev[3], crit = ev[4], kind = ev[5];
      if (!tg) return;
      const tx = tg.id === S.id ? S.x : tg.x, tz = tg.id === S.id ? S.z : tg.z;
      tg.flash = 1;
      const mine = isMine(src), onMe = tg.id === S.id;
      const hgt = Models.get(modelOf(tg)).h * mscale(tg) + 0.3;
      floatText(tx, hgt, tz, (crit ? '💥' : '') + dmg, mine ? (crit ? '#ffd34d' : '#ffffff') : onMe ? '#ff5a4d' : tg.o === S.id ? '#ff9d8a' : '#c9c4d6', crit ? 20 : mine || onMe ? 16 : 12);
      if (src) {
        src.atkT = S.time;
        if (src.id === S.id) { S.atkT = S.time; S.r = Math.atan2(tx - S.x, tz - S.z); Sound.vibrate(crit ? 35 : 12); }
        if (kind === 'b') { const sx = src.id === S.id ? S.x : src.x, sz = src.id === S.id ? S.z : src.z; S.projs.push({ x0: sx, y0: 2.2, z0: sz, x1: tx, y1: hgt * 0.6, z1: tz, t: 0, dur: 0.14, col: [0.5, 1.9, 0.9], size: 0.28 }); }
      }
      burst(tx, hgt * 0.55, tz, tg.k === 2 ? [0.75, 0.1, 0.1] : [0.85, 0.82, 0.75], 3, 2.5);
      if (onMe) { sfx('hurt'); Sound.vibrate(dmg > S.mh * 0.15 ? [60, 30, 60] : 40); S.shake = Math.max(S.shake, 0.35); const v = $('vignette'); v.style.transition = 'none'; v.style.opacity = 0.8; requestAnimationFrame(() => { v.style.transition = 'opacity .6s'; v.style.opacity = S.hp / S.mh < 0.3 ? 0.45 : 0; }); }
      else sfx(kind === 'b' ? 'bolt' : crit ? 'crit' : 'hit', tx, tz);
    } else if (k === 'd') {
      const e = S.ents.get(ev[1]); if (!e) return;
      const big = ev[2] === 2 && (D.MOBS[ev[3]] || {}).rad > 1.2;
      burst(e.x, 1, e.z, ev[2] === 2 ? [0.6, 0.12, 0.12] : ev[2] === 1 ? [0.85, 0.82, 0.75] : [0.5, 0.2, 0.7], big ? 40 : 14, big ? 7 : 4.5);
      ring(e.x, e.z, 0.3, big ? 6 : 2.2, 0.4, [0.9, 0.9, 0.9]);
      if (ev[2] !== 0) sfx(ev[2] === 2 ? 'mobdie' : 'miniondie', e.x, e.z);
      if (ev[2] === 1 && e.o === S.id && ev[3] !== 'raised') { Sound.vibrate(25); }
      if (big) S.shake = Math.max(S.shake, 0.5);
    } else if (k === 'fx') {
      const name = ev[1], x = ev[2], z = ev[3], r = ev[4], src = S.ents.get(ev[5]), mine = ev[5] === S.id, near = dme(x, z) < 22;
      if (src) src.atkT = S.time; if (mine) S.atkT = S.time;
      if (name === 'swing') sfx('swing', x, z);
      else if (name === 'chop') { burst(x, 1.2, z, ev[6] === 'wood' ? [0.5, 0.34, 0.2] : ev[6] === 'gold' ? [1.6, 1.2, 0.3] : [0.6, 0.6, 0.62], 6, 3); sfx('hit', x, z); if (mine) { S.r = Math.atan2(x - S.x, z - S.z); floatText(x, 2.6, z, '+' + ev[4] + ' ' + resIcon(ev[6]), '#ffe29a', 15, 1); Sound.vibrate(10); } }
      else if (name === 'bolt') { S.projs.push({ x0: x, y0: 2.4, z0: z, x1: ev[6], y1: 1.2, z1: ev[7], t: 0, dur: 0.22, col: [0.9, 0.4, 2.2], size: 0.6, boom: [0.8, 0.4, 2] }); sfx('bigbolt', x, z); if (mine) Sound.vibrate([15, 20, 40]); }
      else if (name === 'nova') { ring(x, z, 0.5, r, 0.5, [0.25, 0.7, 2.2]); ring(x, z, 0.2, r * 0.7, 0.65, [0.5, 1.0, 2.4]); for (let i = 0; i < 26; i++) { const a = i / 26 * TAU; part(x + Math.sin(a) * 1.5, 0.6, z + Math.cos(a) * 1.5, Math.sin(a) * 13, 1.5, Math.cos(a) * 13, 0.55, 0.3, [1.3, 1.7, 2.3], 2); } sfx('nova', x, z); if (mine) Sound.vibrate([20, 30, 50]); }
      else if (name === 'raise') { ring(x, z, 0.5, 4.5, 0.8, [0.4, 1.9, 0.8]); for (let i = 0; i < 24; i++) part(x + (Math.random() - 0.5) * 6, 0.1, z + (Math.random() - 0.5) * 6, 0, 3 + Math.random() * 4, 0, 0.9, 0.25, [0.4, 1.9, 0.8], -1); sfx('raise', x, z); if (mine) Sound.vibrate([30, 40, 30, 40, 60]); }
      else if (name === 'smash') { ring(x, z, 0.5, r, 0.35, [2, 1.2, 0.4]); burst(x, 0.3, z, [0.5, 0.42, 0.3], 22, 7); sfx('smash', x, z); if (near) S.shake = Math.max(S.shake, mine ? 0.7 : 0.4); if (mine) Sound.vibrate(70); }
      else if (name === 'bomb') { ring(x, z, 0.5, r, 0.4, [2.4, 1.2, 0.3]); burst(x, 0.8, z, [2.4, 1.1, 0.2], 30, 9); burst(x, 0.5, z, [0.25, 0.22, 0.2], 14, 5); sfx('bomb', x, z); if (near) S.shake = Math.max(S.shake, 0.6); if (mine) Sound.vibrate([20, 60, 90]); }
      else if (name === 'warcry') { ring(x, z, 1, r, 0.7, [2.2, 0.5, 0.3]); ring(x, z, 0.5, r * 0.6, 0.9, [2.2, 1.2, 0.3]); sfx('warcry', x, z); if (mine) Sound.vibrate([40, 40, 40, 40, 120]); }
      else if (name === 'slam') { ring(x, z, 1, r, 0.5, [2, 0.3, 0.2]); burst(x, 0.4, z, [0.4, 0.36, 0.34], 40, 10); sfx('slam', x, z); if (dme(x, z) < 40) { S.shake = Math.max(S.shake, 0.9); Sound.vibrate([90, 40, 90]); } }
      else if (name === 'build') { ring(x, z, 1, 7, 0.9, [2.2, 1.7, 0.5]); burst(x, 0.5, z, [0.7, 0.62, 0.5], 30, 6); for (let i = 0; i < 16; i++) part(x + (Math.random() - 0.5) * 6, 0.2, z + (Math.random() - 0.5) * 6, 0, 4 + Math.random() * 5, 0, 1.1, 0.25, [2.2, 1.7, 0.5], -0.5); sfx('build', x, z); if (mine) Sound.vibrate([30, 60, 30, 60, 120]); }
      else if (name === 'loot') { ring(x, z, 1, 8, 1, [2.4, 1.8, 0.4]); burst(x, 1, z, [2.4, 1.8, 0.4], 40, 8); sfx('build', x, z); }
      else if (name === 'summon') { ring(x, z, 0.3, 2.6, 0.6, [0.5, 1.8, 0.9]); burst(x, 1, z, [0.5, 1.8, 0.9], 14, 3); sfx('summon', x, z); if (mine) Sound.vibrate(30); }
    } else if (k === 'lt') {
      floatText(ev[3], 3.2, ev[4], '+' + ev[1] + ' XP', '#c9a6ff', 15, 1.6);
      const bits = Object.keys(ev[2]).map(r => '+' + ev[2][r] + ' ' + resIcon(r));
      if (bits.length) floatText(ev[3], 2.3, ev[4], bits.join('  '), '#ffe29a', 14, 1.6);
      sfx('loot');
    } else if (k === 'lv') {
      const e = S.ents.get(ev[1]); if (!e) return;
      const x = e.id === S.id ? S.x : e.x, z = e.id === S.id ? S.z : e.z;
      ring(x, z, 0.5, 6, 1, [2.4, 1.9, 0.5]); for (let i = 0; i < 30; i++) part(x + (Math.random() - 0.5) * 3, 0.2, z + (Math.random() - 0.5) * 3, 0, 5 + Math.random() * 6, 0, 1.2, 0.22, [2.4, 1.9, 0.5], -1);
      if (e.id === S.id) { toast('⭐ Niveau ' + ev[2] + ' !', 'good'); Sound.play('levelup'); Sound.vibrate([30, 50, 30, 50, 100]); }
    }
  }

  /* ================= Effets ================= */
  function part(x, y, z, vx, vy, vz, life, size, col, grav) { if (S.parts.length < 260) S.parts.push({ x, y, z, vx, vy, vz, life, max: life, size, col, g: grav === undefined ? 14 : grav * 14 / 2 }); }
  function burst(x, y, z, col, n, sp) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = sp * (0.4 + Math.random() * 0.6); part(x, y, z, Math.sin(a) * v, 2 + Math.random() * sp, Math.cos(a) * v, 0.5 + Math.random() * 0.4, 0.14 + Math.random() * 0.16, col); } }
  function ring(x, z, r0, r1, life, col) { S.rings.push({ x, z, r0, r1, life, max: life, col }); }
  function floatText(x, y, z, text, color, size, life) { if (S.floats.length > 40) S.floats.shift(); S.floats.push({ x: x + (Math.random() - 0.5) * 0.8, y, z, text, color, size, life: life || 0.9, max: life || 0.9 }); }
  function toast(text, cls) {
    const box = $('toasts'), el = document.createElement('div');
    el.className = 'toast' + (cls ? ' ' + cls : ''); el.textContent = text; box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => { el.style.opacity = 0; setTimeout(() => el.remove(), 500); }, 3600);
  }
  function modal(html) { $('modalBox').innerHTML = html; $('modal').hidden = false; const ok = $('modalOk'); if (ok) ok.onclick = () => { $('modal').hidden = true; Sound.init(); Sound.play('click'); }; }

  /* ================= Contrôles ================= */
  const capture = (el, id) => { try { el.setPointerCapture(id); } catch (e) { /* pointeur déjà relâché */ } };
  const joy = { id: null, x: 0, y: 0, bx: 0, by: 0 }, keys = {};
  const jz = $('joyZone'), jb = $('joyBase'), jk = $('joyKnob');
  function joyMove(e) { const dx = e.clientX - joy.bx, dy = e.clientY - joy.by, d = Math.hypot(dx, dy), m = Math.min(d, 48); joy.x = d ? dx / d * m / 48 : 0; joy.y = d ? -dy / d * m / 48 : 0; jk.style.transform = 'translate(' + joy.x * 48 + 'px,' + -joy.y * 48 + 'px)'; }
  jz.addEventListener('pointerdown', e => {
    if (joy.id !== null) return; Sound.init();
    joy.id = e.pointerId; capture(jz, e.pointerId);
    const r = jz.getBoundingClientRect(); joy.bx = e.clientX; joy.by = e.clientY;
    jb.style.left = (e.clientX - r.left - 58) + 'px'; jb.style.top = (e.clientY - r.top - 58) + 'px'; jb.style.bottom = 'auto';
    joyMove(e);
  });
  jz.addEventListener('pointermove', e => { if (e.pointerId === joy.id) joyMove(e); });
  const joyEnd = e => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; jk.style.transform = ''; jb.style.left = ''; jb.style.top = ''; jb.style.bottom = ''; };
  jz.addEventListener('pointerup', joyEnd); jz.addEventListener('pointercancel', joyEnd);

  const drag = new Map();
  cv.addEventListener('pointerdown', e => { Sound.init(); drag.set(e.pointerId, [e.clientX, e.clientY]); capture(cv, e.pointerId); });
  cv.addEventListener('pointermove', e => {
    const p = drag.get(e.pointerId); if (!p) return;
    if (drag.size === 2) { // pincer pour zoomer
      const o = [...drag.entries()].find(x => x[0] !== e.pointerId)[1], d0 = Math.hypot(p[0] - o[0], p[1] - o[1]), d1 = Math.hypot(e.clientX - o[0], e.clientY - o[1]);
      S.camDist = clamp(S.camDist * (d0 / Math.max(1, d1)), 8, 26);
    } else { S.camYaw -= (e.clientX - p[0]) * 0.0075; S.camPitch = clamp(S.camPitch + (e.clientY - p[1]) * 0.005, 0.15, 1.25); S.lastDrag = S.time; }
    p[0] = e.clientX; p[1] = e.clientY;
  });
  const dragEnd = e => drag.delete(e.pointerId);
  cv.addEventListener('pointerup', dragEnd); cv.addEventListener('pointercancel', dragEnd);
  cv.addEventListener('wheel', e => { S.camDist = clamp(S.camDist + Math.sign(e.deltaY) * 1.5, 8, 26); }, { passive: true });
  addEventListener('keydown', e => {
    if (!S.inGame || e.target.tagName === 'INPUT') return;
    keys[e.code] = true;
    if (e.code === 'Space') { S.atkHeld = true; e.preventDefault(); }
    if (e.code === 'Digit1') skill(0); if (e.code === 'Digit2') skill(1); if (e.code === 'Digit3') skill(2);
    if (e.code === 'KeyE' || e.code === 'Tab') { e.preventDefault(); toggleSheet(); }
    if (e.code === 'Escape' && S.sheet) toggleSheet();
  });
  addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Space') S.atkHeld = false; });
  addEventListener('contextmenu', e => e.preventDefault());

  const ba = $('btnAtk');
  ba.addEventListener('pointerdown', e => { Sound.init(); S.atkHeld = true; ba.classList.add('on'); capture(ba, e.pointerId); });
  const atkEnd = () => { S.atkHeld = false; ba.classList.remove('on'); };
  ba.addEventListener('pointerup', atkEnd); ba.addEventListener('pointercancel', atkEnd);
  function skill(i) {
    if (!S.me || S.dead) return;
    if (S.cds[i] > S.time) { Sound.play('error'); return; }
    send({ t: 'sk', i });
  }
  for (let i = 0; i < 3; i++) $('sk' + i).addEventListener('pointerdown', e => { e.preventDefault(); Sound.init(); skill(i); });
  $('btnLoot').addEventListener('click', () => { Sound.init(); if (S.lootEnd <= S.time) send({ t: 'loot' }); });
  $('btnMenu').addEventListener('click', () => { Sound.init(); toggleSheet(); });
  $('sheetClose').addEventListener('click', () => toggleSheet());

  /* ================= Interface ================= */
  const myCls = () => S.me ? S.me.cls : S.wcls;
  const resIcon = r => r === 'spec' && myCls() ? D.CLASSES[myCls()].specIcon : D.RES[r].icon;
  const resName = r => r === 'spec' && S.me ? D.CLASSES[S.me.cls].spec : D.RES[r].name;
  let lastRes = {};
  function updHero() {
    const me = S.me, cls = D.CLASSES[me.cls];
    $('portrait').textContent = ICON[me.cls]; $('portrait').dataset.lvl = me.lvl;
    $('heroName').textContent = me.name + ' · ' + cls.name;
    $('xpFill').style.width = (me.xp / me.need * 100) + '%';
    for (let i = 0; i < 3; i++) $('sk' + i).querySelector('.ic').textContent = cls.skills[i].icon;
    $('btnAtk').textContent = cls.ranged ? '☄️' : '⚔️';
    // Le bouton forteresse clignote quand une amélioration est possible.
    let can = false;
    for (const b in D.BUILDINGS) if (canBuild(b).ok) can = true;
    $('btnMenu').classList.toggle('pulse', can && !S.sheet);
  }
  function updHp() { $('hpFill').style.width = clamp(S.hp / S.mh * 100, 0, 100) + '%'; $('hpTxt').textContent = S.hp + ' / ' + S.mh; if (!S.dead && S.hp / S.mh >= 0.3) $('vignette').style.opacity = 0; }
  function updRes() {
    const me = S.me, box = $('res');
    if (!box.children.length) for (const r in D.RES) { const el = document.createElement('div'); el.className = 'pill'; el.id = 'res_' + r; box.appendChild(el); }
    for (const r in D.RES) {
      const el = $('res_' + r), v = me.res[r] || 0;
      el.textContent = resIcon(r) + ' ' + v; el.classList.toggle('full', v >= me.cap);
      if (lastRes[r] !== undefined && v > lastRes[r]) { el.classList.add('pop'); setTimeout(() => el.classList.remove('pop'), 180); }
      lastRes[r] = v;
    }
  }
  function canBuild(b) {
    const me = S.me, def = D.BUILDINGS[b], lvl = me.b[b] || 0;
    if (lvl >= def.max) return { ok: false, why: 'Niveau maximum', max: true };
    const cost = D.cost(b, lvl);
    if (b !== 'throne' && lvl >= me.b.throne) return { ok: false, why: 'Trône niveau ' + (lvl + 1) + ' requis', cost };
    if (b === 'throne' && me.lvl < D.throneNeed(lvl)) return { ok: false, why: 'Héros niveau ' + D.throneNeed(lvl) + ' requis', cost };
    for (const r in cost) if ((me.res[r] || 0) < cost[r]) return { ok: false, why: '', cost };
    return { ok: true, cost };
  }
  const costHtml = cost => '<div class="cost">' + Object.keys(cost).map(r => '<span class="' + ((S.me.res[r] || 0) < cost[r] ? 'no' : '') + '">' + resIcon(r) + ' ' + cost[r] + '</span>').join('') + '</div>';

  function toggleSheet() { S.sheet = !S.sheet; $('sheet').hidden = !S.sheet; Sound.play('click'); if (S.sheet) renderSheet(); if (S.me) updHero(); }
  function renderSheet() {
    const me = S.me; if (!me) return;
    const cls = D.CLASSES[me.cls], body = $('sheetBody'), keep = body.scrollTop;
    for (const b of $('tabs').children) b.classList.toggle('on', b.dataset.tab === S.tab);
    let h = '';
    if (S.tab === 'fort') {
      const mf = S.forts[me.slot], shLeft = mf && mf.shEnd > S.time ? mf.shEnd - S.time : 0;
      h += '<div class="card"><div class="big">' + (shLeft ? '🛡️' : '⚠️') + '</div><div class="mid"><h3>' + (shLeft ? 'Forteresse protégée' : 'Forteresse exposée') + '</h3><p>' + (shLeft ? 'Personne ne peut te piller pendant encore ' + fmtDur(shLeft) + '. Si tu pilles quelqu\'un, ta protection tombe.' : 'Un autre seigneur peut voler ' + Math.round(S.cfg.raidLoot * 100) + ' % de ton stock. Laisse des serviteurs en Garde pour la défendre.') + '</p></div></div>';
      h += '<div class="note">Stock maximum : ' + me.cap + ' par ressource. Tes serviteurs rapportent les ressources, les monstres donnent de l\'or et ' + (me.cls === 'lich' ? 'des os' : 'de la ferraille') + '. Ton héros récolte aussi : frappe un arbre, un rocher ou un filon avec le bouton d\'attaque.</div>';
      for (const b in D.BUILDINGS) {
        const lvl = me.b[b] || 0, c = canBuild(b), icon = b === 'barracks' && me.cls === 'goblin' ? '⛺' : b === 'altar' && me.cls === 'goblin' ? '🗿' : BICON[b];
        h += '<div class="card"><div class="big">' + icon + '</div><div class="mid"><h3>' + esc(cls.bnames[b]) + '<em>' + (lvl ? 'niv. ' + lvl : 'à construire') + '</em></h3><p>' + D.BUILDINGS[b].desc + '</p>' +
          (c.max ? '' : costHtml(c.cost)) + (c.why && !c.max ? '<p style="color:var(--bad)">' + c.why + '</p>' : '') + '</div>' +
          (c.max ? '<span class="note">MAX</span>' : '<button class="btn' + (c.ok ? ' gold' : '') + '" data-act="build" data-arg="' + b + '"' + (c.ok ? '' : ' disabled') + '>' + (lvl ? 'Améliorer' : 'Construire') + '</button>') + '</div>';
      }
      h += '<button class="btn wide" data-act="recall">🌀 Retour à la forteresse</button>';
    } else if (S.tab === 'minions') {
      const alive = me.minions.filter(m => !m[2]).length, down = me.minions.filter(m => m[2]);
      h += '<div class="stat"><div>Serviteurs<b>' + me.minions.length + ' / ' + me.mcap + '</b></div><div>Hors de combat<b>' + down.length + (down.length ? ' <small>(' + Math.min(...down.map(m => m[2])) + ' s)</small>' : '') + '</b></div></div>';
      h += '<div class="sec">Invoquer</div>';
      for (const mt of cls.minions) {
        const def = D.MINIONS[mt], locked = (me.b.barracks || 0) < def.unlock, full = me.minions.length >= me.mcap;
        let ok = !locked && !full; for (const r in def.cost) if ((me.res[r] || 0) < def.cost[r]) ok = false;
        const n = me.minions.filter(m => m[0] === mt).length;
        h += '<div class="card"><div class="big">' + def.icon + '</div><div class="mid"><h3>' + def.name + '<em>× ' + n + '</em></h3><p><b style="color:var(--acc)">' + def.tag + '</b> · Vie ' + def.hp + ' · Dégâts ' + def.dmg + (def.range ? ' · Portée ' + def.range : '') + ' · Récolte ×' + def.work + '</p>' + costHtml(def.cost) +
          (locked ? '<p style="color:var(--bad)">' + esc(cls.bnames.barracks) + ' niveau ' + def.unlock + ' requis</p>' : full ? '<p style="color:var(--bad)">Limite atteinte : améliore ' + esc(cls.bnames.barracks) + '</p>' : '') + '</div>' +
          '<div class="side"><button class="btn' + (ok ? ' gold' : '') + '" data-act="summon" data-arg="' + mt + '"' + (ok ? '' : ' disabled') + '>Invoquer</button>' +
          (n ? '<button class="btn red small" data-act="dismiss" data-arg="' + mt + '">Sacrifier</button>' : '') + '</div></div>';
      }
      h += '<div class="note">Sacrifier un serviteur rend ' + Math.round((S.cfg.refund || 0) * 100) + ' % de son coût et libère une place. Celui qui garde la forteresse part en premier.</div>';
      h += '<div class="sec">Répartir les tâches</div>';
      const free = me.minions.filter(m => m[1] === 'guard').length;
      for (const r of ['wood', 'stone', 'gold', 'spec', 'escort']) {
        const n = me.minions.filter(m => m[1] === r).length, name = r === 'escort' ? 'Escorte' : 'Récolter : ' + resName(r), icon = r === 'escort' ? '⚔️' : resIcon(r);
        h += '<div class="role"><span style="font-size:20px">' + icon + '</span><div class="n">' + name + (r === 'escort' ? '<small>Te suivent et combattent</small>' : '') + '</div>' +
          '<button class="step" data-act="role" data-arg="' + r + '" data-d="-1"' + (n ? '' : ' disabled') + '>−</button><b>' + n + '</b><button class="step" data-act="role" data-arg="' + r + '" data-d="1"' + (free ? '' : ' disabled') + '>+</button></div>';
      }
      h += '<div class="role"><span style="font-size:20px">🛡️</span><div class="n">Garde de la forteresse<small>Disponibles pour une autre tâche</small></div><b>' + free + '</b></div>';
      h += '<div class="note" style="margin-top:8px">' + alive + ' serviteur(s) actif(s). Un serviteur vaincu revient après ' + S.cfg.minionRevive + ' s.</div>';
    } else if (S.tab === 'craft') {
      const wl = me.b.workshop || 0;
      if (!wl) h += '<div class="card"><div class="big">⚒️</div><div class="mid"><h3>' + esc(cls.bnames.workshop) + ' à construire</h3><p>Construis ce bâtiment dans l\'onglet Forteresse pour fabriquer de l\'équipement pour ton héros et tes serviteurs.</p></div></div>';
      else h += '<div class="note">' + esc(cls.bnames.workshop) + ' niveau ' + wl + ' : tu peux fabriquer jusqu\'au palier ' + wl + '. Chaque palier est permanent.</div>';
      for (const who of ['hero', 'minion']) {
        h += '<div class="sec">' + (who === 'hero' ? 'Équipement du héros' : 'Équipement des serviteurs') + '</div>';
        for (const id in D.CRAFTS) {
          const c = D.CRAFTS[id]; if (c.who !== who) continue;
          const tier = (me.craft || {})[id] || 0, max = tier >= D.CRAFT_MAX, cost = max ? null : D.craftCost(id, tier);
          let ok = !max && tier < wl; if (cost) for (const r in cost) if ((me.res[r] || 0) < cost[r]) ok = false;
          h += '<div class="card"><div class="big">' + c.icon + '</div><div class="mid"><h3>' + c.name + '<em class="pips">' + '●'.repeat(tier) + '○'.repeat(D.CRAFT_MAX - tier) + '</em></h3><p>' + c.desc + '</p>' + (cost ? costHtml(cost) : '') +
            (!max && tier >= wl ? '<p style="color:var(--bad)">' + esc(cls.bnames.workshop) + ' niveau ' + (tier + 1) + ' requis</p>' : '') + '</div>' +
            (max ? '<span class="note">MAX</span>' : '<button class="btn' + (ok ? ' gold' : '') + '" data-act="craft" data-arg="' + id + '"' + (ok ? '' : ' disabled') + '>Fabriquer</button>') + '</div>';
        }
      }
    } else if (S.tab === 'hero') {
      h += '<div class="stat"><div>' + cls.title + '<b>' + ICON[me.cls] + ' ' + cls.name + ' niv. ' + me.lvl + '</b></div><div>Expérience<b>' + me.xp + ' / ' + me.need + '</b></div><div>Vie<b>' + S.mh + '</b></div><div>Dégâts<b>' + me.dmg + '</b></div><div>Monstres vaincus<b>' + me.kills + '</b></div><div>Royaume<b>n° ' + (me.slot + 1) + '</b></div></div>';
      const rel = me.relics || [], eq = me.eq || {};
      h += '<div class="sec">Reliques (' + rel.length + ' / ' + Object.keys(D.RELICS).length + ')</div>';
      if (!rel.length) h += '<div class="note">Aucune relique pour l\'instant. Les élites et les boss en lâchent parfois : Troll, Mère des araignées, Seigneur de guerre orc, Gardien de Malterre.</div>';
      for (const ty in D.RELIC_TYPES) {
        const mine = rel.filter(id => D.RELICS[id].type === ty); if (!mine.length) continue;
        h += '<div class="note" style="margin:8px 2px 4px">' + D.RELIC_TYPES[ty] + ' — une seule active</div>';
        for (const id of mine) { const r = D.RELICS[id], on = eq[ty] === id; h += '<div class="card' + (on ? ' on' : '') + '"><div class="big">' + r.icon + '</div><div class="mid"><h3>' + esc(r.name) + (on ? '<em>active</em>' : '') + '</h3><p>' + esc(r.desc) + '</p></div><button class="btn' + (on ? '' : ' gold') + '" data-act="equip" data-arg="' + id + '">' + (on ? 'Retirer' : 'Équiper') + '</button></div>'; }
      }
      h += '<div class="sec">Compétences</div>';
      for (const sk of cls.skills) h += '<div class="card"><div class="big">' + sk.icon + '</div><div class="mid"><h3>' + sk.name + '<em>' + sk.cd + ' s</em></h3><p>' + sk.desc + '</p></div></div>';
      h += '<div class="sec">Seigneurs en ligne</div>';
      for (const p of S.roster.values()) h += '<div class="role"><span style="font-size:20px">' + ICON[p.c] + '</span><div class="n" style="color:' + D.COLORS[p.s % 8] + '">' + esc(p.n) + '<small>' + D.CLASSES[p.c].name + ' niv. ' + p.l + '</small></div></div>';
    } else {
      h += '<div class="row"><label>🎵 Musique et ambiance</label><input type="range" min="0" max="100" value="' + Math.round(Sound.set.music * 100) + '" data-set="music"></div>';
      h += '<div class="row"><label>🔊 Effets sonores</label><input type="range" min="0" max="100" value="' + Math.round(Sound.set.sfx * 100) + '" data-set="sfx"></div>';
      h += '<div class="row"><label>📳 Vibrations</label><input type="checkbox" data-set="vib"' + (Sound.set.vib ? ' checked' : '') + (Sound.canVibrate() ? '' : ' disabled') + '></div>';
      if (!Sound.canVibrate()) h += '<div class="note">Ce navigateur ne permet pas les vibrations (c\'est le cas sur iPhone). Les secousses d\'écran restent actives.</div>';
      h += '<div class="row"><label>🖼️ Qualité graphique</label><select data-set="quality"><option value="low"' + (S.quality === 'low' ? ' selected' : '') + '>Rapide</option><option value="med"' + (S.quality === 'med' ? ' selected' : '') + '>Équilibrée</option><option value="high"' + (S.quality === 'high' ? ' selected' : '') + '>Fine</option></select></div>';
      h += '<div class="note">Glisse sur l\'écran pour tourner la caméra, pince pour zoomer. Sur ordinateur : ZQSD ou flèches, Espace pour attaquer, 1-2-3 pour les compétences, E pour ce menu.</div>';
      h += '<button class="btn red wide" data-act="logout">Changer de seigneur</button><div class="note" style="text-align:center;margin-top:10px">Malterre v' + D.VERSION + '</div>';
    }
    body.innerHTML = h; body.scrollTop = keep;
  }
  $('tabs').addEventListener('click', e => { const t = e.target.closest('button'); if (!t) return; S.tab = t.dataset.tab; $('sheetBody').scrollTop = 0; Sound.play('click'); renderSheet(); });
  $('sheetBody').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const act = b.dataset.act, arg = b.dataset.arg;
    Sound.play('click'); Sound.vibrate(10);
    if (act === 'build') send({ t: 'build', b: arg });
    else if (act === 'summon') send({ t: 'summon', m: arg });
    else if (act === 'dismiss') send({ t: 'dismiss', m: arg });
    else if (act === 'craft') send({ t: 'craft', c: arg });
    else if (act === 'equip') send({ t: 'equip', r: arg });
    else if (act === 'role') send({ t: 'role', r: arg, d: +b.dataset.d });
    else if (act === 'recall') { send({ t: 'recall' }); toggleSheet(); }
    else if (act === 'logout') { store.del('malterre_tok'); S.ws.close(); leaveGame(); }
  });
  $('sheetBody').addEventListener('input', e => {
    const k = e.target.dataset.set; if (!k) return;
    if (k === 'music' || k === 'sfx') Sound.volume(k, e.target.value / 100);
    else if (k === 'vib') { Sound.setVib(e.target.checked); Sound.vibrate(40); }
    else if (k === 'quality') { S.quality = e.target.value; store.set('malterre_q', S.quality); }
  });

  /* ================= Accueil ================= */
  let pickCls = null;
  $('classCards').innerHTML = Object.keys(D.CLASSES).map(c => '<div class="cls" data-c="' + c + '"><div class="e">' + ICON[c] + '</div><h3>' + D.CLASSES[c].name + '</h3><p>' + D.CLASSES[c].desc + '</p></div>').join('');
  $('classCards').addEventListener('click', e => { const c = e.target.closest('.cls'); if (!c) return; pickCls = c.dataset.c; for (const x of $('classCards').children) x.classList.toggle('on', x === c); Sound.init(); Sound.play('click'); });
  $('inName').value = store.get('malterre_name') || '';
  $('loginForm').addEventListener('submit', e => {
    e.preventDefault(); Sound.init();
    const name = $('inName').value.trim(), pin = $('inPin').value, creating = !$('classPick').hidden;
    if (creating && !pickCls) { $('loginErr').textContent = 'Choisis ta lignée.'; return; }
    $('loginErr').textContent = ''; $('loginBtn').disabled = true;
    S.pending = { t: 'login', name, pin, cls: pickCls, create: creating ? 1 : 0 };
    if (S.ws && S.ws.readyState === 1) send(S.pending); else if (!S.ws || S.ws.readyState > 1) connect();
    setTimeout(() => { if (!S.inGame && $('loginBtn').disabled) { $('loginBtn').disabled = false; if (!$('loginErr').textContent && $('classPick').hidden) $('loginErr').textContent = 'Le serveur ne répond pas, réessaie.'; } }, 6000);
  });
  $('inName').addEventListener('input', () => { $('classPick').hidden = true; $('loginBtn').textContent = 'Entrer en Malterre'; });

  /* ================= Simulation locale ================= */
  function fortLocal(f, x, z) { const dx = x - f.x, dz = z - f.z, c = Math.cos(f.rot), s = Math.sin(f.rot); return [dx * c - dz * s, dx * s + dz * c]; }
  function fortWorld(f, lx, lz) { const c = Math.cos(f.rot), s = Math.sin(f.rot); return [f.x + lx * c + lz * s, f.z - lx * s + lz * c]; }
  function pushOut(cx, cz, rad) { const dx = S.x - cx, dz = S.z - cz, d = Math.hypot(dx, dz); if (d < rad && d > 1e-4) { S.x = cx + dx / d * rad; S.z = cz + dz / d * rad; } }
  function collide() {
    for (const n of S.nodes) { if (Math.abs(n.x - S.x) > 4 || Math.abs(n.z - S.z) > 4) continue; pushOut(n.x, n.z, n.type === 'tree' ? 1.0 : n.type === 'remains' ? 1.2 : 1.7 * n.s); }
    for (const f of S.forts) {
      if (!f.o || Math.abs(f.x - S.x) > 30 || Math.abs(f.z - S.z) > 30) continue;
      for (const b in D.PLOTS) { const p = fortWorld(f, D.PLOTS[b][0], D.PLOTS[b][1]); pushOut(p[0], p[1], b === 'throne' ? 5.2 : (f.b[b] ? 3.6 : 0)); }
      const l = fortLocal(f, S.x, S.z), d = Math.hypot(l[0], l[1]);
      if (Math.abs(d - 24) < 1.1 && Math.abs(Math.atan2(l[0], l[1])) > 0.2) { const nd = d < 24 ? 22.9 : 25.1, w = fortWorld(f, l[0] / d * nd, l[1] / d * nd); S.x = w[0]; S.z = w[1]; }
    }
    const r = Math.hypot(S.x, S.z); if (r > WR - 4) { S.x *= (WR - 4) / r; S.z *= (WR - 4) / r; }
  }

  function update(dt) {
    const me = S.me; if (!me) return;
    const cls = D.CLASSES[me.cls];
    let mx = joy.x + ((keys.KeyD || keys.ArrowRight) ? 1 : 0) - ((keys.KeyA || keys.ArrowLeft) ? 1 : 0);
    let my = joy.y + ((keys.KeyW || keys.ArrowUp) ? 1 : 0) - ((keys.KeyS || keys.ArrowDown) ? 1 : 0);
    const len = Math.min(1, Math.hypot(mx, my));
    S.moving = false;
    if (len > 0.15 && !S.dead) {
      const n = Math.hypot(mx, my); mx /= n; my /= n;
      const fx = Math.sin(S.camYaw), fz = Math.cos(S.camYaw), dx = fx * my - fz * mx, dz = fz * my + fx * mx;
      const spd = cls.speed * (me.speed || 1); S.x += dx * spd * len * dt; S.z += dz * spd * len * dt;
      if (S.time - S.atkT > 0.25) S.r = Math.atan2(dx, dz);
      S.moving = true;
      collide();
      // La caméra se replace doucement derrière le héros.
      if (S.time - S.lastDrag > 1.5) { let d = (Math.atan2(dx, dz) - S.camYaw) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; if (Math.abs(d) < 2.3) S.camYaw += d * Math.min(1, dt * 0.9); }
      if ((S.stepT = (S.stepT || 0) - dt) <= 0) { S.stepT = 0.34; Sound.play('step'); }
    }
    if (S.atkHeld && !S.dead && S.time >= S.nextAtk && !S.sheet) { S.nextAtk = S.time + cls.atkCd + 0.03; send({ t: 'atk' }); }
    const now = performance.now(), sig = S.x.toFixed(1) + ',' + S.z.toFixed(1) + ',' + S.r.toFixed(2) + (S.moving ? 'm' : '');
    if (now - S.lastSend > 100 && (sig !== S.lastSent || now - S.lastSend > 2000)) { S.lastSend = now; S.lastSent = sig; send({ t: 'mv', x: +S.x.toFixed(2), z: +S.z.toFixed(2), r: +S.r.toFixed(2), a: S.moving ? 1 : 0 }); }

    const k = Math.min(1, dt * 12);
    for (const e of S.ents.values()) {
      if (e.id === S.id) { e.x = S.x; e.z = S.z; e.r = S.r; continue; }
      e.x += (e.tx - e.x) * k; e.z += (e.tz - e.z) * k;
      let d = (e.tr - e.r) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; e.r += d * k;
      if (e.flash > 0) e.flash -= dt * 5;
    }
    const meEnt = S.ents.get(S.id); if (meEnt && meEnt.flash > 0) meEnt.flash -= dt * 5;
    for (let i = S.parts.length - 1; i >= 0; i--) { const p = S.parts[i]; p.life -= dt; if (p.life <= 0) { S.parts.splice(i, 1); continue; } p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y < 0.08 && p.g > 0) { p.y = 0.08; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; } }
    for (let i = S.rings.length - 1; i >= 0; i--) if ((S.rings[i].life -= dt) <= 0) S.rings.splice(i, 1);
    for (let i = S.floats.length - 1; i >= 0; i--) { const f = S.floats[i]; f.life -= dt; f.y += dt * 1.6; if (f.life <= 0) S.floats.splice(i, 1); }
    for (let i = S.projs.length - 1; i >= 0; i--) {
      const p = S.projs[i]; p.t += dt;
      if (p.t >= p.dur) { if (p.boom) { burst(p.x1, p.y1, p.z1, p.boom, 18, 6); ring(p.x1, p.z1, 0.3, 3.5, 0.35, p.boom); } S.projs.splice(i, 1); }
      else if (Math.random() < 0.7) { const t = p.t / p.dur; part(lerp(p.x0, p.x1, t), lerp(p.y0, p.y1, t), lerp(p.z0, p.z1, t), 0, 0.5, 0, 0.25, p.size * 0.5, p.col, 0); }
    }
    if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 2.2);

    // Zone et ambiance.
    const r = Math.hypot(S.x, S.z), tier = r > D.WORLD.tier1 ? 1 : r > D.WORLD.tier2 ? 2 : 3;
    let zk = 'z' + tier, title = ZONES[tier], sub = ZSUB[tier];
    for (const f of S.forts) if (Math.hypot(f.x - S.x, f.z - S.z) < 25) { const shd = f.shEnd > S.time; zk = 'f' + f.s + (f.o || '') + (shd ? 's' : ''); title = f.o ? (f.s === me.slot ? 'Ta forteresse' : 'Royaume de ' + f.o) : 'Terre sans maître'; sub = f.o ? D.CLASSES[f.c].name + ' niv. ' + f.l + (shd ? ' · 🛡️ protégé encore ' + fmtDur(f.shEnd - S.time) : f.s === me.slot ? ' · ⚠️ exposée aux raids' : ' · ⚔️ pillage possible') : 'Un royaume peut être fondé ici'; }
    if (zk !== S.zoneKey) { S.zoneKey = zk; const z = $('zone'); z.innerHTML = esc(title) + '<small>' + esc(sub) + '</small>'; z.style.opacity = 1; clearTimeout(S.zoneT); S.zoneT = setTimeout(() => { z.style.opacity = 0; }, 2600); }
    if (tier !== S.tier) { S.tier = tier; Sound.setTier(tier); }
    const tg = SKY[tier], kk = Math.min(1, dt * 0.8);
    for (const key of ['fog', 'amb', 'sun']) for (let i = 0; i < 3; i++) sky[key][i] = lerp(sky[key][i], tg[key][i], kk);
    sky.near = lerp(sky.near, tg.near, kk); sky.far = lerp(sky.far, tg.far, kk);

    // Bouton de pillage : près de la réserve d'un royaume ennemi non protégé.
    let canLoot = false;
    if (!S.dead) for (const f of S.forts) { if (!f.o || f.s === me.slot || f.shEnd > S.time) continue; const p = fortWorld(f, D.PLOTS.storage[0], D.PLOTS.storage[1]); if (Math.hypot(p[0] - S.x, p[1] - S.z) < 7.5) canLoot = true; }
    const bl = $('btnLoot'), busy = S.lootEnd > S.time;
    if (bl.hidden === canLoot) bl.hidden = !canLoot;
    if (canLoot) { bl.classList.toggle('busy', busy); bl.querySelector('i').style.setProperty('--p', (busy ? (1 - (S.lootEnd - S.time) / S.lootDur) * 100 : 0) + '%'); bl.querySelector('small').textContent = busy ? Math.ceil(S.lootEnd - S.time) + ' s' : 'Piller'; }
    // Temps de recharge.
    for (let i = 0; i < 3; i++) {
      const el = $('sk' + i), left = S.cds[i] - S.time, was = el.dataset.cd === '1';
      if (left > 0) { el.querySelector('.cd').style.setProperty('--p', (left / S.cdMax[i] * 100) + '%'); el.querySelector('b').textContent = Math.ceil(left); el.dataset.cd = '1'; }
      else if (was) { el.querySelector('.cd').style.setProperty('--p', '0%'); el.querySelector('b').textContent = ''; el.dataset.cd = '0'; el.classList.remove('ready'); void el.offsetWidth; el.classList.add('ready'); }
    }
    if (S.dead) $('deathT').textContent = Math.max(0, Math.ceil(S.deathAt - S.time));
  }

  /* ================= Rendu ================= */
  const MM = M4.create(), PM = M4.create(), TINT = [1, 1, 1];
  const modelOf = e => e.k === 0 ? (e.t === 'goblin' ? 'goblin_king' : 'lich') : e.k === 2 ? (D.MOBS[e.t].model || e.t) : (D.MINIONS[e.t].model || e.t);
  const mscale = e => Models.get(modelOf(e)).s * (e.k === 2 ? (D.MOBS[e.t].scale || 1) : e.k === 1 ? (D.MINIONS[e.t].scale || 1) : 1);
  function drawEnt(e, x, z, shadows) {
    const mdl = Models.get(modelOf(e)), t = S.time;
    const grow = Math.min(1, (t - e.born) * 4 + 0.2), s = mscale(e) * grow;
    const walk = e.a === 1, sw = walk ? Math.sin(t * 10 + e.ph) : 0, atk = Math.max(0, 1 - (t - e.atkT) / 0.32), work = e.a === 2 && atk <= 0;
    const bob = mdl.kind === 'float' ? 0.14 + Math.sin(t * 2.2 + e.ph) * 0.09 : walk ? Math.abs(sw) * 0.06 : 0;
    const lunge = mdl.kind === 'quad' || mdl.kind === 'spider' ? Math.sin(atk * Math.PI) * 0.7 : 0;
    M4.trs(MM, x + Math.sin(e.r) * lunge, bob * s, z + Math.cos(e.r) * lunge, e.r, s, s, s);
    let tint = Engine.WHITE;
    if (e.fl & 1) tint = [0.6, 0.85, 1.4]; else if (e.fl & 8) tint = [1.3, 1.25, 0.6]; else if (e.fl & 2) tint = [1.35, 1.0, 0.75];
    const flash = Math.max(0, e.flash) * 0.55;
    for (const p of mdl.parts) {
      let ang = 0;
      if (p.k === 'legL') ang = sw * 0.7; else if (p.k === 'legR') ang = -sw * 0.7;
      else if (p.k === 'armL') ang = -sw * 0.5 + (mdl.pose === 'zombie' ? -1.35 : 0) - (mdl.pose === 'zombie' ? Math.sin(atk * Math.PI) * 0.5 : 0);
      else if (p.k === 'armR') ang = sw * 0.5 + (mdl.pose === 'zombie' ? -1.35 : mdl.kind === 'float' ? -0.25 : 0) - Math.sin(atk * Math.PI) * 1.9 + (work ? -1.0 + Math.sin(t * 9 + e.ph) * 0.8 : 0);
      else if (p.k === 'spA') ang = Math.sin(t * 14 + e.ph) * (walk ? 0.22 : 0.04); else if (p.k === 'spB') ang = -Math.sin(t * 14 + e.ph) * (walk ? 0.22 : 0.04);
      if (p.k === 'body') eng.draw(p.m, MM, tint, flash);
      else { M4.pivot(PM, p.p[0], p.p[1], p.p[2], p.ax || 'x', ang); M4.mul(PM, MM, PM); eng.draw(p.m, PM, tint, flash); }
    }
    if (e.fl & 4) { M4.trs(PM, x - Math.sin(e.r) * 0.4 * s, 1.5 * s, z - Math.cos(e.r) * 0.4 * s, e.r, 0.5, 0.5, 0.5); eng.draw(Models.cube(), PM, [0.75, 0.6, 0.35]); }
    shadows.push(x, z, (mdl.kind === 'quad' ? 0.9 : mdl.kind === 'spider' ? 1.3 : 0.62) * s, e.k === 2 ? -1 : e.k === 0 ? (S.roster.get(e.id) || {}).s : (S.roster.get(e.o) || {}).s);
  }

  function render() {
    const scale = S.quality === 'low' ? 1 : Math.min(devicePixelRatio || 1, S.quality === 'high' ? 2 : 1.5);
    eng.resize(scale);
    const sh = S.shake * S.shake, sx = (Math.random() - 0.5) * sh, sy = (Math.random() - 0.5) * sh;
    const cp = Math.cos(S.camPitch), eye = [S.x - Math.sin(S.camYaw) * cp * S.camDist + sx, 2 + Math.sin(S.camPitch) * S.camDist + sy, S.z - Math.cos(S.camYaw) * cp * S.camDist];
    eng.begin(eye, [S.x + sx, 2.1 + sy, S.z], sky.fog, sky.near, sky.far, sky.amb, sky.sun);
    M4.trs(MM, 0, 0, 0, 0, 1, 1, 1); eng.draw(Models.terrain(), MM);
    const far = sky.far + 12;

    for (const f of S.forts) {
      if (Math.hypot(f.x - S.x, f.z - S.z) > far + 26) continue;
      M4.trs(MM, f.x, 0, f.z, f.rot, 1, 1, 1);
      if (!f.o) { eng.draw(Models.emptyFort(), MM); continue; }
      eng.draw(Models.wall(f.c), MM); eng.draw(Models.banner(), MM, slotColor(f.s));
      for (const b in D.PLOTS) { const p = fortWorld(f, D.PLOTS[b][0], D.PLOTS[b][1]); M4.trs(PM, p[0], 0, p[1], f.rot, 1, 1, 1); eng.draw(Models.building(f.c, b, f.b[b] || 0), PM); }
    }
    for (const n of S.nodes) {
      const dx = n.x - S.x, dz = n.z - S.z; if (dx * dx + dz * dz > far * far) continue;
      const tree = n.type === 'tree', s = n.s * (n.vis === 0 ? (tree ? 1 : 0.4) : tree ? 0.75 + 0.1 * n.vis : 0.55 + 0.15 * n.vis) * (tree && n.rich >= 2 ? 1.25 : 1) * (!tree && n.rich >= 2 ? 1.15 : 1);
      M4.trs(MM, n.x, 0, n.z, n.rot, s, s, s);
      eng.draw(Models.node(n.type, n.rich, n.variant, n.vis), MM, n.vis === 0 && !tree ? [0.55, 0.55, 0.55] : null);
    }
    const shadows = [];
    let target = null, tbest = 1e9; const range = S.me ? D.CLASSES[S.me.cls].range + 2 : 0;
    for (const e of S.ents.values()) {
      if (e.k === 0 && (e.fl & 16)) continue;
      drawEnt(e, e.x, e.z, shadows);
      if (e.k === 2 || (e.fl & 32)) { const d = dme(e.x, e.z) - (e.k === 2 ? D.MOBS[e.t].rad : 0.6); if (d < range && d < tbest) { tbest = d; target = e; } }
    }
    // Particules et projectiles (sans éclairage).
    const cube = Models.cube(), orb = Models.orb();
    for (const p of S.parts) { const s = p.size * Math.min(1, p.life / p.max * 2); M4.trs(MM, p.x, p.y, p.z, p.life * 5, s, s, s); eng.draw(cube, MM, p.col, 0, 1, true); }
    for (const p of S.projs) { const t = p.t / p.dur; M4.trs(MM, lerp(p.x0, p.x1, t), lerp(p.y0, p.y1, t) + Math.sin(t * Math.PI) * 0.6, lerp(p.z0, p.z1, t), 0, p.size, p.size, p.size); eng.draw(orb, MM, p.col, 0, 1, true); }
    // Passes transparentes : ombres, cercles de couleur, anneaux d'effet.
    eng.setBlend(true);
    const disc = Models.disc(), rg = Models.ring();
    for (let i = 0; i < shadows.length; i += 4) {
      M4.trs(MM, shadows[i], 0.06, shadows[i + 1], 0, shadows[i + 2], 1, shadows[i + 2]); eng.draw(disc, MM, [0, 0, 0], 0, 0.3, true);
      if (shadows[i + 3] >= 0) { const r = shadows[i + 2] * 1.5; M4.trs(MM, shadows[i], 0.08, shadows[i + 1], 0, r, 1, r); eng.draw(rg, MM, slotColor(shadows[i + 3]), 0, 0.75, true); }
    }
    if (target && !S.dead) { const r = (target.k === 2 ? D.MOBS[target.t].rad : 0.7) * 1.5 + 0.3 + Math.sin(S.time * 6) * 0.08; M4.trs(MM, target.x, 0.1, target.z, S.time, r, 1, r); eng.draw(rg, MM, [1.6, 0.25, 0.2], 0, 0.9, true); }
    for (const f of S.forts) if (f.o && f.shEnd > S.time && Math.hypot(f.x - S.x, f.z - S.z) < far + 26) { const rr = 25.6 + Math.sin(S.time * 2) * 0.25; M4.trs(MM, f.x, 0.14, f.z, 0, rr, 1, rr); eng.draw(rg, MM, [0.35, 0.75, 2.2], 0, 0.6, true); M4.trs(MM, f.x, 0.11, f.z, 0, rr, 1, rr); eng.draw(disc, MM, [0.35, 0.75, 2.2], 0, 0.07, true); }
    for (const r of S.rings) { const t = 1 - r.life / r.max, rad = lerp(r.r0, r.r1, 1 - (1 - t) * (1 - t)); M4.trs(MM, r.x, 0.12, r.z, 0, rad, 1, rad); eng.draw(rg, MM, r.col, 0, (1 - t) * 0.9, true); M4.trs(MM, r.x, 0.1, r.z, 0, rad, 1, rad); eng.draw(disc, MM, r.col, 0, (1 - t) * 0.16, true); }
    eng.setBlend(false);
    overlay();
  }

  function overlay() {
    const dpr = Math.min(devicePixelRatio || 1, 2), w = ov.clientWidth, h = ov.clientHeight;
    if (ov.width !== Math.round(w * dpr)) { ov.width = Math.round(w * dpr); ov.height = Math.round(h * dpr); }
    octx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.clearRect(0, 0, w, h);
    octx.textAlign = 'center'; octx.lineJoin = 'round';
    let boss = null;
    for (const e of S.ents.values()) {
      if (e.k === 0 && (e.fl & 16)) continue;
      const d = dme(e.x, e.z); if (d > 55) continue;
      const mdl = Models.get(modelOf(e)), mob = e.k === 2 ? D.MOBS[e.t] : null;
      if (mob && mob.boss) { boss = e; continue; }
      const hurt = e.hp < e.mh, named = e.k === 0 || (mob && (mob.elite || mob.boss));
      if (!hurt && !named) continue;
      if (e.id === S.id) continue;
      const p = eng.project(e.x, mdl.h * mscale(e) + 0.5, e.z); if (!p) continue;
      const bw = clamp(520 / p[2], 22, 70) * (mob && mob.rad > 1.2 ? 1.6 : 1), bh = 5;
      if (hurt && e.id !== S.id) {
        octx.fillStyle = 'rgba(0,0,0,.65)'; octx.fillRect(p[0] - bw / 2 - 1, p[1] - 1, bw + 2, bh + 2);
        octx.fillStyle = e.k === 2 || (e.fl & 32) ? '#e0483c' : e.o === S.id ? '#58c97a' : '#5aa9e6'; octx.fillRect(p[0] - bw / 2, p[1], bw * clamp(e.hp / e.mh, 0, 1), bh);
      }
      if (named && d < 45) {
        const ro = S.roster.get(e.id), label = e.k === 0 ? (ro ? ro.n + ' · ' + ro.l : '') : mob.name;
        octx.font = '600 12px system-ui, sans-serif'; octx.strokeStyle = 'rgba(0,0,0,.8)'; octx.lineWidth = 3; octx.strokeText(label, p[0], p[1] - 5);
        octx.fillStyle = e.k === 0 ? D.COLORS[(ro ? ro.s : 0) % 8] : mob.boss ? '#ffb347' : '#ffd9a0'; octx.fillText(label, p[0], p[1] - 5);
      }
    }
    for (const f of S.floats) {
      const p = eng.project(f.x, f.y, f.z); if (!p) continue;
      const a = clamp(f.life / f.max * 2, 0, 1), sz = f.size * clamp(16 / p[2] + 0.5, 0.7, 1.5);
      octx.globalAlpha = a; octx.font = '800 ' + sz.toFixed(1) + 'px system-ui, sans-serif';
      octx.strokeStyle = 'rgba(0,0,0,.85)'; octx.lineWidth = 3; octx.strokeText(f.text, p[0], p[1]); octx.fillStyle = f.color; octx.fillText(f.text, p[0], p[1]);
    }
    octx.globalAlpha = 1;
    if (boss) {
      const bw = Math.min(w * 0.6, 320), x = (w - bw) / 2, y = h * 0.16;
      octx.fillStyle = 'rgba(0,0,0,.7)'; octx.fillRect(x - 2, y - 2, bw + 4, 14); octx.fillStyle = '#c8362b'; octx.fillRect(x, y, bw * clamp(boss.hp / boss.mh, 0, 1), 10);
      octx.font = '700 13px Georgia, serif'; octx.strokeStyle = '#000'; octx.lineWidth = 3; octx.strokeText('Gardien de Malterre', w / 2, y - 6); octx.fillStyle = '#ffb347'; octx.fillText('Gardien de Malterre', w / 2, y - 6);
    }
  }

  const mm = $('minimap'), mctx = mm.getContext('2d');
  function minimap() {
    const c = mctx, W = 220, R = 104, k = R / (WR + 5), cx = W / 2, cy = W / 2, P = (x, z) => [cx + x * k, cy - z * k];
    c.clearRect(0, 0, W, W);
    c.fillStyle = '#4f7a3c'; c.beginPath(); c.arc(cx, cy, WR * k, 0, TAU); c.fill();
    c.fillStyle = '#2f5234'; c.beginPath(); c.arc(cx, cy, D.WORLD.tier1 * k, 0, TAU); c.fill();
    c.fillStyle = '#4b3a47'; c.beginPath(); c.arc(cx, cy, D.WORLD.tier2 * k, 0, TAU); c.fill();
    for (const f of S.forts) { const p = P(f.x, f.z); c.fillStyle = f.o ? D.COLORS[f.s % 8] : 'rgba(255,255,255,.25)'; c.fillRect(p[0] - 6, p[1] - 6, 12, 12); if (S.me && f.s === S.me.slot) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.strokeRect(p[0] - 8, p[1] - 8, 16, 16); } }
    for (const e of S.ents.values()) {
      if (e.id === S.id) continue;
      const p = P(e.x, e.z);
      if (e.k === 2) { const m = D.MOBS[e.t]; c.fillStyle = m.boss ? '#ffb347' : '#ff4d40'; const s = m.boss ? 8 : m.elite ? 5 : 3; c.fillRect(p[0] - s / 2, p[1] - s / 2, s, s); }
      else if (e.k === 0) { c.fillStyle = (e.fl & 32) ? '#ff9a2e' : '#fff'; c.beginPath(); c.arc(p[0], p[1], 4, 0, TAU); c.fill(); }
      else if (e.fl & 32) { c.fillStyle = '#ff9a2e'; c.fillRect(p[0] - 1.5, p[1] - 1.5, 3, 3); }
      else if (e.o === S.id) { c.fillStyle = '#9dffb4'; c.fillRect(p[0] - 1.5, p[1] - 1.5, 3, 3); }
    }
    const p = P(S.x, S.z);
    c.save(); c.translate(p[0], p[1]); c.rotate(S.r); c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -9); c.lineTo(6, 7); c.lineTo(0, 3); c.lineTo(-6, 7); c.closePath(); c.stroke(); c.fill(); c.restore();
  }

  let last = performance.now(), frame = 0;
  function loop(ts) {
    const dt = Math.min(0.1, (ts - last) / 1000); last = ts; S.time += dt;
    if (S.inGame) { update(dt); render(); if (++frame % 6 === 0) minimap(); }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  window.__malterre = S; // pratique pour le débogage
  connect();
})();
