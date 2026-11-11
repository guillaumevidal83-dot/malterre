/* Malterre — modèles low-poly construits par le code (personnages, monstres, décor, bâtiments). */
'use strict';
const Models = (function () {
  let eng = null;
  const cache = {};
  const TAU = Math.PI * 2;
  const GOLD = [1.0, 0.8, 0.25], STEEL = [0.7, 0.72, 0.78], WOOD = [0.42, 0.28, 0.16], DARK = [0.12, 0.11, 0.13];
  const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  function rng(seed) { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function weapon(g, kind, y) {
    if (kind === 'staff') { g.at(0, y - 0.9, 0.2).cyl(0.05, 0.05, 2.4, 5, WOOD); g.at(0, y + 1.6, 0.2).ball(0.2, 0.26, 0.2, [0.5, 1.8, 0.8], 5, 3); }
    else if (kind === 'sword' || kind === 'dagger') { const L = kind === 'sword' ? 1.1 : 0.55; g.at(0, y, 0.12 + L / 2).box(0.08, 0.04, L, STEEL); g.at(0, y, 0.12).box(0.32, 0.07, 0.07, WOOD); }
    else if (kind === 'club') { g.at(0, y, 0.55).box(0.14, 0.14, 0.9, WOOD); g.at(0, y, 1.05).box(0.34, 0.34, 0.42, mul(WOOD, 0.7)); g.at(0, y + 0.2, 1.05).cyl(0.06, 0, 0.18, 4, STEEL); }
    else if (kind === 'axe') { g.at(0, y, 0.6).box(0.1, 0.1, 1.2, WOOD); g.at(0, y + 0.18, 1.05).box(0.06, 0.5, 0.42, STEEL); }
    else if (kind === 'mace') { g.at(0, y, 0.6).box(0.12, 0.12, 1.1, WOOD); g.at(0, y, 1.2).ball(0.28, 0.28, 0.28, GOLD, 5, 3); }
  }

  function humanoid(o) {
    const b = o.bulk || 1, skin = o.skin, cloth = o.cloth, limb = o.limb || skin, parts = [];
    const body = new Geo(), hy = 1.9;
    if (o.robe) {
      body.at(0, 0.15, 0).cyl(0.62, 0.36, 1.35, 7, cloth);
      body.at(0, 1.45, 0).box(0.95, 0.3, 0.52, mul(cloth, 0.8));
    } else {
      body.at(0, 1.2, 0).box(0.85 * b, 0.8, 0.48 * b, cloth);
      body.at(0, 0.84, 0).box(0.88 * b, 0.13, 0.5 * b, mul(cloth, 0.6));
    }
    if (o.core) body.at(0, 1.25, 0.25 * b).ball(0.22, 0.22, 0.12, o.core, 5, 3);
    const eye = o.eye || DARK;
    if (o.head === 'skull') {
      body.at(0, hy, 0).box(0.48, 0.46, 0.48, skin); body.at(0, hy - 0.3, 0.03).box(0.34, 0.14, 0.38, mul(skin, 0.9));
      body.at(-0.11, hy + 0.03, 0.245).box(0.11, 0.11, 0.02, eye); body.at(0.11, hy + 0.03, 0.245).box(0.11, 0.11, 0.02, eye);
    } else if (o.head === 'helm') {
      body.at(0, hy, 0).box(0.54, 0.56, 0.54, skin); body.at(0, hy + 0.02, 0.275).box(0.4, 0.09, 0.02, eye);
      body.at(0, hy + 0.38, -0.05).box(0.08, 0.3, 0.4, [0.6, 0.1, 0.1]);
    } else {
      body.at(0, hy, 0).box(0.5 * Math.max(1, b * 0.85), 0.5, 0.5, skin);
      body.at(-0.12, hy + 0.04, 0.255).box(0.09, 0.09, 0.02, eye); body.at(0.12, hy + 0.04, 0.255).box(0.09, 0.09, 0.02, eye);
      if (o.head === 'hood') { body.at(0, hy + 0.05, -0.06).box(0.6, 0.62, 0.52, mul(cloth, 0.7)); body.at(0, hy - 0.17, 0.26).box(0.5, 0.16, 0.03, mul(cloth, 0.5)); }
    }
    if (o.ears) { body.at(-0.4, hy + 0.05, 0, 0, 0, 0.5).box(0.4, 0.14, 0.06, skin); body.at(0.4, hy + 0.05, 0, 0, 0, -0.5).box(0.4, 0.14, 0.06, skin); }
    if (o.tusks) { body.at(-0.14, hy - 0.2, 0.27).cyl(0.04, 0, 0.18, 4, [0.95, 0.93, 0.85]); body.at(0.14, hy - 0.2, 0.27).cyl(0.04, 0, 0.18, 4, [0.95, 0.93, 0.85]); }
    if (o.crown) { body.at(0, hy + 0.24, 0).cyl(0.3, 0.34, 0.16, 6, GOLD); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; body.at(Math.cos(a) * 0.3, hy + 0.38, Math.sin(a) * 0.3).cyl(0.06, 0, 0.18, 4, GOLD); } }
    if (o.cape) body.at(0, 1.02, -0.3 * b, 0, 0.14).box(0.82 * b, 1.25, 0.06, o.cape);
    parts.push({ geo: body, p: [0, 0, 0], k: 'body' });
    const ax = 0.43 * b + 0.13;
    for (const side of [-1, 1]) {
      const arm = new Geo();
      arm.at(0, -0.38, 0).box(0.22 * b, 0.76, 0.22 * b, o.sleeve || limb);
      if (side === 1 && o.weapon) weapon(arm, o.weapon, -0.72);
      parts.push({ geo: arm, p: [side * ax, 1.52, 0], k: side < 0 ? 'armL' : 'armR' });
      if (!o.robe) {
        const leg = new Geo();
        leg.at(0, -0.4, 0).box(0.28 * b, 0.8, 0.3 * b, o.pants || mul(cloth, 0.75));
        parts.push({ geo: leg, p: [side * 0.22 * b, 0.8, 0], k: side < 0 ? 'legL' : 'legR' });
      }
    }
    return { kind: o.robe ? 'float' : 'biped', parts, h: 2.3, pose: o.pose };
  }

  function quad(o) {
    const c = o.col, d = mul(c, 0.75), body = new Geo(), parts = [];
    body.at(0, 0.88, 0).box(0.7 * o.w, 0.62, 1.5, c);
    body.at(0, 1.02, 0.95).box(0.5, 0.46, 0.56, c); body.at(0, 0.92, 1.3).box(0.28, 0.24, 0.3, d);
    body.at(-0.17, 1.3, 0.85).cyl(0.09, 0, 0.22, 4, d); body.at(0.17, 1.3, 0.85).cyl(0.09, 0, 0.22, 4, d);
    body.at(-0.14, 1.1, 1.235).box(0.07, 0.07, 0.02, o.eye); body.at(0.14, 1.1, 1.235).box(0.07, 0.07, 0.02, o.eye);
    if (o.tusks) { body.at(-0.18, 0.86, 1.4, 0, -0.6).cyl(0.05, 0, 0.3, 4, [0.95, 0.93, 0.85]); body.at(0.18, 0.86, 1.4, 0, -0.6).cyl(0.05, 0, 0.3, 4, [0.95, 0.93, 0.85]); body.at(0, 1.25, 0).box(0.12, 0.14, 1.3, d); }
    else body.at(0, 1.0, -0.9, 0, -0.7).box(0.12, 0.12, 0.6, d);
    parts.push({ geo: body, p: [0, 0, 0], k: 'body' });
    for (const [x, z, k] of [[-0.25, 0.55, 'legL'], [0.25, 0.55, 'legR'], [-0.25, -0.55, 'legR'], [0.25, -0.55, 'legL']]) {
      const leg = new Geo(); leg.at(0, -0.3, 0).box(0.18, 0.6, 0.18, d);
      parts.push({ geo: leg, p: [x * o.w, 0.6, z], k });
    }
    return { kind: 'quad', parts, h: 1.6 };
  }

  function spider() {
    const c = [0.16, 0.13, 0.18], body = new Geo(), parts = [];
    body.at(0, 0.85, -0.5).ball(0.7, 0.55, 0.8, c, 6, 4); body.at(0, 0.75, 0.45).ball(0.42, 0.36, 0.42, mul(c, 1.3), 6, 3);
    body.at(0, 1.0, -0.5).ball(0.3, 0.3, 0.35, [0.7, 0.1, 0.1], 5, 3);
    for (const x of [-0.18, -0.06, 0.06, 0.18]) body.at(x, 0.85, 0.83).box(0.07, 0.07, 0.03, [1.8, 0.2, 0.2]);
    parts.push({ geo: body, p: [0, 0, 0], k: 'body' });
    for (const grp of [0, 1]) {
      const g = new Geo();
      for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
        if ((i + (s > 0 ? 1 : 0)) % 2 !== grp) continue;
        const z = 0.5 - i * 0.33;
        g.at(s * 0.75, 0.95, z, 0, 0, s * -0.5).box(0.9, 0.09, 0.09, c);
        g.at(s * 1.3, 0.5, z, 0, 0, s * 1.0).box(1.0, 0.08, 0.08, c);
      }
      parts.push({ geo: g, p: [0, 0, 0], k: grp ? 'spB' : 'spA', ax: 'y' });
    }
    return { kind: 'spider', parts, h: 1.4 };
  }

  const BONE = hex('#d9d4c0'), GOB = hex('#5fa84a');
  const DEFS = {
    lich: () => humanoid({ robe: true, skin: BONE, cloth: hex('#3b2a5c'), sleeve: hex('#2c1f47'), head: 'skull', eye: [0.4, 1.8, 0.7], crown: true, weapon: 'staff', cape: hex('#241a3a') }),
    goblin_king: () => humanoid({ skin: GOB, cloth: hex('#7a2f22'), head: 'round', eye: [1.6, 1.3, 0.2], ears: true, crown: true, tusks: true, weapon: 'mace', cape: hex('#a3261c'), bulk: 1.3 }),
    skeleton: () => humanoid({ skin: BONE, cloth: mul(BONE, 0.8), pants: mul(BONE, 0.9), head: 'skull', eye: [0.3, 1.2, 0.5], weapon: 'sword', bulk: 0.72 }),
    raised: () => humanoid({ skin: hex('#b9e8c0'), cloth: hex('#8fcf9c'), pants: hex('#a6dcb0'), head: 'skull', eye: [0.4, 2, 0.8], weapon: 'sword', bulk: 0.72 }),
    zombie: () => humanoid({ skin: hex('#7d9a6a'), cloth: hex('#4a4238'), head: 'round', eye: [1.2, 1.2, 0.5], bulk: 1.1, pose: 'zombie' }),
    goblin: () => humanoid({ skin: GOB, cloth: hex('#6b4a2a'), head: 'round', eye: [1.4, 1.2, 0.2], ears: true, weapon: 'dagger' }),
    brute: () => humanoid({ skin: hex('#4d8f3c'), cloth: hex('#5a3a22'), head: 'round', eye: [1.4, 0.4, 0.2], ears: true, tusks: true, weapon: 'club', bulk: 1.45 }),
    wolf: () => quad({ col: hex('#7c7f88'), w: 1, eye: [1.6, 1.3, 0.3] }),
    boar: () => quad({ col: hex('#6b4a33'), w: 1.3, eye: [0.1, 0.1, 0.1], tusks: true }),
    bandit: () => humanoid({ skin: hex('#d2a680'), cloth: hex('#5a4a3a'), head: 'hood', weapon: 'sword' }),
    spider,
    orc: () => humanoid({ skin: hex('#6b8f4e'), cloth: hex('#3d3226'), head: 'round', eye: [1.5, 0.3, 0.2], tusks: true, weapon: 'axe', bulk: 1.35 }),
    knight: () => humanoid({ skin: hex('#2a2c36'), cloth: hex('#1c1d24'), limb: hex('#2a2c36'), head: 'helm', eye: [2, 0.2, 0.2], weapon: 'sword', cape: hex('#4a0f14'), bulk: 1.15 }),
    troll: () => humanoid({ skin: hex('#6f8fa3'), cloth: hex('#4c3b2a'), head: 'round', eye: [1.6, 1.4, 0.3], tusks: true, ears: true, weapon: 'club', bulk: 1.6 }),
    guardian: () => humanoid({ skin: hex('#6b6f78'), cloth: hex('#585c66'), limb: hex('#7a7e88'), head: 'helm', eye: [2.2, 1.0, 0.2], core: [2.4, 1.1, 0.2], bulk: 1.7 }),
  };
  const SCALE = { lich: 1.15, goblin_king: 1.1, skeleton: 0.9, raised: 0.9, zombie: 1.0, goblin: 0.7, brute: 1.05, wolf: 1.0, boar: 1.0, bandit: 1.0, spider: 1.25, orc: 1.25, knight: 1.25, troll: 2.1, guardian: 3.4 };

  function build(def) { for (const p of def.parts) { p.m = eng.mesh(p.geo); delete p.geo; } return def; }
  function get(name) { if (!cache[name]) { cache[name] = build(DEFS[name]()); cache[name].s = SCALE[name] || 1; } return cache[name]; }
  function single(key, fn) { if (!cache[key]) { const g = new Geo(); fn(g); cache[key] = eng.mesh(g); } return cache[key]; }

  /* ---------- Décor ---------- */
  function node(type, rich, variant, vis) {
    if (type === 'tree') {
      if (vis === 0) return single('stump', g => { g.at(0, 0, 0).cyl(0.5, 0.42, 0.5, 6, WOOD); });
      if (rich >= 3) return single('deadtree' + variant, g => {
        const c = [0.22, 0.19, 0.2];
        g.at(0, 0, 0).cyl(0.42, 0.22, 3.6 + variant * 0.5, 5, c);
        g.at(0, 2.4, 0, 0.6 + variant, 0, 0.9).cyl(0.14, 0.04, 2.0, 4, c); g.at(0, 3.0, 0, 3.4 + variant, 0, 0.8).cyl(0.12, 0.03, 1.7, 4, c); g.at(0, 1.8, 0, 2 + variant, 0, 1.1).cyl(0.1, 0.03, 1.4, 4, c);
      });
      return single('tree' + (rich >= 2 ? 'd' : '') + variant, g => {
        const leaf = rich >= 2 ? [0.13, 0.3, 0.17] : [[0.25, 0.5, 0.2], [0.3, 0.52, 0.18], [0.2, 0.45, 0.24]][variant], H = 1.6 + variant * 0.3;
        g.at(0, 0, 0).cyl(0.36, 0.26, H, 5, WOOD);
        if (variant === 1 && rich < 2) { g.at(0, H + 1.1, 0).ball(1.7, 1.5, 1.7, leaf, 6, 4); g.at(0.8, H + 0.5, 0.4).ball(1.0, 0.9, 1.0, mul(leaf, 0.9), 5, 3); }
        else { g.at(0, H - 0.2, 0).cyl(1.8, 0.9, 1.6, 6, leaf); g.at(0, H + 1.1, 0).cyl(1.4, 0.5, 1.5, 6, mul(leaf, 1.1)); g.at(0, H + 2.3, 0).cyl(0.9, 0, 1.5, 6, mul(leaf, 1.2)); }
      });
    }
    if (type === 'rock') return single('rock' + variant, g => {
      const c = [0.5, 0.5, 0.53];
      g.at(0, 0.6, 0, 0.3 + variant).box(1.8, 1.3, 1.5, c); g.at(0.8, 0.4, 0.5, 1.1).box(1.1, 0.9, 1.0, mul(c, 0.85)); g.at(-0.6, 0.35, -0.6, 0.7).box(0.9, 0.7, 0.9, mul(c, 1.1));
    });
    if (type === 'vein') return single('vein', g => {
      const c = [0.36, 0.34, 0.38];
      g.at(0, 0.7, 0, 0.4).box(2.0, 1.5, 1.7, c); g.at(0.7, 0.4, 0.6, 1.0).box(1.1, 0.9, 1.0, mul(c, 0.85));
      for (const [x, y, z] of [[0.5, 1.3, 0.5], [-0.6, 1.1, 0.7], [0.9, 0.7, -0.2], [-0.2, 1.5, -0.4], [1.1, 0.6, 0.9], [-0.9, 0.6, 0.1]]) g.at(x, y, z, x * 3, y).box(0.34, 0.34, 0.34, [1.5, 1.15, 0.3]);
    });
    return single('remains', g => {
      const metal = [0.45, 0.42, 0.4];
      g.at(0, 0.02, 0).disc(1.6, 8, [0.3, 0.26, 0.22]);
      g.at(0, 0.3, 0).box(0.5, 0.46, 0.5, BONE); g.at(-0.11, 0.33, 0.255).box(0.11, 0.11, 0.02, DARK); g.at(0.11, 0.33, 0.255).box(0.11, 0.11, 0.02, DARK);
      for (let i = 0; i < 4; i++) g.at(0.8, 0.45, -0.5 + i * 0.28, 0, 0, 0.4).box(0.07, 0.9, 0.07, BONE);
      g.at(-0.8, 0.12, 0.5, 0.6).box(1.0, 0.1, 0.1, BONE); g.at(-0.5, 0.12, -0.8, 2.1).box(0.9, 0.1, 0.1, BONE);
      g.at(-0.9, 0.35, -0.2, 0.4, 0.5).box(0.7, 0.7, 0.06, metal); g.at(0.3, 0.55, -0.9, 1.2, 0, 1.2).box(0.08, 1.3, 0.08, metal); g.at(0.2, 0.2, 0.9, 0.5).cyl(0.35, 0.35, 0.12, 6, mul(metal, 0.8));
    });
  }

  function terrain() {
    return single('terrain', g => {
      const WD = DATA.WORLD, R = rng(4242), v = g.v, S = 10, RAD = WD.radius + 10;
      const T = [[0.33, 0.5, 0.25], [0.19, 0.33, 0.2], [0.31, 0.27, 0.29], [0.72, 0.66, 0.46]];
      const noise = (x, z) => Math.sin(x * 0.071 + 1.3) * Math.cos(z * 0.063) * 0.5 + Math.sin((x + z) * 0.19) * 0.25;
      const col = (x, z) => {
        const r = Math.hypot(x, z) + noise(x, z) * 14, n = 0.9 + 0.2 * (0.5 + 0.5 * Math.sin(x * 0.37 + z * 0.21) * Math.cos(z * 0.29 - x * 0.11));
        const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        const sm = (e0, e1) => Math.max(0, Math.min(1, (r - e0) / (e1 - e0)));
        let c = mix(T[2], T[1], sm(WD.tier2 - 10, WD.tier2 + 10)); c = mix(c, T[0], sm(WD.tier1 - 10, WD.tier1 + 10)); c = mix(c, T[3], sm(WD.radius - 9, WD.radius - 1));
        return [c[0] * n, c[1] * n, c[2] * n];
      };
      const put = (x, z) => { const c = col(x, z); v.push(x, 0, z, 0, 1, 0, c[0], c[1], c[2]); };
      for (let x = -RAD; x < RAD; x += S) for (let z = -RAD; z < RAD; z += S) {
        if (Math.hypot(x + S / 2, z + S / 2) > RAD + S) continue;
        put(x, z); put(x, z + S); put(x + S, z + S); put(x, z); put(x + S, z + S); put(x + S, z);
      }
      // Touffes d'herbe, cailloux et fleurs.
      for (let i = 0; i < 3400; i++) {
        const a = R() * TAU, r = Math.sqrt(R()) * (WD.radius - 6), x = Math.sin(a) * r, z = Math.cos(a) * r, c = col(x, z), k = R();
        if (r < WD.tier2) g.at(x, 0.12, z, R() * 3).box(0.3 + R() * 0.5, 0.25, 0.3 + R() * 0.4, [0.4, 0.38, 0.4]);
        else if (k < 0.75) g.at(x, 0, z, R() * 3).cyl(0.3, 0, 0.5 + R() * 0.4, 3, mul(c, 1.25));
        else if (k < 0.9) g.at(x, 0.1, z, R() * 3).box(0.4, 0.22, 0.35, [0.55, 0.55, 0.57]);
        else { g.at(x, 0, z).cyl(0.04, 0.04, 0.4, 3, [0.3, 0.5, 0.2]); g.at(x, 0.42, z).box(0.2, 0.12, 0.2, [[1, 0.85, 0.3], [0.95, 0.5, 0.7], [0.9, 0.9, 1]][i % 3]); }
      }
      g.at(0, -0.5, 0).disc(1400, 16, [0.1, 0.19, 0.3]);
    });
  }

  /* ---------- Forteresses ---------- */
  const PAL = {
    lich: { stone: [0.3, 0.29, 0.37], dark: [0.17, 0.16, 0.22], glow: [0.5, 1.7, 0.8], trim: BONE, roof: [0.3, 0.17, 0.42] },
    goblin: { stone: [0.5, 0.34, 0.2], dark: [0.3, 0.2, 0.12], glow: [1.9, 0.8, 0.2], trim: [0.55, 0.55, 0.58], roof: [0.62, 0.2, 0.14] },
  };
  function building(cls, type, lvl) {
    const P = PAL[cls] || PAL.lich;
    return single('b_' + cls + type + lvl, g => {
      if (lvl <= 0) {
        g.at(0, 0.1, 0).box(5, 0.2, 5, P.dark);
        for (const [x, z] of [[-2.3, -2.3], [2.3, -2.3], [-2.3, 2.3], [2.3, 2.3]]) g.at(x, 0, z).cyl(0.14, 0.1, 1.2, 4, WOOD);
        return;
      }
      if (type === 'throne') {
        const H = 3 + lvl * 0.9;
        g.at(0, H / 2, 0).box(7, H, 6, P.stone);
        for (let i = -3; i <= 3; i += 1.5) { g.at(i, H + 0.25, 2.8).box(0.7, 0.5, 0.5, P.dark); g.at(i, H + 0.25, -2.8).box(0.7, 0.5, 0.5, P.dark); }
        for (const [x, z] of [[-3.5, -3], [3.5, -3], [-3.5, 3], [3.5, 3]]) { g.at(x, 0, z).cyl(1.15, 0.95, H + 1.5, 6, P.dark); g.at(x, H + 1.5, z).cyl(1.35, 0, 1.7, 6, P.roof); }
        g.at(0, 1.15, 3.02).box(1.7, 2.3, 0.1, DARK); g.at(0, 2.5, 3.02).box(2.1, 0.25, 0.14, P.trim);
        g.at(0, H, 0).cyl(1.7, 1.25, 1.5 + lvl, 6, P.stone); g.at(0, H + 1.5 + lvl, 0).cyl(1.6, 0, 2, 6, P.roof);
        g.at(0, H + 4 + lvl, 0).ball(0.5, 0.6, 0.5, P.glow, 5, 3);
        for (const x of [-1.6, 1.6]) g.at(x, 2.0, 3.05).box(0.25, 0.5, 0.06, P.glow);
      } else if (type === 'storage') {
        g.at(0, 1.25, 0).box(5, 2.5, 4, P.stone); g.at(0, 2.5, 0, Math.PI / 4).cyl(4.1, 0, 1.9, 4, P.roof);
        g.at(0, 0.9, 2.02).box(1.4, 1.8, 0.1, DARK);
        for (let i = 0; i < lvl; i++) g.at(3.2 + (i % 2) * 0.9, 0.4 + (i > 3 ? 0.8 : 0), -1.4 + (i % 4 >> 1) * 1.0, i).box(0.8, 0.8, 0.8, i % 2 ? P.trim : WOOD);
      } else if (type === 'barracks') {
        if (cls === 'goblin') { g.at(0, 0, 0).cyl(3.3, 0.3, 3.8, 7, P.roof); g.at(0, 3.6, 0).cyl(0.1, 0.1, 1.2, 4, WOOD); g.at(0, 0.9, 3.0).box(1.3, 1.8, 0.3, DARK); }
        else { g.at(0, 1, 0).box(5.5, 2, 4.5, P.stone); g.at(0, 2.15, 0).box(6, 0.3, 5, P.dark); g.at(0, 0.9, 2.27).box(1.4, 1.8, 0.1, mul(P.glow, 0.45)); g.at(0, 2.9, 0).box(0.25, 1.2, 0.25, P.trim); g.at(0, 3.1, 0).box(0.8, 0.22, 0.22, P.trim); }
        for (let i = 0; i <= lvl; i++) {
          const x = -4.2 + (i % 2) * 8.4, z = -1.5 + (i >> 1) * 1.5;
          if (cls === 'goblin') g.at(x, 0, z, 0, 0, i % 2 ? -0.2 : 0.2).cyl(0.16, 0, 2.2, 4, WOOD);
          else { g.at(x, 0.55, z).box(0.7, 1.1, 0.2, P.trim); }
        }
      } else if (type === 'altar') {
        g.at(0, 0, 0).cyl(2.7, 2.4, 0.5, 8, P.stone);
        g.at(0, 0.5, 0).cyl(0.55, 0.42, 1.5 + 0.4 * lvl, 6, P.dark);
        g.at(0, 2.7 + 0.4 * lvl, 0).ball(0.55, 0.8, 0.55, P.glow, 6, 4);
        for (let i = 0; i < lvl + 1; i++) { const a = i / (lvl + 1) * TAU; g.at(Math.cos(a) * 2, 0.5, Math.sin(a) * 2).cyl(0.16, 0.12, 0.9, 5, P.trim); g.at(Math.cos(a) * 2, 1.5, Math.sin(a) * 2).ball(0.13, 0.2, 0.13, P.glow, 4, 3); }
      } else {
        g.at(0, 1.1, 0).box(4.5, 2.2, 4, P.stone); g.at(0, 2.2, 0, Math.PI / 4).cyl(3.7, 0, 1.6, 4, P.roof);
        g.at(1.4, 2.2, -1).box(0.7, 1.9 + 0.25 * lvl, 0.7, P.dark); g.at(1.4, 4.2 + 0.25 * lvl, -1).box(0.5, 0.2, 0.5, P.glow);
        g.at(0, 0.9, 2.02).box(1.3, 1.8, 0.1, DARK);
        g.at(-3.2, 0.55, 1).box(1.7, 0.18, 0.9, WOOD); g.at(-3.9, 0.27, 1).box(0.14, 0.55, 0.7, WOOD); g.at(-2.5, 0.27, 1).box(0.14, 0.55, 0.7, WOOD);
        for (let i = 0; i < lvl; i++) g.at(-3.6 + i * 0.35, 0.75, 1, i).box(0.22, 0.22, 0.22, P.trim);
      }
    });
  }
  function wall(cls) {
    const P = PAL[cls] || PAL.lich, R = 24;
    return single('wall_' + cls, g => {
      g.at(0, 0.03, 0).disc(26, 28, cls === 'goblin' ? [0.36, 0.29, 0.2] : [0.25, 0.24, 0.27]);
      const n = 96;
      for (let i = 0; i < n; i++) {
        let a = i / n * TAU; if (a > Math.PI) a -= TAU;
        if (Math.abs(a) < 0.21) continue;
        const x = Math.sin(a) * R, z = Math.cos(a) * R, tall = i % 4 === 0;
        if (cls === 'goblin') { g.at(x, 0, z).cyl(0.52, 0.46, 3 + (i % 3) * 0.3, 5, i % 2 ? P.stone : P.dark); g.at(x, 3 + (i % 3) * 0.3, z).cyl(0.46, 0, 0.9, 5, P.stone); }
        else { g.at(x, tall ? 2.1 : 1.6, z, a).box(1.62, tall ? 4.2 : 3.2, 1.0, tall ? P.dark : P.stone); if (tall) g.at(x, 4.4, z).ball(0.25, 0.35, 0.25, P.glow, 4, 3); }
      }
      for (const s of [-1, 1]) { const a = s * 0.23, x = Math.sin(a) * R, z = Math.cos(a) * R; g.at(x, 0, z).cyl(0.75, 0.6, 5.5, 6, P.dark); g.at(x, 5.5, z).cyl(0.9, 0, 1.3, 6, P.roof); }
    });
  }
  function banner() {
    return single('banner', g => { for (const s of [-1, 1]) { const a = s * 0.23, x = Math.sin(a) * 24, z = Math.cos(a) * 24; g.at(x, 3.6, z + 0.85).box(1.3, 2.4, 0.08, [1, 1, 1]); g.at(x, 2.15, z + 0.85, 0, 0, Math.PI / 4).box(0.9, 0.9, 0.08, [1, 1, 1]); } });
  }
  function emptyFort() {
    return single('empty', g => {
      g.at(0, 0.03, 0).disc(24, 24, [0.4, 0.38, 0.33]);
      for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; g.at(Math.sin(a) * 23, 0.5, Math.cos(a) * 23, a * 2).box(1.4, 1 + (i % 3) * 0.4, 1.1, [0.5, 0.5, 0.52]); }
      g.at(0, 0, 0).cyl(0.12, 0.12, 2.2, 4, WOOD); g.at(0, 1.9, 0.1).box(1.6, 0.8, 0.1, mul(WOOD, 1.3));
    });
  }

  return {
    init(e) { eng = e; }, get, node, terrain, building, wall, banner, emptyFort,
    cube: () => single('cube', g => g.box(1, 1, 1, [1, 1, 1])),
    disc: () => single('disc', g => g.disc(1, 16, [1, 1, 1])),
    orb: () => single('orb', g => g.ball(1, 1, 1, [1, 1, 1], 6, 4)),
    ring: () => single('ring', g => { for (let i = 0; i < 24; i++) { const a = i / 24 * TAU, b = (i + 1) / 24 * TAU; for (const [p, q] of [[a, 0.86], [b, 0.86], [b, 1], [a, 0.86], [b, 1], [a, 1]]) g.v.push(Math.cos(p) * q, 0, Math.sin(p) * q, 0, 1, 0, 1, 1, 1); } }),
  };
})();
