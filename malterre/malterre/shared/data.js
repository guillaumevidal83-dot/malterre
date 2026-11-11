/* Malterre — données de jeu partagées entre le serveur et le client. */
(function (root) {
  const DATA = {
    VERSION: '0.4.0',
    WORLD: { radius: 430, fortRing: 335, slots: 8, tier1: 240, tier2: 115, view: 100 },
    // Réglages modifiables depuis la page admin (durées en secondes).
    CONFIG: {
      respawnMob: 90, respawnElite: 1200, respawnBoss: 14400,
      regenNode: 20, minionRevive: 60, playerRespawn: 6,
      xpMult: 1, lootMult: 1, offlineRate: 0.5, offlineMaxH: 12,
      raidLoot: 0.25, raidShieldH: 4, newShieldH: 4, raidDown: 1800, lootTime: 8,
      relicMult: 1, refund: 0.5,
    },
    CONFIG_LABELS: {
      respawnMob: 'Réapparition des mobs (s)', respawnElite: 'Réapparition des élites (s)',
      respawnBoss: 'Réapparition du boss (s)', regenNode: 'Régénération des gisements (s par unité)',
      minionRevive: 'Retour d\'un serviteur vaincu (s)', playerRespawn: 'Réapparition du héros (s)',
      xpMult: 'Multiplicateur d\'expérience', lootMult: 'Multiplicateur de butin',
      offlineRate: 'Rendement hors ligne (0 à 1)', offlineMaxH: 'Rattrapage maximum (heures)',
      raidLoot: 'Part du stock volée par un pillage (0 à 1)', raidShieldH: 'Bouclier après un pillage (heures)', newShieldH: 'Bouclier d\'un nouveau royaume (heures)',
      raidDown: 'Serviteur de garnison vaincu : indisponible (s)', lootTime: 'Durée du pillage (s)',
      relicMult: 'Multiplicateur de chance de relique', refund: 'Part remboursée au sacrifice d\'un serviteur (0 à 1)',
    },
    RES: {
      wood: { name: 'Bois', icon: '🌲' }, stone: { name: 'Pierre', icon: '🧱' },
      gold: { name: 'Or', icon: '💰' }, spec: { name: 'Spécial', icon: '✨' },
    },
    START: { res: { wood: 60, stone: 40, gold: 0, spec: 45 }, roles: ['wood', 'stone', 'spec'] },
    COLORS: ['#8e5bd6', '#d6453a', '#3aa0d6', '#e0a526', '#3fbf6a', '#d65ba8', '#e07b2a', '#58c9c0'],
    // Seigneurs jouables. Chaque classe a un atout propre (passive) pour rester différente sans être plus forte.
    CLASSES: {
      lich: {
        name: 'Liche', icon: '💀', model: 'lich', title: 'Seigneur des morts', spec: 'Os', specIcon: '🦴', fx: [0.5, 1.9, 0.9],
        desc: 'Lance des traits d\'ombre à distance et relève des morts pour combattre.',
        passive: { name: 'Légion sans fin', desc: 'Serviteurs 20 % moins chers, et les vaincus reviennent 2 fois plus vite.', minionCost: 0.8, revive: 0.5 },
        hp: 120, dmg: 11, range: 13, atkCd: 0.9, speed: 8.5, ranged: true,
        minions: ['skeleton', 'digger', 'archer', 'ghoul', 'zombie', 'abomination'],
        skills: [
          { id: 'bolt', kind: 'bolt', mult: 2.6, name: 'Trait d\'ombre', icon: '☄️', cd: 4, desc: 'Gros projectile à longue portée.' },
          { id: 'nova', kind: 'nova', mult: 1.5, r: 8.5, slow: 4000, name: 'Nova de givre', icon: '❄️', cd: 10, desc: 'Blesse et ralentit tout autour de toi.' },
          { id: 'raise', kind: 'summon', unit: 'raised', n: 3, name: 'Relever les morts', icon: '💀', cd: 30, desc: 'Invoque 3 squelettes pendant 25 s.' },
        ],
        bnames: { throne: 'Trône d\'os', storage: 'Ossuaire', barracks: 'Crypte', altar: 'Autel noir', workshop: 'Atelier funèbre' },
      },
      goblin: {
        name: 'Roi gobelin', icon: '👺', model: 'goblin_king', title: 'Chef de la horde', spec: 'Ferraille', specIcon: '⚙️', fx: [2.4, 1.2, 0.3],
        desc: 'Cogne fort au corps à corps, lance des bombes et galvanise sa horde.',
        passive: { name: 'Mains agiles', desc: 'Récolte 25 % plus rapide pour les serviteurs, et le héros ramasse 3 ressources par coup au lieu de 2.', work: 1.25, heroHarvest: 3 },
        hp: 170, dmg: 15, range: 3.4, atkCd: 0.8, speed: 9, ranged: false,
        minions: ['goblin', 'miner', 'slinger', 'berserker', 'brute', 'wartroll'],
        skills: [
          { id: 'smash', kind: 'smash', mult: 2.8, r: 4, stun: 1500, name: 'Coup de masse', icon: '🔨', cd: 5, desc: 'Frappe lourde qui étourdit devant toi.' },
          { id: 'bomb', kind: 'bomb', mult: 2.1, r: 5.5, name: 'Bombe', icon: '💣', cd: 9, desc: 'Explosion de zone à distance.' },
          { id: 'warcry', kind: 'warcry', name: 'Cri de guerre', icon: '📯', cd: 30, desc: 'Renforce tes serviteurs 10 s et te soigne.' },
        ],
        bnames: { throne: 'Trône de ferraille', storage: 'Réserve', barracks: 'Tanière', altar: 'Totem de guerre', workshop: 'Bricolerie' },
      },
      demon: {
        name: 'Démon', icon: '😈', model: 'demon_lord', title: 'Prince des enfers', spec: 'Soufre', specIcon: '🌋', fx: [2.6, 0.7, 0.2],
        desc: 'Brûle ses ennemis à distance et appelle des diablotins.',
        passive: { name: 'Fureur infernale', desc: 'Le héros inflige 15 % de dégâts en plus et se soigne de 4 % des dégâts infligés.', dmg: 1.15, vamp: 0.04 },
        hp: 135, dmg: 12, range: 11, atkCd: 0.9, speed: 8.7, ranged: true,
        minions: ['imp', 'borer', 'spitter', 'hound', 'fiend', 'pitlord'],
        skills: [
          { id: 'fireball', kind: 'bolt', mult: 2.6, name: 'Boule de feu', icon: '🔥', cd: 4, desc: 'Projectile enflammé à longue portée.' },
          { id: 'firerain', kind: 'bomb', mult: 2.2, r: 6.5, name: 'Pluie de feu', icon: '🌋', cd: 10, desc: 'Embrase une large zone à distance.' },
          { id: 'imps', kind: 'summon', unit: 'impling', n: 3, name: 'Meute de diablotins', icon: '👿', cd: 30, desc: 'Invoque 3 diablotins pendant 25 s.' },
        ],
        bnames: { throne: 'Trône de braise', storage: 'Fosse aux trésors', barracks: 'Portail infernal', altar: 'Autel de sang', workshop: 'Forge de soufre' },
      },
      druid: {
        name: 'Druide', icon: '🦌', model: 'druid', title: 'Gardien sauvage', spec: 'Sève', specIcon: '🍃', fx: [0.6, 2.0, 0.4],
        desc: 'Enracine ses ennemis, soigne sa meute et appelle les bêtes.',
        passive: { name: 'Force de la nature', desc: 'Serviteurs 20 % plus résistants, et le héros récupère sa vie 2 fois plus vite.', mHp: 1.2, regen: 2 },
        hp: 130, dmg: 10, range: 12, atkCd: 0.9, speed: 8.6, ranged: true,
        minions: ['sprite', 'forager', 'dryad', 'packwolf', 'bear', 'ancient'],
        skills: [
          { id: 'thorns', kind: 'nova', mult: 1.4, r: 8.5, stun: 2000, name: 'Ronces', icon: '🌿', cd: 10, desc: 'Blesse et immobilise tout autour de toi.' },
          { id: 'heal', kind: 'heal', pct: 0.35, r: 14, name: 'Souffle de vie', icon: '💚', cd: 18, desc: 'Te soigne de 35 %, ainsi que tes serviteurs proches.' },
          { id: 'pack', kind: 'summon', unit: 'wolfling', n: 3, name: 'Appel de la meute', icon: '🐺', cd: 30, desc: 'Invoque 3 loups pendant 25 s.' },
        ],
        bnames: { throne: 'Arbre-trône', storage: 'Grenier', barracks: 'Bosquet', altar: 'Cercle de pierres', workshop: 'Atelier des racines' },
      },
      dwarf: {
        name: 'Seigneur nain', icon: '🧔', model: 'dwarf_lord', title: 'Maître des forges', spec: 'Runes', specIcon: '🔷', fx: [0.5, 1.2, 2.6],
        desc: 'Solide au corps à corps, il commande des automates et forge mieux que personne.',
        passive: { name: 'Maître artisan', desc: 'Bâtiments 15 % moins chers et fabrications de l\'atelier 25 % moins chères.', buildCost: 0.85, craftCost: 0.75 },
        hp: 190, dmg: 14, range: 3.4, atkCd: 0.85, speed: 8.2, ranged: false,
        minions: ['automaton', 'driller', 'crossbow', 'blade', 'sentinel', 'colossus'],
        skills: [
          { id: 'hammer', kind: 'smash', mult: 2.8, r: 4, stun: 1500, name: 'Marteau runique', icon: '🔨', cd: 5, desc: 'Frappe lourde qui étourdit devant toi.' },
          { id: 'grenade', kind: 'bomb', mult: 2.1, r: 5.5, name: 'Grenade runique', icon: '💥', cd: 9, desc: 'Explosion de zone à distance.' },
          { id: 'rampart', kind: 'warcry', name: 'Rempart', icon: '🛡️', cd: 30, desc: 'Renforce tes automates 10 s et te soigne.' },
        ],
        bnames: { throne: 'Trône de pierre', storage: 'Chambre forte', barracks: 'Hall des automates', altar: 'Enclume sacrée', workshop: 'Grande forge' },
      },
    },
    // Serviteurs. work = vitesse de récolte, range = portée d'attaque (tireurs), unlock = niveau de caserne requis.
    MINIONS: {
      skeleton: { name: 'Squelette', icon: '💀', tag: 'Polyvalent', hp: 45, dmg: 6, speed: 7, work: 1, cost: { spec: 15 }, unlock: 0 },
      digger: { name: 'Fossoyeur', icon: '⛏️', tag: 'Récolteur expert', model: 'digger', hp: 35, dmg: 3, speed: 7.5, work: 1.9, cost: { spec: 25, wood: 15 }, unlock: 1 },
      archer: { name: 'Squelette archer', icon: '🏹', tag: 'Tireur', model: 'archer', hp: 35, dmg: 8, speed: 7, work: 0.4, range: 11, cost: { spec: 25, wood: 20 }, unlock: 1 },
      ghoul: { name: 'Goule', icon: '👻', tag: 'Assaillant rapide', model: 'ghoul', hp: 70, dmg: 16, speed: 8.8, work: 0.3, cost: { spec: 35, gold: 10 }, unlock: 2 },
      zombie: { name: 'Zombie', icon: '🧟', tag: 'Défenseur robuste', hp: 130, dmg: 11, speed: 4.6, work: 0.6, cost: { spec: 30, gold: 15 }, unlock: 2 },
      abomination: { name: 'Abomination', icon: '👾', tag: 'Colosse', model: 'zombie', scale: 1.6, hp: 340, dmg: 22, speed: 4.2, work: 0.2, cost: { spec: 90, gold: 50, stone: 30 }, unlock: 4 },
      goblin: { name: 'Gobelin', icon: '👺', tag: 'Polyvalent', hp: 32, dmg: 5, speed: 8.5, work: 1.2, cost: { spec: 10, wood: 5 }, unlock: 0 },
      miner: { name: 'Gobelin mineur', icon: '⛏️', tag: 'Récolteur expert', model: 'miner', hp: 30, dmg: 3, speed: 8.5, work: 2.1, cost: { spec: 20, wood: 15 }, unlock: 1 },
      slinger: { name: 'Lance-pierre', icon: '🎯', tag: 'Tireur', model: 'slinger', hp: 28, dmg: 7, speed: 8.5, work: 0.4, range: 10, cost: { spec: 20, stone: 15 }, unlock: 1 },
      berserker: { name: 'Berserker', icon: '🔥', tag: 'Assaillant rapide', model: 'berserker', hp: 60, dmg: 15, speed: 9.2, work: 0.3, cost: { spec: 30, gold: 10 }, unlock: 2 },
      brute: { name: 'Brute gobeline', icon: '👹', tag: 'Défenseur robuste', hp: 115, dmg: 12, speed: 6, work: 0.7, cost: { spec: 28, gold: 15 }, unlock: 2 },
      wartroll: { name: 'Troll de guerre', icon: '🦍', tag: 'Colosse', model: 'brute', scale: 1.55, hp: 320, dmg: 23, speed: 5, work: 0.2, cost: { spec: 85, gold: 50, wood: 30 }, unlock: 4 },
      imp: { name: 'Diablotin', icon: '👿', tag: 'Polyvalent', hp: 38, dmg: 6, speed: 8, work: 1.05, cost: { spec: 13 }, unlock: 0 },
      borer: { name: 'Diablotin foreur', icon: '⛏️', tag: 'Récolteur expert', model: 'borer', hp: 32, dmg: 3, speed: 8, work: 2, cost: { spec: 22, wood: 15 }, unlock: 1 },
      spitter: { name: 'Cracheur de feu', icon: '🔥', tag: 'Tireur', model: 'spitter', hp: 30, dmg: 9, speed: 7.5, work: 0.4, range: 10, cost: { spec: 25, stone: 15 }, unlock: 1 },
      hound: { name: 'Chien des enfers', icon: '🐕', tag: 'Assaillant rapide', model: 'hound', hp: 65, dmg: 16, speed: 9.5, work: 0.2, cost: { spec: 35, gold: 10 }, unlock: 2 },
      fiend: { name: 'Démon cornu', icon: '👹', tag: 'Défenseur robuste', model: 'fiend', hp: 125, dmg: 12, speed: 5.5, work: 0.6, cost: { spec: 30, gold: 15 }, unlock: 2 },
      pitlord: { name: 'Seigneur des fosses', icon: '👾', tag: 'Colosse', model: 'fiend', scale: 1.6, hp: 330, dmg: 24, speed: 4.6, work: 0.2, cost: { spec: 90, gold: 50, stone: 30 }, unlock: 4 },
      sprite: { name: 'Lutin', icon: '🧚', tag: 'Polyvalent', hp: 36, dmg: 5, speed: 8.5, work: 1.1, cost: { spec: 12, wood: 5 }, unlock: 0 },
      forager: { name: 'Cueilleur sylvestre', icon: '⛏️', tag: 'Récolteur expert', model: 'forager', hp: 32, dmg: 3, speed: 8.5, work: 2, cost: { spec: 22, wood: 15 }, unlock: 1 },
      dryad: { name: 'Dryade archère', icon: '🏹', tag: 'Tireur', model: 'dryad', hp: 34, dmg: 8, speed: 7.5, work: 0.4, range: 11, cost: { spec: 25, wood: 20 }, unlock: 1 },
      packwolf: { name: 'Loup de meute', icon: '🐺', tag: 'Assaillant rapide', model: 'wolf', hp: 68, dmg: 15, speed: 9.5, work: 0.2, cost: { spec: 33, gold: 10 }, unlock: 2 },
      bear: { name: 'Ours', icon: '🐻', tag: 'Défenseur robuste', model: 'bear', hp: 140, dmg: 11, speed: 5.5, work: 0.5, cost: { spec: 32, gold: 15 }, unlock: 2 },
      ancient: { name: 'Ent ancien', icon: '🌳', tag: 'Colosse', model: 'treant', scale: 1.7, hp: 350, dmg: 21, speed: 4.2, work: 0.2, cost: { spec: 90, gold: 50, wood: 30 }, unlock: 4 },
      automaton: { name: 'Automate', icon: '🤖', tag: 'Polyvalent', hp: 48, dmg: 6, speed: 6.8, work: 1, cost: { spec: 15, stone: 5 }, unlock: 0 },
      driller: { name: 'Automate foreur', icon: '⛏️', tag: 'Récolteur expert', model: 'driller', hp: 38, dmg: 3, speed: 7, work: 1.9, cost: { spec: 24, stone: 15 }, unlock: 1 },
      crossbow: { name: 'Arbalète mécanique', icon: '🎯', tag: 'Tireur', model: 'crossbow', hp: 36, dmg: 8, speed: 6.8, work: 0.4, range: 11, cost: { spec: 25, wood: 20 }, unlock: 1 },
      blade: { name: 'Lame mécanique', icon: '⚔️', tag: 'Assaillant rapide', model: 'blade', hp: 66, dmg: 15, speed: 8.8, work: 0.3, cost: { spec: 34, gold: 10 }, unlock: 2 },
      sentinel: { name: 'Sentinelle de pierre', icon: '🗿', tag: 'Défenseur robuste', model: 'golem', scale: 1.05, hp: 140, dmg: 11, speed: 5, work: 0.6, cost: { spec: 30, gold: 15 }, unlock: 2 },
      colossus: { name: 'Colosse de fer', icon: '🛠️', tag: 'Colosse', model: 'golem', scale: 1.7, hp: 350, dmg: 22, speed: 4.2, work: 0.2, cost: { spec: 90, gold: 50, stone: 30 }, unlock: 4 },
      impling: { name: 'Diablotin invoqué', icon: '👿', tag: '', model: 'imp', hp: 55, dmg: 9, speed: 8.5, work: 0, cost: {}, unlock: 99 },
      wolfling: { name: 'Loup invoqué', icon: '🐺', tag: '', model: 'wolf', hp: 60, dmg: 9, speed: 9, work: 0, cost: {}, unlock: 99 },
      raised: { name: 'Squelette relevé', icon: '💀', tag: '', hp: 60, dmg: 9, speed: 8, work: 0, cost: {}, unlock: 99 },
    },
    ROLES: {
      wood: { name: 'Bois', icon: '🌲' }, stone: { name: 'Pierre', icon: '🧱' }, gold: { name: 'Or', icon: '💰' },
      spec: { name: 'Spécial', icon: '✨' }, escort: { name: 'Escorte', icon: '⚔️' }, guard: { name: 'Garde', icon: '🛡️' },
    },
    // Monstres. Chaque famille donne sa ressource : bêtes = os/ferraille, humanoïdes = or, esprits des bois = bois, êtres de roche = pierre.
    MOBS: {
      wolf: { name: 'Loup', tier: 1, hp: 40, dmg: 5, speed: 7.5, range: 1.8, aggro: 9, cd: 1.3, xp: 8, spec: [2, 4], rad: 0.8 },
      boar: { name: 'Sanglier', tier: 1, hp: 65, dmg: 7, speed: 6.5, range: 1.8, aggro: 6, cd: 1.5, xp: 11, spec: [3, 6], rad: 0.9 },
      bandit: { name: 'Bandit', tier: 1, hp: 55, dmg: 8, speed: 6.5, range: 2, aggro: 10, cd: 1.3, xp: 13, gold: [5, 11], rad: 0.7 },
      spriggan: { name: 'Spriggan', model: 'treant', scale: 0.75, tier: 1, hp: 50, dmg: 6, speed: 7, range: 1.8, aggro: 8, cd: 1.3, xp: 11, wood: [7, 13], rad: 0.6 },
      rockling: { name: 'Rocaille', model: 'golem', scale: 0.7, tier: 1, hp: 80, dmg: 6, speed: 5, range: 1.8, aggro: 7, cd: 1.6, xp: 12, stone: [7, 13], rad: 0.7 },
      wanderer: { name: 'Mort errant', model: 'ghoul', tier: 1, hp: 50, dmg: 7, speed: 5.5, range: 1.8, aggro: 9, cd: 1.4, xp: 12, spec: [7, 13], rad: 0.6 },
      spider: { name: 'Araignée géante', tier: 2, hp: 120, dmg: 13, speed: 7.5, range: 2.2, aggro: 11, cd: 1.2, xp: 26, spec: [6, 11], rad: 1.1 },
      orc: { name: 'Orc', tier: 2, hp: 175, dmg: 17, speed: 6.5, range: 2.4, aggro: 12, cd: 1.5, xp: 34, gold: [10, 20], spec: [2, 5], rad: 0.9 },
      treant: { name: 'Ent', model: 'treant', scale: 1.9, tier: 2, hp: 330, dmg: 20, speed: 4.8, range: 3, aggro: 10, cd: 1.8, xp: 45, wood: [25, 40], rad: 1.4 },
      golem: { name: 'Golem de pierre', model: 'golem', scale: 1.6, tier: 2, hp: 380, dmg: 22, speed: 4.5, range: 3, aggro: 10, cd: 1.9, xp: 48, stone: [25, 40], rad: 1.4 },
      broodmother: { name: 'Mère des araignées', model: 'spider', scale: 2.2, tier: 2, hp: 1900, dmg: 30, speed: 6.5, range: 3.4, aggro: 14, cd: 1.5, xp: 380, gold: [20, 40], spec: [60, 90], rad: 2.4, elite: true, relic: 0.6 },
      warlord: { name: 'Seigneur de guerre orc', model: 'orc', scale: 1.8, tier: 2, hp: 2300, dmg: 42, speed: 6, range: 3.4, aggro: 14, cd: 1.7, xp: 450, gold: [80, 130], spec: [20, 30], rad: 1.7, elite: true, relic: 0.6 },
      knight: { name: 'Chevalier déchu', tier: 3, hp: 380, dmg: 28, speed: 6.5, range: 2.6, aggro: 14, cd: 1.4, xp: 75, gold: [18, 32], spec: [5, 10], rad: 0.9, relic: 0.04 },
      troll: { name: 'Troll', tier: 3, hp: 750, dmg: 38, speed: 5.5, range: 3.2, aggro: 14, cd: 1.9, xp: 170, gold: [20, 40], spec: [12, 22], stone: [20, 35], rad: 1.6, elite: true, relic: 0.25 },
      guardian: { name: 'Gardien de Malterre', tier: 4, hp: 6000, dmg: 70, speed: 5, range: 5, aggro: 22, cd: 2.2, xp: 900, gold: [150, 200], spec: [100, 140], wood: [100, 140], stone: [100, 140], rad: 3.4, boss: true, relic: 1 },
    },
    LOOT_KEYS: ['gold', 'spec', 'wood', 'stone'],
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
    // Fabrications de l'atelier : améliorations permanentes par paliers (palier maximum = niveau de l'atelier).
    CRAFTS: {
      weapon: { name: 'Arme du seigneur', icon: '🗡️', who: 'hero', desc: '+12 % de dégâts du héros par palier', cost: { stone: 40, gold: 25, spec: 20 } },
      armor: { name: 'Armure du seigneur', icon: '🛡️', who: 'hero', desc: '+12 % de vie du héros par palier', cost: { wood: 40, stone: 40, spec: 20 } },
      boots: { name: 'Bottes du seigneur', icon: '👢', who: 'hero', desc: '+4 % de vitesse du héros par palier', cost: { wood: 30, gold: 15 } },
      mweapon: { name: 'Armes de la horde', icon: '⚔️', who: 'minion', desc: '+12 % de dégâts des serviteurs par palier', cost: { stone: 50, spec: 40 } },
      marmor: { name: 'Armures de la horde', icon: '🧥', who: 'minion', desc: '+12 % de vie des serviteurs par palier', cost: { wood: 50, spec: 40 } },
      tools: { name: 'Outils de récolte', icon: '⛏️', who: 'minion', desc: '+15 % de vitesse de récolte par palier', cost: { wood: 40, stone: 30 } },
    },
    CRAFT_MAX: 5,
    // Reliques : une seule active par catégorie (h = héros, m = serviteurs, f = forteresse).
    RELICS: {
      h_vamp: { type: 'h', name: 'Croc de sang', icon: '🦷', desc: 'Tes coups te soignent de 8 % des dégâts infligés.' },
      h_fury: { type: 'h', name: 'Griffe de fureur', icon: '🔥', desc: '+20 % de dégâts du héros.' },
      h_haste: { type: 'h', name: 'Sablier fêlé', icon: '⏳', desc: 'Compétences rechargées 25 % plus vite.' },
      h_stone: { type: 'h', name: 'Cœur de pierre', icon: '💎', desc: '+30 % de vie du héros.' },
      m_swarm: { type: 'm', name: 'Étendard de la horde', icon: '🚩', desc: '+3 serviteurs au maximum.' },
      m_venom: { type: 'm', name: 'Lames empoisonnées', icon: '☠️', desc: '+30 % de dégâts des serviteurs.' },
      m_iron: { type: 'm', name: 'Peaux de fer', icon: '🔩', desc: '+40 % de vie des serviteurs.' },
      m_swift: { type: 'm', name: 'Semelles de vent', icon: '💨', desc: 'Serviteurs 25 % plus rapides (marche et récolte).' },
      f_vault: { type: 'f', name: 'Coffre sans fond', icon: '🧰', desc: '+50 % de stock maximum.' },
      f_harvest: { type: 'f', name: 'Corne d\'abondance', icon: '🌾', desc: '+2 ressources par voyage de récolte.' },
      f_ward: { type: 'f', name: 'Sceau de garde', icon: '🔰', desc: 'Garnison 50 % plus forte, et les pillards volent deux fois moins.' },
      f_regen: { type: 'f', name: 'Fontaine noire', icon: '⛲', desc: 'Ton héros récupère sa vie 3 fois plus vite.' },
    },
    RELIC_TYPES: { h: 'Héros', m: 'Serviteurs', f: 'Forteresse' },
    HERO_HARVEST: 2,
    // Emplacements des bâtiments dans la forteresse (repère local, +z vers le centre du monde).
    PLOTS: { throne: [0, -15], storage: [-14, -3], barracks: [14, -3], altar: [-11, 9], workshop: [11, 9] },
    FORT: { wall: 24, spawn: [0, 8], zone: 36 },
    // Formules communes.
    cost(b, lvl, cls) {
      const base = DATA.BUILDINGS[b].cost, L = b === 'throne' ? lvl - 1 : lvl, k = ((DATA.CLASSES[cls] || {}).passive || {}).buildCost || 1, out = {};
      for (const r in base) out[r] = Math.max(5, Math.round(base[r] * Math.pow(1.9, L) * k / 5) * 5);
      return out;
    },
    minionCost(mt, cls) {
      const base = DATA.MINIONS[mt].cost, k = ((DATA.CLASSES[cls] || {}).passive || {}).minionCost || 1, out = {};
      for (const r in base) out[r] = Math.max(1, Math.round(base[r] * k));
      return out;
    },
    craftCost(id, tier, cls) { const base = DATA.CRAFTS[id].cost, k = ((DATA.CLASSES[cls] || {}).passive || {}).craftCost || 1, out = {}; for (const r in base) out[r] = Math.max(5, Math.round(base[r] * Math.pow(1.8, tier) * k / 5) * 5); return out; },
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
