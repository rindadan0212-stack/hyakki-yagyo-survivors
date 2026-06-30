/* 百鬼夜行サバイバーズ — systems: director, weapons, leveling, awakening */
'use strict';

G.sys = (() => {
  const SYS = {};
  const D = G.data;
  const maxP = id => D.P[id].maxLv || 3;   // 宝具のLv上限 (全宝具 最大Lv3)
  const maxT = id => D.TALENTS[id].maxLv || 3;
  const maxWLvl = id => D.rarityOf('weapon', id) === 'legend' ? 1 : Math.min(3, D.W[id].levels.length + 1);   // 伝説=Lv1のみ / その他=最大Lv3
  // 上昇内容の統合表示: Lv2=旧levels前半 / Lv3=後半 をまとめて1行に (calcWの統合適用と対応)
  // 同じステータスの上昇(例「威力 +10% / 威力 +8%」)を合算して1つにまとめる。
  // 「ラベル ±数値[単位]」形式だけ合算し、それ以外の説明文(例「二段化」)はそのまま残す。
  const mergeDeltas = arr => {
    // .d は1要素に「式神 +1 / 半径 +10」のように複数statが連結される事があるので、まず " / " で原子に分解
    const parts = arr.flatMap(d => String(d).split(/\s*\/\s*/)).map(s => s.trim()).filter(Boolean);
    const order = [], sums = {}, plain = [];
    for (const d of parts) {
      const m = /^(.+?)\s*([+\-])\s*(\d+(?:\.\d+)?)\s*(%|s|秒|m|体|本|発|段|倍)?$/.exec(d);
      if (!m) { if (!plain.includes(d)) plain.push(d); continue; }
      const label = m[1].trim(), num = parseFloat(m[3]) * (m[2] === '-' ? -1 : 1), unit = m[4] || '';
      const key = label + '|' + unit;
      if (!(key in sums)) { sums[key] = { label, unit, v: 0 }; order.push(key); }
      sums[key].v += num;
    }
    const merged = order.map(k => {
      const s = sums[k];
      const val = Number.isInteger(s.v) ? s.v : Math.round(s.v * 10) / 10;
      return `${s.label} ${s.v >= 0 ? '+' : ''}${val}${s.unit}`;
    });
    return [...merged, ...plain].join(' / ') || null;
  };
  const lvDelta = (cfg, toLv) => {
    const L = (cfg && cfg.levels) || [], n = L.length, mid = Math.ceil(n / 2);
    const a = toLv <= 2 ? 0 : mid, b = toLv <= 2 ? mid : n;
    return mergeDeltas(L.slice(a, b).map(x => x.d).filter(Boolean));
  };
  // レア度→新規取得の抽選重み倍率 (高レアほど出にくい)
  const rw = (kind, id) => (D.RARITY[D.rarityOf(kind, id)] || D.RARITY.common).weight;

  // ---- 抽選ゲート (レベルアップ/宝箱 共通。ここ以外で重複実装しない) ----
  // 「貫きの鏃／跳ね鞠」が活きる得物 (pierceable=有限貫通の弾を撃つ飛び道具) を持っているか。
  // 近接/設置/オーラ/無限貫通の得物では両宝具は無効なので、これらの得物では抽選から外す (死にスキル防止)。
  const hasPierceWeapon = run => run.weapons.some(w => D.W[w.id].pierceable);
  // 指定 trait を固有に持つ武器 (例: 'bounce' → 手裏剣) を持っているか
  const hasTraitW = (run, trait) => run.weapons.some(w => (D.W[w.id].base[trait] || 0) > 0);

  // 新規宝具を抽選に出してよいか
  SYS.passiveOffered = (run, id) => {
    const cfg = D.P[id];
    if (run.banished && run.banished[id]) return false;                        // 封印済
    if (cfg.excludes && (cfg.excludes in run.passives)) return false;          // 流派の相互排他
    if (cfg.reqPierceWeapon && !hasPierceWeapon(run)) return false;            // 飛び道具得物専用 (死にスキル防止)
    if (cfg.clashWeapon && hasTraitW(run, cfg.clashWeapon)) return false;      // 武器との流派競合
    return true;
  };
  // 新規武器を抽選に出してよいか (逆方向の競合もここで弾く)
  SYS.weaponOffered = (run, id) => {
    const cfg = D.W[id];
    if (D.WEB_WIP && D.WEB_WIP.includes(id)) return false;                      // Web未実装(Unity移植の残)＝抽選に出さない
    if (run.banished && run.banished[id]) return false;                        // 封印済
    if (cfg.charOnly && cfg.charOnly !== run.charId) return false;
    if (cfg.unlock && !(run.wOwned || []).includes(id)) return false;
    for (const pid in run.passives) {
      const pc = D.P[pid];
      if (pc.clashWeapon && (cfg.base[pc.clashWeapon] || 0) > 0) return false; // 例: 貫きの鏃所持中の手裏剣
    }
    // 伝説スキル: 同ジャンルの非伝説スキルを「3種」Lv3(最大)にしたら解禁(到達可能な特化の証)。
    // 旧仕様=同ジャンル全種Lv3は事実上不可能だったため緩和(2026-06-29)。
    if (D.rarityOf('weapon', id) === 'legend') {
      const genre = (D.WTAGS[id] || [])[0];
      if (genre) {
        const init = { ofuda: 1, laser: 1, zangetsu: 1 };
        const lv = {}; for (const w of run.weapons) lv[w.id] = w.lvl || 1;
        let maxed = 0, avail = 0;
        for (const wid in D.W) {
          if (init[wid] || wid === id) continue;
          if (D.rarityOf('weapon', wid) === 'legend') continue;   // 他の伝説は前提に含めない
          if ((D.WTAGS[wid] || [])[0] !== genre) continue;
          avail++;
          if ((lv[wid] || 0) >= 3) maxed++;
        }
        if (maxed < Math.min(3, avail)) return false;   // 同ジャンルの非伝説を3種(在庫が少なければ全部)Lv3にするまで出さない
      }
    }
    return true;
  };

  // 伝説の出現確率: 解禁(同ジャンル3種Lv3)で50%、Lv3が増えるごとに上昇、全種Lv3で100%(=次のレベルアップで確定)。
  // 未解禁は0。weaponOffered(unlock)が真の伝説に対して使う。
  SYS.legendChance = (run, id) => {
    const genre = (D.WTAGS[id] || [])[0];
    if (!genre) return 0;
    const init = { ofuda: 1, laser: 1, zangetsu: 1 };
    const lv = {}; for (const w of run.weapons) lv[w.id] = w.lvl || 1;
    let maxed = 0, avail = 0;
    for (const wid in D.W) {
      if (init[wid] || wid === id) continue;
      if (D.rarityOf('weapon', wid) === 'legend') continue;
      if ((D.WTAGS[wid] || [])[0] !== genre) continue;
      avail++;
      if ((lv[wid] || 0) >= 3) maxed++;
    }
    const need = Math.min(3, avail);
    if (maxed < need) return 0;
    return 0.5 + 0.5 * (maxed - need) / Math.max(1, avail - need);   // 50% → 100%
  };

  // 系統チップ: 得物=タグ / 宝具・秘術=役割(cat)。ビルドのジャンルを視覚化する用。
  SYS.skillTags = (kind, id) => {
    if (kind === 'weapon') return ((D.WTAGS && D.WTAGS[id]) || []).map(k => D.TAGINFO[k]).filter(Boolean);
    if (kind === 'passive') { const c = D.P[id]; return (c && D.CATINFO[c.cat]) ? [D.CATINFO[c.cat]] : []; }
    if (kind === 'talent') { const c = D.TALENTS[id]; return (c && D.CATINFO[c.cat]) ? [D.CATINFO[c.cat]] : []; }
    return [];
  };
  // 相乗/共鳴ヒント: この札を取ると組める相乗。ready=相方所持で即成立 / 未所持は「○○と」布石。
  SYS.skillSyn = (run, kind, id) => {
    const out = [];
    if (kind === 'weapon') {
      for (const sid in D.SYNERGIES) {
        const s = D.SYNERGIES[sid];
        if (!s.need.includes(id) || (run.syn && run.syn[sid])) continue;
        const other = s.need.find(x => x !== id);
        out.push({ name: s.name, color: s.color, ready: run.weapons.some(w => w.id === other), withName: (D.W[other] || {}).name || other });
      }
    } else if (kind === 'passive') {
      for (const rs of D.RESO) {
        if (!rs.need.includes(id) || (run.reso && run.reso[rs.id])) continue;
        const other = rs.need.find(x => x !== id);
        out.push({ name: rs.name, color: '#c3b0ff', ready: !!run.passives[other], withName: (D.P[other] || {}).name || other });
      }
    }
    return out;
  };

  // ---------------- run bootstrap ----------------
  SYS.startRun = (stageIdx = 0, charId = 'haru', weaponId) => {
    G.run = G.ent.newRun(stageIdx, charId);
    G.run.moon = D.rollMoon();
    G.run.hono = G.store.get('hono', {});
    G.run.wOwned = G.store.get('weaponsOwned', []);
    // 鍛錬 (恒久強化) のスナップショット: c = 現キャラの段位, w = 武器ごとの段位
    G.run.forge = {
      c: G.store.get('charForge', {})[G.run.charId] || 0,
      w: G.store.get('weaponForge', {}),
    };
    // 奥義の編成
    const uid = D.ULTS[G.store.get('lastUlt', 'harai')] ? G.store.get('lastUlt', 'harai') : 'harai';
    G.run.ult = {
      id: uid,
      charge: 0,
      need: Math.max(1, Math.round(D.ULTS[uid].need * (G.run.moon.ultNeedMul || 1))),
    };
    // 技の編成 (鍛錬レベルを実効値に焼き込む: per-Lv 成長 + 節目能力)
    const sid = D.SKILLS[G.store.get('lastSkill', 'goho')] ? G.store.get('lastSkill', 'goho') : 'goho';   // 翔(dash)はShift共通化。初期の装備技(Q)は非dashのgoho
    const slvl = G.store.get('skillForge', {})[sid] || 0;
    const scfg = D.SKILLS[sid];
    const skillEff = Object.assign({}, scfg.rank(slvl));
    for (const m of scfg.forgeMilestones || []) if (slvl >= m.lv) m.apply(skillEff);   // 節目能力
    skillEff.cd *= G.run.moon.skillCdMul || 1;
    G.run.skill = { id: sid, eff: skillEff, cdT: 0, shield: false };
    G.run.wardCdMax = D.WARD.cd * (G.run.moon.wardCdMul || 1);
    G.run.dir.eliteAt *= G.run.moon.eliteEveryMul || 1;
    // 初期武器は使い手ごとに固定 (晴=破魔の御札 / 鈴=注連縄 / 無月=残月)。weaponId は無視。
    const wid = D.CHARS[G.run.charId].weapon;
    G.fx.reset();
    G.cam.reset(0, 0);
    SYS.addWeapon(wid).initial = true;   // 初期武器: Lvアップ無し / 数打ちの極意の対象
    SYS.recomputeStats();
    SYS.checkSynergies();   // 相乗フラグ初期化 (初期武器1挺だけなら何も成立しない)
    // 据置提灯は newRun の placeLamps でマップ各所へ固定配置済み
    G.ui.announce(G.run.stage.name, G.run.stage.sub);
    G.ui.announce(G.run.moon.name, G.run.moon.desc);
  };

  // ---------------- night pacts ----------------
  // tier(夜更け)で goal/risk/reward/失敗ペナルティを増幅: 序盤=易/低risk低reward、夜更け=難/高risk高reward
  const PACT_RISK_MUL = t => 1 + (t || 0) * 0.7;     // 0:1.0 / 1:1.7 / 2:2.4
  const PACT_REWARD_MUL = t => 1 + (t || 0) * 0.9;   // 0:1.0 / 1:1.9 / 2:2.8
  const pactTollFrac = t => 0.12 + (t || 0) * 0.13;  // 失敗で失う体力割合: 0:12% / 1:25% / 2:38%
  function scalePactRisk(risk, t) {
    const m = PACT_RISK_MUL(t), o = {};
    for (const k in risk) {
      const v = risk[k];
      if (k === 'spawnElite') o[k] = v;
      else if (k === 'spawnIntervalMul') o[k] = Math.max(0.35, +(1 - (1 - v) * m).toFixed(3));   // <1: 小さいほど多湧き
      else if (k === 'enemySpeedMul' || k === 'enemyDmgMul') o[k] = +(1 + (v - 1) * m).toFixed(3);
      else o[k] = +(v * m).toFixed(3);   // magnet/speed (負方向に増幅)
    }
    return o;
  }
  function scalePactReward(reward, t) {
    const m = PACT_REWARD_MUL(t), o = {};
    for (const k in reward) {
      const v = reward[k];
      if (k === 'reroll') o[k] = v;
      else if (k === 'armor') o[k] = Math.round(v * (1 + (t || 0)));
      else if (k === 'hasteMul') o[k] = +(1 - (1 - v) * m).toFixed(3);
      else o[k] = +(v * m).toFixed(3);
    }
    return o;
  }
  function fmtPactRisk(risk, t) {
    const a = [];
    if (risk.spawnIntervalMul) a.push(`出現 +${Math.round((1 / risk.spawnIntervalMul - 1) * 100)}%`);
    if (risk.enemySpeedMul) a.push(`敵速 +${Math.round((risk.enemySpeedMul - 1) * 100)}%`);
    if (risk.enemyDmgMul) a.push(`敵攻 +${Math.round((risk.enemyDmgMul - 1) * 100)}%`);
    if (risk.spawnElite) a.push('精鋭を招く');
    if (risk.magnet) a.push(`吸引 ${Math.round(risk.magnet * 100)}%`);
    if (risk.speed) a.push(`移動 ${Math.round(risk.speed * 100)}%`);
    a.push(`失敗:体力-${Math.round(pactTollFrac(t) * 100)}%`);
    return a.join(' / ');
  }
  function fmtPactReward(r) {
    const a = [];
    if (r.might) a.push(`威力 +${Math.round(r.might * 100)}%`);
    if (r.area) a.push(`範囲 +${Math.round(r.area * 100)}%`);
    if (r.magnet) a.push(`吸引 +${Math.round(r.magnet * 100)}%`);
    if (r.crit) a.push(`会心 +${Math.round(r.crit * 100)}%`);
    if (r.hasteMul) a.push(`発動 -${Math.round((1 - r.hasteMul) * 100)}%`);
    if (r.maxHp) a.push(`体力 +${Math.round(r.maxHp)}`);
    if (r.armor) a.push(`防御 +${r.armor}`);
    if (r.reroll) a.push(`引き直し +${r.reroll}`);
    return a.join(' / ');
  }

  SYS.buildPactChoices = () => {
    const run = G.run;
    const tier = Math.min(D.PACT_SCHEDULE.length - 1, run.dir.pactIdx);
    let pool = D.PACT_ORDER.filter(id => !run.pactSeen[id]);
    if (pool.length < 2) pool = D.PACT_ORDER.slice();
    const chosen = [];
    while (chosen.length < 2 && pool.length) {
      const cfg = D.PACTS[pool.splice((Math.random() * pool.length) | 0, 1)[0]];
      const risk = scalePactRisk(cfg.risk || {}, tier), reward = scalePactReward(cfg.reward || {}, tier);
      chosen.push(Object.assign({}, cfg, { tier, goal: cfg.target[tier], risk, reward, riskText: fmtPactRisk(risk, tier), rewardText: fmtPactReward(reward) }));
    }
    chosen.push(Object.assign({}, D.PACTS.inori, { tier, goal: 0 }));
    return chosen;
  };

  function pactEliteSpawn(run, count) {
    const wv = currentWave(run.t * run.stage.waveShift, run.stage);
    let bestK = null, bestW = -1;
    for (const k in wv.w) {
      if (wv.w[k] > bestW) { bestW = wv.w[k]; bestK = k; }
    }
    for (let i = 0; i < count; i++) {
      const [x, y] = ringPos(run.player, 560 + i * 45);
      G.ent.spawnEnemy(bestK, x, y, { elite: true, force: true });
    }
  }

  SYS.startPact = choice => {
    const run = G.run;
    if (!run || !choice) return;
    const base = D.PACTS[choice.id];
    if (!base) return;
    run.pactSeen[base.id] = true;

    if (base.objective === 'safe') {
      const p = run.player;
      const heal = Math.round(p.stats.maxHp * 0.30);
      p.hp = Math.min(p.stats.maxHp, p.hp + heal);
      run.ult.charge = Math.min(run.ult.need, run.ult.charge + Math.ceil(run.ult.need * 0.25));
      G.audio.sfx('pactrest');
      G.ui.announce(base.name, `体力 +${heal} ・ 奥義を充填`);
      G.fx.ring(p.x, p.y, { r0: 12, r1: 105, life: 0.42, color: 'rgba(184,199,230,0.85)', width: 3 });
      return;
    }

    const tier = choice.tier || 0;
    const risk = choice.risk || scalePactRisk(base.risk || {}, tier);       // choice経由ならスケール済、直接呼び出しでもtierで増幅
    const reward = choice.reward || scalePactReward(base.reward || {}, tier);
    const cfg = Object.assign({}, base, { goal: choice.goal || base.target[tier], tier, risk, reward, rewardText: choice.rewardText || fmtPactReward(reward) });
    run.ordeal = {
      cfg,
      time: cfg.dur,
      elapsed: 0,
      progress: 0,
      baseKills: run.kills,
      baseSouls: run.souls,
      baseElites: run.eliteKills,
      baseHits: run.hitsTaken,
      lastTick: 99,
    };
    SYS.recomputeStats();
    if (cfg.risk.spawnElite) pactEliteSpawn(run, cfg.goal);
    G.audio.sfx('pactstart');
    G.ui.announce(cfg.name, `${cfg.dur}秒の試練`);
    G.fx.ring(run.player.x, run.player.y, { r0: 18, r1: 185, life: 0.55, color: cfg.color, width: 4 });
    G.cam.punch(1.035);
  };

  function pactReward(run, ordeal) {
    const reward = ordeal.cfg.reward || {};
    const mods = run.pactMods;
    if (reward.might) mods.might += reward.might;
    if (reward.area) mods.area += reward.area;
    if (reward.speed) mods.speed += reward.speed;
    if (reward.hasteMul) mods.hasteMul *= reward.hasteMul;
    if (reward.magnet) mods.magnet += reward.magnet;
    if (reward.armor) mods.armor += reward.armor;
    if (reward.maxHp) mods.maxHp += reward.maxHp;
    if (reward.crit) mods.crit += reward.crit;
    if (reward.reroll) run.rerolls += reward.reroll;
    run.koban += 15 + ordeal.cfg.tier * 10;
    run.pactSeals.push(ordeal.cfg.id);
  }

  function finishPact(success) {
    const run = G.run;
    const ordeal = run.ordeal;
    if (!ordeal) return;
    run.ordeal = null;
    if (success) pactReward(run, ordeal);
    SYS.recomputeStats();
    const p = run.player;
    if (success) {
      G.audio.sfx('pactwin');
      G.ui.announce(`契印「${ordeal.cfg.name}」`, ordeal.cfg.rewardText);
      G.fx.puffRing(p.x, p.y, ordeal.cfg.color, 16, 240);
      G.fx.ring(p.x, p.y, { r0: 16, r1: 220, life: 0.58, color: ordeal.cfg.color, width: 5 });
      G.fx.flash = Math.min(0.45, G.fx.flash + 0.2);
      G.cam.punch(1.045);
    } else {
      // 失敗ペナルティ: 契りを破れば妖に贄を喰われる(賭けの掛け金=この痛手が心理戦を生む)
      const toll = Math.round(p.stats.maxHp * pactTollFrac(ordeal.cfg.tier || 0));   // 夜更けほど大きな贄(0:12% / 1:25% / 2:38%)
      if (!G.debug.god) p.hp = Math.max(1, p.hp - toll);
      run.ult.charge = Math.max(0, run.ult.charge - Math.ceil(run.ult.need * 0.20));
      G.audio.sfx('pactfail');
      G.ui.announce('契り破れ、贄を喰わる', `体力 -${toll} ・ 奥義 減退`);
      G.fx.ring(p.x, p.y, { r0: 20, r1: 150, life: 0.5, color: 'rgba(190,40,60,0.8)', width: 4 });
      G.fx.flash = Math.min(0.5, (G.fx.flash || 0) + 0.18);
      G.cam.add(6);
    }
  }

  SYS.updatePact = h => {
    const run = G.run;
    const o = run && run.ordeal;
    if (!o) return;
    o.elapsed += h;
    o.time -= h;
    const sec = Math.max(0, Math.ceil(o.time));
    if (sec <= 5 && sec !== o.lastTick) {
      o.lastTick = sec;
      G.audio.sfx('tick');
    }
    switch (o.cfg.objective) {
      case 'kills':
        o.progress = run.kills - o.baseKills;
        break;
      case 'combo':
        o.progress = Math.max(o.progress, run.combo);
        break;
      case 'elite':
        o.progress = run.eliteKills - o.baseElites;
        break;
      case 'souls':
        o.progress = Math.floor(run.souls - o.baseSouls);
        break;
      case 'nohit':
        if (run.hitsTaken > o.baseHits) { finishPact(false); return; }
        o.progress = Math.floor(o.elapsed);
        break;
    }
    if (o.progress >= o.cfg.goal) finishPact(true);
    else if (o.time <= 0) finishPact(false);
  };

  SYS.maybeOfferPact = () => {
    const run = G.run;
    if (!run || run.ordeal || run.boss || run.overtime || run.pendLv > 0) return;
    const idx = run.dir.pactIdx;
    if (idx >= D.PACT_SCHEDULE.length) return;
    if (run.clock < run.stage.length * D.PACT_SCHEDULE[idx]) return;
    const choices = SYS.buildPactChoices();
    run.dir.pactIdx++;
    if (G.debug.autoLevel) {
      SYS.startPact(choices[0]);
    } else {
      G.main.openPact(choices);
    }
  };

  // effective might incl. 荒魂 (×2) blessing
  SYS.effMight = () => {
    const r = G.run;
    const comboMul = 1 + Math.min(0.30, Math.floor((r.combo || 0) / 50) * 0.05);
    const zansho = r.lampStage > 0
      ? 1 + [0, 0.12, 0.22, 0.32][r.talents.zansho || 0] * (r.lampPow || 1)   // 灯りの段階で増幅(残り火対応)
      : 1;
    const allLit = r.allLit ? 1 + D.LAMP_ALLLIT.might : 1;   // 灯明満ち: 威力+25%
    return r.player.stats.might * comboMul * zansho * allLit * (r.buffs && r.buffs.aratama > 0 ? 2 : 1);
  };

  // ---------------- weapon stats ----------------
  // fold per-level deltas onto base; then awakening bonuses
  SYS.calcW = w => {
    const cfg = D.W[w.id];
    const st = Object.assign({ back: 0, cross: 0 }, cfg.base);
    // 最大Lv3化に伴い旧levels(最大6段)を統合適用: Lv2=前半 / Lv3=全段(旧最大相当の成長を2段で)
    const _lv = w.lvl || 1, _nl = cfg.levels.length, _applyN = _lv <= 1 ? 0 : (_lv >= 3 ? _nl : Math.ceil(_nl / 2));
    for (let i = 0; i < _applyN; i++) {
      const dl = cfg.levels[i];
      for (const k in dl) {
        if (k === 'd') continue;
        const gainMul = k === 'dmg' ? D.LEVEL_DMG
          : (D.LEVEL_FULL_STATS && D.LEVEL_FULL_STATS[k] ? 1 : D.LEVEL_STAT_MUL);
        st[k] = (st[k] || 0) + dl[k] * gainMul;
      }
    }
    if (w.awake && cfg.awake) {
      for (const k in cfg.awake) {
        if (k.endsWith('Mul')) {
          const base = k.slice(0, -3);
          st[base] = (st[base] || 0) * cfg.awake[k];
        } else if (k.endsWith('Add')) {
          const base = k.slice(0, -3);
          st[base] = (st[base] || 0) + cfg.awake[k];
        } else {
          st[k] = (st[k] || 0) + cfg.awake[k];
        }
      }
    }
    // 鍛錬 (得物のレベル): 毎Lv威力アップ + 節目能力。得物=初期武器のみが鍛錬対象
    if (G.run && G.run.forge && G.run.forge.w[w.id]) {
      const lv = G.run.forge.w[w.id];
      st.dmg *= 1 + D.FORGE.wDmgPerLevel * lv;
      for (const m of cfg.forgeMilestones || []) if (lv >= m.lv) m.apply(st);
    }
    // 分身: every volley fires one extra
    if (G.run && G.run.buffs && G.run.buffs.bunshin > 0 && st.amount) st.amount += 1;
    // 数打ちの極意(射の伝説・修飾): 初期武器 + 射ジャンルのスキルすべての発射数+
    if (st.amount && G.run && G.run.weapons) {
      const kw = G.run.weapons.find(x => x.id === 'kazuuchi');
      if (kw && (w.initial || (D.WTAGS[w.id] || []).indexOf('shot') >= 0)) {
        st.amount += (D.W.kazuuchi.base.shots || 2) + (kw.awake ? (D.W.kazuuchi.awake.shots || 0) : 0);
      }
    }
    return st;
  };

  // 武器/攻撃スキルの取得。初期武器も攻撃スキルもここで run.weapons に積む(累積=同時発動)。
  // 初期武器は固定で交換不可、攻撃スキルは取得すると増える(Lvアップ無し=種類で勝負)。
  SYS.addWeapon = id => {
    const run = G.run;
    const ex = run.weapons.find(w => w.id === id);
    if (ex) return ex;   // 二重取得ガード: 既所持なら重複エントリを作らない(多重発火/FX二重を防ぐ)
    const w = { id, lvl: 1, cd: 0.4, awake: false };
    run.weapons.push(w);
    if (id === 'fox') SYS.rebuildFoxes();
    return w;
  };

  SYS.rebuildFoxes = () => {
    const run = G.run;
    const w = run.weapons.find(w => w.id === 'fox');
    if (!w) { run.foxes.length = 0; return; }
    const st = SYS.calcW(w);
    run.foxes.length = 0;
    for (let i = 0; i < st.amount; i++) run.foxes.push({ x: run.player.x, y: run.player.y, a: 0 });
  };

  // ---------------- firing ----------------
  SYS.fireWeapons = h => {
    const run = G.run;
    const p = run.player;
    if (run.delayed && run.delayed.length) {   // 遅延発火(霞斬りの二段目など): t到達でfn実行
      for (let i = run.delayed.length - 1; i >= 0; i--) {
        const d = run.delayed[i]; d.t -= h;
        if (d.t <= 0) {
          if (d.src !== undefined) { run._fireSrc = d.src; run._fireSlash = d.fslash; run._fireThunder = d.fthunder; }   // 発火元を復元してから着弾
          try { d.fn(); } catch (e) {}
          run.delayed.splice(i, 1);
        }
      }
    }
    if (!p.alive) return;
    const charge = p.stats.tgDmg ? { chargeDmg: p.stats.tgDmg, chargeSize: p.stats.tgSize, chargeCd: p.stats.tgCd } : null;   // 気溜め(宝具): 初期武器に「溜め」(遅い代わり威力/サイズ↑)
    const konW = run.weapons.find(w => w.id === 'konshingiri');   // 渾身斬り: 斬スキルの会心ダメ倍率(修飾)
    run._konX = konW ? (SYS.calcW(konW).critX || 3) : 1;
    for (const w of run.weapons) {
      if (w.id === 'fox' || w.id === 'kekkai' || w.id === 'konshingiri' || w.id === 'nokoribi' || w.id === 'kazuuchi') continue;   // persistent / 修飾 / 反応(killEnemyで発火)
      w.cd -= h;
      if (w.cd > 0) continue;
      let st = SYS.calcW(w);
      const chg = charge && w.initial;   // 通常攻撃(初期武器)にだけ「溜め」を適用
      const kagura = run.reso.kagura && p.walking ? 0.88 : 1;   // 共鳴「神楽」: 駆けている間 -12%
      // 澄心の弓懸: 立ち止まった時間 (最大2秒) に比例して連射が研がれる
      const sumi = p.stats.still ? 1 - p.stats.still * Math.min((p.stillT || 0) / 2, 1) : 1;
      const lampHaste = (run.lampStage > 0 && (run.lampAura.id || run.lampLastId) === 'seiran') ? Math.pow(0.84, run.lampPow || 1) : 1;   // 灯りの段階で発動更に速く(残り火対応)
      const zanshoHaste = run.lampStage > 0
        ? [1, 0.94, 0.89, 0.84][run.talents.zansho || 0]
        : 1;
      const cd = Math.max(0.14, (st.cd || 1) * p.stats.haste * lampHaste * zanshoHaste
        * (run.buffs.shinsoku > 0 ? 0.7 : 1) * kagura * sumi * (chg ? charge.chargeCd : 1));
      w.cd += cd;
      if (w.cd < -cd) w.cd = 0;   // don't burst-catch-up after lag
      run._fireSrc = w.id;        // ダメ集計: この発火で生まれる弾/ゾーン/直接ダメをこの得物に帰属
      const wtags = G.data.WTAGS[w.id] || [];
      run._fireSlash = wtags.indexOf('slash') >= 0;     // 渾身斬り: 斬の会心ダメ×倍率(damageEnemyで参照)
      run._fireThunder = wtags.indexOf('thunder') >= 0 ? (w.id === 'hourai' ? 0.35 : 1) : 0; // 放雷チャージ: 雷ダメを蓄積。放雷自身の放電は×0.35(他の雷得物で満ちる設計=ソロ自己ループ抑止)
      if (run._fireSlash && konW) st = { ...st, crit: (st.crit || 0) + 0.18 };   // 渾身斬り: 斬の会心率を底上げ(×3会心ダメと併せ無会心ビルドでも機能=床上げ)
      if (chg) { st = { ...st, dmg: st.dmg * charge.chargeDmg }; run._chargeSize = charge.chargeSize; }   // 溜め: 威力+サイズ
      fire(w, st, p);
      run._chargeSize = null;
    }
    run._fireSrc = null; run._fireSlash = false; run._fireThunder = false;
    SYS.updateAura(h);
  };

  function aimAngle(p) {
    // 全武器オートエイム: 常に最寄りの妖へ自動照準。妖が居ない時だけ移動/向き方向へ
    const t = G.ent.nearestEnemy(p.x, p.y);
    if (t) return G.angleTo(p.x, p.y, t.x, t.y);
    return Math.atan2(p.aimY, p.aimX) || 0;
  }

  // 単発・大火力技の「予告→ドン」: (x,y)に収束する光輪を windup 秒見せ、その後 impactFn を発火
  function telegraphCast(x, y, windup, R, col, impactFn) {
    const run = G.run;
    run.warns.push({ x, y, t: 0, life: windup, r: R, col });
    if (!run.delayed) run.delayed = [];
    // 着弾は遅延発火。ダメ集計の発火元(run._fireSrc等)を捕捉し、着弾時に復元する(=リザルトに正しく計上)
    run.delayed.push({ t: windup, fn: impactFn, src: run._fireSrc, fslash: run._fireSlash, fthunder: run._fireThunder });
    G.audio.sfx('mystic', { p: 0.65 });   // 気が集まる溜めの予兆音
  }
  // 「ドン」= 大きめの着弾衝撃 (揺れ+閃光+破片+二重輪+低音)
  function bigImpact(x, y, R, col, snd) {
    G.fx.ring(x, y, { r0: R * 0.18, r1: R, life: 0.42, color: `rgba(${col},0.95)`, width: 7 });
    G.fx.ring(x, y, { r0: 4, r1: R * 0.5, life: 0.26, color: 'rgba(255,255,255,0.9)', width: 4 });
    if (G.fx.shards) G.fx.shards(x, y, `rgba(${col},0.95)`, 13, 340, 0.52);
    G.fx.spark(x, y, `rgb(${col})`, 18, 360, 0.55);
    G.fx.flash = Math.min(0.5, (G.fx.flash || 0) + 0.18);
    G.cam.add(8);
    G.audio.sfx(snd || 'bomb');
  }

  function fire(w, st, p) {
    // 攻撃モーション(プレイヤーの攻撃ポーズ)は通常攻撃=初期武器のときだけ。
    // 抽選で得たスキル(他の得物)や眷属/設置系では振らない。
    if (w.initial && p && p.alive && p.dashT <= 0 && p.castT <= 0 && (p.attackT || 0) <= 0.06) {
      p.attackT = 0.28;
      p.animT = 0;
    }
    const run = G.run;
    const might = SYS.effMight();
    const area = p.stats.area;

    const critC = base => (base || 0.05) + (p.stats.crit || 0);
    const muzzle = a => {
      G.fx.trail(p.x + Math.cos(a) * 15, p.y - 6 + Math.sin(a) * 15, 'rgba(255,246,214,0.85)', 4, 0.1);
    };

    if (w.id === 'ofuda') {
      const tgt = G.ent.nearestEnemy(p.x, p.y, 840);   // 初期武器の射程 ×1.5 (560→840)
      const base = tgt ? G.angleTo(p.x, p.y, tgt.x, tgt.y) : aimAngle(p);
      for (let i = 0; i < st.amount; i++) {
        const a = base + (i - (st.amount - 1) / 2) * 0.13;
        G.ent.spawnProj({
          kind: 'ofuda', x: p.x, y: p.y - 6,
          vx: Math.cos(a) * st.speed, vy: Math.sin(a) * st.speed,
          // pierce は命中可能数。素の1体分だけを渡し、追加分は宝具ステータスからのみ加算する。
          dmg: st.dmg * might, pierce: 1, r: 7, life: 1.65,   // 射程 ×1.5 (弾の到達距離も延長)
          gold: w.awake, crit: critC(0.05),
        });
      }
      muzzle(base);
      G.audio.sfx('shoot');
    }

    else if (w.id === 'katana') {
      const a = aimAngle(p);
      G.ent.doSlash(p.x, p.y, a, st.range * area, st.arc, st.dmg * might, critC(st.crit));
      if (st.back) {
        G.ent.doSlash(p.x, p.y, a + Math.PI, st.range * area * 0.9, st.arc, st.dmg * might * 0.9, critC(st.crit));
      }
      // 燕=迅さの蒼い一閃(他の斬と差別化: 細く鋭いストリーク)
      { const _tx = p.x + Math.cos(a) * st.range * area * 0.5, _ty = p.y + Math.sin(a) * st.range * area * 0.5;
        if (G.fx.impact) G.fx.impact(_tx, _ty, a, 'rgba(150,235,255,0.95)', st.range * area * 0.9, 5);
        G.fx.spark(_tx, _ty, '#bfefff', 5, 230, 0.22); }
      // 相乗「剣風」(太刀+鎌鼬): 一閃が風の刃を飛ばす
      if (run.syn && run.syn.kenpu) {
        G.ent.spawnProj({
          kind: 'wind', x: p.x, y: p.y - 4,
          vx: Math.cos(a) * 640, vy: Math.sin(a) * 640,
          dmg: st.dmg * might * 0.7, pierce: 999, r: 9, life: 0.9, crit: critC(st.crit),
        });
        if (st.back) G.ent.spawnProj({ kind: 'wind', x: p.x, y: p.y - 4, vx: Math.cos(a + Math.PI) * 640, vy: Math.sin(a + Math.PI) * 640, dmg: st.dmg * might * 0.55, pierce: 999, r: 9, life: 0.9, crit: critC(st.crit) });
      }
    }

    else if (w.id === 'raitei') {
      const run = G.run;
      const candidates = [];
      const en = run.en.act;
      for (let i = 0; i < en.length; i++) {
        const e = en[i];
        if (!e.dead && G.cam.onScreen(e.x, e.y, 30)) candidates.push(e);
      }
      if (!candidates.length) { w.cd = 0.4; return; }
      const n = Math.min(st.amount, candidates.length);
      for (let i = 0; i < n; i++) {
        const idx = (Math.random() * candidates.length) | 0;
        const e = candidates.splice(idx, 1)[0];
        G.fx.bolt(e.x + G.rand(-30, 30), e.y - 280, e.x, e.y);
        G.fx.spark(e.x, e.y, '#cfeaff', 8, 170);
        if (G.fx.anim) G.fx.anim(e.x, e.y, 'lightning', { scale: 1.7, dur: 0.4, add: true });   // 雷霆符の落雷(GPT FX)
        const aoe = st.aoe * area;
        G.grid.queryCircle(e.x, e.y, aoe, G.QBUF2);
        const buf = G.QBUF2.slice();   // 撃破時のQBUF2再queryによる反復破壊を防ぐ
        for (let q = 0; q < buf.length; q++) {
          G.ent.damageEnemy(buf[q], st.dmg * might, { crit: G.chance(critC(0.05)) });
        }
        if (!candidates.length) break;
      }
      G.audio.sfx('bolt');
    }

    else if (w.id === 'raijin') {
      // 雷神招来: 頭上に雷雲を「招来」し、数秒間その場へ自動で落雷し続ける持続フィールド(雷霆符=単発との明確な差別化)
      run.storms.push({
        x: p.x, y: p.y, t: 0, life: st.life || 2.6,
        every: 0.3, strikeT: 0.1,
        perPulse: Math.max(1, Math.round((st.amount || 6) / 3)),   // 1パルスで落とす本数(Lvでamount↑=本数↑)
        aoe: (st.aoe || 128) * area, dmg: st.dmg * might * 0.6, crit: critC(0.1), src: run._fireSrc,
      });
      if (run.storms.length > 3) run.storms.shift();
      G.fx.ring(p.x, p.y, { r0: 14, r1: 120, life: 0.5, color: 'rgba(150,200,255,0.7)', width: 4 });
      G.cam.add(4);
      G.audio.sfx('bossroar', { p: 1.2 });
    }

    else if (w.id === 'kitsunebi') {
      for (let i = 0; i < st.amount; i++) {
        const a = G.rand(G.TAU);
        G.ent.spawnProj({
          kind: 'kitsunebi', x: p.x, y: p.y - 6,
          vx: Math.cos(a) * st.speed, vy: Math.sin(a) * st.speed,
          dmg: st.dmg * might, pierce: st.pierce, r: 8, life: st.life,
          crit: critC(0.05),
        });
      }
      if (G.fx.anim && run.t - (run._foxFxT || -9) > 0.22) { run._foxFxT = run.t; G.fx.anim(p.x, p.y - 6, 'foxfire', { scale: 1.3, dur: 0.4, add: true }); G.fx.burst(p.x, p.y - 6, 'spirit_wisps', { sz: 96, dur: 0.5, from: 0.5, to: 1.1, alpha: 0.7, add: true }); }   // 狐火: 人魂の靄を重ねる(0.22s間引き)
      G.audio.sfx('shoot', { p: 0.7 });
    }

    else if (w.id === 'juzu') {
      const tgt = G.ent.nearestEnemy(p.x, p.y, 600);
      const base = tgt ? G.angleTo(p.x, p.y, tgt.x, tgt.y) : aimAngle(p);
      for (let i = 0; i < st.amount; i++) {
        const a = base + (i - (st.amount - 1) / 2) * 0.55;
        G.ent.spawnProj({
          kind: 'juzu', x: p.x, y: p.y - 6,
          vx: Math.cos(a) * st.speed, vy: Math.sin(a) * st.speed,
          dmg: st.dmg * might, pierce: 999, r: 14, life: 5,
          range: st.range * area, maxHits: st.maxHits, crit: critC(0.08),
        });
      }
      G.audio.sfx('shoot', { p: 0.5 });
    }

    else if (w.id === 'bonsho') {
      run.bells.push({
        x: p.x, y: p.y - 4, t: 0, hit: false,
        r: st.radius * area, dmg: st.dmg * might,
        stun: !!st.stun, crit: critC(0.05), src: run._fireSrc,
      });
      G.fx.burst(p.x, p.y - 4, 'bell_ring', { sz: st.radius * area * 2.0, dur: 0.62, from: 0.3, to: 1.0, alpha: 0.8, add: true });   // 梵鐘の音響リング(AoE半径に一致)
      G.audio.sfx('shoot', { p: 0.4 });
    }

    else if (w.id === 'hamaya') {
      // hunt the toughest yokai on screen
      const cands = [];
      const en = run.en.act;
      for (let i = 0; i < en.length; i++) {
        const e = en[i];
        if (!e.dead && G.cam.onScreen(e.x, e.y, 60)) cands.push(e);
      }
      cands.sort((a, b) => b.hp - a.hp);
      for (let i = 0; i < st.amount; i++) {
        const tgt = cands[i] || cands[0];
        const a = tgt ? G.angleTo(p.x, p.y, tgt.x, tgt.y) : aimAngle(p) + (i - (st.amount - 1) / 2) * 0.2;
        G.ent.spawnProj({
          kind: 'hamaya', x: p.x, y: p.y - 6,
          vx: Math.cos(a) * st.speed, vy: Math.sin(a) * st.speed,
          dmg: st.dmg * might, pierce: st.pierce, r: 7, life: 1.4,
          crit: critC(st.crit),
        });
        muzzle(a);
      }
      G.audio.sfx('arrow');
    }

    else if (w.id === 'komainu') {
      const tgt = G.ent.nearestEnemy(p.x, p.y, 700);
      const base = tgt ? G.angleTo(p.x, p.y, tgt.x, tgt.y) : aimAngle(p);
      for (let i = 0; i < st.amount; i++) {
        const a = base + i * (G.TAU / st.amount);
        G.ent.spawnProj({
          kind: 'komainu', x: p.x, y: p.y,
          vx: Math.cos(a) * st.speed, vy: Math.sin(a) * st.speed,
          dmg: st.dmg * might, pierce: 999, r: 24, life: st.life,
          crit: critC(0.05),
        });
      }
      G.audio.sfx('dash');
    }

    else if (w.id === 'hyakuju') {
      // 百獣招来: 眷属を四方へ放ち、発動から life(1.5s)の間 敵を追尾して貫く(狛犬=直進との差別化)
      const base = aimAngle(p);
      for (let i = 0; i < st.amount; i++) {
        const a = base + i * (G.TAU / st.amount);   // 四方へ撒いてから各々が敵へ吸い込まれる
        G.ent.spawnProj({
          kind: 'komainu', x: p.x, y: p.y,
          vx: Math.cos(a) * st.speed, vy: Math.sin(a) * st.speed,
          dmg: st.dmg * might, pierce: 999, r: 28, life: st.life, home: true,
          crit: critC(0.08),
        });
      }
      G.fx.ring(p.x, p.y, { r0: 10, r1: 90, life: 0.4, color: 'rgba(167,209,139,0.9)', width: 4 });
      G.fx.spark(p.x, p.y, '#d8f0c0', 14, 240, 0.4);
      G.cam.add(3);
      G.audio.sfx('dash');
    }

    else if (w.id === 'shuriken') {
      const tgt = G.ent.nearestEnemy(p.x, p.y, 560);
      const base = tgt ? G.angleTo(p.x, p.y, tgt.x, tgt.y) : aimAngle(p);
      for (let i = 0; i < st.amount; i++) {
        const a = base + (i - (st.amount - 1) / 2) * 0.16;
        G.ent.spawnProj({
          kind: 'shuriken', x: p.x, y: p.y - 6,
          vx: Math.cos(a) * st.speed, vy: Math.sin(a) * st.speed,
          dmg: st.dmg * might, pierce: st.pierce, r: 6, life: 1.0,
          crit: critC(0.05), bounce: st.bounce,
        });
      }
      G.audio.sfx('shoot', { p: 1.4 });
    }

    else if (w.id === 'kusarigama') {
      // whirl: hit everything in the circle at once, knocked along the swing
      const R = st.r1 * area;
      G.grid.queryCircle(p.x, p.y, R, G.QBUF2);
      const buf = G.QBUF2.slice();   // 撃破時のQBUF2再queryによる反復破壊を防ぐ
      for (let q = 0; q < buf.length; q++) {
        const e = buf[q];
        const a = G.angleTo(p.x, p.y, e.x, e.y);
        G.ent.damageEnemy(e, st.dmg * might, {
          kb: 300, kx: -Math.sin(a), ky: Math.cos(a),
          crit: G.chance(critC(st.crit)),
        });
      }
      G.ent.hitToros(p.x, p.y, R);
      run.whirls.push({ t: 0, life: 0.38, r: R, dir: G.chance(0.5) ? 1 : -1, a0: aimAngle(p) });
      G.audio.sfx('slash');
      G.audio.sfx('dash');
    }

    else if (w.id === 'tanegashima') {
      const tgt = G.ent.nearestEnemy(p.x, p.y, 560);
      const base = tgt ? G.angleTo(p.x, p.y, tgt.x, tgt.y) : aimAngle(p);
      for (let i = 0; i < st.amount; i++) {
        const a = base + (i - (st.amount - 1) / 2) * 0.08;
        G.ent.spawnProj({
          kind: 'tama', x: p.x + Math.cos(a) * 14, y: p.y - 6 + Math.sin(a) * 14,
          vx: Math.cos(a) * st.speed, vy: Math.sin(a) * st.speed,
          dmg: st.dmg * might, pierce: 999, r: 7, life: 0.42,
          crit: critC(st.crit),
        });
      }
      // muzzle blast + recoil
      G.fx.spark(p.x + Math.cos(base) * 18, p.y - 6 + Math.sin(base) * 18, '#ffd9a0', 7, 200, 0.25);
      G.fx.trail(p.x + Math.cos(base) * 22, p.y - 6 + Math.sin(base) * 22, 'rgba(200,200,210,0.5)', 7, 0.5);
      G.cam.add(2.5);
      G.audio.sfx('bang');
    }

    else if (w.id === 'fuin') {
      for (let i = 0; i < st.mines; i++) {
        const a = G.rand(G.TAU);
        const d = G.rand(40, 130) * area;
        const mx = p.x + Math.cos(a) * d, my = p.y + Math.sin(a) * d;
        run.mines.push({ x: mx, y: my, t: 0, armed: false, aoe: st.aoe * area, dmg: st.dmg * might, crit: critC(0.05), src: run._fireSrc });
        G.fx.ring(mx, my, { r0: 2, r1: 20, life: 0.3, color: 'rgba(255,180,120,0.9)', width: 2 });   // 設置スタンプ(札ごと)
        G.fx.spark(mx, my, '#ffb86b', 4, 90, 0.26);
        G.fx.burst(mx, my, 'talisman_burst', { sz: 72 + st.aoe * area * 0.7, dur: 0.5, from: 0.4, to: 1.0, alpha: 0.72, add: true });   // 封印札の発光
      }
      const cap = st.mines * 3 + 2;
      while (run.mines.length > cap) run.mines.shift();
      G.audio.sfx('shoot', { p: 0.55 });
    }

    else if (w.id === 'juso') {
      // 呪詛: 周囲の妖に呪い(被ダメ増)を刻む。傷つけない布石。
      const R = st.radius * area;
      G.grid.queryCircle(p.x, p.y, R, G.QBUF2);
      let n = 0;
      for (let q = 0; q < G.QBUF2.length; q++) {
        const e = G.QBUF2[q];
        if (e.dead) continue;
        e.curseT = st.dur; e.curseAmp = st.curse;
        G.ent.addHarai(e, 1);   // 祓印: 呪詛は確実に印を1つ刻む (布石→消費の起点)
        if (G.cam.onScreen(e.x, e.y, 30)) G.fx.spark(e.x, e.y - e.r * 0.3, '#b07bff', 2, 80, 0.22);
        n++;
      }
      G.fx.ring(p.x, p.y, { r0: 16, r1: R, life: 0.4, color: 'rgba(176,123,255,0.7)', width: 3 });
      if (G.fx.anim) G.fx.anim(p.x, p.y, 'curse', { scale: R / 50, dur: 0.45, add: true });   // 呪詛の刻印(GPT FX)
      G.fx.sigil(p.x, p.y + 6, { radius: R * 0.5, life: 0.6, color: '#b07bff', accent: '#e8d8ff', glyphs: 8, spin: -1.2 });
      G.audio.sfx('mystic', { p: 0.8 });
    }

    else if (w.id === 'honoo') {
      // 炎の足跡: 今いる地点に霊炎を置く (移動するほど道が燃える)。威力は updateFlames で effMight 適用
      run.flames.push({ x: p.x, y: p.y, t: 0, life: st.life, r: st.r * area, dmg: st.dmg, tick: st.tick, tickT: 0, src: run._fireSrc });
      if (run.flames.length > 60) run.flames.shift();
      // foozle火球は廃止。Unity同様の手続き炎トレイル(updateFlames側の描画)に統一
      if (run.t - (run._honooFxT || -9) > 0.3) { run._honooFxT = run.t; G.fx.burst(p.x, p.y - 4, 'ember_rise', { sz: 78, dur: 0.5, from: 0.5, to: 1.0, alpha: 0.65, add: true }); }   // 火の粉(0.3s間引き)
    }

    else if (w.id === 'zangetsu') {
      const base = aimAngle(p);
      const zscale = (st.big ? 1.45 : 1) * area;
      const zbnc = p.stats.bounce || 0;   // 跳ね鞠=敵の間を跳弾(有限貫通) / 貫きの鏃=威力UP
      const zdmg = st.dmg * might * (1 + 0.15 * (p.stats.pierce || 0));
      for (let i = 0; i < st.amount; i++) {
        const a = base + (i - (st.amount - 1) / 2) * 0.34;
        const pr = G.ent.spawnProj({
          kind: 'zangetsu', x: p.x, y: p.y - 4,
          vx: Math.cos(a) * st.speed, vy: Math.sin(a) * st.speed,
          dmg: zdmg, pierce: zbnc > 0 ? 2 : 999, r: 23 * zscale, life: 3.0,   // 射程 ×1.5 (波の到達距離 540→810)
          crit: critC(st.crit),
        });
        pr.zscale = zscale;
      }
      muzzle(base);
      G.audio.sfx('slash');
    }

    else if (w.id === 'hiken') {
      const tgt = G.ent.nearestEnemy(p.x, p.y, 640);
      const base = tgt ? G.angleTo(p.x, p.y, tgt.x, tgt.y) : aimAngle(p);
      for (let i = 0; i < st.amount; i++) {
        const a = base + (i - (st.amount - 1) / 2) * 0.12;
        G.ent.spawnProj({
          kind: 'hiken', x: p.x, y: p.y - 6,
          vx: Math.cos(a) * st.speed, vy: Math.sin(a) * st.speed,
          dmg: st.dmg * might, pierce: st.pierce, r: 7, life: 1.0,
          crit: critC(st.crit),
        });
      }
      muzzle(base);
      G.audio.sfx('slash', { p: 1.2 });
    }

    else if (w.id === 'laser') {
      // 斎光: 最寄りの妖へ自動照準して貫通ビーム。跳ね鞠(反射)があれば塀と妖に反射して折れ曲がる
      const tgt = G.ent.nearestEnemy(p.x, p.y, st.range || 3600);   // 射程 ×1.5 (既に長射程だが整合)
      const ang = tgt ? G.angleTo(p.x, p.y, tgt.x, tgt.y) : aimAngle(p);
      const reflects = Math.min(8, p.stats.bounce || 0);
      const beams = Math.max(1, st.amount || 1);   // 数打ち(初期武器)/Lv/覚醒で条数+
      const bw = Math.max(6, (st.beamW || 11) * area);
      const color = w.awake ? 'rgba(255,246,210,0.95)' : 'rgba(180,238,255,0.95)';
      for (let b = 0; b < beams; b++) {
        const a = ang + (b - (beams - 1) / 2) * 0.10;
        const pts = G.ent.castBeam(p.x, p.y - 6, a, reflects, st.range || 3200);
        G.ent.beamDamage(pts, bw * 0.6, st.dmg * might * (1 + 0.15 * (p.stats.pierce || 0)), critC(st.crit));   // 貫きの鏃=ビーム威力UP / 跳ね鞠=反射(reflects)
        run.beams.push({ pts, life: 0.25, maxLife: 0.25, color, w: bw });   // 残存を ×1.5 に延長(0.169→0.25): ビームが画面に残る時間を伸ばす
      }
      G.cam.add(1.5);
      G.audio.sfx('bolt', { p: 1.3 });
    }

    else if (w.id === 'suzunari') {
      // 鈴鳴らし: 周囲へ清めの音の波。触れた妖に祓印を刻み、印3は祓う(消費)。
      const R = (st.radius || 150) * area;
      G.grid.queryCircle(p.x, p.y, R, G.QBUF2);
      const buf = G.QBUF2.slice();   // haraiPurge→damageEnemy が QBUF2 を再利用するためコピー
      for (let q = 0; q < buf.length; q++) {
        const e = buf[q];
        if (e.dead) continue;
        G.ent.damageEnemy(e, st.dmg * might, { crit: G.chance(critC(0.05)) });
        if (e.dead) continue;
        G.ent.addHarai(e, 1);   // 鈴鳴らし=印の「撒き手」。消費せず周囲に印を行き渡らせる(祝詞/御柱/御札が消費して祓う)
      }
      G.fx.ring(p.x, p.y, { r0: 12, r1: R, life: 0.4, color: 'rgba(255,224,150,0.7)', width: 3 });
      G.fx.ring(p.x, p.y, { r0: 8, r1: R * 0.66, life: 0.32, color: 'rgba(255,240,190,0.55)', width: 2 });   // 音の波(多重リング)で発動を明確化
      G.fx.ring(p.x, p.y, { r0: 4, r1: R * 0.34, life: 0.24, color: 'rgba(255,250,224,0.5)', width: 2 });
      G.fx.spark(p.x, p.y, '#ffe7a0', 10, 220, 0.34);
      G.audio.sfx('gong', { p: 1.35 });
    }

    else if (w.id === 'norito') {
      // 祝詞連唱: 点灯した提灯の灯火圏内(e.lit)の妖すべてへ超光を落とす。印を刻み、満ちた妖は祓う。灯を多く灯すほど制圧力が跳ねる。
      const targets = run.en.act.filter(e => !e.dead && e.lit);
      if (!targets.length) { w.cd = 0.5; return; }   // 灯火圏に妖が居なければ待機(発動感を保つ)
      for (let i = 0; i < targets.length; i++) {
        const e = targets[i];
        G.ent.damageEnemy(e, st.dmg * might, { crit: G.chance(critC(st.crit || 0.1)) });
        if (e.dead) continue;
        if ((e.hmark || 0) >= 3) G.ent.haraiPurge(e, st.dmg * 1.5, {});
        else G.ent.addHarai(e, 2);
        if (i < 40) {
          if (G.chance(0.45)) G.fx.column(e.x, e.y, { height: 130, width: 22, life: 0.4, color: '#fff7e0' });
          G.fx.spark(e.x, e.y, '#fff6cd', 6, 200, 0.32);
        }
      }
      G.fx.flash = Math.min(0.4, (G.fx.flash || 0) + 0.12);
      G.audio.sfx('mystic', { p: 1.1 });
    }

    else if (w.id === 'kasumigiri') {
      // 霞斬り: 一閃した軌跡に「霞」が滞留する。瞬間で刈る太刀/破陣と違い、面でじわじわ削り鈍足にする唯一の斬(=斬ビルドの制圧/足止め役に差別化)
      const base = aimAngle(p), R = (st.radius || 450) * area, amt = st.amount || 2;
      run.slashes.push({ x: p.x, y: p.y, a: base, range: R * 0.6, arc: 2.0, life: 0.14, maxLife: 0.14, tint: '170,225,255' });   // 薄い一閃→霞を残す
      for (let i = 0; i < amt; i++) {
        const a = base + (i - (amt - 1) / 2) * 0.5;
        const mx = p.x + Math.cos(a) * R * 0.5, my = p.y + Math.sin(a) * R * 0.5;
        run.flames.push({ x: mx, y: my, t: 0, life: 1.5, r: R * 0.34, dmg: st.dmg * 0.5, tick: 0.3, tickT: 0.15, slow: 0.5, mist: true, src: run._fireSrc });   // 滞留する霞(DoT+鈍足)。dmgは素値→updateFlamesでeffMight
      }
      if (run.flames.length > 60) run.flames.shift();
      G.fx.spark(p.x + Math.cos(base) * R * 0.42, p.y + Math.sin(base) * R * 0.42, '#bfe6ff', 6, 150, 0.34);
      G.audio.sfx('slash', { p: 1.15 });
    }

    else if (w.id === 'hajingiri') {
      // 破陣斬り: 刃に紅蓮の気を溜め(予告)→前方へ重い一閃(ドン)。扇の先端で捉えた妖を断つ。灯火圏は追加威力
      const base = aimAngle(p), R = (st.radius || 160) * area, px = p.x, py = p.y, dmg = st.dmg * might, cr = critC(st.crit || 0.08), litB = st.litBonus || 1.7;
      telegraphCast(px + Math.cos(base) * R * 0.42, py + Math.sin(base) * R * 0.42, 0.2, R * 0.55, '255,140,70', () => {
        const r0 = R * 0.6;
        G.grid.queryCircle(px, py, R, G.QBUF2);
        const buf = G.QBUF2.slice();
        for (let q = 0; q < buf.length; q++) {
          const e = buf[q]; if (e.dead) continue;
          const dx = e.x - px, dy = e.y - py, dist = Math.hypot(dx, dy);
          if (dist > R + e.r || dist < r0 - e.r) continue;
          let ad = Math.atan2(dy, dx) - base; while (ad > Math.PI) ad -= G.TAU; while (ad < -Math.PI) ad += G.TAU;
          if (Math.abs(ad) > 1.0) continue;   // 前方の扇の先端のみ
          const a = Math.atan2(dy, dx), mul = e.lit ? litB : 1;
          G.ent.damageEnemy(e, dmg * mul, { crit: G.chance(cr), kb: 180, kx: Math.cos(a), ky: Math.sin(a) });
        }
        run.slashes.push({ x: px, y: py, a: base, range: R, arc: 2.0, life: 0.18, maxLife: 0.18, tint: '255,150,80' });   // 紅蓮の細い一閃
        bigImpact(px + Math.cos(base) * R * 0.7, py + Math.sin(base) * R * 0.7, R * 0.7, '255,150,80', 'slash');
      });
    }

    else if (w.id === 'raisou') {
      // 雷槍: とがった針状の雷をまっすぐ飛ばす。一定区間を貫通(pierce)し、通り道の周囲を感電(鈍足)させる。
      const ang = aimAngle(p), spd = st.speed || 900;
      const pr = G.ent.spawnProj({
        kind: 'raiyari', x: p.x, y: p.y - 4,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        dmg: st.dmg * might, pierce: 999, r: (st.width || 22) * area, life: (st.len || 520) / spd,
        crit: critC(st.crit || 0.07),
      });
      if (pr) {
        pr.zapR = (st.zapR || 85) * area; pr.slow = st.slow || 0.4; pr.raiPulseT = 0;
        const mx = p.x + Math.cos(ang) * 42, my = p.y - 4 + Math.sin(ang) * 42;
        G.fx.bolt(p.x - Math.cos(ang) * 18, p.y - 4 - Math.sin(ang) * 18, mx, my);
        G.fx.ring(mx, my, { r0: 5, r1: 54, life: 0.24, color: 'rgba(135,225,255,0.9)', width: 3 });
        G.fx.spark(mx, my, '#e8fbff', 12, 250, 0.26);
      }
      muzzle(ang); G.audio.sfx('bolt');
    }

    else if (w.id === 'hourai') {
      // 放雷: 雷気が満ちると全方位の広範囲へ一斉放電(run.raiCharge は雷ダメで蓄積)
      if ((run.raiCharge || 0) < (st.charge || 700)) { w.cd = 0.3; return; }
      run.raiCharge = 0;
      const R = (st.radius || 250) * area, cx = p.x, cy = p.y, dmg = st.dmg * might, cr = critC(st.crit || 0.1);
      telegraphCast(cx, cy, 0.24, R, '150,212,255', () => {   // 予告(青白い雷気が満ちる) → 全方位放電ドン
        G.grid.queryCircle(cx, cy, R, G.QBUF2);
        const buf = G.QBUF2.slice();
        for (let q = 0; q < buf.length; q++) { const e = buf[q]; if (e.dead) continue; G.ent.damageEnemy(e, dmg, { crit: G.chance(cr) }); }
        for (let k = 0; k < 10; k++) { const a = k / 10 * G.TAU; G.fx.bolt(cx, cy, cx + Math.cos(a) * R, cy + Math.sin(a) * R); }
        bigImpact(cx, cy, R, '170,228,255', 'bolt');
      });
    }

    else if (w.id === 'messe') {
      // 滅穢の火柱: 祓印3の妖を中心に黒い火柱。遅いが超ダメージ+広範囲
      let tgt = null; const en = run.en.act;
      for (let i = 0; i < en.length; i++) { const e = en[i]; if (!e.dead && (e.hmark || 0) >= 3 && G.cam.onScreen(e.x, e.y, 40)) { tgt = e; break; } }
      if (!tgt) { w.cd = 0.4; return; }
      const R = (st.radius || 175) * area, tx = tgt.x, ty = tgt.y, dmg = st.dmg * might, cr = critC(st.crit || 0.12);
      telegraphCast(tx, ty, 0.26, R, '150,40,75', () => {   // 予告(黒紫の輪が集う) → 黒火柱ドン
        G.grid.queryCircle(tx, ty, R, G.QBUF2);
        const buf = G.QBUF2.slice();
        for (let q = 0; q < buf.length; q++) { const e = buf[q]; if (e.dead) continue; G.ent.damageEnemy(e, dmg, { crit: G.chance(cr) }); }
        G.fx.column(tx, ty, { height: 240, width: 46, life: 0.6, color: '#1a0a14' });   // 黒い火柱
        if (G.fx.anim) G.fx.anim(tx, ty, 'explode', { scale: R / 38, dur: 0.5, add: false });
        bigImpact(tx, ty, R, '110,30,55');
      });
    }

    else if (w.id === 'sumiuchi') {
      // 墨打ち: 前方へ墨の弾を撒き、当てた妖に祓印を刻む(火力控えめ・印の要)。
      const tgt = G.ent.nearestEnemy(p.x, p.y, 520);
      const base = tgt ? G.angleTo(p.x, p.y, tgt.x, tgt.y) : aimAngle(p);
      for (let i = 0; i < st.amount; i++) {
        const a = base + (i - (st.amount - 1) / 2) * 0.15;
        G.ent.spawnProj({ kind: 'sumiuchi', x: p.x, y: p.y - 6, vx: Math.cos(a) * st.speed, vy: Math.sin(a) * st.speed, dmg: st.dmg * might, pierce: st.pierce, r: 6, life: 0.95, crit: critC(0.05) });
      }
      muzzle(base); G.audio.sfx('shoot', { p: 0.72 });
    }

    else if (w.id === 'sanshu_harae') {
      // 三種祓具(伝): 発動ごとに 剣/鏡/玉 のいずれか。狙えないが万能。
      const mode = G.randInt(3);
      G.fx.burst(p.x, p.y - 4, 'holy_seal', { sz: 150 * area, dur: 0.62, from: 0.35, to: 1.05, spin: 0.5, alpha: 0.8, add: true });   // 神器発動の呪印
      if (mode === 0) {                       // 剣: 貫通の刃を扇状に
        const tgt = G.ent.nearestEnemy(p.x, p.y, 600);
        const ba = tgt ? G.angleTo(p.x, p.y, tgt.x, tgt.y) : aimAngle(p);
        for (let i = 0; i < 3; i++) { const a = ba + (i - 1) * 0.2; G.ent.spawnProj({ kind: 'hiken', x: p.x, y: p.y - 4, vx: Math.cos(a) * 620, vy: Math.sin(a) * 620, dmg: st.dmg * might, pierce: 999, r: 7, life: 0.9, crit: critC(st.crit) }); }
        G.audio.sfx('slash');
      } else if (mode === 1) {                // 鏡: 周囲AoE
        const R = (st.radius || 150) * area;
        G.grid.queryCircle(p.x, p.y, R, G.QBUF2);
        const buf = G.QBUF2.slice();
        for (let q = 0; q < buf.length; q++) { const e = buf[q]; if (!e.dead) G.ent.damageEnemy(e, st.dmg * might * 1.2, { crit: G.chance(critC(st.crit)) }); }
        G.fx.ring(p.x, p.y, { r0: 12, r1: R, life: 0.4, color: 'rgba(200,226,255,0.82)', width: 4 });
        G.fx.spark(p.x, p.y, '#dCeaff', 8, 200, 0.3); G.audio.sfx('gong', { p: 1.1 });
      } else {                                // 玉: 八方へ拡散(跳弾)
        for (let i = 0; i < 8; i++) { const a = i / 8 * G.TAU; G.ent.spawnProj({ kind: 'tama', x: p.x, y: p.y - 4, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, dmg: st.dmg * might * 0.8, pierce: 1, bounce: 2, r: 6, life: 1.2, crit: critC(st.crit) }); }
        G.audio.sfx('shoot', { p: 0.9 });
      }
    }

    else if (w.id === 'amenomihashira') {
      // 天ノ御柱(伝): 最寄りの「灯火(点いた提灯)」へ御柱を呼び降ろす灯火連動の切り札。
      // ★灯火が無ければ発動しない(不発)。少し待って、灯ったら撃つ。
      const lamps = run.toros || [];
      let best = null, bd2 = Infinity;
      for (let i = 0; i < lamps.length; i++) {
        const t = lamps[i];
        if (t.dead) continue;   // 点いている灯のみ対象
        const d2 = (t.x - p.x) * (t.x - p.x) + (t.y - p.y) * (t.y - p.y);
        if (d2 < bd2) { bd2 = d2; best = t; }
      }
      if (!best) {
        w.cd = 0.35;   // 灯火が無いと不発。短時間で再挑戦(灯ったら即撃てる)
      } else {
        const tx = best.x, ty = best.y;
        const litB = 1 + 0.3 * Math.max(1, run.lampPow || 1);   // 灯に落とす=常に灯火連動
        const R = (st.radius || 170) * area * (1 + (litB - 1) * 0.5);
        const sdmg = st.dmg * might;
        telegraphCast(tx, ty, 0.24, R, '255,224,150', () => {   // 予告(金光が一点に集う) → 御柱が降りるドン
          G.grid.queryCircle(tx, ty, R, G.QBUF2);
          const buf = G.QBUF2.slice();
          for (let q = 0; q < buf.length; q++) {
            const e = buf[q];
            if (e.dead) continue;
            const d = Math.max(1, Math.hypot(e.x - tx, e.y - ty));
            G.ent.damageEnemy(e, sdmg * litB, { crit: true, kb: 220, kx: (e.x - tx) / d, ky: (e.y - ty) / d });
            if (e.dead) continue;
            if ((e.hmark || 0) >= 3) G.ent.haraiPurge(e, sdmg * 0.6, {});
            else G.ent.addHarai(e, 1);
          }
          G.fx.column(tx, ty, { height: 260, width: 44, life: 0.6, color: '#fff3c8' });   // 降り注ぐ光柱
          G.fx.ring(tx, ty, { r0: 6, r1: R * 1.1, life: 0.6, color: 'rgba(255,214,140,0.85)', width: 4 });
          bigImpact(tx, ty, R, '255,224,150', 'bang');
        });
      }
    }

    else if (w.id === 'kagami_gaeshi') {
      // 鏡返し: 周囲を打ち、迫る敵弾を弾き返し(消去)、発動の刹那わずかに身を守る。
      const R = (st.radius || 110) * area;
      G.grid.queryCircle(p.x, p.y, R, G.QBUF2);
      const buf = G.QBUF2.slice();
      for (let q = 0; q < buf.length; q++) {
        const e = buf[q];
        if (e.dead) continue;
        const d = Math.max(1, Math.hypot(e.x - p.x, e.y - p.y));
        G.ent.damageEnemy(e, st.dmg * might, { crit: G.chance(critC(st.crit)), kb: 170, kx: (e.x - p.x) / d, ky: (e.y - p.y) / d });
      }
      const ep = run.ep;
      for (let q = ep.act.length - 1; q >= 0; q--) {
        const o = ep.act[q];
        if (G.dist2(o.x, o.y, p.x, p.y) < R * R) { G.fx.spark(o.x, o.y, 'rgba(205,225,255,0.9)', 3, 120, 0.25); ep.releaseAt(q); }
      }
      run.buffs.kongo = Math.max(run.buffs.kongo || 0, 0.4);   // 一瞬の守り
      G.fx.ring(p.x, p.y, { r0: 10, r1: R, life: 0.35, color: 'rgba(205,217,255,0.85)', width: 4 });
      G.fx.spark(p.x, p.y, '#dce8ff', 6, 180, 0.28);
      G.audio.sfx('gong', { p: 1.2 });
    }

    else if (w.id === 'inazuma') {
      // 稲妻: 最寄りの妖から妖へ雷が連鎖。密集した群れに滅法強い(雷ビルドの中核・希)
      let cur = G.ent.nearestEnemy(p.x, p.y, 99999);
      if (!cur) { w.cd = 0.3; return; }
      const hit = new Set();
      let dmg = st.dmg * might, fx = p.x, fy = p.y;
      const jumps = (st.chains || 3) + 1, r2 = (st.range || 220) * (st.range || 220);
      for (let c = 0; c < jumps && cur; c++) {
        hit.add(cur);
        G.fx.bolt(fx, fy, cur.x, cur.y);
        G.fx.spark(cur.x, cur.y, '#cfeaff', 6, 150);
        G.ent.damageEnemy(cur, dmg, { crit: G.chance(critC(st.crit || 0.06)) });
        dmg *= (st.falloff || 0.85);
        fx = cur.x; fy = cur.y;
        let best = null, bd = r2; const en = run.en.act;
        for (let i = 0; i < en.length; i++) { const e = en[i]; if (e.dead || hit.has(e)) continue; const d = G.dist2(fx, fy, e.x, e.y); if (d < bd) { bd = d; best = e; } }
        cur = best;
      }
      G.audio.sfx('bolt');
    }

  }

  // kekkai aura: persistent tick damage + slow
  SYS.updateAura = h => {
    const run = G.run;
    const p = run.player;
    const w = run.weapons.find(w => w.id === 'kekkai');
    if (!w) { run.auraR = 0; return; }
    const st = SYS.calcW(w);
    const target = st.radius * p.stats.area;
    run.auraR += (target - run.auraR) * (1 - Math.exp(-6 * h));
    run.auraSpin += h * 0.5;
    run.auraTickT -= h;
    if (run.auraTickT <= 0) {
      run.auraTickT += Math.max(0.18, st.tick * p.stats.haste);
      // 相乗「鉄茨」(茨+結界): 結界内の妖を棘が追加で打ち据える
      const tetsu = run.syn && run.syn.tetsu;
      const ibSt = tetsu ? SYS.calcW(run.weapons.find(w => w.id === 'ibara')) : null;
      const raisaku = run.syn && run.syn.raisaku;   // 相乗「雷柵」: 結界が帯電し、内の妖を感電(追加雷ダメ+深い鈍足)
      const might = SYS.effMight();
      G.grid.queryCircle(p.x, p.y, run.auraR, G.QBUF2);
      const buf = G.QBUF2.slice();   // 撃破時のQBUF2再queryによる反復破壊を防ぐ
      for (let q = 0; q < buf.length; q++) {
        const e = buf[q];
        e.slowT = 0.6; e.slowF = st.slow;
        G.ent.damageEnemy(e, st.dmg * might, { src: 'kekkai' });
        if (raisaku) {
          G.ent.damageEnemy(e, st.dmg * might * 0.8, { src: '雷柵' });   // 感電の追加雷ダメ
          e.slowT = 0.85; e.slowF = Math.max(e.slowF, 0.5);             // 帯電で更に鈍る
          e.shockT = 1.6; e.shockDmg = st.dmg * might * 1.1;            // 感電状態: ふっとんで他個体に触れると雷が伝播
          if (G.chance(0.3)) G.fx.bolt(p.x, p.y - 8, e.x, e.y);
        }
        if (ibSt) {
          const a = G.angleTo(p.x, p.y, e.x, e.y);
          G.ent.damageEnemy(e, ibSt.dmg * 0.28 * might, { src: 'kekkai', kb: 90, kx: Math.cos(a), ky: Math.sin(a) });
        }
      }
      if (st.heal && buf.length) { const hv = Math.min(buf.length, 6) * st.heal; p.hp = Math.min(p.stats.maxHp, p.hp + hv); if (G.chance(0.5)) G.fx.spark(p.x, p.y, '#bfe8c0', 4, 90, 0.3); }   // 守りの回復: 祓った妖の気で身を癒す(密集cap=6体ぶん)
      if (buf.length) G.fx.ring(p.x, p.y, { r0: run.auraR * 0.84, r1: run.auraR, life: 0.18, color: 'rgba(150,205,255,0.4)', width: 2 });   // tick毎に境界がフラッシュ(削っている合図)
      if (tetsu) G.fx.ring(p.x, p.y, { r0: run.auraR * 0.6, r1: run.auraR, life: 0.22, color: 'rgba(150,217,139,0.5)', width: 2 });
      G.ent.hitToros(p.x, p.y, run.auraR);
    }
  };

  // ---------------- spawn director ----------------
  // ステージ固有の湧きテーブル (stage.waves) があればそちらを使う
  function currentWave(t, stage) {
    const tbl = (stage && stage.waves) || D.WAVES;
    for (const wv of tbl) if (t < wv.until) return wv;
    return tbl[tbl.length - 1];
  }

  function pickType(wv) {
    let total = 0;
    for (const k in wv.w) total += wv.w[k];
    let r = Math.random() * total;
    for (const k in wv.w) {
      r -= wv.w[k];
      if (r <= 0) return k;
    }
    return Object.keys(wv.w)[0];
  }

  function ringPos(p, rad) {
    const a = G.rand(G.TAU);
    return [p.x + Math.cos(a) * rad, p.y + Math.sin(a) * rad];
  }

  SYS.director = h => {
    const run = G.run;
    const p = run.player;
    if (run.boss) return;   // ボス出現中は雑魚湧き/イベント/精鋭/次ボスを停止(生存時計も止まる=タイマー停止)
    const t = run.clock;     // 生存/夜明けの時計(ボス中は進まない)
    const dir = run.dir;
    const stage = run.stage;
    const evScale = stage.length / 900;
    const tw = t * stage.waveShift;   // shifted clock: stronger waves come earlier on later stages

    // 決戦 (overtime): dawn is held back — no more waves, only the boss duel
    if (t >= stage.length) {
      G.audio.setIntensity(1);
      return;
    }

    // regular spawns
    dir.nextSpawn -= h;
    if (dir.nextSpawn <= 0) {
      const pactSpawn = run.ordeal ? (run.ordeal.cfg.risk.spawnIntervalMul || 1) : 1;
      // 夜の侵食: 灯りが消えているほど湧きが速まる(全灯=平常 / 全消灯=約-22%間隔=swarm)。灯りを維持する戦略的価値
      const litFrac = run.lampsTotal > 0 ? run.lampsLit / run.lampsTotal : 0;
      const darkMul = 1 - 0.22 * (1 - litFrac);
      const waveMul = D.waveIntervalMul ? D.waveIntervalMul(tw) : 1;
      dir.nextSpawn += D.spawnInterval(tw) * stage.spawnMul * (run.moon.spawnIntervalMul || 1) * pactSpawn * darkMul * waveMul;
      const cap = D.maxAlive(tw);
      if (run.en.act.length < cap) {
        const wv = currentWave(tw, stage);
        const n = Math.min(7, D.batchN(tw) + (D.waveBatchBonus ? D.waveBatchBonus(tw) : 0));
        // 遠距離脅威(射撃/砲撃/弾幕)の同時生存数を数え、上限超過分は近接へ振り替える(画面が遠距離で溢れない)
        const rCap = D.rangedCap(tw);
        let rAlive = 0;
        for (let q = 0; q < run.en.act.length; q++) { const ee = run.en.act[q]; if (ee && !ee.dead && ee.cfg && D.RANGED_MOVES[ee.cfg.move]) rAlive++; }
        for (let i = 0; i < n; i++) {
          let type = pickType(wv);
          if (D.RANGED_MOVES[(D.E[type] || {}).move]) {
            if (rAlive >= rCap) {   // 上限到達: 近接型が出るまで数回引き直す
              for (let rr = 0; rr < 4; rr++) { const t2 = pickType(wv); if (!D.RANGED_MOVES[(D.E[t2] || {}).move]) { type = t2; break; } }
            }
            if (D.RANGED_MOVES[(D.E[type] || {}).move]) rAlive++;   // 振り替え後も遠距離なら計上
          }
          const [x, y] = ringPos(p, G.rand(760, 830));
          G.ent.spawnEnemy(type, x, y);
        }
      }
    }

    // 高潮の入り口だけ短く告知。周期的な圧の変化をプレイヤーが体感・予測できるようにする。
    const waveCycle = Math.floor(tw / 150);
    const wavePhase = (tw % 150) / 150;
    if (wavePhase >= 0.70 && wavePhase < 0.90 && dir.waveSurge !== waveCycle) {
      dir.waveSurge = waveCycle;
      G.ui.announce('百鬼、押し寄せる', '');
      G.audio.setIntensity(Math.min(1, 0.78 + t / stage.length * 0.2));
    }

    // scripted events (times stretch with stage length)
    while (dir.evIdx < D.EVENTS.length && t >= D.EVENTS[dir.evIdx].at * evScale) {
      const ev = D.EVENTS[dir.evIdx++];
      G.ui.announce(ev.text, '');
      if (ev.kind === 'ring') {
        for (let i = 0; i < ev.n; i++) {
          const a = i / ev.n * G.TAU;
          G.ent.spawnEnemy(ev.type, p.x + Math.cos(a) * 640, p.y + Math.sin(a) * 640, { force: true });
        }
      } else if (ev.kind === 'storm') {
        for (let i = 0; i < ev.n; i++) {
          const a = G.rand(G.TAU);
          G.ent.spawnEnemy(ev.type, p.x + Math.cos(a) * G.rand(700, 860), p.y + Math.sin(a) * G.rand(700, 860), { force: true });
        }
      }
    }

    // elites
    if (t >= dir.eliteAt) {
      // 夜更けほど精鋭(小ボス)を高頻度に。終盤は雑魚が薙がれて緊張が薄れるので、
      // 精鋭の間隔を 38s(序盤) → 約17s(夜明け) まで詰めて「点在する小ボス」で圧を戻す。
      dir.eliteAt += D.ELITE_EVERY * (run.moon.eliteEveryMul || 1) * Math.max(0.45, 1 - t * 0.0016);
      const wv = currentWave(tw, stage);
      let bestK = null, bestW = -1;
      for (const k in wv.w) if (wv.w[k] > bestW) { bestW = wv.w[k]; bestK = k; }
      const [x, y] = ringPos(p, 700);
      const el = G.ent.spawnEnemy(bestK, x, y, { elite: true, force: true });
      G.ui.announce(el && el.title ? `“${el.title}”の${el.cfg.name}` : '強き妖の気配', '');
    }

    // bosses (per-stage schedule)。最終ボスは夜明け時刻にmain側で呼ぶ(暁の決戦)ので道中ボスのみ
    if (dir.bossIdx < stage.bosses.length - 1) {
      const entry = stage.bosses[dir.bossIdx];
      if (t >= entry.at) {
        const isFirst = dir.bossIdx === 0;   // この夜で最初に出る道中ボス
        dir.bossIdx++;
        const fb = isFirst ? { ...entry, hpMul: (entry.hpMul || 1) * (D.FIRST_BOSS_HP_MUL || 1) } : entry;   // 第1ボスのみHP軽減(schedule原本は不変)
        G.ent.spawnBoss(entry.id, fb);
        G.ui.announce(D.B[entry.id].name, D.bossRankText(entry.id), true);
      }
    }

    // treasure chests (escorted — reward sits inside the horde)
    if (t >= dir.nextChest) {
      dir.nextChest = t + D.CHEST.every * (run.moon.chestEveryMul || 1);
      const open = run.chests.filter(c => !c.opened).length;
      if (open < D.CHEST.max) {
        const c = G.ent.spawnChest();
        const wv = currentWave(t * stage.waveShift, stage);
        let bestK = null, bestW = -1;
        for (const k in wv.w) if (wv.w[k] > bestW) { bestW = wv.w[k]; bestK = k; }
        G.ent.spawnEnemy(bestK, c.x + 40, c.y, { elite: true, force: true });
        if (t > 240) G.ent.spawnEnemy(bestK, c.x - 40, c.y, { elite: true, force: true });
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * G.TAU;
          G.ent.spawnEnemy(pickType(wv), c.x + Math.cos(a) * 90, c.y + Math.sin(a) * 90, { force: true });
        }
        G.ui.announce('宝匣の気配', '');
      }
    }

    // 油赤子: 提灯の灯を狙う妖。終盤ほど間隔が縮み、灯が多いほど多く湧く(灯りの維持に守りの緊張を作る)
    if (t >= dir.nextDouser) {
      dir.nextDouser += 15 * (1 - 0.4 * (t / stage.length));   // 終盤ほど間隔短縮 (15s→約9s)
      const base = t > stage.length * 0.5 ? 2 : 1;
      const n = Math.min(3, base + ((run.lampsLit || 0) >= 3 ? 1 : 0));   // 灯が多いほど狙われる
      for (let i = 0; i < n; i++) {
        const [x, y] = ringPos(p, G.rand(680, 820));
        G.ent.spawnEnemy('aburaakago', x, y, { force: true });
      }
    }

    // ambient announcements
    while (dir.annIdx < D.ANN.length && t >= D.ANN[dir.annIdx].at * evScale) {
      const an = D.ANN[dir.annIdx++];
      G.ui.announce(an.main, an.sub);
    }

    // music intensity follows the night
    const base = 0.2 + (t / stage.length) * 0.62;
    const hpFrac = run.player.hp / run.player.stats.maxHp;
    const stress = hpFrac < 0.35 ? 0.08 : 0;
    const fervor = run.combo >= 100 ? 0.05 : 0;
    const ordeal = run.ordeal ? 0.10 : 0;
    G.audio.setIntensity(Math.min(1, Math.min(0.9, base) + (run.boss ? 0.15 : 0) + stress + fervor + ordeal));
  };

  // ---------------- leveling ----------------
  SYS.gainXp = v => {
    const run = G.run;
    const xpMul = 1 + 0.04 * ((run.hono && run.hono.growth) || 0) + ((run.player.stats && run.player.stats.xpGain) || 0);
    run.xp += v * xpMul;
    while (run.xp >= run.need) {
      run.xp -= run.need;
      run.lvl++;
      run.need = D.needXp(run.lvl);
      run.pendLv++;
    }
  };

  // レベルUP候補の役割 (cat): weapon=武器強化 / offense / guard / tempo。同一catに偏らせない
  const catOf = c => {
    if (c.kind === 'weapon' || c.kind === 'lb') return 'weapon';
    if (c.kind === 'talent') return (D.TALENTS[c.id] && D.TALENTS[c.id].cat) || 'mystic';
    return (D.P[c.id] && D.P[c.id].cat) || 'offense';
  };

  SYS.buildChoices = () => {
    const run = G.run;
    const pool = [];
    // 覚醒の鍵 = 所持武器(未覚醒)の対の宝具。1挺特化の到達点なので出やすくする (RNGで詰まらせない)
    const awakenP = {};
    for (const w of run.weapons) {
      if (!w.awake) { const ew = D.W[w.id].evolveWith; if (ew) awakenP[ew] = true; }
    }
    // 得物Lvは廃止。所持得物の強化は出さない (火力は宝具/鍛錬で伸ばす)
    for (const id in run.passives) {
      if (run.banished[id]) continue;
      if (run.passives[id] < maxP(id)) pool.push({ kind: 'passive', id, isNew: false, weight: awakenP[id] ? 8 : 3 });
    }
    // 秘術(talents)は廃止(2026-06-23): 宝具以外のステータスアップ要素の削除により抽選に出さない
    // 所持スキルの再取得=性能UP (最大Lv未満を強化候補に)。初期武器はLvアップ無しなので除外
    for (const w of run.weapons) {
      if (run.banished[w.id] || w.initial) continue;
      if ((w.lvl || 1) < maxWLvl(w.id)) pool.push({ kind: 'weapon', id: w.id, isNew: false, weight: 4 });
    }
    // 新スキル: 未所持の得物を「スキル」として抽選 (同時所持上限なし)。レア度で出現率
    for (const id in D.W) {
      if (run.banished[id] || run.weapons.find(w => w.id === id)) continue;
      if (D.rarityOf('weapon', id) === 'legend') continue;   // 伝説は確率枠で別管理(下記の legendChance)
      if (SYS.weaponOffered(run, id)) pool.push({ kind: 'weapon', id, isNew: true, weight: 2 * rw('weapon', id) });
    }
    if (Object.keys(run.passives).length < D.MAX_PASSIVES) {
      for (const id in D.P) {
        if (id in run.passives) continue;
        if (SYS.passiveOffered(run, id)) pool.push({ kind: 'passive', id, isNew: true, weight: (awakenP[id] ? 6 : 2) * rw('passive', id) });
      }
    }
    // 秘術(talents)は廃止: 新規も抽選しない(run.talents は空のまま→全秘術効果はLv0=無効)

    // 特殊能力「森羅の目」(晴・鍛錬3段): 選択肢 4 つ
    const nCards = (run.charId === 'haru' && run.forge.c >= D.FORGE.specialAt) ? 4 : 3;
    const choices = [];
    const catCount = {};
    const CAT_CAP = 2;   // 1回の提示で同じ役割は最大2枚 (攻め3枚ばかり=選択にならない、を防ぐ)
    let guard = 0;
    while (choices.length < nCards && pool.length && guard++ < 400) {
      let total = 0;
      for (const c of pool) total += c.weight;
      let r = Math.random() * total;
      let idx = 0;
      for (let i = 0; i < pool.length; i++) {
        r -= pool[i].weight;
        if (r <= 0) { idx = i; break; }
      }
      const cat = catOf(pool[idx]);
      // この役割が上限に達していて、別役割の候補がまだ残るなら、今回は見送って多様性を確保
      if ((catCount[cat] || 0) >= CAT_CAP && pool.some(c => (catCount[catOf(c)] || 0) < CAT_CAP)) {
        pool.splice(idx, 1);
        continue;
      }
      catCount[cat] = (catCount[cat] || 0) + 1;
      choices.push(pool.splice(idx, 1)[0]);
    }
    const fallbacks = [{ kind: 'heal' }, { kind: 'bomb2' }];
    let fi = 0;
    while (choices.length < nCards && fi < fallbacks.length) choices.push(fallbacks[fi++]);

    // 伝説の出現は確率枠: 解禁(同ジャンル3種Lv3)で50%、Lv3が増えるごとに上昇、全種Lv3で100%(確定)。
    // 毎レベルアップに legendChance を1回ロールし、当たれば低レア/filler枠を伝説で置換する。
    let pickLegend = null;
    for (const lid in D.W) {
      if (run.weapons.find(w => w.id === lid)) continue;
      if (D.rarityOf('weapon', lid) !== 'legend' || run.banished[lid]) continue;
      if (!SYS.weaponOffered(run, lid)) continue;                 // 未解禁は対象外
      if (G.chance(SYS.legendChance(run, lid))) { pickLegend = lid; break; }
    }
    if (pickLegend && !choices.some(c => c.kind === 'weapon' && D.rarityOf('weapon', c.id) === 'legend')) {
      const tierOf = c => (c.kind === 'weapon' || c.kind === 'passive') ? ((D.RARITY[D.rarityOf(c.kind, c.id)] || {}).tier || 0) : -1;
      let lowIdx = 0, lowTier = 99;
      for (let i = 0; i < choices.length; i++) { const t = tierOf(choices[i]); if (t < lowTier) { lowTier = t; lowIdx = i; } }
      const slot = { kind: 'weapon', id: pickLegend, isNew: true };
      if (choices.length) choices[lowIdx] = slot; else choices.push(slot);
    }

    // decorate for UI
    return choices.map(c => {
      if (c.kind === 'weapon') {
        const cfg = D.W[c.id];
        const w = run.weapons.find(w => w.id === c.id);
        const wmax = maxWLvl(c.id);
        const nextLvl = c.isNew ? 1 : (w.lvl + 1);
        // 覚醒の道筋 (対の宝具を最大Lvに) を常にカードへ
        const pcfg = D.P[cfg.evolveWith];
        const pmax = maxP(cfg.evolveWith);
        const plv = run.passives[cfg.evolveWith] || 0;
        return {
          kind: c.kind, id: c.id, isNew: c.isNew,
          name: cfg.name, icon: cfg.icon, max: wmax, cur: c.isNew ? 0 : w.lvl,
          desc: cfg.desc,
          delta: c.isNew ? '新たな攻撃スキルを携える' : lvDelta(cfg, nextLvl),
          awake: `${pcfg.name} Lv${pmax} (今${plv}) で覚醒 →「${cfg.evolveName}」`,
          rarity: D.rarityOf('weapon', c.id),
          kindLabel: 'スキル',
          tags: SYS.skillTags('weapon', c.id), syn: SYS.skillSyn(run, 'weapon', c.id),
        };
      }
      if (c.kind === 'passive') {
        const cfg = D.P[c.id];
        const cur = run.passives[c.id] || 0;
        // この宝具を取ると共鳴が完成する場合はカードで予告する
        let reso = null;
        if (c.isNew) {
          for (const rs of D.RESO) {
            if (run.reso[rs.id] || !rs.need.includes(c.id)) continue;
            if (rs.need.every(id => id === c.id || run.passives[id])) { reso = rs.name; break; }
          }
        }
        // この宝具が装備中の得物の対なら、最大Lvで覚醒する旨を予告
        let awake = null;
        for (const w of run.weapons) {
          const wc = D.W[w.id];
          if (!w.awake && wc.evolveWith === c.id) {
            const pmax = maxP(c.id);
            awake = (cur + 1 >= pmax) ? `「${wc.name}」覚醒 →「${wc.evolveName}」` : `最大Lv${pmax} で「${wc.name}」覚醒`;
            break;
          }
        }
        return {
          kind: c.kind, id: c.id, isNew: c.isNew,
          name: cfg.name, icon: cfg.icon, max: maxP(c.id), cur,
          desc: cfg.desc, delta: cfg.per, reso, awake,
          rarity: D.rarityOf('passive', c.id),
          kindLabel: '宝具',
          tags: SYS.skillTags('passive', c.id), syn: SYS.skillSyn(run, 'passive', c.id),
        };
      }
      if (c.kind === 'talent') {
        const cfg = D.TALENTS[c.id];
        const cur = run.talents[c.id] || 0;
        return {
          kind: 'talent', id: c.id, isNew: c.isNew,
          name: cfg.name, icon: cfg.icon, max: maxT(c.id), cur,
          desc: cfg.desc,
          delta: cfg.levels[cur],
          rarity: D.rarityOf('talent', c.id),
          kindLabel: '秘術',
          tags: SYS.skillTags('talent', c.id), syn: [],
        };
      }
      if (c.kind === 'heal') {
        return { kind: 'heal', name: 'おにぎり', icon: 'ic_heal', desc: '体力を 40 回復する。', delta: null, isNew: false, max: 0, cur: 0, kindLabel: '回復' };
      }
      return { kind: 'bomb2', name: '爆符', icon: 'ic_bomb2', desc: '画面の妖すべてに大打撃を与える。', delta: null, isNew: false, max: 0, cur: 0, kindLabel: '奥義' };
    });
  };

  SYS.applyChoice = c => {
    const run = G.run;
    const p = run.player;
    if (c.kind === 'weapon') {
      if (c.isNew) SYS.addWeapon(c.id);   // 新スキル取得=累積 (上限なし)
      else {
        const w = run.weapons.find(w => w.id === c.id);
        w.lvl = Math.min(maxWLvl(c.id), (w.lvl || 1) + 1);   // 既所持=性能UP
        if (c.id === 'fox') SYS.rebuildFoxes();
      }
    } else if (c.kind === 'passive') {
      run.passives[c.id] = Math.min(maxP(c.id), (run.passives[c.id] || 0) + 1);
      SYS.recomputeStats();
      SYS.checkReso();
      if (c.id === 'hp') p.hp = Math.min(p.stats.maxHp, p.hp + 25);
    } else if (c.kind === 'talent') {
      const oldLv = run.talents[c.id] || 0;
      const newLv = Math.min(maxT(c.id), oldLv + 1);
      run.talents[c.id] = newLv;
      if (c.id === 'himori') {
        const oldMul = 1 + [0, 0.25, 0.50, 0.75][oldLv];
        const newMul = 1 + [0, 0.25, 0.50, 0.75][newLv];
        for (const t of run.toros) {
          const frac = t.maxHp ? t.hp / t.maxHp : 1;
          t.maxHp = D.LAMP.hp * newMul;
          t.hp = Math.max(0, Math.min(t.maxHp, t.maxHp * frac + D.LAMP.hp * (newMul - oldMul)));
        }
      }
      if (c.id === 'utsusemi') run.talentState.utsusemi = 0;
      G.audio.sfx('mystic');
      G.ui.announce(`秘術「${D.TALENTS[c.id].name}」`, D.TALENTS[c.id].levels[newLv - 1]);
      G.fx.ring(p.x, p.y, { r0: 12, r1: 155, life: 0.5, color: 'rgba(142,180,255,0.9)', width: 4 });
      G.fx.soul(p.x, p.y - 8, 8);
      G.fx.flash = Math.min(0.3, G.fx.flash + 0.12);
      G.cam.punch(1.025);
    } else if (c.kind === 'heal') {
      p.hp = Math.min(p.stats.maxHp, p.hp + 40);
    } else if (c.kind === 'bomb2') {
      G.ent.useBomb(p.x, p.y);
    }
    SYS.checkAwaken();
    SYS.checkSynergies();
  };

  // 隠し相乗の判定。所持スキルの組合せで run.syn[id] を立て、初発動で「会得」演出。
  // recipe はUIに出さない (見た目の変化とこの一瞬の演出だけで気づかせる)。
  SYS.checkSynergies = () => {
    const run = G.run;
    if (!run) return;
    run.syn = run.syn || {};
    run._synSeen = run._synSeen || {};
    const has = id => run.weapons.some(w => w.id === id) || (run.passives && id in run.passives);
    for (const id in D.SYNERGIES) {
      const s = D.SYNERGIES[id];
      const on = s.need.every(has);
      if (on && !run._synSeen[id]) {
        run._synSeen[id] = true;   // 初成立 = 会得の瞬間 (recipe は明かさず、名と気づきだけ)
        const ss = G.store.get('synSeen', {});   // 発見した相乗を永続記録 (絵巻で recipe を振り返れる)
        if (!ss[id]) { ss[id] = 1; G.store.set('synSeen', ss); }
        const p = run.player;
        G.ui.showSynergy(id);   // 素材2枚が衝突→新たな相乗札が生まれる演出
        G.audio.sfx('awaken');
        G.fx.flash = Math.min(0.5, (G.fx.flash || 0) + 0.3);
        G.fx.screenColor = s.color;
        G.fx.screenPulse = Math.max(G.fx.screenPulse || 0, 0.4);
        if (p) {
          G.fx.ring(p.x, p.y, { r0: 14, r1: 190, life: 0.62, color: s.color, width: 5 });
          if (G.fx.anim) G.fx.anim(p.x, p.y, 'awaken', { scale: 2.8, dur: 0.6, add: true });   // 相乗 会得(GPT FX)
          G.fx.ring(p.x, p.y, { r0: 8, r1: 120, life: 0.4, color: 'rgba(255,255,255,0.85)' });
          G.fx.soul(p.x, p.y - 8, 10);
          G.cam.add(4); G.cam.punch(1.02);
          G.main.hitstop(0.07);
        }
        G.main.slowmo(0.34, 0.5);
      }
      run.syn[id] = on;
    }
  };

  // chest lottery: roll candidates only — applied when the player picks one
  SYS.rollChestCandidates = n => {
    const run = G.run;
    const pool = [];
    // 宝箱は「スキル(得物)のみ」: 所持の強化(再取得)＋未所持の新規。初期武器はLvアップ無しで除外。宝具/koban/大当たりは廃止。
    for (const w of run.weapons) {
      if (w.initial) continue;
      if ((w.lvl || 1) < maxWLvl(w.id)) pool.push({ kind: 'weapon', id: w.id, isNew: false, weight: 3 });
    }
    for (const id in D.W) {
      if (run.weapons.find(w => w.id === id)) continue;
      if (D.rarityOf('weapon', id) === 'legend') continue;   // 伝説は宝箱では出さない(レベルアップの確率枠のみ)
      if (SYS.weaponOffered(run, id)) pool.push({ kind: 'weapon', id, isNew: true, weight: 1.5 * rw('weapon', id) });
    }

    if (!pool.length) {
      // everything maxed: pay out souls
      return [{ kind: 'souls', icon: 'gem_g', name: '魂 +30', sub: '満願成就' }];
    }

    const out = [];
    for (let k = 0; k < n && pool.length; k++) {
      let total = 0;
      for (const c of pool) total += c.weight;
      let r = Math.random() * total;
      let pickIdx = 0;
      for (let i = 0; i < pool.length; i++) {
        r -= pool[i].weight;
        if (r <= 0) { pickIdx = i; break; }
      }
      const c = pool.splice(pickIdx, 1)[0];
      const cfg = c.kind === 'weapon' ? D.W[c.id] : D.P[c.id];
      const cur = c.kind === 'weapon'
        ? ((run.weapons.find(w => w.id === c.id) || { lvl: 0 }).lvl || 0)
        : (run.passives[c.id] || 0);
      const sub = c.isNew ? 'NEW' : 'Lv' + (cur + 1);
      // レベルアップの札と同じ詳細 (レア度/説明/上昇内容/段数) を宝匣にも渡す
      let delta;
      if (c.kind === 'weapon') {
        delta = c.isNew ? '新たな攻撃スキルを携える' : lvDelta(cfg, cur + 1);
      } else {
        delta = c.isNew ? '新たな宝具を授かる' : cfg.per;
      }
      out.push({
        kind: c.kind, id: c.id, isNew: c.isNew, icon: cfg.icon, name: cfg.name, sub,
        rarity: D.rarityOf(c.kind, c.id),
        desc: cfg.desc, delta,
        max: c.kind === 'weapon' ? maxWLvl(c.id) : maxP(c.id), cur,
        kindLabel: c.kind === 'weapon' ? 'スキル' : '宝具',
        tags: SYS.skillTags(c.kind, c.id), syn: SYS.skillSyn(run, c.kind, c.id),   // ビルドジャンル(タグ)/相乗をレベルアップ札と揃える
      });
    }
    return out;
  };

  SYS.applyChestCandidate = c => {
    const run = G.run;
    if (c.kind === 'souls') {
      SYS.gainXp(30);
      run.souls += 30;
      return;
    }
    if (c.kind === 'weapon') {
      if (c.isNew) SYS.addWeapon(c.id);
      else { const w = run.weapons.find(w => w.id === c.id); w.lvl = Math.min(maxWLvl(c.id), (w.lvl || 1) + 1); if (c.id === 'fox') SYS.rebuildFoxes(); }
      SYS.checkAwaken();
      SYS.checkSynergies();
      return;
    }
    run.passives[c.id] = Math.min(maxP(c.id), (run.passives[c.id] || 0) + 1);
    SYS.recomputeStats();
    SYS.checkReso();
    if (c.id === 'hp') run.player.hp = Math.min(run.player.stats.maxHp, run.player.hp + 25);
    SYS.checkAwaken();
    SYS.checkSynergies();
  };

  // 宝匣のおにぎり: 地面のおにぎりと同じ回復式 (30 × 使い手の healMul)
  SYS.chestHeal = () => Math.round(30 * (G.data.CHARS[G.run.charId].healMul || 1));
  SYS.chestOnigiri = () => {
    const run = G.run, p = run.player;
    const heal = SYS.chestHeal();
    p.hp = Math.min(p.stats.maxHp, p.hp + heal);
    G.fx.text(p.x, p.y - 18, '+' + heal, '#8ae8a0', 14);
    G.audio.sfx('heal');
    return heal;
  };

  SYS.recomputeStats = () => {
    const run = G.run;
    const p = run.player;
    const oldMax = p.stats.maxHp;
    const s = { maxHp: 100, might: 1, area: 1, speed: 1, haste: 1, magnet: 1, armor: 0, regen: 0, crit: 0, pierce: 0, bounce: 0, still: 0, lifesteal: 0, critDmg: 0, chill: 0, dodge: 0, xpGain: 0, revive: 0, shots: 0 };
    // character disposition
    const mods = G.data.CHARS[run.charId].mods || {};
    for (const k in mods) s[k] += mods[k];
    const moonMods = run.moon.mods || {};
    for (const k in moonMods) s[k] += moonMods[k];
    // 鍛錬 (使い手のレベル): 毎Lvのキャラ固有の伸び + 節目能力
    const ccfg = G.data.CHARS[run.charId];
    const clv = (run.forge && run.forge.c) || 0;
    if (ccfg.forge && clv) ccfg.forge.apply(s, clv);
    for (const m of ccfg.forgeMilestones || []) if (clv >= m.lv) m.apply(s);
    // 奉納 (permanent shrine offerings)
    const hono = run.hono || {};
    for (const k in G.data.HONO) {
      const cfg = G.data.HONO[k];
      if (cfg.apply && hono[k]) cfg.apply(s, hono[k]);
    }
    for (const id in run.passives) {
      G.data.P[id].apply(s, run.passives[id]);
    }
    const pm = run.pactMods || {};
    s.might += pm.might || 0;
    s.area += pm.area || 0;
    s.speed += pm.speed || 0;
    s.magnet += pm.magnet || 0;
    s.armor += pm.armor || 0;
    s.maxHp += pm.maxHp || 0;
    s.crit += pm.crit || 0;
    s.haste *= pm.hasteMul || 1;
    if (run.ordeal && run.ordeal.cfg.risk) {
      const risk = run.ordeal.cfg.risk;
      s.speed += risk.speed || 0;
      s.magnet += risk.magnet || 0;
    }
    p.stats = s;
    if (s.maxHp > oldMax) p.hp += s.maxHp - oldMax;
    p.hp = Math.min(p.hp, s.maxHp);
  };

  // 共鳴: 宝具ペアが揃ったら発動 (1ランに1回、解除なし)
  SYS.checkReso = () => {
    const run = G.run;
    for (const rs of D.RESO) {
      if (run.reso[rs.id]) continue;
      if (!rs.need.every(id => run.passives[id])) continue;
      run.reso[rs.id] = true;
      G.audio.sfx('awaken');
      G.ui.announce('共鳴「' + rs.name + '」', rs.desc);
      G.fx.ring(run.player.x, run.player.y, { r0: 14, r1: 200, life: 0.55, color: 'rgba(177,140,255,0.95)', width: 4 });
      G.fx.ring(run.player.x, run.player.y, { r0: 8, r1: 130, life: 0.42, color: 'rgba(255,255,255,0.85)' });
      if (G.fx.anim) G.fx.anim(run.player.x, run.player.y, 'awaken', { scale: 3, dur: 0.6, add: true });   // 共鳴の覚醒(GPT FX)
      G.fx.puffRing(run.player.x, run.player.y, 'rgba(177,140,255,0.85)', 18, 300);
      G.fx.flash = Math.min(0.45, G.fx.flash + 0.22);
      G.cam.add(5); G.cam.punch(1.04); G.main.hitstop(0.08);   // 共鳴を覚醒級に格上げ(従来は最も地味だった)
      G.ui.showMilestone(run.charId, '共鳴', rs.name, '響', '#b18cff');
      G.main.slowmo(0.34, 0.5);
    }
  };

  SYS.checkAwaken = () => {
    const run = G.run;
    for (const w of run.weapons) {
      if (w.awake) continue;
      const cfg = G.data.W[w.id];
      // 武器Lvは廃止 → 対の宝具(evolveWith)を最大Lvにすると装備中の得物が覚醒
      if ((run.passives[cfg.evolveWith] || 0) >= maxP(cfg.evolveWith)) {
        w.awake = true;
        run.awakens = (run.awakens || 0) + 1;
        if (w.id === 'fox') SYS.rebuildFoxes();
        G.audio.sfx('awaken');
        G.ui.announce('覚醒『' + cfg.evolveName + '』', cfg.awakeDesc);
        G.fx.puffRing(run.player.x, run.player.y, 'rgba(255,209,102,0.95)', 22, 320);
        G.fx.ring(run.player.x, run.player.y, { r0: 20, r1: 240, life: 0.6, color: 'rgba(255,209,102,1)', width: 5 });
        G.fx.ring(run.player.x, run.player.y, { r0: 10, r1: 150, life: 0.45, color: 'rgba(255,255,255,0.9)' });
        G.fx.flash = 0.35;
        G.cam.add(6);
        G.cam.punch(1.05);
        G.main.hitstop(0.1);
        G.ui.showMilestone(run.charId, '覚醒', cfg.evolveName, '覚', '#ffd166');   // 最大の山場=武器覚醒
        G.main.slowmo(0.4, 0.55);
      }
    }
  };

  return SYS;
})();
