/* Malterre — données de jeu partagées entre le serveur et le client. */
(function (root) {
  const DATA = {
    VERSION: '0.2.0',
    WORLD: { radius: 290, fortRing: 215, slots: 8, tier1: 150, tier2: 75, view: 100 },
    // Réglages modifiables depuis la page admin (durées en secondes).
    CONFIG: {
      respawnMob: 90, respawnElite: 1200, respawnBoss: 14400,
      regenNode: 20, minionRevive: 60, playerRespawn: 6,
      xpMult: 1, lootMult: 1, offlineRate: 0.5, offlineMaxH: 12,
      raidLoot: 0.25, raidShieldH: 4, newShieldH: 4, raidDown: 1800, lootTime: 8,
    },
    CONFIG_LABELS: {
      respawnMob: 'Réapparition des mobs (s)', respawnElite: 'Réapparition des élites (s)',
      respawnBoss: 'Réapparition du boss (s)', regenNode: 'Régénération des gisements (s par unité)',
      minionRevive: 'Retour d\'un serviteur vaincu (s)', playerRespawn: 'Réapparition du héros (s)',
      xpMult: 'Multiplicateur d\'expérience', lootMult: 'Multiplicateur de butin',
      offlineRate: 'Rendement hors ligne (0 à 1)', offlineMaxH: 'Rattrapage maximum (heures)',
      raidLoot: 'Part du stock volée par un pillage (0 à 1)', raidShieldH: 'Bouclier après un pillage (heures)', newShieldH: 'Bouclier d\'un nouveau royaume (heures)',
      raidDown: 'Serviteur de garnison vaincu : indisponible (s)', lootTime: 'Durée du pillage (s)',
    },
    RES: {
      wood: { name: 'Bois', icon: '🌲' }, stone: { name: 'Pierre', icon: '🧱' },
      gold: { name: 'Or', icon: '💰' }, spec: { name: 'Spécial', icon: '✨' },
    },
    START: { res: { wood: 60, stone: 40, gold: 0, spec: 45 }, roles: ['wood', 'stone', 'spec'] },
    COLORS: ['#8e5bd6', '#d6453a', '#3aa0d6', '#e0a526', '#3fbf6a', '#d65ba8', '#e07b2a', '#58c9c0'],
    CLASSES: {
      lich: {
        name: 'Liche', title: 'Seigneur des morts', spec: 'Os', specIcon: '🦴',
        desc: 'Lance des traits d\'ombre à distance et relève des morts pour combattre.',
        hp: 120, dmg: 11, range: 13, atkCd: 0.9, speed: 8.5, ranged: true,
        minions: ['skeleton', 'zombie'],
        skills: [
          { id: 'bolt', name: 'Trait d\'ombre', icon: '☄️', cd: 4, desc: 'Gros projectile à longue portée.' },
          { id: 'nova', name: 'Nova de givre', icon: '❄️', cd: 10, desc: 'Blesse et ralentit tout autour de toi.' },
          { id: 'raise', name: 'Relever les morts', icon: '💀', cd: 30, desc: 'Invoque 3 squelettes pendant 25 s.' },
        ],
        bnames: { throne: 'Trône d\'os', storage: 'Ossuaire', barracks: 'Crypte', altar: 'Autel noir', workshop: 'Atelier funèbre' },
      },
      goblin: {
        name: 'Roi gobelin', title: 'Chef de la horde', spec: 'Ferraille', specIcon: '⚙️',
        desc: 'Cogne fort au corps à corps, lance des bombes et galvanise sa horde.',
        hp: 170, dmg: 15, range: 3.4, atkCd: 0.8, speed: 9, ranged: false,
        minions: ['goblin', 'brute'],
        skills: [
          { id: 'smash', name: 'Coup de masse', icon: '🔨', cd: 5, desc: 'Frappe lourde qui étourdit devant toi.' },
          { id: 'bomb', name: 'Bombe', icon: '💣', cd: 9, desc: 'Explosion de zone à distance.' },
          { id: 'warcry', name: 'Cri de guerre', icon: '📯', cd: 30, desc: 'Renforce tes gobelins 10 s et te soigne.' },
        ],
        bnames: { throne: 'Trône de ferraille', storage: 'Réserve', barracks: 'Tanière', altar: 'Totem de guerre', workshop: 'Bricolerie' },
      },
    },
    MINIONS: {
      skeleton: { name: 'Squelette', hp: 45, dmg: 6, speed: 7, work: 1, cost: { spec: 15 }, unlock: 0 },
      zombie: { name: 'Zombie', hp: 130, dmg: 11, speed: 4.6, work: 0.6, cost: { spec: 30, gold: 15 }, unlock: 2 },
      goblin: { name: 'Gobelin', hp: 32, dmg: 5, speed: 8.5, work: 1.2, cost: { spec: 10, wood: 5 }, unlock: 0 },
      brute: { name: 'Brute gobeline', hp: 115, dmg: 12, speed: 6, work: 0.7, cost: { spec: 28, gold: 15 }, unlock: 2 },
      raised: { name: 'Squelette relevé', hp: 60, dmg: 9, speed: 8, work: 0, cost: {}, unlock: 99 },
    },
    ROLES: {
      wood: { name: 'Bois', icon: '🌲' }, stone: { name: 'Pierre', icon: '🧱' }, gold: { name: 'Or', icon: '💰' },
      spec: { name: 'Spécial', icon: '✨' }, escort: { name: 'Escorte', icon: '⚔️' }, guard: { name: 'Garde', icon: '🛡️' },
    },
    MOBS: {
      wolf: { name: 'Loup', tier: 1, hp: 40, dmg: 5, speed: 7.5, range: 1.8, aggro: 9, cd: 1.3, xp: 8, gold: [0, 2], spec: [1, 3], rad: 0.8 },
      boar: { name: 'Sanglier', tier: 1, hp: 65, dmg: 7, speed: 6.5, range: 1.8, aggro: 6, cd: 1.5, xp: 11, gold: [0, 2], spec: [2, 4], rad: 0.9 },
      bandit: { name: 'Bandit', tier: 1, hp: 55, dmg: 8, speed: 6.5, range: 2, aggro: 10, cd: 1.3, xp: 13, gold: [3, 8], spec: [1, 3], rad: 0.7 },
      spider: { name: 'Araignée géante', tier: 2, hp: 120, dmg: 13, speed: 7.5, range: 2.2, aggro: 11, cd: 1.2, xp: 26, gold: [1, 4], spec: [3, 6], rad: 1.1 },
      orc: { name: 'Orc', tier: 2, hp: 175, dmg: 17, speed: 6.5, range: 2.4, aggro: 12, cd: 1.5, xp: 34, gold: [5, 12], spec: [3, 7], rad: 0.9 },
      knight: { name: 'Chevalier déchu', tier: 3, hp: 380, dmg: 28, speed: 6.5, range: 2.6, aggro: 14, cd: 1.4, xp: 75, gold: [10, 22], spec: [6, 12], rad: 0.9 },
      troll: { name: 'Troll', tier: 3, hp: 750, dmg: 38, speed: 5.5, range: 3.2, aggro: 14, cd: 1.9, xp: 170, gold: [20, 40], spec: [12, 22], rad: 1.6, elite: true },
      guardian: { name: 'Gardien de Malterre', tier: 4, hp: 6000, dmg: 70, speed: 5, range: 5, aggro: 22, cd: 2.2, xp: 900, gold: [150, 200], spec: [100, 140], rad: 3.4, boss: true },
    },
    NODES: {
      tree: { name: 'Arbre', res: 'wood', stock: 40 }, rock: { name: 'Rocher', res: 'stone', stock: 40 },
      vein: { name: 'Filon d\'or', res: 'gold', stock: 25 }, remains: { name: 'Vestiges', res: 'spec', stock: 30 },
    },
    BUILDINGS: {
      throne: { max: 5, cost: { wood: 150, stone: 150, gold: 60, spec: 60 }, desc: 'Limite le niveau des autres bâtiments.' },
      storage: { max: 5, cost: { wood: 60, stone: 30 }, desc: 'Augmente le stock maximum.' },
      barracks: { max: 5, cost: { wood: 50, stone: 50, spec: 30 }, desc: '+3 serviteurs par niveau, serviteurs plus forts.' },
      altar: { max: 5, cost: { stone: 60, gold: 30, spec: 40 }, desc: '+10 % de vie et de dégâts pour ton héros.' },
      workshop: { max: 5, cost: { wood: 70, stone: 40, gold: 15 }, desc: 'Récolte plus rapide et plus grosse.' },
    },
    // Emplacements des bâtiments dans la forteresse (repère local, +z vers le centre du monde).
    PLOTS: { throne: [0, -15], storage: [-14, -3], barracks: [14, -3], altar: [-11, 9], workshop: [11, 9] },
    FORT: { wall: 24, spawn: [0, 8], zone: 36 },
    // Formules communes.
    cost(b, lvl) {
      const base = DATA.BUILDINGS[b].cost, L = b === 'throne' ? lvl - 1 : lvl, out = {};
      for (const k in base) out[k] = Math.round(base[k] * Math.pow(1.9, L) / 5) * 5;
      return out;
    },
    xpNeed(lvl) { return Math.round(40 * Math.pow(lvl, 1.6)); },
    cap(b) { return 250 + 300 * (b.storage || 0); },
    minionCap(b) { return 4 + 3 * (b.barracks || 0); },
    heroHp(cls, lvl, b) { return Math.round((DATA.CLASSES[cls].hp + 18 * (lvl - 1)) * (1 + 0.1 * (b.altar || 0))); },
    heroDmg(cls, lvl, b) { return (DATA.CLASSES[cls].dmg + 1.6 * (lvl - 1)) * (1 + 0.1 * (b.altar || 0)); },
    throneNeed(lvl) { return lvl * 3; }, // niveau de héros requis pour passer le trône au niveau lvl+1
    MAX_LEVEL: 30,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = DATA; else root.DATA = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
