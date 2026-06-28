/* 百鬼夜行サバイバーズ — ui: canvas HUD + DOM screens */
'use strict';

G.ui = (() => {
  const UI = {};
  const $ = id => document.getElementById(id);

  let els = {};
  let announceQ = [];
  let curAnn = null;
  let ultCutinTimer = 0;
  let synForgeTimer = 0;
  let lvChoices = [];
  let lvSel = 0;
  let lvArmT = 0;   // この時刻まではカード確定入力を無視(直前の操作/奥義キーの取りこぼしで誤確定するのを防ぐ)

  UI.bind = () => {
    els = {
      title: $('title'), levelup: $('levelup'), pact: $('pact'), pause: $('pause'),
      over: $('over'), win: $('win'),
      btStart: $('bt-start'), tBest: $('t-best'),
      lvCards: $('lv-cards'), lvNum: $('lv-num'), lvBuild: $('lv-build'),
      pStats: $('p-stats'), pBuild: $('p-build'),
      volBgm: $('vol-bgm'), volSfx: $('vol-sfx'),
      volBgmVal: $('vol-bgm-val'), volSfxVal: $('vol-sfx-val'),
      chkDmg: $('chk-dmg'),
      chkShake: $('s-chk-shake'), chkFlash: $('s-chk-flash'), chkDmg2: $('s-chk-dmgnum'), chkContrast: $('s-chk-contrast'),
      pChkGod: $('p-chk-god'), pChkFast: $('p-chk-fast'),
      settings: $('settings'), btSettings: $('bt-settings'), btSettingsBack: $('bt-settings-back'),
      sVolBgm: $('s-vol-bgm'), sVolSfx: $('s-vol-sfx'),
      sVolBgmVal: $('s-vol-bgm-val'), sVolSfxVal: $('s-vol-sfx-val'), sChkMute: $('s-chk-mute'),
      sChkGod: $('s-chk-god'), sChkFast: $('s-chk-fast'),
      btResume: $('bt-resume'), btRetire: $('bt-retire'),
      overStats: $('over-stats'), winStats: $('win-stats'),
      overDmg: $('over-dmg'), winDmg: $('win-dmg'),
      overNew: $('over-new'), winNew: $('win-new'),
      btRetry: $('bt-retry'), btTitle: $('bt-title'),
      btRetry2: $('bt-retry2'), btTitle2: $('bt-title2'),
      chest: $('chest'), chSlot: $('ch-slot'), chSpin: $('ch-spin'),
      chRewards: $('ch-rewards'), chSouls: $('ch-souls'),
      chJack: $('ch-jack'), chHint: $('ch-hint'),
      setup: $('setup'), suStages: $('su-stages'), suChars: $('su-chars'), suWeapons: $('su-weapons'), suLoadout: $('su-loadout'), suSummary: $('su-summary'),
      fgSkills: $('fg-skills'),
      suKoban: $('su-koban-n'), btGo: $('bt-go'), btBack: $('bt-back'),
      overKoban: $('over-koban'), winKoban: $('win-koban'),
      overFlavor: $('over-flavor'), winFlavor: $('win-flavor'),
      hono: $('hono'), hnGrid: $('hn-grid'), hnKoban: $('hn-koban-n'),
      btHono: $('bt-hono'), btHonoBack: $('bt-hono-back'),
      forge: $('forge'), fgChars: $('fg-chars'), fgWeapons: $('fg-weapons'), fgKoban: $('fg-koban-n'),
      btForge: $('bt-forge'), btForgeBack: $('bt-forge-back'),
      codex: $('codex'), cxAch: $('cx-ach'), cxFoes: $('cx-foes'),
      cxWeapons: $('cx-weapons'), cxPassives: $('cx-passives'), cxSynergies: $('cx-synergies'),
      btCodex: $('bt-codex'), btCodexBack: $('bt-codex-back'),
      btReroll: $('bt-reroll'), btBanish: $('bt-banish'), btSkip: $('bt-skip'),
      pactCards: $('pact-cards'),
      touch: $('touch'), tbUlt: $('tb-ult'), tbSkill: $('tb-skill'), tbPause: $('tb-pause'),
      ultCutin: $('ult-cutin'),
      synForge: $('syn-forge'),
    };
    els.ultCutinPortrait = els.ultCutin.querySelector('.uc-portrait');
    els.ultCutinChar = els.ultCutin.querySelector('.uc-char');
    els.ultCutinName = els.ultCutin.querySelector('.uc-name');
    els.ultCutinSeal = els.ultCutin.querySelector('.uc-seal');
    els.tbUltK = els.tbUlt.querySelector('.tb-k');
    els.tbSkillK = els.tbSkill.querySelector('.tb-k');
    els.tbSkillCd = els.tbSkill.querySelector('.tb-cd');
    for (const id of G.data.CHAR_ORDER) {
      const img = document.querySelector('.t-cast-' + id);
      if (img) img.src = G.data.CHARS[id].portraitFile;
    }

    // オンスクリーン操作: pointerdown で即発動 (300ms 遅延/ゴーストクリック回避)
    const tap = (el, fn) => el.addEventListener('pointerdown', e => { e.preventDefault(); fn(); });
    tap(els.tbUlt, () => G.main.useUlt());
    tap(els.tbSkill, () => G.main.useSkill());
    tap(els.tbPause, () => G.main.togglePause());
    els.btForge.addEventListener('click', () => G.main.openForge());
    els.btForgeBack.addEventListener('click', () => G.main.toTitle());
    els.btCodex.addEventListener('click', () => G.main.openCodex());
    els.btCodexBack.addEventListener('click', () => G.main.toTitle());
    els.btReroll.addEventListener('click', () => UI.lvReroll());
    els.btBanish.addEventListener('click', () => UI.lvBanishMode());
    els.btSkip.addEventListener('click', () => UI.lvSkip());
    els.btGo.addEventListener('click', () => UI.setupGo());
    els.btBack.addEventListener('click', () => G.main.toTitle());
    els.btHono.addEventListener('click', () => G.main.openHono());
    els.btHonoBack.addEventListener('click', () => G.main.toTitle());

    els.btStart.addEventListener('click', () => G.main.openSetup());
    els.btResume.addEventListener('click', () => G.main.togglePause());
    els.btRetire.addEventListener('click', () => G.main.toTitle());
    els.btRetry.addEventListener('click', () => G.main.startGame());
    els.btTitle.addEventListener('click', () => G.main.toTitle());
    els.btRetry2.addEventListener('click', () => G.main.startGame());
    els.btTitle2.addEventListener('click', () => G.main.toTitle());

    UI.syncVolLabels();
    els.volBgm.addEventListener('input', () => { G.audio.setVol('bgm', els.volBgm.value / 100); UI.syncVolLabels(); });
    els.volSfx.addEventListener('input', () => { G.audio.setVol('sfx', els.volSfx.value / 100); G.audio.sfx('select'); UI.syncVolLabels(); });
    // 見やすさ(a11y): 揺れ/閃光/ダメージ数字/高コントラスト。設定と一時停止で共有・永続化
    const setOpt = (k, on, key) => { G.opts[k] = on; G.store.set(key, on); UI.syncA11y(); };
    els.chkDmg.addEventListener('change', () => setOpt('dmgNum', els.chkDmg.checked, 'optDmgNum'));
    if (els.chkDmg2) els.chkDmg2.addEventListener('change', () => setOpt('dmgNum', els.chkDmg2.checked, 'optDmgNum'));
    if (els.chkShake) els.chkShake.addEventListener('change', () => setOpt('shake', els.chkShake.checked, 'optShake'));
    if (els.chkFlash) els.chkFlash.addEventListener('change', () => setOpt('flash', els.chkFlash.checked, 'optFlash'));
    if (els.chkContrast) els.chkContrast.addEventListener('change', () => setOpt('contrast', els.chkContrast.checked, 'optContrast'));
    UI.syncA11y();

    // タイトルからの「設定」: 一時停止メニューと同じ音量つまみを共有 (両者は常に同期)
    els.btSettings.addEventListener('click', () => G.main.openSettings());
    els.btSettingsBack.addEventListener('click', () => G.main.toTitle());
    els.sVolBgm.addEventListener('input', () => { G.audio.setVol('bgm', els.sVolBgm.value / 100); UI.syncVolLabels(); });
    els.sVolSfx.addEventListener('input', () => { G.audio.setVol('sfx', els.sVolSfx.value / 100); G.audio.sfx('select'); UI.syncVolLabels(); });
    els.sChkMute.addEventListener('change', () => { if (els.sChkMute.checked !== G.audio.muted) G.audio.toggleMute(); UI.syncVolLabels(); });

    // テストプレイ: 無敵 / 2倍速 (設定画面・一時停止のどちらからでも切替可。状態は共有・永続化)
    const setGod = on => { G.debug.god = on; G.store.set('testGod', on); UI.syncTestToggles(); };
    const setFast = on => { G.debug.timescale = on ? 2 : 1; G.store.set('testFast', on); UI.syncTestToggles(); };
    els.sChkGod.addEventListener('change', () => setGod(els.sChkGod.checked));
    els.sChkFast.addEventListener('change', () => setFast(els.sChkFast.checked));
    els.pChkGod.addEventListener('change', () => setGod(els.pChkGod.checked));
    els.pChkFast.addEventListener('change', () => setFast(els.pChkFast.checked));

    // ツールチップ残留の安全網: 表示元の要素が DOM から消えた / カーソルが外れたら消す。
    // クリックは画面再構築の起点なので一旦消す (同じ要素上なら次の mousemove で再表示される)
    document.addEventListener('mousemove', e => {
      if ($('tip').classList.contains('hidden')) return;
      if (!tipOwner || !tipOwner.isConnected || !(tipOwner === e.target || tipOwner.contains(e.target))) UI.hideTip();
    });
    document.addEventListener('click', () => UI.hideTip(), true);

    UI.updateTitleBest();
  };

  // ---------------- tooltip (hover popup) ----------------
  // build() が返す HTML をカーソル追従で表示。UI 座標 (1280×720) に正規化して配置。
  // tipOwner で表示元の要素を追跡し、要素が DOM から消えた場合 (クリックで画面再構築など
  // mouseleave が発火しない経路) はグローバル監視 (UI.bind 内) が消す
  let tipOwner = null;
  function placeTip(e) {
    const tip = $('tip');
    const box = $('ui').getBoundingClientRect();
    const sc = box.width / 1280;
    let x = (e.clientX - box.left) / sc + 18;
    let y = (e.clientY - box.top) / sc + 18;
    if (x + tip.offsetWidth > 1268) x = x - tip.offsetWidth - 34;
    if (y + tip.offsetHeight > 708) y = y - tip.offsetHeight - 34;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }
  function bindTip(el, build) {
    const show = e => {
      // 画面遷移後に飛んでくる残留イベント対策: 非表示画面の要素からは出さない
      if (!el.isConnected || el.offsetParent === null) return;
      const tip = $('tip');
      tipOwner = el;
      tip.innerHTML = build();
      tip.classList.remove('hidden');
      placeTip(e);
    };
    el.addEventListener('mouseenter', show);
    el.addEventListener('mousemove', e => {
      if ($('tip').classList.contains('hidden')) { show(e); return; }
      placeTip(e);
    });
    el.addEventListener('mouseleave', () => UI.hideTip());
  }
  function tipHtml(name, lines) {
    return `<div class="tip-name">${name}</div>` +
      lines.filter(Boolean)
        .map(l => typeof l === 'string' ? `<div class="tip-line">${l}</div>` : `<div class="tip-line ${l.c}">${l.t}</div>`)
        .join('');
  }
  UI.hideTip = () => { tipOwner = null; const t = $('tip'); if (t) t.classList.add('hidden'); };

  UI.syncVolLabels = () => {
    const b = Math.round(G.audio.volBgm * 100), s = Math.round(G.audio.volSfx * 100);
    els.volBgm.value = b; els.volSfx.value = s;
    els.sVolBgm.value = b; els.sVolSfx.value = s;
    els.volBgmVal.textContent = b + '%'; els.volSfxVal.textContent = s + '%';
    els.sVolBgmVal.textContent = b + '%'; els.sVolSfxVal.textContent = s + '%';
    els.sChkMute.checked = G.audio.muted;
  };

  // テストプレイ用トグルの表示を現在の G.debug 状態に合わせる (設定・一時停止の両方を同期)
  UI.syncTestToggles = () => {
    const god = !!G.debug.god, fast = G.debug.timescale >= 2;
    els.sChkGod.checked = god; els.pChkGod.checked = god;
    els.sChkFast.checked = fast; els.pChkFast.checked = fast;
  };

  // 見やすさトグルの表示を G.opts に同期 (設定・一時停止の両方)
  UI.syncA11y = () => {
    if (els.chkDmg) els.chkDmg.checked = G.opts.dmgNum;
    if (els.chkDmg2) els.chkDmg2.checked = G.opts.dmgNum;
    if (els.chkShake) els.chkShake.checked = G.opts.shake;
    if (els.chkFlash) els.chkFlash.checked = G.opts.flash;
    if (els.chkContrast) els.chkContrast.checked = G.opts.contrast;
  };

  UI.openSettings = () => { UI.syncVolLabels(); UI.syncTestToggles(); UI.syncA11y(); UI.show('settings'); };

  UI.hideAll = () => {
    UI.hideTip();
    UI.clearUltCutin();
    if (els.touch) els.touch.classList.remove('on');
    for (const k of ['title', 'levelup', 'pact', 'pause', 'over', 'win', 'chest', 'setup', 'hono', 'forge', 'codex', 'settings']) {
      els[k].classList.add('hidden');
    }
  };

  // ---------------- 奉納 (ema board: permanent upgrades) ----------------
  UI.openHono = () => {
    buildHono();
    UI.show('hono');
  };

  function buildHono() {
    const D = G.data;
    const koban = UI.meta.koban();
    const hono = G.store.get('hono', {});
    els.hnKoban.textContent = koban.toLocaleString();
    els.hnGrid.innerHTML = '';
    D.HONO_ORDER.forEach(key => {
      const cfg = D.HONO[key];
      const rank = hono[key] || 0;
      const maxed = rank >= cfg.ranks;
      const cost = maxed ? 0 : D.honoCost(cfg, rank);
      const afford = !maxed && koban >= cost;
      const btn = document.createElement('button');
      btn.className = 'hn-card' + (maxed ? ' maxed' : afford ? ' can' : '');
      let pips = '<div class="c-pips">';
      for (let k = 1; k <= cfg.ranks; k++) {
        pips += `<i class="${k <= rank ? 'on' : ''}"></i>`;
      }
      pips += '</div>';
      btn.innerHTML = `
        <img src="${G.S.dataURL(cfg.icon)}" alt="">
        <div class="hn-name">${cfg.name}</div>
        ${pips}
        <div class="hn-per">${cfg.per} / 段</div>
        <div class="hn-cost">${maxed ? '満願' : cost.toLocaleString() + ' 両'}</div>
      `;
      btn.addEventListener('click', () => {
        if (maxed) return;
        if (koban < cost) { G.audio.sfx('deny'); return; }
        UI.meta.addKoban(-cost);
        hono[key] = rank + 1;
        G.store.set('hono', hono);
        G.audio.sfx(rank + 1 >= cfg.ranks ? 'powerup' : 'coin');
        buildHono();
      });
      els.hnGrid.appendChild(btn);
    });
  }

  UI.honoKey = code => {
    if (code === 'Escape' || code === 'Enter') G.main.toTitle();
  };

  // ---------------- 鍛錬 (forge: koban-bought permanent mastery) ----------------
  UI.openForge = () => {
    buildForge();
    UI.show('forge');
  };

  // 鍛錬: レベル制 (使い手/得物=100, 技=50)。節目レベルで能力が解放される。
  // 進捗バー(次の節目まで) + 節目チップ + 次Lvの小判コスト を1枚にまとめて描く。
  function forgeMsHtml(lv, milestones, specialLv, specialName) {
    let h = '<div class="fg-ms">';
    const all = (milestones || []).map(m => ({ lv: m.lv, name: m.name, desc: m.desc }));
    if (specialLv) all.push({ lv: specialLv, name: specialName, desc: '特殊能力', special: true });
    all.sort((a, b) => a.lv - b.lv);
    for (const m of all) {
      const on = lv >= m.lv;
      h += `<span class="fg-mchip${on ? ' on' : ''}${m.special ? ' sp' : ''}" title="${m.name} ― ${m.desc} (Lv${m.lv})">${m.lv}<b>${m.name}</b></span>`;
    }
    return h + '</div>';
  }
  function forgeBarHtml(lv, cap, milestones, specialLv) {
    const marks = (milestones || []).map(m => m.lv);
    if (specialLv) marks.push(specialLv);
    marks.sort((a, b) => a - b);
    let lo = 0, hi = cap;
    for (const mk of marks) { if (mk <= lv) lo = mk; else { hi = mk; break; } }
    const frac = hi > lo ? (lv - lo) / (hi - lo) : 1;
    const nextTxt = lv >= cap ? '極' : `次の節目 Lv${hi}`;
    return `<div class="fg-lvrow"><span class="fg-lv">Lv ${lv}<small>/${cap}</small></span><span class="fg-next">${nextTxt}</span></div>`
      + `<div class="fg-bar"><i style="width:${Math.round(frac * 100)}%"></i></div>`;
  }

  function buildForge() {
    const D = G.data;
    const koban = UI.meta.koban();
    els.fgKoban.textContent = koban.toLocaleString();
    const cf = G.store.get('charForge', {});
    const wf = G.store.get('weaponForge', {});
    const sfg = G.store.get('skillForge', {});
    const charsOwned = UI.meta.chars();

    // ---- 使い手 (Lv上限100) ----
    els.fgChars.innerHTML = '';
    D.CHAR_ORDER.forEach(id => {
      const c = D.CHARS[id];
      const owned = charsOwned.includes(id);
      const lv = cf[id] || 0;
      const cap = D.FORGE.charCap;
      const maxed = lv >= cap;
      const cost = maxed ? 0 : D.FORGE.cost(lv);
      const afford = owned && !maxed && koban >= cost;
      const spOn = lv >= D.FORGE.specialAt;
      const btn = document.createElement('button');
      btn.className = 'fg-card' + (maxed ? ' maxed' : afford ? ' can' : '') + (owned ? '' : ' locked');
      btn.innerHTML = `
        <img class="fg-portrait" src="${c.portraitFile || G.S.dataURL(c.portrait || c.spr + '0')}" alt="">
        <div class="fg-copy">
          <div class="fg-name">${c.name}</div>
          <div class="fg-style">${c.style}</div>
          ${forgeBarHtml(lv, cap, c.forgeMilestones, D.FORGE.specialAt)}
          <div class="fg-per">${c.forge.per}</div>
          ${forgeMsHtml(lv, c.forgeMilestones, D.FORGE.specialAt, c.special.name)}
          <div class="hn-cost">${!owned ? '未解放の使い手' : maxed ? '極' : cost.toLocaleString() + ' 両'}</div>
        </div>
      `;
      btn.addEventListener('click', () => {
        if (!owned || maxed) return;
        if (UI.meta.koban() < cost) { G.audio.sfx('deny'); return; }
        UI.meta.addKoban(-cost);
        const nl = lv + 1;
        cf[id] = nl;
        G.store.set('charForge', cf);
        const hitMs = nl === D.FORGE.specialAt || (c.forgeMilestones || []).some(m => m.lv === nl);
        G.audio.sfx(hitMs ? 'awaken' : 'coin');
        buildForge();
      });
      bindTip(btn, () => tipHtml(c.name, [
        c.desc,
        { t: `毎Lv: ${c.forge.per} (今 Lv${lv})`, c: 'gold' },
        { t: `◆ ${c.special.name} ― ${c.special.desc}` + (spOn ? ' (解放済)' : ` (Lv${D.FORGE.specialAt} で解放)`), c: 'reso' },
      ]));
      els.fgChars.appendChild(btn);
    });

    // ---- 得物 (使い手固定の初期武器のみ ・ Lv上限100) ----
    els.fgWeapons.innerHTML = '';
    for (const id of D.FORGE.weaponIds) {
      const cfg = D.W[id];
      const lv = wf[id] || 0;
      const cap = D.FORGE.weaponCap;
      const maxed = lv >= cap;
      const cost = maxed ? 0 : D.FORGE.cost(lv);
      const afford = !maxed && koban >= cost;
      const btn = document.createElement('button');
      btn.className = 'fg-w fg-wlong' + (maxed ? ' maxed' : afford ? ' can' : '');
      btn.innerHTML = `
        <img src="${G.S.dataURL(cfg.icon)}" alt="">
        <div class="fg-wbody">
          <div class="fg-wname">${cfg.name}</div>
          ${forgeBarHtml(lv, cap, cfg.forgeMilestones, 0)}
          ${forgeMsHtml(lv, cfg.forgeMilestones, 0, '')}
        </div>
        <div class="fg-wcost">${maxed ? '極' : cost.toLocaleString() + '両'}</div>
      `;
      btn.addEventListener('click', () => {
        if (maxed) return;
        if (UI.meta.koban() < cost) { G.audio.sfx('deny'); return; }
        UI.meta.addKoban(-cost);
        const nl = lv + 1;
        wf[id] = nl;
        G.store.set('weaponForge', wf);
        G.audio.sfx((cfg.forgeMilestones || []).some(m => m.lv === nl) ? 'awaken' : 'coin');
        buildForge();
      });
      bindTip(btn, () => tipHtml(cfg.name, [
        cfg.desc,
        { t: `毎Lv: 威力 +${(D.FORGE.wDmgPerLevel * 100).toFixed(1)}% (今 Lv${lv} = +${(lv * D.FORGE.wDmgPerLevel * 100).toFixed(0)}%)`, c: 'gold' },
        { t: `☽ ${D.P[cfg.evolveWith].name} を最大Lvにすると装備中に覚醒 →「${cfg.evolveName}」`, c: 'awake' },
      ]));
      els.fgWeapons.appendChild(btn);
    }

    // ---- 技 (Lv上限50) ----
    els.fgSkills.innerHTML = '';
    for (const id of D.SKILL_ORDER) {
      const cfg = D.SKILLS[id];
      const lv = sfg[id] || 0;
      const cap = D.FORGE.skillCap;
      const maxed = lv >= cap;
      const cost = maxed ? 0 : D.FORGE.cost(lv);
      const afford = !maxed && koban >= cost;
      const btn = document.createElement('button');
      btn.className = 'fg-w fg-wlong' + (maxed ? ' maxed' : afford ? ' can' : '');
      btn.innerHTML = `
        <span class="su-ukanji" style="color:${cfg.color}">${cfg.kanji}</span>
        <div class="fg-wbody">
          <div class="fg-wname">${cfg.name}</div>
          ${forgeBarHtml(lv, cap, cfg.forgeMilestones, 0)}
          ${forgeMsHtml(lv, cfg.forgeMilestones, 0, '')}
        </div>
        <div class="fg-wcost">${maxed ? '極' : cost.toLocaleString() + '両'}</div>
      `;
      btn.addEventListener('click', () => {
        if (maxed) return;
        if (UI.meta.koban() < cost) { G.audio.sfx('deny'); return; }
        UI.meta.addKoban(-cost);
        const nl = lv + 1;
        sfg[id] = nl;
        G.store.set('skillForge', sfg);
        G.audio.sfx((cfg.forgeMilestones || []).some(m => m.lv === nl) ? 'awaken' : 'coin');
        buildForge();
      });
      bindTip(btn, () => tipHtml('技「' + cfg.name + '」', [
        cfg.desc,
        { t: `今: 合間 ${cfg.rank(lv).cd.toFixed(1)} 秒 (鍛錬 Lv${lv})`, c: 'gold' },
        `毎Lv: ${cfg.per} (最大 Lv${cap})`,
      ]));
      els.fgSkills.appendChild(btn);
    }
  }

  UI.forgeKey = code => {
    if (code === 'Escape' || code === 'Enter') G.main.toTitle();
  };

  // ---------------- 絵巻 (codex: 実績 / 妖 / 覚醒の道筋) ----------------
  const rewardText = r =>
    r.koban ? `小判 ${r.koban.toLocaleString()} 両`
      : r.weapon ? `${G.data.W[r.weapon].name} 解放`
      : `${G.data.CHARS[r.char].name} 解放`;

  UI.openCodex = () => {
    const D = G.data;
    const got = G.store.get('achieved', {});
    const seen = G.store.get('codexFoes', {});

    els.cxAch.innerHTML = '';
    for (const a of D.ACHIEVE) {
      const on = !!got[a.id];
      const row = document.createElement('div');
      row.className = 'cx-arow' + (on ? ' on' : '');
      row.innerHTML = `
        <span class="cx-amark">${on ? '◆' : '◇'}</span>
        <span class="cx-aname">${a.name}</span>
        <span class="cx-acond">${a.cond}</span>
        <span class="cx-areward">${rewardText(a.reward)}</span>
      `;
      els.cxAch.appendChild(row);
    }

    els.cxFoes.innerHTML = '';
    const foes = Object.keys(D.E).map(id => [id, D.E[id], false])
      .concat(Object.keys(D.B).map(id => [id, D.B[id], true]));
    for (const [id, cfg, isBoss] of foes) {
      const on = !!seen[id];
      const cell = document.createElement('div');
      cell.className = 'cx-foe' + (on ? '' : ' unseen') + (isBoss ? ' boss' : '');
      cell.innerHTML = `
        <img src="${G.S.dataURL(cfg.spr + '_0')}" alt="">
        <div class="cx-fbody">
          <div class="cx-fname">${on ? cfg.name : '？？？'}</div>
          <div class="cx-flore">${on ? (D.LORE.foe[id] || '') : '討ち果たせば、その伝承が記される。'}</div>
        </div>
      `;
      els.cxFoes.appendChild(cell);
    }

    els.cxWeapons.innerHTML = '';
    for (const id in D.W) {
      const cfg = D.W[id];
      const p = D.P[cfg.evolveWith];
      const row = document.createElement('div');
      row.className = 'cx-row';
      row.innerHTML = `
        <img src="${G.S.dataURL(cfg.icon)}" alt="">
        <div class="cx-body">
          <div class="cx-name">${cfg.name}<span class="cx-tag">${cfg.charOnly ? D.CHARS[cfg.charOnly].name + ' 専用' : cfg.unlock ? cfg.unlock.toLocaleString() + ' 両' : ''}</span>${tagChips(id)}</div>
          <div class="cx-desc">${cfg.desc}</div>
          <div class="cx-awake">☽ ${p.name} を最大Lvにすると装備中に覚醒 →「${cfg.evolveName}」 ― ${cfg.awakeDesc}</div>
        </div>
      `;
      els.cxWeapons.appendChild(row);
    }

    els.cxPassives.innerHTML = '';
    for (const id in D.P) {
      const cfg = D.P[id];
      const notes = [];
      if (cfg.projOnly) notes.push('飛び道具の得物 (御札・狐火・破魔矢・御幣・手裏剣) 専用 ― 近接・設置・オーラの得物では抽選に出ない');
      if (cfg.excludes) notes.push(`「${D.P[cfg.excludes].name}」と同時には持てない`);
      for (const rs of D.RESO) if (rs.need.includes(id)) {
        const other = rs.need.find(x => x !== id);
        notes.push(`共鳴「${rs.name}」: ${D.P[other].name} と ― ${rs.desc}`);
      }
      const row = document.createElement('div');
      row.className = 'cx-row';
      row.innerHTML = `
        <img src="${G.S.dataURL(cfg.icon)}" alt="">
        <div class="cx-body">
          <div class="cx-name">${cfg.name}<span class="cx-tag">${cfg.per}</span></div>
          <div class="cx-desc">${cfg.desc}</div>
          ${notes.map(n => `<div class="cx-awake">◆ ${n}</div>`).join('')}
        </div>
      `;
      els.cxPassives.appendChild(row);
    }

    // 相乗(隠し): 会得済みは recipe を明かし、未会得は ??? のまま (発見性を保つ)
    els.cxSynergies.innerHTML = '';
    const synSeen = G.store.get('synSeen', {});
    const nm = id => (D.W[id] && D.W[id].name) || (D.P[id] && D.P[id].name) || id;
    for (const sid in D.SYNERGIES) {
      const s = D.SYNERGIES[sid];
      const on = !!synSeen[sid];
      const recipe = s.need.map(nm).join(' ＋ ');
      const row = document.createElement('div');
      row.className = 'cx-row' + (on ? '' : ' unseen');
      row.innerHTML = `
        <div class="cx-body">
          <div class="cx-name" style="color:${on ? s.color : '#6a6f80'}">${on ? s.name : '？ ？ ？'}<span class="cx-tag">${on ? recipe : '未会得'}</span></div>
          <div class="cx-desc">${on ? s.tip : '― 特定の得物を併せ持つと、おのずと会得する ―'}</div>
        </div>
      `;
      els.cxSynergies.appendChild(row);
    }
    UI.show('codex');
  };

  // ---------------- 実績 (生涯統計 → 解放/報酬) ----------------
  UI.checkAchievements = () => {
    const L = G.store.get('life', {});
    const got = G.store.get('achieved', {});
    const news = [];
    for (const a of G.data.ACHIEVE) {
      if (got[a.id] || !a.chk(L)) continue;
      got[a.id] = true;
      if (a.reward.koban) UI.meta.addKoban(a.reward.koban);
      if (a.reward.weapon) UI.meta.ownWeapon(a.reward.weapon);
      if (a.reward.char) UI.meta.ownChar(a.reward.char);
      news.push(a);
    }
    if (news.length) G.store.set('achieved', got);
    return news;
  };

  // ---------------- meta progression (koban / unlocks) ----------------
  UI.meta = {
    koban: () => G.store.get('koban', 0),
    addKoban: v => G.store.set('koban', Math.max(0, UI.meta.koban() + v)),
    chars: () => G.store.get('charsOwned', ['haru']),
    ownChar: id => {
      const c = UI.meta.chars();
      if (!c.includes(id)) { c.push(id); G.store.set('charsOwned', c); }
    },
    stagesClear: () => G.store.get('stagesClear', []),
    markClear: idx => {
      const s = UI.meta.stagesClear();
      s[idx] = true;
      G.store.set('stagesClear', s);
    },
  };

  // ---------------- setup (出陣支度) ----------------
  const sel = { stage: 0, char: 'haru', weapon: 'ofuda', ult: 'harai', skill: 'goho' };

  UI.meta.weapons = () => G.store.get('weaponsOwned', []);
  UI.meta.ownWeapon = id => {
    const w = UI.meta.weapons();
    if (!w.includes(id)) { w.push(id); G.store.set('weaponsOwned', w); }
  };

  UI.openSetup = () => {
    const clear = UI.meta.stagesClear();
    sel.stage = Math.min(G.store.get('lastStage', 0), maxUnlockedStage(clear));
    const owned = UI.meta.chars();
    sel.char = owned.includes(G.store.get('lastChar', 'haru')) ? G.store.get('lastChar', 'haru') : 'haru';
    sel.weapon = G.data.CHARS[sel.char].weapon;   // 初期武器固定
    const lu = G.store.get('lastUlt', 'harai');
    sel.ult = G.data.ULTS[lu] ? lu : 'harai';
    const ls = G.store.get('lastSkill', 'goho');
    sel.skill = G.data.SKILLS[ls] ? ls : 'goho';
    validateWeaponSel();
    buildSetup();
    UI.show('setup');
  };

  function validateWeaponSel() {
    // 初期武器は使い手ごとに固定 (晴=札 / 鈴=縄 / 無月=残月)。選択不可。
    sel.weapon = G.data.CHARS[sel.char].weapon;
  }

  function maxUnlockedStage(clear) {
    let m = 0;
    for (let i = 1; i < G.data.STAGES.length; i++) if (clear[i - 1]) m = i;
    return m;
  }

  function buildSetup() {
    const D = G.data;
    const clear = UI.meta.stagesClear();
    const koban = UI.meta.koban();
    const owned = UI.meta.chars();
    els.suKoban.textContent = koban.toLocaleString();

    els.suStages.innerHTML = '';
    D.STAGES.forEach((st, i) => {
      const locked = i > 0 && !clear[i - 1];
      const btn = document.createElement('button');
      btn.className = 'su-card' + (sel.stage === i ? ' sel' : '') + (locked ? ' locked' : '');
      btn.innerHTML = `
        ${sel.stage === i ? '<div class="su-check">選</div>' : ''}
        <div class="su-name">${st.name}</div>
        <div class="su-sub">${st.sub}</div>
        <div class="su-desc">${locked ? '前の夜を生き延びると道が開く' : st.desc}</div>
        ${clear[i] ? '<div class="su-clear">✦ 踏破</div>' : '<div class="su-clear"></div>'}
      `;
      if (!locked) {
        btn.addEventListener('click', () => {
          sel.stage = i;
          G.store.set('lastStage', i);
          G.audio.sfx('select');
          buildSetup();
        });
      }
      els.suStages.appendChild(btn);
    });

    els.suChars.innerHTML = '';
    D.CHAR_ORDER.forEach(id => {
      const ch = D.CHARS[id];
      const have = owned.includes(id);
      const btn = document.createElement('button');
      btn.className = 'su-card su-char' + (sel.char === id ? ' sel' : '') + (have ? '' : ' locked');
      const wcfg = D.W[ch.weapon];
      btn.innerHTML = `
        ${sel.char === id ? '<div class="su-check">選</div>' : ''}
        <img class="su-face" src="${ch.portraitFile || G.S.dataURL(ch.portrait || ch.spr + '0')}" alt="">
        <div class="su-name">${ch.name}</div>
        <div class="su-role">${ch.style}</div>
        <div class="su-sub">${ch.sub} ・ <img class="su-wic" src="${G.S.dataURL(wcfg.icon)}" alt="">${wcfg.name}</div>
        <div class="su-desc">${have ? ch.trait : ch.desc}</div>
        ${have ? '' : `<div class="su-cost">${ch.cost.toLocaleString()} 両${koban >= ch.cost ? ' ― 解放できる' : ''}</div>`}
      `;
      btn.addEventListener('click', () => {
        if (have) {
          sel.char = id;
          G.store.set('lastChar', id);
          G.audio.sfx('select');
        } else if (koban >= ch.cost) {
          UI.meta.addKoban(-ch.cost);
          UI.meta.ownChar(id);
          sel.char = id;
          G.store.set('lastChar', id);
          G.audio.sfx('powerup');
        } else {
          G.audio.sfx('deny');
          return;
        }
        validateWeaponSel();
        buildSetup();
      });
      bindTip(btn, () => {
        const cf2 = G.store.get('charForge', {})[id] || 0;
        return tipHtml(ch.name, [
          ch.desc,
          { t: ch.trait, c: 'gold' },
          { t: `◆ ${ch.special.name} ― ${ch.special.desc}` + (cf2 >= D.FORGE.specialAt ? ' (解放済)' : ` (鍛錬Lv${D.FORGE.specialAt}で解放)`), c: 'reso' },
        ]);
      });
      els.suChars.appendChild(btn);
    });

    // 得物の選択/解放は出陣支度から撤去 (初期武器は使い手ごとに固定で変更不可のため)

    // ---- 奥義 ・ 技の編成 (各 1 つ携える ・ チップ形式) ----
    els.suLoadout.innerHTML = '';
    const sf = G.store.get('skillForge', {});
    const chip = (kanji, color, name, sub, tip, on, onClick) => {
      const btn = document.createElement('button');
      btn.className = 'su-chip' + (on ? ' sel' : '');
      btn.innerHTML = `
        <span class="su-ukanji" style="color:${color}">${kanji}</span>
        <span class="su-chipname">${name}</span>
        <span class="su-chipsub">${sub}</span>
      `;
      btn.addEventListener('click', onClick);
      bindTip(btn, tip);
      els.suLoadout.appendChild(btn);
    };
    D.ULT_ORDER.forEach(id => {
      const u = D.ULTS[id];
      chip(u.kanji, u.color, u.name, `討伐 ${u.need}`, () => tipHtml('奥義「' + u.name + '」', [
        u.desc,
        { t: `ゲージ: 討伐 ${u.need} 体で満ちる ・ Space で発動`, c: 'gold' },
      ]), sel.ult === id, () => {
        sel.ult = id;
        G.store.set('lastUlt', id);
        G.audio.sfx('select');
        buildSetup();
      });
    });
    const div = document.createElement('span');
    div.className = 'su-loadout-div';
    els.suLoadout.appendChild(div);
    D.SKILL_ORDER.forEach(id => {
      const s = D.SKILLS[id];
      const rank = sf[id] || 0;
      const cd = s.rank(rank).cd;
      chip(s.kanji, s.color, s.name, `合間 ${cd.toFixed(1).replace(/\.0$/, '')}s`, () => tipHtml('技「' + s.name + '」', [
        s.desc,
        { t: `合間 ${cd.toFixed(1).replace(/\.0$/, '')} 秒 ・ Shift / E で発動`, c: 'gold' },
        rank > 0 ? { t: `鍛錬 Lv${rank} (${s.per})`, c: 'awake' } : `鍛錬で強化可: ${s.per}`,
      ]), sel.skill === id, () => {
        sel.skill = id;
        G.store.set('lastSkill', id);
        G.audio.sfx('select');
        buildSetup();
      });
    });

    const st = D.STAGES[sel.stage];
    const ch = D.CHARS[sel.char];
    const w = D.W[sel.weapon];
    const u = D.ULTS[sel.ult];
    const sk = D.SKILLS[sel.skill];
    els.suSummary.innerHTML = `
      <span class="su-summary-label">編成</span>
      <b>${st.name}</b>
      <i></i><b>${ch.name}</b>
      <i></i><b>${w.name}</b>
      <i></i><b>${u.name}</b>
      <i></i><b>${sk.name}</b>
    `;
  }

  UI.setupGo = () => {
    G.audio.sfx('select');
    G.main.startGame(sel.stage, sel.char, sel.weapon);
  };

  UI.setupKey = code => {
    if (code === 'Enter' || code === 'Space') UI.setupGo();
    else if (code === 'Escape') G.main.toTitle();
  };

  UI.show = name => {
    UI.hideAll();
    if (name) {
      els[name].classList.remove('hidden');
      els[name].classList.remove('fadein');
      void els[name].offsetWidth;     // restart css animation
      els[name].classList.add('fadein');
    }
  };

  UI.updateTitleBest = () => {
    const best = G.store.get('best', null);
    if (best) {
      els.tBest.textContent = `最高記録  ${G.fmtTime(best.t)}  /  Lv ${best.lvl}  /  討伐 ${best.kills.toLocaleString()}` + (best.win ? '  ✦ 夜明け到達' : '');
    } else {
      els.tBest.textContent = '';
    }
  };

  // ---------------- announcements ----------------
  UI.announce = (main, sub, boss = false) => {
    announceQ.push({ main, sub, boss });
    if (announceQ.length > 4) announceQ.shift();
  };

  UI.clearAnnounce = () => { announceQ = []; curAnn = null; };

  UI.showUltCutin = (charId, ultId) => {
    const ch = G.data.CHARS[charId];
    const ult = G.data.ULTS[ultId];
    if (!ch || !ult || !els.ultCutin) return;
    clearTimeout(ultCutinTimer);
    els.ultCutin.style.setProperty('--ult-color', ult.color);
    els.ultCutinPortrait.src = ch.portraitFile;
    els.ultCutinPortrait.alt = ch.name;
    els.ultCutinChar.textContent = ch.name;
    els.ultCutinName.textContent = ult.name;
    els.ultCutinSeal.textContent = ult.kanji;
    const uk = els.ultCutin.querySelector('.uc-kicker'); if (uk) uk.textContent = '奥義解放';
    els.ultCutin.classList.remove('active');
    void els.ultCutin.offsetWidth;
    els.ultCutin.classList.add('active');
    els.ultCutin.setAttribute('aria-hidden', 'false');
    ultCutinTimer = setTimeout(UI.clearUltCutin, 1840);
  };

  UI.clearUltCutin = () => {
    clearTimeout(ultCutinTimer);
    ultCutinTimer = 0;
    if (!els.ultCutin) return;
    els.ultCutin.classList.remove('active');
    els.ultCutin.setAttribute('aria-hidden', 'true');
  };

  // ビルド完成の山場 (覚醒/相乗/共鳴) を奥義カットインの側パネル枠で大きく見せる。
  // announceの小バナー(時刻通知と同列)では山場が立たないため、別格の演出に格上げ。
  UI.showMilestone = (charId, kicker, name, seal, color) => {
    const ch = G.data.CHARS[charId];
    if (!ch || !els.ultCutin) return;
    clearTimeout(ultCutinTimer);
    els.ultCutin.style.setProperty('--ult-color', color || '#ffd166');
    els.ultCutinPortrait.src = ch.portraitFile;
    els.ultCutinPortrait.alt = ch.name;
    const uk = els.ultCutin.querySelector('.uc-kicker'); if (uk) uk.textContent = kicker;
    els.ultCutinChar.textContent = ch.name;
    els.ultCutinName.textContent = name;
    els.ultCutinSeal.textContent = seal;
    els.ultCutin.classList.remove('active');
    void els.ultCutin.offsetWidth;
    els.ultCutin.classList.add('active');
    els.ultCutin.setAttribute('aria-hidden', 'false');
    ultCutinTimer = setTimeout(UI.clearUltCutin, 1840);
  };

  // 相乗 成立の演出: 素材スキル2枚が両側から登場→中央で衝突→新たな相乗札が生まれる
  UI.showSynergy = synId => {
    const s = G.data.SYNERGIES[synId];
    const sf = els.synForge;
    if (!s || !sf) return;
    const D = G.data;
    const wInfo = id => {
      const w = D.W[id] || {};
      const tag = (D.WTAGS[id] || []).map(k => D.TAGINFO[k]).filter(Boolean)[0];
      return { name: w.name || id, icon: w.icon || '', tc: tag ? tag.color : '#8b94a8', tname: tag ? tag.name : '' };
    };
    const fill = (el, w) => {
      el.style.setProperty('--tc', w.tc);
      el.innerHTML = `<img src="${G.S.dataURL(w.icon)}" alt=""><div class="sf-name">${w.name}</div><div class="sf-tag">${w.tname}</div>`;
    };
    fill(sf.querySelector('.sf-a'), wInfo(s.need[0]));
    fill(sf.querySelector('.sf-b'), wInfo(s.need[1]));
    sf.style.setProperty('--sc', s.color || '#ffd166');
    sf.querySelector('.sf-result').innerHTML =
      `<div class="sf-kicker">相 乗</div><div class="sf-seal">${s.kanji || '相'}</div>` +
      `<div class="sf-rname">${s.name}</div><div class="sf-tip">${s.tip || ''}</div>`;
    clearTimeout(synForgeTimer);
    sf.classList.remove('active');
    void sf.offsetWidth;   // reflow → アニメ再生をリスタート
    sf.classList.add('active');
    sf.setAttribute('aria-hidden', 'false');
    if (G.main.synFreeze) G.main.synFreeze(2.0);   // 演出中は時間停止(プレイ妨げない)
    synForgeTimer = setTimeout(() => { sf.classList.remove('active'); sf.setAttribute('aria-hidden', 'true'); }, 2150);
  };

  // ---------------- level up ----------------
  const iconImg = name => `<img src="${G.S.dataURL(name)}" alt="">`;

  // 得物の系統チップ(色付き輪郭ピル)。出陣支度/絵巻でもジャンルを一目で判別する用。
  function tagChips(id) {
    const tags = ((G.data.WTAGS && G.data.WTAGS[id]) || []).map(k => G.data.TAGINFO && G.data.TAGINFO[k]).filter(Boolean);
    if (!tags.length) return '';
    return `<span class="wtags">${tags.map(t => `<span class="wtag" style="--tc:${t.color}">${t.name}</span>`).join('')}</span>`;
  }

  let banishMode = false;

  UI.openLevelUp = () => {
    lvChoices = G.sys.buildChoices();
    banishMode = false;
    renderLvCards();
    UI.show('levelup');
  };

  // 高レア出現時の画面フラッシュ (秘=epic / 伝=legend)。短時間だけ overlay を差し込む
  function rarityFlash(container, tier) {
    if (!container || tier < 2) return;
    const fx = document.createElement('div');
    fx.className = 'rarity-flash ' + (tier >= 3 ? 'legend' : 'epic');
    container.appendChild(fx);
    setTimeout(() => fx.remove(), tier >= 3 ? 1200 : 950);
  }

  // レベルアップ札と宝匣札で共通のカード中身(レア度/種別/名/タグ/段数/説明/上昇/覚醒/相乗)。
  // これにより宝箱の表示をレベルアップに統一する。
  function cardInner(c, i) {
    const rar = c.rarity || 'common';
    let pips = '';
    if (c.max > 0) {
      pips = '<div class="c-pips">';
      for (let k = 1; k <= c.max; k++) pips += `<i class="${k <= c.cur ? 'on' : k === c.cur + 1 ? 'next' : ''}"></i>`;
      pips += '</div>';
    }
    const kindHtml = c.kindLabel
      ? (c.isNew ? `${c.kindLabel} <span class="new">NEW</span>`
        : (c.max > 0 ? `${c.kindLabel} Lv${c.cur} → ${c.cur + 1}` : c.kindLabel))
      : '';
    const tagHtml = (c.tags && c.tags.length)
      ? `<div class="c-tags">${c.tags.map(t => `<span class="c-tag" style="--tc:${t.color}">${t.name}</span>`).join('')}</div>` : '';
    const synHtml = (c.syn && c.syn.length)
      ? c.syn.map(s => `<div class="c-syn${s.ready ? ' ready' : ''}" style="--sc:${s.color}">${s.ready ? `⚡ 相乗成立「${s.name}」` : `◇ 相乗「${s.name}」・ ${s.withName}と`}</div>`).join('') : '';
    const deltaHtml = c.delta
      ? `<div class="c-delta">▸ ${c.delta}</div>`
      : (c.sub ? `<div class="c-delta">${c.sub}</div>` : '<div class="c-delta"></div>');
    return `
      <span class="c-key">${i + 1}</span>
      <span class="c-rarity">${(G.data.RARITY[rar] || {}).name || ''}</span>
      ${iconImg(c.icon)}
      <div class="c-kind">${kindHtml}</div>
      <div class="c-name">${c.name}</div>
      ${tagHtml}
      ${pips}
      <div class="c-desc">${c.desc || ''}</div>
      ${deltaHtml}
      ${c.awake ? `<div class="c-awake">☽ ${c.awake}</div>` : ''}
      ${synHtml}
    `;
  }

  function renderLvCards() {
    const run = G.run;
    lvSel = -1;
    lvArmT = (G.now ? G.now() : performance.now()) + 220;   // 表示直後の取りこぼし誤確定をブロック(多段Lvの連続確定対策)
    // 現在のビルドの系統(得物タグ)を集計して上部に表示 = 何を伸ばせば揃うかの指針
    const tcnt = {};
    for (const w of run.weapons) for (const k of (G.data.WTAGS[w.id] || [])) tcnt[k] = (tcnt[k] || 0) + 1;
    const titems = Object.keys(tcnt).map(k => ({ info: G.data.TAGINFO[k], n: tcnt[k] }))
      .filter(x => x.info).sort((a, b) => b.n - a.n);
    const tallyHtml = titems.length
      ? `<span class="lv-tally">系統 ${titems.map(t => `<span class="lt" style="--tc:${t.info.color}">${t.info.name}<b>${t.n}</b></span>`).join('')}</span>`
      : '';
    els.lvNum.innerHTML = (run.pendLv > 1 ? `<span class="lv-rem">残り ${run.pendLv}</span> ` : '') + tallyHtml;
    els.lvCards.innerHTML = '';
    els.lvCards.classList.toggle('banishing', banishMode);
    lvChoices.forEach((c, i) => {
      const btn = document.createElement('button');
      btn.className = 'card r-' + (c.rarity || 'common') + (c.kind === 'talent' ? ' talent' : '');
      btn.style.setProperty('--card-i', i);
      btn.innerHTML = cardInner(c, i);
      btn.addEventListener('click', () => UI.chooseLv(i));
      btn.addEventListener('mouseenter', () => UI.setLvSel(i));
      els.lvCards.appendChild(btn);
    });
    // 高レア出現の演出: 秘=きらめき / 伝=覚醒チャイム (出た時だけ鳴らす)
    let topTier = 0;
    for (const c of lvChoices) topTier = Math.max(topTier, (G.data.RARITY[c.rarity || 'common'] || {}).tier || 0);
    if (topTier >= 3) G.audio.sfx('awaken');
    else if (topTier >= 2) G.audio.sfx('reveal');
    rarityFlash(els.levelup, topTier);   // 高レアが出たら画面フラッシュ
    // 操作列: 引き直し / 封印 / 見送り
    els.btReroll.textContent = `引き直す ×${run.rerolls}`;
    els.btReroll.disabled = run.rerolls <= 0;
    els.btBanish.textContent = banishMode ? '封印する札を選べ' : `封印 ×${run.banishes}`;
    els.btBanish.disabled = run.banishes <= 0 && !banishMode;
    els.btBanish.classList.toggle('arming', banishMode);
    els.lvBuild.innerHTML = UI.buildIcons();
  }

  UI.lvReroll = () => {
    const run = G.run;
    if (run.rerolls <= 0) { G.audio.sfx('deny'); return; }
    run.rerolls--;
    banishMode = false;
    lvChoices = G.sys.buildChoices();
    G.audio.sfx('select');
    renderLvCards();
  };

  UI.lvBanishMode = () => {
    const run = G.run;
    if (!banishMode && run.banishes <= 0) { G.audio.sfx('deny'); return; }
    banishMode = !banishMode;
    G.audio.sfx('select');
    renderLvCards();
  };

  UI.lvSkip = () => {
    banishMode = false;
    G.audio.sfx('select');
    G.main.lvChosen();
  };

  UI.setLvSel = i => {
    lvSel = i;
    const cards = els.lvCards.children;
    for (let k = 0; k < cards.length; k++) cards[k].classList.toggle('sel', k === i);
  };

  UI.chooseLv = i => {
    if ((G.now ? G.now() : performance.now()) < lvArmT) { G.audio.sfx('deny'); return; }   // 表示直後の取りこぼし誤確定を無視
    const c = lvChoices[i];
    if (!c) return;
    if (banishMode) {
      // 封印: この札を以後の抽選 (宝箱含む) から消し、引き直す。レベルは消費しない
      if (c.kind !== 'weapon' && c.kind !== 'passive' && c.kind !== 'talent') { G.audio.sfx('deny'); return; }
      const run = G.run;
      run.banished[c.id] = true;
      run.banishes--;
      banishMode = false;
      lvChoices = G.sys.buildChoices();
      G.audio.sfx('bolt');
      renderLvCards();
      return;
    }
    G.audio.sfx('select');
    G.sys.applyChoice(c);
    if (c.kind !== 'talent') {
      const p = G.run.player;
      const col = c.kind === 'weapon' ? '#ffd166'
        : c.kind === 'passive' ? '#9ad8ff'
          : c.kind === 'heal' ? '#8ae8a0' : '#ff765c';
      G.audio.sfx(c.isNew ? 'powerup' : 'reveal');
      G.fx.ring(p.x, p.y, { r0: 10, r1: c.isNew ? 145 : 105, life: 0.42, color: col, width: c.isNew ? 4 : 3 });
      G.fx.spark(p.x, p.y - 8, col, c.isNew ? 12 : 7, 170, 0.32);
      if (c.isNew) G.ui.announce(`新たな${c.kindLabel}「${c.name}」`, c.delta || '');
    }
    G.main.lvChosen();
  };

  // keyboard navigation inside the level-up screen
  UI.lvKey = code => {
    if (code === 'Digit1' || code === 'Numpad1') { UI.chooseLv(0); return true; }
    if (code === 'Digit2' || code === 'Numpad2') { UI.chooseLv(1); return true; }
    if (code === 'Digit3' || code === 'Numpad3') { UI.chooseLv(2); return true; }
    if (code === 'Digit4' || code === 'Numpad4') { UI.chooseLv(3); return true; }
    if (code === 'KeyR') { UI.lvReroll(); return true; }
    if (code === 'Escape') { UI.lvSkip(); return true; }
    if (code === 'ArrowLeft' || code === 'KeyA') { UI.setLvSel(lvSel <= 0 ? lvChoices.length - 1 : lvSel - 1); return true; }
    if (code === 'ArrowRight' || code === 'KeyD') { UI.setLvSel((lvSel + 1) % lvChoices.length); return true; }
    if (code === 'Enter') { UI.chooseLv(lvSel < 0 ? 0 : lvSel); return true; }
    if (code === 'Space') return true;   // Space=奥義キーの取りこぼしでカードを誤確定しないよう無効化(確定はEnter/数字/クリック)
    return false;
  };

  // ---------------- night pact selection ----------------
  let pactChoices = [];

  UI.openPact = choices => {
    pactChoices = choices || [];
    els.pactCards.innerHTML = '';
    pactChoices.forEach((c, i) => {
      const safe = c.objective === 'safe';
      const btn = document.createElement('button');
      btn.className = 'pact-card' + (safe ? ' safe' : '');
      btn.style.setProperty('--pact-color', c.color);
      const goal = safe ? '退いて整える' : (
        c.objective === 'kills' ? `${c.goal}体 討伐` :
        c.objective === 'combo' ? `${c.goal}連撃 到達` :
        c.objective === 'elite' ? `強き妖 ${c.goal}体 討伐` :
        c.objective === 'souls' ? `魂 ${c.goal} 回収` :
        `${c.goal}秒 無傷`
      );
      btn.innerHTML = `
        <span class="pact-key">${i + 1}</span>
        <div class="pact-sigil">${c.kanji}</div>
        <div class="pact-type">${safe ? '祈 り' : '試 練'}</div>
        <div class="pact-name">${c.name}</div>
        <div class="pact-goal">${goal}</div>
        <div class="pact-desc">${c.desc}</div>
        <div class="pact-risk"><b>危難</b><span>${c.riskText}</span></div>
        <div class="pact-reward"><b>${safe ? '恵み' : '契印'}</b><span>${c.rewardText}</span></div>
      `;
      btn.addEventListener('click', () => UI.choosePact(i));
      els.pactCards.appendChild(btn);
    });
    UI.show('pact');
  };

  UI.choosePact = i => {
    const choice = pactChoices[i];
    if (!choice) return;
    G.main.choosePact(choice);
  };

  UI.pactKey = code => {
    const m = /^(?:Digit|Numpad)([1-3])$/.exec(code);
    if (m) { UI.choosePact(+m[1] - 1); return true; }
    if (code === 'ArrowLeft' || code === 'KeyA') return true;
    if (code === 'ArrowRight' || code === 'KeyD') return true;
    return false;
  };

  // ---------------- treasure chest lottery ----------------
  // おにぎり+魂は開封時に確定取得済み。候補から一つだけ選ぶ (最後の札は追加おにぎり)
  let chestTimers = [];
  let chestDone = false;
  let chestCands = [];
  let chestHealed = 0;

  UI.chestCleanup = () => {
    for (const t of chestTimers) clearTimeout(t);
    chestTimers = [];
  };

  const chestChoices = () => chestCands;   // 宝箱はスキルのみ(おにぎり/魂/大当たりは廃止)

  UI.openChest = (cands, healed, jackpot) => {
    chestCands = cands;
    chestHealed = healed;
    chestDone = false;
    UI.chestCleanup();
    els.chRewards.innerHTML = '';
    els.chSouls.textContent = '';
    els.chHint.classList.add('hidden');
    els.chSlot.classList.add('hidden');   // スロット演出は廃止 → レベルアップと同じ「札が並んで選ぶ」表示に統一
    els.chJack.classList.toggle('hidden', !jackpot);
    els.chest.classList.toggle('jack', !!jackpot);
    UI.show('chest');

    const list = chestChoices();
    list.forEach((c, i) => appendChoiceCard(c, i));   // 全札を一斉表示(card-rise で少しずつ立つ = レベルアップ同様)
    let topTier = 0;
    for (const c of list) topTier = Math.max(topTier, (G.data.RARITY[c.rarity || 'common'] || {}).tier || 0);
    if (jackpot || topTier >= 3) G.audio.sfx('awaken');
    else if (topTier >= 2) G.audio.sfx('reveal');
    rarityFlash(els.chest, jackpot ? 3 : topTier);
    finishChestChoices();
  };

  // 宝匣の札もレベルアップと同じ .card / cardInner で描画(表示を統一)
  function appendChoiceCard(c, i) {
    const btn = document.createElement('button');
    btn.className = 'card r-' + (c.rarity || 'common') + (c.kind === 'talent' ? ' talent' : '');
    btn.style.setProperty('--card-i', i);
    btn.innerHTML = cardInner(c, i);
    btn.addEventListener('click', () => chestPick(i));
    els.chRewards.appendChild(btn);
  }

  function finishChestChoices() {
    els.chSouls.textContent = 'スキルを一つ授かる';
    els.chHint.classList.remove('hidden');
    chestDone = true;
  }

  function chestPick(i) {
    if (!chestDone) return;
    const c = chestChoices()[i];
    if (!c) return;
    if (c.kind === 'onigiri') G.sys.chestOnigiri();
    else G.sys.applyChestCandidate(c);
    G.audio.sfx('select');
    G.main.closeChest();
  }

  UI.chestKey = code => {
    if (!chestDone) {
      if (code === 'Enter' || code === 'Space' || code === 'Escape') {
        // skip the ceremony: show all choices at once
        UI.chestCleanup();
        els.chSlot.classList.add('hidden');
        els.chRewards.innerHTML = '';
        chestChoices().forEach((c, i) => appendChoiceCard(c, i));
        finishChestChoices();
      }
      return;
    }
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
    if (m) { chestPick(+m[1] - 1); return; }
    if (code === 'Escape') chestPick(chestChoices().length - 1);   // 逃げ = おにぎり
  };

  UI.buildIcons = () => {
    const run = G.run;
    let html = '';
    for (const w of run.weapons) {
      html += `<span title="${G.data.W[w.id].name} Lv${w.lvl}${w.awake ? ' (覚醒)' : ''}">${iconImg(G.data.W[w.id].icon)}</span>`;
    }
    html += '<span class="sep"></span>';
    for (const id in run.passives) {
      html += `<span title="${G.data.P[id].name} Lv${run.passives[id]}">${iconImg(G.data.P[id].icon)}</span>`;
    }
    if (Object.keys(run.talents).length) {
      html += '<span class="sep"></span>';
      for (const id in run.talents) {
        html += `<span class="talent-chip" title="${G.data.TALENTS[id].name} Lv${run.talents[id]}">${iconImg(G.data.TALENTS[id].icon)}</span>`;
      }
    }
    const act = G.data.RESO.filter(r => run.reso && run.reso[r.id]);
    if (act.length) {
      html += '<span class="sep"></span>';
      for (const r of act) html += `<span class="reso-chip" title="${r.desc}">${r.name}</span>`;
    }
    return html;
  };

  // ---------------- pause ----------------
  UI.openPause = () => {
    const run = G.run;
    els.pStats.innerHTML = `
      <span>時間 <b>${G.fmtTime(run.clock)}</b></span>
      <span>Lv <b>${run.lvl}</b></span>
      <span>討伐 <b>${run.kills.toLocaleString()}</b></span>
      <span>魂 <b>${run.souls.toLocaleString()}</b></span>
      <span>総打撃 <b>${Math.round(run.dmgDealt).toLocaleString()}</b></span>
      <span>灯した提灯 <b>${run.lampsLit}</b></span>
      <span>三灯共鳴 <b>${run.lampBlessings}</b></span>
      <span>奥義 <b>${G.data.ULTS[run.ult.id].name}</b></span>
      <span>技 <b>${G.data.SKILLS[run.skill.id].name}</b></span>
    `;
    els.pBuild.innerHTML = UI.buildIcons();
    UI.syncTestToggles();
    UI.show('pause');
  };

  // ---------------- result ----------------
  UI.showResult = win => {
    const run = G.run;
    const statsHtml = `
      <div class="k">生存時間</div><div class="k">レベル</div><div class="k">討伐数</div><div class="k">集めた魂</div><div class="k">契印</div>
      <div class="v">${G.fmtTime(run.clock)}</div><div class="v">${run.lvl}</div><div class="v">${run.kills.toLocaleString()}</div><div class="v">${run.souls.toLocaleString()}</div><div class="v">${run.pactSeals.length}</div>
    `;
    const prev = G.store.get('best', null);
    const score = run.clock + (win ? 100000 : 0);
    const prevScore = prev ? prev.t + (prev.win ? 100000 : 0) : -1;
    let isNew = false;
    if (score > prevScore) {
      G.store.set('best', { t: Math.floor(run.clock), lvl: run.lvl, kills: run.kills, win });
      isNew = true;
    }

    // koban payout (souls + boss bounty + picked coins + clear bonus, 銭の絵馬で増額)
    const zeniMul = 1 + 0.1 * ((run.hono && run.hono.zeni) || 0);
    const lampBonus = win ? (run.lampsLit || 0) * 30 : 0;   // 夜明け報酬: 夜明けに灯っている提灯1つ毎に +30両 (灯りの維持に意味)
    const earned = Math.round((Math.floor(run.souls * 0.1) + run.bossKills * 25 + (win ? 150 : 0) + lampBonus) * zeniMul) + run.koban;
    UI.meta.addKoban(earned);
    if (win) UI.meta.markClear(run.stageIdx);

    // 生涯統計を積んで実績を判定
    const L = G.store.get('life', {});
    L.kills = (L.kills || 0) + run.kills;
    L.souls = (L.souls || 0) + run.souls;
    L.bossKills = (L.bossKills || 0) + run.bossKills;
    L.chests = (L.chests || 0) + run.chestsOpened;
    L.awakens = (L.awakens || 0) + run.awakens;
    L.pacts = (L.pacts || 0) + run.pactSeals.length;
    L.maxCombo = Math.max(L.maxCombo || 0, run.maxCombo);
    if (win) {
      L['win' + run.stageIdx] = true;
      if (run.overtime) L.otWin = true;
    }
    G.store.set('life', L);
    const news = UI.checkAchievements();
    const achHtml = news.map(a => `<div class="r-ach">◆ 実績「${a.name}」 ― ${rewardText(a.reward)}</div>`).join('');
    if (news.length) G.audio.sfx('powerup');

    const kobanHtml = `小判 +${earned.toLocaleString()} 両 <span class="r-koban-total">(蓄え ${UI.meta.koban().toLocaleString()} 両)</span>` + achHtml;

    // ダメージ内訳ランキング: どの攻撃が何ダメ与えたか(精密集計 run.dmgSrc)
    // 「その他」(帰属不明)は内訳から除外。グラフ(バー)は廃止し、名前+実数+割合のみ
    const srcEntries = Object.entries(run.dmgSrc || {}).filter(e => e[1] > 0 && e[0] !== 'その他').sort((a, b) => b[1] - a[1]);
    const totalDmg = srcEntries.reduce((s, e) => s + e[1], 0) || 1;
    const srcName = id => (G.data.W[id] && G.data.W[id].name) || id;
    const dmgHtml = srcEntries.length
      ? '<div class="r-dmg-h">ダメージ内訳</div>' + srcEntries.slice(0, 8).map(e => {
          const pct = Math.round(e[1] / totalDmg * 100);
          return `<div class="r-dmg-row"><span class="r-dmg-n">${srcName(e[0])}</span><span class="r-dmg-v">${Math.round(e[1]).toLocaleString()}<b>${pct}%</b></span></div>`;
        }).join('')
      : '';

    // 百鬼語り: 結末に応じた一文 (勝利=夜×使い手、敗北=殺した妖/刻限)
    const lore = G.data.LORE;
    if (win) {
      const wl = (lore.win[run.stage.id] || {})[run.charId];
      els.winFlavor.textContent = '――' + (wl || '生き延びた。朝陽が妖を祓う');
      els.winStats.innerHTML = statsHtml;
      els.winDmg.innerHTML = dmgHtml;
      els.winNew.textContent = isNew ? '― 新記録 ―' : '';
      els.winKoban.innerHTML = kobanHtml;
      UI.show('win');
    } else {
      const killer = run.killedBy ? lore.death[run.killedBy] : null;
      let line;
      if (run.overtime) line = killer || G.pick(lore.otDeath);
      else if (run.clock >= run.stage.length * 0.88) line = G.pick(lore.dawnDeath);
      else line = killer || G.pick(lore.genericDeath);
      els.overFlavor.textContent = '――' + line;
      els.overStats.innerHTML = statsHtml;
      els.overDmg.innerHTML = dmgHtml;
      els.overNew.textContent = isNew ? '― 新記録 ―' : '';
      els.overKoban.innerHTML = kobanHtml;
      UI.show('over');
    }
    UI.updateTitleBest();
  };

  // ---------------- canvas HUD ----------------
  let cueRun = null, skillReadyPrev = true, ultReadyPrev = false;   // 準備完了の合図用
  const HUD_FONT = '"MS Gothic","Yu Gothic UI",Consolas,monospace';

  function hudPanel(ctx, x, y, w, h, accent = '#ffd166') {
    ctx.fillStyle = 'rgba(3,5,11,0.72)';
    ctx.fillRect(x + 4, y + 4, w, h);
    ctx.fillStyle = 'rgba(10,14,26,0.94)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#46506a';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = accent;
    ctx.fillRect(x + 2, y + 2, w - 4, 3);
    ctx.fillRect(x + 2, y + 2, 5, 5);
    ctx.fillRect(x + w - 7, y + 2, 5, 5);
  }

  function hudBar(ctx, x, y, w, h, frac, color, segments = 0) {
    const f = G.clamp(frac, 0, 1);
    ctx.fillStyle = '#050711';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#202840';
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = color;
    ctx.fillRect(x + 2, y + 2, Math.floor((w - 4) * f), h - 4);
    if (segments > 1) {
      ctx.fillStyle = 'rgba(4,6,12,0.7)';
      for (let i = 1; i < segments; i++) {
        const sx = Math.round(x + i * w / segments);
        ctx.fillRect(sx, y + 2, 1, h - 4);
      }
    }
  }

  // ミニマップ: マップ全域を縮約し、自分(白)/灯り(種別色・消えた灯は暗点)/宝箱(金・脈動)/ボス(赤)を点で示す
  function drawMinimap(ctx, x, y, w, h) {
    const run = G.run;
    hudPanel(ctx, x, y, w, h, run.allLit ? '#ffe08a' : '#7284a8');
    const pad = 8;
    const mx = x + pad, my = y + pad, mw = w - pad * 2, mh = h - pad * 2;
    ctx.fillStyle = 'rgba(6,9,16,0.92)';
    ctx.fillRect(mx, my, mw, mh);
    const sx = mw / G.MAP_W, sy = mh / G.MAP_H;
    const mini = (wx, wy) => [mx + (wx + G.MAP_W / 2) * sx, my + (wy + G.MAP_H / 2) * sy];
    for (const t of run.toros) {
      const [lx, ly] = mini(t.x, t.y);
      if (!t.dead) {
        const sig = G.data.LAMP_SIGILS[t.sigil];
        ctx.fillStyle = sig ? sig.color : '#ffce8c';
        ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(lx, ly, 5.5, 0, G.TAU); ctx.fill();
        ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(lx, ly, 3, 0, G.TAU); ctx.fill();
        if (t.douseT > 0) {   // 消されかけの灯は赤く明滅
          ctx.strokeStyle = '#ff5a3c'; ctx.globalAlpha = 0.5 + 0.4 * Math.sin(run.t * 14);
          ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(lx, ly, 5, 0, G.TAU); ctx.stroke(); ctx.globalAlpha = 1;
        }
      } else {
        ctx.fillStyle = '#454d61'; ctx.beginPath(); ctx.arc(lx, ly, 2.4, 0, G.TAU); ctx.fill();
      }
    }
    // 雑魚モブ: 小さく淡い赤点(プレイヤーより後ろに描く)
    const act = run.en && run.en.act ? run.en.act : [];
    ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(214,84,74,0.7)';
    for (const e of act) {
      if (e.dead || e.boss || e.elite) continue;
      const [ex, ey] = mini(e.x, e.y);
      ctx.fillRect(ex - 1, ey - 1, 2, 2);
    }
    // プレイヤー(白)
    const [px, py] = mini(run.player.x, run.player.y);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(px, py, 3, 0, G.TAU); ctx.fill();
    ctx.strokeStyle = '#0a0e1a'; ctx.lineWidth = 1; ctx.stroke();
    // 強個体(エリート): 橙の大きめ点で前面に
    for (const e of act) {
      if (e.dead || e.boss || !e.elite) continue;
      const [ex, ey] = mini(e.x, e.y);
      ctx.fillStyle = '#ff9d3c'; ctx.beginPath(); ctx.arc(ex, ey, 3, 0, G.TAU); ctx.fill();
      ctx.strokeStyle = '#1a0e06'; ctx.lineWidth = 0.8; ctx.stroke();
    }
    // ボス: 赤の大きい点+白縁で別格・最前面
    if (run.boss && !run.boss.dead) {
      const [bx, by] = mini(run.boss.x, run.boss.y);
      ctx.fillStyle = '#ff2d2d'; ctx.beginPath(); ctx.arc(bx, by, 4.8, 0, G.TAU); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2; ctx.stroke();
    }
    // 宝箱は最後に描いて最前面に(暗い縁取り+金の脈動で必ず目立つ=道標)
    for (const c of run.chests) {
      if (c.opened) continue;
      const [cx, cy] = mini(c.x, c.y);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#0a0e1a';
      ctx.fillRect(cx - 4, cy - 4, 9, 9);
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(run.t * 6);
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(cx - 3, cy - 3, 7, 7);
      ctx.globalAlpha = 1;
    }
  }

  UI.renderHUD = (ctx, dt) => {
    const run = G.run;
    if (!run) return;
    const W = G.VIEW_W, H = G.VIEW_H;
    const p = run.player;

    const frac = G.clamp(run.xp / run.need, 0, 1);
    const hf = G.clamp(p.hp / p.stats.maxHp, 0, 1);

    // --- XP rail ---
    ctx.fillStyle = 'rgba(3,5,11,0.9)';
    ctx.fillRect(0, 0, W, 12);
    hudBar(ctx, 4, 3, W - 8, 7, frac, '#ffd166', 24);

    // --- player status ---
    hudPanel(ctx, 12, 20, 310, 76, hf < 0.35 ? '#ff5a4a' : '#d74b36');
    const charCfg = G.data.CHARS[run.charId];
    const charSpr = G.S.get(charCfg.spr + '0');
    if (charSpr) {
      ctx.drawImage(charSpr.c, 18, 27, 42, 56);
    }
    ctx.textAlign = 'left';
    ctx.font = `bold 15px ${HUD_FONT}`;
    ctx.fillStyle = '#f4edd9';
    ctx.fillText(charCfg.name, 68, 42);
    ctx.font = `bold 12px ${HUD_FONT}`;
    ctx.fillStyle = '#ffb4a0';
    ctx.fillText('生命', 68, 60);
    hudBar(ctx, 106, 49, 154, 14, hf, hf > 0.35 ? '#cf3f32' : '#ff5a4a', 10);
    ctx.textAlign = 'right';
    ctx.font = `bold 12px ${HUD_FONT}`;
    ctx.fillStyle = '#fff3e7';
    ctx.fillText(`${Math.ceil(p.hp)}/${p.stats.maxHp}`, 255, 60);
    ctx.fillStyle = '#9ad8ff';
    ctx.fillText(`魂 ${run.xp}/${run.need}`, 255, 81);
    ctx.textAlign = 'center';
    ctx.font = `bold 13px ${HUD_FONT}`;
    ctx.fillStyle = '#ffd166';
    ctx.fillText('段', 286, 45);
    ctx.font = `bold 24px ${HUD_FONT}`;
    ctx.fillText(String(run.lvl), 286, 73);

    // --- timer and moon ---
    hudPanel(ctx, W / 2 - 116, 20, 232, 72, run.overtime ? '#ff5a4a' : (run.moon ? run.moon.color : '#9ad8ff'));
    ctx.textAlign = 'center';
    ctx.font = `bold 31px ${HUD_FONT}`;
    ctx.fillStyle = '#03050b';
    ctx.fillText(G.fmtTime(run.clock), W / 2 + 2, 54);
    ctx.fillStyle = run.overtime ? '#ff6a4c' : '#f2ecd9';
    ctx.fillText(G.fmtTime(run.clock), W / 2, 52);
    ctx.font = `bold 12px ${HUD_FONT}`;
    ctx.fillStyle = run.overtime ? '#ff9a7f' : '#a9b7d6';
    ctx.fillText(run.overtime ? '決 戦' : `夜明け ${G.fmtTime(run.stage.length)}`, W / 2, 72);
    if (run.moon) {
      const m = run.moon;
      ctx.font = `bold 12px ${HUD_FONT}`;
      ctx.fillStyle = m.color;
      ctx.fillText(`${m.kanji} ${m.name}`, W / 2, 86);
    }

    // --- minimap (右上): 自分/灯り(種別色)/宝箱/ボス の位置。討伐パネルと幅・左端を揃える ---
    drawMinimap(ctx, W - 252, 20, 240, 132);

    // --- kill and combo panel (ミニマップの下へ移動) ---
    const ky = 160;
    hudPanel(ctx, W - 252, ky, 240, 76, run.combo >= 100 ? '#ffd166' : '#7284a8');
    ctx.textAlign = 'right';
    ctx.font = `bold 12px ${HUD_FONT}`;
    ctx.fillStyle = '#9fb0d1';
    ctx.fillText('討 伐', W - 174, ky + 23);
    ctx.font = `bold 24px ${HUD_FONT}`;
    ctx.fillStyle = '#e8e2d0';
    ctx.fillText(run.kills.toLocaleString(), W - 24, ky + 30);

    if (run.combo >= 10) {
      const pop = run.comboPop > 0 ? run.comboPop / 0.15 : 0;
      const n = run.combo;
      const col = n >= 300 ? '#ff7a4c' : n >= 100 ? '#ffd166' : '#e8e2d0';
      ctx.save();
      ctx.translate(W - 24, ky + 58);
      const sc = 1 + pop * 0.18;
      ctx.scale(sc, sc);
      ctx.textAlign = 'right';
      ctx.font = `bold 20px ${HUD_FONT}`;
      ctx.fillStyle = '#03050b';
      ctx.fillText(n + ' 連', 2, 2);
      ctx.fillStyle = col;
      ctx.fillText(n + ' 連', 0, 0);
      ctx.restore();
      const comboMax = 2.6 + [0, 0.35, 0.65, 1.0][run.talents.yawatari || 0];
      hudBar(ctx, W - 232, ky + 64, 108, 6, run.comboT / comboMax, col, 6);
      const comboMight = Math.min(30, Math.floor(n / 50) * 5);
      if (comboMight > 0) {
        ctx.textAlign = 'left';
        ctx.font = `bold 11px ${HUD_FONT}`;
        ctx.fillStyle = n >= 300 ? '#ffb08c' : '#ffd166';
        ctx.fillText(`祓力+${comboMight}%`, W - 230, ky + 56);
      }
    } else {
      ctx.textAlign = 'right';
      ctx.font = `11px ${HUD_FONT}`;
      ctx.fillStyle = '#65708b';
      ctx.fillText('連撃を繋げ', W - 24, ky + 58);
    }

    // --- 灯明満ち: 全灯点灯の加護を金の脈動縁で常時表示 ---
    if (run.allLit) {
      ctx.save();
      ctx.globalAlpha = 0.1 + 0.045 * Math.sin(run.t * 3);
      ctx.strokeStyle = '#ffe08a';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 15, W - 6, H - 18);
      ctx.restore();
    }

    // --- build strip ---
    let ix = 14;
    const stripY = 104;
    for (const w of run.weapons) {
      const s = G.S.get(G.data.W[w.id].icon);
      ctx.fillStyle = 'rgba(7,10,18,0.88)';
      ctx.fillRect(ix, stripY, 31, 36);
      ctx.strokeStyle = w.awake ? '#ffd166' : '#39445f';
      ctx.strokeRect(ix + 0.5, stripY + 0.5, 30, 35);
      ctx.globalAlpha = 0.92;
      if (s) ctx.drawImage(s.c, ix + 3, stripY + 3, 25, 25);   // アトラス欠落アイコンでのクラッシュ防止
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffd166';
      for (let k = 0; k < w.lvl; k++) ctx.fillRect(ix + 3 + k * 3.7, stripY + 31, 3, 2);
      ix += 35;
    }
    ix += 5;
    for (const id in run.passives) {
      const s = G.S.get(G.data.P[id].icon);
      ctx.fillStyle = 'rgba(7,10,18,0.82)';
      ctx.fillRect(ix, stripY, 31, 36);
      ctx.strokeStyle = '#354d68';
      ctx.strokeRect(ix + 0.5, stripY + 0.5, 30, 35);
      ctx.globalAlpha = 0.85;
      if (s) ctx.drawImage(s.c, ix + 3, stripY + 3, 25, 25);   // アトラス欠落アイコンでのクラッシュ防止
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#9ad8ff';
      for (let k = 0; k < run.passives[id]; k++) ctx.fillRect(ix + 3 + k * 4.8, stripY + 31, 4, 2);
      ix += 35;
    }
    if (Object.keys(run.talents).length) ix += 5;
    for (const id in run.talents) {
      const s = G.S.get(G.data.TALENTS[id].icon);
      const lv = run.talents[id];
      let procF = null;
      if (id === 'konpaku') procF = run.talentState.kills / [1, 32, 26, 20][lv];
      else if (id === 'tamayori') procF = run.talentState.souls / [1, 18, 14, 10][lv];
      else if (id === 'utsusemi') procF = 1 - run.talentState.utsusemi / [1, 55, 43, 32][lv];
      ctx.fillStyle = 'rgba(11,9,24,0.86)';
      ctx.fillRect(ix, stripY, 31, 36);
      ctx.strokeStyle = id === 'utsusemi' && procF >= 1 ? '#eef5ff' : '#8e72d8';
      ctx.strokeRect(ix + 0.5, stripY + 0.5, 30, 35);
      ctx.globalAlpha = 0.9;
      if (s) ctx.drawImage(s.c, ix + 3, stripY + 3, 25, 25);   // アトラス欠落アイコンでのクラッシュ防止
      ctx.globalAlpha = 1;
      if (procF !== null) {
        ctx.fillStyle = '#201836';
        ctx.fillRect(ix + 3, stripY + 27, 25, 3);
        ctx.fillStyle = id === 'utsusemi' && procF >= 1 ? '#eef5ff' : '#b79cff';
        ctx.fillRect(ix + 3, stripY + 27, 25 * G.clamp(procF, 0, 1), 3);
      }
      ctx.fillStyle = '#b79cff';
      for (let k = 0; k < lv; k++) ctx.fillRect(ix + 3 + k * 7.8, stripY + 31, 7, 2);
      ix += 35;
    }

    // --- active night pact / earned seals ---
    if (run.ordeal) {
      const o = run.ordeal;
      const pw = 286, px = W - pw - 14, py = 244;   // ミニマップ+討伐パネルの下へ(被り回避)
      hudPanel(ctx, px, py, pw, 58, o.cfg.color);
      ctx.textAlign = 'left';
      ctx.font = `bold 13px ${HUD_FONT}`;
      ctx.fillStyle = o.cfg.color;
      ctx.fillText(`夜契 ${o.cfg.name}`, px + 10, py + 21);
      ctx.textAlign = 'right';
      ctx.font = `bold 17px ${HUD_FONT}`;
      ctx.fillStyle = o.time < 10 ? '#ff6b50' : '#f2ecd9';
      ctx.fillText(Math.max(0, Math.ceil(o.time)) + '秒', px + pw - 10, py + 23);
      const pf = o.cfg.goal ? o.progress / o.cfg.goal : 0;
      hudBar(ctx, px + 10, py + 31, pw - 20, 10, pf, o.cfg.color, 10);
      ctx.textAlign = 'left';
      ctx.font = `bold 11px ${HUD_FONT}`;
      ctx.fillStyle = '#b9c4dc';
      const unit = o.cfg.objective === 'combo' ? '連' : o.cfg.objective === 'nohit' ? '秒' : '';
      ctx.fillText(`${Math.min(o.progress, o.cfg.goal)} / ${o.cfg.goal}${unit}`, px + 10, py + 53);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#7f8ca8';
      ctx.fillText(o.cfg.rewardText, px + pw - 10, py + 53);
    } else if (run.pactSeals && run.pactSeals.length) {
      const pw = 138, px = W - pw - 14, py = 244;   // ミニマップ+討伐パネルの下へ(被り回避)
      hudPanel(ctx, px, py, pw, 34, '#ffd166');
      ctx.textAlign = 'left';
      ctx.font = `bold 11px ${HUD_FONT}`;
      ctx.fillStyle = '#aebbd5';
      ctx.fillText('契 印', px + 9, py + 22);
      ctx.textAlign = 'right';
      ctx.font = `bold 18px ${HUD_FONT}`;
      ctx.fillStyle = '#ffd166';
      ctx.fillText(String(run.pactSeals.length), px + pw - 10, py + 24);
    }

    // --- active blessings ---
    let bx = 14;
    for (const k in run.buffs) {
      const tleft = run.buffs[k];
      if (tleft <= 0) continue;
      const cfg = G.data.BUFFS[k];
      const s = G.S.get('buff_' + k);
      const pulse = tleft < 2 ? (Math.floor(run.t * 8) % 2 ? 0.45 : 1) : 1;   // blink when expiring
      ctx.globalAlpha = pulse;
      if (s) ctx.drawImage(s.c, bx, 148, 28, 28);
      ctx.globalAlpha = 1;
      hudBar(ctx, bx + 1, 177, 26, 5, tleft / cfg.dur, cfg.color, 0);
      bx += 34;
    }

    // --- current lantern sigil / charge ---
    const maxStage = G.data.LAMP.dwellStages.length;
    if ((run.lampAura && run.lampAura.id && run.lampAura.lamp) || (run.lampStage > 0 && run.lampLastId)) {
      const inLamp = !!(run.lampAura && run.lampAura.id && run.lampAura.lamp);
      const sigId = run.lampAura.id || run.lampLastId;   // 灯り外の減衰中は直近の灯火で表示
      const cfg = G.data.LAMP_SIGILS[sigId];
      const atMax = run.lampStage >= maxStage && run.lampMaxHoldT > 0;
      const lw = 178, lx = 14, ly = 190;
      const lh = atMax ? 55 : 50;
      hudPanel(ctx, lx, ly, lw, lh, cfg.color);
      ctx.textAlign = 'left';
      ctx.font = `bold 15px ${HUD_FONT}`;
      ctx.fillStyle = cfg.color;
      ctx.fillText(`${cfg.kanji} ${cfg.name}${run.lampStage > 0 ? ' ' + '★'.repeat(run.lampStage) : ''}`, lx + 9, ly + 18);
      ctx.font = `bold 10px ${HUD_FONT}`;
      ctx.fillStyle = inLamp ? '#aebbd5' : '#8b94a8';
      const bonus = sigId === 'koubou' ? '祓力' : sigId === 'seiran' ? '発動・吸引' : '回復・防御';
      ctx.fillText(inLamp ? bonus : bonus + ' ▼減衰', lx + 9, ly + 33);
      if (atMax) {
        // 最大効力の残り持続: 尽きると燃え尽き → 一時停止。残りで色が冷める
        const frac = run.lampMaxHoldT / G.data.LAMP.maxHold;
        const warm = frac > 0.35 ? cfg.color : '#ff7a52';
        ctx.font = `bold 9px ${HUD_FONT}`;
        ctx.fillStyle = warm;
        ctx.fillText(`最大効力 残り ${run.lampMaxHoldT.toFixed(1)}s`, lx + 9, ly + 49);
        hudBar(ctx, lx + 96, ly + 42, 72, 7, frac, warm, 7);
      } else {
        // 滞在ゲージ: 次の★まであと何割か。灯り中=灯火色で伸び、灯り外=灰色で縮む(減衰が見える)
        const ds = G.data.LAMP.dwellStages;
        const st = run.lampStage;
        const prevT = st > 0 ? ds[st - 1] : 0;
        const nextT = ds[st] || ds[ds.length - 1];
        const frac = (run.lampDwell - prevT) / Math.max(1, nextT - prevT);
        hudBar(ctx, lx + 9, ly + 39, lw - 18, 6, frac, inLamp ? cfg.color : '#6f7a92', 0);
      }
    }

    // --- player overhead hp (only when hurt) ---
    if (p.alive && p.hp < p.stats.maxHp) {
      const [sx, sy] = G.cam.w2s(p.x, p.y);
      ctx.fillStyle = 'rgba(8,10,18,0.7)';
      ctx.fillRect(sx - 17, sy + 22, 34, 4.5);
      ctx.fillStyle = '#e8543c';
      ctx.fillRect(sx - 16.5, sy + 22.5, 33 * hf, 3.5);
    }

    // --- low HP warning: breathing red edge ---
    // 縁だけ染めて中央 (戦闘エリア) は素通し — 敵弾の視認性を奪わない
    if (p.alive && hf < 0.35) {
      const sev = (0.35 - hf) / 0.35;
      const a = G.clamp((0.10 + 0.08 * Math.sin(run.t * 5.5)) * (0.4 + sev), 0, 0.3);
      const grd = ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.86);
      grd.addColorStop(0, 'rgba(170,25,15,0)');
      grd.addColorStop(0.6, `rgba(170,25,15,${(a * 0.3).toFixed(3)})`);
      grd.addColorStop(1, `rgba(170,25,15,${a.toFixed(3)})`);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);
    }

    // --- boss bar ---
    if (run.boss && !run.boss.dead) {
      const b = run.boss;
      const bw = 520;
      const bbx = (W - bw) / 2, by = H - 78;
      hudPanel(ctx, bbx - 10, by - 26, bw + 20, 52, '#ff5a4a');
      ctx.textAlign = 'center';
      const rank = b.bossRankInfo || (G.data.BOSS_RANKS && G.data.BOSS_RANKS[b.cfg.rank || 1]);
      const rankText = rank ? `${rank.mark}ノ格・${rank.name}` : '大妖';
      const bossLabel = `${rankText}  ${b.bossAscend ? `《${b.bossAscend}》` : ''}${b.cfg.name}`;
      ctx.font = `bold ${bossLabel.length > 20 ? 14 : 16}px ${HUD_FONT}`;
      ctx.fillStyle = rank ? rank.color : '#ffd9cb';
      ctx.fillText(bossLabel, W / 2, by - 7);
      const bf = G.clamp(b.hp / b.maxHp, 0, 1);
      hudBar(ctx, bbx, by, bw, 13, bf, '#e44836', 20);
      ctx.textAlign = 'right';
      ctx.font = `bold 11px ${HUD_FONT}`;
      ctx.fillStyle = '#ffd9cb';
      ctx.fillText(`${Math.ceil(b.hp)} / ${b.maxHp}`, bbx + bw, by - 7);
    }

    // --- 奥義ゲージ (bottom center, 編成した奥義の色と名で) ---
    if (run !== cueRun) { cueRun = run; skillReadyPrev = true; ultReadyPrev = false; }
    const u = run.ult;
    if (u && u.need && p.alive) {
      const ucfg = G.data.ULTS[u.id];
      const gw = 252, gx = (W - gw) / 2, gy = H - 25;
      const uf = G.clamp(u.charge / u.need, 0, 1);
      hudPanel(ctx, gx - 8, gy - 24, gw + 16, 43, ucfg.color);
      ctx.globalAlpha = uf >= 1 ? 0.72 + Math.sin(run.t * 8) * 0.28 : 0.8;
      hudBar(ctx, gx, gy, gw, 12, uf, ucfg.color, 16);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      ctx.font = `bold ${uf >= 1 ? 15 : 13}px ${HUD_FONT}`;
      ctx.fillStyle = uf >= 1 ? ucfg.color : '#b5bfd7';
      ctx.fillText(uf >= 1 && !G.IS_TOUCH ? `${ucfg.name}  [SPACE]` : ucfg.name, W / 2, gy - 7);
      // 進捗の数字 (満タン前のみ)
      if (uf < 1) {
        ctx.textAlign = 'right';
        ctx.font = `bold 11px ${HUD_FONT}`;
        ctx.fillStyle = '#d5def2';
        ctx.fillText(`${u.charge}/${u.need}`, gx + gw, gy - 7);
      }
      // 満ちた瞬間の合図
      const ultReady = uf >= 1;
      if (ultReady && !ultReadyPrev) {
        G.audio.sfx('gong');
        G.fx.ring(p.x, p.y - 6, { r0: 10, r1: 70, life: 0.4, color: ucfg.color, width: 3 });
      }
      ultReadyPrev = ultReady;
    }

    // --- 翔(共通ダッシュ) チップ (奥義ゲージの左 ・ SHIFT) ---
    if (p.alive) {
      const cw = 62, chh = 48;
      const cx2 = (W - 252) / 2 - cw - 18, cy2 = H - 7 - chh;
      const dcd = G.data.DASH_CD || 4.5, dT = run.dashCdT || 0;
      const ready = dT <= 0;
      hudPanel(ctx, cx2, cy2, cw, chh, ready ? '#8fcfff' : '#48536c');
      ctx.textAlign = 'center';
      if (ready) {
        ctx.font = `bold 27px ${HUD_FONT}`;
        ctx.globalAlpha = 0.8 + Math.sin(run.t * 6) * 0.2;
        ctx.fillStyle = '#8fcfff';
        ctx.fillText('翔', cx2 + cw / 2, cy2 + 34);
        ctx.globalAlpha = 1;
      } else {
        const f = 1 - dT / dcd;
        ctx.fillStyle = '#242d45';
        ctx.fillRect(cx2 + 4, cy2 + 5 + (chh - 9) * (1 - f), cw - 8, (chh - 9) * f);
        ctx.font = `bold 12px ${HUD_FONT}`; ctx.fillStyle = '#9ca8c2';
        ctx.fillText('翔', cx2 + cw / 2, cy2 + 17);
        ctx.font = `bold 19px ${HUD_FONT}`; ctx.fillStyle = '#e8e2d0';
        ctx.fillText(dT >= 9.95 ? String(Math.ceil(dT)) : dT.toFixed(1), cx2 + cw / 2, cy2 + 39);
      }
      if (!G.IS_TOUCH) {
        ctx.font = `bold 10px ${HUD_FONT}`; ctx.fillStyle = '#d4ddf0';
        ctx.fillText('SHIFT', cx2 + cw / 2, cy2 - 5);
      }
    }

    // --- 技チップ (奥義ゲージの右 ・ Q ・ 残り秒数を大きく) ---
    const sk = run.skill;
    if (sk && p.alive) {
      const scfg = G.data.SKILLS[sk.id];
      const cw = 62, chh = 48;
      const wx = (W + 252) / 2 + 18, wy = H - 7 - chh;
      const ready = sk.cdT <= 0;
      hudPanel(ctx, wx, wy, cw, chh, sk.shield ? '#ffd166' : ready ? scfg.color : '#48536c');
      ctx.textAlign = 'center';
      if (ready) {
        ctx.font = `bold 27px ${HUD_FONT}`;
        ctx.globalAlpha = 0.8 + Math.sin(run.t * 6) * 0.2;
        ctx.fillStyle = scfg.color;
        ctx.fillText(scfg.kanji, wx + cw / 2, wy + 34);
        ctx.globalAlpha = 1;
      } else {
        const f = 1 - sk.cdT / sk.eff.cd;
        ctx.fillStyle = '#242d45';
        ctx.fillRect(wx + 4, wy + 5 + (chh - 9) * (1 - f), cw - 8, (chh - 9) * f);
        ctx.font = `bold 12px ${HUD_FONT}`; ctx.fillStyle = '#9ca8c2';
        ctx.fillText(scfg.kanji, wx + cw / 2, wy + 17);
        ctx.font = `bold 19px ${HUD_FONT}`; ctx.fillStyle = '#e8e2d0';
        ctx.fillText(sk.cdT >= 9.95 ? String(Math.ceil(sk.cdT)) : sk.cdT.toFixed(1), wx + cw / 2, wy + 39);
      }
      if (!G.IS_TOUCH) {
        ctx.font = `bold 10px ${HUD_FONT}`; ctx.fillStyle = '#d4ddf0';
        ctx.fillText('Q', wx + cw / 2, wy - 5);
      }
      if (ready && !skillReadyPrev) {
        G.audio.sfx('reveal');
        G.fx.ring(p.x, p.y - 6, { r0: 6, r1: 44, life: 0.3, color: scfg.color, width: 2.5 });
      }
      skillReadyPrev = ready;
    }

    // 結界札は技化(D.SKILLS.kekkai)。独立枠は廃止し、装備中は技[Q]枠に「結」として表示される。

    // --- treasure compass: chests are always pointed at ---
    for (const c of run.chests) {
      if (c.opened) continue;
      const dxw = c.x - p.x, dyw = c.y - p.y;
      const dist = Math.hypot(dxw, dyw) || 1;
      if (G.cam.onScreen(c.x, c.y, -30)) {
        // visible: bouncing marker above the chest
        const [sx, sy] = G.cam.w2s(c.x, c.y);
        const bobm = Math.sin(run.t * 4.5) * 3.5;
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.moveTo(sx, sy - 36 + bobm);
        ctx.lineTo(sx - 5.5, sy - 45 + bobm);
        ctx.lineTo(sx + 5.5, sy - 45 + bobm);
        ctx.closePath(); ctx.fill();
      } else {
        // 画面外: プレイヤーの周りのリング上に方角マーカー (端だと視界に入らない)
        const nx = dxw / dist, ny = dyw / dist;
        const [psx, psy] = G.cam.w2s(p.x, p.y);
        const R = 96;
        const ex = psx + nx * R, ey = psy + ny * R;
        const pulse = 0.62 + Math.sin(run.t * 5 + c.t) * 0.25;
        ctx.globalAlpha = pulse;
        const s = G.S.get('chest');
        ctx.drawImage(s.c, ex - 11, ey - 13, 22, 22);
        ctx.save();
        ctx.translate(ex + nx * 17, ey + ny * 17);
        ctx.rotate(Math.atan2(ny, nx));
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.moveTo(9, 0); ctx.lineTo(-2.5, -6); ctx.lineTo(-2.5, 6);
        ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.font = 'bold 13px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd166';
        ctx.fillText(Math.round(dist / 32) + '間', ex, ey + 23);
        ctx.globalAlpha = 1;
      }
    }

    // --- 灯しの方位: 未点灯の提灯が画面に無いとき、最寄りの「消えた提灯」へ方角マーカー (灯しに行く誘導) ---
    if (p.alive && run.toros.length) {
      const v = G.cam.view();
      const mL = v.l - 110, mT = v.t - 110;
      const mR = v.l + W / v.z + 110, mB = v.t + H / v.z + 110;
      let anyVisible = false, near = null, nd = Infinity;
      for (const t of run.toros) {
        if (!t.dead) continue;   // 点いている提灯は誘導不要 → 消えている提灯だけ案内
        if (t.x >= mL && t.x <= mR && t.y >= mT && t.y <= mB) { anyVisible = true; break; }
        const d2 = G.dist2(t.x, t.y, p.x, p.y);
        if (d2 < nd) { nd = d2; near = t; }
      }
      if (!anyVisible && near) {
        const dxw = near.x - p.x, dyw = near.y - p.y;
        const dist = Math.hypot(dxw, dyw) || 1;
        const nx = dxw / dist, ny = dyw / dist;
        const [psx, psy] = G.cam.w2s(p.x, p.y);
        const R = 112;
        const ex = psx + nx * R, ey = psy + ny * R;
        const pulse = 0.55 + Math.sin(run.t * 4) * 0.22;
        ctx.globalAlpha = pulse;
        const s = G.S.get('toro');
        ctx.drawImage(s.c, ex - 10, ey - 13, 20, 24);
        ctx.save();
        ctx.translate(ex + nx * 18, ey + ny * 18);
        ctx.rotate(Math.atan2(ny, nx));
        ctx.fillStyle = '#ffce8c';
        ctx.beginPath();
        ctx.moveTo(9, 0); ctx.lineTo(-2.5, -6); ctx.lineTo(-2.5, 6);
        ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.font = 'bold 13px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffce8c';
        ctx.fillText(Math.round(dist / 32) + '間', ex, ey + 24);
        ctx.globalAlpha = 1;
      }
    }

    // --- announcements ---
    if (!curAnn && announceQ.length) {
      curAnn = announceQ.shift();
      curAnn.t = 0;
    }
    if (curAnn) {
      curAnn.t += dt;
      // 戦闘中の視界を塞がないよう、雑多な報せは小さく・短く・半透明。ボスの報せだけは残す
      const dur = curAnn.boss ? 3.1 : 1.8;
      if (curAnn.t > dur) { curAnn = null; }
      else {
        const a = Math.min(1, curAnn.t * 3.4, (dur - curAnn.t) * 2.6) * (curAnn.boss ? 1 : 0.82);
        ctx.globalAlpha = a;
        const py = 100;                                  // 上部HUDのすぐ下に退避 (中央の戦闘域を空ける)
        const hasSub = !!curAnn.sub;
        const ph = curAnn.boss ? 58 : (hasSub ? 56 : 38);   // sub有りは縦に余裕を持たせ、星(★)と説明文の被りを防ぐ
        const plaqueW = curAnn.boss ? 404 : 270;
        hudPanel(ctx, W / 2 - plaqueW / 2, py, plaqueW, ph, curAnn.boss ? '#ff5a4a' : '#ffd166');
        ctx.textAlign = 'center';
        const mf = curAnn.boss ? 26 : 19;
        const my = py + (curAnn.boss ? 33 : (hasSub ? 25 : 26));
        ctx.font = `bold ${mf}px ${HUD_FONT}`;
        ctx.fillStyle = '#03050b';
        ctx.fillText(curAnn.main, W / 2 + 2, my + 2);
        ctx.fillStyle = curAnn.boss ? '#ff7a5c' : '#f2ecd9';
        ctx.fillText(curAnn.main, W / 2, my);
        if (curAnn.boss && run.boss && !run.boss.dead) {
          const bs = G.S.get(run.boss.cfg.spr + '_0');
          if (bs) {
            const bh = 66;
            const bw = bs.w * (bh / bs.h);
            ctx.globalAlpha = a * 0.88;
            ctx.drawImage(bs.c, W / 2 - plaqueW / 2 - bw - 10, py - 10, bw, bh);
            ctx.globalAlpha = a;
          }
        }
        if (curAnn.sub) {
          ctx.font = `bold 12px ${HUD_FONT}`;
          ctx.fillStyle = '#b9c4dc';
          ctx.fillText(curAnn.sub, W / 2, py + ph - 13);
        }
        ctx.globalAlpha = 1;
      }
    }

    // --- muted indicator ---
    if (G.audio.muted) {
      ctx.textAlign = 'right';
      ctx.font = `bold 11px ${HUD_FONT}`;
      ctx.fillStyle = '#8390aa';
      ctx.fillText('MUTE [M]', W - 12, H - 12);
    }

    // --- touch stick --- (client 座標 → VIEW 座標へ正確に写像、レターボックスずれを補正)
    const tc = G.input.touch;
    if (tc) {
      const r = G.engine.canvas.getBoundingClientRect();
      const sx = G.VIEW_W / r.width, sy = G.VIEW_H / r.height;
      const ox = (tc.ox - r.left) * sx, oy = (tc.oy - r.top) * sy;
      const dxv = tc.dx * sx, dyv = tc.dy * sy;
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = '#e8e2d0';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ox, oy, 42, 0, G.TAU); ctx.stroke();
      const m = Math.hypot(dxv, dyv) || 1;
      const cl = Math.min(m, 42);
      ctx.globalAlpha = 0.4;
      ctx.beginPath(); ctx.arc(ox + dxv / m * cl, oy + dyv / m * cl, 15, 0, G.TAU);
      ctx.fillStyle = '#e8e2d0';
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // --- オンスクリーン操作の状態同期 ---
    if (G.IS_TOUCH) UI.updateTouchHud(run);

    // --- debug overlay ---
    if (G.debug.show) {
      ctx.textAlign = 'left';
      ctx.font = '12px Consolas, monospace';
      ctx.fillStyle = '#7ee8a0';
      ctx.fillText(
        `fps ${G.engine.fps.toFixed(0)}  en ${run.en.act.length}  pr ${run.pr.act.length}  gem ${run.gem.act.length}  fx ${G.fx.parts.act.length}  x${G.debug.timescale}`,
        12, H - 12
      );
    }
  };

  // ---------------- オンスクリーン操作の状態同期 ----------------
  // run 中のみ表示。奥義=討伐ゲージ(リング)、技=クールタイム(扇)を毎フレーム反映。
  UI.updateTouchHud = run => {
    const layer = els.touch;
    if (!layer) return;
    const show = G.main.state === 'run' && run && run.player.alive;
    if (layer._on !== show) { layer._on = show; layer.classList.toggle('on', show); }
    if (!show) return;

    const u = run.ult;
    if (u && u.need) {
      const ucfg = G.data.ULTS[u.id];
      const uf = G.clamp(u.charge / u.need, 0, 1);
      const b = els.tbUlt;
      b.style.setProperty('--c', ucfg.color);
      b.style.setProperty('--f', uf.toFixed(3));
      if (els.tbUltK.textContent !== ucfg.kanji) els.tbUltK.textContent = ucfg.kanji;
      b.classList.toggle('ready', uf >= 1);
    }

    const s = run.skill;
    if (s) {
      const scfg = G.data.SKILLS[s.id];
      const ready = s.cdT <= 0;
      const b = els.tbSkill;
      b.style.setProperty('--c', scfg.color);
      b.style.setProperty('--cd', (ready ? 0 : G.clamp(s.cdT / s.eff.cd, 0, 1)).toFixed(3));
      if (els.tbSkillK.textContent !== scfg.kanji) els.tbSkillK.textContent = scfg.kanji;
      els.tbSkillCd.textContent = ready ? '' : (s.cdT >= 9.95 ? String(Math.ceil(s.cdT)) : s.cdT.toFixed(1));
      b.classList.toggle('ready', ready);
      b.classList.toggle('shield', !!s.shield);
    }
  };

  return UI;
})();
