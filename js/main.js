/* 百鬼夜行サバイバーズ — main: state machine, fixed-step loop, world rendering */
'use strict';

G.debug = { timescale: 1, autoplay: false, autoLevel: false, god: false, show: false };
// テストプレイ設定 (無敵 / 2倍速) を復元
if (G.store.get('testGod', false)) G.debug.god = true;
if (G.store.get('testFast', false)) G.debug.timescale = 2;
// 見やすさ(a11y)設定を復元
G.opts.dmgNum = G.store.get('optDmgNum', true);
G.opts.shake = G.store.get('optShake', true);
G.opts.flash = G.store.get('optFlash', true);
G.opts.contrast = G.store.get('optContrast', false);

G.main = (() => {
  const M = {};
  const H = 1 / 60;            // fixed step
  const D_ = () => G.data;

  M.state = 'boot';
  M.uiScale = 1;

  let acc = 0, last = 0, hitstopT = 0, synFreezeT = 0;
  let slowmoT = 0, slowmoSc = 1;
  let overT = 0, overShown = false;
  let winT = 0, winShown = false;
  let titleT = 0;

  // ---------------- boot ----------------
  M.boot = () => {
    G.engine.setup();
    G.S.build();
    // upgrade to raster art where available; procedural stays as the fallback
    G.S.loadRaster().then(r => {
      if (r && r.loaded) console.info(`[sprites] raster art: ${r.loaded}/${r.total}`);
    });
    if (G.fx.loadAnims) G.fx.loadAnims();   // 素材ベースのアニメFX(foozle CC0)を読み込む(手続きFXに重ねる)
    G.ui.bind();
    G.input.bind(onKey);
    window.addEventListener('resize', M.resize);
    // モバイル: URL バー開閉・回転で実寸が変わるので追従
    if (window.visualViewport) window.visualViewport.addEventListener('resize', M.resize);
    M.resize();

    // 縦持ちに切り替わったら戦闘を止める (横向き案内オーバレイ表示中)
    const portraitMq = window.matchMedia('(orientation: portrait)');
    const onOrient = () => {
      M.resize();
      if (portraitMq.matches && M.state === 'run' && !G.debug.autoplay) M.togglePause();
    };
    if (portraitMq.addEventListener) portraitMq.addEventListener('change', onOrient);
    else if (portraitMq.addListener) portraitMq.addListener(onOrient);

    // 長押しメニュー / 既定ジェスチャを抑止 (タッチ操作の誤爆防止)
    window.addEventListener('contextmenu', e => e.preventDefault());

    const tryAudio = () => { G.audio.init(); G.audio.resume(); };
    window.addEventListener('pointerdown', tryAudio);
    window.addEventListener('keydown', tryAudio);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && M.state === 'run' && !G.debug.autoplay) M.togglePause();
      if (document.hidden) G.audio.suspend();
      else if (M.state !== 'pause') G.audio.resume();
    });

    if (location.search.includes('debug')) G.debug.show = true;

    M.state = 'title';
    G.ui.show('title');
    G.cam.reset(0, 0);
    G.audio.setIntensity(0.12);
    requestAnimationFrame(loop);
  };

  M.resize = () => {
    const wrap = document.getElementById('wrap');
    const ww = window.innerWidth, wh = window.innerHeight;
    let w = ww, h = ww * 9 / 16;
    if (h > wh) { h = wh; w = wh * 16 / 9; }
    wrap.style.width = w + 'px';
    wrap.style.height = h + 'px';
    M.uiScale = w / G.VIEW_W;
    document.getElementById('ui').style.transform = `scale(${M.uiScale})`;
  };

  // ---------------- state transitions ----------------
  M.curStage = 0;
  M.curChar = 'haru';
  M.curWeapon = undefined;

  M.startGame = (stageIdx, charId, weaponId) => {
    if (stageIdx !== undefined) M.curStage = stageIdx;
    if (charId !== undefined) M.curChar = charId;
    if (weaponId !== undefined) M.curWeapon = weaponId;
    // スマホ: 出陣のタップ (ユーザー操作) で全画面化を試みる (非対応端末は無視)
    if (G.IS_TOUCH && !document.fullscreenElement && document.documentElement.requestFullscreen) {
      try { document.documentElement.requestFullscreen().catch(() => {}); } catch (e) { /* noop */ }
    }
    G.audio.init();
    G.audio.resume();
    G.sys.startRun(M.curStage, M.curChar, M.curWeapon);
    G.ui.hideAll();
    G.ui.clearAnnounce();
    acc = 0; hitstopT = 0; slowmoT = 0; synFreezeT = 0;
    overT = 0; overShown = false;
    winT = 0; winShown = false;
    M.state = 'run';
  };

  M.openSetup = () => {
    M.state = 'setup';
    G.ui.openSetup();
  };

  M.openHono = () => {
    M.state = 'hono';
    G.ui.openHono();
  };

  M.openForge = () => {
    M.state = 'forge';
    G.ui.openForge();
  };

  M.openCodex = () => {
    M.state = 'codex';
    G.ui.openCodex();
  };

  M.openSettings = () => {
    M.state = 'settings';
    G.ui.openSettings();
  };

  M.openPact = choices => {
    if (!G.run || M.state !== 'run') return;
    M.state = 'pact';
    G.audio.sfx('pactoffer');
    G.ui.openPact(choices);
  };

  M.choosePact = choice => {
    if (!G.run || M.state !== 'pact') return;
    G.sys.startPact(choice);
    M.state = 'run';
    G.ui.hideAll();
  };

  // 奥義: ゲージ満タンで Space。編成した 1 種のみ。効果は特化 (万能禁止)
  M.useUlt = () => {
    const run = G.run;
    if (!run || M.state !== 'run' || !run.player.alive) return;
    const u = run.ult;
    if (u.charge < u.need) return;
    u.charge = 0;
    const p = run.player;
    p.castT = Math.max(p.castT || 0, 0.72);
    p.animT = 0;
    const cfg = G.data.ULTS[u.id];
    G.audio.sfx('awaken');
    G.ui.showUltCutin(run.charId, u.id);
    if (G.fx.anim) G.fx.anim(p.x, p.y, 'portal', { scale: 6.2, dur: 0.62, add: true });   // 奥義=門が開く(foozle portal/全奥義共通)

    if (u.id === 'harai') {
      G.fx.powerBurst(p.x, p.y, {
        radius: 420, life: 0.85, color: '#ffd166', accent: '#fff8dd',
        glyphs: 12, height: 380, width: 68, particles: 24, sparks: 18, screen: 0.58,
      });
      // 群れ掃除特化: 画面内のみ、ボスには 1/2。守り・回収は無い
      G.fx.flash = 0.4;
      G.cam.add(8);
      G.cam.punch(1.04);
      M.hitstop(0.08);
      G.fx.puffRing(p.x, p.y, 'rgba(255,209,102,0.9)', 22, 380);
      G.fx.ring(p.x, p.y, { r0: 30, r1: 400, life: 0.5, color: 'rgba(255,228,170,0.95)', width: 5 });
      if (G.fx.anim) G.fx.anim(p.x, p.y, 'holy', { scale: 6, dur: 0.6, add: true });   // 百鬼祓い奥義=大祓の光(GPT FX)
      for (let i = run.en.act.length - 1; i >= 0; i--) {
        const e = run.en.act[i];
        if (e.dead || !G.cam.onScreen(e.x, e.y, 60)) continue;
        const a = G.angleTo(p.x, p.y, e.x, e.y);
        const base = (e.boss ? 120 : 240) * G.sys.effMight();   // 霊力に追従=終盤も群れを薙げる(固定値だと劣化していた)
        G.ent.damageEnemy(e, base * (e.hmark > 0 ? 1.2 : 1), { kb: 480, kx: Math.cos(a), ky: Math.sin(a) });   // 祓印付きは祓い波が強く効く(+20%)
        if (!e.dead && e.hmark >= 3) G.ent.haraiPurge(e, base * (e.boss ? 0.5 : 1), { kx: Math.cos(a), ky: Math.sin(a) });   // 印3=祓い(ボス半減)
      }
      run.ep.clear();
      M.slowmo(0.4, 0.4);
      G.audio.sfx('bomb');
    } else if (u.id === 'kagome') {
      G.fx.powerBurst(p.x, p.y, {
        radius: 250, life: 0.9, color: '#79cfff', accent: '#e5f7ff',
        glyphs: 10, height: 250, width: 52, particles: 16, screen: 0.42,
      });
      // 守り特化: 押し返し + 金剛 3 秒 + 回復 20
      run.buffs.kongo = Math.max(run.buffs.kongo, 3);
      p.hp = Math.min(p.stats.maxHp, p.hp + 20);
      G.fx.ring(p.x, p.y, { r0: 16, r1: 240, life: 0.45, color: 'rgba(154,216,255,0.95)', width: 5 });
      G.grid.queryCircle(p.x, p.y, 240, G.QBUF2);
      const buf = G.QBUF2.slice();   // 撃破時のQBUF2再queryによる反復破壊を防ぐ
      for (let q = 0; q < buf.length; q++) {
        const e = buf[q];
        const a = G.angleTo(p.x, p.y, e.x, e.y);
        G.ent.damageEnemy(e, 30, { src: '奥義', kb: 620, kx: Math.cos(a), ky: Math.sin(a) });
      }
      G.audio.sfx('gong');
    } else if (u.id === 'arakagura') {
      G.fx.powerBurst(p.x, p.y, {
        radius: 205, life: 0.72, color: '#ff654f', accent: '#ffd0a8',
        glyphs: 6, height: 220, width: 46, particles: 18, sparks: 16, screen: 0.46,
      });
      // 攻め特化: 5 秒の荒魂+神速。タイミング読みが本体
      run.buffs.aratama = Math.max(run.buffs.aratama, 5);
      run.buffs.shinsoku = Math.max(run.buffs.shinsoku, 5);
      G.fx.ring(p.x, p.y, { r0: 12, r1: 190, life: 0.4, color: 'rgba(255,122,92,0.9)', width: 4 });
      G.fx.spark(p.x, p.y - 8, '#ff7a5c', 10, 200, 0.3);
      if (G.fx.anim) G.fx.anim(p.x, p.y - 6, 'molten_spear', { scale: 3.4, dur: 0.5, add: true });   // 荒神楽=攻め奥義の火槍(foozle Molten_Spear)
    } else if (u.id === 'tamayose') {
      G.fx.powerBurst(p.x, p.y, {
        radius: 330, life: 1, color: '#b18cff', accent: '#eee2ff',
        glyphs: 12, height: 310, width: 58, particles: 20, screen: 0.4, spin: -0.8,
      });
      // 回収特化: 魂の総引き寄せのみ
      for (const g of run.gem.act) g.attract = true;
      G.audio.sfx('magnet');
      G.fx.puffRing(p.x, p.y, 'rgba(177,140,255,0.85)', 14, 320);
    }
  };

  // 翔: 全キャラ共通のダッシュ斬り抜け (Shift / E)。専用クールタイム run.dashCdT。
  M.dash = () => {
    const run = G.run;
    if (!run || M.state !== 'run' || !run.player.alive) return;
    if ((run.dashCdT || 0) > 0) return;
    const p = run.player;
    run.dashCdT = G.data.DASH_CD || 4.5;
    p.castT = 0; p.animT = 0;
    let dx = p.moveX, dy = p.moveY;
    if (!dx && !dy) { dx = p.aimX; dy = p.aimY; }
    const m = Math.hypot(dx, dy) || 1;
    p.dashX = dx / m; p.dashY = dy / m;
    p.dashT = 0.24;
    p.dashDmg = 32;                       // 翔の斬り抜け威力(p.dashDmgで判定側に伝える)
    p.dashHits.length = 0;
    p.hurtT = Math.max(p.hurtT, 0.42);
    G.audio.sfx('dash');
    G.fx.sigil(p.x, p.y + 8, { radius: 42, life: 0.34, color: '#8fcfff', accent: '#e8f6ff', glyphs: 4, spin: -2 });
    if (G.fx.anim) G.fx.anim(p.x + p.dashX * 26, p.y + p.dashY * 26, 'wind', {
      scale: 2.4, dur: 0.34, rot: Math.atan2(p.dashY, p.dashX) + Math.PI, add: true,
    });
    G.fx.screenPulse = Math.max(G.fx.screenPulse, 0.16);
    G.fx.screenColor = '#8fcfff';
    G.fx.trail(p.x, p.y - 8, 'rgba(168,205,255,0.85)', 8, 0.35);
  };

  // 技: クールタイム式のアクティブ (Q)。鍛錬段位は run.skill.eff に焼き込み済み
  M.useSkill = () => {
    const run = G.run;
    if (!run || M.state !== 'run' || !run.player.alive) return;
    const s = run.skill;
    if (s.cdT > 0) return;
    const p = run.player;
    s.cdT = s.eff.cd;

    if (s.id === 'goho') {
      p.castT = 0.42;
      p.animT = 0;
      s.shield = true;
      s.shieldT = s.eff.guard || 3;   // 珠を纏う時間。受けずにこの間が尽きれば不発で消える(使い時の駆け引き)
      s.shieldMax = s.shieldT;
      G.audio.sfx('reveal');
      G.fx.powerBurst(p.x, p.y, {
        radius: 72, life: 0.5, color: '#ffd166', accent: '#fff4c9',
        glyphs: 6, height: 110, width: 26, particles: 8, sparks: 6, screen: 0.16,
      });
      G.fx.ring(p.x, p.y - 6, { r0: 8, r1: 48, life: 0.4, color: 'rgba(255,209,102,0.9)', width: 2.5 });
    } else if (s.id === 'hoeru') {
      p.castT = 0.42;
      p.animT = 0;
      // 雄叫び: 周囲を弾き飛ばし、怯えさせて逃げ散らす (制圧)
      G.grid.queryCircle(p.x, p.y, s.eff.radius, G.QBUF2);
      const buf = G.QBUF2.slice();   // 撃破時のQBUF2再queryによる反復破壊を防ぐ
      for (let q = 0; q < buf.length; q++) {
        const e = buf[q];
        const a = G.angleTo(p.x, p.y, e.x, e.y);
        G.ent.damageEnemy(e, s.eff.dmg * G.sys.effMight(), { src: '技', kb: 540, kx: Math.cos(a), ky: Math.sin(a) });
        if (!e.boss) e.feared = Math.max(e.feared, s.eff.fear);
      }
      G.fx.ring(p.x, p.y, { r0: 16, r1: s.eff.radius, life: 0.4, color: 'rgba(255,122,92,0.95)', width: 5 });
      G.fx.powerBurst(p.x, p.y, {
        radius: s.eff.radius, life: 0.55, color: '#ff765b', accent: '#ffe0bd',
        glyphs: 6, column: false, particles: 16, sparks: 10, screen: 0.28,
      });
      G.fx.ring(p.x, p.y, { r0: 8, r1: s.eff.radius * 0.6, life: 0.28, color: 'rgba(255,210,170,0.9)' });
      G.fx.puffRing(p.x, p.y, 'rgba(255,150,110,0.7)', 12, s.eff.radius);
      G.audio.sfx('slash');
      G.cam.add(3.5);
      M.hitstop(0.04);
    } else if (s.id === 'kagenui') {
      p.castT = 0.42;
      p.animT = 0;
      // 影縫い: 影を縫い留めて拘束 + 被ダメ増の印
      G.grid.queryCircle(p.x, p.y, s.eff.radius, G.QBUF2);
      for (let q = 0; q < G.QBUF2.length; q++) {
        const e = G.QBUF2[q];
        e.rootT = Math.max(e.rootT, s.eff.root);
        e.markT = Math.max(e.markT, s.eff.mark);
        if (G.cam.onScreen(e.x, e.y)) G.fx.spark(e.x, e.y + 2, '#b18cff', 3, 70, 0.25);
      }
      G.fx.ring(p.x, p.y, { r0: 12, r1: s.eff.radius, life: 0.45, color: 'rgba(177,140,255,0.95)', width: 4 });
      G.fx.powerBurst(p.x, p.y, {
        radius: s.eff.radius, life: 0.68, color: '#a477ff', accent: '#e8dcff',
        glyphs: 10, height: 150, width: 36, particles: 12, sparks: 8, screen: 0.22, spin: -1.4,
      });
      G.audio.sfx('wind');
    } else if (s.id === 'seihara') {
      p.castT = 0.32;
      p.animT = 0;
      // 清祓の印: オートエイムで最寄りの妖へ清め波。触れた妖に祓印を刻み、印が満ちた妖は小祓い
      const _st = G.ent.nearestEnemy(p.x, p.y, 520);
      let dx, dy;
      if (_st) { dx = _st.x - p.x; dy = _st.y - p.y; }
      else { dx = p.aimX || p.moveX || 1; dy = p.aimY || p.moveY || 0; }
      const m = Math.hypot(dx, dy) || 1, ang = Math.atan2(dy, dx);
      const R = s.eff.radius || 150;
      const cx = p.x + dx / m * R * 0.55, cy = p.y + dy / m * R * 0.55;
      G.grid.queryCircle(cx, cy, R * 0.7, G.QBUF2);
      const buf = G.QBUF2.slice();
      for (let q = 0; q < buf.length; q++) {
        const e = buf[q]; if (e.dead) continue;
        let ad = G.angleTo(p.x, p.y, e.x, e.y) - ang;
        while (ad > Math.PI) ad -= G.TAU; while (ad < -Math.PI) ad += G.TAU;
        if (Math.abs(ad) > 1.15) continue;   // 前方の扇のみ
        G.ent.damageEnemy(e, s.eff.dmg * G.sys.effMight(), { src: '清祓' });
        if (e.dead) continue;
        if ((e.hmark || 0) >= 3) G.ent.haraiPurge(e, s.eff.dmg * 0.85, {}); else G.ent.addHarai(e, 1);
      }
      // FX: 清めの波(金の二重環+祓いの光)+ 祓印の符
      if (G.fx.anim) G.fx.anim(cx, cy, 'holy', { scale: Math.max(1.4, R / 60), dur: 0.4, add: true });
      G.fx.ring(p.x, p.y, { r0: 8, r1: R, life: 0.34, color: 'rgba(255,226,160,0.92)', width: 4 });
      G.fx.ring(cx, cy, { r0: 6, r1: R * 0.55, life: 0.3, color: 'rgba(255,244,208,0.7)', width: 2.5 });
      G.fx.sigil(p.x, p.y + 6, { radius: 38, life: 0.36, color: '#ffe0a0', accent: '#fff4d0', glyphs: 5, spin: 1.6 });
      G.fx.spark(cx, cy, '#ffe9b0', 12, 220, 0.42);
      G.audio.sfx('mystic');
    } else if (s.id === 'kekkai') {
      // 結界札(技化): 足元に清めの結界を張る。敵弾を祓い、内側はボスの遠距離着弾を防ぐ。tick/鈍足は updateWards が D.WARD から処理
      p.castT = 0.3; p.animT = 0;
      run.wards.push({ x: p.x, y: p.y, r: s.eff.r, life: s.eff.life, maxLife: s.eff.life, tickT: 0, t: 0 });
      if (run.wards.length > 8) run.wards.shift();
      G.audio.sfx('reveal');
      if (G.fx.anim) G.fx.anim(p.x, p.y, 'ward', { scale: Math.max(1.6, s.eff.r / 64), dur: 0.55, add: true });   // 結界の素材FX(未使用だった ward シートを充当)
      G.fx.ring(p.x, p.y, { r0: 10, r1: s.eff.r, life: 0.45, color: 'rgba(255,224,170,0.9)', width: 3 });
      G.fx.spark(p.x, p.y - 6, '#ffd9a8', 8, 150, 0.3);
      G.cam.add(2);
    }
  };

  M.toTitle = () => {
    M.state = 'title';
    G.run = null;
    G.fx.reset();
    G.ui.clearAnnounce();
    G.ui.show('title');
    G.ui.updateTitleBest();
    G.cam.reset(0, 0);
    G.audio.resume();
    G.audio.setIntensity(0.12);
  };

  M.togglePause = () => {
    if (M.state === 'run') {
      M.state = 'pause';
      G.ui.openPause();
      G.audio.suspend();
    } else if (M.state === 'pause') {
      M.state = 'run';
      G.ui.hideAll();
      G.audio.resume();
    }
  };

  M.lvChosen = () => {
    const run = G.run;
    run.pendLv--;
    if (run.pendLv > 0) {
      G.ui.openLevelUp();
    } else {
      M.state = 'run';
      G.ui.hideAll();
    }
  };

  // ---------------- treasure chest ----------------
  M.openChest = chest => {
    const run = G.run;
    run.chestsOpened++;
    // 宝箱はスキルのみ・3枠固定の抽選 (大当たり/おにぎり/魂は廃止)
    const cands = G.sys.rollChestCandidates(G.data.CHEST.slots || 3);

    G.audio.sfx('powerup');
    G.fx.ring(chest.x, chest.y, { r0: 16, r1: 170, life: 0.55, color: 'rgba(255,220,140,0.95)', width: 4 });
    G.fx.flash = Math.min(0.4, G.fx.flash + 0.25);
    G.fx.soul(chest.x, chest.y - 6, 10);
    if (G.fx.burst) G.fx.burst(chest.x, chest.y - 6, 'gold_sparkle', { sz: 210, dur: 0.7, from: 0.4, to: 1.2, alpha: 0.95, add: true });   // 宝匣の金きらめき
    G.cam.punch(1.04);

    if (G.debug.autoLevel) {
      // sims skip the ceremony: take the first candidate
      if (cands[0]) G.sys.applyChestCandidate(cands[0]);
      G.ui.announce('宝匣 開封', cands[0] ? cands[0].name : '');
      return;
    }
    M.state = 'chest';
    G.ui.openChest(cands);
  };

  M.closeChest = () => {
    if (M.state !== 'chest') return;
    M.state = 'run';
    G.ui.chestCleanup();
    G.ui.hideAll();
  };

  M.hitstop = t => { hitstopT = Math.max(hitstopT, t); };
  M.slowmo = (t, sc) => { slowmoT = Math.max(slowmoT, t); slowmoSc = sc; };
  M.synFreeze = t => { synFreezeT = Math.max(synFreezeT, t); acc = 0; };   // 相乗演出中は世界を停止(描画は継続)

  function beginOver() {
    M.state = 'over';
    overT = 0; overShown = false;
    G.audio.sfx('lose');
    G.audio.setIntensity(0.1);
  }

  function beginWin() {
    M.state = 'win';
    winT = 0; winShown = false;
    G.run.win = true;
    G.run.boss = null;
    G.run.ep.clear();
    G.audio.sfx('win');
    G.audio.setIntensity(0.2);
    G.cam.add(5);
  }

  function anyBossAlive() {
    const en = G.run.en.act;
    for (let i = 0; i < en.length; i++) {
      if (en[i].boss && !en[i].dead) return true;
    }
    return false;
  }

  // 15:00 にボスが生きていたら夜明けは来ない — 決戦へ
  function beginOvertime() {
    const run = G.run;
    run.overtime = true;
    run.otDissolve = 1.4;
    G.ui.announce('夜明ケヲ拒ム者', '鬼ヲ討チ果タセ――', true);
    G.audio.sfx('bossroar');
    M.slowmo(1.0, 0.3);
    G.cam.punch(1.05);
    G.cam.add(8);
    G.fx.flash = Math.min(0.5, G.fx.flash + 0.4);
    G.fx.powerBurst(run.player.x, run.player.y, {
      radius: 340, life: 1.05, color: '#d93632', accent: '#ffb09a',
      glyphs: 12, height: 320, width: 70, particles: 20, sparks: 18, screen: 0.52, spin: -0.7,
    });
    G.fx.ring(run.player.x, run.player.y, { r0: 30, r1: 320, life: 0.8, color: 'rgba(227,60,40,0.85)', width: 5 });
  }

  function onKey(code) {
    if (code === 'KeyM') { G.audio.toggleMute(); return; }
    switch (M.state) {
      case 'title':
        if (code === 'Enter' || code === 'Space') M.openSetup();
        break;
      case 'setup':
        G.ui.setupKey(code);
        break;
      case 'hono':
        G.ui.honoKey(code);
        break;
      case 'forge':
        G.ui.forgeKey(code);
        break;
      case 'codex':
        if (code === 'Escape' || code === 'Enter') M.toTitle();
        break;
      case 'settings':
        if (code === 'Escape' || code === 'Enter') M.toTitle();
        break;
      case 'run':
        if (code === 'Escape' || code === 'KeyP') M.togglePause();
        else if (code === 'Space') M.useUlt();
        else if (code === 'ShiftLeft' || code === 'ShiftRight' || code === 'KeyE') M.dash();   // 翔=共通ダッシュ
        else if (code === 'KeyQ' || code === 'KeyF') M.useSkill();   // Q=装備技(結界札も技化して技プールに統合)
        break;
      case 'pause':
        if (code === 'Escape' || code === 'KeyP' || code === 'Enter') M.togglePause();
        break;
      case 'levelup':
        G.ui.lvKey(code);
        break;
      case 'pact':
        G.ui.pactKey(code);
        break;
      case 'chest':
        G.ui.chestKey(code);
        break;
      case 'over':
      case 'win':
        if (code === 'KeyR' || code === 'Enter') M.startGame();
        else if (code === 'KeyT' || code === 'Escape') M.toTitle();
        break;
    }
  }

  // ---------------- simulation step ----------------
  function step(h) {
    const run = G.run;
    run.t += h;                       // 演出/アニメ用の時計(常時)
    if (!run.boss) run.clock += h;    // 生存/夜明けの時計: ボス出現中は停止(タイマー/雑魚湧き/難度が止まる)
    G.ent.updatePlayer(h);
    G.sys.fireWeapons(h);
    G.ent.updateEnemies(h);
    G.ent.updateProjs(h);
    G.ent.updateSlashes(h);
    G.ent.updateFoxes(h);
    G.ent.updateOrbs(h);
    G.ent.updateCorpses(h);
    G.ent.updateGems(h);
    G.ent.updateItems(h);
    G.ent.updateChests(h);
    G.ent.updateWards(h);
    G.ent.updateLamps(h);
    G.ent.flushKills();
    G.sys.updatePact(h);
    G.fx.update(h);
    if (run._test) {
      if (G.test) G.test.update(h);   // テストステージ: リスポーン管理。通常のspawnディレクター/契約は止める
    } else {
      G.sys.director(h);
      G.sys.maybeOfferPact();
    }
    G.fx.ambient(G.cam.x, G.cam.y);
    G.cam.follow(run.player.x, run.player.y, h);
  }

  // aftermath: world keeps drifting in slow-mo, no player/weapons/spawns
  function stepAftermath(h) {
    const run = G.run;
    G.ent.updateEnemies(h);
    G.ent.updateProjs(h);
    G.ent.updateSlashes(h);
    G.ent.updateOrbs(h);
    G.ent.updateCorpses(h);
    G.fx.update(h);
    G.cam.follow(run.player.x, run.player.y, h);
  }

  // burn n lesser yokai into souls (bosses are never dissolved)
  function dissolveEnemies(n) {
    const pool = G.run.en;
    let tries = n * 3;
    for (let k = 0; k < n && tries-- > 0 && pool.act.length;) {
      const i = (Math.random() * pool.act.length) | 0;
      const e = pool.act[i];
      if (e.boss) continue;
      G.fx.soul(e.x, e.y, 3);
      G.fx.spark(e.x, e.y, 'rgba(255,220,150,0.9)', 3, 90, 0.4);
      pool.releaseAt(i);
      k++;
    }
  }

  // ---------------- main loop ----------------
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!last) last = ts;
    let dtR = Math.min((ts - last) / 1000, 0.066);
    last = ts;
    G.engine.adapt(dtR);

    if (hitstopT > 0) hitstopT -= dtR;

    if (M.state === 'run') {
      if (synFreezeT > 0) synFreezeT -= dtR;   // 相乗演出: 時間停止(stepしない=敵/弾/プレイヤー停止、描画と演出は継続)
      else if (hitstopT <= 0) acc += dtR * G.debug.timescale * G.GAME_SPEED * (slowmoT > 0 ? slowmoSc : 1);
      if (slowmoT > 0) slowmoT -= dtR;
      let steps = 0;
      const maxSteps = Math.max(12, G.debug.timescale * 2 + 4);
      while (acc >= H && steps < maxSteps && M.state === 'run') {
        step(H);
        steps++;
        acc -= H;
        if (M.state !== 'run') break;   // a step may open the chest UI etc.

        const run = G.run;
        if (run.pendLv > 0) {
          G.fx.levelBurst(run.player.x, run.player.y);
          if (G.fx.anim) G.fx.anim(run.player.x, run.player.y, 'levelup', { scale: 2.6, dur: 0.55, add: true });   // レベルアップの昇華(GPT FX)
          G.cam.punch(1.025);
          if (G.debug.autoLevel) {
            while (run.pendLv > 0) {
              const cs = G.sys.buildChoices();
              const c = cs.find(c => c.kind === 'weapon' && !c.isNew)
                || cs.find(c => c.kind === 'weapon')
                || cs.find(c => c.kind === 'passive' && !c.isNew)
                || cs[0];
              G.sys.applyChoice(c);
              run.pendLv--;
            }
          } else if (run._test) {
            run.pendLv = 0;   // テストステージではレベルアップ画面を出さない(スキルはパネルで操作)
          } else {
            M.state = 'levelup';
            G.audio.sfx('levelup');
            G.ui.openLevelUp();
          }
        }
        if (!run.player.alive) { beginOver(); }
        else if (run.clock >= run.stage.length) {
          // 夜明け時刻: 最終ボスを呼ぶ(暁の決戦)。倒したら夜明け(勝利)
          if (!run.finalSpawned) {
            if (!anyBossAlive()) {   // 道中ボスを片付けてから最終ボス登場
              run.finalSpawned = true;
              if (!run.overtime) beginOvertime();   // 夜明けを堰き止め、雑魚を払う演出
              const fb = run.stage.bosses[run.stage.bosses.length - 1];
              if (fb) {
                G.ent.spawnBoss(fb.id, fb);
                G.ui.announce(G.data.B[fb.id].name, `${G.data.bossRankText(fb.id)}・暁の決戦`, true);
              }
              else beginWin();   // ボス未定義ステージは即夜明け
            }
          } else if (!anyBossAlive()) {   // 最終ボス撃破 → 夜明け
            beginWin();
          }
        }
      }
      if (steps >= maxSteps) acc = 0;
      // overtime entrance: the lesser yokai burn away, only the boss holds the night
      if (M.state === 'run' && G.run.overtime && G.run.otDissolve > 0) {
        G.run.otDissolve -= dtR;
        dissolveEnemies(Math.ceil(G.run.en.act.length * 0.08) + 2);
      }
    } else if (M.state === 'over') {
      overT += dtR;
      G.run.deadT += dtR;
      acc += dtR * 0.3;
      while (acc >= H) { stepAftermath(H); acc -= H; }
      if (overT > 1.7 && !overShown) {
        overShown = true;
        G.ui.showResult(false);
      }
    } else if (M.state === 'win') {
      winT += dtR;
      dissolveEnemies(Math.ceil(G.run.en.act.length * 0.06) + 2);
      G.fx.update(dtR);
      G.cam.follow(G.run.player.x, G.run.player.y, dtR);
      if (winT > 2.4 && !winShown) {
        winShown = true;
        G.ui.showResult(true);
      }
    } else if (M.state === 'title') {
      titleT += dtR;
      G.cam.x = Math.sin(titleT * 0.045) * 260;
      G.cam.y = Math.cos(titleT * 0.034) * 180;
      G.fx.ambient(G.cam.x, G.cam.y);
      G.fx.update(dtR);
    }
    // levelup / pause: world frozen, render continues

    render(dtR);
  }

  // ---------------- rendering ----------------
  function nightAlpha(t) {
    const len = G.run ? G.run.stage.length : 900;
    const u = t / len;
    if (u < 0.133) return 0.24 + (u / 0.133) * 0.12;
    if (u < 0.533) return 0.36 + ((u - 0.133) / 0.4) * 0.14;
    if (u < 0.711) return 0.50;
    if (u < 1) return 0.50 - ((u - 0.711) / 0.289) * 0.16;
    return 0.34;
  }

  function drawGround(ctx, left, top) {
    const stageId = G.run && G.run.stage ? G.run.stage.id : '';
    const tile = G.S.get(stageId ? `tile_${stageId}` : '') || G.S.get('tile');
    const ts = stageId ? 384 : 256;
    const zoom = Math.max(0.01, G.cam.zoom || 1);
    const viewW = G.VIEW_W / zoom;
    const viewH = G.VIEW_H / zoom;
    const x0 = Math.floor(left / ts) * ts;
    const y0 = Math.floor(top / ts) * ts;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let y = y0; y < top + viewH + ts; y += ts) {
      for (let x = x0; x < left + viewW + ts; x += ts) {
        ctx.drawImage(tile.c, x, y, ts, ts);
      }
    }
    ctx.restore();
    drawGroundDetails(ctx, left, top);
  }

  function drawGroundDetails(ctx, left, top) {
    if (!G.run) return;
    const stage = G.run.stage.id;
    const cs = stage === 'miyako' ? 96 : 128;
    const zoom = Math.max(0.01, G.cam.zoom || 1);
    const viewW = G.VIEW_W / zoom;
    const viewH = G.VIEW_H / zoom;
    const x0 = Math.floor((left - cs) / cs);
    const x1 = Math.floor((left + viewW + cs) / cs);
    const y0 = Math.floor((top - cs) / cs);
    const y1 = Math.floor((top + viewH + cs) / cs);
    ctx.save();
    ctx.lineCap = 'square';
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const h = G.hash2(cx * 37 + 11, cy * 53 + 7);
        const px = cx * cs, py = cy * cs;
        if (stage === 'mori') {
          if (h > 0.62) {
            ctx.globalAlpha = 0.18;
            ctx.strokeStyle = h > 0.84 ? '#35412e' : '#222d28';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(px + 12, py + 86);
            ctx.bezierCurveTo(px + 38, py + 46, px + 72, py + 104, px + 116, py + 58);
            ctx.stroke();
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(px + 58, py + 78); ctx.lineTo(px + 47, py + 57);
            ctx.moveTo(px + 82, py + 81); ctx.lineTo(px + 99, py + 66);
            ctx.stroke();
          }
          if (h < 0.22) {
            ctx.globalAlpha = 0.16;
            ctx.fillStyle = '#73804b';
            ctx.fillRect(px + 24 + h * 40, py + 28, 3, 2);
            ctx.fillRect(px + 31 + h * 55, py + 34, 2, 3);
          }
        } else if (stage === 'miyako') {
          // 都の地面は規則的な線を避け、疎らな石の亀裂だけを重ねる。
          if (h > 0.82) {
            ctx.globalAlpha = 0.13;
            ctx.strokeStyle = '#766583';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(px + cs * 0.34, py + 8);
            ctx.lineTo(px + cs * 0.48, py + cs * 0.45);
            ctx.lineTo(px + cs * 0.38, py + cs - 8);
            ctx.stroke();
          }
        } else if (stage === 'yomi') {
          if (h > 0.46) {
            const sx = px + 18 + h * 44, sy = py + 18 + (1 - h) * 52;
            ctx.globalAlpha = 0.22;
            ctx.strokeStyle = h > 0.82 ? '#8f322d' : '#49242c';
            ctx.lineWidth = h > 0.82 ? 2 : 1;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + 18, sy + 13);
            ctx.lineTo(sx + 8, sy + 31);
            ctx.lineTo(sx + 27, sy + 48);
            ctx.stroke();
            ctx.globalAlpha = 0.12;
            ctx.strokeStyle = '#ff6048';
            ctx.beginPath();
            ctx.moveTo(sx + 1, sy);
            ctx.lineTo(sx + 18, sy + 13);
            ctx.stroke();
          }
          if (h < 0.2) {
            ctx.globalAlpha = 0.2;
            ctx.fillStyle = '#d7c8b2';
            ctx.fillRect(px + 26, py + 72, 14, 2);
            ctx.fillRect(px + 30, py + 68, 2, 9);
          }
        }
      }
    }
    ctx.restore();
  }

  // 有限マップの四辺の塀 (土塀 + 笠木 + 間柱)。世界空間 (闇で暗くなる本体)
  function drawWalls(ctx) {
    const hw = G.MAP_W / 2, hh = G.MAP_H / 2, W = G.WALL;
    ctx.fillStyle = '#241c16';
    ctx.fillRect(-hw, -hh, G.MAP_W, W);
    ctx.fillRect(-hw, hh - W, G.MAP_W, W);
    ctx.fillRect(-hw, -hh, W, G.MAP_H);
    ctx.fillRect(hw - W, -hh, W, G.MAP_H);
    const cap = 7;
    ctx.fillStyle = '#574a3b';   // 笠木: 内側の縁を明るく (月明かりを受ける瓦)
    ctx.fillRect(-hw, -hh + W - cap, G.MAP_W, cap);
    ctx.fillRect(-hw, hh - W, G.MAP_W, cap);
    ctx.fillRect(-hw + W - cap, -hh, cap, G.MAP_H);
    ctx.fillRect(hw - W, -hh, cap, G.MAP_H);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';   // 間柱
    for (let x = -hw; x <= hw; x += 96) { ctx.fillRect(x, -hh, 2, W); ctx.fillRect(x, hh - W, 2, W); }
    for (let y = -hh; y <= hh; y += 96) { ctx.fillRect(-hw, y, W, 2); ctx.fillRect(hw - W, y, W, 2); }
  }

  // 塀の内縁を闇の上にも薄く描く = 境界を常に読めるように (月明かりの縁取り)
  function drawWallEdge(ctx) {
    const hw = G.MAP_W / 2 - G.WALL, hh = G.MAP_H / 2 - G.WALL;
    ctx.strokeStyle = 'rgba(150,134,108,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(-hw, -hh, hw * 2, hh * 2);
    ctx.stroke();
  }

  /* world decoration: 640px zone cells pick a biome flavour, 160px deco
   * cells place props deterministically (hash-based, nothing stored) */
  const ZDECO = {
    forest: ['grass_0', 'grass_1', 'grass_2', 'stone_0', 'leaf', 'mush', 'grass_1', 'leaf'],
    bamboo: ['bamboo_0', 'bamboo_1', 'bamboo_0', 'bamboo_1', 'grass_1', 'leaf', 'bamboo_1', 'grass_2'],
    grave:  ['grave', 'sotoba', 'grass_0', 'jizo', 'leaf', 'sotoba', 'grave', 'stone_1'],
    shrine: ['stone_0', 'stone_1', 'grass_2', 'jizo', 'higan', 'leaf', 'stone_1', 'grass_0'],
  };
  const ZSPECIAL = { forest: 'log', bamboo: 'puddle', grave: 'higan', shrine: 'higan' };
  // AI生成ランドマーク(ComfyUI): ゾーンごとに置く大きめの装飾。底面アンカーで立つ。
  const LANDMARKS = {
    forest: ['prop_sakura', 'prop_kareki', 'prop_toro', 'prop_kuzu', 'prop_kumo', 'prop_higanbana', 'prop_susuki', 'prop_kinoko', 'prop_hasu'],
    bamboo: ['prop_kareki', 'prop_toro', 'prop_torii2', 'prop_kuzu', 'prop_ido', 'prop_take', 'prop_susuki', 'prop_kinoko'],
    grave:  ['prop_haka', 'prop_toro', 'prop_hone', 'prop_dokuro', 'prop_jizo2', 'prop_torii_oimg', 'prop_higanbana', 'prop_dokurobi', 'prop_tou', 'prop_kitsunemen'],
    shrine: ['prop_torii2', 'prop_chochin', 'prop_toro', 'prop_reimon', 'prop_kitsune', 'prop_butsu', 'prop_jizo2', 'prop_kumotsu', 'prop_kitsunemen', 'prop_ema', 'prop_kagaribi', 'prop_tou'],
  };
  const PROP_GLOW = { prop_toro: 'warm', prop_chochin: 'warm', prop_kumotsu: 'warm', prop_kagaribi: 'warm', prop_dokuro: 'cool', prop_reimon: 'cool', prop_kinoko: 'cool', prop_dokurobi: 'cool', prop_hasu: 'cool' };
  // 遠景シルエット用(薄暗く大きく描いて奥行きを出す)。ステージ別の妖景。
  const FAR_SIL = {
    mori: ['prop_kareki', 'prop_sakura', 'prop_torii2'],
    miyako: ['prop_torii2', 'prop_kitsune', 'prop_butsu', 'prop_reimon'],
    _: ['prop_torii_oimg', 'prop_haka', 'prop_kareki', 'prop_hone'],
  };
  // 意味あるシーン群(クラスター): 単体をランダム配置でなく、ゾーンの物語が伝わる組合せで配置。
  // 各要素 [スプライト, dx, dy, scale]。配列は奥→手前(描画はdyで整列)。世界観を強める。
  const SCENES = {
    forest: [
      [['prop_kareki', -44, -6, 0.62], ['prop_susuki', 48, 16, 0.5], ['prop_kinoko', -70, 26, 0.4], ['prop_higanbana', 8, 34, 0.36]],
      [['prop_sakura', 0, -4, 0.64], ['prop_toro', -56, 22, 0.42], ['prop_higanbana', 44, 30, 0.34]],
      [['prop_kuzu', -26, 8, 0.5], ['prop_susuki', 36, 6, 0.5], ['prop_kinoko', 4, 30, 0.4]],
    ],
    bamboo: [
      [['prop_take', -30, -2, 0.58], ['prop_take', 30, 3, 0.54], ['prop_toro', 2, 26, 0.42], ['prop_kinoko', -44, 32, 0.36]],
      [['prop_take', 0, -4, 0.6], ['prop_ido', -48, 20, 0.46], ['prop_susuki', 46, 18, 0.48]],
    ],
    grave: [
      [['prop_haka', 0, -4, 0.56], ['prop_haka', -46, 10, 0.48], ['prop_jizo2', 50, 6, 0.46], ['prop_higanbana', -18, 34, 0.36]],
      [['prop_torii_oimg', 0, -2, 0.58], ['prop_hone', -40, 20, 0.44], ['prop_dokuro', 40, 16, 0.4], ['prop_higanbana', 6, 36, 0.34]],
      [['prop_jizo2', -36, 2, 0.46], ['prop_jizo2', 36, 5, 0.44], ['prop_tou', 0, -6, 0.5], ['prop_higanbana', 0, 34, 0.34]],
    ],
    shrine: [
      [['prop_torii2', 0, -6, 0.66], ['prop_toro', -64, 18, 0.44], ['prop_toro', 66, 20, 0.44], ['prop_kumotsu', 0, 30, 0.4]],
      [['prop_reimon', 0, -4, 0.68], ['prop_chochin', -52, -10, 0.4], ['prop_kitsune', 46, 20, 0.46]],
      [['prop_kitsune', -40, 4, 0.46], ['prop_kitsune', 42, 6, 0.44], ['prop_ema', 0, 24, 0.46], ['prop_torii2', 0, -10, 0.42]],
    ],
  };

  function zoneOf(cx, cy, stageId) {
    const zh = G.hash2(Math.floor(cx / 4) * 131 + 7, Math.floor(cy / 4) * 173 + 11);
    if (stageId === 'miyako') return zh < 0.18 ? 'forest' : zh < 0.42 ? 'bamboo' : zh < 0.68 ? 'grave' : 'shrine';
    if (stageId === 'yomi') return zh < 0.08 ? 'forest' : zh < 0.2 ? 'bamboo' : zh < 0.7 ? 'grave' : 'shrine';
    return zh < 0.46 ? 'forest' : zh < 0.66 ? 'bamboo' : zh < 0.83 ? 'grave' : 'shrine';
  }

  function drawDeco(ctx, left, top) {
    const stageId = G.run ? G.run.stage.id : 'mori';
    const cs = 160;
    const zoom = Math.max(0.01, G.cam.zoom || 1);
    const viewW = G.VIEW_W / zoom;
    const viewH = G.VIEW_H / zoom;
    const x0 = Math.floor((left - 80) / cs), x1 = Math.floor((left + viewW + 80) / cs);
    const y0 = Math.floor((top - 130) / cs), y1 = Math.floor((top + viewH + 80) / cs);

    // Far silhouettes occupy a larger lattice and move visually slower than
    // small props, giving the arena depth without storing scenery entities.
    const lcs = 640;
    const lx0 = Math.floor((left - lcs) / lcs), lx1 = Math.floor((left + viewW + lcs) / lcs);
    const ly0 = Math.floor((top - lcs) / lcs), ly1 = Math.floor((top + viewH + lcs) / lcs);
    ctx.save();
    for (let ly = ly0; ly <= ly1; ly++) {
      for (let lx = lx0; lx <= lx1; lx++) {
        const h = G.hash2(lx * 71 + 9, ly * 83 + 3);
        const px = lx * lcs + h * lcs;
        const py = ly * lcs + G.hash2(lx * 89 + 5, ly * 97 + 7) * lcs;
        if (stageId === 'mori') {
          G.S.draw(ctx, 'shadowblob', px, py, { scale: 3.4 + h * 2, alpha: 0.42 });
          if (h > 0.72) G.S.draw(ctx, 'bamboo_1', px + 80, py + 42, { scale: 1.7, alpha: 0.42 });
        } else if (stageId === 'miyako') {
          G.S.draw(ctx, 'shadowblob', px, py, { scale: 2.8 + h, alpha: 0.3 });
          if (h > 0.48) G.S.draw(ctx, 'torii', px + 50, py + 60, { scale: 1.35, alpha: 0.38 });
        } else {
          G.S.draw(ctx, 'shadowblob', px, py, { scale: 3.2 + h * 1.4, alpha: 0.5 });
          if (h > 0.42) {
            G.S.draw(ctx, 'sotoba', px + 45, py + 30, { scale: 1.4, alpha: 0.5 });
            G.S.draw(ctx, 'higan', px + 85, py + 52, { scale: 1.25, alpha: 0.62 });
          }
        }
        // 遠景にAI装飾のシルエット(薄暗く大きく=奥行き)。百鬼夜行らしい遠景の妖景。
        const h8 = G.hash2(lx * 53 + 17, ly * 59 + 23);
        if (h8 > 0.6) {
          const far = FAR_SIL[stageId] || FAR_SIL._;
          const nm = far[((h8 * 331) | 0) % far.length];
          G.S.draw(ctx, nm, px + 110, py + 64, { scale: 1.5 + h8 * 0.9, alpha: 0.24 });
        }
      }
    }
    ctx.restore();

    // canopy shadows first (320px lattice) — break up ground tiling
    for (let cy = y0 & ~1; cy <= y1; cy += 2) {
      for (let cx = x0 & ~1; cx <= x1; cx += 2) {
        const hb = G.hash2(cx * 41 + 3, cy * 43 + 19);
        if (hb < 0.5) {
          const bx = cx * cs + G.hash2(cx * 7, cy * 9) * cs * 2;
          const by = cy * cs + G.hash2(cx * 9, cy * 7) * cs * 2;
          G.S.draw(ctx, 'shadowblob', bx, by, { scale: 1 + hb * 2.4, alpha: 0.55 });
        }
      }
    }

    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const zone = zoneOf(cx, cy, stageId);
        const list = ZDECO[zone];
        const h = G.hash2(cx, cy);

        const propCut = stageId === 'mori' ? 0.72 : stageId === 'miyako' ? 0.78 : 0.84;
        if (h < propCut) {
          const h2 = G.hash2(cx * 5 + 1, cy * 7 + 3);
          const h3 = G.hash2(cx * 11 + 5, cy * 13 + 7);
          const name = list[((h * 113) | 0) & 7];
          const px = cx * cs + h2 * cs;
          const py = cy * cs + h3 * cs;
          G.S.draw(ctx, name, px, py);
          if (name === 'mush') G.S.draw(ctx, 'glow_cool', px, py - 3, { scale: 0.5, alpha: 0.5 });
          if (name === 'higan') G.S.draw(ctx, 'glow_warm', px, py - 4, { scale: 0.45, alpha: 0.4 });
        }

        // second prop: bamboo groves & graveyards are denser
        const denseBase = zone === 'bamboo' ? 0.42 : zone === 'grave' ? 0.3 : 0.2;
        const dense = denseBase + (stageId === 'yomi' ? 0.14 : stageId === 'miyako' ? 0.06 : 0);
        const h5 = G.hash2(cx * 17 + 9, cy * 23 + 5);
        if (h5 < dense) {
          const name = list[((h5 * 197) | 0) & 7];
          const px = cx * cs + G.hash2(cx * 19 + 2, cy * 29 + 8) * cs;
          const py = cy * cs + G.hash2(cx * 23 + 4, cy * 31 + 6) * cs;
          G.S.draw(ctx, name, px, py);
        }

        // rare special prop per zone
        const h6 = G.hash2(cx * 29 + 13, cy * 31 + 17);
        if (h6 > 0.962) {
          const name = ZSPECIAL[zone];
          const px = cx * cs + (h6 * 631 % 1) * cs;
          const py = cy * cs + (h6 * 977 % 1) * cs;
          G.S.draw(ctx, name, px, py);
          if (name === 'higan') G.S.draw(ctx, 'glow_warm', px, py - 4, { scale: 0.5, alpha: 0.45 });
        }

        // torii gates stand in shrine zones
        if (zone === 'shrine' && G.hash2(cx * 3 + 7, cy * 3 + 11) > 0.955) {
          G.S.draw(ctx, 'torii', cx * cs + 80, cy * cs + 100);
        }

        // AI生成のシーン群(クラスター): 単体散在でなく、ゾーンの物語が伝わる組合せで配置。世界観を強める。
        // 素材自体を夜にミュート済 + ここでは控えめなscaleで「背景の景物」として読ませる(アイテムと誤認させない)。
        const h7 = G.hash2(cx * 37 + 13, cy * 41 + 7);
        if (h7 > 0.965) {
          const set = SCENES[zone];
          const scene = set[((h7 * 733) | 0) % set.length].slice().sort((a, b) => a[2] - b[2]);   // 奥→手前
          const bx = cx * cs + G.hash2(cx * 43 + 1, cy * 47 + 9) * cs;
          const by = cy * cs + G.hash2(cx * 53 + 3, cy * 59 + 5) * cs;
          for (let s = 0; s < scene.length; s++) {
            const it = scene[s], ex = bx + it[1], ey = by + it[2];
            G.S.draw(ctx, it[0], ex, ey, { scale: it[3] });
            const gl = PROP_GLOW[it[0]];
            if (gl) G.S.draw(ctx, gl === 'cool' ? 'glow_cool' : 'glow_warm', ex, ey - 12, { scale: 0.3, alpha: 0.28 });
          }
        }
      }
    }
  }

  // two fog layers: ground mist under entities, thin drift above them
  function drawFog(ctx, t, layer) {
    ctx.save();
    if (layer === 'under') {
      for (let i = 0; i < 4; i++) {
        const fx = G.cam.x * 0.82 + Math.sin(t * 0.05 + i * 2.4) * 420 + i * 330 - 660;
        const fy = G.cam.y * 0.82 + Math.cos(t * 0.04 + i * 1.7) * 260;
        G.S.draw(ctx, 'fog', fx, fy, { scale: 3.6 + i * 0.5, alpha: 0.38 });
      }
    } else {
      for (let i = 0; i < 2; i++) {
        const fx = G.cam.x * 0.7 + Math.cos(t * 0.06 + i * 3.1) * 520 + i * 640 - 320;
        const fy = G.cam.y * 0.7 + Math.sin(t * 0.045 + i * 2.2) * 300;
        G.S.draw(ctx, 'fog', fx, fy, { scale: 4.6 + i, alpha: 0.16 });
      }
    }
    ctx.restore();
  }

  function drawLight(ctx) {
    const E = G.engine;
    const l = E.lctx;
    const run = G.run;
    const t = run ? run.t : 0;
    const overtime = run && run.overtime && M.state !== 'win';
    let alpha;
    if (M.state === 'title') alpha = 0.5;
    else if (M.state === 'win') alpha = Math.max(0, nightAlpha(t) * (1 - winT / 1.8));
    else if (overtime) alpha = 0.5 + Math.sin(t * 2.2) * 0.045;   // crimson stand-off
    else alpha = nightAlpha(t);

    if (alpha < 0.01) return;

    l.setTransform(E.RS, 0, 0, E.RS, 0, 0);
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, G.VIEW_W, G.VIEW_H);
    const tint = run ? run.stage.tint : [7, 9, 22];
    l.fillStyle = overtime ? `rgba(40,7,16,${alpha})` : `rgba(${tint[0]},${tint[1]},${tint[2]},${alpha})`;
    l.fillRect(0, 0, G.VIEW_W, G.VIEW_H);

    l.globalCompositeOperation = 'destination-out';
    const hole = G.S.get('lighthole');
    const v = G.cam.view();
    const punch = (wx, wy, r, a = 1) => {
      l.globalAlpha = a;
      const px = (wx - v.l) * v.z, py = (wy - v.t) * v.z, rr = r * v.z;
      l.drawImage(hole.c, px - rr, py - rr, rr * 2, rr * 2);
    };

    if (M.state === 'title') {
      punch(G.cam.x, G.cam.y - 30, 330, 0.55);
    } else if (run) {
      const p = run.player;
      const flick = 1 + Math.sin(t * 7.3) * 0.02;
      // プレイヤーは視認用の微光のみ (数珠結界 kekkai を持てば広がる)。安全圏は据置提灯/結界札
      punch(p.x, p.y, Math.max(95, run.auraR) * flick, 0.95);
      for (const tr of run.toros) {
        const stageR = G.data.LAMP.stageRange[tr.dispStage || 0] || 1;   // 各灯は自分の表示段階で拡がる(全灯連動を解消)
        if (tr.dead || !G.cam.onScreen(tr.x, tr.y, G.LAMP_R * stageR + 60)) continue;
        const hpF = tr.maxHp ? G.clamp(tr.hp / tr.maxHp, 0, 1) : 1;   // 損傷で灯りが細る
        punch(tr.x, tr.y - 14, G.LAMP_R * (0.55 + 0.45 * hpF) * flick * stageR, 0.96);
      }
      // 結界札の灯り (闇を押し返す)
      for (const w of run.wards) {
        if (!G.cam.onScreen(w.x, w.y, w.r + 60)) continue;
        const wf = w.life < 1.5 ? (0.7 + Math.sin(t * 18) * 0.25) : 1;
        punch(w.x, w.y, w.r * 0.98 * flick, 0.92 * wf);
      }
      for (const c of run.chests) {
        if (!c.opened && G.cam.onScreen(c.x, c.y, 140)) punch(c.x, c.y - 12, 105 * flick, 0.95);
        else if (c.opened) punch(c.x, c.y - 16, 140, Math.max(0, 1 - c.openT * 0.5));
      }
      const en = run.en.act;
      for (let i = 0; i < en.length; i++) {
        const e = en[i];
        if (e.dead || !G.cam.onScreen(e.x, e.y, 120)) continue;
        // faint aura on every yokai: presences stay readable in the dark
        punch(e.x, e.y - 6, e.r + 30, 0.24);
        if (e.cfg.light) punch(e.x, e.y - 8, 62, 0.8);
        else if (e.boss) punch(e.x, e.y - (e.hitOff || 80) * 0.7, (e.hitOff || 80) * 2.0, 0.82);   // ボス全身を照らす(旧140は小さすぎ→上半身が闇に沈み「切れ」て見えた)
        else if (e.elite) punch(e.x, e.y - 8, 70, 0.45);
      }
      const prs = run.pr.act;
      for (let i = 0; i < prs.length; i++) {
        const pr = prs[i];
        if (pr.kind === 'kitsunebi' && G.cam.onScreen(pr.x, pr.y, 80)) punch(pr.x, pr.y, 46, 0.85);
        else if (pr.kind === 'zangetsu' && G.cam.onScreen(pr.x, pr.y, 100)) punch(pr.x, pr.y, 70 * (pr.zscale || 1), 0.8);
      }
      const gems = run.gem.act;
      for (let i = 0; i < gems.length; i++) {
        const g = gems[i];
        if (g.v >= 20 && G.cam.onScreen(g.x, g.y, 60)) punch(g.x, g.y, 34, 0.7);
      }
      for (const light of G.fx.lights) {
        if (!G.cam.onScreen(light.x, light.y, light.radius + 40)) continue;
        const life = light.life / light.maxLife;
        punch(light.x, light.y, light.radius * (0.75 + life * 0.25), light.intensity * life);
      }
      if (G.opts.flash && G.fx.flash > 0) {   // 見やすさ: 閃光OFFで照明フラッシュも抑制
        l.globalAlpha = Math.min(1, G.fx.flash * 2.2);
        l.fillRect(0, 0, G.VIEW_W, G.VIEW_H);
      }
    }
    l.globalAlpha = 1;
    l.globalCompositeOperation = 'source-over';

    ctx.drawImage(E.light, 0, 0, G.VIEW_W, G.VIEW_H);
  }

  function lightRgba(color, alpha) {
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const n = parseInt(hex.length === 3
        ? hex.split('').map(c => c + c).join('')
        : hex.slice(0, 6), 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
    }
    const nums = color.match(/[\d.]+/g);
    if (nums && nums.length >= 3) return `rgba(${nums[0]},${nums[1]},${nums[2]},${alpha})`;
    return `rgba(255,220,150,${alpha})`;
  }

  function drawColoredLights(ctx) {
    const run = G.run;
    if (!run) return;
    const v = G.cam.view();
    const lights = [];
    const add = (x, y, radius, color, intensity = 0.5, core = 0.2, rays = 0) => {
      if (!G.cam.onScreen(x, y, radius + 50)) return;
      lights.push({ x, y, radius, color, intensity, core, rays });
    };
    const t = run.t;
    const p = run.player;
    let playerColor = '#d9e8ff';
    let playerPower = 0.18;
    if (run.lampAura.id === 'koubou') { playerColor = '#ff7358'; playerPower = 0.32; }
    else if (run.lampAura.id === 'seiran') { playerColor = '#62d5ff'; playerPower = 0.32; }
    else if (run.lampAura.id === 'byakuren') { playerColor = '#ffe0a1'; playerPower = 0.3; }
    if (p.castT > 0 || run.buffs.aratama > 0) playerPower += 0.18;
    add(p.x, p.y - 7, 92 + run.auraR * 0.28, playerColor, playerPower, 0.3, p.castT > 0 ? 4 : 0);

    for (const tr of run.toros) {
      if (tr.dead) continue;
      const hpF = tr.maxHp ? G.clamp(tr.hp / tr.maxHp, 0, 1) : 1;
      const flick = (0.94 + Math.sin(t * 8.2 + tr.x * 0.01) * 0.06)
        * (tr.hp < tr.maxHp * 0.35 ? 0.72 + Math.sin(t * 23 + tr.x * 0.01) * 0.2 : 1);
      const color = tr.sigil === 'koubou' ? '#ff6048'
        : tr.sigil === 'seiran' ? '#55ccff' : '#ffd58a';
      add(tr.x, tr.y - 15, G.LAMP_R * (0.74 + hpF * 0.36) * (G.data.LAMP.stageRange[tr.dispStage || 0] || 1), color,
        (0.42 + hpF * 0.2) * flick + (tr.surgeT > 0 ? 0.28 : 0),
        0.35, tr.surgeT > 0 ? 8 : 4);
    }
    for (const w of run.wards) {
      const fade = w.life < 1.5 ? w.life / 1.5 : 1;
      add(w.x, w.y - 8, w.r * 1.05, '#ffd591', 0.34 * fade, 0.22, 2);
    }
    for (const c of run.chests) {
      const fade = c.opened ? Math.max(0, 1 - c.openT * 0.45) : 1;
      add(c.x, c.y - 12, c.opened ? 145 : 90, '#ffd56f', 0.5 * fade, 0.32, c.opened ? 8 : 2);
    }

    for (const e of run.en.act) {
      if (e.dead) continue;
      if (e.boss) {
        const rage = e.bossRageT > 0 || e.rage;
        add(e.x, e.y - e.r * 0.7, 105 + e.r * 1.8,
          rage ? '#ff4e3c' : '#a85b72', rage ? 0.48 : 0.2, 0.24, rage ? 6 : 0);
      } else if (e.cfg.light || e.elite) {
        add(e.x, e.y - 7, e.elite ? 58 : 48,
          e.cfg.light ? '#73d8ff' : '#d59cff', e.elite ? 0.2 : 0.16, 0.18, 0);
      }
    }
    for (const pr of run.pr.act) {
      if (pr.kind === 'kitsunebi') add(pr.x, pr.y, 48, '#51e5ff', 0.42, 0.4, 2);
      else if (pr.kind === 'zangetsu') add(pr.x, pr.y, 72 * (pr.zscale || 1), '#a9cfff', 0.4, 0.28, 2);
      else if (pr.kind === 'tama') add(pr.x, pr.y, 42, '#c58cff', 0.34, 0.34, 2);
      else if (pr.kind === 'hamaya' && pr.gold) add(pr.x, pr.y, 34, '#ffe29a', 0.26, 0.3, 0);
    }
    for (const o of run.ep.act) add(o.x, o.y, 28, '#b77aff', 0.14, 0.22, 0);
    for (const light of G.fx.lights) {
      const life = light.life / light.maxLife;
      add(light.x, light.y, light.radius, light.color, light.intensity * life, light.core, life > 0.45 ? 4 : 0);
    }

    const maxLights = G.engine.fps < 44 ? 10 : G.engine.fps < 54 ? 16 : 28;
    if (lights.length > maxLights) {
      lights.sort((a, b) => b.intensity * b.radius - a.intensity * a.radius);
      lights.length = maxLights;
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let li = 0; li < lights.length; li++) {
      const l = lights[li];
      const sx = (l.x - v.l) * v.z;
      const sy = (l.y - v.t) * v.z;
      const r = l.radius * v.z;
      const ground = ctx.createRadialGradient(sx, sy + r * 0.16, 0, sx, sy + r * 0.16, r);
      ground.addColorStop(0, lightRgba(l.color, l.intensity * 0.3));
      ground.addColorStop(0.38, lightRgba(l.color, l.intensity * 0.14));
      ground.addColorStop(1, lightRgba(l.color, 0));
      ctx.fillStyle = ground;
      ctx.beginPath();
      ctx.ellipse(sx, sy + r * 0.2, r, r * 0.47, 0, 0, G.TAU);
      ctx.fill();

      if (li < 12 || G.engine.fps >= 54) {
        const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.72);
        halo.addColorStop(0, lightRgba(l.color, l.intensity * l.core));
        halo.addColorStop(0.18, lightRgba(l.color, l.intensity * 0.17));
        halo.addColorStop(1, lightRgba(l.color, 0));
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(sx, sy, r * 0.72, 0, G.TAU); ctx.fill();
      }

      if (l.rays && G.engine.fps >= 46 && li < 8) {
        ctx.strokeStyle = lightRgba(l.color, l.intensity * 0.26);
        ctx.lineWidth = Math.max(1, r * 0.009);
        for (let i = 0; i < l.rays; i++) {
          const a = i / l.rays * G.TAU + t * 0.13;
          const inner = r * 0.08, outer = r * (0.58 + (i % 2) * 0.18);
          ctx.beginPath();
          ctx.moveTo(sx + Math.cos(a) * inner, sy + Math.sin(a) * inner * 0.65);
          ctx.lineTo(sx + Math.cos(a) * outer, sy + Math.sin(a) * outer * 0.65);
          ctx.stroke();
        }
        ctx.globalAlpha = Math.min(1, l.intensity * 0.7);
        ctx.fillStyle = lightRgba(l.color, 0.8);
        ctx.fillRect(sx - r * 0.42, sy - 1, r * 0.84, 2);
        ctx.fillRect(sx - 1, sy - r * 0.3, 2, r * 0.6);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawBloom(ctx) {
    const E = G.engine;
    if (!E.bloom || E.fps < 26) return;   // 本当に苦しい時だけ停止(従来34=終盤の派手さを削っていた)。texture更新は<52で半減(下記)で軽量化済
    const b = E.bctx;
    E.bloomFrame++;
    const update = E.fps >= 52 || E.bloomFrame % 2 === 0 || !E.bloomReady;
    if (update) {
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.clearRect(0, 0, E.bloom.width, E.bloom.height);
      b.globalCompositeOperation = 'source-over';
      b.globalAlpha = 0.9;
      // ⚠️GPUによっては canvas の blur() フィルタが矩形タイル状の artifact を出す(Skia の既知挙動)。
      //   ボス周辺に灰紫の矩形が「スパッと」出る不具合の正体と推定。blur を外し点処理(明度/彩度)のみ残す。
      //   柔らかさは bloom の縮小(0.375x)→平滑拡大(下の imageSmoothing=true)で確保する。
      b.filter = 'brightness(1.28) saturate(1.18)';
      b.drawImage(E.canvas, 0, 0, E.bloom.width, E.bloom.height);
      b.filter = 'none';
      b.globalAlpha = 1;
      E.bloomReady = true;
    }

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = E.fps < 30 ? 0.13 : 0.16;   // 合成コストはalpha非依存→低FPSでも強度を保つ(逆カーブ解消=終盤ほど自分の光で満ちる)
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(E.bloom, 0, 0, E.canvas.width, E.canvas.height);
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
  }

  function drawStageAtmosphere(ctx, t) {
    if (!G.run) return;
    const stage = G.run.stage.id;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (stage === 'mori') {
      const beam = ctx.createLinearGradient(0, 0, G.VIEW_W, G.VIEW_H);
      beam.addColorStop(0, 'rgba(142,190,170,0.07)');
      beam.addColorStop(0.38, 'rgba(110,155,140,0)');
      beam.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(G.VIEW_W * 0.32, 0);
      ctx.lineTo(G.VIEW_W * 0.62, G.VIEW_H); ctx.lineTo(G.VIEW_W * 0.36, G.VIEW_H);
      ctx.closePath(); ctx.fill();
    } else if (stage === 'miyako') {
      const glow = ctx.createRadialGradient(G.VIEW_W * 0.78, -30, 20, G.VIEW_W * 0.78, -30, G.VIEW_H * 0.9);
      glow.addColorStop(0, 'rgba(210,195,255,0.12)');
      glow.addColorStop(0.45, 'rgba(150,125,210,0.035)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, G.VIEW_W, G.VIEW_H);
    } else {
      const under = ctx.createLinearGradient(0, G.VIEW_H * 0.45, 0, G.VIEW_H);
      under.addColorStop(0, 'rgba(0,0,0,0)');
      under.addColorStop(1, `rgba(145,28,34,${0.09 + Math.sin(t * 1.2) * 0.015})`);
      ctx.fillStyle = under;
      ctx.fillRect(0, 0, G.VIEW_W, G.VIEW_H);
      ctx.globalAlpha = 0.055;
      ctx.fillStyle = '#ff5544';
      for (let x = -80; x < G.VIEW_W + 80; x += 190) {
        const dx = x + Math.sin(t * 0.28 + x) * 18;
        ctx.beginPath();
        ctx.moveTo(dx, G.VIEW_H);
        ctx.lineTo(dx + 38, G.VIEW_H * 0.58);
        ctx.lineTo(dx + 64, G.VIEW_H);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function render(dtR) {
    const E = G.engine;
    const ctx = E.ctx;
    const RS = E.RS;

    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(RS, 0, 0, RS, 0, 0);
    ctx.fillStyle = '#131e36';
    ctx.fillRect(0, 0, G.VIEW_W, G.VIEW_H);

    const vw = G.cam.view();
    const left = Math.round(vw.l * 2) / 2;
    const top = Math.round(vw.t * 2) / 2;
    const zf = RS * vw.z;
    ctx.setTransform(zf, 0, 0, zf, -left * zf, -top * zf);

    drawGround(ctx, left, top);
    if (G.run && G.run.stage.ground) {
      ctx.fillStyle = G.run.stage.ground;
      ctx.fillRect(left, top, G.VIEW_W / vw.z + 2, G.VIEW_H / vw.z + 2);
    }
    drawDeco(ctx, left, top);
    if (G.run) drawWalls(ctx);
    if (G.run) {   // マップ外(塀の外側)を闇で覆う: 灯りが塀の外の地面/装飾を照らして「青い帯」として覗く違和感を消す
      const hw = G.MAP_W / 2, hh = G.MAP_H / 2;
      const vW = G.VIEW_W / vw.z + 2, vH = G.VIEW_H / vw.z + 2;
      ctx.fillStyle = '#06070e';
      if (top < -hh) ctx.fillRect(left, top, vW, -hh - top);
      if (top + vH > hh) ctx.fillRect(left, hh, vW, top + vH - hh);
      if (left < -hw) ctx.fillRect(left, top, -hw - left, vH);
      if (left + vW > hw) ctx.fillRect(hw, top, left + vW - hw, vH);
    }
    if (G.opts.contrast) {   // 見やすさ: 高コントラスト=背景を一段沈め、月光リムの妖/自機を際立たせる
      ctx.fillStyle = 'rgba(2,3,8,0.42)';
      ctx.fillRect(left, top, G.VIEW_W / vw.z + 2, G.VIEW_H / vw.z + 2);
    }
    drawFog(ctx, G.run ? G.run.t : titleT, 'under');

    if (G.run) {
      G.ent.render(ctx);
    } else {
      G.fx.render(ctx);
    }
    drawFog(ctx, G.run ? G.run.t : titleT, 'over');

    // back to screen space
    ctx.setTransform(RS, 0, 0, RS, 0, 0);
    if (!G.debug.noLight) { drawLight(ctx); drawColoredLights(ctx); }   // noLight: FX目視監査用に夜の闇/灯りを無効化
    drawStageAtmosphere(ctx, G.run ? G.run.t : titleT);

    // 塀の内縁は闇の上にも薄く描く (境界を常に視認できる)
    if (G.run) {
      ctx.setTransform(zf, 0, 0, zf, -left * zf, -top * zf);
      drawWallEdge(ctx);
      ctx.setTransform(RS, 0, 0, RS, 0, 0);
    }

    if (G.opts.flash && G.fx.flash > 0) {   // 見やすさ: 閃光OFFで全画面フラッシュを抑制
      ctx.fillStyle = `rgba(255,240,210,${Math.min(0.5, G.fx.flash * 0.4)})`;
      ctx.fillRect(0, 0, G.VIEW_W, G.VIEW_H);
    }
    if (G.fx.hurtFlash > 0) {
      ctx.fillStyle = `rgba(190,35,22,${G.fx.hurtFlash * 0.26})`;
      ctx.fillRect(0, 0, G.VIEW_W, G.VIEW_H);
    }
    G.fx.renderScreen(ctx);
    if (!G.debug.noBloom) drawBloom(ctx);   // 切れ原因切り分け用トグル(コンソールで G.debug.noBloom=true)

    // dawn glow during win cinematic
    if (M.state === 'win') {
      const a = Math.min(1, winT / 2.2);
      const grad = ctx.createLinearGradient(0, 0, 0, G.VIEW_H);
      grad.addColorStop(0, `rgba(255,196,120,${0.5 * a})`);
      grad.addColorStop(0.55, `rgba(255,150,90,${0.18 * a})`);
      grad.addColorStop(1, 'rgba(255,120,80,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, G.VIEW_W, G.VIEW_H);
    }

    const vg = G.S.get('vign');
    ctx.drawImage(vg.c, 0, 0, G.VIEW_W, G.VIEW_H);

    if (G.run && M.state !== 'title') {
      G.ui.renderHUD(ctx, dtR);
    }
  }

  return M;
})();

// ---------------- debug / test API ----------------
window.__G = {
  G,
  start: () => G.main.startGame(),
  ts: v => { G.debug.timescale = v; },
  gspeed: v => { G.GAME_SPEED = v; return v; },   // 進行速度 (実行時調整)
  zoom: v => { G.ZOOM = v; return v; },           // 常時ズーム (実行時調整)
  pspeed: v => { G.PLAYER_SPD = v; return v; },   // プレイヤー速度 (実行時調整)
  auto: (v = true) => { G.debug.autoplay = v; },
  autoLevel: (v = true) => { G.debug.autoLevel = v; },
  god: (v = true) => { G.debug.god = v; },
  show: (v = true) => { G.debug.show = v; },
  stats: () => {
    const r = G.run;
    if (!r) return { state: G.main.state, fps: +G.engine.fps.toFixed(1) };
    return {
      state: G.main.state,
      t: +r.t.toFixed(1),
      lvl: r.lvl, xp: r.xp, need: r.need,
      hp: +r.player.hp.toFixed(0), maxHp: r.player.stats.maxHp,
      kills: r.kills, souls: r.souls,
      dmg: Math.round(r.dmgDealt),
      alive: r.en.act.length, projs: r.pr.act.length, gems: r.gem.act.length,
      boss: r.boss ? `${r.boss.bossId}:${Math.round(r.boss.hp)}` : null,
      weapons: r.weapons.map(w => `${w.id}:${w.lvl}${w.awake ? '*' : ''}`),
      passives: Object.assign({}, r.passives),
      talents: Object.assign({}, r.talents),
      buffs: Object.assign({}, r.buffs),
      lamp: r.lampAura.id ? `${r.lampAura.id}:${Math.floor(r.lampAura.lamp.charge)}/${G.data.LAMP.chargeNeed}` : null,
      lampsLit: r.lampsLit, lampBlessings: r.lampBlessings,
      ordeal: r.ordeal ? `${r.ordeal.cfg.id}:${r.ordeal.progress}/${r.ordeal.cfg.goal}` : null,
      pactSeals: r.pactSeals.slice(),
      overtime: r.overtime,
      stage: r.stage.id, char: r.charId, koban: r.koban,
      fps: +G.engine.fps.toFixed(1),
    };
  },
};

window.addEventListener('DOMContentLoaded', () => G.main.boot());
