/* 百鬼夜行サバイバーズ — entities: player, enemies, bosses, projectiles, pickups */
'use strict';

// 見やすさ(a11y)オプション。main.js で store から読み込み、UI(設定)で変更・永続化。
G.opts = { dmgNum: true, shake: true, flash: true, contrast: false };

G.ent = (() => {
  const ENT = {};
  const D = G.data;
  let nextId = 1;

  // ---------------- run state ----------------
  ENT.newRun = (stageIdx = 0, charId = 'haru') => {
    const run = {
      t: 0,
      clock: 0,   // 生存/夜明けの時計。ボス出現中は停止(タイマー/湧き/難度が止まる)。run.tはアニメ/演出用で常時進む
      stageIdx,
      stage: D.STAGES[stageIdx] || D.STAGES[0],
      charId: D.CHARS[charId] ? charId : 'haru',
      koban: 0, bossKills: 0,
      over: false, win: false, winT: 0, deadT: 0,
      player: {
        x: 0, y: 0, r: 10 * G.UNIT_SCALE,
        hp: 100,
        stats: { maxHp: 100, might: 1, area: 1, speed: 1, haste: 1, magnet: 1, armor: 0, regen: 0 },
        moveX: 0, moveY: 0, aimX: 1, aimY: 0, facing: 1,
        bobT: 0, animT: 0, attackT: 0, castT: 0, hurtAnimT: 0,
        hurtT: 0, heartT: 0, alive: true, walking: false, stillT: 0,
        dashT: 0, dashX: 0, dashY: 0, dashHits: [],
      },
      weapons: [],          // {id, lvl, cd, awake, dispName}
      passives: {},         // id -> lv
      talents: {},          // 秘術 id -> lv (最大4系統)
      talentState: { kills: 0, souls: 0, utsusemi: 0 },
      xp: 0, lvl: 1, need: D.needXp(1), pendLv: 0,
      kills: 0, souls: 0, dmgDealt: 0, dmgSrc: {},
      lampsLit: 0,          // 自分で灯した提灯の総数 (祝福の閾値判定に使う)
      lampBlessings: 0,
      lampAura: { id: null, lamp: null },
      lampDwell: 0, lampStage: 0, lampPow: 1,   // 灯りの滞在ゲージ / 段階 / 効果倍率
      lampLastId: null,                          // 直近で浴びた灯火 (灯り外の減衰中もHUD表示に使う)
      lampAfterglowT: 0,                          // 残り火: 灯りを離れた後、段を満充填で保つ残り猶予秒
      lampsLit: 0, lampsTotal: 0, allLit: false,  // 灯った提灯数 / 総数 / 全灯点灯か (全灯バフ・夜の侵食・夜明け報酬に使用)
      lampMaxHoldT: 0,                          // 最大効力の残り持続秒
      syn: {}, _synSeen: {},                     // 隠し相乗 (スキル組合せの追加効果)。SYS.checkSynergies が更新
      flames: [],                                // 炎の足跡 (火渡りの行) が残す霊炎パッチ
      storms: [],                                // 雷神招来: 頭上に展開する雷雲フィールド (持続自動落雷)
      warns: [],                                  // 単発大技の予告(収束する光輪→ドン)。telegraphCast が積む
      steps: [], mandalas: [], henbaiCdT: 0,     // 反閇の足跡 / 封字曼荼羅の結界ゾーン / 反閇陣の守りCD
      gemStreak: 0, gemStreakT: 0,
      combo: 0, comboT: 0, comboPop: 0, comboNext: 0,
      hitsTaken: 0, eliteKills: 0,
      bells: [],
      buffs: { aratama: 0, shinsoku: 0, kongo: 0, bunshin: 0 },
      reso: {},             // 共鳴 id -> true (宝具ペアで発動)
      pactMods: { might: 0, area: 0, speed: 0, hasteMul: 1, magnet: 0, armor: 0, maxHp: 0, crit: 0 },
      pactSeals: [], pactSeen: {}, ordeal: null,
      forge: { c: 0, w: {} },   // 鍛錬スナップショット (startRun で読込)
      purgeT: -999,         // 祓いの舞 (鈴特殊) の最終発動時刻
      ult: { id: 'harai', charge: 0, need: D.ULTS.harai.need },   // 奥義 (startRun で編成を読込)
      rerolls: 2, banishes: 2, banished: {},  // 引き直し/封印 (1ラン分)
      maxCombo: 0, chestsOpened: 0, awakens: 0,   // 実績用の記録
      killedBy: null,       // 死亡文: 何に殺されたか
      corpses: [],          // 物理死体 (吹き飛び、回転、巻き込み)
      skill: { id: 'goho', eff: { cd: 16 }, cdT: 0, shield: false },   // 技 (startRun で編成を読込)
      overtime: false, otDissolve: 0, finalSpawned: false,   // 最終ボス(暁の決戦)を呼んだか
      chests: [],
      boss: null,
      shutenSlain: false,
      en: new G.Pool(() => ({}), 460),
      pr: new G.Pool(() => ({ hitSet: new Set() }), 400),
      ep: new G.Pool(() => ({}), 220),
      gem: new G.Pool(() => ({}), 320),
      it: new G.Pool(() => ({}), 40),
      foxes: [],
      toros: [],
      slashes: [],
      whirls: [],
      beams: [],
      mines: [],
      auraR: 0, auraTickT: 0, auraSpin: 0,
      wards: [], wardCdT: 0,   // 結界札 (灯りの杭・クールタイム制)
      dir: {
        nextSpawn: 1.2, eliteAt: D.ELITE_FIRST, evIdx: 0, bossIdx: 0, annIdx: 0,
        nextDouser: 26, nextChest: D.CHEST.first, pactIdx: 0, frame: 0,
      },
    };
    placeLamps(run);
    // 演出クールダウン/多重撃破集計はモジュールクロージャ変数なので、ラン毎にここで初期化する。
    // (放置すると次ランで run.t が前ラン到達時刻を超えるまで群れ撃破の揺れ/ヒットストップが死ぬ)
    _mkN = 0; _mkX = 0; _mkY = 0; _crowdT = 0; _stopT = 0; _mkRingT = 0;
    return run;
  };

  // 据置提灯をマップ各所へ固定配置。最初は全て消灯 (dead:true)。プレイヤーが近づいて自ら灯す。
  // 始まりの灯り(開始地点)だけ点灯済。一定数を灯すと「灯火の祝福」が発動する (ENT.updateLamps)
  function placeLamps(run) {
    const hp = G.data.LAMP.hp;
    const mk = (x, y, lit, sigil = null) => ({
      x, y,
      dead: !lit,
      everLit: !!lit,
      sigil,
      flash: 0,
      hp,
      maxHp: hp,
      ignite: 0,
      relightT: 0,
      charge: 0,
      surgeT: 0,
    });
    run.toros.length = 0;
    // 灯は各種1つずつ(計3): 白灯=始まりの灯り(中央・点灯済) / 紅灯・蒼灯はマップ上に消灯で配置 → プレイヤーが灯しに行く
    run.toros.push(mk(0, 0, true, 'byakuren'));
    const hw = G.MAP_W / 2 - G.WALL - 320, hh = G.MAP_H / 2 - G.WALL - 320;
    run.toros.push(mk(-hw * 0.62, -hh * 0.55, false, 'koubou'));
    run.toros.push(mk(hw * 0.62, hh * 0.55, false, 'seiran'));
  }

  // ---------------- enemies ----------------
  // pool full: evict the first normal enemy so bosses/elites are never recycled
  function makeRoom(pool) {
    if (pool.act.length < pool.max) return true;
    for (let i = 0; i < pool.act.length; i++) {
      if (!pool.act[i].boss && !pool.act[i].elite) { pool.releaseAt(i); return true; }
    }
    return false;
  }

  ENT.spawnEnemy = (typeId, x, y, opts = {}) => {
    const run = G.run;
    const cfg = D.E[typeId];
    if (run.en.act.length >= run.en.max) {
      if (!opts.force || !makeRoom(run.en)) return null;
    }
    const e = run.en.obtain();
    const elite = !!opts.elite;
    const tc = run.clock * D.TIME_COMP;   // 夜 3/4 圧縮後も同じ強さ曲線を辿る(ボス中は時計停止=難度も停止)
    const midHp = D.midWaveHpMul ? D.midWaveHpMul(run.clock, run.stage.length) : 1;
    // 終盤の敵HPを×0.75まで緩める(後半で滑らかにテーパー: 進行60%まで等倍 → 75%以降は×0.75)
    const prog = run.stage.length ? Math.min(1, run.clock / run.stage.length) : 0;
    const lateMul = 1 - 0.25 * Math.min(1, Math.max(0, (prog - 0.6) / 0.15));
    const hpSc = D.hpScale(tc) * run.stage.hpMul * midHp * lateMul;
    e.id = nextId++;
    e.type = typeId; e.cfg = cfg;
    [e.x, e.y] = G.clampMap(x, y, cfg.r);   // 有限マップ: 湧きは必ず壁の内側
    e.r = cfg.r * (elite ? D.ELITE.sizeMul : 1) * G.UNIT_SCALE;
    e.scale = (elite ? D.ELITE.sizeMul : 1) * G.UNIT_SCALE;
    e.maxHp = e.hp = cfg.hp * (D.ENEMY_HP_MUL || 1) * hpSc * (run.moon ? run.moon.enemyHpMul || 1 : 1)
      * (elite ? D.ELITE.hpMul : 1) * (opts.hpMul || 1);
    // 強敵(elite)の体力上限: hpScale×stage×ELITEの多重膨張で重量妖(大入道/食人鬼等)がボス級に肥大するのを防ぎ、
    // 時間で緩やかに育つ「ミニボス帯」に収める。軽量妖の強敵は本来の値(上限未満)のまま。
    if (elite) e.maxHp = e.hp = Math.min(e.maxHp, (1200 + tc * 3.5) * midHp);
    e.spd = cfg.spd * (elite ? D.ELITE.spdMul : 1) * G.rand(0.92, 1.08);
    e.dmg = cfg.dmg * D.dmgScale(tc) * run.stage.dmgMul * (elite ? D.ELITE.dmgMul : 1);
    const pactRisk = run.ordeal ? run.ordeal.cfg.risk || {} : {};
    e.spd *= pactRisk.enemySpeedMul || 1;
    e.dmg *= pactRisk.enemyDmgMul || 1;
    e.xp = elite ? D.ELITE.xp : cfg.xp;
    e.elite = elite;
    e.boss = null; e.bossId = null; e.hitRX = 0;   // 横の当たり半径: 雑魚は e.r 既定(プール再利用でボスの拡張値を持ち越さない)
    // エリートの二つ名: 名乗りと固有の性質
    e.title = ''; e.deathBurst = false; e.buffRich = false; e.kobanRich = false;
    if (elite) {
      const tt = G.pick(D.ELITE_TITLES);
      e.title = tt.t;
      tt.mod(e);
    }
    e.dead = false;
    e.vx = 0; e.vy = 0;
    e.kbx = 0; e.kby = 0;
    e.slowT = 0; e.slowF = 0;
    e.feared = 0; e.rootT = 0; e.markT = 0;   // 雄叫び(恐慌)/ 影縫い(拘束+被ダメ印)
    e.curseT = 0; e.curseAmp = 0;    // 呪詛: 被ダメ増の刻印 (持続/倍率)
    e.shockT = 0; e.shockPropT = 0; e.shockDmg = 0;   // 雷柵: 感電状態/伝播クールダウン
    e.hmark = 0; e.hmarkT = 0;       // 祓印: 0-3段のコンボ通貨
    e._face = null; e._faceT = -1;   // 向きヒステリシス: プール再利用で前個体の向きが残らないよう初期化
    e.snT = -9;                      // 注連縄ヒット時刻: stale でダメージすり抜けるのを防ぐ
    e.lit = false;
    e.litSigil = null;
    e.douse = cfg.douse || 0;   // 提灯への舐めダメージ/秒 (油赤子のみ)
    e.flash = 0; e.squashT = 0;
    e.hitOff = undefined;   // 当たり判定の中心オフセット(初回描画で算出)
    e.animT = G.rand(cfg.anim);
    e.frame = 0;
    e.phase = G.rand(G.TAU);
    e.t = 0;
    e.foxT = -9; e.auraId = -1;
    e.fireT = cfg.shot ? G.rand(1, cfg.shot.cd) : 0;
    e.hopT = G.rand(0.2, 0.7); e.hopping = 0;
    // 突進(charge)/範囲攻撃(slam) の状態機械: プール再利用での取り残し防止
    e.atk = 0; e.atkT = 0; e.atkMax = 0; e.aoeX = 0; e.aoeY = 0; e.dirx = 0; e.diry = 0; e.dvx = 0; e.dvy = 0;
    e.atkCd = (cfg.move === 'charge' || cfg.move === 'slam' || cfg.move === 'volley' || cfg.move === 'nova') ? G.rand(0.8, 2.4) : 0;
    if (cfg.move === 'swoop') {
      const p = run.player;
      const a = G.angleTo(x, y, p.x + G.rand(-60, 60), p.y + G.rand(-60, 60));
      e.vx = Math.cos(a) * e.spd;
      e.vy = Math.sin(a) * e.spd;
    }
    return e;
  };

  ENT.spawnBoss = (id, entry = null) => {
    const run = G.run;
    const b = D.B[id];
    const ascend = D.BOSS_STAGE_ASCEND[run.stageIdx] || D.BOSS_STAGE_ASCEND[0];
    const p = run.player;
    const a = G.rand(G.TAU);
    makeRoom(run.en);
    const e = run.en.obtain();
    e.id = nextId++;
    e.type = id; e.cfg = b;
    [e.x, e.y] = G.clampMap(p.x + Math.cos(a) * 720, p.y + Math.sin(a) * 720, b.r);
    e.r = b.r * G.UNIT_SCALE;
    e.hitRX = e.r * (D.BOSS_HIT_RX_MUL || 1.7);   // 撃ち/接触の横判定を胴体幅に合わせて拡張(e.r=移動/AI/近接 は不変)
    e.scale = (b.scale || 1) * G.UNIT_SCALE;
    const rankHp = D.BOSS_RANK_HP[b.rank || 1] || 1;
    const rawBossHp = b.hp * rankHp * run.stage.hpMul * ascend.hp * (entry && entry.hpMul || 1)
      * (run.moon ? run.moon.enemyHpMul || 1 : 1) * (D.BOSS_HP_MUL || 1);
    e.maxHp = e.hp = Math.ceil(rawBossHp / 1000) * 1000;
    e.spd = b.spd;
    e.dmg = b.dmg * run.stage.dmgMul * ascend.dmg * (entry && entry.dmgMul || 1)
      * (G.data.BOSS_DMG_MUL || 1);
    e.xp = b.xp;
    e.elite = false;
    e.boss = b; e.bossId = id;
    e.bossRank = b.rank || 1;
    e.bossRankInfo = D.BOSS_RANKS[e.bossRank] || D.BOSS_RANKS[1];
    e.bossAscend = ascend.title;
    e.bossTempo = ascend.tempo * (entry && entry.tempoMul || 1);
    e.bossGrandMul = ascend.grand * (entry && entry.grandMul || 1);
    e.dead = false;
    e.douse = 0;
    e.vx = 0; e.vy = 0; e.kbx = 0; e.kby = 0;
    e.slowT = 0; e.slowF = 0; e.flash = 0; e.squashT = 0;
    e.hitOff = undefined;   // 当たり判定の体中心オフセット(初回描画で算出。プール再利用での取り残し防止)
    e.meleeWind = 0; e.meleeLungeT = 0; e.meleeT = 0; e.meleeDx = 1; e.meleeDy = 0;   // ボス近接攻撃: 予備動作/ランジ/CD/向き
    e.touchT = 0;                                       // 接触ダメージのCD
    e.mvMode = 'orbit'; e.mvT = 0; e.mvX = 0; e.mvY = 0; e.mvDir = 1;   // 縦横無尽の機動(接近/旋回/横断/牽制)
    e.feared = 0; e.rootT = 0; e.markT = 0; e.lit = false; e.litSigil = null;
    e.curseT = 0; e.curseAmp = 0;   // 呪詛 (ボスにも有効)
    e.hmark = 0; e.hmarkT = 0;      // 祓印: 0-3段のコンボ通貨
    e._face = null; e._faceT = -1; e.snT = -9;   // プール再利用での向き/注連縄ヒット時刻の取り残し防止
    e.animT = 0; e.frame = 0; e.phase = 0; e.t = 0;
    e.foxT = -9;
    e.atk = 0; e.atkT = 0; e.atkCd = 0;   // 雑魚の突進/範囲攻撃の状態をクリア(プール共用のため)
    e.bstate = 'chase'; e.bt = 0; e.atk1 = 3; e.atk2 = 6; e.atk3 = 10;
    e.dashHitT = 0;   // 濡女の突進中 接触ダメージのクールダウン
    e.dashDX = 0; e.dashDY = 0;   // 濡女の突進方向(予告開始時に固定=追尾しない)
    e.summonT = G.rand(6, 9);   // 雑魚召喚(共通攻撃)までの初期クールダウン
    e.bossAttackT = 0; e.bossCastT = 0; e.bossHurtT = 0; e.bossRageT = 0; e.plantT = 0;
    e._poseState = null; e._poseSnapT = undefined; e._mstate = 'idle';   // 代表ポーズの遷移検知をプール再利用でリセット
    e.attackLock = 1.2; e.comboActive = false; e.comboName = ''; e._actionActivePrev = false;
    e.teleX = 0; e.teleY = 0; e.rage = false; e.halfRoar = false;
    e.trail = [];
    e.strikes = [];   // 遅延着弾 (鵺の落雷など)
    e.beams = [];     // レーザー (予告線→照射)
    e.acts = [];      // 予告付き遅延発火 (弾幕volley等)
    e.grandT = G.rand(3, 5) * e.bossGrandMul;
    run.boss = e;
    G.audio.sfx('bossroar');
    const bossCol = BOSS_FX_COLOR[id] || '#d94d3c';
    bossBurst(e.x, e.y, { radius: Math.max(170, e.r * 4.2), life: 0.95, color: bossCol, smoke: 22, sparks: 18, width: 6 });
    for (let ri = 0; ri < Math.min(3, 1 + Math.floor(e.bossRank / 2)); ri++) {
      G.fx.ring(e.x, e.y, {
        r0: 18 + ri * 16, r1: 180 + e.bossRank * 20 + ri * 38,
        life: 0.48 + ri * 0.12, color: bossCol, width: 3 + e.bossRank * 0.45,
      });
    }
    G.cam.add(7);
    G.cam.punch(1.04);
    G.main.slowmo(0.75, 0.3);   // dramatic entrance
    G.fx.ring(p.x, p.y, { r0: 30, r1: 200, life: 0.5, color: 'rgba(227,75,47,0.7)', width: 4 });
    if (G.fx.anim) G.fx.anim(e.x, e.y, 'portal', { scale: Math.max(4, e.r * 0.13), dur: 0.7, add: true });   // ボスは門から顕現(foozle portal)
    if (D.EXPFX) G.fx.burst(e.x, e.y, 'dark_vortex', { sz: Math.max(190, e.r * 5.2), dur: 0.78, from: 0.3, to: 1.45, spin: 1.1, add: true });
    return e;
  };

  ENT.spawnOrb = (x, y, vx, vy, dmg, src) => {
    const run = G.run;
    const o = run.ep.obtain();
    o.x = x; o.y = y;
    o.boss = !!(G.data.B && G.data.B[src]);   // ボスの弾は大きく紫縁で雑魚と差別化
    const bm = o.boss ? 1.2 : 1;              // 苛烈化: ボス弾は速く遠くへ届く
    o.vx = vx * bm; o.vy = vy * bm;
    o.dmg = dmg; o.r = o.boss ? 12 : 6; o.life = o.boss ? 6.8 : 6; o.t = 0;
    o.src = src || null;   // 死亡文用: 撃ち手の正体
    return o;
  };

  // ---------------- 祓印(harai mark) ----------------
  // tier別の被ダメ倍率(段数0..3)。雑魚>精鋭>ボスの順に控えめ。
  ENT.haraiBonus = (e) => {
    const H = G.data.HARAI; if (!H) return 0;
    const t = e.boss ? H.boss : e.elite ? H.elite : H.trash;
    return t[Math.min(3, e.hmark)] || 0;
  };
  // 印を付与(最大3)。持続をリフレッシュ。haraiDurMul(受動)で延長。
  ENT.addHarai = (e, n) => {
    if (!e || e.dead) return;
    const H = G.data.HARAI; if (!H) return;
    e.hmark = Math.min(3, (e.hmark || 0) + (n || 1));
    e.hmarkT = H.dur * ((G.run.player.stats.haraiDurMul) || 1) * (e.lit ? 1.3 : 1);   // 灯火圏: 灯りの中の妖は印が長持ち
  };
  // 祓い: 印3で消費し清めの一撃(会心扱い)。連鎖を断つため再付与しない。返り値=発動したか。
  ENT.haraiPurge = (e, dmg, opts = {}) => {
    if (!e || e.dead || (e.hmark || 0) < 3) return false;
    e.hmark = 0; e.hmarkT = 0;
    G.fx.ring(e.x, e.y, { r0: 8, r1: 84, life: 0.4, color: 'rgba(255,240,180,0.92)', width: 5 });
    G.fx.spark(e.x, e.y, '#fff6cd', 14, 250, 0.42);
    if (G.fx.anim) G.fx.anim(e.x, e.y, 'holy', { scale: 1.6, dur: 0.4, add: true });   // 祓い=浄化の光(GPT FX)
    const pm = (G.data.HARAI.purgeMul) * ((G.run.player.stats.purgeMul) || 1);
    ENT.damageEnemy(e, dmg * pm, { src: '祓い', crit: true, kx: opts.kx, ky: opts.ky, kb: opts.kb || 0 });
    return true;
  };

  // ---------------- damage ----------------
  ENT.damageEnemy = (e, dmg, opts = {}) => {
    if (e.dead) return;
    const run = G.run;
    let final = dmg * (D.PLAYER_DMG_MUL || 1);
    if (opts.crit) { let cm = 1.5 + (run.player.stats.critDmg || 0); if (run._fireSlash && (run._konX || 1) > 1) cm *= run._konX; final *= cm; }   // 会心(止メの一手) + 渾身斬り: 斬スキルの会心ダメ×倍率
    let litSig = null;
    if (e.lit) {
      litSig = (e.litSigil && D.LAMP_SIGILS[e.litSigil]) || null;
      final *= 1 + ((litSig ? litSig.enemyDmgMul : 1.3) - 1) * (run.lampPow || 1);   // 灯りの段階で被ダメ増
    }
    if (e.markT > 0) final *= 1 + ((run.skill && run.skill.eff && run.skill.eff.markAmp) || 0.3);   // 影縫いの印: 縫い留めた妖は被ダメ増 (鍛錬「深印」で強化)
    if (e.curseT > 0) final *= 1 + (e.curseAmp || 0.3);   // 呪詛: 呪われた妖は受ける痛手が増す
    if (e.hmark > 0) final *= 1 + ENT.haraiBonus(e);       // 祓印: 段数とtierで被ダメ増
    if (run.syn && run.syn.jujin && run._fireSlash && e.curseT > 0) final *= 1.8;   // 相乗「呪刃」: 呪われた妖を斬ると処刑(確定の大ダメ)
    e.hp -= final;
    if (run._fireThunder) run.raiCharge = (run.raiCharge || 0) + final * run._fireThunder;   // 放雷: 与えた雷ダメをチャージに蓄積(放雷自身の放電は×0.35=自己ループ抑制)
    if (run.syn && run.syn.bakuin && e.hmark > 0) { e.slowT = Math.max(e.slowT || 0, 0.7); e.slowF = 0.5; }   // 相乗「縛印」: 祓印を負う妖は足が鈍る
    // heft: how big a bite this single blow took (0..1) drives the feedback weight
    const frac = e.maxHp ? final / e.maxHp : 0;
    const heavy = Math.min(1, frac * 1.3 + final / 160);
    e.flash = Math.min(0.2, 0.09 + heavy * 0.13);
    e.squashT = Math.min(0.2, 0.12 + heavy * 0.1);
    if (e.boss) e.bossHurtT = Math.min(0.24, 0.13 + heavy * 0.12);
    run.dmgDealt += final;
    const _src = opts.src || run._fireSrc || 'その他';   // 攻撃ごとのダメージを精密集計(リザルトのダメージランキング用)
    run.dmgSrc[_src] = (run.dmgSrc[_src] || 0) + final;
    if (opts.kb && !e.boss) {
      const res = 1 - (e.cfg.kbResist || 0);
      e.kbx += (opts.kx || 0) * opts.kb * res;
      e.kby += (opts.ky || 0) * opts.kb * res;
    }
    // 宝具「氷牙の呪」: 命中した妖を凍てつかせ鈍足に (ボスは移動系統が別=対象外)
    const chill = run.player.stats.chill || 0;
    if (chill > 0 && !e.boss && !e.dead) {
      e.slowT = Math.max(e.slowT, 0.9);
      e.slowF = Math.max(e.slowF, Math.min(0.6, chill));
    }
    const onScr = G.cam.onScreen(e.x, e.y);
    if (G.opts.dmgNum && onScr) {
      // 灯りで増幅した一撃は灯火色+やや大きく → 「灯りがこの打撃を強くした」が一目で繋がる
      const litCol = litSig ? litSig.color : null;
      G.fx.text(e.x, e.y - e.r - 4, String(Math.round(final)),
        opts.crit ? '#fff0bf' : (litCol || '#e8eaf2'),
        opts.crit ? 22 : (litCol ? 15 : 12),
        opts.crit ? { crit: true } : undefined);
    }
    if (litSig && onScr && !opts.crit && G.chance(0.4)) G.fx.spark(e.x, e.y - e.r * 0.3, litSig.color, 2, 85, 0.2);   // 灯り増幅の被弾スパーク
    if (opts.crit) {
      G.audio.sfx('crit');
      if (onScr) {
        const mag = G.clamp(final / 120, 0.25, 1);     // 重い一撃ほど大きく弾ける
        G.fx.crit(e.x, e.y - e.r * 0.4, mag);
        // 大会心 (重撃/エリート/ボス) のみ画面にも響かせる。連発する小会心では出さず、
        // クールダウンで多発も抑える (常時揺れ・カクつき回避。run 単位なので跨ぎ漏れなし)
        if ((final > 80 || e.boss || e.elite) && run.t - (run._critShakeT || -1) > juiceGap(0.22)) {
          run._critShakeT = run.t;
          G.cam.add(2 + mag * 3);
          G.fx.screenPulse = Math.max(G.fx.screenPulse, 0.12 + mag * 0.14);
          G.fx.screenColor = '#ffd166';
          G.main.hitstop(0.035 + mag * 0.05);
        }
      }
    } else {
      G.audio.sfx('hit', { p: G.rand(0.9, 1.15) });
    }
    // a meaty directional blow drives a bright impact lance through the hit point
    if (onScr && (opts.kx || opts.ky) && (heavy > 0.45 || final > 36)) {
      const ang = Math.atan2(opts.ky || 0, opts.kx || 0);
      G.fx.impact(e.x, e.y - e.r * 0.3, ang,
        opts.crit ? 'rgba(255,214,120,0.95)' : 'rgba(255,236,200,0.92)',
        20 + heavy * 22, 3 + heavy * 3);
      G.fx.spark(e.x + (opts.kx || 0) * e.r * 0.5, e.y + (opts.ky || 0) * e.r * 0.5, '#ffd9a8', 2, 120, 0.2);
    } else if (opts.kx && G.chance(0.35) && onScr) {
      G.fx.spark(e.x + opts.kx * e.r * 0.5, e.y + opts.ky * e.r * 0.5, '#ffd9a8', 2, 110, 0.2);
    }
    // a truly heavy single strike (not the killing blow) bites time for a sliver —
    // gated hard so crowd-melting weapons stay fluid (kills handle their own hitstop)
    if (e.hp > 0 && final >= 80 && frac > 0.3 && onScr && run.t >= _stopT) {
      _stopT = run.t + juiceGap(0.1);
      G.main.hitstop(Math.min(0.045, 0.02 + final / 4000));
    }
    if (e.hp <= 0) {
      ENT.killEnemy(e, opts, -e.hp);
      // 特殊能力「残心」(無月・鍛錬3段): 会心の止めを刺すと月波が周囲を薙ぐ
      if (opts.crit && !opts.zan && run.charId === 'mutsuki' && run.forge.c >= G.data.FORGE.specialAt) {
        const lst = [];
        G.grid.queryCircle(e.x, e.y, 95, lst);
        for (let i = 0; i < lst.length; i++) {
          ENT.damageEnemy(lst[i], 30 * G.sys.effMight(), { src: '残心', zan: true });
        }
        G.fx.ring(e.x, e.y, { r0: 8, r1: 105, life: 0.32, color: 'rgba(190,214,255,0.9)', width: 3 });
        G.fx.spark(e.x, e.y, '#bcd6ff', 6, 160, 0.3);
      }
    }
  };

  const COMBO_MS = [25, 50, 100, 150, 200, 300, 400, 500, 700, 1000, 1500, 2000, 3000];

  // 群れ殲滅: 1 シミュフレーム内の同時撃破を集計し、中心点へまとめた衝撃を放つ。
  // (per-kill のシェイクを乱発すると酔うので、フレーム末に一度だけ束ねて出す)
  // _crowdT/_stopT/_mkRingT = 揺れ/止め/衝撃波リングのクールダウン (後半カオスで毎フレーム連発させない)
  let _mkN = 0, _mkX = 0, _mkY = 0, _crowdT = 0, _stopT = 0, _mkRingT = 0, _boomT = 0;
  const FAN90 = 0.70710678;   // cos(45°): 吹き飛ぶ方向±45°=90°扇の当たり判定しきい値
  // 後半(画面の妖が多い)ほど演出の発火間隔を広げ、ヒットストップ連発と衝撃波の氾濫を抑える。
  // 1発ごとの強さ(気持ちよさ)は据え置き、頻度だけ密度に応じて間引く。
  function juiceGap(base) {
    const n = (G.run && G.run.en) ? G.run.en.act.length : 0;
    return base + Math.min(0.32, n / 300);   // 少数=base、密集で最大 +0.32s
  }
  const _litBuf = [];   // 画面内の灯り源 (x,y,r^2,灯紋) を毎フレーム集める作業配列
  ENT.flushKills = () => {
    if (_mkN >= 5) {
      const c = _mkN, cx = _mkX / c, cy = _mkY / c;
      const t = Math.min(1, (c - 5) / 16);
      const now = G.run.t;
      // 多重撃破の衝撃波リングは、後半(密集)で毎フレーム出ると画面が氾濫する → 密度に応じて間引く。
      // 魂(回収粒)は画面を覆わないので毎回出す。
      if (now >= _mkRingT) {
        _mkRingT = now + juiceGap(0.16);
        G.fx.ring(cx, cy, {
          r0: 24, r1: 118 + t * 150, life: 0.4 + t * 0.16,
          color: `rgba(255,226,172,${0.42 + t * 0.32})`, width: 3 + t * 2.8,
        });
      }
      G.fx.soul(cx, cy, 4 + ((c * 0.4) | 0));
      // 画面全体の揺れ/フラッシュは最短 0.5s 間隔に間引く (常時揺れ = 酔いの元凶を断つ)
      if (now >= _crowdT) {
        _crowdT = now + 0.5;
        G.fx.flash = Math.min(0.34, G.fx.flash + 0.05 + t * 0.09);
        G.cam.add(1.4 + t * 2.0);
        if (c >= 16) G.cam.punch(1.012 + t * 0.018);
      }
    }
    _mkN = 0; _mkX = 0; _mkY = 0;
  };

  // 超ダメージ撃破の「爆散」: 着弾点の周囲を広く巻き込む(爆ぜ+吹き飛ばし)。
  // power = 過剰度(0.5〜1.7前後)。半径・巻き込み数・吹き飛ばし量がこれで伸びる。
  // 当たり判定(queryCircle)を伴うので _boomT で発火頻度を絞り、後半の氾濫と負荷を抑える。
  // 巻き込みダメージには boomChild を立て、AoE の無限連鎖(再帰爆散)を断つ(死体の物理連鎖だけ許容)。
  // 揺れ/止めは「邪魔にならない」最小量を時間ゲート内で1回だけ。フラッシュ/画面色は一切出さない。
  function superBurst(x, y, power, dx, dy) {
    const run = G.run;
    // 吹き飛ぶ方向 (なければ右向き)。当たり判定は この向きの 90°扇 (±45°) のみ。
    let dl = Math.hypot(dx || 0, dy || 0);
    if (dl < 0.001) { dx = 1; dy = 0; dl = 1; }
    const ux = dx / dl, uy = dy / dl;
    const onScr = G.cam.onScreen(x, y, 80);
    // 視覚(爆散の破片)は粒子なので軽い → 常に出す。破片/火花は吹き飛ぶ方向へ寄せて扇状に飛ばす。
    if (onScr) {
      const fx = x + ux * (28 + power * 26), fy = y + uy * (28 + power * 26);
      G.fx.shards(fx, fy, 'rgba(255,176,96,0.95)', 6 + ((power * 4) | 0), 220 + power * 130, 0.34 + power * 0.12);
      G.fx.spark(fx, fy, '#ffb45a', 8 + ((power * 4) | 0), 220 + power * 110, 0.3);
      G.fx.ring(x, y, { r0: 8, r1: 48 + power * 50, life: 0.28 + power * 0.1, color: `rgba(255,150,80,${0.45 + power * 0.16})`, width: 3 + power * 2 });
    }
    if (run.t < _boomT) return;             // 巻き込み AoE は間引く(連発・負荷防止)
    _boomT = run.t + juiceGap(0.08);
    const R = 90 + power * 70;               // 過剰なほど広く巻き込む
    const bd = Math.min(160, 26 + power * 36) * G.sys.effMight();
    G.grid.queryCircle(x, y, R, G.QBUF2);
    const list = G.QBUF2.slice(0, 24);      // 連鎖で QBUF2 が書き換わるためコピーしてから処理
    let n = 0;
    for (let q = 0; q < list.length && n < 16; q++) {
      const foe = list[q];
      if (foe.dead) continue;
      const vx = foe.x - x, vy = foe.y - y;
      const d = Math.hypot(vx, vy);
      if (d > 1 && (vx / d) * ux + (vy / d) * uy < FAN90) continue;   // 90°扇の外は当たらない
      const kx = d > 1 ? vx / d : ux, ky = d > 1 ? vy / d : uy;
      ENT.damageEnemy(foe, foe.boss ? bd * 0.4 : bd, {
        src: '超過撃破', boomChild: true, kb: 300 + power * 170, kx, ky,
      });
      n++;
    }
    if (onScr) {                            // 控えめなクランチ(時間ゲート内で1回だけ)
      G.cam.punch(1.01 + Math.min(0.022, power * 0.013));
      G.main.hitstop(Math.min(0.03, 0.016 + power * 0.01));
    }
  }
  ENT.superBurst = superBurst;

  ENT.killEnemy = (e, opts = {}, overkill = 0) => {
    if (e.dead) return;
    const run = G.run;
    e.dead = true;
    run.kills++;

    // 秘術「魂爆の印」: 一定討伐ごとに、止めを刺した地点から連鎖祓い。
    const soulLv = run.talents.konpaku || 0;
    if (soulLv && !opts.soulBurst) {
      const need = [0, 32, 26, 20][soulLv];
      run.talentState.kills++;
      if (run.talentState.kills >= need) {
        run.talentState.kills = 0;
        const dmg = [0, 80, 120, 170][soulLv] * G.sys.effMight();
        G.grid.queryCircle(e.x, e.y, 150 + soulLv * 20, G.QBUF2);
        const sbuf = G.QBUF2.slice();   // damageEnemy→killEnemy→呪詛伝播がQBUF2を再query=反復中の上書きを防ぐ
        for (let q = 0; q < sbuf.length; q++) {
          const foe = sbuf[q];
          if (foe.dead) continue;
          const a = G.angleTo(e.x, e.y, foe.x, foe.y);
          ENT.damageEnemy(foe, foe.boss ? dmg * 0.45 : dmg, {
            src: '魂爆', soulBurst: true, kb: 380, kx: Math.cos(a), ky: Math.sin(a),
          });
        }
        G.audio.sfx('soulburst');
        G.fx.ring(e.x, e.y, { r0: 12, r1: 165 + soulLv * 20, life: 0.48, color: 'rgba(154,216,255,0.95)', width: 5 });
        G.fx.puffRing(e.x, e.y, 'rgba(110,190,255,0.85)', 14, 260);
        G.fx.soul(e.x, e.y, 10);
        G.cam.punch(1.025);
      }
    }

    // (廃止) 灯りの中で妖を倒して charge → 大祓 surge する仕様は調整盤の指示で削除。
    //        灯りの強化は滞在段階(dwell)システムに一本化。

    // 吸命の蠱: 撃破ごとに体力をわずかに吸う
    if (run.player.stats.lifesteal && run.player.alive && run.player.hp < run.player.stats.maxHp) {
      run.player.hp = Math.min(run.player.stats.maxHp, run.player.hp + run.player.stats.lifesteal);
    }

    // 残り火: 祓印を帯びた妖が倒れると、その場に残り火が燻り一定時間焼く (印ビルドの追撃・自前攻撃なし)
    if ((e.hmark || 0) > 0) {
      const nk = run.weapons.find(w => w.id === 'nokoribi');
      if (nk) {
        const nst = G.sys.calcW(nk);
        run.flames.push({ x: e.x, y: e.y, t: 0, life: nst.life || 2.6, r: nst.r || 58, dmg: nst.dmg || 18, tick: nst.tick || 0.3, tickT: 0, src: 'nokoribi' });
        if (run.flames.length > 60) run.flames.shift();
        if (G.cam.onScreen(e.x, e.y, 40)) { G.fx.ring(e.x, e.y, { r0: 6, r1: (nst.r || 58), life: 0.34, color: 'rgba(255,140,60,0.85)', width: 3 }); G.fx.spark(e.x, e.y, '#ff9a4a', 6, 150, 0.3); }
      }
    }

    // 呪詛: 呪われた妖が倒れると、呪いが近くの妖へ伝播 (+紫の小波)。相乗「呪火」で霊炎も噴く。
    if (e.curseT > 0 && !opts.curseSpread) {
      G.grid.queryCircle(e.x, e.y, 110, G.QBUF2);
      let spread = 0;
      for (let q = 0; q < G.QBUF2.length && spread < 4; q++) {
        const foe = G.QBUF2[q];
        if (foe.dead || foe === e || foe.curseT > 0) continue;
        foe.curseT = Math.max(foe.curseT, e.curseT);
        foe.curseAmp = Math.max(foe.curseAmp, e.curseAmp);
        spread++;
      }
      if (G.cam.onScreen(e.x, e.y, 40)) {
        G.fx.ring(e.x, e.y, { r0: 6, r1: 70, life: 0.34, color: 'rgba(176,123,255,0.85)', width: 3 });
        G.fx.spark(e.x, e.y, '#b07bff', 6, 130, 0.28);
      }
      if (run.syn && run.syn.juka) {   // 相乗「呪火」: 呪い持ちの死に霊炎が噴き出す
        run.flames.push({ x: e.x, y: e.y, t: 0, life: 2.4, r: 58, dmg: 14, tick: 0.32, tickT: 0, syn: true, src: '呪火' });
        if (run.flames.length > 60) run.flames.shift();
        if (G.cam.onScreen(e.x, e.y, 40)) { G.fx.ring(e.x, e.y, { r0: 8, r1: 64, life: 0.4, color: 'rgba(255,110,40,0.9)', width: 4 }); G.fx.spark(e.x, e.y, '#ff8a3a', 7, 150, 0.3); }
      }
    }

    // 超ダメージ撃破: 止めが体力を大きく上回ると「爆散」して吹き飛び、広範囲を巻き込む。
    // overkill = 余剰ダメージ。体力比(okRatio)が高い = 過剰な一撃 → 死体が砕けて広く撥ね飛ばす。
    // boomChild(爆散の巻き込み) / soulBurst は再帰連鎖を断つため対象外。
    const okRatio = e.maxHp > 0 ? overkill / e.maxHp : 0;
    const superKill = !e.boss && !opts.boomChild && !opts.soulBurst
      && overkill >= 70 && okRatio >= 1.5;
    const power = superKill ? G.clamp(0.4 + okRatio * 0.32, 0.5, 1.7) : 0;

    // 物理死体: 止めの威力と方向で吹き飛び、生者を巻き込む
    let launched = false;
    if (!e.boss && G.cam.onScreen(e.x, e.y, 120)) {
      let lx = opts.kx || 0, ly = opts.ky || 0;
      if (!lx && !ly) {
        const a = G.angleTo(run.player.x, run.player.y, e.x, e.y);
        lx = Math.cos(a); ly = Math.sin(a);
      }
      let sp = Math.min(840, 110 + (opts.kb || 0) * 0.95 + overkill * 5.5);
      if (superKill) sp = Math.min(1250, sp * 1.35 + 220);   // さらに速く・遠くへ
      if (sp > 235) {
        if (run.corpses.length >= 40) run.corpses.shift();
        run.corpses.push({
          spr: e.cfg.spr + '_' + e.frame, x: e.x, y: e.y,
          vx: lx * sp + G.rand(-45, 45), vy: ly * sp + G.rand(-45, 45),
          rot: 0, rv: (lx >= 0 ? 1 : -1) * G.rand(6, 11) * (superKill ? 1.6 : 1),
          scale: e.scale * (superKill ? 1.15 : 1), flip: e._face === 1,
          life: superKill ? 1.05 : 0.8, maxLife: superKill ? 1.05 : 0.8,
          dmg: (8 + e.maxHp * 0.05) * (superKill ? 1.8 : 1),
          hits: superKill ? 6 : 3, hitIds: [],
          boom: superKill, cr: superKill ? 30 : 13, power,
        });
        launched = true;
        G.fx.trail(e.x, e.y, superKill ? 'rgba(255,170,90,0.7)' : 'rgba(255,200,150,0.5)', superKill ? 8 : 5, 0.25);
      }
    }
    if (superKill) {
      // 吹き飛ぶ向き = 止めのノックバック方向 (なければプレイヤー→妖)
      let bx = opts.kx || 0, by = opts.ky || 0;
      if (!bx && !by) { const a = G.angleTo(run.player.x, run.player.y, e.x, e.y); bx = Math.cos(a); by = Math.sin(a); }
      superBurst(e.x, e.y, power, bx, by);   // 着弾点の初撃爆散(吹き飛ぶ方向90°扇に巻き込む)
      G.fx.anim(e.x, e.y, 'explode', { scale: 0.85 + power * 0.45, add: false });   // 超過撃破に素材ベースの爆発(foozle CC0)。通常合成=重なっても白飛びしない/未ロード時は手続きFXのみ
    }

    // death pop: white silhouette swells and fades (吹き飛んだ時は死体に任せる)
    if (!launched && G.cam.onScreen(e.x, e.y, 60)) {
      const flyOff = e.cfg.fly ? Math.sin(run.t * 3 + e.phase) * 3 : 0;
      G.fx.pop(e.cfg.spr + '_' + e.frame + '_w', e.x, e.y + flyOff, {
        scale: e.scale * (e.boss ? 1 : 1 + Math.min(0.22, e.maxHp / 500)),
        flip: e._face === 1, life: e.boss ? 0.32 : 0.17,
      });
    }
    const deathBossRank = e.boss ? (e.bossRank || e.cfg.rank || 1) : 0;
    const deathBossCol = e.boss ? (BOSS_FX_COLOR[e.bossId] || '#ffd166') : '#ff9a6a';
    G.fx.spark(e.x, e.y, deathBossCol, e.boss ? 22 + deathBossRank * 5 : 5, e.boss ? 240 + deathBossRank * 24 : 110);
    G.fx.soul(e.x, e.y, e.boss ? 14 : 3);
    G.audio.sfx('kill');

    // 撃破スペクタクル: 雑魚はポップのみ、妖が育つほど砕け散り、頑丈な妖は祓う手応え
    if (!e.boss && G.cam.onScreen(e.x, e.y, 60)) {
      const wt = G.clamp(e.maxHp / 60, 0, 3);
      const ash = e.cfg.light ? 'rgba(255,206,140,0.9)' : 'rgba(196,214,255,0.85)';
      if (e.maxHp >= 20 || e.elite) {
        G.fx.shards(e.x, e.y, ash, 3 + Math.round(wt * 3), 110 + wt * 50, 0.4 + wt * 0.1);
      }
      if (e.maxHp >= 55 || e.elite) {
        // 衝撃波リングは後半(密集)では氾濫するので、混雑時は間引く(エリートは常に出す)
        if (e.elite || run.en.act.length < 70 || G.chance(0.4)) {
          G.fx.ring(e.x, e.y, { r0: 8, r1: 70 + wt * 40, life: 0.32 + wt * 0.06, color: ash, width: 2.5 + wt });
        }
        G.fx.soul(e.x, e.y, 2 + Math.round(wt * 2));
        // 頑丈な妖の撃破は短いヒットストップで手応え。per-kill のシェイクは出さない(群れで酔う)→ 揺れは flushKills が束ねる
        // 止めの間隔は密度で広げる(後半のカクつき=連続ヒットストップを抑える)
        if (run.t >= _stopT) { _stopT = run.t + juiceGap(0.1); G.main.hitstop(Math.min(0.05, 0.02 + wt * 0.012)); }
      }
    }
    if (!e.boss) { _mkN++; _mkX += e.x; _mkY += e.y; }

    // kill combo
    run.combo++;
    run.comboT = 2.6 + ([0, 0.35, 0.65, 1.0][run.talents.yawatari || 0]);
    run.comboPop = 0.15;
    if (run.combo > run.maxCombo) run.maxCombo = run.combo;
    // 奥義ゲージ + 図鑑 (初討伐の妖を記す)
    if (run.ult.charge < run.ult.need) run.ult.charge++;
    if (!G.codexSeen) G.codexSeen = G.store.get('codexFoes', {});
    const tid = e.bossId || e.type;
    if (tid && !G.codexSeen[tid]) {
      G.codexSeen[tid] = true;
      G.store.set('codexFoes', G.codexSeen);
    }
    // high-combo kills burn brighter
    if (run.combo >= 100 && G.cam.onScreen(e.x, e.y, 60)) {
      G.fx.spark(e.x, e.y, run.combo >= 300 ? '#fff6dc' : '#ffd166', 3, 160, 0.3);
      if (run.combo >= 300 && G.chance(0.25)) {
        G.fx.ring(e.x, e.y, { r0: 6, r1: 42, life: 0.25, color: 'rgba(255,220,150,0.8)', width: 2 });
      }
    }
    if (run.comboNext < COMBO_MS.length && run.combo >= COMBO_MS[run.comboNext]) {
      const m = COMBO_MS[run.comboNext++];
      const p = run.player;
      G.audio.sfx('combo', { tier: run.comboNext });
      G.fx.ring(p.x, p.y, { r0: 16, r1: 100, life: 0.4, color: 'rgba(255,209,102,0.9)' });
      G.fx.text(p.x, p.y - 34, m + ' 連撃!', '#ffd166', 17);
      const bonus = Math.ceil(m / 10);
      run.souls += bonus;
      G.sys.gainXp(bonus);
      G.cam.punch(1.02);
    }

    if (e.boss) {
      const bossRank = e.bossRank || e.cfg.rank || 1;
      const bossCol = BOSS_FX_COLOR[e.bossId] || '#ffd166';
      run.bossKills++;
      // gold gem ring + guaranteed onigiri
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * G.TAU;
        ENT.spawnGem(e.x + Math.cos(a) * 34, e.y + Math.sin(a) * 34, Math.ceil(e.xp / 8));
      }
      ENT.spawnItem('onigiri', e.x, e.y - 14);
      if (G.chance(0.6)) ENT.spawnItem('magnet', e.x + 30, e.y + 16);
      G.audio.sfx('bossdie');
      G.cam.add(9);
      G.cam.punch(1.08);
      G.main.hitstop(0.16);
      G.main.slowmo(0.55, 0.28);
      G.fx.flash = Math.min(0.55, G.fx.flash + 0.45);
      G.fx.soul(e.x, e.y, 18);
      G.fx.ring(e.x, e.y, { r0: 30, r1: 250 + bossRank * 18, life: 0.65 + bossRank * 0.035, color: bossCol, width: 5 + bossRank * 0.4 });
      G.fx.ring(e.x, e.y, { r0: 10, r1: 190, life: 0.5, color: 'rgba(255,245,220,0.9)' });
      G.fx.ring(e.x, e.y, { r0: 50, r1: 310 + bossRank * 24, life: 0.78 + bossRank * 0.04, color: bossCol, width: 3 + bossRank * 0.25 });
      if (G.fx.anim) {   // ボス撃破=本物の大爆発→門へ還る(foozle explode/portal)
        G.fx.anim(e.x, e.y, 'explode', { scale: 1.4 + bossRank * 0.16, dur: 0.48 + bossRank * 0.025, add: false });
        G.fx.anim(e.x, e.y, 'portal', { scale: Math.max(4, e.r * 0.12) + bossRank * 0.22, dur: 0.66, add: true });
      }
      if (D.EXPFX && bossRank >= 5) G.fx.burst(e.x, e.y, 'dark_vortex', {
        sz: 260 + bossRank * 30, dur: 0.82, from: 1.25, to: 0.25, spin: -1.8, add: true,
      });
      if (run.boss === e) run.boss = null;
      if (e.bossId === 'shuten') {
        run.shutenSlain = true;
        G.ui.announce('鬼神、討滅', '夜明けは近い');
      } else {
        G.ui.announce(e.cfg.name + 'を討った', '');
      }
    } else {
      ENT.spawnGem(e.x, e.y, e.xp);
      if (e.elite) {
        run.eliteKills++;
        if (G.fx.anim && G.cam.onScreen(e.x, e.y, 80)) G.fx.anim(e.x, e.y, 'explode', { scale: 1.05, dur: 0.46, add: false });   // 強敵撃破に本物の爆発(foozle explode)
        const roll = Math.random();
        if (roll < 0.35) ENT.spawnItem('onigiri', e.x, e.y);
        else if (roll < 0.55) ENT.spawnItem('magnet', e.x, e.y);
        else if (roll < 0.7) ENT.spawnItem('bomb', e.x, e.y);
        if (e.buffRich) {
          // “福持ち”: 加護 2 個確定
          ENT.spawnItem('buff_' + G.pick(Object.keys(G.data.BUFFS)), e.x - 14, e.y - 14);
          ENT.spawnItem('buff_' + G.pick(Object.keys(G.data.BUFFS)), e.x + 14, e.y - 14);
        } else if (G.chance(G.data.BUFF_DROP_ELITE)) {
          ENT.spawnItem('buff_' + G.pick(Object.keys(G.data.BUFFS)), e.x, e.y - 14);
        }
        const coin = ENT.spawnItem('koban', e.x + G.rand(-16, 16), e.y + G.rand(-16, 16));
        coin.v = G.randInt(6, 14) * (e.kobanRich ? 3 : 1);   // “銭袋”
        G.fx.puffRing(e.x, e.y, 'rgba(255,209,102,0.8)', 10, 140);
      } else if (G.chance(G.data.BUFF_DROP * (1 + 0.10 * ((run.hono && run.hono.fuku) || 0)))) {
        ENT.spawnItem('buff_' + G.pick(Object.keys(G.data.BUFFS)), e.x, e.y);
      }
      // “怨念”: 死して尚、霊弾を撒く
      if (e.deathBurst) {
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * G.TAU;
          ENT.spawnOrb(e.x, e.y, Math.cos(a) * 140, Math.sin(a) * 140, e.dmg * 0.6, e.type);
        }
        G.fx.ring(e.x, e.y, { r0: 8, r1: 95, life: 0.32, color: 'rgba(200,90,255,0.85)', width: 3 });
      }
    }
  };

  ENT.damagePlayer = (d, src) => {
    const run = G.run;
    const p = run.player;
    if (!p.alive || p.hurtT > 0 || (G.debug && G.debug.god)) return;
    if (run.buffs.kongo > 0) {
      // 金剛: untouchable
      G.audio.sfx('deny');
      G.fx.spark(p.x, p.y - 8, '#ffd166', 5, 150, 0.25);
      return;
    }
    // 宝具「神避けの守」: 紙一重で完全回避 (上限40%)
    if ((p.stats.dodge || 0) > 0 && G.chance(Math.min(0.4, p.stats.dodge))) {
      p.hurtT = Math.max(p.hurtT, 0.18);
      G.audio.sfx('deny');
      G.fx.text(p.x, p.y - 30, '避', '#bfe9ff', 15);
      G.fx.spark(p.x, p.y - 8, '#bfe9ff', 7, 160, 0.28);
      return;
    }
    const utsuLv = run.talents.utsusemi || 0;
    if (utsuLv && run.talentState.utsusemi <= 0) {
      run.talentState.utsusemi = [0, 55, 43, 32][utsuLv];
      p.hurtT = Math.max(p.hurtT, 0.45);
      const radius = 145 + utsuLv * 15;
      const dmg = [0, 60, 90, 130][utsuLv] * G.sys.effMight();
      G.grid.queryCircle(p.x, p.y, radius, G.QBUF2);
      const buf = G.QBUF2.slice();   // 撃破→超過爆散/呪詛伝播がQBUF2を再query=反復中の上書き(undefined化)を防ぐ
      for (let q = 0; q < buf.length; q++) {
        const foe = buf[q];
        const a = G.angleTo(p.x, p.y, foe.x, foe.y);
        ENT.damageEnemy(foe, foe.boss ? dmg * 0.5 : dmg, { src: '空蝉',
          kb: 500, kx: Math.cos(a), ky: Math.sin(a),
        });
      }
      G.audio.sfx('mystic');
      G.main.slowmo(0.22, 0.45);
      G.fx.ring(p.x, p.y - 6, { r0: 8, r1: radius, life: 0.42, color: 'rgba(225,238,255,0.95)', width: 4 });
      G.fx.pop(G.data.CHARS[run.charId].spr + '0_w', p.x, p.y, { scale: 1.15, life: 0.28 });
      G.fx.text(p.x, p.y - 34, '空蝉', '#e6efff', 17);
      G.cam.punch(1.025);
      return;
    }
    // 護法の珠 → 受け返し: 痛手を防いだ刹那、珠が弾けて周囲を打ち払う (返しの間は一瞬無敵)
    if (run.skill && run.skill.shield) {
      run.skill.shield = false;
      p.hurtT = Math.max(p.hurtT, 0.5);
      G.audio.sfx('gong');
      G.main.slowmo(0.32, 0.42);
      G.fx.flash = Math.min(0.34, G.fx.flash + 0.12);
      G.cam.add(5);
      const R = run.skill.eff.counter || 165;
      const cdmg = (run.skill.eff.dmg || 72) * G.sys.effMight();
      G.grid.queryCircle(p.x, p.y, R, G.QBUF2);
      const buf = G.QBUF2.slice();   // 撃破時のQBUF2再queryによる反復破壊を防ぐ
      for (let q = 0; q < buf.length; q++) {
        const e = buf[q];
        const a = G.angleTo(p.x, p.y, e.x, e.y);
        ENT.damageEnemy(e, cdmg, { src: '受け返し', kb: 560, kx: Math.cos(a), ky: Math.sin(a) });
      }
      G.fx.ring(p.x, p.y - 6, { r0: 12, r1: R, life: 0.4, color: 'rgba(255,209,102,0.95)', width: 5 });
      G.fx.ring(p.x, p.y - 6, { r0: 6, r1: R * 0.6, life: 0.3, color: 'rgba(255,245,220,0.9)' });
      G.fx.spark(p.x, p.y - 8, '#ffd166', 14, 200, 0.4);
      return;
    }
    const lsig = run.lampStage > 0 ? (run.lampAura.id || run.lampLastId) : null;   // 残り火: 灯り外でも段が残る間は加護継続
    const lampArmor = lsig
      ? (((lsig === 'byakuren' ? 2 : 0) + [0, 2, 3, 5][run.talents.himori || 0]) * (run.lampPow || 1))
      : 0;
    const allLitArmor = run.allLit ? D.LAMP_ALLLIT.armor : 0;   // 灯明満ち
    const final = Math.max(1, Math.round(d - p.stats.armor - lampArmor - allLitArmor));
    p.hp -= final;
    run.hitsTaken++;
    p.hurtT = 0.45;
    p.hurtAnimT = 0.34;
    p.animT = 0;
    G.fx.hurtFlash = 0.55;
    G.fx.spark(p.x, p.y, '#ff5a4a', 8, 150);
    G.cam.add(4.5);
    G.audio.sfx('hurt');
    G.main.hitstop(0.05);
    // 共鳴「不動」: 被弾の刹那、周囲へ反撃ノヴァ (i-frame 0.45s が実質クールダウン)
    if (run.reso.fudo) {
      G.grid.queryCircle(p.x, p.y, 120, G.QBUF2);
      const buf = G.QBUF2.slice();   // 撃破時のQBUF2再queryによる反復破壊を防ぐ
      for (let q = 0; q < buf.length; q++) {
        const e = buf[q];
        const a = G.angleTo(p.x, p.y, e.x, e.y);
        ENT.damageEnemy(e, final * 2 + 10, { src: '不動', kb: 430, kx: Math.cos(a), ky: Math.sin(a) });
      }
      G.fx.ring(p.x, p.y, { r0: 12, r1: 135, life: 0.35, color: 'rgba(200,212,255,0.9)', width: 3 });
      G.audio.sfx('gong');
    }
    // 茨の反射: 痛手を受けた刹那、四方へ棘を撒いて反撃する (被弾の i-frame が実質クールダウン)
    const ibW = run.weapons.find(w => w.id === 'ibara');
    if (ibW) {
      const ist = G.sys.calcW(ibW);
      const R = ist.radius * (p.stats.area || 1);
      G.grid.queryCircle(p.x, p.y, R, G.QBUF2);
      const buf = G.QBUF2.slice();   // 撃破時のQBUF2再queryによる反復破壊を防ぐ
      for (let q = 0; q < buf.length; q++) {
        const e = buf[q];
        const a = G.angleTo(p.x, p.y, e.x, e.y);
        ENT.damageEnemy(e, ist.dmg * G.sys.effMight(), { src: 'ibara', kb: 360, kx: Math.cos(a), ky: Math.sin(a), crit: G.chance(p.stats.crit || 0) });
      }
      G.fx.ring(p.x, p.y, { r0: 10, r1: R, life: 0.34, color: 'rgba(150,217,139,0.92)', width: 3 });
      G.fx.ring(p.x, p.y, { r0: 6, r1: R * 0.7, life: 0.26, color: 'rgba(200,240,180,0.7)', width: 2 });
      for (let k = 0; k < 12; k++) { const a = k / 12 * G.TAU; G.fx.spark(p.x + Math.cos(a) * 14, p.y + Math.sin(a) * 14, '#9ed98b', 1, 230, 0.32); }
      if (buf.length) {   // 反撃が当たった時だけ「茨」と緑パルス=赤い被弾フラッシュから際立たせる
        G.fx.text(p.x, p.y - 28, '茨', '#9ed98b', 15);
        G.fx.screenColor = '#9ed98b'; G.fx.screenPulse = Math.max(G.fx.screenPulse || 0, 0.12);
        if (G.fx.anim) G.fx.anim(p.x, p.y, 'earth_spike', { scale: R / 34, dur: 0.4, add: false });   // 棘が地から噴出(foozle Earth_Spike)
      }
      G.audio.sfx('slash', { p: 0.8 });
    }
    // 特殊能力「祓いの舞」(鈴・鍛錬3段): 危機に自動で大祓+回復 (60秒に一度)
    if (run.charId === 'suzu' && run.forge.c >= G.data.FORGE.specialAt
      && p.hp > 0 && p.hp < p.stats.maxHp * 0.3 && run.t - run.purgeT >= 60) {
      run.purgeT = run.t;
      ENT.useBomb(p.x, p.y);
      p.hp = Math.min(p.stats.maxHp, p.hp + 40);
      G.ui.announce('祓いの舞', '');
      G.audio.sfx('awaken');
      G.fx.puffRing(p.x, p.y, 'rgba(255,209,102,0.9)', 16, 260);
    }
    if (p.hp <= 0) {
      // 宝具「反魂の符」: 1ランに一度だけ、半身で蘇り周囲を薙ぎ払う
      if ((p.stats.revive || 0) > 0 && !run.revived) {
        run.revived = true;
        p.hp = Math.max(1, Math.round(p.stats.maxHp * 0.5));
        p.hurtT = Math.max(p.hurtT, 1.2);   // 蘇生直後の無敵
        G.ui.announce('反魂', '半身で蘇る');
        G.audio.sfx('awaken');
        G.fx.flash = Math.min(0.5, G.fx.flash + 0.3);
        G.fx.ring(p.x, p.y, { r0: 14, r1: 240, life: 0.6, color: 'rgba(255,209,102,0.95)', width: 5 });
        G.fx.puffRing(p.x, p.y, 'rgba(255,230,170,0.9)', 18, 280);
        G.cam.punch(1.05);
        G.grid.queryCircle(p.x, p.y, 220, G.QBUF2);
        const buf = G.QBUF2.slice();   // 撃破時のQBUF2再queryによる反復破壊を防ぐ
        for (let q = 0; q < buf.length; q++) {
          const e = buf[q];
          const a = G.angleTo(p.x, p.y, e.x, e.y);
          ENT.damageEnemy(e, 220, { src: '反魂', kb: 600, kx: Math.cos(a), ky: Math.sin(a) });
        }
        return;
      }
      p.hp = 0;
      p.alive = false;
      run.killedBy = src || null;   // 死亡文: 何に殺されたか
      G.fx.puffRing(p.x, p.y, 'rgba(255,120,90,0.9)', 18, 220);
    }
  };

  // ---------------- pickups ----------------
  ENT.spawnGem = (x, y, v) => {
    const run = G.run;
    if (run.gem.act.length >= run.gem.max) {
      const g = run.gem.act[(Math.random() * run.gem.act.length) | 0];
      g.v += v;
      return g;
    }
    const g = run.gem.obtain();
    g.x = x + G.rand(-4, 4); g.y = y + G.rand(-4, 4);
    g.v = v; g.t = G.rand(G.TAU);
    g.attract = false;
    g.vx = 0; g.vy = 0;
    return g;
  };

  ENT.spawnItem = (kind, x, y) => {
    const run = G.run;
    const it = run.it.obtain();
    it.kind = kind; it.x = x; it.y = y; it.t = 0;
    return it;
  };

  ENT.spawnToro = () => {
    const run = G.run;
    const p = run.player;
    const a = G.rand(G.TAU);
    const d = G.rand(420, 680);
    const hpMul = 1 + [0, 0.25, 0.50, 0.75][run.talents.himori || 0];
    const hp = D.LAMP.hp * hpMul;
    run.toros.push({
      x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d,
      dead: true, everLit: false, sigil: null, flash: 0,
      hp, maxHp: hp, ignite: 0, relightT: 0, charge: 0, surgeT: 0,
    });
  };

  ENT.spawnChest = () => {
    const run = G.run;
    const p = run.player;
    const a = G.rand(G.TAU);
    const d = G.rand(D.CHEST.dist[0], D.CHEST.dist[1]);
    const [cx, cy] = G.clampMap(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 40);
    const c = { x: cx, y: cy, t: G.rand(G.TAU), opened: false, openT: 0, life: D.CHEST.life || 15 };
    run.chests.push(c);
    return c;
  };

  ENT.updateChests = h => {
    const run = G.run;
    const p = run.player;
    for (let i = run.chests.length - 1; i >= 0; i--) {
      const c = run.chests[i];
      c.t += h;
      if (c.opened) {
        c.openT += h;
        if (c.openT > 2.2) run.chests.splice(i, 1);
        continue;
      }
      c.life -= h;
      if (c.life <= 0) {   // 未取得は消滅 (取り逃すと消える)
        if (G.cam.onScreen(c.x, c.y, 80)) { G.fx.ring(c.x, c.y, { r0: 8, r1: 60, life: 0.4, color: 'rgba(160,150,120,0.6)', width: 2 }); G.fx.spark(c.x, c.y, '#b8a878', 6, 120, 0.3); }
        run.chests.splice(i, 1); continue;
      }
      // sparkle invitation
      if (G.chance(0.05) && G.cam.onScreen(c.x, c.y, 80)) {
        G.fx.ember(c.x, c.y - 10, 'rgba(255,220,140,0.85)');
      }
      if (p.alive && G.dist2(c.x, c.y, p.x, p.y) < 30 * 30) {
        c.opened = true;
        G.main.openChest(c);
      }
    }
  };

  // 据置提灯は不壊の安全地帯 (固定光源)。武器/結界/爆風から呼ばれるが何もしない
  ENT.hitToros = () => {};

  ENT.useBomb = (x, y) => {
    const run = G.run;
    G.audio.sfx('bomb');
    G.fx.flash = 0.5;
    G.cam.add(10);
    G.cam.punch(1.045);
    G.main.hitstop(0.1);
    G.fx.powerBurst(x, y, {
      radius: 420, life: 0.7, color: '#ffb347', accent: '#fff4d0',
      glyphs: 8, height: 300, width: 84, particles: 28, sparks: 20, screen: 0.62,
    });
    G.fx.puffRing(x, y, 'rgba(255,209,102,0.9)', 26, 420);
    G.fx.ring(x, y, { r0: 40, r1: 420, life: 0.55, color: 'rgba(255,228,170,0.95)', width: 6 });
    G.fx.ring(x, y, { r0: 20, r1: 280, life: 0.4, color: 'rgba(255,255,255,0.85)' });
    for (let i = run.en.act.length - 1; i >= 0; i--) {
      const e = run.en.act[i];
      if (e.dead) continue;
      // 爆心からの放射ノックバック → 死体が外へ吹き飛ぶ
      const a = G.angleTo(x, y, e.x, e.y);
      ENT.damageEnemy(e, e.boss ? 400 : 320, { src: '大祓', kb: 520, kx: Math.cos(a), ky: Math.sin(a) });
    }
    run.ep.clear();
  };

  // ---------------- 灯りと結界 ----------------
  // 灯りの効果半径。損傷で細り、滞在段階(stageRange)で拡がる。
  // 灯りの効果半径。各灯は自分の表示段階(dispStage)で拡がる = 灯ごとに独立(全灯連動を解消)
  const lampRadius = t => G.LAMP_R * (0.55 + 0.45 * G.clamp(t.hp / t.maxHp, 0, 1))
    * (D.LAMP.stageRange[t.dispStage || 0] || 1);

  function igniteLamp(t) {
    const run = G.run;
    const p = run.player;
    const first = !t.everLit;
    if (!t.sigil) {
      t.sigil = D.LAMP_SIGIL_ORDER[run.lampsLit % D.LAMP_SIGIL_ORDER.length];
    }
    const sigil = D.LAMP_SIGILS[t.sigil];
    t.dead = false;
    t.hp = t.maxHp;
    t.ignite = 0;
    t.relightT = 0;
    G.audio.sfx('lampignite');
    G.fx.powerBurst(t.x, t.y - 4, {
      radius: 118, life: 0.78, color: sigil.color, accent: '#fff1c7',
      glyphs: 8, height: 190, width: 34, particles: 14, sparks: 12, screen: 0.2,
    });
    G.fx.ring(t.x, t.y, { r0: 8, r1: 118, life: 0.55, color: sigil.glow, width: 4 });
    G.fx.ring(t.x, t.y, { r0: 18, r1: G.LAMP_R, life: 0.7, color: sigil.color, width: 2 });
    G.fx.spark(t.x, t.y - 12, sigil.color, 18, 190);
    G.fx.soul(t.x, t.y - 8, 6);
    if (G.fx.anim) G.fx.anim(t.x, t.y - 6, 'lampburst', { scale: 1.8, dur: 0.5, add: true });   // 灯火点灯(GPT FX)
    G.fx.text(t.x, t.y - 34, `${sigil.kanji} ${sigil.name}`, sigil.color, 16);
    G.cam.punch(1.018);

    const fireLv = run.talents.hikugi || 0;
    if (fireLv) {
      const heal = [0, 5, 9, 14][fireLv];
      const ult = [0, 3, 5, 8][fireLv];
      p.hp = Math.min(p.stats.maxHp, p.hp + heal);
      run.ult.charge = Math.min(run.ult.need, run.ult.charge + ult);
      G.fx.text(p.x, p.y - 30, `火継ぎ +${heal}`, '#e9e0ba', 13);
    }

    if (first) {
      t.everLit = true;
      run.lampsLit++;
      const rem = run.lampsLit % D.LAMP.bless;
      const left = rem === 0 ? 0 : D.LAMP.bless - rem;
      G.fx.text(t.x, t.y - 50, left === 0 ? '三灯共鳴!' : `共鳴 あと${left}`, '#ffce8c', 14);
      if (left === 0) ENT.lampBlessing();
    }
  }

  // 消灯中は圏内に留まって火を結ぶ。再点灯には短い封印時間があり、油赤子を無視できない。
  ENT.updateLamps = h => {
    const run = G.run;
    const p = run.player;
    if (!p.alive) return;
    const lamps = run.toros;
    const igR = D.LAMP.igniteR;
    run.lampAura.id = null;
    run.lampAura.lamp = null;
    let auraD2 = Infinity;
    let litN = 0;
    for (let i = 0; i < lamps.length; i++) {
      const t = lamps[i];
      if (t.douseT > 0) t.douseT -= h;   // 消し手に狙われた直後の警告タイマー
      if (t.flash > 0) t.flash -= h;
      if (t.surgeT > 0) t.surgeT -= h;
      if (t.relightT > 0) t.relightT -= h;
      const d2 = G.dist2(p.x, p.y, t.x, t.y);
      if (!t.dead) {
        litN++;
        t.ignite = 0;
        t.hp = Math.min(t.maxHp, t.hp + 0.35 * h);
        const lr = lampRadius(t);
        if (d2 < lr * lr && d2 < auraD2) {
          auraD2 = d2;
          run.lampAura.id = t.sigil;
          run.lampAura.lamp = t;
        }
        continue;
      }
      if (t.relightT > 0) {
        t.ignite = Math.max(0, t.ignite - h * 0.7);
        continue;
      }
      if (d2 < igR * igR) {
        const need = t.everLit ? D.LAMP.relightTime : D.LAMP.igniteTime;
        t.ignite = Math.min(1, t.ignite + h / need);
        if (G.chance(0.18)) {
          const col = t.sigil ? D.LAMP_SIGILS[t.sigil].glow : 'rgba(255,214,150,0.85)';
          G.fx.ember(t.x + G.rand(-5, 5), t.y - 10, col);
        }
        if (t.ignite >= 1) igniteLamp(t);
      } else {
        t.ignite = Math.max(0, t.ignite - h * 0.45);
      }
    }
    // 全灯点灯の集計: ステージの全提灯が灯っているか (灯明満ち = 全灯バフ / 夜の侵食 / 夜明け報酬の基礎)
    run.lampsTotal = lamps.length;
    run.lampsLit = litN;
    const wasAllLit = run.allLit;
    run.allLit = lamps.length > 0 && litN >= lamps.length;
    if (run.allLit && !wasAllLit) {
      G.ui.announce('灯明満ち', '百鬼退散 ― 全ての灯が貴方を加護する');
      G.audio.sfx('lampflare');
      const pp = run.player;
      G.fx.powerBurst(pp.x, pp.y, { radius: 120, life: 0.7, color: '#ffe08a', accent: '#fff6d8', glyphs: 8, particles: 16, sparks: 12, screen: 0.3 });
    }

    // 滞在による段階上昇: 灯りの中に居続けるほど効果と範囲が上がる。外に出ると減衰。
    const ds = D.LAMP.dwellStages;
    const maxStage = ds.length;   // 最終段 = 最大効力
    const prevStage = run.lampStage;
    if (run.lampAura.id) {
      run.lampLastId = run.lampAura.id;   // 減衰中もHUDで灯火種別を表示するため保持
      run.lampDwell += h * (1 + (run.player.stats.lampDwell || 0));   // 灯明の加護: 滞在ゲージ上昇UP(早く育つ)
      run.lampAfterglowT = D.LAMP.afterglow;   // 灯りの中: 残り火を満タンに
    } else if (run.lampAfterglowT > 0) {
      run.lampAfterglowT -= h;   // 残り火: 灯りを離れても数秒は段(加護)を満充填で保持 → 持ち出して削れる
    } else {
      run.lampDwell = Math.max(0, run.lampDwell - D.LAMP.dwellDecay * h);   // 残り火が尽きたら減衰
    }
    let ns = 0;
    for (let i = 0; i < ds.length; i++) if (run.lampDwell >= ds[i]) ns = i + 1;
    if (ns > prevStage) ENT.lampStageUp(ns);   // 段が上がった瞬間だけ演出
    run.lampStage = ns;
    run.lampPow = D.LAMP.stagePower[ns] || 1;
    // 最大効力に達した瞬間、持続タイマー始動 → 維持中カウントダウン → 尽きたら現在の灯だけ燃え尽きる
    if (ns >= maxStage && prevStage < maxStage) run.lampMaxHoldT = D.LAMP.maxHold * (1 + (run.player.stats.lampHold || 0));   // 灯明の加護: 最大効力が長持ち
    if (ns >= maxStage && run.lampMaxHoldT > 0) {
      run.lampMaxHoldT -= h;
      if (run.lampMaxHoldT <= 0) { run.lampMaxHoldT = 0; ENT.lampBurnout(); }
    } else if (ns < maxStage) {
      run.lampMaxHoldT = 0;
    }
    // 各灯の表示段階: 今プレイヤーが浴びている灯だけが滞在段階で大きくなる(他は素のまま) = 灯ごとに独立
    for (let i = 0; i < lamps.length; i++) lamps[i].dispStage = (lamps[i] === run.lampAura.lamp) ? run.lampStage : 0;
  };

  // 最大効力の持続が尽きたら現在の灯だけ燃え尽きる。別の灯ではすぐ加護を育て直せる。
  ENT.lampBurnout = () => {
    const run = G.run, p = run.player;
    run.lampDwell = 0; run.lampStage = 0; run.lampPow = 1; run.lampMaxHoldT = 0;
    const lamp = run.lampAura.lamp;
    const sig = lamp && D.LAMP_SIGILS[lamp.sigil];
    const col = sig ? sig.color : '#ffd166';
    if (lamp && !lamp.dead) {
      lamp.dead = true; lamp.ignite = 0;
      lamp.relightT = D.LAMP.relightLock * 3;   // 燃え尽き後の付け直しまでの封印 = 通常の3倍 (再開コストを重く)
      run.lampAura.id = null; run.lampAura.lamp = null;
      // 燃え尽き演出: 灯が急速に萎んで散る
      G.fx.ring(lamp.x, lamp.y, { r0: G.LAMP_R, r1: 12, life: 0.5, color: 'rgba(120,130,150,0.8)', width: 4 });
      G.fx.puffRing(lamp.x, lamp.y, 'rgba(90,96,112,0.7)', 16, 220);
      G.fx.spark(lamp.x, lamp.y - 10, '#6b7488', 12, 150);
      G.fx.text(lamp.x, lamp.y - 36, '燃え尽き', '#9aa6bb', 15);
    }
    G.audio.sfx('lampflare', { p: 0.6 });
    G.cam.add(3);
    G.fx.flash = Math.min(0.4, 0.18);
    G.ui.announce('灯火 燃え尽き', '別の灯へ移れば、加護を再び育てられる');
  };

  // 灯りの段階上昇演出。段が上がるほど豪華に (リング/粒子/光/カメラ/フラッシュ/高段で更に派手)。
  ENT.lampStageUp = stage => {
    const run = G.run, p = run.player;
    const lamp = run.lampAura.lamp;
    const sig = lamp && D.LAMP_SIGILS[lamp.sigil];
    const col = sig ? sig.color : '#ffd166';
    const glow = sig ? sig.glow : 'rgba(255,209,102,0.9)';
    const s = stage;   // 1..4
    G.audio.sfx('lampflare');
    G.fx.powerBurst(p.x, p.y - 6, {
      radius: 110 + s * 58, life: 0.55 + s * 0.13, color: col, accent: '#ffffff',
      glyphs: 6 + s * 3, height: 140 + s * 80, width: 34 + s * 12,
      particles: 9 + s * 8, sparks: 7 + s * 6, screen: 0.1 + s * 0.07,
    });
    G.fx.ring(p.x, p.y, { r0: 14, r1: 120 + s * 72, life: 0.5 + s * 0.1, color: glow, width: 3 + s });
    if (G.fx.anim) G.fx.anim(p.x, p.y - 6, 'lampburst', { scale: 1.8 + s * 0.5, dur: 0.5, add: true });   // 灯火段階上昇(GPT FX)
    if (s >= 2) G.fx.ring(p.x, p.y, { r0: 8, r1: 90 + s * 54, life: 0.42, color: 'rgba(255,255,255,0.85)' });
    if (s >= 3) {
      G.fx.sigil(p.x, p.y + 6, { radius: 70 + s * 30, life: 0.9, color: col, accent: '#fff4c9', glyphs: 8 + s * 2 });
      G.fx.column(p.x, p.y, { height: 200 + s * 40, width: 40 + s * 8, life: 0.55, color: glow });
      G.audio.sfx('awaken');
    }
    G.fx.flash = Math.min(0.5, 0.1 + s * 0.09);
    G.cam.add(2 + s * 1.7);
    if (s >= 2) G.cam.punch(1.0 + s * 0.012);
    if (s >= 3) G.main.hitstop(0.03 + s * 0.02);
    if (s >= 4) G.main.slowmo(0.45, 0.5);
    const name = sig ? sig.name : '灯火';
    G.ui.announce(`灯火 ${'★'.repeat(s)}`, `${name}の加護が高まる ― 効果と範囲が増す`);
    G.fx.text(p.x, p.y - 42, `灯 ${s}段`, col, 13 + s * 2);
  };

  ENT.chargeLampAt = (x, y, amount) => {
    const run = G.run;
    if (!run || !amount) return;
    let best = null, bd = Infinity;
    for (const t of run.toros) {
      if (t.dead) continue;
      const d2 = G.dist2(x, y, t.x, t.y);
      const lr = lampRadius(t);
      if (d2 < lr * lr && d2 < bd) { best = t; bd = d2; }
    }
    if (!best) return;
    const guardLv = run.talents.himori || 0;
    const gainMul = [1, 1.25, 1.5, 2][guardLv];
    best.charge += amount * gainMul;
    if (best.charge >= D.LAMP.chargeNeed && best.surgeT <= 0) {
      best.charge -= D.LAMP.chargeNeed;
      ENT.lampSurge(best);
    }
  };

  ENT.lampSurge = t => {
    const run = G.run;
    const p = run.player;
    const sigil = D.LAMP_SIGILS[t.sigil];
    if (!sigil) return;
    const radius = lampRadius(t);
    t.surgeT = 0.7;
    t.hp = Math.min(t.maxHp, t.hp + t.maxHp * 0.18);
    G.audio.sfx('lampflare');
    G.fx.powerBurst(t.x, t.y - 6, {
      radius: radius * 1.15, life: 0.82, color: sigil.color, accent: '#ffffff',
      glyphs: 10, height: radius * 1.4, width: 46, particles: 20, sparks: 15, screen: 0.3,
    });
    G.fx.ring(t.x, t.y, { r0: 12, r1: radius * 1.12, life: 0.55, color: sigil.glow, width: 6 });
    G.fx.puffRing(t.x, t.y, sigil.glow, 18, 310);
    G.fx.text(t.x, t.y - 42, `${sigil.name}・満`, sigil.color, 17);
    G.fx.flash = Math.min(0.32, G.fx.flash + 0.1);
    G.cam.punch(1.025);

    if (t.sigil === 'koubou') {
      G.grid.queryCircle(t.x, t.y, radius * 1.08, G.QBUF2);
      const buf = G.QBUF2.slice();   // 撃破時のQBUF2再queryによる反復破壊を防ぐ
      for (let q = 0; q < buf.length; q++) {
        const e = buf[q];
        const a = G.angleTo(t.x, t.y, e.x, e.y);
        ENT.damageEnemy(e, (e.boss ? 70 : 150) * G.sys.effMight(), {
          src: '灯火', lampBurst: true, kb: 520, kx: Math.cos(a), ky: Math.sin(a),
        });
      }
    } else if (t.sigil === 'seiran') {
      const pullR2 = 540 * 540;
      for (const g of run.gem.act) {
        if (G.dist2(g.x, g.y, t.x, t.y) < pullR2) g.attract = true;
      }
      run.skill.cdT = Math.max(0, run.skill.cdT - 3.5);
      run.wardCdT = Math.max(0, run.wardCdT - 3.5);
      G.fx.soul(t.x, t.y, 16);
    } else {
      if (G.dist2(p.x, p.y, t.x, t.y) < radius * radius * 1.3) {
        p.hp = Math.min(p.stats.maxHp, p.hp + 24);
        run.buffs.kongo = Math.max(run.buffs.kongo, 1.8);
      }
      for (let i = run.ep.act.length - 1; i >= 0; i--) {
        const o = run.ep.act[i];
        if (G.dist2(o.x, o.y, t.x, t.y) < radius * radius) {
          G.fx.spark(o.x, o.y, sigil.color, 3, 90, 0.25);
          run.ep.releaseAt(i);
        }
      }
    }
  };

  // 三つの灯紋を巡るたび大祝福。探索そのものがランの山場になる。
  ENT.lampBlessing = () => {
    const run = G.run;
    const p = run.player;
    run.lampBlessings++;
    G.audio.sfx('awaken');
    G.ui.announce('三灯共鳴', '紅・蒼・白――夜が退く');
    G.fx.flash = Math.min(0.4, G.fx.flash + 0.28);
    G.cam.add(5);
    G.main.hitstop(0.06);
    G.main.slowmo(0.5, 0.35);
    G.fx.powerBurst(p.x, p.y, {
      radius: 470, life: 1.15, color: '#ffce79', accent: '#ffffff',
      glyphs: 12, height: 430, width: 92, particles: 28, sparks: 22, screen: 0.68,
    });
    G.fx.ring(p.x, p.y, { r0: 30, r1: 460, life: 0.6, color: 'rgba(255,228,170,0.95)', width: 6 });
    G.fx.ring(p.x, p.y, { r0: 14, r1: 280, life: 0.45, color: 'rgba(255,245,220,0.9)' });
    G.fx.puffRing(p.x, p.y, 'rgba(255,214,150,0.9)', 20, 420);
    for (let i = run.en.act.length - 1; i >= 0; i--) {
      const e = run.en.act[i];
      if (e.dead || !G.cam.onScreen(e.x, e.y, 80)) continue;
      const a = G.angleTo(p.x, p.y, e.x, e.y);
      ENT.damageEnemy(e, (e.boss ? 80 : 220) * G.sys.effMight(), { src: '灯火', kb: 480, kx: Math.cos(a), ky: Math.sin(a) });
    }
    p.hp = Math.min(p.stats.maxHp, p.hp + 30);
    run.buffs.aratama = Math.max(run.buffs.aratama, 6);   // 威力2倍 (effMight が参照)
  };

  // 結界札を足元に打つ: 光+鈍足+継続ダメージ+敵弾消去。クールタイム制
  ENT.placeWard = () => {
    const run = G.run;
    const p = run.player;
    if (!p.alive) return false;
    if (run.wardCdT > 0) { G.audio.sfx('deny'); return false; }
    const W = D.WARD;
    run.wardCdT = run.wardCdMax || W.cd;
    run.wards.push({ x: p.x, y: p.y, r: W.r, life: W.life, maxLife: W.life, tickT: 0, t: 0 });
    if (run.wards.length > 8) run.wards.shift();
    G.audio.sfx('reveal');
    G.fx.ring(p.x, p.y, { r0: 10, r1: W.r, life: 0.45, color: 'rgba(255,224,170,0.9)', width: 3 });
    G.fx.spark(p.x, p.y - 6, '#ffd9a8', 8, 150, 0.3);
    G.cam.add(2);
    return true;
  };

  ENT.updateWards = h => {
    const run = G.run;
    const W = D.WARD;
    if (run.wardCdT > 0) run.wardCdT -= h;
    if (!run.wards.length) return;
    const might = G.sys.effMight();
    const ep = run.ep;
    for (let i = run.wards.length - 1; i >= 0; i--) {
      const w = run.wards[i];
      w.t += h;
      w.life -= h;
      if (w.life <= 0) {
        G.fx.spark(w.x, w.y, 'rgba(255,200,150,0.7)', 6, 100, 0.4);
        run.wards.splice(i, 1);
        continue;
      }
      // 結界に触れた敵弾を祓う (毎フレーム)
      for (let q = ep.act.length - 1; q >= 0; q--) {
        const o = ep.act[q];
        if (G.dist2(o.x, o.y, w.x, w.y) < w.r * w.r) {
          G.fx.spark(o.x, o.y, 'rgba(255,214,150,0.9)', 3, 90, 0.25);
          ep.releaseAt(q);
        }
      }
      w.tickT -= h;
      if (w.tickT <= 0) {
        w.tickT += W.tick;
        G.grid.queryCircle(w.x, w.y, w.r, G.QBUF2);
        const buf = G.QBUF2.slice();   // 撃破時のQBUF2再queryによる反復破壊を防ぐ
        for (let q = 0; q < buf.length; q++) {
          const e = buf[q];
          e.slowT = 0.6; e.slowF = W.slow;
          ENT.damageEnemy(e, W.dmg * might, { src: '結界' });
        }
        ENT.hitToros(w.x, w.y, w.r);
        if (G.chance(0.6) && G.cam.onScreen(w.x, w.y, 80)) G.fx.ember(w.x, w.y, 'rgba(255,214,150,0.8)');
      }
    }
  };

  // ---------------- player ----------------
  ENT.updatePlayer = h => {
    const run = G.run;
    const p = run.player;
    if (!p.alive) return;
    p.animT += h / G.ANIM_T;   // モーション尺を伸ばす (フレーム送り専用の蓄積値。挙動には未使用)
    p.attackT = Math.max(0, p.attackT - h);
    p.castT = Math.max(0, p.castT - h);
    p.hurtAnimT = Math.max(0, p.hurtAnimT - h);

    let ax, ay;
    if (G.debug && G.debug.autoplay) {
      [ax, ay] = ENT.autopilotAxis();
    } else {
      [ax, ay] = G.input.axis();
    }
    p.moveX = ax; p.moveY = ay;
    p.walking = !!(ax || ay);
    // 澄心の弓懸: 静止時間を蓄積 (2s で最大)。動いたら即リセット
    if (p.walking) p.stillT = 0;
    else {
      const was = p.stillT;
      p.stillT = Math.min(p.stillT + h, 2);
      if (p.stats.still > 0 && was < 2 && p.stillT >= 2) {
        G.fx.ring(p.x, p.y - 6, { r0: 6, r1: 36, life: 0.3, color: 'rgba(154,216,200,0.85)', width: 2 });
        G.audio.sfx('tick');
      }
    }
    // 技の合間 (CD) 消化 + 翔(共通ダッシュ斬り抜け)の突進
    if (run.skill.cdT > 0) run.skill.cdT -= h;
    if (run.dashCdT > 0) run.dashCdT -= h;   // 翔(共通ダッシュ)のCD
    if (run.talentState.utsusemi > 0) run.talentState.utsusemi -= h;
    if (p.dashT > 0) {
      p.dashT -= h;
      p.x += p.dashX * 760 * h;
      p.y += p.dashY * 760 * h;
      // 斬り抜け: 通過した妖を裂いて薙ぎ飛ばす (1体1回)。残像を曳く
      const dmg = (p.dashDmg || run.skill.eff.dashDmg || run.skill.eff.dmg || 26) * G.sys.effMight();
      G.grid.queryCircle(p.x, p.y, p.r + 20, G.QBUF2);
      const buf = G.QBUF2.slice();   // 撃破時のQBUF2再queryによる反復破壊を防ぐ
      for (let q = 0; q < buf.length; q++) {
        const e = buf[q];
        if (e.boss || e.dead || p.dashHits.indexOf(e.id) >= 0) continue;
        p.dashHits.push(e.id);
        ENT.damageEnemy(e, dmg, { src: '技', kb: 380, kx: p.dashX, ky: p.dashY });
      }
      if (G.chance(0.9)) G.fx.trail(p.x, p.y - 8, 'rgba(168,205,255,0.7)', 6, 0.28);
      if (p.dashT <= 0 && p.dashHits.length >= 3) {
        // 3体以上を抜けた = 連続駆け: 合間を一部還元 + 冴えた手応え
        if (p.dashDmg) run.dashCdT = Math.max(0, (run.dashCdT || 0) - (G.data.DASH_CD || 4.5) * 0.4);   // 翔=連続駆けで翔のCDを還元
        else run.skill.cdT = Math.max(0, run.skill.cdT - run.skill.eff.cd * 0.4);
        G.fx.spark(p.x, p.y - 8, '#bcd6ff', 9, 190, 0.35);
        G.audio.sfx('crit');
      }
    }
    if (p.walking) {
      p.aimX = ax; p.aimY = ay;
      if (ax) p.facing = ax > 0 ? 1 : -1;
      p.bobT += h * 9 / G.ANIM_T;   // 歩行サイクルも同じ尺で伸ばす
    }
    // オートエイム: マウス照準は廃止。立ち止まっている時は最寄りの妖の方を向く(攻撃は全てオートエイム)
    if (!p.walking) {
      const at = G.ent.nearestEnemy(p.x, p.y);
      if (at && Math.abs(at.x - p.x) > 8) p.facing = at.x > p.x ? 1 : -1;
    }
    const darkLv = run.talents.yawatari || 0;
    const darkMove = !run.lampAura.id ? [1, 1.10, 1.18, 1.26][darkLv] : 1;
    const spd = G.PLAYER_SPD * p.stats.speed * darkMove * (run.buffs.shinsoku > 0 ? 1.5 : 1);
    p.x += ax * spd * h;
    p.y += ay * spd * h;
    // 有限マップ: 壁の内側に留める (突進ぶんもここで丸める)
    const hw = G.MAP_W / 2 - G.WALL - p.r, hh = G.MAP_H / 2 - G.WALL - p.r;
    if (p.x < -hw) p.x = -hw; else if (p.x > hw) p.x = hw;
    if (p.y < -hh) p.y = -hh; else if (p.y > hh) p.y = hh;

    if (p.hurtT > 0) p.hurtT -= h;
    const rsig = run.lampStage > 0 ? (run.lampAura.id || run.lampLastId) : null;   // 残り火対応
    const lampRegen = rsig === 'byakuren' ? 1.8 * (run.lampPow || 1) : 0;
    const allLitRegen = run.allLit ? D.LAMP_ALLLIT.regen : 0;   // 灯明満ち
    if (p.stats.regen > 0 || lampRegen > 0 || allLitRegen > 0) {
      p.hp = Math.min(p.stats.maxHp, p.hp + (p.stats.regen + lampRegen + allLitRegen) * h);
    }
    // 白灯/灯明満ちの回復は緑の癒し粒で可視化(「灯りで回復している」を体感させる)。回復中=HP満タンでない時のみ
    if ((lampRegen > 0 || allLitRegen > 0) && p.hp < p.stats.maxHp && G.chance(0.5)) G.fx.ember(p.x + G.rand(-9, 9), p.y - 4, 'rgba(150,240,176,0.9)');

    // combo decay
    if (run.combo > 0) {
      run.comboT -= h;
      if (run.comboT <= 0) { run.combo = 0; run.comboNext = 0; }
    }
    if (run.comboPop > 0) run.comboPop -= h;

    // temporary blessings tick down
    for (const k in run.buffs) {
      if (run.buffs[k] > 0) {
        run.buffs[k] -= h;
        if (run.buffs[k] <= 0) {
          run.buffs[k] = 0;
          if (k === 'bunshin') G.sys.rebuildFoxes();
        } else if (G.chance(0.16)) {
          G.fx.ember(p.x, p.y, G.data.BUFFS[k].glow);
        }
      }
    }
    // high combo: the exorcist burns
    if (run.combo >= 100 && G.chance(run.combo >= 300 ? 0.45 : 0.22)) {
      G.fx.ember(p.x, p.y, run.combo >= 300 ? 'rgba(255,246,220,0.95)' : 'rgba(255,209,102,0.85)');
    }

    // low-HP heartbeat
    if (p.hp / p.stats.maxHp < 0.3) {
      p.heartT -= h;
      if (p.heartT <= 0) {
        p.heartT = 0.9;
        G.audio.sfx('heart');
      }
    } else {
      p.heartT = 0;
    }
  };

  // debug autopilot: flee dense enemies, drift toward gems
  ENT.autopilotAxis = () => {
    const run = G.run;
    const p = run.player;
    let fx = 0, fy = 0;
    const en = run.en.act;
    for (let i = 0; i < en.length; i++) {
      const e = en[i];
      if (e.dead) continue;
      const dx = p.x - e.x, dy = p.y - e.y;
      const d2 = dx * dx + dy * dy;
      const danger = e.boss ? 240 : 170;
      if (d2 < danger * danger && d2 > 1) {
        const d = Math.sqrt(d2);
        const w = (danger - d) / danger;
        fx += dx / d * w * (e.boss ? 3 : 1);
        fy += dy / d * w * (e.boss ? 3 : 1);
      }
    }
    const ep = run.ep.act;
    for (let i = 0; i < ep.length; i++) {
      const o = ep[i];
      const dx = p.x - o.x, dy = p.y - o.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 90 * 90 && d2 > 1) {
        const d = Math.sqrt(d2);
        fx += dx / d * (90 - d) / 90 * 1.6;
        fy += dy / d * (90 - d) / 90 * 1.6;
      }
    }
    const danger = Math.hypot(fx, fy);
    if (danger < 0.8) {
      // chest within reach takes priority over gems
      let chest = null, cbd = 720 * 720;
      for (const c of run.chests) {
        if (c.opened) continue;
        const d2 = G.dist2(p.x, p.y, c.x, c.y);
        if (d2 < cbd) { cbd = d2; chest = c; }
      }
      if (chest) {
        const [nx, ny] = G.norm(chest.x - p.x, chest.y - p.y);
        fx += nx * 0.7; fy += ny * 0.7;
        return G.norm(fx, fy);
      }
      // safe-ish: head to nearest gem
      let best = null, bd = 520 * 520;
      const gs = run.gem.act;
      for (let i = 0; i < gs.length; i++) {
        const g = gs[i];
        const d2 = G.dist2(p.x, p.y, g.x, g.y);
        if (d2 < bd) { bd = d2; best = g; }
      }
      if (best) {
        const [nx, ny] = G.norm(best.x - p.x, best.y - p.y);
        fx += nx * 0.6; fy += ny * 0.6;
      } else {
        fx += Math.cos(run.t * 0.4) * 0.4;
        fy += Math.sin(run.t * 0.31) * 0.4;
      }
    }
    return G.norm(fx, fy);
  };

  ENT.nearestEnemy = (x, y, maxD = 1e9) => {
    const run = G.run;
    let best = null, bd = maxD * maxD;
    const en = run.en.act;
    for (let i = 0; i < en.length; i++) {
      const e = en[i];
      if (e.dead) continue;
      const d2 = G.dist2(x, y, e.x, e.y);
      if (d2 < bd) { bd = d2; best = e; }
    }
    return best;
  };

  // ---------------- enemy update ----------------
  ENT.updateEnemies = h => {
    const run = G.run;
    const p = run.player;
    const pool = run.en;
    run.dir.frame++;
    const sepFrame = run.dir.frame & 1;

    // rebuild spatial grid
    G.grid.clear();
    for (let i = 0; i < pool.act.length; i++) {
      const e = pool.act[i];
      if (!e.dead) G.grid.insert(e);
    }

    // 灯りの圏内 = 攻めどころ。生きてる据置提灯と結界札の光を集める (画面内のみ → 数個で軽い)
    const lit = _litBuf; lit.length = 0;
    for (let i = 0; i < run.toros.length; i++) {
      const t = run.toros[i];
      if (t.dead || !G.cam.onScreen(t.x, t.y, G.LAMP_R)) continue;
      const lr = lampRadius(t);
      lit.push(t.x, t.y, lr * lr, t.sigil);
    }
    for (let i = 0; i < run.wards.length; i++) {
      const w = run.wards[i];
      if (!G.cam.onScreen(w.x, w.y, w.r)) continue;
      lit.push(w.x, w.y, w.r * w.r, 'ward');
    }

    for (let i = pool.act.length - 1; i >= 0; i--) {
      const e = pool.act[i];
      if (e.dead) { pool.releaseAt(i); continue; }
      e.t += h;
      e.animT += h;
      const animSpd = e.cfg.anim || 0.3;
      if (e.animT > animSpd) { e.animT -= animSpd; e.frame ^= 1; }
      if (e.flash > 0) e.flash -= h;
      if (e.squashT > 0) e.squashT -= h;
      if (e.bossAttackT > 0) e.bossAttackT -= h;
      if (e.bossCastT > 0) e.bossCastT -= h;
      if (e.bossHurtT > 0) e.bossHurtT -= h;
      if (e.bossRageT > 0) e.bossRageT -= h;
      if (e.slowT > 0) e.slowT -= h;
      if (e.feared > 0) e.feared -= h;
      if (e.rootT > 0) e.rootT -= h;
      if (e.markT > 0) e.markT -= h;
      if (e.curseT > 0) e.curseT -= h;
      if (e.shockT > 0) e.shockT -= h;          // 雷柵: 感電状態
      if (e.shockPropT > 0) e.shockPropT -= h;  // 雷柵: 伝播クールダウン
      if (e.hmark > 0) { e.hmarkT -= h; if (e.hmarkT <= 0) e.hmark = 0; }   // 祓印: 持続切れで消える
      if (e.atkCd > 0) e.atkCd -= h;   // 突進/範囲攻撃の再使用クールダウン

      if (e._preview && G.test) { G.test.unit(e, h); continue; }   // テストステージ: AIを止め陳列(モーション巡回/吹っ飛び/スロット復帰のみ)

      const slowMul = e.slowT > 0 ? 1 - e.slowF : 1;

      // 灯りの圏内に踏み入った妖は怯む (鈍足)。被ダメ増は damageEnemy 側で e.lit を見る
      e.lit = false;
      e.litSigil = null;
      if (lit.length && !e.boss) {
        for (let li = 0; li < lit.length; li += 4) {
          if (G.dist2(e.x, e.y, lit[li], lit[li + 1]) < lit[li + 2]) {
            e.lit = true;
            e.litSigil = lit[li + 3];
            break;
          }
        }
      }

      if (e.boss) {
        updateBoss(e, h, p);
      } else {
        const dx = p.x - e.x, dy = p.y - e.y;
        const dist = Math.hypot(dx, dy) || 1;
        const nx = dx / dist, ny = dy / dist;
        const mv = e.cfg.move;
        const lightSlow = e.lit
          ? Math.max(0.12, 1 - 0.5 * (1 - (D.LAMP_SIGILS[e.litSigil] ? D.LAMP_SIGILS[e.litSigil].enemySlow : 0.55)) * (run.lampPow || 1))   // 鈍足効果を半減(2026-06-24)
          : 1;
        let sp = e.spd * slowMul * lightSlow;

        if (e.rootT > 0) {
          // 影縫い: 影を縫い留められ、その場から動けない
          e.vx = 0; e.vy = 0;
        } else if (e.feared > 0) {
          // 雄叫び: 恐慌してプレイヤーから逃げ散る
          e.vx = -nx * sp * 1.25; e.vy = -ny * sp * 1.25;
        } else if (mv === 'chase') {
          e.vx = nx * sp; e.vy = ny * sp;
        } else if (mv === 'sine') {
          const s = Math.sin(e.t * 4.2 + e.phase) * 0.55;
          e.vx = (nx - ny * s) * sp;
          e.vy = (ny + nx * s) * sp;
        } else if (mv === 'drift') {
          const k = 1 - Math.exp(-2.2 * h);
          e.vx += (nx * sp - e.vx) * k;
          e.vy += (ny * sp - e.vy) * k;
        } else if (mv === 'hop') {
          e.hopT -= h;
          if (e.hopT <= 0) {
            if (e.hopping) { e.hopping = 0; e.hopT = G.rand(0.4, 0.7); e.vx = 0; e.vy = 0; }
            else { e.hopping = 1; e.hopT = 0.38; e.vx = nx * sp * 2.3; e.vy = ny * sp * 2.3; }
          }
          if (!e.hopping) { e.vx *= 0.8; e.vy *= 0.8; }
        } else if (mv === 'ranged') {
          const shot = e.cfg.shot;
          if (dist > shot.range) { e.vx = nx * sp; e.vy = ny * sp; }
          else {
            const strafe = Math.sin(e.t * 1.4 + e.phase) > 0 ? 1 : -1;
            e.vx = -ny * sp * 0.5 * strafe - nx * sp * 0.12;
            e.vy = nx * sp * 0.5 * strafe - ny * sp * 0.12;
          }
          e.fireT -= h;
          if (e.fireT <= 0 && dist < shot.range * 1.5 && G.cam.onScreen(e.x, e.y, 80)) {
            e.fireT = shot.cd * G.rand(0.9, 1.15);
            ENT.spawnOrb(e.x, e.y, nx * shot.speed, ny * shot.speed, shot.dmg * D.dmgScale(run.clock * D.TIME_COMP), e.type);
          }
        } else if (mv === 'swoop') {
          // 直進飛行。壁に当たったら下のクランプ処理で player へ再照準
        } else if (mv === 'douse') {
          // 最寄りの生きた提灯へ走り、近づいたら油を舐めて消灯させる
          let lamp = null, bd = Infinity;
          const lamps = run.toros;
          for (let li = 0; li < lamps.length; li++) {
            const lp = lamps[li];
            if (lp.dead) continue;
            const d2 = G.dist2(e.x, e.y, lp.x, lp.y);
            const lure = 1 + (lp.charge / D.LAMP.chargeNeed) * 1.4;
            const score = d2 / lure;   // 灯勢の高い提灯ほど油赤子を引き寄せる
            if (score < bd) { bd = score; lamp = lp; }
          }
          if (lamp) {
            const ldx = lamp.x - e.x, ldy = lamp.y - e.y;
            const ld = Math.hypot(ldx, ldy) || 1;
            if (ld > 26) {
              e.vx = ldx / ld * sp; e.vy = ldy / ld * sp;
            } else {
              e.vx = 0; e.vy = 0;
              const guardLv = run.talents.himori || 0;
              const warding = [0, 0.2, 0.35, 0.5][guardLv];
              lamp.hp -= e.douse * (1 - warding) * h;
              lamp.douseT = 0.5;   // 消火中: 描画で赤い警告環
              if (!lamp.warned && G.cam.onScreen(lamp.x, lamp.y)) {   // 初撃で一度だけ「守れ」と報せる
                lamp.warned = run.t;
                G.fx.text(lamp.x, lamp.y - 32, '灯が消される!', '#ff6a4c', 14);
              } else if (lamp.warned && run.t - lamp.warned > 6) lamp.warned = 0;
              if (G.chance(0.25)) G.fx.ember(lamp.x + G.rand(-6, 6), lamp.y - 8, 'rgba(120,210,150,0.85)');
              if (lamp.hp <= 0) {
                lamp.dead = true;
                lamp.hp = 0;
                lamp.ignite = 0;
                lamp.relightT = D.LAMP.relightLock;
                lamp.charge = Math.max(0, lamp.charge - 8);
                G.audio.sfx('lampout');
                G.fx.spark(lamp.x, lamp.y - 10, 'rgba(120,200,150,0.9)', 12, 150);
                G.fx.puffRing(lamp.x, lamp.y, 'rgba(40,60,50,0.85)', 8, 130);
                if (G.cam.onScreen(lamp.x, lamp.y)) G.fx.text(lamp.x, lamp.y - 22, '灯り消ゆ', '#9fd6b0', 14);
              }
            }
          } else {
            e.vx = nx * sp; e.vy = ny * sp;   // 提灯が尽きたらプレイヤーへ向かう
          }
        } else if (mv === 'charge') {
          // 急な突進: 追尾 → 間合いで溜め(進路を予告) → 高速で突っ込み → 硬直
          const c = e.cfg.charge;
          if (e.atk === 0) {
            e.vx = nx * sp; e.vy = ny * sp;
            if (e.atkCd <= 0 && dist < c.range && dist > 36 && G.cam.onScreen(e.x, e.y, 60)) {
              e.atk = 1; e.atkMax = c.wind * D.TELE_WIND_MUL; e.atkT = e.atkMax; e.dirx = nx; e.diry = ny;
            }
          } else if (e.atk === 1) {            // 溜め: 仰け反って狙う(直前まで再照準=完全な避け得は許さない)
            e.vx = -nx * sp * 0.35; e.vy = -ny * sp * 0.35;
            e.atkT -= h;
            if (e.atkT > 0.14) { e.dirx = nx; e.diry = ny; }
            if (e.atkT <= 0) {
              e.atk = 2; e.atkT = c.time; e.dvx = e.dirx * c.spd; e.dvy = e.diry * c.spd;
              if (G.cam.onScreen(e.x, e.y, 60)) { G.audio.sfx('dash'); G.fx.spark(e.x, e.y, '#ff8a4a', 6, 210, 0.25); }
            }
          } else if (e.atk === 2) {            // 突進
            e.vx = e.dvx; e.vy = e.dvy;
            e.atkT -= h;
            if (G.chance(0.6) && G.cam.onScreen(e.x, e.y, 40)) G.fx.trail(e.x, e.y, 'rgba(255,110,60,0.5)', e.r * 0.7, 0.2);
            if (e.atkT <= 0) { e.atk = 3; e.atkT = 0.5; }
          } else {                              // 硬直(隙)
            e.vx *= 0.82; e.vy *= 0.82;
            e.atkT -= h;
            if (e.atkT <= 0) { e.atk = 0; e.atkCd = c.cd * G.rand(0.85, 1.2); }
          }
        } else if (mv === 'slam') {
          // 遠距離範囲攻撃: 間合いを保つ砲撃手 → 詠唱で着弾円を予告 → 着弾 → 硬直。
          // 防ぎ方は2択: 円から歩いて出る or 結界札(run.wards)の内側に籠る。予告中に倒せば不発。
          const c = e.cfg.slam;
          if (e.atk === 0) {
            if (dist > c.range * 1.15) { e.vx = nx * sp; e.vy = ny * sp; }          // 遠ければ寄る
            else if (dist < c.range * 0.7) { e.vx = -nx * sp * 0.9; e.vy = -ny * sp * 0.9; }  // 近すぎれば退く
            else { const sf = Math.sin(e.t * 1.2 + e.phase) > 0 ? 1 : -1; e.vx = -ny * sp * 0.45 * sf; e.vy = nx * sp * 0.45 * sf; }  // 横移動
            if (e.atkCd <= 0 && dist < c.range * 1.6 && G.cam.onScreen(e.x, e.y, 80)) {
              e.atk = 1; e.atkMax = c.wind * D.TELE_WIND_MUL; e.atkT = e.atkMax;
              e.aoeX = p.x; e.aoeY = p.y;   // 着弾点をこの瞬間に固定 → 歩いて避けられる
            }
          } else if (e.atk === 1) {            // 詠唱: 静止して予告(無防備)
            e.vx = 0; e.vy = 0;
            e.atkT -= h;
            if (e.atkT <= 0) {
              e.atk = 3; e.atkT = 0.55;
              // 結界札の内側に居れば着弾を防ぐ(籠城。結界が砲撃を弾く)
              let warded = false;
              for (let wi = 0; wi < run.wards.length; wi++) {
                const w = run.wards[wi];
                if (G.dist2(p.x, p.y, w.x, w.y) < w.r * w.r) { warded = true; break; }
              }
              const inAoe = p.alive && G.dist2(p.x, p.y, e.aoeX, e.aoeY) < c.r * c.r;
              if (inAoe && !warded) ENT.damagePlayer(e.dmg * (c.dmgMul || 1.5), e.type);
              if (G.cam.onScreen(e.aoeX, e.aoeY, c.r)) {
                G.fx.ring(e.aoeX, e.aoeY, { r0: c.r * 0.35, r1: c.r, life: 0.4, color: 'rgba(255,90,40,0.95)', width: 5 });
                G.fx.shards(e.aoeX, e.aoeY, 'rgba(255,150,60,0.9)', 12, 280, 0.4);
                G.fx.spark(e.aoeX, e.aoeY, '#ff9a3a', 14, 280, 0.35);
                if (run.t >= _boomT) { _boomT = run.t + juiceGap(0.1); G.cam.add(2.2); G.main.hitstop(0.03); }   // 揺れは時間ゲートで間引く
              }
              if (inAoe && warded && G.cam.onScreen(p.x, p.y, 40)) {   // 結界が弾いた手応え
                G.fx.ring(p.x, p.y, { r0: 14, r1: 40, life: 0.3, color: 'rgba(255,224,170,0.95)', width: 4 });
                G.fx.spark(p.x, p.y, '#ffe0aa', 8, 150, 0.3);
              }
              G.audio.sfx('bang');
            }
          } else {                              // 硬直(隙)
            e.vx *= 0.85; e.vy *= 0.85;
            e.atkT -= h;
            if (e.atkT <= 0) { e.atk = 0; e.atkCd = c.cd * G.rand(0.85, 1.2); }
          }
        } else if (mv === 'volley') {
          // 弾幕(扇): 間合いを保ち、詠唱で狙いを定めて扇状の散弾を一斉発射。予告(扇)中に倒せば不発。
          const c = e.cfg.volley;
          if (e.atk === 0) {
            if (dist > c.range * 1.1) { e.vx = nx * sp; e.vy = ny * sp; }                 // 遠ければ寄る
            else if (dist < c.range * 0.55) { e.vx = -nx * sp; e.vy = -ny * sp; }         // 近すぎれば退く(カイト)
            else { const sf = Math.sin(e.t * 1.3 + e.phase) > 0 ? 1 : -1; e.vx = -ny * sp * 0.5 * sf; e.vy = nx * sp * 0.5 * sf; }
            if (e.atkCd <= 0 && dist < c.range * 1.3 && G.cam.onScreen(e.x, e.y, 80)) {
              e.atk = 1; e.atkMax = c.wind * D.TELE_WIND_MUL; e.atkT = e.atkMax; e.dirx = nx; e.diry = ny;
            }
          } else if (e.atk === 1) {            // 詠唱: 減速して狙う(直前まで再照準)
            e.vx *= 0.6; e.vy *= 0.6; e.atkT -= h;
            if (e.atkT > 0.12) { e.dirx = nx; e.diry = ny; }
            if (e.atkT <= 0) {
              e.atk = 3; e.atkT = 0.5;
              const baseA = Math.atan2(e.diry, e.dirx), div = Math.max(1, c.count - 1);
              const dmg = c.dmg * D.dmgScale(run.clock * D.TIME_COMP);
              for (let s = 0; s < c.count; s++) {
                const a = baseA + (s - (c.count - 1) / 2) * (c.spread / div);
                ENT.spawnOrb(e.x, e.y, Math.cos(a) * c.speed, Math.sin(a) * c.speed, dmg, e.type);
              }
              if (G.cam.onScreen(e.x, e.y, 80)) { G.audio.sfx('shoot', { p: 0.8 }); G.fx.spark(e.x, e.y, '#caa6ff', 8, 200, 0.3); }
            }
          } else {                              // 硬直(隙)
            e.vx *= 0.85; e.vy *= 0.85; e.atkT -= h;
            if (e.atkT <= 0) { e.atk = 0; e.atkCd = c.cd * G.rand(0.85, 1.2); }
          }
        } else if (mv === 'nova') {
          // 弾幕(放射): 近づいて溜め、全方位へ弾を放つ。溜め中に離れれば被弾を減らせる/倒せば不発。
          const c = e.cfg.nova;
          if (e.atk === 0) {
            e.vx = nx * sp; e.vy = ny * sp;     // 近づく
            if (e.atkCd <= 0 && dist < c.range && G.cam.onScreen(e.x, e.y, 80)) {
              e.atk = 1; e.atkMax = c.wind * D.TELE_WIND_MUL; e.atkT = e.atkMax;
            }
          } else if (e.atk === 1) {            // 溜め: 静止して放射状にチャージ(予告)
            e.vx = 0; e.vy = 0; e.atkT -= h;
            if (e.atkT <= 0) {
              e.atk = 3; e.atkT = 0.5;
              const dmg = c.dmg * D.dmgScale(run.clock * D.TIME_COMP), off = Math.random() * G.TAU;
              for (let s = 0; s < c.count; s++) {
                const a = off + s / c.count * G.TAU;
                ENT.spawnOrb(e.x, e.y, Math.cos(a) * c.speed, Math.sin(a) * c.speed, dmg, e.type);
              }
              if (G.cam.onScreen(e.x, e.y, 80)) { G.audio.sfx('bang', { p: 1.1 }); G.fx.ring(e.x, e.y, { r0: 6, r1: 64, life: 0.35, color: 'rgba(180,140,255,0.85)', width: 4 }); G.fx.spark(e.x, e.y, '#b18cff', 12, 240, 0.35); }
            }
          } else {                              // 硬直(隙)
            e.vx *= 0.85; e.vy *= 0.85; e.atkT -= h;
            if (e.atkT <= 0) { e.atk = 0; e.atkCd = c.cd * G.rand(0.85, 1.2); }
          }
        }

        e.x += e.vx * h + e.kbx * h;
        e.y += e.vy * h + e.kby * h;

        // 有限マップ: 壁の内側に留める。swoop は壁で player へ再照準
        const bw = G.MAP_W / 2 - G.WALL - e.r, bh = G.MAP_H / 2 - G.WALL - e.r;
        let hitWall = false;
        if (e.x < -bw) { e.x = -bw; hitWall = true; } else if (e.x > bw) { e.x = bw; hitWall = true; }
        if (e.y < -bh) { e.y = -bh; hitWall = true; } else if (e.y > bh) { e.y = bh; hitWall = true; }
        if (hitWall && mv === 'swoop') {
          const aa = G.angleTo(e.x, e.y, p.x + G.rand(-90, 90), p.y + G.rand(-90, 90));
          e.vx = Math.cos(aa) * e.spd;
          e.vy = Math.sin(aa) * e.spd;
        }
      }

      // knockback decay
      if (e.kbx || e.kby) {
        const dec = Math.pow(0.0001, h);   // strong decay
        e.kbx *= dec; e.kby *= dec;
        if (Math.abs(e.kbx) < 1 && Math.abs(e.kby) < 1) { e.kbx = 0; e.kby = 0; }
      }

      // soft separation (same cell only, alternating frames)
      if (!e.boss && (e.id & 1) === sepFrame) {
        const cellMates = G.grid.cellList(e._cx, e._cy);
        if (cellMates && cellMates.length > 1) {
          let checked = 0;
          for (let j = 0; j < cellMates.length && checked < 3; j++) {
            const o = cellMates[j];
            if (o === e || o.dead || o.boss) continue;
            checked++;
            const ddx = e.x - o.x, ddy = e.y - o.y;
            const rr = e.r + o.r;
            const d2 = ddx * ddx + ddy * ddy;
            if (d2 < rr * rr && d2 > 0.01) {
              const d = Math.sqrt(d2);
              const push = (rr - d) * 0.3;
              e.x += ddx / d * push;
              e.y += ddy / d * push;
              // 相乗「雷柵」: 感電した妖がふっとんで触れた個体に雷が伝播(落雷FX)。伝播先は感電化しない=単発
              if (e.shockT > 0 && e.shockPropT <= 0 && (e.kbx * e.kbx + e.kby * e.kby) > 130 * 130) {
                ENT.damageEnemy(o, e.shockDmg || 20, { src: '雷柵' });
                e.shockPropT = 0.25;   // 伝播クールダウン
                G.fx.bolt(o.x, o.y - 240, o.x, o.y);                                                     // 落雷FX
                G.fx.spark(o.x, o.y, '#9fd8ff', 8, 190, 0.3);
                G.fx.ring(o.x, o.y, { r0: 4, r1: 42, life: 0.25, color: 'rgba(159,216,255,0.85)', width: 2 });
              }
            }
          }
        }
      }

      // contact damage
      if (e.boss && e.touchT > 0) e.touchT -= h;   // ボスは接触ダメージにCD(動き回って密着しても即死しない=機動戦を成立させる)
      if (p.alive) {
        const ho = e.hitOff || 0;   // 接触判定も grid と同じ楕円(横=hitRX, 縦=体半径)に合わせ、見た目の胴体に触れたら当たる
        const rxx = (e.hitRX || e.r) + p.r, ryy = (ho > e.r ? ho + e.r * 0.4 : e.r) + p.r;
        const ddx = e.x - p.x, ddy = e.y - p.y;
        if ((ddx * ddx) / (rxx * rxx) + (ddy * ddy) / (ryy * ryy) <= 1) {
          if (e.boss) {
            if (e.touchT <= 0) { ENT.damagePlayer(e.dmg, e.bossId); e.touchT = 0.5; }
          } else {
            ENT.damagePlayer(e.dmg, e.type);
          }
        }
      }
    }
  };

  // ボス専用の禍々しい爆発。プレイヤーの祓い系FX(sigil/powerBurst/金光/聖句glyphs)は一切使わない=妖気の紅と黒煙のみ
  function bossBurst(x, y, o = {}) {
    const radius = o.radius || 150;
    const col = o.color || 'rgba(225,55,40,0.92)';
    G.fx.ring(x, y, { r0: radius * 0.12, r1: radius, life: o.life || 0.5, color: col, width: o.width || 5 });
    G.fx.ring(x, y, { r0: radius * 0.06, r1: radius * 0.55, life: (o.life || 0.5) * 0.7, color: 'rgba(150,18,40,0.7)', width: 3 });
    G.fx.puffRing(x, y, o.dark || 'rgba(55,8,26,0.85)', o.smoke || 14, radius * 1.5);   // 噴き出す黒煙
    G.fx.spark(x, y, o.ember || '#ff5a3a', o.sparks || 16, radius * 2.0, 0.5);            // 火の粉
    if (G.fx.light) G.fx.light(x, y, { radius: radius * 1.15, life: 0.3, color: col, intensity: 0.7 });
  }
  // ボス近接の演出 (雑魚と差別化: 予告=紅の予兆扇 / 一閃=禍々しい鉤爪の三本掻き。祓いの金光は使わない)
  function bossMeleeTele(e, ang, reach) {
    const tx = e.x + Math.cos(ang) * reach * 0.6, ty = e.y + Math.sin(ang) * reach * 0.6;
    if (G.fx.impact) G.fx.impact(e.x, e.y, ang, 'rgba(255,60,50,0.9)', reach, 5);   // 突進軸に沿った予兆streak(扇/環でなく直線)
    G.fx.spark(tx, ty, '#ff5a3a', 8, 160, 0.4);
    if (G.fx.light) G.fx.light(e.x, e.y, { radius: reach * 0.5, life: 0.42, color: 'rgba(200,30,40,0.9)', intensity: 0.6 });   // 妖気が満ちる
  }
  function bossMeleeFx(e, ang, reach) {
    const mx = e.x + Math.cos(ang) * reach * 0.55, my = e.y + Math.sin(ang) * reach * 0.55;
    if (G.fx.impact) {   // 鉤爪の三本掻き: 進行方向へ紅の閃光streakを扇状に
      for (let i = -1; i <= 1; i++) {
        const off = i * 0.26, px = e.x + Math.cos(ang + off) * reach * 0.5, py = e.y + Math.sin(ang + off) * reach * 0.5;
        G.fx.impact(px, py, ang, i === 0 ? 'rgba(255,80,60,0.98)' : 'rgba(200,30,40,0.9)', reach * 0.7, 6);
      }
    }
    G.fx.ring(e.x, e.y, { r0: 12, r1: reach, life: 0.32, color: 'rgba(235,45,35,0.92)', width: 6 });   // 衝撃波
    G.fx.spark(mx, my, '#ff5a3a', 18, 340, 0.5);                                                         // 火の粉
    if (G.fx.shards) G.fx.shards(mx, my, 'rgba(120,15,30,0.9)', 8, 200, 0.42);                           // 砕けた妖気の破片
    bossBurst(mx, my, { radius: reach * 0.5, color: 'rgba(225,40,35,0.92)', life: 0.4, smoke: 10, sparks: 8 });
  }

  const BOSS_FX_COLOR = {
    tanuki: '#a8dc78', nure: '#72d6e6', tsuchigumo: '#d08a52',
    nue: '#b28cff', daitengu: '#dcecff', ushi: '#ff8b55',
    ogama: '#72d8aa', gasha: '#f0dfc2', shuten: '#ff5848',
  };

  // ---------------- ボス共通: 予告付きの多彩な攻撃 (遅延弾幕 / レーザー / 多重範囲) ----------------
  // 予告付き遅延発火: warn秒テレグラフを出してから fn() を実行 (弾幕等を「予告→発射」にする)
  function bossCast(e, warn, fn, tele) {
    const w = G.data.BOSS_TELE_T || (warn * (G.data.BOSS_WIND_MUL || 1));   // 予告→発生を全攻撃で統一(個別warnは無視)
    if (tele && Number.isFinite(tele.ang)) {
      e._face = Math.cos(tele.ang) > 0 ? 1 : 0;
      e._faceT = G.run.t;
    }
    e.bossCastT = Math.max(e.bossCastT || 0, w);   // 予告ポーズ(telegraph)を windup と同じ長さに揃える
    e.plantT = Math.max(e.plantT || 0, w + 0.18);
    e.acts.push({ t: w, warn: w, fn, tele: tele || null });
  }
  // 点と線分の距離 (レーザー命中判定)
  function distToSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    let t = ((px - ax) * dx + (py - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  }
  // レーザーを1本仕込む (warn=予告線, fire=照射, sweep=照射中の回転rad/s)
  function bossBeam(e, ang, o = {}) {
    const w = G.data.BOSS_TELE_T || ((o.warn || 0.9) * (G.data.BOSS_WIND_MUL || 1)), fire = o.fire || 0.6;   // 予告線→照射の猶予を統一
    e._face = Math.cos(ang) > 0 ? 1 : 0;
    e._faceT = G.run.t;
    if (fire >= 0.3) e.plantT = Math.max(e.plantT || 0, w + fire);   // 実レーザー詠唱/照射中は静止(突進予告 fire~0.01 は除外)
    const sweep = o.sweep || 0;
    e.beams.push({
      ang, startAng: ang, endAng: ang + sweep * fire,
      t: 0, warn: w, fire, len: o.len || 1300, half: o.half || 26,
      sweep, dmgMul: o.dmgMul || 0.9, col: o.col || '#ff5a3a', hitCd: 0, fxT: 0,
    });
  }
  function bossActionActive(e) {
    return e.comboActive || e.bstate !== 'chase' || e.plantT > 0
      || e.bossCastT > 0 || e.bossAttackT > 0
      || e.meleeWind > 0 || e.meleeLungeT > 0
      || (e.acts && e.acts.length) || (e.beams && e.beams.length) || (e.strikes && e.strikes.length);
  }
  function bossCanStart(e) {
    return !e._actionFrameBlocked && (e.attackLock || 0) <= 0 && !bossActionActive(e);
  }
  function finishBossCombo(e, recovery = 1.2) {
    e.comboActive = false;
    e.comboName = '';
    e.attackLock = Math.max(e.attackLock || 0, recovery);
  }
  function startShutenCombo(e, p) {
    e.comboActive = true;
    e.comboName = '鬼宴・三献';
    G.ui.announce('鬼宴・三献', '輪弾 → 扇射 → 紅蓮落とし');
    G.audio.sfx('bossroar', { p: 0.72 });
    bossCast(e, 0.62, () => {
      e.bossAttackT = 0.42;
      for (let i = 0; i < 14; i++) {
        const a = i / 14 * G.TAU + e.t * 0.35;
        ENT.spawnOrb(e.x, e.y,Math.cos(a) * 150, Math.sin(a) * 150, e.dmg * 0.42, e.bossId);
      }
      const fa = Math.atan2(p.y - e.y, p.x - e.x);
      bossCast(e, 0.48, () => {
        e.bossAttackT = 0.38;
        for (let k = -3; k <= 3; k++) {
          const a = fa + k * 0.2;
          ENT.spawnOrb(e.x, e.y,Math.cos(a) * 205, Math.sin(a) * 205, e.dmg * 0.42, e.bossId);
        }
        const wt = G.data.BOSS_TELE_T || (0.72 * (G.data.BOSS_WIND_MUL || 1));
        bossCast(e, 0.58, () => {
          for (let i = 0; i < 5; i++) {
            const a = i / 5 * G.TAU;
            e.strikes.push({
              x: p.x + Math.cos(a) * 105, y: p.y + Math.sin(a) * 105,
              t: wt, warn: wt, kind: 'doom', r: 68, col: '#ff5b42', dmgMul: 0.72,
            });
          }
          finishBossCombo(e, 1.6);
        }, { kind: 'radial', r: 190 });
      }, { kind: 'cone', ang: fa, half: 0.82, r: 300 });
    }, { kind: 'radial', r: 170 });
  }
  function startTenguCombo(e, p) {
    e.comboActive = true;
    e.comboName = '天狗颪・返し風';
    G.ui.announce('天狗颪・返し風', '疾風刃の後、退路に竜巻');
    const fa = Math.atan2(p.y - e.y, p.x - e.x);
    bossCast(e, 0.48, () => {
      e.bossAttackT = 0.35;
      for (let k = -3; k <= 3; k++) {
        const a = fa + k * 0.19;
        ENT.spawnOrb(e.x, e.y, Math.cos(a) * 220, Math.sin(a) * 220, e.dmg * 0.44, e.bossId);
      }
      const wt = G.data.BOSS_TELE_T || (0.68 * (G.data.BOSS_WIND_MUL || 1));
      bossCast(e, 0.52, () => {
        const side = G.chance(0.5) ? 1 : -1;
        for (let i = -1; i <= 1; i++) {
          const a = fa + Math.PI + side * (0.45 + i * 0.32);
          e.strikes.push({
            x: p.x + Math.cos(a) * (105 + Math.abs(i) * 35),
            y: p.y + Math.sin(a) * (105 + Math.abs(i) * 35),
            t: wt, warn: wt, kind: 'tornado', r: 62, col: '#d8e8ff', dmgMul: 0.68,
          });
        }
        finishBossCombo(e, 1.35);
      }, { kind: 'cone', ang: fa + Math.PI, half: 0.9, r: 235 });
    }, { kind: 'cone', ang: fa, half: 0.78, r: 300 });
  }
  // 大技: 掃射レーザー / 十字レーザー(同時多数) / 多重同時範囲 を予告付きで撃つ (全ボス共通)
  function triggerGrand(e, p) {
    const base = Math.atan2(p.y - e.y, p.x - e.x);
    const pick = (Math.random() * 3) | 0;
    if (pick === 0) {                 // 掃射レーザー: 予告線→扇状に薙ぐ照射
      const dir = G.chance(0.5) ? 1 : -1;
      bossBeam(e, base - dir * 0.7, { warn: 1.0, fire: 1.5, sweep: dir * 0.95, half: 30, dmgMul: 1.0, col: '#ff5a3a' });
      e.bossCastT = Math.max(e.bossCastT, 1.0); G.audio.sfx('bossroar', { p: 0.85 });
    } else if (pick === 1) {          // 十字/星レーザー: 複数本を同時照射
      const n = 6; for (let i = 0; i < n; i++) bossBeam(e, base + i / n * G.TAU, { warn: 1.0, fire: 0.5, sweep: 0, half: 24, dmgMul: 0.9, col: '#ff7a4a' });
      e.bossCastT = Math.max(e.bossCastT, 1.0); G.audio.sfx('bossroar', { p: 0.85 });
    } else {                          // 多重同時範囲: プレイヤー周囲に同時着弾AoEを多数(予告円つき)
      const cnt = 9, AOE = G.data.BOSS_AOE_MUL || 1, wt = G.data.BOSS_TELE_T || (1.0 * (G.data.BOSS_WIND_MUL || 1));
      for (let i = 0; i < cnt; i++) { const a = i / cnt * G.TAU, rr = 130 + (i % 2) * 95; e.strikes.push({ x: p.x + Math.cos(a) * rr, y: p.y + Math.sin(a) * rr, t: wt, warn: wt, kind: 'doom', r: 78, col: '#ff6a4a', dmgMul: 0.85 }); }
      e.strikes.push({ x: p.x, y: p.y, t: wt, warn: wt, kind: 'doom', r: 78 * AOE, col: '#ff6a4a', dmgMul: 0.85 });
      e.plantT = Math.max(e.plantT || 0, wt); e.bossCastT = Math.max(e.bossCastT, 0.6); G.audio.sfx('bossroar', { p: 1.0 });
    }
  }

  // ボス機動: 距離を保たず、接近(rush)/旋回(orbit)/横断(cross)/牽制(juke)を巡回してマップを縦横無尽に動く
  function chooseMove(e, p, dist) {
    const r = Math.random();
    if (r < 0.30) { e.mvMode = 'orbit'; e.mvT = G.rand(1.5, 2.6); e.mvDir = G.chance(0.5) ? 1 : -1; e.mvR = e.r + G.rand(120, 300); }
    else if (r < 0.56) { e.mvMode = 'rush'; e.mvT = G.rand(0.8, 1.4); }       // プレイヤーへ急接近(→近接踏み込み)
    else if (r < 0.84) {                                                       // プレイヤー周囲の別角度へ高速横断(縦横無尽=横切る)
      e.mvMode = 'cross'; e.mvT = G.rand(1.0, 1.8);
      const a = G.rand(G.TAU), rr = G.rand(360, 580);
      const hw = G.MAP_W / 2 - G.WALL - e.r - 30, hh = G.MAP_H / 2 - G.WALL - e.r - 30;
      e.mvX = G.clamp(p.x + Math.cos(a) * rr, -hw, hw); e.mvY = G.clamp(p.y + Math.sin(a) * rr, -hh, hh);
    } else { e.mvMode = 'juke'; e.mvT = G.rand(0.45, 0.85); e.mvDir = G.chance(0.5) ? 1 : -1; }   // 横っ飛びの牽制
  }
  function moveByMode(e, p, h, nx, ny, dist) {
    const sp = e.spd;
    if (e.mvMode === 'rush') {                  // 急接近
      e.vx = nx * sp * 2.2; e.vy = ny * sp * 2.2;
    } else if (e.mvMode === 'cross') {          // 高速横断(別角度へ横切る)。到着で次モード
      const ddx = e.mvX - e.x, ddy = e.mvY - e.y, dm = Math.hypot(ddx, ddy) || 1;
      e.vx = ddx / dm * sp * 3.0; e.vy = ddy / dm * sp * 3.0;
      if (dm < 70) e.mvT = 0;
    } else if (e.mvMode === 'juke') {           // 横っ飛び
      e.vx = -ny * e.mvDir * sp * 2.6; e.vy = nx * e.mvDir * sp * 2.6;
    } else {                                    // orbit: 旋回(円を描く)＋距離維持の補正(mvRへ寄せる)
      const d = e.mvDir, radial = (dist - (e.mvR || e.r + 230)) * 0.02;
      e.vx = (-ny * d + nx * radial) * sp * 1.6;
      e.vy = (nx * d + ny * radial) * sp * 1.6;
    }
  }

  // ---------------- boss AI ----------------
  function updateBoss(e, h, p) {
    const run = G.run;
    if (e.attackLock > 0) e.attackLock -= h;
    const actionWasActive = bossActionActive(e);
    if (e._actionActivePrev && !actionWasActive) {
      e.attackLock = Math.max(e.attackLock || 0, 0.9);
    }
    e._actionFrameBlocked = actionWasActive;
    const bossTick = bossCanStart(e) ? h * (e.bossTempo || 1) / (G.data.BOSS_CD_MUL || 1) : 0;
    const AOE = G.data.BOSS_AOE_MUL || 1;   // 範囲拡大: 衝撃波/遅延着弾の半径倍率
    const dx = p.x - e.x, dy = p.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist, ny = dy / dist;
    e.bt += h;

    // half-HP roar: the fight escalates
    if (!e.halfRoar && e.hp < e.maxHp * 0.5) {
      e.halfRoar = true;
      e.bossRageT = 0.8;
      const rageCol = BOSS_FX_COLOR[e.bossId] || '#ff523f';
      bossBurst(e.x, e.y - 12, { radius: 200 + e.bossRank * 12, life: 0.78, color: rageCol, smoke: 16, sparks: 16, width: 5 });
      G.audio.sfx('bossroar');
      G.fx.ring(e.x, e.y - 20, { r0: 20, r1: 190, life: 0.55, color: 'rgba(255,90,60,0.85)', width: 4 });
      if (D.EXPFX) G.fx.burst(e.x, e.y - 14, 'dark_vortex', { sz: 280, dur: 0.95, from: 0.3, to: 1.45, spin: 1.6, add: true });   // 実験FX: 激昂の闇渦
      e.flash = 0.25;
      G.cam.add(5);
    }

    // 眷属召喚(全ボス共通の攻撃パターン): ボス戦中は時計が止まり雑魚が湧かない。
    // ボスが眷属を呼ぶことで籠城側にも経験値の供給を残し、出直し不能の死スパイラルを緩和する。
    // (化け狸は固有の小鬼召喚を持つので除外)
    if (e.bossId !== 'tanuki') {
      e.summonT -= bossTick;
      if (bossCanStart(e) && e.summonT <= 0) {
        e.summonT = 10;
        e.bossCastT = Math.max(e.bossCastT, 0.4);
        G.audio.sfx('bossroar', { p: 0.85 });
        const scol = BOSS_FX_COLOR[e.bossId] || '#b06bff';
        G.fx.ring(e.x, e.y, { r0: 16, r1: 150, life: 0.5, color: 'rgba(180,120,255,0.65)', width: 3 });
        const n = 4;
        for (let i = 0; i < n; i++) {
          const a = i / n * G.TAU + G.rand(0.6);
          const sx = e.x + Math.cos(a) * 70, sy = e.y + Math.sin(a) * 70;
          G.fx.spark(sx, sy, scol, 8, 150, 0.3);
          const m = ENT.spawnEnemy('imp', sx, sy, { force: true });
          if (m) m.xp = Math.max(m.xp, 3);   // 召喚個体は経験値多め=籠城側の出直し原資
        }
      }
    }

    if (e.bossId === 'tanuki') {
      // ①八方の霊弾 ②小鬼召喚 ③腹鼓 (溜め→周囲衝撃波)
      if (e.bstate === 'drum') {
        e.vx = 0; e.vy = 0;
        if (e.bt > (G.data.BOSS_TELE_T || 0.7)) {
          e.bstate = 'chase'; e.bt = 0; e.atk3 = 8.5;
          e.bossAttackT = 0.38;
          G.audio.sfx('bomb');
          G.cam.add(6);
          const R = 225 * AOE;
          G.fx.ring(e.x, e.y, { r0: 24, r1: R, life: 0.4, color: 'rgba(160,220,120,0.95)', width: 6 });
          if (D.EXPFX) G.fx.burst(e.x, e.y, 'shockwave', { sz: R * 2.2, dur: 0.5, from: 0.25, to: 1.35, add: true });   // 実験FX: 腹鼓の衝撃輪
          if (G.dist2(e.x, e.y, p.x, p.y) < R * R) ENT.damagePlayer(e.dmg * 0.85, e.bossId);
        }
      } else {
        e.vx = nx * e.spd; e.vy = ny * e.spd;
        e.atk3 -= bossTick;
        if (bossCanStart(e) && e.atk3 <= 0) {
          e.bstate = 'drum'; e.bt = 0;
          G.audio.sfx('gong');
          G.fx.ring(e.x, e.y, { r0: 12, r1: 225 * AOE, life: 0.7, color: 'rgba(160,220,120,0.5)', width: 3 });
        }
      }
      e.atk1 -= bossTick;
      e.atk2 -= bossTick;
      if (bossCanStart(e) && e.atk1 <= 0) {
        e.atk1 = 5; e.bossCastT = Math.max(e.bossCastT, 0.35);   // 予告→八方の霊弾
        bossCast(e, 0.35, () => {
          e.bossAttackT = 0.32;
          for (let i = 0; i < 11; i++) {
            const a = i / 11 * G.TAU + e.t;
            ENT.spawnOrb(e.x, e.y,Math.cos(a) * 130, Math.sin(a) * 130, e.dmg * 0.55, e.bossId);
          }
          G.fx.puffRing(e.x, e.y - 20, 'rgba(140,200,110,0.8)', 8, 120);
        }, { kind: 'radial', r: 140 });
      }
      if (bossCanStart(e) && e.atk2 <= 0) {
        e.atk2 = 9.5;
        e.bossCastT = 0.42;
        for (let i = 0; i < 6; i++) {
          const a = G.rand(G.TAU);
          ENT.spawnEnemy('imp', e.x + Math.cos(a) * 60, e.y + Math.sin(a) * 60, { force: true });
        }
        G.fx.spark(e.x, e.y - 30, '#a8d89a', 12, 180);
      }
    } else if (e.bossId === 'nure') {
      // serpentine chase + occasional dash; spits orb fans
      if (e.dashHitT > 0) e.dashHitT -= h;
      const wig = Math.sin(e.t * 3.1) * 0.8;
      let sp = e.spd;
      if (e.bstate === 'dashwind') {            // 突進の予告(ほぼ静止して溜める→予告線の方向を見せる)
        sp *= 0.32;
        if (e.bt > (G.data.BOSS_TELE_T || 0.6)) { e.bstate = 'dash'; e.bt = 0; e.dashHitT = 0; G.audio.sfx('slash'); }
      } else if (e.bstate === 'dash') {
        sp *= 1.95;   // 2.7→1.95 (≈206 < プレイヤー218.4 = 横へ逃げれば振り切れる)
        if (e.bt > 0.95) { e.bstate = 'chase'; e.bt = 0; }
      } else if (bossCanStart(e) && e.bt > 9) {
        e.bstate = 'dashwind'; e.bt = 0;
        e.dashDX = nx; e.dashDY = ny;   // 突進方向を予告開始時に固定(=追尾しない。予告線=実際の軌道→横移動で回避可能)
        bossBeam(e, Math.atan2(e.dashDY, e.dashDX), { warn: 0.6 / (G.data.BOSS_WIND_MUL || 1), fire: 0.01, dmgMul: 0, half: 40, len: 620, col: '#7fd0e6' });   // 突進の予告線
        G.audio.sfx('bossroar', { p: 1.2 });
      }
      if (e.bstate === 'dash') {   // 突進中は固定方向へ直進(追尾しない=回避可能)
        e.vx = e.dashDX * sp;
        e.vy = e.dashDY * sp;
      } else {
        e.vx = (nx - ny * wig) * sp;
        e.vy = (ny + nx * wig) * sp;
      }
      e.atk1 -= bossTick;
      if (bossCanStart(e) && e.atk1 <= 0) {
        e.atk1 = 4.2; e.bossCastT = Math.max(e.bossCastT, 0.3);   // 予告→指弾の扇
        const fa = Math.atan2(ny, nx);
        bossCast(e, 0.3, () => {
          e.bossAttackT = 0.3;
          for (let k = -1; k <= 1; k++) {
            const a = fa + k * 0.3;
            ENT.spawnOrb(e.x, e.y, Math.cos(a) * 175, Math.sin(a) * 175, e.dmg * 0.5, e.bossId);
          }
        }, { kind: 'cone', ang: fa, half: 0.62, r: 260 });
      }
      // ③髪嵐: 全周へ濡れ髪の霊弾
      e.atk2 -= bossTick;
      if (bossCanStart(e) && e.atk2 <= 0) {
        e.atk2 = 7.5; e.bossCastT = Math.max(e.bossCastT, 0.38);   // 予告→髪嵐(全周)
        bossCast(e, 0.38, () => {
          e.bossAttackT = 0.38;
          for (let i = 0; i < 14; i++) {
            const a = i / 14 * G.TAU + e.t;
            ENT.spawnOrb(e.x, e.y, Math.cos(a) * 158, Math.sin(a) * 158, e.dmg * 0.45, e.bossId);
          }
          G.fx.puffRing(e.x, e.y, 'rgba(110,180,190,0.8)', 10, 140);
          if (G.fx.anim) G.fx.anim(e.x, e.y, 'water', { scale: 2.6, dur: 0.45, add: true });
        }, { kind: 'radial', r: 160 });
      }
      // trail history for body segments
      if (!e.trailT || e.t - e.trailT > 0.035) {
        e.trailT = e.t;
        e.trail.unshift(e.x, e.y);
        if (e.trail.length > 56) e.trail.length = 56;
      }
    } else if (e.bossId === 'ushi') {
      // ①予告つき猛突進 ②地響き (近接衝撃) ③岩礫の扇
      if (e.bstate === 'chase') {
        e.vx = nx * e.spd; e.vy = ny * e.spd;
        if (bossCanStart(e) && e.bt > 5.2) {
          e.bstate = 'tele'; e.bt = 0;
          e.teleX = nx; e.teleY = ny;
          e.vx = 0; e.vy = 0;
          G.audio.sfx('bossroar');
        }
        e.atk1 -= bossTick;
        if (bossCanStart(e) && e.atk1 <= 0) {
          e.atk1 = 8;
          const R = 185 * AOE;
          G.audio.sfx('bossroar');
          bossCast(e, 0.4, () => {   // 地響き: 予告(満ちる円)→発生に統一(従来は予告なし即着弾だった)
            e.bossAttackT = 0.4;
            G.cam.add(7);
            G.fx.ring(e.x, e.y, { r0: 16, r1: R, life: 0.4, color: 'rgba(255,150,90,0.9)', width: 5 });
            if (G.fx.anim) G.fx.anim(e.x, e.y, 'earth_spike', { scale: 3.6, dur: 0.42, add: false });   // 牛鬼の地響き=地から棘(foozle Earth_Spike)
            if (G.dist2(e.x, e.y, p.x, p.y) < R * R) ENT.damagePlayer(e.dmg * 0.72, e.bossId);
          }, { kind: 'radial', r: R });
        }
        e.atk2 -= bossTick;
        if (bossCanStart(e) && e.atk2 <= 0) {
          e.atk2 = 6; e.bossCastT = Math.max(e.bossCastT, 0.32);   // 予告→岩礫の扇
          const fa = Math.atan2(ny, nx);
          bossCast(e, 0.32, () => {
            e.bossAttackT = 0.32;
            for (let k = -2; k <= 2; k++) {
              const a = fa + k * 0.26;
              ENT.spawnOrb(e.x, e.y,Math.cos(a) * 165, Math.sin(a) * 165, e.dmg * 0.5, e.bossId);
            }
            G.audio.sfx('slash');
          }, { kind: 'cone', ang: fa, half: 0.75, r: 250 });
        }
      } else if (e.bstate === 'tele') {
        e.vx = 0; e.vy = 0;
        if (e.bt > (G.data.BOSS_TELE_T || 0.95)) { e.bstate = 'charge'; e.bt = 0; }
      } else if (e.bstate === 'charge') {
        e.vx = e.teleX * 380; e.vy = e.teleY * 380;
        if (e.bt > 0.9) {
          e.bstate = 'chase'; e.bt = 0;
          G.cam.add(8);
          G.audio.sfx('bomb');
          if (G.fx.anim) G.fx.anim(e.x, e.y, 'rocks', { scale: 2.4, dur: 0.5, add: false });   // 牛鬼の突進着地=砕石が舞う(foozle Rocks)
          for (let i = 0; i < 10; i++) {
            const a = i / 10 * G.TAU;
            ENT.spawnOrb(e.x, e.y, Math.cos(a) * 150, Math.sin(a) * 150, e.dmg * 0.5, e.bossId);
          }
        }
      }
    } else if (e.bossId === 'nue') {
      // ①落雷喚び (予兆→着弾) ②急降下 ③夜烏の黒風
      if (e.bstate === 'swoopwind') {           // 急降下の予告(ホバリングして降下線を示す)
        e.vx *= 0.8; e.vy *= 0.8;
        if (e.bt > (G.data.BOSS_TELE_T || 0.5)) { e.bstate = 'swoop'; e.bt = 0; }
      } else if (e.bstate === 'swoop') {
        e.vx = e.teleX * 460; e.vy = e.teleY * 460;
        if (e.bt > 0.85) { e.bstate = 'chase'; e.bt = 0; }
      } else {
        const orbit = Math.sin(e.t * 1.7);
        e.vx = (nx - ny * orbit) * e.spd;
        e.vy = (ny + nx * orbit) * e.spd;
        if (bossCanStart(e) && e.bt > 7) {
          e.bstate = 'swoopwind'; e.bt = 0;
          e.teleX = nx; e.teleY = ny;
          bossBeam(e, Math.atan2(ny, nx), { warn: 0.5, fire: 0.01, dmgMul: 0, half: 36, len: 720, col: '#b08cff' });   // 急降下の予告線
          G.audio.sfx('wind');
        }
      }
      e.atk1 -= bossTick;
      if (bossCanStart(e) && e.atk1 <= 0) {
        e.atk1 = 6.5;
        e.bossCastT = 0.45;
        for (let i = 0; i < 5; i++) {
          e.strikes.push({ x: p.x + G.rand(-150, 150), y: p.y + G.rand(-150, 150), t: (G.data.BOSS_TELE_T || 0.85), warn: (G.data.BOSS_TELE_T || 0.85) });
        }
        G.audio.sfx('bolt');
      }
      e.atk2 -= bossTick;
      if (bossCanStart(e) && e.atk2 <= 0) {
        e.atk2 = 11;
        e.bossCastT = 0.45;
        for (let i = 0; i < 4; i++) {
          const a = G.rand(G.TAU);
          ENT.spawnEnemy('crow', e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 70, { force: true });
        }
        G.fx.puffRing(e.x, e.y, 'rgba(90,75,130,0.85)', 10, 150);
      }
    } else if (e.bossId === 'gasha') {
      // ①骨指弾の扇 ②大薙ぎ (構え→全周衝撃) ③骸骨の呼び声
      if (e.bstate === 'sweep') {
        e.vx = 0; e.vy = 0;
        if (e.bt > (G.data.BOSS_TELE_T || 0.8)) {
          e.bstate = 'chase'; e.bt = 0; e.atk2 = 9;
          e.bossAttackT = 0.42;
          G.audio.sfx('bomb');
          G.cam.add(8);
          const R = 215 * AOE;
          G.fx.ring(e.x, e.y, { r0: 30, r1: R, life: 0.4, color: 'rgba(255,242,212,0.95)', width: 6 });
          if (G.fx.anim) G.fx.anim(e.x, e.y, 'explode', { scale: 3.6, dur: 0.5, add: false });   // 骸骨の大薙ぎ=全周衝撃(foozle Explosion)
          if (G.dist2(e.x, e.y, p.x, p.y) < R * R) ENT.damagePlayer(e.dmg * 1.0, e.bossId);
        }
      } else {
        e.vx = nx * e.spd; e.vy = ny * e.spd;
        e.atk2 -= bossTick;
        if (bossCanStart(e) && e.atk2 <= 0) {
          e.bstate = 'sweep'; e.bt = 0;
          G.audio.sfx('bossroar');
          G.fx.ring(e.x, e.y, { r0: 12, r1: 215 * AOE, life: 0.8, color: 'rgba(232,220,196,0.5)', width: 3 });
        }
      }
      e.atk1 -= bossTick;
      if (bossCanStart(e) && e.atk1 <= 0) {
        e.atk1 = 4.5; e.bossCastT = Math.max(e.bossCastT, 0.34);   // 予告→骨指弾の扇
        const fa = Math.atan2(ny, nx);
        bossCast(e, 0.34, () => {
          e.bossAttackT = 0.34;
          for (let k = -3; k <= 3; k++) {
            const a = fa + k * 0.24;
            ENT.spawnOrb(e.x, e.y,Math.cos(a) * 185, Math.sin(a) * 185, e.dmg * 0.5, e.bossId);
          }
          G.audio.sfx('arrow');
        }, { kind: 'cone', ang: fa, half: 0.95, r: 260 });
      }
      e.atk3 -= bossTick;
      if (bossCanStart(e) && e.atk3 <= 0) {
        e.atk3 = 12;
        e.bossCastT = 0.45;
        for (let i = 0; i < 4; i++) {
          const a = G.rand(G.TAU);
          ENT.spawnEnemy('skel', e.x + Math.cos(a) * 80, e.y + Math.sin(a) * 80, { force: true });
        }
        G.fx.spark(e.x, e.y - 40, '#e8ecf2', 12, 180);
      }
    } else if (e.bossId === 'shuten') {
      if (!e.rage && e.hp < e.maxHp * 0.3) {
        e.rage = true;
        e.bossRageT = 1.1;
        G.audio.sfx('bossroar');
        G.ui.announce('酒呑童子、激昂', '');
        G.cam.add(8);
        if (G.fx.anim) {
          G.fx.anim(e.x, e.y, 'explode', { scale: 3.2, dur: 0.52, add: true });
          G.fx.anim(e.x, e.y, 'portal', { scale: e.r * 0.12, dur: 0.7, add: true });
        }
        if (D.EXPFX) G.fx.burst(e.x, e.y, 'meteor', { sz: 260, dur: 0.6, from: 0.4, to: 1.4, spin: 1, add: true });   // 実験FX: 火球群の激昂
      }
      const rageMul = e.rage ? 1.55 : 1;
      e.vx = nx * e.spd * rageMul;
      e.vy = ny * e.spd * rageMul;
      e.atk1 -= bossTick * rageMul;
      e.atk2 -= bossTick * rageMul;
      e.atk3 -= bossTick;
      if (bossCanStart(e) && e.atk1 <= 0) {
        e.atk1 = 6.4; e.bossCastT = Math.max(e.bossCastT, 0.4);   // 予告→霊弾の輪
        bossCast(e, 0.4, () => {
          e.bossAttackT = 0.4;
          const n = 20;
          for (let i = 0; i < n; i++) {
            const a = i / n * G.TAU + e.t * 0.7;
            ENT.spawnOrb(e.x, e.y,Math.cos(a) * 145, Math.sin(a) * 145, e.dmg * 0.5, e.bossId);
          }
        }, { kind: 'radial', r: 150 });
      }
      if (bossCanStart(e) && e.atk2 <= 0) {
        e.atk2 = 3.6; e.bossCastT = Math.max(e.bossCastT, 0.28);   // 予告→速射の扇
        const fa = Math.atan2(ny, nx);
        bossCast(e, 0.28, () => {
          e.bossAttackT = 0.34;
          for (let k = -2; k <= 2; k++) {
            const a = fa + k * 0.22;
            ENT.spawnOrb(e.x, e.y,Math.cos(a) * 200, Math.sin(a) * 200, e.dmg * 0.5, e.bossId);
          }
        }, { kind: 'cone', ang: fa, half: 0.65, r: 280 });
      }
      if (bossCanStart(e) && e.atk3 <= 0) {
        e.atk3 = e.rage ? 14 : 12;
        if (e.rage) startShutenCombo(e, p);
        else {
          e.bossCastT = 0.45;
          for (let i = 0; i < 2; i++) {
            const a = G.rand(G.TAU);
            ENT.spawnEnemy('oni', e.x + Math.cos(a) * 80, e.y + Math.sin(a) * 80, { force: true });
          }
        }
      }
    } else if (e.bossId === 'tsuchigumo') {
      // ①糸弾の扇 ②地潜り跳躍(着地で土棘+礫) ③蜘蛛の子召喚
      if (e.bstate === 'burrow') {            // 潜伏(無防備な予兆)→跳躍
        e.vx *= 0.8; e.vy *= 0.8;
        if (e.bt > (G.data.BOSS_TELE_T || 0.7)) { e.bstate = 'leap'; e.bt = 0; }
      } else if (e.bstate === 'leap') {        // 着地点へ寄せて着地衝撃
        e.x += (e.teleX - e.x) * Math.min(1, h * 8);
        e.y += (e.teleY - e.y) * Math.min(1, h * 8);
        e.vx = 0; e.vy = 0;
        if (e.bt > 0.5) {
          e.bstate = 'chase'; e.bt = 0;
          G.cam.add(7); G.audio.sfx('bomb');
          if (G.fx.anim) { G.fx.anim(e.x, e.y, 'earth_spike', { scale: 3.4, dur: 0.45, add: false }); G.fx.anim(e.x, e.y, 'rocks', { scale: 2.2, dur: 0.5, add: false }); }
          const R = 210 * AOE;
          G.fx.ring(e.x, e.y, { r0: 20, r1: R, life: 0.4, color: 'rgba(150,130,90,0.9)', width: 5 });
          if (G.dist2(e.x, e.y, p.x, p.y) < R * R) ENT.damagePlayer(e.dmg * 0.9, e.bossId);
        }
      } else {
        e.vx = nx * e.spd; e.vy = ny * e.spd;
        e.atk3 -= bossTick;
        if (bossCanStart(e) && e.atk3 <= 0) {
          e.atk3 = 7.5; e.bstate = 'burrow'; e.bt = 0; e.bossCastT = 0.7;
          e.teleX = p.x; e.teleY = p.y;
          G.audio.sfx('bossroar');
        }
      }
      e.atk1 -= bossTick;
      if (bossCanStart(e) && e.atk1 <= 0) {                       // 糸弾の扇
        e.atk1 = 4.5; e.bossCastT = Math.max(e.bossCastT, 0.32);
        const fa = Math.atan2(ny, nx);
        bossCast(e, 0.32, () => {
          e.bossAttackT = 0.34;
          for (let k = -3; k <= 3; k++) {
            const a = fa + k * 0.2;
            ENT.spawnOrb(e.x, e.y, Math.cos(a) * 150, Math.sin(a) * 150, e.dmg * 0.45, e.bossId);
          }
          G.fx.puffRing(e.x, e.y, 'rgba(180,200,140,0.7)', 8, 130);
        }, { kind: 'cone', ang: fa, half: 0.82, r: 250 });
      }
      e.atk2 -= bossTick;
      if (bossCanStart(e) && e.atk2 <= 0) {                       // 蜘蛛の子召喚
        e.atk2 = 10; e.bossCastT = 0.45;
        for (let i = 0; i < 5; i++) { const a = G.rand(G.TAU); ENT.spawnEnemy('imp', e.x + Math.cos(a) * 64, e.y + Math.sin(a) * 64, { force: true }); }
        if (G.fx.anim) G.fx.anim(e.x, e.y, 'rocks', { scale: 1.6, dur: 0.42, add: false });
        G.audio.sfx('slash');
      }
    } else if (e.bossId === 'daitengu') {
      // ①疾風刃の扇 ②竜巻招来(遅延着弾) ③羽団扇の突風
      if (e.bstate === 'gust') {
        e.vx = 0; e.vy = 0;
        if (e.bt > (G.data.BOSS_TELE_T || 0.5)) {
          e.bstate = 'chase'; e.bt = 0; e.bossAttackT = 0.36;
          G.audio.sfx('wind'); G.cam.add(5);
          if (G.fx.anim) {
            G.fx.anim(e.x, e.y, 'tornado', { scale: 3.5, dur: 0.5, add: true });
            // wind 素材は無回転時に左向き。四方へ放つため各方向へ180度補正して回転する。
            for (let wi = 0; wi < 4; wi++) {
              const wa = wi / 4 * G.TAU;
              G.fx.anim(e.x + Math.cos(wa) * 54, e.y + Math.sin(wa) * 54, 'wind', {
                scale: 2.2, dur: 0.38, rot: wa + Math.PI, add: true,
              });
            }
          }
          const R = 250 * AOE;
          G.fx.ring(e.x, e.y, { r0: 24, r1: R, life: 0.4, color: 'rgba(200,230,210,0.85)', width: 5 });
          if (G.dist2(e.x, e.y, p.x, p.y) < R * R) ENT.damagePlayer(e.dmg * 0.8, e.bossId);
        }
      } else {
        const orbit = Math.sin(e.t * 1.5) * 0.5;
        e.vx = (nx - ny * orbit) * e.spd; e.vy = (ny + nx * orbit) * e.spd;
        e.atk3 -= bossTick;
        if (bossCanStart(e) && e.atk3 <= 0) { e.atk3 = 8; e.bstate = 'gust'; e.bt = 0; G.audio.sfx('bossroar'); }
      }
      e.atk1 -= bossTick;
      if (bossCanStart(e) && e.atk1 <= 0) {                       // 疾風刃の扇
        e.atk1 = 3.8; e.bossCastT = Math.max(e.bossCastT, 0.28);
        const fa = Math.atan2(ny, nx);
        bossCast(e, 0.28, () => {
          e.bossAttackT = 0.3;
          for (let k = -2; k <= 2; k++) {
            const a = fa + k * 0.22;
            ENT.spawnOrb(e.x, e.y, Math.cos(a) * 210, Math.sin(a) * 210, e.dmg * 0.5, e.bossId);
          }
          if (G.fx.anim) G.fx.anim(e.x + Math.cos(fa) * 42, e.y + Math.sin(fa) * 42, 'wind', {
            scale: 2.6, dur: 0.34, rot: fa + Math.PI, add: true,
          });
          G.audio.sfx('slash');
        }, { kind: 'cone', ang: fa, half: 0.66, r: 280 });
      }
      e.atk2 -= bossTick;
      if (bossCanStart(e) && e.atk2 <= 0) {                       // 竜巻招来 / 妖将以上は連携技
        e.atk2 = 10.5;
        if ((e.bossRank || 1) >= 3) startTenguCombo(e, p);
        else {
          e.bossCastT = 0.5;
          for (let i = 0; i < 3; i++) e.strikes.push({ x: p.x + G.rand(-140, 140), y: p.y + G.rand(-140, 140), t: (G.data.BOSS_TELE_T || 0.85), warn: (G.data.BOSS_TELE_T || 0.85), kind: 'tornado', r: 66, col: '#d8e8ff', dmgMul: 0.8 });
          G.audio.sfx('wind');
        }
      }
    } else if (e.bossId === 'ogama') {
      // ①水弾の全周 ②水柱噴出(遅延着弾) ③舌撃ち突進
      if (e.bstate === 'tele') {              // 舌撃ち: 狙い→突進
        e.vx = 0; e.vy = 0;
        if (e.bt > (G.data.BOSS_TELE_T || 0.6)) { e.bstate = 'lunge'; e.bt = 0; G.audio.sfx('dash'); }
      } else if (e.bstate === 'lunge') {
        e.vx = e.teleX * 460; e.vy = e.teleY * 460;
        if (G.chance(0.5) && G.cam.onScreen(e.x, e.y, 40)) G.fx.trail(e.x, e.y, 'rgba(120,200,160,0.5)', e.r * 0.7, 0.2);
        if (e.bt > 0.7) {
          e.bstate = 'chase'; e.bt = 0;
          if (G.fx.anim) G.fx.anim(e.x, e.y, 'water', { scale: 2.6, dur: 0.45, add: true });
        }
      } else {
        e.vx = nx * e.spd; e.vy = ny * e.spd;
        e.atk3 -= bossTick;
        if (bossCanStart(e) && e.atk3 <= 0) {
          e.atk3 = 6.5; e.bstate = 'tele'; e.bt = 0;
          e.teleX = nx; e.teleY = ny;
          G.audio.sfx('bossroar');
        }
      }
      e.atk1 -= bossTick;
      if (bossCanStart(e) && e.atk1 <= 0) {                       // 水弾の全周
        e.atk1 = 4.2; e.bossCastT = Math.max(e.bossCastT, 0.34);
        bossCast(e, 0.34, () => {
          e.bossAttackT = 0.34;
          for (let i = 0; i < 16; i++) {
            const a = i / 16 * G.TAU + e.t;
            ENT.spawnOrb(e.x, e.y, Math.cos(a) * 150, Math.sin(a) * 150, e.dmg * 0.45, e.bossId);
          }
          if (G.fx.anim) G.fx.anim(e.x, e.y, 'water', { scale: 2.2, dur: 0.4, add: true });
          G.fx.puffRing(e.x, e.y, 'rgba(120,200,180,0.75)', 10, 140);
        }, { kind: 'radial', r: 150 });
      }
      e.atk2 -= bossTick;
      if (bossCanStart(e) && e.atk2 <= 0) {                       // 水柱噴出(遅延=geyser strike)
        e.atk2 = 8.5; e.bossCastT = 0.5;
        for (let i = 0; i < 4; i++) e.strikes.push({ x: p.x + G.rand(-130, 130), y: p.y + G.rand(-130, 130), t: (G.data.BOSS_TELE_T || 0.85), warn: (G.data.BOSS_TELE_T || 0.85), kind: 'geyser', r: 60, col: '#8fd8ff', dmgMul: 0.85 });
        G.audio.sfx('bang');
      }
    }

    // 遅延着弾 (落雷など): 予兆円は render 側、着弾はここで処理
    if (e.strikes.length) {
      for (let i = e.strikes.length - 1; i >= 0; i--) {
        const s = e.strikes[i];
        s.t -= h;
        if (s.t <= 0) {
          const sr = (s.r || 56) * AOE;   // 範囲拡大
          if (s.kind === 'tornado') {            // 大天狗の竜巻
            if (G.fx.anim) G.fx.anim(s.x, s.y, 'tornado', { scale: sr / 26, dur: 0.5, add: true });
            G.fx.ring(s.x, s.y, { r0: sr * 0.3, r1: sr, life: 0.4, color: 'rgba(200,224,255,0.8)', width: 4 });
            G.fx.spark(s.x, s.y, '#dceaff', 10, 200);
            G.audio.sfx('wind');
          } else if (s.kind === 'geyser') {      // 大蝦蟇の水柱
            if (G.fx.anim) G.fx.anim(s.x, s.y, 'water_geyser', { scale: sr / 24, dur: 0.5, add: true });
            if (D.EXPFX) G.fx.burst(s.x, s.y, 'ice_shard', { sz: sr * 1.8, dur: 0.45, from: 0.4, to: 1.3, spin: 1.2, add: true });   // 実験FX
            G.fx.ring(s.x, s.y, { r0: sr * 0.3, r1: sr, life: 0.4, color: 'rgba(150,210,255,0.85)', width: 4 });
            G.fx.spark(s.x, s.y, '#cfeeff', 10, 200);
            G.audio.sfx('bang');
          } else if (s.kind === 'doom') {        // 多重同時範囲の着弾(紅蓮の炸裂)
            if (G.fx.anim) G.fx.anim(s.x, s.y, 'explode', { scale: sr / 42, dur: 0.4, add: false });
            if (D.EXPFX) G.fx.burst(s.x, s.y, 'blood_curse', { sz: sr * 2.0, dur: 0.55, from: 0.4, to: 1.4, spin: 3, add: true });   // 実験FX: 紅蓮の呪炸裂
            G.fx.ring(s.x, s.y, { r0: sr * 0.3, r1: sr, life: 0.4, color: 'rgba(255,120,90,0.9)', width: 5 });
            G.fx.spark(s.x, s.y, '#ff9a6a', 12, 240);
            G.audio.sfx('bomb');
          } else {                               // 鵺の落雷(既定)
            G.fx.bolt(s.x + G.rand(-20, 20), s.y - 280, s.x, s.y);
            G.fx.spark(s.x, s.y, '#cfeaff', 8, 170);
            if (G.fx.anim) G.fx.anim(s.x, s.y, 'explode', { scale: 1, dur: 0.36, add: true });   // 着弾の閃光(foozle Explosion)
            G.audio.sfx('bolt');
          }
          if (p.alive && G.dist2(s.x, s.y, p.x, p.y) < sr * sr) ENT.damagePlayer(e.dmg * (s.dmgMul || 0.9), e.bossId);
          e.strikes.splice(i, 1);
        }
      }
    }

    // レーザー: 予告線→照射→消滅。照射中は線上のプレイヤーに判定
    if (e.beams.length) {
      for (let i = e.beams.length - 1; i >= 0; i--) {
        const b = e.beams[i]; b.t += h;
        if (b.t >= b.warn && b.t < b.warn + b.fire) {   // 照射中
          b.ang = b.startAng + b.sweep * Math.max(0, b.t - b.warn);
          if (!b._fired) {   // 照射開始の銃口FX(素材): 火槍の閃光が噴き出す
            b._fired = true;
            const mx = e.x + Math.cos(b.ang) * 46, my = e.y + Math.sin(b.ang) * 46;
            // molten_spear 素材は無回転時に下向き(+Y)。進行角へ合わせるには -90度補正が必要。
            if (G.fx.anim) G.fx.anim(mx, my, 'molten_spear', { scale: 2.4, dur: 0.42, rot: b.ang - Math.PI / 2, add: true });
            if (D.EXPFX) G.fx.burst(e.x + Math.cos(b.ang) * 50, e.y + Math.sin(b.ang) * 50, 'thunder_orb', { sz: 130, dur: 0.4, from: 0.5, to: 1.25, spin: 5, add: true });   // 実験FX: 雷球の銃口
            G.fx.ring(mx, my, { r0: 8, r1: 82, life: 0.28, color: b.col, width: 5 });
            G.fx.spark(mx, my, b.col, 16, 280, 0.36);
            G.cam.add(3.5);
          }
          b.hitCd -= h;
          b.fxT -= h;
          if (b.fxT <= 0) {
            b.fxT = 0.08;
            const mx = e.x + Math.cos(b.ang) * 56, my = e.y + Math.sin(b.ang) * 56;
            G.fx.spark(mx, my, b.col, 2, 90, 0.18);
          }
          const ex2 = e.x + Math.cos(b.ang) * b.len, ey2 = e.y + Math.sin(b.ang) * b.len;
          if (p.alive && b.hitCd <= 0 && distToSeg(p.x, p.y, e.x, e.y, ex2, ey2) < b.half + p.r) { ENT.damagePlayer(e.dmg * b.dmgMul, e.bossId); b.hitCd = 0.4; }
        }
        if (b.t >= b.warn + b.fire) e.beams.splice(i, 1);
      }
    }
    // 予告付き遅延発火 (弾幕volley等): 予告を出してから本体を撃つ
    if (e.acts.length) {
      for (let i = e.acts.length - 1; i >= 0; i--) { const a = e.acts[i]; a.t -= h; if (a.t <= 0) { a.fn(); e.acts.splice(i, 1); } }
    }
    // 大技ローテ: 一定間隔で 掃射/十字レーザー・多重同時範囲 を予告付きで (chase時/近接の合間に)
    e.grandT -= bossTick;
    if (bossCanStart(e) && e.grandT <= 0) {
      e.grandT = G.rand(4.5, 7) * (e.bossGrandMul || 1);
      triggerGrand(e, p);
    }

    // --- ボス共通の機動: 距離を保たず、接近/旋回/横断/牽制でマップを縦横無尽に動く。近接は踏み込み一閃 ---
    {
      const lung = Math.max(660, e.spd * 4.5);
      if (e.meleeWind > 0) {                          // 近接の予備動作(構え。完全停止せず流す)
        e.meleeWind -= h; e.vx *= 0.25; e.vy *= 0.25;
        e.bossCastT = Math.max(e.bossCastT, 0.1);
        if (e.meleeWind <= 0) { e.meleeLungeT = 0.4; e.vx = e.meleeDx * lung; e.vy = e.meleeDy * lung; }   // 予告時の向きで直進(発動時の再照準を廃止=直線予告どおりに突進し回避可能)
      } else if (e.meleeLungeT > 0) {                 // 近接ランジ(踏み込み一閃)
        e.meleeLungeT -= h;
        e.vx = e.meleeDx * lung; e.vy = e.meleeDy * lung;
        e.bossAttackT = Math.max(e.bossAttackT, 0.3);
        const fa = Math.atan2(e.meleeDy, e.meleeDx), reach = e.r + 120, laneHalf = e.r * 0.75 + 24;   // 直線レーン: 突進軌道に沿った帯で判定(扇でなく直線)
        if (dist < reach || e.meleeLungeT <= 0) {
          if (p.alive) {
            const ddx = p.x - e.x, ddy = p.y - e.y;
            const along = ddx * Math.cos(fa) + ddy * Math.sin(fa);   // 進行方向の前後
            const perp = -ddx * Math.sin(fa) + ddy * Math.cos(fa);   // 軌道からの横ずれ
            if (along > -e.r && along < reach + 25 && Math.abs(perp) < laneHalf) ENT.damagePlayer(e.dmg * 1.7, e.bossId);   // レーン内(=軸の前方かつ横ずれ小)のみ被弾
          }
          bossMeleeFx(e, fa, reach);
          e.meleeLungeT = 0; e.meleeT = G.rand(1.6, 2.8); e.vx *= 0.2; e.vy *= 0.2;   // 脅威UP: 近接ランジを高頻度化(2.5-4→1.6-2.8)
          G.cam.add(4); G.audio.sfx('bang');
        }
      } else if (e.bstate === 'chase') {              // 自由機動 (per-bossの特殊state以外のとき velocityを上書き)
        e.mvT -= h;
        if (e.mvT <= 0) chooseMove(e, p, dist);
        moveByMode(e, p, h, nx, ny, dist);
        e.meleeT -= h;
        if (bossCanStart(e) && e.mvMode === 'rush' && dist < e.r + 210 && e.meleeT <= 0) {   // 接近しきったら踏み込み一閃の予備動作
          e.meleeWind = (G.data.BOSS_TELE_T || 0.62); e.meleeDx = nx; e.meleeDy = ny; e.meleeT = 999; e.plantT = 0;   // 予告は全攻撃共通の猶予(BOSS_TELE_T)。踏み込み=移動攻撃ゆえ静止しない
          bossMeleeTele(e, Math.atan2(ny, nx), e.r + 145);
          G.audio.sfx('bossroar', { p: 1.25 });
        }
      }
      // else: per-bossの特殊state (drum/charge/swoop/leap/gust/tele/lunge 等) が速度を制御
    }

    if (e.plantT > 0) { e.plantT -= h; e.vx *= 0.08; e.vy *= 0.08; }   // 攻撃中(弾幕/レーザー/AoE詠唱)は移動攻撃以外その場で停止
    if (actionWasActive && !bossActionActive(e)) {
      e.attackLock = Math.max(e.attackLock || 0, 0.9);
    }
    e._actionActivePrev = bossActionActive(e);
    // 間合い維持: 自由機動中(近接ランジ/特殊dash/詠唱以外)はプレイヤーに食い込ませない。
    // 内向きの速度成分だけ消す(横移動=旋回/牽制は残す)。踏み込み一閃のランジは別途closeできる。
    if (e.bstate === 'chase' && (e.meleeWind || 0) <= 0 && (e.meleeLungeT || 0) <= 0 && (e.plantT || 0) <= 0) {
      const standoff = (p.r || 16) + (e.r || 40) * 2.0 + 30;
      if (dist < standoff) {
        const inward = e.vx * nx + e.vy * ny;
        if (inward > 0) { e.vx -= inward * nx; e.vy -= inward * ny; }              // 内向き成分を除去
        if (dist < standoff - 24) { e.vx -= nx * e.spd * 0.9; e.vy -= ny * e.spd * 0.9; }   // 食い込んでいたら押し戻す
      }
    }
    e.x += e.vx * h;
    e.y += e.vy * h;
    // 有限マップ: ボスも壁の内側に
    const bbw = G.MAP_W / 2 - G.WALL - e.r, bbh = G.MAP_H / 2 - G.WALL - e.r;
    if (e.x < -bbw) e.x = -bbw; else if (e.x > bbw) e.x = bbw;
    if (e.y < -bbh) e.y = -bbh; else if (e.y > bbh) e.y = bbh;
  }

  // ---------------- player projectiles ----------------
  ENT.PROJ_SPD = 0.72;    // 自機弾の弾速倍率(視認性のため一律減速)
  ENT.PROJ_LIFE = 1.18;   // 減速ぶん寿命を伸ばし射程を概ね維持
  ENT.spawnProj = o => {
    const run = G.run;
    const pr = run.pr.obtain();
    pr.kind = o.kind;
    pr.x = o.x; pr.y = o.y;
    pr.vx = (o.vx || 0) * ENT.PROJ_SPD; pr.vy = (o.vy || 0) * ENT.PROJ_SPD;   // 一律減速
    pr.src = o.src || run._fireSrc || null;   // ダメ集計の帰属(発火中の得物)
    pr.dmg = o.dmg; pr.r = (o.r || 6) * 1.3 * (run._chargeSize || 1);   // 弾サイズ1.3倍(全プレイヤー弾) + 気溜めの拡大
    pr.cscale = run._chargeSize || 1;   // 気溜めの拡大を見た目(描画スケール)にも反映するため保持
    pr.pierce = o.pierce !== undefined ? o.pierce : 1;
    const ps = run.player.stats;
    if (pr.pierce < 900) pr.pierce += ps.pierce || 0;     // 宝具「貫きの鏃」(無限貫通系は対象外)
    pr.bounceLeft = (o.bounce || 0) + (ps.bounce || 0);   // 手裏剣固有 + 宝具「跳ね鞠」
    if (pr.bounceLeft > 0 && run.reso.mariuta) pr.bounceLeft++;   // 共鳴「鞠唄」
    pr.life = (o.life || 3) * ENT.PROJ_LIFE;   // 減速ぶん寿命を伸ばし射程維持
    pr.t = 0;
    pr.spin = G.rand(G.TAU);
    pr.gold = !!o.gold;
    pr.crit = o.crit || 0;
    pr.hitSet.clear();
    pr.phase = 'out';
    pr.range = o.range || 0;
    pr.traveled = 0;
    pr.maxHits = o.maxHits || 1;
    pr.angVel = o.angVel || 0;
    pr.hitCounts = pr.hitCounts || new Map();
    pr.hitCounts.clear();
    return pr;
  };

  ENT.updateProjs = h => {
    const run = G.run;
    const p = run.player;
    const pool = run.pr;
    for (let i = pool.act.length - 1; i >= 0; i--) {
      const pr = pool.act[i];
      pr.t += h;
      pr.life -= h;
      if (pr.life <= 0) { pool.releaseAt(i); continue; }

      if (pr.kind === 'kitsunebi') {
        // homing steering
        const tgt = ENT.nearestEnemy(pr.x, pr.y, 320);
        if (tgt) {
          const want = G.angleTo(pr.x, pr.y, tgt.x, tgt.y);
          const cur = Math.atan2(pr.vy, pr.vx);
          let diff = want - cur;
          while (diff > Math.PI) diff -= G.TAU;
          while (diff < -Math.PI) diff += G.TAU;
          const turn = G.clamp(diff, -4.8 * h, 4.8 * h);
          const sp = Math.hypot(pr.vx, pr.vy);
          pr.vx = Math.cos(cur + turn) * sp;
          pr.vy = Math.sin(cur + turn) * sp;
        }
        if (G.chance(0.5)) G.fx.trail(pr.x, pr.y, 'rgba(110,225,255,0.5)', 3.4, 0.32);
      } else if (pr.kind === 'juzu') {
        if (pr.phase === 'out') {
          pr.traveled += Math.hypot(pr.vx, pr.vy) * h;
          if (pr.traveled >= pr.range) { pr.phase = 'back'; pr.hitSet.clear(); }
        } else {
          const a = G.angleTo(pr.x, pr.y, p.x, p.y);
          const sp = Math.hypot(pr.vx, pr.vy) * 1.04;
          pr.vx = Math.cos(a) * sp;
          pr.vy = Math.sin(a) * sp;
          if (G.dist2(pr.x, pr.y, p.x, p.y) < 26 * 26) { pool.releaseAt(i); continue; }
        }
        pr.spin += h * 9;
      } else if (pr.kind === 'ofuda') {
        pr.spin += h * 14;
        if (pr.gold && G.chance(0.4)) G.fx.trail(pr.x, pr.y, 'rgba(255,209,102,0.45)', 2.6, 0.25);
      } else if (pr.kind === 'hamaya') {
        if (run.syn && run.syn.hiya) {   // 相乗「狐矢」: 狐火に導かれ破魔矢が緩く敵を追尾
          const tgt = ENT.nearestEnemy(pr.x, pr.y, 360);
          if (tgt) {
            const want = G.angleTo(pr.x, pr.y, tgt.x, tgt.y);
            const cur = Math.atan2(pr.vy, pr.vx);
            let diff = want - cur; while (diff > Math.PI) diff -= G.TAU; while (diff < -Math.PI) diff += G.TAU;
            const turn = G.clamp(diff, -2.4 * h, 2.4 * h);   // 緩い追尾 (狐火 kitsunebi の 4.8 より弱い)
            const sp = Math.hypot(pr.vx, pr.vy);
            pr.vx = Math.cos(cur + turn) * sp; pr.vy = Math.sin(cur + turn) * sp;
          }
        }
        if (G.chance(0.85)) G.fx.trail(pr.x, pr.y, 'rgba(255,240,200,0.7)', 3.2, 0.18);
      } else if (pr.kind === 'komainu') {
        if (pr.home) {   // 百獣招来: まだ貫いていない最寄りの敵へ吸い込まれるように追尾(貫通済みは無視して群れを狩り進む)
          G.grid.queryCircle(pr.x, pr.y, 540, G.QBUF2);
          let best = null, bd = 1e18;
          for (let z = 0; z < G.QBUF2.length; z++) { const e = G.QBUF2[z]; if (e.dead || pr.hitSet.has(e.id)) continue; const d = G.dist2(pr.x, pr.y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
          if (best) {
            const want = G.angleTo(pr.x, pr.y, best.x, best.y), cur = Math.atan2(pr.vy, pr.vx);
            let diff = want - cur; while (diff > Math.PI) diff -= G.TAU; while (diff < -Math.PI) diff += G.TAU;
            const turn = G.clamp(diff, -3.8 * h, 3.8 * h);
            const sp = Math.hypot(pr.vx, pr.vy);
            pr.vx = Math.cos(cur + turn) * sp; pr.vy = Math.sin(cur + turn) * sp;
          }
          if (G.chance(0.4)) G.fx.trail(pr.x, pr.y, 'rgba(255,209,140,0.45)', 4.2, 0.26);
        }
      } else if (pr.kind === 'shuriken') {
        pr.spin += h * 22;
      } else if (pr.kind === 'tama') {
        if (run.syn && run.syn.gouka) {   // 相乗「業火」: 弾の軌道上に霊炎を曳く(残り火の死亡時とは別=飛翔経路を焼く)
          pr._goukaT = (pr._goukaT || 0) - h;
          if (pr._goukaT <= 0) {
            pr._goukaT = 0.3;   // ナーフ: 0.07→0.15→0.3 (火種をさらに疎に)
            run.flames.push({ x: pr.x, y: pr.y, t: 0, life: 1.4, r: 38, dmg: pr.dmg * 0.26, tick: 0.3, tickT: 0, syn: true, src: '業火' });   // ナーフ: dmg 0.35→0.26 / life 1.6→1.4
            if (run.flames.length > 40) run.flames.shift();   // ナーフ: 上限 60→40
          }
        }
        G.fx.trail(pr.x, pr.y, 'rgba(255,210,140,0.7)', 2.6, 0.14);
      } else if (pr.kind === 'hiken') {
        if (G.chance(0.6)) G.fx.trail(pr.x, pr.y, 'rgba(150,220,255,0.5)', 2.8, 0.2);
      } else if (pr.kind === 'raiyari') {
        if (G.chance(0.95)) G.fx.trail(pr.x, pr.y, 'rgba(120,215,255,0.72)', 5.5, 0.2);
        if (G.chance(0.38)) G.fx.spark(pr.x, pr.y, '#dff8ff', 2, 100, 0.14);
        pr.zapT = (pr.zapT || 0) - h;
        if (pr.zapT <= 0) {   // 周辺感電: 針の通り道の周囲を定期に小ダメ+鈍足
          pr.zapT = 0.09;
          const zr = pr.zapR || 80;
          G.grid.queryCircle(pr.x, pr.y, zr, G.QBUF2);
          const zb = G.QBUF2.slice();
          for (let z = 0; z < zb.length; z++) {
            const e = zb[z]; if (e.dead) continue;
            ENT.damageEnemy(e, pr.dmg * 0.3, { src: pr.src });
            e.slowT = Math.max(e.slowT || 0, 0.7); e.slowF = Math.max(e.slowF || 0, pr.slow || 0.4);
          }
          if (G.cam.onScreen(pr.x, pr.y, zr)) {
            G.fx.spark(pr.x, pr.y, '#cfeaff', 6, 180, 0.18);
            pr.raiPulseT = (pr.raiPulseT || 0) - 0.09;
            if (pr.raiPulseT <= 0) {
              pr.raiPulseT = 0.22;
              G.fx.ring(pr.x, pr.y, { r0: 5, r1: Math.min(zr, 64), life: 0.18, color: 'rgba(125,220,255,0.72)', width: 2.5 });
            }
          }
        }
      }

      pr.x += pr.vx * h;
      pr.y += pr.vy * h;

      // collide enemies
      G.grid.queryCircle(pr.x, pr.y, pr.r, G.QBUF);
      let died = false;
      for (let q = 0; q < G.QBUF.length; q++) {
        const e = G.QBUF[q];
        if (pr.kind === 'juzu') {
          const cnt = pr.hitCounts.get(e.id) || 0;
          if (cnt >= pr.maxHits || pr.hitSet.has(e.id)) continue;
          pr.hitSet.add(e.id);
          pr.hitCounts.set(e.id, cnt + 1);
          ENT.damageEnemy(e, pr.dmg, { src: pr.src, kb: 240, kx: pr.vx / (Math.hypot(pr.vx, pr.vy) || 1), ky: pr.vy / (Math.hypot(pr.vx, pr.vy) || 1), crit: G.chance(pr.crit) });
          continue;
        }
        if (pr.hitSet.has(e.id)) continue;
        pr.hitSet.add(e.id);
        const m = Math.hypot(pr.vx, pr.vy) || 1;
        const kb = pr.kind === 'komainu' ? 330 : pr.kind === 'hamaya' ? 200 : pr.kind === 'tama' ? 280 : 130;
        ENT.damageEnemy(e, pr.dmg, { src: pr.src, kb, kx: pr.vx / m, ky: pr.vy / m, crit: G.chance(pr.crit) });
        // 祓印: 御札(ofuda)は印を刻み、3段で祓う。式神白狐(fox)は印を1つ足す。(他得物は後続スライスで)
        if (!e.dead) {
          if (pr.kind === 'ofuda') {
            if ((e.hmark || 0) >= 3) ENT.haraiPurge(e, pr.dmg * 0.8, { kx: pr.vx / m, ky: pr.vy / m });
            else if (G.chance(0.5 + ((run.player.stats.haraiChanceAdd) || 0))) ENT.addHarai(e, 1);
          } else if (pr.kind === 'zangetsu') {
            if ((e.hmark || 0) >= 3) ENT.haraiPurge(e, pr.dmg * 0.8, { kx: pr.vx / m, ky: pr.vy / m });   // 残月: 印3を貫きながら祓う
          } else if (pr.kind === 'sumiuchi') {
            ENT.addHarai(e, 1);   // 墨打ち=印の撒き手: 当てた妖には確実に刻む(御札との差別化=低火力・確実マーク)
            if (G.chance(0.55)) {   // さらに墨が飛沫いて近接の妖へ印が散る(=印の伝播役。御札は単体火力寄り)
              G.grid.queryCircle(e.x, e.y, 58, G.QBUF2);
              for (let z = 0; z < G.QBUF2.length; z++) { const o = G.QBUF2[z]; if (o !== e && !o.dead) { ENT.addHarai(o, 1); G.fx.spark(o.x, o.y - o.r * 0.3, '#3a3550', 2, 60, 0.2); break; } }
            }
          } else if (pr.kind === 'fox' || pr.kind === 'kitsunebi') {
            if (G.chance(0.22)) ENT.addHarai(e, 1);
          }
        }
        // 相乗「電纏」(雷霆符+手裏剣): 手裏剣の命中点から最寄りの妖へ電撃が伝う
        if (pr.kind === 'shuriken' && run.syn && run.syn.denten) {
          let t2 = null, bd2 = 150 * 150;
          const en3 = run.en.act;
          for (let j = 0; j < en3.length; j++) {
            const c3 = en3[j];
            if (c3.dead || c3 === e) continue;
            const d2 = G.dist2(e.x, e.y, c3.x, c3.y);
            if (d2 < bd2) { bd2 = d2; t2 = c3; }
          }
          if (t2) {
            G.fx.bolt(e.x, e.y, t2.x, t2.y);
            G.fx.spark(t2.x, t2.y, '#9fe6ff', 4, 130, 0.2);
            ENT.damageEnemy(t2, pr.dmg * 0.45, { src: '電纏', crit: G.chance(pr.crit) });
          }
        }
        // 相乗「祟り撃ち」(呪詛+火縄銃): 呪われた妖へ処刑の追撃 (雑魚/精鋭は最大HP%で処刑、ボスは控えめ)
        if (pr.kind === 'tama' && run.syn && run.syn.tatari && e.curseT > 0 && !e.dead) {
          ENT.damageEnemy(e, pr.dmg * 1.2 + e.maxHp * (e.boss ? 0.03 : 0.12), { src: '祟り撃ち', crit: true });
          G.fx.ring(e.x, e.y, { r0: 6, r1: 64, life: 0.32, color: 'rgba(200,160,255,0.92)', width: 3 });
          G.fx.spark(e.x, e.y, '#c8a0ff', 9, 180, 0.32);
        }
        if (run.reso.senshin && pr.pierce < 900) pr.dmg *= 1.12;   // 共鳴「穿心」: 穿つほど鋭く
        pr.pierce--;
        if (pr.pierce <= 0) {
          // 跳弾: ricochet to a fresh target instead of dying
          if (pr.bounceLeft > 0) {
            const br = run.reso.mariuta ? 430 : 240;   // 共鳴「鞠唄」: 跳弾の間合い拡張
            let tgt = null, bd = br * br;
            const en2 = G.run.en.act;
            for (let j = 0; j < en2.length; j++) {
              const c2 = en2[j];
              if (c2.dead || pr.hitSet.has(c2.id)) continue;
              const d2 = G.dist2(pr.x, pr.y, c2.x, c2.y);
              if (d2 < bd) { bd = d2; tgt = c2; }
            }
            if (tgt) {
              const a2 = G.angleTo(pr.x, pr.y, tgt.x, tgt.y);
              const sp2 = Math.hypot(pr.vx, pr.vy);
              pr.vx = Math.cos(a2) * sp2;
              pr.vy = Math.sin(a2) * sp2;
              pr.bounceLeft--;
              pr.pierce = 1;
              pr.life = Math.max(pr.life, 0.6);
              G.fx.trail(pr.x, pr.y, 'rgba(200,210,230,0.6)', 3, 0.2);
              continue;
            }
          }
          died = true; break;
        }
      }
      if (!died) ENT.hitToros(pr.x, pr.y, pr.r);
      if (died) {
        G.fx.spark(pr.x, pr.y, pr.kind === 'kitsunebi' ? '#6ee8ff' : '#ffe9b8', 3, 90, 0.25);
        pool.releaseAt(i);
      }
    }
  };

  // ---------------- slashes (instant damage, lingering visual) ----------------
  ENT.doSlash = (cx, cy, dirA, range, arc, dmg, critC) => {
    const run = G.run;
    G.grid.queryCircle(cx, cy, range + 128, G.QBUF);
    const r0 = range * 0.62;   // 切り裂く一閃: 扇の先端の帯(r0〜range)だけ当たる。根本(手前)は薙がない
    for (let q = 0; q < G.QBUF.length; q++) {
      const e = G.QBUF[q];
      const dx = e.x - cx, dy = e.y - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > range + e.r || dist < r0 - e.r) continue;
      const a = Math.atan2(dy, dx);
      let diff = a - dirA;
      while (diff > Math.PI) diff -= G.TAU;
      while (diff < -Math.PI) diff += G.TAU;
      const radiusAngle = dist <= e.r ? Math.PI : Math.asin(Math.min(1, e.r / Math.max(dist, 0.001)));
      if (Math.abs(diff) <= arc / 2 + radiusAngle) {
        ENT.damageEnemy(e, dmg, { kb: 340, kx: Math.cos(a), ky: Math.sin(a), crit: G.chance(critC) });
      }
    }
    ENT.hitToros(cx + Math.cos(dirA) * range * 0.82, cy + Math.sin(dirA) * range * 0.82, range * 0.4);
    run.slashes.push({ x: cx, y: cy, a: dirA, range, arc, life: 0.16, maxLife: 0.16 });   // 切り裂く三日月のみ(旧ラスター'slash'はFX二重の原因→廃止)
    G.audio.sfx('slash');
  };

  // ---------------- laser beam (斎光): instant hitscan, reflects off the arena walls ----------------
  // 照準方向へ光条を放ち、reflects 回まで塀(マップ境界)で反射して折れ線を作る。
  ENT.castBeam = (x, y, ang, reflects, maxLen) => {
    const hw = G.MAP_W / 2 - G.WALL, hh = G.MAP_H / 2 - G.WALL;
    const pts = [[x, y]];
    let cx = x, cy = y, dx = Math.cos(ang), dy = Math.sin(ang), rem = maxLen;
    for (let r = 0; r <= reflects; r++) {
      let t = rem, hit = null;
      if (dx > 1e-6) { const tt = (hw - cx) / dx; if (tt >= 0 && tt < t) { t = tt; hit = 'x'; } }
      else if (dx < -1e-6) { const tt = (-hw - cx) / dx; if (tt >= 0 && tt < t) { t = tt; hit = 'x'; } }
      if (dy > 1e-6) { const tt = (hh - cy) / dy; if (tt >= 0 && tt < t) { t = tt; hit = 'y'; } }
      else if (dy < -1e-6) { const tt = (-hh - cy) / dy; if (tt >= 0 && tt < t) { t = tt; hit = 'y'; } }
      cx += dx * t; cy += dy * t; rem -= t;
      pts.push([cx, cy]);
      if (!hit || rem <= 1 || r === reflects) break;
      if (hit === 'x') dx = -dx; else dy = -dy;
      cx += dx * 0.5; cy += dy * 0.5;   // nudge off the wall so we don't re-hit it
    }
    return pts;
  };

  // 折れ線(pts)沿いの妖へ一度だけダメージ (point→segment 距離)
  ENT.beamDamage = (pts, halfW, dmg, critC) => {
    const en = G.run.en.act;
    const a0 = Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]);
    const kx = Math.cos(a0), ky = Math.sin(a0);
    for (let q = 0; q < en.length; q++) {
      const e = en[q];
      if (e.dead) continue;
      const rr = halfW + e.r;
      let hit = false;
      for (let s = 0; s < pts.length - 1 && !hit; s++) {
        const ax = pts[s][0], ay = pts[s][1];
        const vx = pts[s + 1][0] - ax, vy = pts[s + 1][1] - ay;
        const L2 = vx * vx + vy * vy || 1;
        let tt = ((e.x - ax) * vx + (e.y - ay) * vy) / L2;
        tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
        const ddx = e.x - (ax + vx * tt), ddy = e.y - (ay + vy * tt);
        if (ddx * ddx + ddy * ddy <= rr * rr) hit = true;
      }
      if (hit) ENT.damageEnemy(e, dmg, { kb: 120, kx, ky, crit: G.chance(critC) });
    }
  };

  ENT.updateSlashes = h => {
    const run = G.run;
    for (let i = run.slashes.length - 1; i >= 0; i--) {
      run.slashes[i].life -= h;
      if (run.slashes[i].life <= 0) run.slashes.splice(i, 1);
    }
    for (let i = run.beams.length - 1; i >= 0; i--) {
      run.beams[i].life -= h;
      if (run.beams[i].life <= 0) run.beams.splice(i, 1);
    }
    // 梵鐘: drop, then GONG
    for (let i = run.bells.length - 1; i >= 0; i--) {
      const b = run.bells[i];
      b.t += h;
      if (!b.hit && b.t >= 0.24) {
        b.hit = true;
        G.audio.sfx('gong');
        G.cam.add(5.5);
        G.cam.punch(1.035);
        G.fx.ring(b.x, b.y, { r0: 24, r1: b.r * 1.15, life: 0.5, color: 'rgba(255,232,180,0.95)', width: 5 });
        G.fx.ring(b.x, b.y, { r0: 12, r1: b.r * 0.8, life: 0.38, color: 'rgba(255,255,255,0.8)' });
        G.fx.ring(b.x, b.y, { r0: b.r * 0.5, r1: b.r * 1.55, life: 0.62, color: 'rgba(255,210,140,0.55)', width: 3 });   // 鳴り響く撞音の波(視認補強)
        G.fx.spark(b.x, b.y, '#ffe7a0', 14, 280, 0.45);
        G.grid.queryCircle(b.x, b.y, b.r, G.QBUF2);
        const buf = G.QBUF2.slice();   // 撃破時のQBUF2再query対策。雷鳴サブループも同じ対象集合を使う
        for (let q = 0; q < buf.length; q++) {
          const e = buf[q];
          const a = G.angleTo(b.x, b.y, e.x, e.y);
          if (b.stun) { e.slowT = 0.9; e.slowF = 1; }
          ENT.damageEnemy(e, b.dmg, { src: b.src, kb: 420, kx: Math.cos(a), ky: Math.sin(a), crit: G.chance(b.crit) });
        }
        // 相乗「雷鳴」(梵鐘+雷霆符): 撞音の範囲内に落雷が走る
        if (run.syn && run.syn.raimei) {
          const n = Math.min(5, buf.length);
          for (let q = 0; q < n; q++) {
            const e = buf[q];
            if (e.dead) continue;
            G.fx.bolt(e.x + G.rand(-26, 26), e.y - 280, e.x, e.y);
            G.fx.spark(e.x, e.y, '#cfeaff', 6, 150);
            ENT.damageEnemy(e, b.dmg * 0.6, { src: '雷鳴', crit: G.chance(b.crit) });
          }
          if (n > 0) G.audio.sfx('bolt');
        }
        ENT.hitToros(b.x, b.y, b.r);
      }
      if (b.t > 0.95) run.bells.splice(i, 1);
    }
    // 炎の足跡 (火渡りの行): 地面の霊炎パッチが滞在中の妖を tick で灼く
    for (let i = run.flames.length - 1; i >= 0; i--) {
      const fl = run.flames[i];
      fl.t += h;
      fl.tickT -= h;
      if (fl.tickT <= 0) {
        fl.tickT = fl.tick;
        G.grid.queryCircle(fl.x, fl.y, fl.r, G.QBUF2);
        const buf = G.QBUF2.slice();   // 撃破時のQBUF2再queryによる反復破壊を防ぐ
        for (let q = 0; q < buf.length; q++) {
          const e = buf[q];
          if (e.dead) continue;
          if (fl.slow) { e.slowT = Math.max(e.slowT, 0.7); e.slowF = Math.max(e.slowF, fl.slow); }   // 清め塩: 鈍足
          ENT.damageEnemy(e, fl.dmg * (fl.syn ? 1 : G.sys.effMight()), { src: fl.src });
        }
      }
      // 立ち上る火の粉 / 霞は淡い冷気の漂い (控えめに撒く)
      if (G.chance(0.18) && G.cam.onScreen(fl.x, fl.y, fl.r)) {
        if (fl.mist) G.fx.spark(fl.x + G.rand(-fl.r * 0.45, fl.r * 0.45), fl.y + G.rand(-fl.r * 0.25, fl.r * 0.25), '#cfe6ff', 1, 36, 0.6);
        else G.fx.spark(fl.x + G.rand(-fl.r * 0.5, fl.r * 0.5), fl.y + G.rand(-fl.r * 0.25, fl.r * 0.25),
          G.chance(0.5) ? '#ffd070' : '#ff7a28', 1, 60, 0.5);
      }
      if (fl.t >= fl.life) run.flames.splice(i, 1);
    }
    // 雷神招来: 頭上に展開した雷雲が一定間隔で画面の妖へ落雷(感電付き)。持続フィールド=雷霆符(単発)との差別化
    for (let i = run.storms.length - 1; i >= 0; i--) {
      const sm = run.storms[i];
      sm.t += h;
      sm.x = run.player.x; sm.y = run.player.y;   // 雲は主の頭上に追従
      sm.strikeT -= h;
      if (sm.strikeT <= 0 && sm.t < sm.life) {
        sm.strikeT = sm.every;
        const cands = run.en.act.filter(e => !e.dead && G.cam.onScreen(e.x, e.y, 30));
        for (let s = 0; s < sm.perPulse && cands.length; s++) {
          const e = cands.splice((Math.random() * cands.length) | 0, 1)[0];
          G.fx.bolt(e.x + G.rand(-30, 30), e.y - 300, e.x, e.y);
          if (G.fx.anim) G.fx.anim(e.x, e.y, 'lightning', { scale: 1.9, dur: 0.4, add: true });
          G.fx.ring(e.x, e.y, { r0: 8, r1: sm.aoe, life: 0.32, color: 'rgba(180,232,255,0.85)', width: 3 });
          G.grid.queryCircle(e.x, e.y, sm.aoe, G.QBUF2);
          const buf = G.QBUF2.slice();
          for (let q = 0; q < buf.length; q++) {
            const o = buf[q]; if (o.dead) continue;
            ENT.damageEnemy(o, sm.dmg, { src: sm.src, crit: G.chance(sm.crit) });
            o.slowT = Math.max(o.slowT || 0, 0.6); o.slowF = Math.max(o.slowF || 0, 0.45);   // 感電=鈍足
          }
        }
        G.audio.sfx('bolt', { p: 1.1 });
      }
      if (sm.t >= sm.life) run.storms.splice(i, 1);
    }
    // 単発大技の予告(収束する光輪)。当たり判定なし=演出のみ。寿命到達で fire 側の delayed が本体を発火
    for (let i = run.warns.length - 1; i >= 0; i--) {
      const wn = run.warns[i]; wn.t += h;
      if (wn.t >= wn.life) run.warns.splice(i, 1);
    }
    // 反閇の足跡: マーカーの寿命管理(陣の判定は fire 側)
    for (let i = run.steps.length - 1; i >= 0; i--) {
      run.steps[i].t += h;
      if (run.steps[i].t >= run.steps[i].life) run.steps.splice(i, 1);
    }
    // 封字曼荼羅: 圏内を tick で削り鈍足化、祓印を保持。解ける刹那に清爆。
    for (let i = run.mandalas.length - 1; i >= 0; i--) {
      const m = run.mandalas[i];
      m.t += h; m.tickT -= h;
      if (m.tickT <= 0) {
        m.tickT = m.tick;
        G.grid.queryCircle(m.x, m.y, m.r, G.QBUF2);
        const buf = G.QBUF2.slice();   // damageEnemy→呪詛伝播が QBUF2 を再利用するためコピー
        for (let q = 0; q < buf.length; q++) {
          const e = buf[q];
          if (e.dead) continue;
          e.slowT = Math.max(e.slowT, 0.8); e.slowF = Math.max(e.slowF, 0.25);
          if ((e.hmark || 0) > 0) e.hmarkT = Math.max(e.hmarkT, 1.5);   // 祓印が消えにくい
          ENT.damageEnemy(e, m.dmg * G.sys.effMight(), { src: m.src });
        }
      }
      if (m.t >= m.life) {
        G.grid.queryCircle(m.x, m.y, m.r, G.QBUF2);
        const buf = G.QBUF2.slice();
        for (let q = 0; q < buf.length; q++) { const e = buf[q]; if (!e.dead) ENT.damageEnemy(e, m.dmg * 4 * G.sys.effMight(), { src: m.src, crit: true }); }
        G.fx.ring(m.x, m.y, { r0: 10, r1: m.r, life: 0.4, color: 'rgba(255,240,190,0.9)', width: 5 });
        G.fx.spark(m.x, m.y, '#fff6cd', 14, 260, 0.4);
        run.mandalas.splice(i, 1);
      }
    }
    // 鎖鎌の旋回ビジュアル
    for (let i = run.whirls.length - 1; i >= 0; i--) {
      run.whirls[i].t += h;
      if (run.whirls[i].t >= run.whirls[i].life) run.whirls.splice(i, 1);
    }
    // 封印札 (mines)
    for (let i = run.mines.length - 1; i >= 0; i--) {
      const m = run.mines[i];
      m.t += h;
      if (!m.armed) {
        if (m.t > 0.45) m.armed = true;
        continue;
      }
      G.grid.queryCircle(m.x, m.y, 16, G.QBUF2);
      if (G.QBUF2.length) {
        // detonate
        G.fx.ring(m.x, m.y, { r0: 12, r1: m.aoe * 1.1, life: 0.35, color: 'rgba(255,150,90,0.95)', width: 4 });
        G.fx.spark(m.x, m.y, '#ff9a5c', 10, 220, 0.35);
        G.fx.flash = Math.min(0.3, G.fx.flash + 0.08);
        G.audio.sfx('bolt');
        G.cam.add(2);
        G.grid.queryCircle(m.x, m.y, m.aoe, G.QBUF2);
        const buf = G.QBUF2.slice();   // 撃破時のQBUF2再queryによる反復破壊を防ぐ
        for (let q = 0; q < buf.length; q++) {
          const e = buf[q];
          const a = G.angleTo(m.x, m.y, e.x, e.y);
          ENT.damageEnemy(e, m.dmg, { src: m.src, kb: 260, kx: Math.cos(a), ky: Math.sin(a), crit: G.chance(m.crit) });
        }
        run.mines.splice(i, 1);
      }
    }
  };

  // ---------------- 物理死体 (corpse physics) ----------------
  // 摩擦で減速しつつ回転して滑り、速いうちは生者を撥ね飛ばす
  ENT.updateCorpses = h => {
    const run = G.run;
    const cs = run.corpses;
    const fr = Math.exp(-3.4 * h);
    for (let i = cs.length - 1; i >= 0; i--) {
      const c = cs[i];
      c.life -= h;
      if (c.life <= 0) { cs.splice(i, 1); continue; }
      c.x += c.vx * h;
      c.y += c.vy * h;
      c.vx *= fr; c.vy *= fr;
      c.rot += c.rv * h;
      c.rv *= fr;
      const sp = Math.hypot(c.vx, c.vy);
      // 爆散死体(boom)は彗星のような尾を曳いて突き進む
      if (c.boom && sp > 240 && G.chance(0.5) && G.cam.onScreen(c.x, c.y)) {
        G.fx.trail(c.x, c.y, 'rgba(255,150,70,0.55)', 6, 0.22);
      }
      if (sp > 190 && c.hits > 0) {
        const cr = c.cr || 13;
        const ux = c.vx / sp, uy = c.vy / sp;   // 進行(吹き飛ぶ)方向
        G.grid.queryCircle(c.x, c.y, cr, G.QBUF);
        for (let q = 0; q < G.QBUF.length; q++) {
          const e = G.QBUF[q];
          if (e.dead || c.hitIds.includes(e.id)) continue;
          const vx = e.x - c.x, vy = e.y - c.y;   // 進行方向90°扇の外(横/後ろ)は撥ねない
          const d = Math.hypot(vx, vy);
          if (d > 1 && (vx / d) * ux + (vy / d) * uy < FAN90) continue;
          c.hitIds.push(e.id);
          ENT.damageEnemy(e, c.dmg, { src: '超過撃破', boomChild: true, kb: c.boom ? 380 : 300, kx: ux, ky: uy });
          c.hits--;
          if (c.boom) {
            // 爆散死体は完全には止まらず、接触のたびに小さく爆ぜて周囲を巻き込みながら進む
            c.vx *= 0.82; c.vy *= 0.82;
            superBurst(c.x, c.y, (c.power || 1) * 0.6, ux, uy);
          } else {
            c.vx *= 0.6; c.vy *= 0.6;
            if (G.cam.onScreen(c.x, c.y)) G.fx.spark(c.x, c.y, '#ffd9a8', 4, 130, 0.25);
          }
          break;
        }
      }
    }
  };

  // ---------------- foxes (orbiters) ----------------
  ENT.updateFoxes = h => {
    const run = G.run;
    if (!run.foxes.length) return;
    const w = run.weapons.find(w => w.id === 'fox');
    if (!w) return;
    const st = G.sys.calcW(w);
    const p = run.player;
    const area = p.stats.area || 1;
    const leash = st.radius * area + 120;            // プレイヤー周辺の行動半径(この内の敵に自由に襲いかかる)
    const leash2 = leash * leash;
    const spd = 300 + (st.spin || 2) * 60;           // 式神の機動速度(旧spinを速度に転用)
    const onibi = run.syn && run.syn.onibi;           // 相乗「狐火奔り」(式神+狐火)
    const n = run.foxes.length;
    for (let i = 0; i < n; i++) {
      const f = run.foxes[i];
      if (f.vx === undefined) { f.vx = 0; f.vy = 0; }
      // 行動範囲内の最寄りの敵へ自分から襲いかかる。範囲外なら主の周りを緩く漂って待機
      let tx, ty, tgt = ENT.nearestEnemy(f.x, f.y, leash);
      if (tgt && G.dist2(tgt.x, tgt.y, p.x, p.y) > leash2) tgt = null;   // 主から離れた敵は追わない=張り付き維持
      if (tgt) { tx = tgt.x; ty = tgt.y; }
      else { const a = run.t * 1.6 + i / n * G.TAU, idle = st.radius * area * 0.55; tx = p.x + Math.cos(a) * idle; ty = p.y + Math.sin(a) * idle; }
      const dpx = f.x - p.x, dpy = f.y - p.y;
      if (dpx * dpx + dpy * dpy > leash2) { tx = p.x; ty = p.y; }   // 離れすぎたら主へ引き戻す
      const ang = G.angleTo(f.x, f.y, tx, ty), k = Math.min(1, 9 * h);
      f.vx += (Math.cos(ang) * spd - f.vx) * k;
      f.vy += (Math.sin(ang) * spd - f.vy) * k;
      f.x += f.vx * h; f.y += f.vy * h;
      f.a = Math.atan2(f.vy, f.vx);
      if (onibi && G.chance(0.6)) G.fx.trail(f.x, f.y, 'rgba(120,210,255,0.6)', 4.5, 0.32);   // 青い狐火の尾
      G.grid.queryCircle(f.x, f.y, 13, G.QBUF);
      for (let q = 0; q < G.QBUF.length; q++) {
        const e = G.QBUF[q];
        if (run.t - e.foxT > st.hitCd) {
          e.foxT = run.t;
          const ka = G.angleTo(f.x, f.y, e.x, e.y);
          ENT.damageEnemy(e, st.dmg * G.sys.effMight() * (onibi ? 1.35 : 1), { src: 'fox', kb: 200, kx: Math.cos(ka), ky: Math.sin(ka), crit: G.chance(0.05 + (p.stats.crit || 0)) });
          if (onibi) G.fx.spark(e.x, e.y - 4, '#7fd0ff', 3, 90, 0.22);   // 灼かれる青火
        }
      }
      if (G.chance(0.25)) ENT.hitToros(f.x, f.y, 13);
    }
  };

  // ---------------- enemy orbs ----------------
  ENT.updateOrbs = h => {
    const run = G.run;
    const p = run.player;
    const pool = run.ep;
    for (let i = pool.act.length - 1; i >= 0; i--) {
      const o = pool.act[i];
      o.t += h;
      o.life -= h;
      o.x += o.vx * h;
      o.y += o.vy * h;
      if (o.life <= 0) { pool.releaseAt(i); continue; }
      if (p.alive) {
        const rr = o.r + p.r;
        if (G.dist2(o.x, o.y, p.x, p.y) < rr * rr) {
          ENT.damagePlayer(o.dmg, o.src);
          pool.releaseAt(i);
        }
      }
    }
  };

  // ---------------- gems & items ----------------
  ENT.updateGems = h => {
    const run = G.run;
    const p = run.player;
    const pool = run.gem;
    const lampMagnet = (run.lampStage > 0 && (run.lampAura.id || run.lampLastId) === 'seiran') ? 1 + 0.7 * (run.lampPow || 1) : 1;   // 残り火対応
    const magR = 130 * p.stats.magnet * lampMagnet;   // 吸引宝具廃止の補填: 基礎回収半径を90→130(取りこぼし減・casual救済)
    const magR2 = magR * magR;
    run.gemStreakT -= h;
    if (run.gemStreakT <= 0) run.gemStreak = 0;

    for (let i = pool.act.length - 1; i >= 0; i--) {
      const g = pool.act[i];
      g.t += h;
      if (!g.attract) {
        if (G.dist2(g.x, g.y, p.x, p.y) < magR2) g.attract = true;
      } else {
        const a = G.angleTo(g.x, g.y, p.x, p.y);
        const sp = Math.min(760, (Math.hypot(g.vx, g.vy) || 120) + 1500 * h);
        g.vx = Math.cos(a) * sp;
        g.vy = Math.sin(a) * sp;
        g.x += g.vx * h;
        g.y += g.vy * h;
        if (G.chance(0.22)) {
          G.fx.trail(g.x, g.y, g.v >= 20 ? 'rgba(255,209,102,0.5)' : g.v >= 5 ? 'rgba(177,140,255,0.45)' : 'rgba(110,232,255,0.4)', 2.4, 0.22);
        }
        if (G.dist2(g.x, g.y, p.x, p.y) < 20 * 20) {
          run.gemStreak++;
          run.gemStreakT = 1.1;
          run.souls += g.v;
          G.sys.gainXp(g.v);
          G.audio.sfx('gem', { s: run.gemStreak });
          G.fx.spark(p.x, p.y - 8, g.v >= 20 ? '#ffd166' : g.v >= 5 ? '#b18cff' : '#6ee8ff', 3, 70, 0.25);
          const soulLv = run.talents.tamayori || 0;
          if (soulLv) {
            run.talentState.souls++;
            const need = [0, 18, 14, 10][soulLv];
            if (run.talentState.souls >= need) {
              run.talentState.souls = 0;
              const radius = [0, 260, 340, 440][soulLv];
              const cut = [0, 0.7, 1.1, 1.6][soulLv];
              for (const soul of pool.act) {
                if (G.dist2(soul.x, soul.y, p.x, p.y) < radius * radius) soul.attract = true;
              }
              run.skill.cdT = Math.max(0, run.skill.cdT - cut);
              run.wardCdT = Math.max(0, run.wardCdT - cut);
              G.audio.sfx('soulcall');
              G.fx.ring(p.x, p.y, { r0: 8, r1: radius, life: 0.42, color: 'rgba(110,216,255,0.8)', width: 3 });
              G.fx.soul(p.x, p.y - 8, 8);
            }
          }
          if (run.gemStreak % 20 === 0) {
            G.fx.ring(p.x, p.y, { r0: 8, r1: 56, life: 0.3, color: 'rgba(110,232,255,0.7)', width: 2 });
          }
          pool.releaseAt(i);
        }
      }
    }
  };

  ENT.updateItems = h => {
    const run = G.run;
    const p = run.player;
    const pool = run.it;
    for (let i = pool.act.length - 1; i >= 0; i--) {
      const it = pool.act[i];
      it.t += h;
      if (G.dist2(it.x, it.y, p.x, p.y) < 24 * 24) {
        if (it.kind === 'onigiri') {
          const heal = Math.round(30 * (G.data.CHARS[run.charId].healMul || 1));
          p.hp = Math.min(p.stats.maxHp, p.hp + heal);
          G.fx.text(p.x, p.y - 18, '+' + heal, '#8ae8a0', 14);
          if (G.fx.anim) G.fx.anim(p.x, p.y, 'heal', { scale: 1.7, dur: 0.5, add: true });   // 回復の癒し光(GPT FX)
          G.audio.sfx('heal');
        } else if (it.kind === 'koban') {
          const zv = Math.round((it.v || 8) * (1 + 0.1 * ((run.hono && run.hono.zeni) || 0)));
          run.koban += zv;
          G.fx.text(p.x, p.y - 22, '+' + zv + ' 両', '#ffd166', 14);
          G.audio.sfx('coin');
          G.fx.spark(p.x, p.y - 8, '#ffd166', 4, 90, 0.3);
        } else if (it.kind === 'magnet') {
          for (const g of run.gem.act) g.attract = true;
          G.audio.sfx('magnet');
          G.fx.puffRing(p.x, p.y, 'rgba(216,162,255,0.8)', 14, 300);
        } else if (it.kind === 'bomb') {
          ENT.useBomb(p.x, p.y);
        } else if (it.kind.startsWith('buff_')) {
          const key = it.kind.slice(5);
          const cfg = G.data.BUFFS[key];
          run.buffs[key] = cfg.dur;
          if (key === 'bunshin') G.sys.rebuildFoxes();
          G.audio.sfx('powerup');
          G.fx.text(p.x, p.y - 28, cfg.name + '!', cfg.color, 18);
          G.fx.ring(p.x, p.y, { r0: 14, r1: 130, life: 0.5, color: cfg.color, width: 4 });
          G.fx.flash = Math.min(0.3, G.fx.flash + 0.16);
          G.cam.punch(1.03);
        }
        pool.releaseAt(i);
      }
    }
  };

  // ---------------- world render ----------------
  const drawList = [];

  ENT.render = ctx => {
    const run = G.run;
    const p = run.player;
    const S = G.S;
    G.fx.renderGround(ctx);

    // 反閇の足跡 (金の足型マーカー。脈動＋近接足跡を線で結び「陣が成る」予兆を可視化)
    for (const s of run.steps) {
      if (!G.cam.onScreen(s.x, s.y, 20)) continue;
      const a = G.clamp(1 - s.t / s.life, 0, 1);
      const pulse = 0.72 + 0.28 * Math.sin(run.t * 6 + s.x * 0.1);
      ctx.fillStyle = `rgba(255,228,158,${(0.72 * a * pulse).toFixed(3)})`;
      ctx.beginPath(); ctx.ellipse(s.x, s.y, 4.6, 3, 0, 0, G.TAU); ctx.fill();
    }
    for (let i = 0; i < run.steps.length; i++) {   // 近接(3つ寄れば陣)の足跡を淡い金線で結ぶ＝発動予兆
      const s1 = run.steps[i];
      if (!G.cam.onScreen(s1.x, s1.y, 64)) continue;
      for (let j = i + 1; j < run.steps.length; j++) {
        const s2 = run.steps[j];
        const d2 = G.dist2(s1.x, s1.y, s2.x, s2.y);
        if (d2 < 58 * 58) {
          const la = G.clamp(1 - Math.sqrt(d2) / 58, 0, 1) * 0.55;
          ctx.strokeStyle = `rgba(255,238,184,${la.toFixed(3)})`; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke();
        }
      }
    }
    // 封字曼荼羅 (金の二重円＋回る封字の結界ゾーン)
    for (const m of run.mandalas) {
      if (!G.cam.onScreen(m.x, m.y, m.r + 20)) continue;
      const a = G.clamp(1 - m.t / m.life, 0, 1);
      ctx.fillStyle = `rgba(255,224,150,${(0.06 * a).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, G.TAU); ctx.fill();
      ctx.strokeStyle = `rgba(255,224,150,${(0.7 * a).toFixed(3)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, G.TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r * 0.6, 0, G.TAU); ctx.stroke();
      ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(run.t * 0.5);
      ctx.beginPath(); ctx.moveTo(-m.r * 0.6, 0); ctx.lineTo(m.r * 0.6, 0); ctx.moveTo(0, -m.r * 0.6); ctx.lineTo(0, m.r * 0.6); ctx.stroke();
      ctx.restore();
    }
    // 雷神招来: 頭上の雷雲(暗い青灰の塊+内部の閃き)。フィールド展開中だと一目で分かる
    for (const sm of run.storms) {
      const k = G.clamp(1 - sm.t / sm.life, 0, 1);
      const cx = sm.x, cy = sm.y - 64;
      ctx.save();
      ctx.globalAlpha = 0.5 * Math.min(1, k * 2 + 0.3);
      const cg = ctx.createRadialGradient(cx, cy, 4, cx, cy, 78);
      cg.addColorStop(0, 'rgba(70,86,120,0.95)'); cg.addColorStop(0.6, 'rgba(40,52,82,0.8)'); cg.addColorStop(1, 'rgba(30,38,60,0)');
      ctx.fillStyle = cg;
      for (let b = 0; b < 3; b++) { const ox = (b - 1) * 34, oy = Math.sin(run.t * 1.6 + b) * 4; ctx.beginPath(); ctx.ellipse(cx + ox, cy + oy, 46 - b * 4, 24, 0, 0, G.TAU); ctx.fill(); }
      if (G.chance(0.3)) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 * k; ctx.fillStyle = '#bfe0ff'; ctx.beginPath(); ctx.arc(cx + G.rand(-40, 40), cy + G.rand(-6, 6), G.rand(4, 9), 0, G.TAU); ctx.fill(); }
      ctx.restore();
    }
    // 単発大技の予告: 外から収束する光輪 + 満ちる芯(「気が集まる→ドン」の溜め)。当たり判定なし
    if (run.warns.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const wn of run.warns) {
        const k = G.clamp(wn.t / wn.life, 0, 1);   // 0→1 進行
        const rr = wn.r * (1 - 0.72 * k);           // 収束(外→内)
        const col = wn.col || '255,210,120';
        ctx.globalAlpha = 0.45 + 0.5 * k;
        ctx.strokeStyle = `rgba(${col},0.95)`; ctx.lineWidth = 2 + 4 * k;
        ctx.beginPath(); ctx.arc(wn.x, wn.y, rr, 0, G.TAU); ctx.stroke();
        const g = ctx.createRadialGradient(wn.x, wn.y, 0, wn.x, wn.y, wn.r * 0.55);
        g.addColorStop(0, `rgba(${col},${(0.5 * k * k).toFixed(3)})`);
        g.addColorStop(1, `rgba(${col},0)`);
        ctx.globalAlpha = 1; ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(wn.x, wn.y, wn.r * 0.55, 0, G.TAU); ctx.fill();
        if (k > 0.5 && G.chance(0.4)) {   // 終盤、芯へ吸い込まれる火花
          const a = G.rand(G.TAU), d = rr * (0.7 + 0.3 * Math.random());
          G.fx.spark(wn.x + Math.cos(a) * d, wn.y + Math.sin(a) * d, `rgb(${col})`, 1, 40, 0.2);
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    // 炎の足跡 (火渡りの行) / 呪火: 地面で赤々と燃え盛る炎。地表レイヤに加算で描く。
    // 赤い熱のハロー + 立ち上る炎舌(揺らめき) + 白熱の芯 の3層で「燃えている」と一目で分かる。
    if (run.flames.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const T = run.t;
      for (const fl of run.flames) {
        if (!G.cam.onScreen(fl.x, fl.y, fl.r + 36)) continue;
        const lifeF = G.clamp(1 - fl.t / fl.life, 0, 1);
        if (fl.mist) {   // 霞: 淡い青灰のもや(炎=暖色 / 塩=結晶 と別物。ゆらぐ渦で霞を表現)
          const mr = fl.r * (0.86 + 0.14 * Math.sin(run.t * 2.2 + fl.x * 0.05));
          let mg = ctx.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, mr);
          mg.addColorStop(0, `rgba(190,222,250,${(0.20 * lifeF).toFixed(3)})`);
          mg.addColorStop(0.55, `rgba(150,185,225,${(0.13 * lifeF).toFixed(3)})`);
          mg.addColorStop(1, 'rgba(120,160,210,0)');
          ctx.fillStyle = mg;
          ctx.beginPath(); ctx.arc(fl.x, fl.y, mr, 0, G.TAU); ctx.fill();
          for (let k = 0; k < 2; k++) {   // ゆらぐ薄い渦
            const a = run.t * (0.7 + k * 0.4) + fl.x * 0.1 + k * 3, rr = mr * 0.4;
            ctx.globalAlpha = 0.10 * lifeF; ctx.fillStyle = '#cfe6ff';
            ctx.beginPath(); ctx.arc(fl.x + Math.cos(a) * rr, fl.y + Math.sin(a) * rr * 0.6, mr * 0.45, 0, G.TAU); ctx.fill();
            ctx.globalAlpha = 1;
          }
          continue;
        }
        if (fl.salt) {   // 清め塩: 寒色の塩床(淡藍のハロー+白い結晶)。炎と別物に見せる
          const sr = fl.r * (0.92 + 0.08 * Math.sin(run.t * 4 + fl.x));
          let sg = ctx.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, sr);
          sg.addColorStop(0, `rgba(200,224,255,${(0.34 * lifeF).toFixed(3)})`);
          sg.addColorStop(0.5, `rgba(150,190,245,${(0.22 * lifeF).toFixed(3)})`);
          sg.addColorStop(1, 'rgba(120,160,220,0)');
          ctx.fillStyle = sg;
          ctx.beginPath(); ctx.arc(fl.x, fl.y, sr, 0, G.TAU); ctx.fill();
          ctx.fillStyle = `rgba(240,248,255,${(0.85 * lifeF).toFixed(3)})`;
          for (let k = 0; k < 5; k++) { const a = k / 5 * G.TAU + fl.x; const rr = fl.r * 0.55; ctx.fillRect(fl.x + Math.cos(a) * rr - 1, fl.y + Math.sin(a) * rr * 0.6 - 1, 2, 2); }
          continue;
        }
        // 火渡り = Unity版: foozle火球を立てて(先細りを上へ)大中小3つ寄せ集め=焚火/ガスコンロの炎。素材があればこれ
        const _fb = G.fx.animSheets && G.fx.animSheets.fireball;
        if (_fb && _fb.length && _fb[0] && _fb[0]._ok) {
          const _rr = fl.r * (0.92 + 0.12 * Math.sin(T * 16 + fl.x));
          const _wob = 0.09 * Math.sin(T * 14 + fl.x);
          const _flame = (ox, oy, sz, seed) => { const fr = _fb[Math.floor((T * 18 + seed) % _fb.length)]; if (!fr || !fr._ok) return; ctx.save(); ctx.translate(fl.x + ox, fl.y + oy); ctx.rotate(Math.PI / 2); ctx.globalAlpha = 0.85 * lifeF; ctx.imageSmoothingEnabled = false; ctx.drawImage(fr, -sz / 2, -sz / 2, sz, sz); ctx.restore(); };
          _flame(0, -_rr * 0.18, _rr * (1.05 + _wob), fl.x * 0.5);          // 大(中央・高い炎)
          _flame(-_rr * 0.26, -_rr * 0.02, _rr * (0.7 + _wob * 0.6), fl.x * 0.7 + 4);   // 中(左)
          _flame(_rr * 0.26, -_rr * 0.04, _rr * (0.56 - _wob * 0.5), fl.y * 0.6 + 8);   // 小(右)
          continue;
        }
        const ph = fl.x * 0.07 + fl.y * 0.03;             // (以下は素材未ロード時の手続き炎フォールバック)
        const flick = 0.78 + 0.22 * Math.sin(T * 16 + ph);
        const rr = fl.r * (0.85 + 0.15 * flick);
        // 1) 熱の赤いハロー (deep-red heat haze)
        let g = ctx.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, rr);
        g.addColorStop(0, `rgba(255,150,46,${(0.46 * lifeF).toFixed(3)})`);
        g.addColorStop(0.45, `rgba(255,66,18,${(0.34 * lifeF).toFixed(3)})`);
        g.addColorStop(1, 'rgba(150,12,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(fl.x, fl.y, rr, 0, G.TAU); ctx.fill();
        // 2) 揺らめく炎舌 (flickering tongues licking upward)。地面なので根元は楕円配置
        const tongues = 5;
        for (let k = 0; k < tongues; k++) {
          const a = (k / tongues) * G.TAU + T * 0.5;
          const sway = Math.sin(T * (11 + k) + ph + k);
          const bx = fl.x + Math.cos(a) * rr * 0.5;
          const by = fl.y + Math.sin(a) * rr * 0.3;        // 縦を潰して地表パース
          const h = rr * (0.9 + 0.7 * (0.5 + 0.5 * Math.sin(T * 9 + k * 1.7 + ph)));
          const w = rr * (0.26 + 0.06 * flick);
          const tipx = bx + sway * w * 1.2;
          const tipy = by - h;                              // 上(−y)へ立ち上る
          ctx.fillStyle = `rgba(255,120,30,${(0.34 * lifeF).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(bx - w, by);
          ctx.quadraticCurveTo(bx - w * 0.4 + sway * w, by - h * 0.6, tipx, tipy);
          ctx.quadraticCurveTo(bx + w * 0.4 + sway * w, by - h * 0.6, bx + w, by);
          ctx.closePath();
          ctx.fill();
          // 舌の根元の明るい芯
          ctx.fillStyle = `rgba(255,224,120,${(0.3 * lifeF).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(bx - w * 0.5, by);
          ctx.quadraticCurveTo(bx + sway * w * 0.6, by - h * 0.45, bx + sway * w * 0.7, by - h * 0.6);
          ctx.quadraticCurveTo(bx + w * 0.5, by - h * 0.3, bx + w * 0.5, by);
          ctx.closePath();
          ctx.fill();
        }
        // 3) 白熱の芯 (white-hot core, pulsing)
        g = ctx.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, rr * 0.5);
        g.addColorStop(0, `rgba(255,246,206,${(0.52 * lifeF * flick).toFixed(3)})`);
        g.addColorStop(1, 'rgba(255,150,40,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(fl.x, fl.y, rr * 0.5, 0, G.TAU); ctx.fill();
      }
      ctx.restore();
    }

    // 据置提灯: 灯紋色の安全圏 + 灯勢。消灯中は点灯儀式の進捗を表示する。
    for (const t of run.toros) {
      if (!G.cam.onScreen(t.x, t.y, G.LAMP_R * (D.LAMP.stageRange[run.lampStage] || 1) + 40)) continue;
      const sigil = t.sigil ? D.LAMP_SIGILS[t.sigil] : null;
      if (t.dead) {
        ctx.globalAlpha = 0.45; ctx.fillStyle = '#06070d';
        ctx.beginPath(); ctx.ellipse(t.x, t.y + 2, 12, 4.5, 0, 0, G.TAU); ctx.fill();
        ctx.globalAlpha = 0.5; S.draw(ctx, 'toro', t.x, t.y); ctx.globalAlpha = 1;
        if (t.ignite > 0) {
          const col = sigil ? sigil.color : '#ffce8c';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(12,16,26,0.9)';
          ctx.beginPath(); ctx.arc(t.x, t.y - 10, 19, -Math.PI / 2, G.TAU - Math.PI / 2); ctx.stroke();
          ctx.strokeStyle = col;
          ctx.beginPath(); ctx.arc(t.x, t.y - 10, 19, -Math.PI / 2, -Math.PI / 2 + G.TAU * t.ignite); ctx.stroke();
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = col;
          ctx.fillText(t.everLit ? '再点灯' : '火を結ぶ', t.x, t.y - 37);
        } else if (t.relightT > 0 && G.cam.onScreen(t.x, t.y, 30)) {
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#718297';
          ctx.fillText(Math.ceil(t.relightT) + '秒', t.x, t.y - 31);
        }
        continue;
      }
      const hpF = t.maxHp ? G.clamp(t.hp / t.maxHp, 0, 1) : 1;
      const stage = t.dispStage || 0;            // 各灯は自分の表示段階で描画(全灯連動を解消)
      const lr = lampRadius(t);                  // 滞在段階(stageRange)込みの実効半径 = 描画も拡大
      const flick = t.hp < t.maxHp * 0.35 ? (0.7 + Math.sin(run.t * 22 + t.x * 0.017) * 0.25) : 1;   // 弱ると明滅(位相を灯ごとにずらす)
      const rgb = t.sigil === 'koubou' ? '255,108,76' : t.sigil === 'seiran' ? '92,202,255' : '255,231,178';
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gg = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, lr);
      gg.addColorStop(0, `rgba(${rgb},${(0.16 * flick).toFixed(3)})`);
      gg.addColorStop(0.7, `rgba(${rgb},${(0.055 * flick).toFixed(3)})`);
      gg.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(t.x, t.y, lr, 0, G.TAU); ctx.fill();
      // 範囲リング: 灯りの届く縁を明示。段が上がるほど太く明るく + 拡大が読めるよう脈動
      const pulse = stage > 0 ? 0.78 + Math.sin(run.t * 4 + t.x * 0.017) * 0.22 : 1;
      ctx.globalAlpha = (0.5 + 0.13 * stage) * flick * pulse;
      ctx.strokeStyle = sigil ? sigil.color : '#ffce8c';
      ctx.lineWidth = 2 + stage * 0.9;
      ctx.beginPath(); ctx.arc(t.x, t.y, lr, 0, G.TAU); ctx.stroke();
      if (stage > 0) {   // 拡大したことが分かるよう、内側に元(1段下)の半径を薄い破線で残す
        const prevLr = G.LAMP_R * (0.55 + 0.45 * hpF) * (D.LAMP.stageRange[stage - 1] || 1);
        ctx.globalAlpha = 0.22 * flick;
        ctx.setLineDash([6, 9]);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(t.x, t.y, prevLr, 0, G.TAU); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
      if (t.douseT > 0) {   // 消し手に狙われている: 赤い脈動警告環 → 守る判断を促す(死守の合図)
        ctx.globalAlpha = 0.5 + 0.4 * Math.sin(run.t * 14);
        ctx.strokeStyle = '#ff5a3c';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(t.x, t.y - 8, 24, 0, G.TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.globalAlpha = 0.45; ctx.fillStyle = '#06070d';
      ctx.beginPath(); ctx.ellipse(t.x, t.y + 2, 12, 4.5, 0, 0, G.TAU); ctx.fill();
      ctx.globalAlpha = 1;
      S.draw(ctx, 'toro', t.x, t.y);
      S.draw(ctx, 'glow_warm', t.x, t.y - 18, { scale: (1.8 + Math.sin(run.t * 3 + t.x) * 0.12) * (0.5 + 0.5 * hpF) * (D.LAMP.stageRange[t.dispStage || 0] || 1), alpha: flick });
      if (sigil) {   // 灯りの種別だけを示す (charge→大祓 の進捗リングは廃止)
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = sigil.color;
        ctx.fillText(sigil.kanji, t.x, t.y - 37);
      }
      if (hpF < 1) {                            // 損傷 HP バー (緑 = 提灯)
        ctx.fillStyle = 'rgba(8,10,18,0.7)';
        ctx.fillRect(t.x - 16, t.y + 7, 32, 4);
        ctx.fillStyle = sigil ? sigil.color : '#7fe0a0';
        ctx.fillRect(t.x - 15, t.y + 8, 30 * hpF, 2);
      }
    }

    // 結界札 (灯りの杭): 暖色の灯り円 + 破線リング + 中央のお札
    for (const w of run.wards) {
      if (!G.cam.onScreen(w.x, w.y, 90)) continue;
      const k = w.life < 1.5 ? (Math.floor(run.t * 10) % 2 ? 0.5 : 1) : 1;   // 消える間際に明滅
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, w.r);
      g.addColorStop(0, `rgba(255,208,140,${0.15 * k})`);
      g.addColorStop(1, 'rgba(255,208,140,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, G.TAU); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 0.5 * k;
      ctx.strokeStyle = 'rgba(255,221,160,0.85)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 9]);
      ctx.lineDashOffset = -w.t * 14;
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r * (0.96 + Math.sin(w.t * 3) * 0.02), 0, G.TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      S.draw(ctx, 'glow_warm', w.x, w.y - 8, { scale: 1.1, alpha: 0.55 * k });
      ctx.globalAlpha = k;
      ctx.fillStyle = '#efe6cf';
      ctx.fillRect(w.x - 5, w.y - 22, 10, 24);
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(w.x - 2.5, w.y - 18, 5, 13);
      ctx.globalAlpha = 1;
    }

    // treasure chests (light beam + sprite)
    for (const c of run.chests) {
      if (!G.cam.onScreen(c.x, c.y, 90)) continue;
      if (!c.opened) {
        // rising light beam
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const beam = ctx.createLinearGradient(0, c.y - 110, 0, c.y - 6);
        beam.addColorStop(0, 'rgba(255,220,140,0)');
        beam.addColorStop(1, `rgba(255,220,140,${0.16 + Math.sin(run.t * 2.4 + c.t) * 0.05})`);
        ctx.fillStyle = beam;
        const bw = 13 + Math.sin(run.t * 3.1 + c.t) * 2;
        ctx.beginPath();
        ctx.moveTo(c.x - bw, c.y - 110);
        ctx.lineTo(c.x + bw, c.y - 110);
        ctx.lineTo(c.x + 6, c.y - 6);
        ctx.lineTo(c.x - 6, c.y - 6);
        ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = '#06070d';
        ctx.beginPath();
        ctx.ellipse(c.x, c.y + 1, 13, 4.5, 0, 0, G.TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        S.draw(ctx, 'chest', c.x, c.y, { scale: 1.1 + Math.sin(run.t * 2.8 + c.t) * 0.03 });
        S.draw(ctx, 'glow_warm', c.x, c.y - 8, { scale: 1.3 + Math.sin(run.t * 3 + c.t) * 0.15, alpha: 0.8 });
      } else {
        const k = Math.min(1, c.openT / 0.4);
        S.draw(ctx, 'chest_open', c.x, c.y, { alpha: Math.max(0, 1 - (c.openT - 1.2) / 1) });
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.max(0, 0.8 - c.openT * 0.5);
        const burst = ctx.createLinearGradient(0, c.y - 150 * k, 0, c.y - 8);
        burst.addColorStop(0, 'rgba(255,235,180,0)');
        burst.addColorStop(1, 'rgba(255,235,180,0.7)');
        ctx.fillStyle = burst;
        ctx.beginPath();
        ctx.moveTo(c.x - 20 * k, c.y - 150 * k);
        ctx.lineTo(c.x + 20 * k, c.y - 150 * k);
        ctx.lineTo(c.x + 7, c.y - 8);
        ctx.lineTo(c.x - 7, c.y - 8);
        ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }

    // 封印札 (ground sigils)
    for (const m of run.mines) {
      if (!G.cam.onScreen(m.x, m.y, (m.aoe || 40) + 20)) continue;
      const pulse = m.armed ? 0.8 + Math.sin(run.t * 7 + m.x) * 0.2 : 0.55;
      // 設置範囲の地輪: 「ここに罠がある」と一目で分かる(設置直後=点線/起動後=実線で脈動)
      ctx.save();
      ctx.globalAlpha = (m.armed ? 0.55 : 0.32) * pulse;
      ctx.strokeStyle = 'rgba(255,170,90,0.95)'; ctx.lineWidth = m.armed ? 2.5 : 2;
      if (!m.armed) ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.arc(m.x, m.y, (m.aoe || 40) * 0.8, 0, G.TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      S.draw(ctx, 'glow_warm', m.x, m.y, { scale: m.armed ? 0.95 : 0.75, alpha: pulse * 0.55 });
      S.draw(ctx, 'fuin', m.x, m.y, { alpha: Math.min(1, pulse + 0.25), scale: m.armed ? 1.2 : 1.05 });
    }

    // gems
    const gems = run.gem.act;
    for (let i = 0; i < gems.length; i++) {
      const g = gems[i];
      if (!G.cam.onScreen(g.x, g.y, 30)) continue;
      const bob = Math.sin(g.t * 3.2) * 2.4;
      const spr = g.v >= 20 ? 'gem_g' : g.v >= 5 ? 'gem_v' : 'gem_c';
      S.draw(ctx, spr, g.x, g.y + bob);
    }

    // items
    const items = run.it.act;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const bob = Math.sin(it.t * 2.8) * 2.6;
      if (it.kind.startsWith('buff_')) {
        S.draw(ctx, 'glow_cool', it.x, it.y + bob, { scale: 0.85, alpha: 0.45 + Math.sin(it.t * 5) * 0.18 });   // 淡い光
        S.draw(ctx, it.kind + '_sym', it.x, it.y + bob, { scale: 1.5 + Math.sin(it.t * 5) * 0.12 });   // アイコンのみ(枠なし)
      } else {
        S.draw(ctx, it.kind === 'bomb' ? 'bomb' : it.kind, it.x, it.y + bob, { scale: 1.15 });
        S.draw(ctx, 'glow_cool', it.x, it.y + bob, { scale: 0.9, alpha: 0.5 + Math.sin(it.t * 4) * 0.2 });
      }
    }

    // kekkai aura
    if (run.auraR > 1) {
      const r = run.auraR;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(run.auraSpin);
      const pulse = 0.55 + Math.sin(run.t * 2.6) * 0.14;
      ctx.globalAlpha = pulse * 0.78;             // 結界の主環: 視認しやすく(0.55→0.78・太め)
      ctx.strokeStyle = '#9ad8ff';
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, G.TAU); ctx.stroke();
      ctx.globalAlpha = pulse * 0.42;             // 内側の副環
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, G.TAU); ctx.stroke();
      ctx.globalAlpha = pulse * 0.7;
      ctx.fillStyle = '#bfe8ff';
      ctx.font = '11px serif';
      ctx.textAlign = 'center';
      const glyphs = '結界封魔浄火';
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * G.TAU;
        ctx.save();
        ctx.translate(Math.cos(a) * r, Math.sin(a) * r);
        ctx.rotate(a + Math.PI / 2);
        ctx.fillText(glyphs[i], 0, 0);
        ctx.restore();
      }
      ctx.globalAlpha = 0.08 + pulse * 0.08;
      ctx.fillStyle = '#7ec8ff';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, G.TAU); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // active blessing auras around the player
    {
      let gi = 0;
      for (const k in run.buffs) {
        if (run.buffs[k] <= 0) continue;
        const cfg = G.data.BUFFS[k];
        const pul = 0.5 + Math.sin(run.t * 6 + gi * 1.7) * 0.16;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = pul * 0.55;
        const rad = 34 + gi * 7;
        const grd = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, rad);
        grd.addColorStop(0, cfg.glow);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, G.TAU); ctx.fill();
        ctx.restore();
        gi++;
      }
      if (run.buffs.kongo > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5 + Math.sin(run.t * 8) * 0.2;
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, 20 + Math.sin(run.t * 8) * 1.6, 0, G.TAU); ctx.stroke();
        ctx.globalAlpha *= 0.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, 25.5, 0, G.TAU); ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    // 足元の影 / 濡れ女の軌道エフェクトは廃止 (要望)
    const en = run.en.act;

    // 着弾予兆 (落雷/水柱/竜巻/多重範囲)。doom(多重同時範囲)は予告中に火球が上空から降ってくる
    if (run.boss && run.boss.strikes && run.boss.strikes.length) {
      const fbSheet = G.fx.animSheets && G.fx.animSheets.fireball;
      for (const s of run.boss.strikes) {
        ctx.globalAlpha = 0.32 + Math.sin(run.t * 16) * 0.14;
        ctx.strokeStyle = s.col || '#9fd8ff';
        ctx.lineWidth = 2;
        const wr = (s.r || 56) * (G.data.BOSS_AOE_MUL || 1);   // 予兆円=実際の着弾半径に一致+拡大
        ctx.beginPath(); ctx.arc(s.x, s.y, wr, 0, G.TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(s.x, s.y, wr * Math.max(0, 1 - s.t / (s.warn || 0.8)), 0, G.TAU); ctx.stroke();
        ctx.globalAlpha = 1;
        // doom: 上空から降ってくる火球(素材FX)。予告進行で着弾点へ落下→着弾時にexplode(着弾側で処理)
        if (s.kind === 'doom' && fbSheet && fbSheet.length && fbSheet[0] && fbSheet[0]._ok) {
          const prog = G.clamp(1 - s.t / (s.warn || 0.8), 0, 1);
          const fy = s.y - 360 * (1 - prog) * (1 - prog);   // 高い位置から加速落下
          const fsz = Math.max(96, wr * 1.12) + 34 * prog;
          const fr = fbSheet[((Math.floor(run.t * 20 + s.x) % fbSheet.length) + fbSheet.length) % fbSheet.length];   // 負index回避
          if (fr && fr._ok) {
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.globalAlpha = 0.92;
            ctx.translate(s.x, fy);
            ctx.rotate(Math.PI / 2);
            ctx.globalCompositeOperation = 'lighter';
            ctx.drawImage(fr, -fsz / 2, -fsz / 2, fsz, fsz);
            ctx.restore();
          }
        }
      }
    }

    // ボス固有大技の持続予告。実際の危険半径/進路と同じ形を、発動まで収束させて示す。
    if (run.boss) {
      const b = run.boss;
      const aoe = G.data.BOSS_AOE_MUL || 1;
      let warned = false;
      const dangerCircle = (x, y, r, k, col = '255,78,52') => {
        warned = true;
        ctx.save();
        ctx.globalAlpha = 0.12 + 0.20 * k;
        ctx.fillStyle = `rgba(${col},1)`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, G.TAU); ctx.fill();
        ctx.globalAlpha = 0.72 + 0.22 * Math.sin(run.t * 18);
        ctx.strokeStyle = `rgba(${col},1)`; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.arc(x, y, r, 0, G.TAU); ctx.stroke();
        ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.arc(x, y, Math.max(8, r * (1 - 0.78 * k)), 0, G.TAU); ctx.stroke();
        ctx.restore();
      };
      const dangerLane = (ang, len, halfW, k, col = '255,78,52') => {
        warned = true;
        ctx.save();
        ctx.translate(b.x, b.y); ctx.rotate(ang);
        ctx.globalAlpha = 0.13 + 0.24 * k;
        ctx.fillStyle = `rgba(${col},1)`;
        ctx.fillRect(0, -halfW, len, halfW * 2);
        ctx.globalAlpha = 0.75 + 0.2 * Math.sin(run.t * 18);
        ctx.strokeStyle = `rgba(${col},1)`; ctx.lineWidth = 3;
        ctx.strokeRect(0, -halfW, len, halfW * 2);
        ctx.globalAlpha = 0.82;
        ctx.fillRect(len * k - 3, -halfW, 6, halfW * 2);
        ctx.restore();
      };

      if (b.bossId === 'tanuki' && b.bstate === 'drum') {
        dangerCircle(b.x, b.y, 225 * aoe, G.clamp(b.bt / 0.7, 0, 1), '255,112,58');
      } else if (b.bossId === 'gasha' && b.bstate === 'sweep') {
        dangerCircle(b.x, b.y, 215 * aoe, G.clamp(b.bt / 0.8, 0, 1), '255,96,62');
      } else if (b.bossId === 'daitengu' && b.bstate === 'gust') {
        dangerCircle(b.x, b.y, 250 * aoe, G.clamp(b.bt / 0.5, 0, 1), '214,232,255');
      } else if (b.bossId === 'tsuchigumo' && (b.bstate === 'burrow' || b.bstate === 'leap')) {
        const tx = Number.isFinite(b.teleX) ? b.teleX : p.x;
        const ty = Number.isFinite(b.teleY) ? b.teleY : p.y;
        const k = b.bstate === 'burrow' ? G.clamp(b.bt / 0.7, 0, 1) : G.clamp(0.65 + b.bt / 0.5 * 0.35, 0, 1);
        dangerCircle(tx, ty, 210 * aoe, k, '216,120,64');
        ctx.save();
        ctx.globalAlpha = 0.55; ctx.setLineDash([8, 7]); ctx.strokeStyle = 'rgba(230,145,82,0.95)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(tx, ty); ctx.stroke(); ctx.restore();
      } else if (b.bossId === 'ogama' && b.bstate === 'tele') {
        const laneX = Number.isFinite(b.teleX) ? b.teleX : p.x - b.x;
        const laneY = Number.isFinite(b.teleY) ? b.teleY : p.y - b.y;
        const ang = Math.atan2(laneY, laneX);
        dangerLane(ang, 520, Math.max(42, b.r * 0.8), G.clamp(b.bt / 0.6, 0, 1), '112,220,170');
      } else if (b.bossId === 'ushi' && b.bstate === 'tele') {
        dangerLane(Math.atan2(b.teleY, b.teleX), 560, 38, G.clamp(b.bt / 0.95, 0, 1), '255,90,60');
      }

      const castDanger = warned || b.bossCastT > 0 || b.meleeWind > 0
        || (b.acts && b.acts.length) || (b.beams && b.beams.some(v => v.t < v.warn));
      if (castDanger) {
        const auraCol = BOSS_FX_COLOR[b.bossId] || '#ff765c';
        const auraR = b.r + 24 + (b.bossRank || 1) * 3;
        ctx.save();
        ctx.translate(b.x, b.y - b.r * 0.18);
        ctx.rotate(run.t * (0.8 + (b.bossRank || 1) * 0.08));
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.28 + 0.16 * Math.sin(run.t * 12);
        ctx.strokeStyle = auraCol;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, auraR, -0.2, 1.2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, auraR, Math.PI - 0.2, Math.PI + 1.2); ctx.stroke();
        ctx.rotate(-run.t * 1.7);
        ctx.globalAlpha = 0.16;
        ctx.lineWidth = 7;
        ctx.beginPath(); ctx.arc(0, 0, auraR * 0.72, 0, G.TAU); ctx.stroke();
        ctx.restore();

        const my = b.y - b.r - 34 - Math.sin(run.t * 12) * 3;
        ctx.save();
        ctx.globalAlpha = 0.82 + 0.18 * Math.sin(run.t * 20);
        ctx.fillStyle = '#ffcf72';
        ctx.beginPath();
        ctx.moveTo(b.x, my - 10); ctx.lineTo(b.x - 8, my + 5); ctx.lineTo(b.x + 8, my + 5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#501618';
        ctx.fillRect(b.x - 1.5, my - 5, 3, 6);
        ctx.fillRect(b.x - 1.5, my + 2, 3, 2);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    // ボスのレーザー: 予告線(細い)→照射(太い加算ビーム)
    if (run.boss && run.boss.beams && run.boss.beams.length) {
      const e = run.boss;
      ctx.save();
      for (const b of e.beams) {
        const ex2 = e.x + Math.cos(b.ang) * b.len, ey2 = e.y + Math.sin(b.ang) * b.len;
        if (b.t < b.warn) {                 // 予告線(発射前): 細い線が満ちていく
          const k = b.t / b.warn;
          ctx.globalCompositeOperation = 'source-over';
          if (b.sweep) {                    // 掃射レーザー: 始点→回転方向→終点を、そのまま模擬再生する
            const a0 = b.startAng, a1 = b.endAng, arc = a1 - a0;
            const ccw = arc < 0;
            ctx.globalAlpha = 0.08 + 0.12 * k; ctx.fillStyle = b.col;
            ctx.beginPath(); ctx.moveTo(e.x, e.y);
            ctx.arc(e.x, e.y, b.len, a0, a1, ccw); ctx.closePath(); ctx.fill();

            // 開始線は実線、終了線は破線。どちら側から薙ぐかを瞬時に判別できる。
            const sx = e.x + Math.cos(a0) * b.len, sy = e.y + Math.sin(a0) * b.len;
            const fx = e.x + Math.cos(a1) * b.len, fy = e.y + Math.sin(a1) * b.len;
            ctx.globalAlpha = 0.62 + 0.3 * k; ctx.strokeStyle = '#fff2dc'; ctx.lineWidth = 3 + 2 * k;
            ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(sx, sy); ctx.stroke();
            ctx.setLineDash([12, 9]); ctx.strokeStyle = b.col; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(fx, fy); ctx.stroke();
            ctx.setLineDash([]);

            // 内側の軌道と三つの矢印で回転方向を示す。
            const guideR = Math.min(210, b.len * 0.24);
            ctx.globalAlpha = 0.68 + 0.24 * k; ctx.strokeStyle = b.col; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(e.x, e.y, guideR, a0, a1, ccw); ctx.stroke();
            for (let ai = 1; ai <= 3; ai++) {
              const aa = a0 + arc * ai / 4;
              const px = e.x + Math.cos(aa) * guideR, py = e.y + Math.sin(aa) * guideR;
              const tangent = aa + (arc > 0 ? Math.PI / 2 : -Math.PI / 2);
              ctx.save(); ctx.translate(px, py); ctx.rotate(tangent);
              ctx.fillStyle = '#fff2dc';
              ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-7, -6); ctx.lineTo(-7, 6); ctx.closePath(); ctx.fill();
              ctx.restore();
            }

            // 発射前にゴーストビームを始点から終点へ動かし、実際の掃引速度を予習させる。
            const previewA = a0 + arc * k;
            const px = e.x + Math.cos(previewA) * b.len, py = e.y + Math.sin(previewA) * b.len;
            ctx.globalAlpha = 0.22 + 0.34 * k; ctx.strokeStyle = b.col;
            ctx.lineWidth = Math.max(5, b.half * 0.42);
            ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(px, py); ctx.stroke();
          }
          ctx.globalAlpha = 0.4 + 0.5 * k; ctx.strokeStyle = b.col; ctx.lineWidth = 1 + 4 * k;
          ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(ex2, ey2); ctx.stroke();   // 薙ぎ始めの先端線
        } else {                            // 照射: 太い加算ビーム(外グロー+白芯)
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.5; ctx.strokeStyle = b.col; ctx.lineWidth = b.half * 2;
          ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(ex2, ey2); ctx.stroke();
          ctx.globalAlpha = 0.95; ctx.strokeStyle = '#fff'; ctx.lineWidth = b.half * 0.7;
          ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(ex2, ey2); ctx.stroke();
        }
      }
      ctx.restore(); ctx.globalAlpha = 1;
    }
    // ボスの予告付き遅延発火(弾幕volley等)のテレグラフ
    if (run.boss && run.boss.acts && run.boss.acts.length) {
      const e = run.boss;
      for (const a of e.acts) {
        if (!a.tele) continue;
        const k = 1 - a.t / a.warn, tl = a.tele;
        ctx.save(); ctx.translate(e.x, e.y);
        if (tl.kind === 'cone') {           // 指向性volley=扇予告
          const ta = tl.ang, half = tl.half || 0.5, rr = tl.r || 260;
          ctx.fillStyle = `rgba(255,70,46,${(0.10 + 0.2 * k).toFixed(3)})`;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, rr, ta - half, ta + half); ctx.closePath(); ctx.fill();
          ctx.globalAlpha = 0.5 + 0.4 * k; ctx.strokeStyle = 'rgba(255,110,80,0.95)'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(0, 0, rr, ta - half, ta + half); ctx.stroke();
        } else {                            // 放射バースト=収束リング予告
          const rr = tl.r || 150;
          ctx.globalAlpha = 0.35 + 0.4 * k; ctx.strokeStyle = 'rgba(255,90,70,0.95)'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(0, 0, rr, 0, G.TAU); ctx.stroke();
          ctx.beginPath(); ctx.arc(0, 0, rr * (1 - k * 0.7), 0, G.TAU); ctx.stroke();
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    // 雑魚の攻撃予告(テレグラフ): 範囲攻撃の着弾円 / 突進の進路を地表に赤く描く。
    // 詠唱(e.atk===1)中のみ表示 → その妖を倒せば予告ごと消える(避けるか潰すかの駆け引き)。
    {
      let teleSaved = false;
      for (let ti = 0; ti < en.length; ti++) {
        const e = en[ti];
        if (e.boss || e.dead || e.atk !== 1) continue;
        const c = e.cfg;
        if (c.move === 'slam') {
          if (!G.cam.onScreen(e.aoeX, e.aoeY, c.slam.r)) continue;
          if (!teleSaved) { ctx.save(); teleSaved = true; }
          const r = c.slam.r;
          const prog = G.clamp(1 - e.atkT / (e.atkMax || c.slam.wind), 0, 1);
          // 遠距離砲撃: 撃ち手から着弾点へ細い狙い線(誰がどこを狙うか分かる)
          ctx.globalAlpha = 0.12 + 0.18 * prog;
          ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,120,70,1)'; ctx.setLineDash([6, 5]);
          ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.aoeX, e.aoeY); ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 0.16 + 0.28 * prog;        // 満ちる内円 = 着弾の予兆
          ctx.fillStyle = '#ff3c1e';
          ctx.beginPath(); ctx.arc(e.aoeX, e.aoeY, r * prog, 0, G.TAU); ctx.fill();
          ctx.globalAlpha = 0.5 + 0.45 * prog;          // 危険円(外周)
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,80,46,1)';
          ctx.beginPath(); ctx.arc(e.aoeX, e.aoeY, r, 0, G.TAU); ctx.stroke();
        } else if (c.move === 'charge') {
          if (!G.cam.onScreen(e.x, e.y, 80)) continue;
          if (!teleSaved) { ctx.save(); teleSaved = true; }
          const prog = G.clamp(1 - e.atkT / (e.atkMax || c.charge.wind), 0, 1);
          const len = c.charge.range * 0.78;
          ctx.globalAlpha = 0.22 + 0.4 * prog;          // 突進の進路ライン
          ctx.strokeStyle = 'rgba(255,80,40,1)';
          ctx.lineWidth = 3 + 7 * prog; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + e.dirx * len, e.y + e.diry * len); ctx.stroke();
        } else if (c.move === 'volley') {
          if (!G.cam.onScreen(e.x, e.y, 80)) continue;
          if (!teleSaved) { ctx.save(); teleSaved = true; }
          const prog = G.clamp(1 - e.atkT / (e.atkMax || c.volley.wind), 0, 1);
          const baseA = Math.atan2(e.diry, e.dirx), half = c.volley.spread / 2, len = c.volley.range * 0.7;
          ctx.globalAlpha = 0.12 + 0.3 * prog;          // 扇状の射線(散弾が来る向きを予告)
          ctx.fillStyle = 'rgba(178,140,255,1)';
          ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.arc(e.x, e.y, len, baseA - half, baseA + half); ctx.closePath(); ctx.fill();
        } else if (c.move === 'nova') {
          if (!G.cam.onScreen(e.x, e.y, 80)) continue;
          if (!teleSaved) { ctx.save(); teleSaved = true; }
          const prog = G.clamp(1 - e.atkT / (e.atkMax || c.nova.wind), 0, 1), R = 150;
          ctx.globalAlpha = 0.1 + 0.26 * prog;          // 充満する放射の予兆(内円)
          ctx.fillStyle = '#b18cff';
          ctx.beginPath(); ctx.arc(e.x, e.y, R * prog, 0, G.TAU); ctx.fill();
          ctx.globalAlpha = 0.4 + 0.4 * prog;           // 危険円(外周)
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(177,140,255,1)';
          ctx.beginPath(); ctx.arc(e.x, e.y, R, 0, G.TAU); ctx.stroke();
        }
      }
      if (teleSaved) { ctx.restore(); }
    }

    // 物理死体 (生者の下、回転しながら吹き飛ぶ)
    for (const c of run.corpses) {
      if (!G.cam.onScreen(c.x, c.y, 60)) continue;
      if (c.boom) {   // 爆散死体は火球のような加算グローを纏う
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, c.life / 0.4) * 0.5;
        const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 26);
        g.addColorStop(0, 'rgba(255,176,96,0.85)');
        g.addColorStop(1, 'rgba(255,120,60,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(c.x, c.y, 26, 0, G.TAU); ctx.fill();
        ctx.restore();
      }
      S.draw(ctx, c.spr, c.x, c.y, {
        rot: c.rot, scale: c.scale, flipX: c.flip,
        alpha: Math.min(1, c.life / 0.3) * 0.92,
      });
    }

    // y-sorted bodies (enemies + player)
    drawList.length = 0;
    for (let i = 0; i < en.length; i++) {
      const e = en[i];
      if (e.dead) continue;
      const drawSpr = e.boss ? bossMotionSprite(e) : e.cfg.spr + '_' + e.frame;
      const drawMeta = S.get(drawSpr);
      const extent = drawMeta ? Math.max(drawMeta.w, drawMeta.h) * (e.scale || 1) * 0.62 : 0;
      if (G.cam.onScreen(e.x, e.y, Math.max(e.boss ? 180 : 64, extent + 24))) drawList.push(e);
    }
    drawList.sort((a, b) => a.y - b.y);
    for (let i = 0; i < drawList.length; i++) drawEnemy(ctx, drawList[i], run);
    drawPlayer(ctx, p, run);   // プレイヤーは常に敵・ボスの最前面に(y順で埋もれないように)

    // 鎖鎌の旋回 (chain + sickle sweeping a full turn)
    for (const wh of run.whirls) {
      const k = wh.t / wh.life;
      const ang = wh.a0 + wh.dir * k * G.TAU;
      const alpha = 1 - k * k;
      // chain links
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = '#9aa0b4';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(ang) * wh.r, p.y + Math.sin(ang) * wh.r);
      ctx.stroke();
      ctx.setLineDash([]);
      // motion arc behind the sickle
      ctx.globalAlpha = alpha * 0.5;
      ctx.strokeStyle = 'rgba(220,235,255,0.8)';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(p.x, p.y, wh.r, ang - wh.dir * 0.9, ang, wh.dir < 0);
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = alpha;
      S.draw(ctx, 'kama', p.x + Math.cos(ang) * wh.r, p.y + Math.sin(ang) * wh.r, { rot: ang + Math.PI / 2 * wh.dir });
      ctx.globalAlpha = 1;
    }

    // slashes: 薙ぎ払う塗りつぶし扇 → 先端の細い三日月一閃(切り裂く)。画面を覆わず視認性を確保
    for (const s of run.slashes) {
      const a = s.life / s.maxLife;
      const r1 = s.range, r0 = s.range * 0.86;   // ごく細い先端帯=鋭い刃身(切り裂き感)
      const tint = s.tint || '205,235,255';        // 刃の色味(既定=蒼白。破陣斬りなどは紅)
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.a);
      ctx.lineCap = 'round';
      // 細い刃身の発光(薄い三日月)
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, a * 1.2);
      const grad = ctx.createRadialGradient(0, 0, r0, 0, 0, r1);
      grad.addColorStop(0, `rgba(${tint},0)`);
      grad.addColorStop(0.65, `rgba(${tint},0.5)`);
      grad.addColorStop(1, 'rgba(255,255,255,0.98)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r1, -s.arc / 2, s.arc / 2);
      ctx.arc(0, 0, r0, s.arc / 2, -s.arc / 2, true);
      ctx.closePath();
      ctx.fill();
      // 切り裂く軌跡: 鋭い白の刃先線(先端へ細くしなる)
      ctx.globalAlpha = Math.min(1, a * 1.45);
      ctx.strokeStyle = 'rgba(255,255,255,0.98)';
      ctx.lineWidth = 3.2 * a + 0.6;
      ctx.beginPath();
      ctx.arc(0, 0, r1, -s.arc / 2, s.arc / 2);
      ctx.stroke();
      // 二重刃の細い内縁(切れ味を強調)
      ctx.globalAlpha = 0.45 * a;
      ctx.strokeStyle = `rgba(${tint},0.9)`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, r1 * 0.9, -s.arc / 2 * 0.9, s.arc / 2 * 0.9);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // レーザー(斎光)のビーム: 折れ線を発光描画 (反射で折れ曲がる)
    for (const bm of run.beams) {
      const a = bm.life / bm.maxLife;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(bm.pts[0][0], bm.pts[0][1]);
      for (let i = 1; i < bm.pts.length; i++) ctx.lineTo(bm.pts[i][0], bm.pts[i][1]);
      ctx.globalAlpha = a * 0.5;
      ctx.strokeStyle = bm.color; ctx.lineWidth = bm.w * 1.8; ctx.stroke();
      ctx.globalAlpha = a;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = bm.w * 0.5; ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // player projectiles
    if (!G.fx._glowCold) {   // 弾の視認グローを「柔らかいfalloffの加算テクスチャ」で一度だけ用意(フラット円より淡く見栄え良)
      const mk = rgb => {
        const g = document.createElement('canvas'); g.width = g.height = 32; const gx = g.getContext('2d');
        const grd = gx.createRadialGradient(16, 16, 0, 16, 16, 16);
        grd.addColorStop(0, 'rgba(' + rgb + ',0.8)'); grd.addColorStop(0.5, 'rgba(' + rgb + ',0.2)'); grd.addColorStop(1, 'rgba(' + rgb + ',0)');
        gx.fillStyle = grd; gx.fillRect(0, 0, 32, 32); return g;
      };
      G.fx._glowCold = mk('170,210,255'); G.fx._glowGold = mk('255,224,150');
    }
    const prs = run.pr.act;
    for (let i = 0; i < prs.length; i++) {
      const pr = prs[i];
      if (!G.cam.onScreen(pr.x, pr.y, 40)) continue;
      // 視認性: 淡く柔らかい加算グローを背負う(味方=寒色/金)。残月は自前発光があるので二重に光らせない(目立ちすぎ対策)
      if (pr.kind !== 'zangetsu') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.42;
        const gtex = pr.gold ? G.fx._glowGold : G.fx._glowCold;
        const gd = (pr.r || 6) * 3.4;
        ctx.drawImage(gtex, pr.x - gd / 2, pr.y - gd / 2, gd, gd);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.save();
      const _ps = 1.3 * (pr.cscale || 1);   // 弾の見た目を1.3倍(中心固定)+気溜めの拡大を反映
      ctx.translate(pr.x, pr.y); ctx.scale(_ps, _ps); ctx.translate(-pr.x, -pr.y);
      if (pr.kind === 'ofuda') {
        S.draw(ctx, pr.gold ? 'ofuda_g' : 'ofuda', pr.x, pr.y, { rot: Math.atan2(pr.vy, pr.vx) + Math.PI / 2 + Math.sin(pr.spin) * 0.3 });
      } else if (pr.kind === 'wind') {
        S.draw(ctx, 'wind', pr.x, pr.y, { rot: Math.atan2(pr.vy, pr.vx) });
      } else if (pr.kind === 'kitsunebi') {
        ctx.globalCompositeOperation = 'lighter';
        S.draw(ctx, 'kitsunebi', pr.x, pr.y, { scale: 1 + Math.sin(pr.t * 12) * 0.15 });
        ctx.globalCompositeOperation = 'source-over';
      } else if (pr.kind === 'juzu') {
        S.draw(ctx, 'juzu', pr.x, pr.y, { rot: pr.spin, scale: 1.25 });
      } else if (pr.kind === 'hamaya') {
        S.draw(ctx, 'hamaya', pr.x, pr.y, { rot: Math.atan2(pr.vy, pr.vx) });
      } else if (pr.kind === 'komainu') {
        S.draw(ctx, 'ic_komainu_sym', pr.x, pr.y, { scale: 2.4, flipX: pr.vx > 0 });   // 狛犬=アイコン(左向き既定)を進行方向(=敵)へ向けて発射
      } else if (pr.kind === 'shuriken') {
        S.draw(ctx, 'shuriken', pr.x, pr.y, { rot: pr.spin });
      } else if (pr.kind === 'tama') {
        ctx.globalCompositeOperation = 'lighter';
        S.draw(ctx, 'tama', pr.x, pr.y, { scale: 1.1 });
        ctx.globalCompositeOperation = 'source-over';
      } else if (pr.kind === 'zangetsu') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        S.draw(ctx, 'zangetsu', pr.x, pr.y, { rot: Math.atan2(pr.vy, pr.vx), scale: pr.zscale * 0.5, alpha: 0.28 });
        ctx.restore();
        S.draw(ctx, 'zangetsu', pr.x, pr.y, { rot: Math.atan2(pr.vy, pr.vx), scale: pr.zscale });
      } else if (pr.kind === 'hiken') {
        const a = Math.atan2(pr.vy, pr.vx);
        ctx.save();
        ctx.translate(pr.x, pr.y); ctx.rotate(a);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(190,238,255,0.95)';
        ctx.beginPath();
        ctx.moveTo(15, 0); ctx.lineTo(-5, 3.2); ctx.lineTo(-11, 0); ctx.lineTo(-5, -3.2); ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillRect(-5, -1, 18, 2);
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
      } else if (pr.kind === 'sumiuchi') {
        const m = Math.hypot(pr.vx, pr.vy) || 1;
        ctx.fillStyle = 'rgba(120,150,210,0.6)';
        ctx.beginPath(); ctx.arc(pr.x - pr.vx / m * 4, pr.y - pr.vy / m * 4, 2.6, 0, G.TAU); ctx.fill();   // 尾
        ctx.fillStyle = 'rgba(58,74,108,0.95)';
        ctx.beginPath(); ctx.arc(pr.x, pr.y, 4.4, 0, G.TAU); ctx.fill();                                  // 墨の塊
        ctx.fillStyle = 'rgba(150,180,230,0.5)';
        ctx.beginPath(); ctx.arc(pr.x - 1, pr.y - 1, 1.6, 0, G.TAU); ctx.fill();                          // 照り
      } else if (pr.kind === 'raiyari') {
        const a = Math.atan2(pr.vy, pr.vx);
        const visualR = Math.min(34, pr.r || 22);
        const L = visualR * 2.7, w = visualR * 0.3;
        const pulse = 0.82 + Math.sin(pr.t * 42) * 0.18;
        ctx.save();
        ctx.translate(pr.x, pr.y); ctx.rotate(a);
        ctx.globalCompositeOperation = 'lighter';

        // 長い残光。槍が高速で空間を裂いている方向を明確にする。
        const tail = ctx.createLinearGradient(-L * 1.75, 0, L * 0.2, 0);
        tail.addColorStop(0, 'rgba(70,170,255,0)');
        tail.addColorStop(0.68, 'rgba(90,205,255,0.16)');
        tail.addColorStop(1, 'rgba(220,250,255,0.66)');
        ctx.fillStyle = tail;
        ctx.beginPath();
        ctx.moveTo(-L * 1.75, 0); ctx.lineTo(L * 0.25, w * 0.65);
        ctx.lineTo(L * 0.25, -w * 0.65); ctx.closePath(); ctx.fill();

        // 外殻、蒼い槍身、白熱した芯の三層。
        ctx.globalAlpha = 0.34 * pulse;
        ctx.fillStyle = '#4db8ff';
        ctx.beginPath(); ctx.moveTo(L * 1.16, 0); ctx.lineTo(-L * 0.18, w * 1.8); ctx.lineTo(-L, 0); ctx.lineTo(-L * 0.18, -w * 1.8); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#70d9ff';
        ctx.beginPath(); ctx.moveTo(L, 0); ctx.lineTo(-L * 0.1, w); ctx.lineTo(-L * 0.82, 0); ctx.lineTo(-L * 0.1, -w); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#f4feff';
        ctx.beginPath(); ctx.moveTo(L * 1.02, 0); ctx.lineTo(-L * 0.64, w * 0.18); ctx.lineTo(-L * 0.86, 0); ctx.lineTo(-L * 0.64, -w * 0.18); ctx.closePath(); ctx.fill();

        // 槍身の左右を走る安定した稲妻。乱数を使わず移動中のちらつきを抑える。
        ctx.strokeStyle = 'rgba(205,247,255,0.92)';
        ctx.lineWidth = 1.7;
        ctx.lineCap = 'round';
        for (let side = -1; side <= 1; side += 2) {
          const phase = pr.t * 34 + side * 1.7;
          ctx.beginPath();
          ctx.moveTo(-L * 0.9, side * w * 0.25);
          for (let j = 1; j <= 5; j++) {
            const x = -L * 0.9 + (L * 1.8) * j / 5;
            const y = side * (w * 0.55 + Math.sin(phase + j * 2.1) * w * 0.55);
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }

        // 石突側の雷輪と先端の星状閃光。
        ctx.globalAlpha = 0.68 * pulse;
        ctx.strokeStyle = '#8ee8ff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(-L * 0.55, 0, w * 1.25, w * 0.52, 0, 0, G.TAU); ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(L * 1.18, 0); ctx.lineTo(L * 0.92, w * 0.34); ctx.lineTo(L, 0);
        ctx.lineTo(L * 0.92, -w * 0.34); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.restore();   // 弾の見た目1.3倍ラップを閉じる
    }

    // bells (drop + linger over everything)
    for (const b of run.bells) {
      let dy, alpha = 1, sy = 1, sc = 1.15;
      if (b.t < 0.24) {
        const k = b.t / 0.24;
        dy = -84 * (1 - k * k);
        sc = 1.3;
        // 落下中: 着地点(撞音の範囲)の予兆リング=どこに鐘が落ちるか一目で分かる
        ctx.save();
        ctx.globalAlpha = 0.3 + 0.45 * k;
        ctx.strokeStyle = 'rgba(255,224,150,0.95)'; ctx.lineWidth = 2 + 2 * k;
        ctx.beginPath(); ctx.arc(b.x, b.y, (b.r || 80) * (0.4 + 0.55 * k), 0, G.TAU); ctx.stroke();
        ctx.restore();
      } else {
        dy = 0;
        sy = 1 - Math.max(0, 0.12 - (b.t - 0.24)) * 1.6;
        alpha = Math.max(0, 1 - (b.t - 0.4) / 0.5);
      }
      S.draw(ctx, 'bonsho', b.x, b.y - 20 + dy, { scale: sc, sy, alpha });
    }

    // foxes
    if (run.foxes.length) {
      const w = run.weapons.find(w => w.id === 'fox');
      const gold = w && w.awake;
      for (let i = 0; i < run.foxes.length; i++) {
        const f = run.foxes[i];
        const frame = (Math.floor(run.t * 8) + i) % 2;
        const moveA = f.a + Math.PI / 2;
        S.draw(ctx, (gold ? 'fox_g_' : 'fox_') + frame, f.x, f.y, { rot: 0, flipX: Math.cos(moveA) < 0 });
      }
    }

    // enemy orbs — 危険弾は群の中で見失わないよう「暗い縁取り+赤い危険リング+拡大した加算の芯」で際立たせる
    if (run.ep.act.length) {
      const eps = run.ep.act;
      ctx.fillStyle = 'rgba(18,3,8,0.72)';              // 1) 暗縁取り: 明るい自機エフェクトに埋もれないコントラスト
      for (let i = 0; i < eps.length; i++) {
        const o = eps[i];
        if (!G.cam.onScreen(o.x, o.y, 30)) continue;
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 2.1, 0, G.TAU); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,90,70,0.9)'; ctx.lineWidth = 2;   // 2) 赤い危険リング
      for (let i = 0; i < eps.length; i++) {
        const o = eps[i];
        if (!G.cam.onScreen(o.x, o.y, 30)) continue;
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.7, 0, G.TAU); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(190,60,255,0.95)'; ctx.lineWidth = 2.5;   // 2b) ボス弾は妖気の紫縁で雑魚弾と差別化(祓いの金は使わない)
      for (let i = 0; i < eps.length; i++) {
        const o = eps[i];
        if (!o.boss || !G.cam.onScreen(o.x, o.y, 30)) continue;
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 2.05, 0, G.TAU); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'lighter';          // 3) 拡大した加算の芯
      for (let i = 0; i < eps.length; i++) {
        const o = eps[i];
        if (!G.cam.onScreen(o.x, o.y, 30)) continue;
        S.draw(ctx, 'orb', o.x, o.y, { scale: 1.5 + Math.sin(o.t * 10) * 0.14 });
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // particles + damage texts
    G.fx.render(ctx);
    G.fx.renderTexts(ctx);
  };

  const ELITE_COLOR = {
    '韋駄天': '#66d9ff',
    '巌': '#b9c2d2',
    '怨念': '#c47cff',
    '福持ち': '#7ee8a0',
    '銭袋': '#ffd166',
    '夜啼き': '#ff6b50',
    '手負い': '#ff8ca0',
    '大いなる': '#f2e6c9',
    '魂満ち': '#77b8ff',
    '古強者': '#e6a35c',
  };

  function drawEliteMark(ctx, e, run) {
    const color = ELITE_COLOR[e.title] || '#ffd166';
    const r = Math.round(e.r + 6);
    const x = Math.round(e.x), y = Math.round(e.y - e.r * 0.4);
    const pulse = 0.56 + Math.sin(run.t * 6 + e.phase) * 0.16;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = color;
    const n = 5;
    ctx.fillRect(x - r, y - r, n, 2);
    ctx.fillRect(x - r, y - r, 2, n);
    ctx.fillRect(x + r - n, y - r, n, 2);
    ctx.fillRect(x + r - 2, y - r, 2, n);
    ctx.fillRect(x - r, y + r - 2, n, 2);
    ctx.fillRect(x - r, y + r - n, 2, n);
    ctx.fillRect(x + r - n, y + r - 2, n, 2);
    ctx.fillRect(x + r - 2, y + r - n, 2, n);
    ctx.globalAlpha = 1;
  }

  function bossMotionSprite(e) {
    const pref = e.cfg.spr;
    let state = 'idle';
    if (e.bossHurtT > 0) {
      state = 'hurt';
    } else if (e.bossRageT > 0) {
      state = 'rage';
    } else if (e.bossId === 'tanuki' && e.bstate === 'drum') {
      state = e.bt < 0.52 ? 'telegraph' : 'attack';
    } else if (e.bossId === 'ushi' && e.bstate === 'tele') {
      state = 'telegraph';
    } else if (e.bossId === 'ushi' && e.bstate === 'charge') {
      state = 'attack';
    } else if (e.bossId === 'gasha' && e.bstate === 'sweep') {
      state = e.bt < 0.58 ? 'telegraph' : 'attack';
    } else if ((e.bossId === 'nure' && e.bstate === 'dash')
      || (e.bossId === 'nue' && e.bstate === 'swoop')) {
      state = 'attack';
    } else if (e.bossAttackT > 0) {
      state = 'attack';
    } else if (e.bossCastT > 0) {
      state = 'telegraph';
    } else {
      const nextAttack = Math.min(
        e.atk1 > 0 ? e.atk1 : 99,
        e.atk2 > 0 ? e.atk2 : 99,
        e.atk3 > 0 ? e.atk3 : 99
      );
      if (nextAttack < 0.3) state = 'telegraph';
      else if (Math.hypot(e.vx, e.vy) > 8) state = 'move';
    }

    // コマ送りを廃止: モーションごと「代表ポーズ1枚」を出し、状態遷移の刹那だけ弾ませてメリハリ。
    // (構え=telegraph2 を保持→attack2 へSNAP=「溜め→一撃」が読みやすくなる)
    const REP = { idle: 0, move: 2, telegraph: 2, attack: 2, hurt: 0, rage: 2 };
    if (e._poseState !== state) {   // attack/rage に入った刹那だけポップ(drawEnemyで参照)
      if ((state === 'attack' || state === 'rage') && e._poseState != null) e._poseSnapT = G.run.t;
      e._poseState = state;
    }
    e._mstate = state;
    const animated = pref + '_' + state + '_' + (REP[state] || 0);
    return G.S.get(animated) ? animated : (G.S.get(pref + '_0') ? pref + '_0' : pref + '_' + e.frame);
  }

  const _bodyFracCache = {};   // sprite名 -> 中身bbox高 / png高 (当たり判定の体中心算出用にキャッシュ)
  function unitBodyFrac(name) {
    if (_bodyFracCache[name] !== undefined) return _bodyFracCache[name];
    const s = G.S.get(name);
    if (!s || !s.c) return 0;   // 未ロード: キャッシュせず0(=未確定)を返す。呼び元は0で当たり判定を焼き付けない
    let frac = 1;
    const cv = s.c, d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let y0 = 1e9, y1 = -1;
    for (let yy = 0; yy < cv.height; yy++) { const row = yy * cv.width; for (let xx = 0; xx < cv.width; xx++) { if (d[(row + xx) * 4 + 3] > 40) { if (yy < y0) y0 = yy; y1 = yy; break; } } }
    if (y1 >= 0) frac = (y1 - y0 + 1) / cv.height;
    return (_bodyFracCache[name] = frac);
  }
  const _bodyBotCache = {};   // sprite名 -> 中身bbox下端 / png高。各ポーズの足元を idle に揃え、reared な rage/attack が浮いて上が見切れるのを防ぐ
  function unitBodyBottom(name) {
    if (_bodyBotCache[name] !== undefined) return _bodyBotCache[name];
    const s = G.S.get(name);
    if (!s || !s.c) return 0;   // 未ロードはキャッシュせず0
    const cv = s.c, d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let y1 = -1;
    for (let yy = cv.height - 1; yy >= 0; yy--) { const row = yy * cv.width; for (let xx = 0; xx < cv.width; xx++) { if (d[(row + xx) * 4 + 3] > 40) { y1 = yy; break; } } if (y1 >= 0) break; }
    if (y1 < 0) return 0;
    return (_bodyBotCache[name] = (y1 + 1) / cv.height);
  }

  function drawEnemy(ctx, e, run) {
    const S = G.S;
    const spr = e.boss ? bossMotionSprite(e) : e.cfg.spr + '_' + e.frame;
    if (e.hitOff === undefined) {   // 足元→体の中心オフセット = 表示体高の半分(体bbox実測)。スプライト未ロード時は確定せず次フレーム再算出(0=足元に焼き付けない)
      const nm = e.boss ? ('b_' + e.bossId + '_idle_0') : (e.cfg.spr + '_0');
      const useName = S.get(nm) ? nm : (S.get(spr) ? spr : null);
      const _hs = useName ? S.get(useName) : null;
      const frac = useName ? unitBodyFrac(useName) : 0;   // 実測できた時だけ >0
      if (_hs && frac > 0) e.hitOff = frac * _hs.h * e.scale / 2;   // 未ロードなら undefined のまま保持
    }
    // 妖の素体は左向き: 右へ動く時に反転して進行方向(=プレイヤー側)を向く。
    // プレイヤー至近で vx の符号が毎フレーム反転し「ガタガタ左右に揺れる」のを防ぐため、
    // 明確な横移動(デッドゾーン)かつ前回反転から間隔をおいた時だけ向きを更新する(ヒステリシス)。
    const wantFace = e.vx > 12 ? 1 : e.vx < -12 ? 0 : e._face;
    const faceDt = run.t - (e._faceT == null ? -1 : e._faceT);
    if (wantFace != null && wantFace !== e._face && (faceDt > 0.28 || faceDt < 0)) {
      e._face = wantFace; e._faceT = run.t;
    }
    const flip = e._face === 1;
    if (e.elite) drawEliteMark(ctx, e, run);
    if (e.meleeWind > 0) {   // 近接ランジの予告: 突進軌道に沿った直線レーン(この帯の外へ退避すれば躱せる)
      const k = 1 - Math.max(0, e.meleeWind) / (G.data.BOSS_TELE_T || 0.62);   // 0→1 構えの進行 (windup と一致)
      const ta = Math.atan2(e.meleeDy, e.meleeDx);
      const len = e.r + 145, halfW = e.r * 0.75 + 24;   // 判定レーン(reach/laneHalf)に一致
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(ta);   // 以降ローカル: x=進行方向 / y=横
      ctx.fillStyle = `rgba(220,28,24,${(0.15 + 0.22 * k).toFixed(3)})`;   // 危険レーンの地塗り(暗背景でもはっきり)
      ctx.fillRect(0, -halfW, len, halfW * 2);
      ctx.fillStyle = `rgba(255,72,48,${(0.34 * k).toFixed(3)})`;          // 内から先端へ満ちる赤(発動が近いほど先まで満ちる)
      ctx.fillRect(0, -halfW, len * (0.25 + 0.75 * k), halfW * 2);
      ctx.globalAlpha = 0.72 + 0.28 * Math.sin(run.t * 18);               // 脈動する明るい縁
      ctx.strokeStyle = 'rgba(255,130,100,0.98)'; ctx.lineWidth = 3;
      ctx.strokeRect(0, -halfW, len, halfW * 2);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();   // 突進の軸線
      ctx.beginPath(); ctx.moveTo(len, -12); ctx.lineTo(len + 16, 0); ctx.lineTo(len, 12); ctx.stroke();   // 先端の矢じり=進行方向
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    let sx = 1, sy = 1;
    if (e.squashT > 0) {
      const k = Math.min(1.5, e.squashT / 0.12);
      sx = 1 + 0.15 * k;
      sy = 1 - 0.11 * k;
    }
    if (e.lit && !e.boss) {
      const sigil = e.litSigil && D.LAMP_SIGILS[e.litSigil];
      const col = sigil ? sigil.color : 'rgba(170,206,255,0.85)';
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.ellipse(e.x, e.y + 2, e.r + 4, (e.r + 4) * 0.5, 0, 0, G.TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (e.rootT > 0 && !e.boss) {   // 影縫い: 紫の縫い留めリング
      ctx.globalAlpha = 0.62;
      ctx.strokeStyle = 'rgba(177,140,255,0.9)';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(e.x, e.y + 2, e.r + 4, (e.r + 4) * 0.45, 0, 0, G.TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (e.curseT > 0) {   // 呪詛: 脈動する紫の呪い環 (被ダメ増の目印)
      ctx.globalAlpha = 0.45 + 0.22 * Math.sin(run.t * 6 + e.phase);
      ctx.strokeStyle = 'rgba(176,123,255,0.95)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x, e.y - e.r * 0.15, e.r + 3, 0, G.TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 代表ポーズ運用の補助: attack/rage 突入の刹那だけ弾むポップと、待機/移動の微かな息づかい(コマ送り廃止の代わり)
    let pop = 1, breath = 0;
    if (e.boss) {
      if (e._poseSnapT !== undefined) { const pr = (run.t - e._poseSnapT) / 0.18; if (pr >= 0 && pr < 1) pop = 1 + 0.13 * (1 - pr) * (1 - pr); }
      if (e._mstate === 'idle' || e._mstate === 'move') breath = Math.sin(run.t * 1.6 + e.phase) * 2;
    }
    const flyY = e.cfg.fly ? Math.sin(run.t * 3 + e.phase) * 3 : 0;
    // ボス各ポーズの足元揃え: rage/attack は中身がキャンバス上寄り。全フレームが idle 由来の単一アンカーを共有するため、
    // 補正しないと reared なポーズが上へ浮き、上部が見切れる。各表示フレームの中身下端を idle(=ay)に合わせて下げる。
    let footCorrect = 0;
    if (e.boss) {
      const sObj = S.get(spr);
      if (sObj && sObj.h && sObj.c) {
        const bot = unitBodyBottom(spr);
        if (bot > 0) footCorrect = -(bot * sObj.h - sObj.ay) * e.scale;
      }
    }
    const bodyY = e.y + flyY + breath + (e.hitOff || 0) + footCorrect;   // 点(e.y)がイラストの中心に来るよう体半分ぶん下げ + ポーズ足元補正
    // 識別補助: 暗い背景に同化しないよう、白シルエットを一回り大きく背後へ薄く敷いて縁取る
    const rimSpr = spr + '_w';
    if (S.get(rimSpr)) S.draw(ctx, rimSpr, e.x, bodyY, { scale: e.scale * 1.12 * pop, flipX: flip, sx, sy, alpha: e.boss ? 0.22 : 0.3 });
    S.draw(ctx, spr, e.x, bodyY, { scale: e.scale * pop, flipX: flip, sx, sy });
    if (e.flash > 0 && S.get(rimSpr)) {   // ヒット白フラッシュ: 通常絵の上に上限付き部分αで重ねる(連続ヒットでも真っ白にならず色・形が残る)
      S.draw(ctx, rimSpr, e.x, bodyY, { scale: e.scale * pop, flipX: flip, sx, sy, alpha: Math.min(0.55, e.flash * 3) });
    }
    if (e.cfg.light) {
      S.draw(ctx, 'glow_warm', e.x, e.y - 6, { scale: 1.1, alpha: 0.7 });
    }
    if (e.curseT > 0) {   // 呪詛: 呪われた妖は紫の靄をまとう (被ダメ増が掛かっている持続の合図)
      const cp = 0.5 + 0.5 * Math.sin(run.t * 5 + e.phase);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.20 + 0.16 * cp;
      ctx.fillStyle = '#7a3dff';
      ctx.beginPath(); ctx.arc(e.x, e.y + flyY - e.r * 0.2, e.r * (1.05 + 0.1 * cp), 0, G.TAU); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 0.55 + 0.3 * cp;   // 頭上脇を回る紫の呪符片
      ctx.fillStyle = '#c8a0ff';
      const oa = run.t * 2.2 + e.phase, ox = e.x + Math.cos(oa) * (e.r + 4), oy = e.y + flyY - e.r * 0.5 + Math.sin(oa) * 3;
      ctx.beginPath(); ctx.arc(ox, oy, 1.8, 0, G.TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (e.markT > 0) {   // 影縫いの印: 被ダメ増マーク (頭上の紫▼)
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#c8a8ff';
      const my = e.y - e.r - 8;
      ctx.beginPath(); ctx.moveTo(e.x, my + 5); ctx.lineTo(e.x - 4, my - 2); ctx.lineTo(e.x + 4, my - 2); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (e.hmark > 0) {   // 祓印: 頭上に金の御札を段数分 (3段は明滅して「祓える」合図)
      const n = Math.min(3, e.hmark), gy = e.y - e.r - 14, gw = 3.4, gh = 8, gap = 5;
      const ready = e.hmark >= 3 ? 0.7 + 0.3 * Math.sin(run.t * 9 + e.phase) : 1;
      for (let m = 0; m < n; m++) {
        const gx = e.x - (n - 1) * gap / 2 + m * gap;
        ctx.globalAlpha = 0.92 * ready;
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(gx - gw / 2, gy - gh / 2, gw, gh);            // 札の地(金)
        ctx.fillStyle = 'rgba(40,28,8,0.85)';
        ctx.fillRect(gx - gw / 2, gy - gh * 0.34, gw, gh * 0.18);  // 墨書(横一文字)
      }
      ctx.globalAlpha = 1;
    }
    if (e.boss) {
      // boss minimal overhead bar
      const w = e.r * 2.2;
      const frac = G.clamp(e.hp / e.maxHp, 0, 1);
      const bossArt = S.get(spr);
      const barY = e.y + flyY - (bossArt ? bossArt.ay * e.scale * sy : e.r * 2) - 10;
      ctx.fillStyle = 'rgba(8,10,18,0.7)';
      ctx.fillRect(e.x - w / 2, barY, w, 4);
      ctx.fillStyle = '#e34b2f';
      ctx.fillRect(e.x - w / 2, barY, w * frac, 4);
    }
  }

  function drawPlayer(ctx, p, run) {
    const pref = G.data.CHARS[run.charId].spr;
    if (!p.alive) {
      ctx.globalAlpha = Math.max(0, 1 - run.deadT * 1.4);
      G.S.draw(ctx, pref + '0', p.x, p.y + 4, { rot: -Math.PI / 2, scale: G.UNIT_SCALE });
      ctx.globalAlpha = 1;
      return;
    }
    // 灯火の加護: 灯りの中/残り火の間、術者自身が灯火色に灯る(段で強まる)。全灯=灯明満ちは金色の強い加護
    const glowSig = run.lampStage > 0 ? (run.lampAura.id || run.lampLastId) : null;
    if (glowSig || run.allLit) {
      const sig = D.LAMP_SIGILS[glowSig] || D.LAMP_SIGILS.byakuren;
      const st = run.allLit ? D.LAMP.dwellStages.length : run.lampStage;
      const cy = p.y + (p.hitOff || 16) * 0.5;
      const R = (run.allLit ? 40 : 28) + st * 8;
      const baseA = run.allLit ? 0.2 : 0.13;
      const a = (baseA + 0.045 * st) * (0.78 + 0.22 * Math.sin(run.t * 4.5));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a;
      const g = ctx.createRadialGradient(p.x, cy, 0, p.x, cy, R);
      g.addColorStop(0, run.allLit ? 'rgba(255,224,138,0.95)' : sig.glow);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, cy, R, 0, G.TAU); ctx.fill();
      ctx.restore();
    }
    if (p.hurtT > 0 && Math.floor(run.t * 18) % 2 === 0) ctx.globalAlpha = 0.45;
    // コマ送りを廃止: モーションごとに「代表ポーズ1枚」を出し、状態が変わった瞬間だけ弾ませてメリハリを付ける。
    // (歪み生成フレームを順送りすると状態内でバラついて気持ち悪い→1枚固定+遷移のキレで読みやすく)
    let state = 'idle';
    if (p.hurtAnimT > 0) state = 'hurt';
    else if (p.dashT > 0) state = 'dash';
    else if (p.castT > 0) state = 'cast';
    else if (p.walking) state = 'walk';
    const REP = { idle: 0, walk: 3, dash: 1, cast: 2, hurt: 0 };   // 各モーションの代表コマ
    let spr = pref + state + '_' + (REP[state] || 0);
    if (!G.S.get(spr)) spr = G.S.get(pref + state + '_0') ? pref + state + '_0' : pref + '0';
    // 状態遷移のキレ: dash/cast/hurt に入った刹那だけスケールを弾ませる(コマ送りでない=一貫した動き)
    if (p._poseState !== state) {
      p._poseState = state;
      if (state === 'dash' || state === 'cast' || state === 'hurt') p._poseSnapT = run.t;
    }
    let pop = 1;
    if (p._poseSnapT !== undefined) { const pr = (run.t - p._poseSnapT) / 0.16; if (pr >= 0 && pr < 1) pop = 1 + 0.2 * (1 - pr) * (1 - pr); }
    const bob = state === 'walk' ? Math.sin(p.bobT * 0.9) * 2 : 0;   // 歩きの上下動だけ手続きで(コマ送り無し)
    const flash = spr + '_w';
    const drawSpr = (p.hurtT > 0.38 && G.S.get(flash)) ? flash : spr;
    if (p.hitOff === undefined) {   // 点(p.y)をイラストの中心に: 体bboxの半分ぶん下げて描画
      const base = pref + '0', hs = G.S.get(base), frac = hs ? unitBodyFrac(base) : 0;
      if (hs && frac > 0) p.hitOff = frac * hs.h * G.UNIT_SCALE / 2;
    }
    G.S.draw(ctx, drawSpr, p.x, p.y + (p.hitOff || 16) + bob, { flipX: p.facing < 0, scale: G.UNIT_SCALE * pop });
    ctx.globalAlpha = 1;
  }

  return ENT;
})();
