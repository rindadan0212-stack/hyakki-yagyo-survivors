/* 百鬼夜行サバイバーズ — engine: canvas, input, camera, particles, fx */
'use strict';

// ---------------- canvas ----------------
G.engine = (() => {
  const E = {};

  E.canvas = null;
  E.ctx = null;
  E.RS = 1;            // backing resolution scale (dpr, adaptive)
  E.fps = 60;

  E.setup = () => {
    E.canvas = document.getElementById('game');
    E.ctx = E.canvas.getContext('2d');
    E.ctx.imageSmoothingEnabled = false;
    E.light = document.createElement('canvas');   // darkness overlay
    E.lctx = E.light.getContext('2d');
    E.bloom = document.createElement('canvas');   // low-resolution glow buffer
    E.bctx = E.bloom.getContext('2d');
    E.bloom.width = Math.round(G.VIEW_W * 0.375);
    E.bloom.height = Math.round(G.VIEW_H * 0.375);
    E.bloomFrame = 0;
    E.bloomReady = false;
    E.applyRes(Math.min(window.devicePixelRatio || 1, 1.5));
  };

  E.applyRes = rs => {
    E.RS = rs;
    E.canvas.width = Math.round(G.VIEW_W * rs);
    E.canvas.height = Math.round(G.VIEW_H * rs);
    E.light.width = E.canvas.width;
    E.light.height = E.canvas.height;
    E.ctx.imageSmoothingEnabled = false;
    E.lctx.imageSmoothingEnabled = false;
    E.bctx.imageSmoothingEnabled = true;
  };

  // adaptive: drop to 1.0 backing scale if fps stays low
  let lowT = 0;
  E.adapt = dt => {
    const inst = 1 / Math.max(dt, 1e-4);
    E.fps = E.fps * 0.95 + inst * 0.05;
    if (E.RS > 1.01) {
      lowT = E.fps < 45 ? lowT + dt : 0;
      if (lowT > 4) { E.applyRes(1); lowT = 0; }
    }
  };

  return E;
})();

// ---------------- input ----------------
G.input = (() => {
  const I = { keys: new Set(), touch: null };

  const DIRKEYS = {
    KeyW: [0, -1], ArrowUp: [0, -1],
    KeyS: [0, 1], ArrowDown: [0, 1],
    KeyA: [-1, 0], ArrowLeft: [-1, 0],
    KeyD: [1, 0], ArrowRight: [1, 0],
  };

  I.bind = (onKey) => {
    window.addEventListener('keydown', e => {
      if (e.code in DIRKEYS || e.code === 'Space') e.preventDefault();
      if (!e.repeat) {
        I.keys.add(e.code);
        onKey(e.code);
      }
    });
    window.addEventListener('keyup', e => I.keys.delete(e.code));
    window.addEventListener('blur', () => I.keys.clear());

    // floating move-stick: 画面左寄り (~左 62%) のドラッグだけ拾う。
    // 右側はオンスクリーンのアクションボタン領域として空けておく。
    const cv = G.engine.canvas;
    cv.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      const r = cv.getBoundingClientRect();
      if (e.clientX > r.left + r.width * 0.62) return;
      I.touch = { id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
    });
    window.addEventListener('pointermove', e => {
      if (I.touch && e.pointerId === I.touch.id) {
        I.touch.dx = e.clientX - I.touch.ox;
        I.touch.dy = e.clientY - I.touch.oy;
      }
    });
    const endTouch = e => { if (I.touch && e.pointerId === I.touch.id) I.touch = null; };
    window.addEventListener('pointerup', endTouch);
    window.addEventListener('pointercancel', endTouch);

    // マウス照準: canvas 上のカーソル位置を VIEW 座標で保持
    window.addEventListener('mousemove', e => {
      const r = cv.getBoundingClientRect();
      I.mouse.sx = (e.clientX - r.left) * (G.VIEW_W / r.width);
      I.mouse.sy = (e.clientY - r.top) * (G.VIEW_H / r.height);
      I.mouse.at = performance.now();
    });
  };

  I.mouse = { sx: 0, sy: 0, at: -1e9 };
  // カーソルのワールド座標。4 秒動かなければ null (キーボード照準に戻る)
  I.mouseWorld = () => {
    if (I.touch || performance.now() - I.mouse.at > 4000) return null;
    const v = G.cam.view();
    return [v.l + I.mouse.sx / v.z, v.t + I.mouse.sy / v.z];
  };

  I.axis = () => {
    let x = 0, y = 0;
    for (const k of I.keys) {
      const d = DIRKEYS[k];
      if (d) { x += d[0]; y += d[1]; }
    }
    if (I.touch) {
      const m = Math.hypot(I.touch.dx, I.touch.dy);
      if (m > 12) { x += I.touch.dx / m; y += I.touch.dy / m; }
    }
    if (x || y) {
      const m = Math.hypot(x, y);
      return [x / m, y / m];
    }
    return [0, 0];
  };

  return I;
})();

// ---------------- camera ----------------
G.cam = {
  x: 0, y: 0, shake: 0, ox: 0, oy: 0, zoom: G.ZOOM,
  follow(px, py, dt) {
    const k = 1 - Math.exp(-8 * dt);
    this.x += (px - this.x) * k;
    this.y += (py - this.y) * k;
    // 常時ズーム G.ZOOM を基準に落ち着く (パンチ演出はその上に乗る)。
    // ただしボス戦中だけ引く(巨大なボスが画面の55〜79%を占め、追従カメラで上端が見切れるため全身を収める)。
    const bossActive = G.run && G.run.boss && !G.run.boss.dead;
    const targetZoom = G.ZOOM * (bossActive ? ((G.data && G.data.BOSS_CAM_ZOOM) || 1) : 1);
    this.zoom += (targetZoom - this.zoom) * (1 - Math.exp(-3.4 * dt));
    if (Math.abs(this.zoom - targetZoom) < 0.001) this.zoom = targetZoom;
    // 有限マップの境界クランプ。壁を画面端に張り付けず、塀の外を少しだけ見せて
    // プレイヤーをなるべく中央に保つ (壁際でキャラが画面端に寄って見づらい問題の対策)。
    // 露出する塀の外は地面タイル + 闇で埋まるので破綻しない (render の drawGround / drawLight)。
    if (G.run) {
      const vhw = (G.VIEW_W / 2) / this.zoom, vhh = (G.VIEW_H / 2) / this.zoom;   // 実ズームで算出(ボス戦の引きでも正しくクランプ)
      const hw = G.MAP_W / 2, hh = G.MAP_H / 2;
      const padX = vhw * 0.34, padY = vhh * 0.42;   // 塀の外を見せる許容量 (中央寄せの強さ)
      this.x = hw > vhw ? G.clamp(this.x, -hw + vhw - padX, hw - vhw + padX) : 0;
      this.y = hh > vhh ? G.clamp(this.y, -hh + vhh - padY, hh - vhh + padY) : 0;
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 30);   // 速い減衰 = 衝撃の間に必ず落ち着く
      this.ox = G.rand(-this.shake, this.shake);
      this.oy = G.rand(-this.shake, this.shake);
    } else { this.ox = 0; this.oy = 0; }
  },
  add(v) { if (!G.opts.shake) return; this.shake = Math.min(10, this.shake + v); },   // 見やすさ: 揺れOFFで無効
  punch(z) { this.zoom = Math.max(this.zoom, G.ZOOM * z); },   // quick zoom-in, decays to G.ZOOM in follow()
  reset(x, y) { this.x = x; this.y = y; this.shake = 0; this.ox = 0; this.oy = 0; this.zoom = G.ZOOM; },
  left() { return this.x - G.VIEW_W / 2 + this.ox; },
  top() { return this.y - G.VIEW_H / 2 + this.oy; },
  // zoom-aware view rect + world→screen mapping (render & light pass share this)
  view() {
    const z = this.zoom;
    return {
      z,
      l: this.x - (G.VIEW_W / 2) / z + this.ox,
      t: this.y - (G.VIEW_H / 2) / z + this.oy,
    };
  },
  w2s(wx, wy) {
    const v = this.view();
    return [(wx - v.l) * v.z, (wy - v.t) * v.z];
  },
  onScreen(x, y, pad = 40) {
    const z = Math.max(0.01, this.zoom);
    return Math.abs(x - this.x) < (G.VIEW_W / 2) / z + pad
      && Math.abs(y - this.y) < (G.VIEW_H / 2) / z + pad;
  },
};

// ---------------- particles & fx ----------------
G.fx = (() => {
  const F = {};

  F.parts = new G.Pool(() => ({}), 900);
  F.texts = new G.Pool(() => ({}), 110);
  F.bolts = [];               // lightning visuals (short-lived, few)
  F.rings = [];               // expanding shockwave rings
  F.pops = [];                // death pops (white sprite, scale up & fade)
  F.streaks = [];             // directional impact streaks (heft of a hit)
  F.sigils = [];              // ritual diagrams projected onto the ground
  F.columns = [];             // vertical pillars of spirit light
  F.lights = [];              // short-lived colored light sources
  F.anims = [];               // 素材ベースのアニメFX (foozle CC0 連番)。手続きFXに重ねる
  F.animSheets = {};          // name -> [canvas frames] (遅延ロード・失敗時は手続きFXがフォールバック)
  F.flash = 0;                // fullscreen flash alpha
  F.hurtFlash = 0;            // red edge flash when player is hurt
  F.screenPulse = 0;          // chromatic screen-space power pulse
  F.screenColor = '#ffd166';

  F.reset = () => {
    F.parts.clear();
    F.texts.clear();
    F.bolts.length = 0;
    F.rings.length = 0;
    F.pops.length = 0;
    F.streaks.length = 0;
    F.sigils.length = 0;
    F.columns.length = 0;
    F.lights.length = 0;
    F.anims.length = 0;
    F.flash = 0;
    F.hurtFlash = 0;
    F.screenPulse = 0;
  };

  F.ring = (x, y, o = {}) => {
    F.rings.push({
      x, y, t: 0,
      r0: o.r0 || 12, r1: o.r1 || 120,
      life: o.life || 0.4,
      color: o.color || 'rgba(255,224,160,0.9)',
      width: o.width || 3.5,
    });
    if (F.rings.length > 24) F.rings.shift();
  };

  F.pop = (spr, x, y, o = {}) => {
    F.pops.push({ spr, x, y, t: 0, life: o.life || 0.17, scale: o.scale || 1, flip: !!o.flip });
    if (F.pops.length > 48) F.pops.shift();
  };

  // level-up celebration: gold ring + rising spark pillar
  F.levelBurst = (x, y) => {
    F.ring(x, y, { r0: 14, r1: 110, life: 0.45, color: 'rgba(255,215,120,0.95)' });
    F.sigil(x, y + 5, { radius: 50, life: 0.72, color: '#ffd778', accent: '#fff4c9', glyphs: 8 });
    F.column(x, y, { height: 150, width: 28, life: 0.5, color: '#ffe7a3' });
    for (let i = 0; i < 14; i++) {
      part(x + G.rand(-14, 14), y + G.rand(-6, 6), {
        vx: G.rand(-22, 22), vy: G.rand(-260, -120),
        life: G.rand(0.4, 0.75), r: G.rand(1.6, 3.4),
        color: G.chance(0.5) ? 'rgba(255,215,120,0.95)' : 'rgba(255,245,210,0.9)',
        kind: 'spark', drag: 0.97,
      });
    }
  };

  function part(x, y, o) {
    const p = F.parts.obtain();
    p.x = x; p.y = y;
    p.vx = o.vx || 0; p.vy = o.vy || 0;
    p.life = p.maxLife = o.life || 0.5;
    p.r = o.r || 2;
    p.color = o.color || '#fff';
    p.kind = o.kind || 'spark';
    p.grav = o.grav || 0;
    p.drag = o.drag !== undefined ? o.drag : 0.9;
    return p;
  }

  F.spark = (x, y, color, n = 6, spd = 120, life = 0.35) => {
    for (let i = 0; i < n; i++) {
      const a = G.rand(G.TAU), s = G.rand(spd * 0.3, spd);
      part(x, y, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: G.rand(life * 0.6, life), r: G.rand(1.2, 2.6), color, kind: 'spark' });
    }
  };
  F.soul = (x, y, n = 4) => {
    for (let i = 0; i < n; i++) {
      part(x + G.rand(-6, 6), y + G.rand(-6, 6), {
        vx: G.rand(-14, 14), vy: G.rand(-65, -30),
        life: G.rand(0.5, 0.9), r: G.rand(2, 4.2),
        color: G.chance(0.4) ? 'rgba(140,235,255,0.8)' : 'rgba(190,210,255,0.55)',
        kind: 'soul', drag: 0.98,
      });
    }
  };
  // shatter debris: short streaks that fly out, tumble and fall — "妖が砕ける"
  F.shards = (x, y, color, n = 6, spd = 130, life = 0.45) => {
    for (let i = 0; i < n; i++) {
      const a = G.rand(G.TAU), s = G.rand(spd * 0.4, spd);
      part(x, y, {
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - G.rand(20, 90),
        life: G.rand(life * 0.55, life), r: G.rand(1.6, 3.4),
        color, kind: 'shard', drag: 0.9,
      });
    }
  };
  // impact streak: a quick bright lance through the hit point along the blow's direction
  F.impact = (x, y, ang, color = 'rgba(255,234,196,0.95)', len = 26, width = 4) => {
    F.streaks.push({ x, y, ang, len, width, color, life: 0.13, maxLife: 0.13 });
    if (F.streaks.length > 30) F.streaks.shift();
    F.light(x, y, { radius: Math.max(32, len * 1.8), life: 0.12, color, intensity: 0.7 });
    if (G.data && G.data.EXPFX && len >= 24) {
      F.burst(x, y, 'premium_slash', {
        sz: Math.min(220, Math.max(70, len * 2.1)),
        dur: 0.2, from: 0.54, to: 0.98,
        rot: ang, alpha: 0.62, add: true,
      });
    }
  };
  F.puffRing = (x, y, color, n = 12, spd = 160) => {
    for (let i = 0; i < n; i++) {
      const a = i / n * G.TAU;
      part(x, y, { vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 0.4, r: 3, color, kind: 'spark', drag: 0.86 });
    }
  };
  F.trail = (x, y, color, r = 2.4, life = 0.3) => {
    part(x, y, { vx: 0, vy: 0, life, r, color, kind: 'fade' });
  };
  F.sigil = (x, y, o = {}) => {
    F.sigils.push({
      x, y, t: 0, life: o.life || 0.65,
      radius: o.radius || 90,
      color: o.color || '#ffd166',
      accent: o.accent || '#fff2c0',
      glyphs: o.glyphs || 8,
      spin: o.spin === undefined ? 0.8 : o.spin,
      fill: o.fill === undefined ? 0.08 : o.fill,
    });
    if (F.sigils.length > 16) F.sigils.shift();
  };
  F.column = (x, y, o = {}) => {
    F.columns.push({
      x, y, t: 0, life: o.life || 0.55,
      height: o.height || 190,
      width: o.width || 42,
      color: o.color || '#ffe2a0',
    });
    if (F.columns.length > 10) F.columns.shift();
  };
  F.light = (x, y, o = {}) => {
    F.lights.push({
      x, y,
      life: o.life || 0.25,
      maxLife: o.life || 0.25,
      radius: o.radius || 90,
      color: o.color || '#ffd166',
      intensity: o.intensity === undefined ? 0.65 : o.intensity,
      core: o.core === undefined ? 0.24 : o.core,
    });
    if (F.lights.length > 32) F.lights.shift();
  };
  F.powerBurst = (x, y, o = {}) => {
    const color = o.color || '#ffd166';
    const accent = o.accent || '#fff4d0';
    const radius = o.radius || 150;
    F.sigil(x, y + 5, {
      radius: radius * 0.52, life: o.life || 0.75,
      color, accent, glyphs: o.glyphs || 8,
      spin: o.spin === undefined ? 1 : o.spin,
      fill: o.fill,
    });
    if (o.column !== false) F.column(x, y, {
      height: o.height || radius * 1.35,
      width: o.width || Math.max(26, radius * 0.2),
      life: Math.min(0.8, (o.life || 0.75) * 0.8),
      color: accent,
    });
    F.ring(x, y, {
      r0: Math.max(8, radius * 0.08), r1: radius,
      life: o.life || 0.62, color, width: o.ringWidth || 4,
    });
    F.puffRing(x, y, color, o.particles || 14, radius * 1.8);
    F.spark(x, y - 8, accent, o.sparks || 10, radius * 1.25, 0.42);
    F.light(x, y - 8, {
      radius: radius * 0.82, life: Math.min(1, o.life || 0.75),
      color, intensity: Math.min(1, 0.56 + (o.screen || 0.34) * 0.45), core: 0.3,
    });
    if (G.data && G.data.EXPFX) {
      const c = String(color).toLowerCase();
      const warm = c.includes('ffd') || c.includes('ffe') || c.includes('255,209') || c.includes('255,214') || c.includes('255,224');
      const violet = c.includes('b07') || c.includes('177,140') || c.includes('purple') || c.includes('violet');
      const cool = c.includes('8fc') || c.includes('154,216') || c.includes('110,216') || c.includes('blue') || c.includes('cyan');
      const fxName = o.premium || (violet ? 'premium_curse' : cool ? 'premium_shockwave' : warm ? 'premium_lampburst' : 'premium_holy_nova');
      F.burst(x, y, fxName, {
        sz: Math.max(120, radius * 1.55),
        dur: Math.min(0.85, Math.max(0.42, o.life || 0.62)),
        from: 0.46, to: 1.12,
        spin: violet ? 1.2 : 0,
        alpha: 0.84,
        add: true,
      });
    }
    F.screenPulse = Math.max(F.screenPulse, o.screen || 0.34);
    F.screenColor = color;
  };
  // 会心: 金の星形バースト。既存プリミティブを束ねるだけ (新規描画コード不要)。
  // mag 0..1 = 一撃の重さ。重いほど大きく派手に弾ける。
  F.crit = (x, y, mag = 0.5) => {
    const gold = 'rgba(255,209,102,0.96)';
    const hot = 'rgba(255,248,218,0.96)';
    const s = 0.8 + mag * 1.0;
    F.ring(x, y, { r0: 5, r1: 40 * s, life: 0.32, color: gold, width: 2.5 + mag * 2.5 });
    // 十字＋斜めの四閃 = 急所を穿つ手応え
    for (let k = 0; k < 4; k++) {
      F.impact(x, y, k * Math.PI / 2 + Math.PI / 4, hot, 24 * s, 2.5 + mag * 2);
    }
    F.spark(x, y, gold, 7 + (mag * 9 | 0), 230 * s, 0.42);
    F.spark(x, y, hot, 3 + (mag * 5 | 0), 150 * s, 0.3);
    F.light(x, y, { radius: 46 * s, life: 0.15, color: gold, intensity: 0.55 + mag * 0.35, core: 0.32 });
    if (G.data && G.data.EXPFX && mag > 0.35) {
      F.burst(x, y, 'premium_shockwave', { sz: 78 * s, dur: 0.22, from: 0.42, to: 1.08, alpha: 0.62, add: true });
    }
  };

  // rising ember (buff auras, combo fire)
  F.ember = (x, y, color) => {
    part(x + G.rand(-13, 13), y + G.rand(-5, 5), {
      vx: G.rand(-14, 14), vy: G.rand(-95, -40),
      life: G.rand(0.4, 0.8), r: G.rand(1.4, 2.8),
      color, kind: 'spark', drag: 0.98,
    });
  };
  F.ambient = (camx, camy) => {
    const stage = G.run ? G.run.stage.id : 'mori';
    // Stage-specific atmosphere, kept sparse so late-game combat remains legible.
    if (stage === 'mori' && G.chance(0.07)) {
      part(camx + G.rand(-G.VIEW_W / 2, G.VIEW_W / 2), camy + G.rand(-G.VIEW_H / 2, G.VIEW_H / 2), {
        vx: G.rand(-8, 8), vy: G.rand(-8, 8), life: G.rand(2, 3.6), r: G.rand(1, 1.8),
        color: 'rgba(190,255,170,0.55)', kind: 'fly', drag: 1,
      });
    }
    if (stage !== 'yomi' && G.chance(stage === 'miyako' ? 0.06 : 0.035)) {
      part(camx + G.rand(-G.VIEW_W / 2, G.VIEW_W / 2), camy - G.VIEW_H / 2 - 10, {
        vx: G.rand(18, 48), vy: G.rand(22, 44), life: G.rand(4, 7), r: G.rand(1.6, 2.6),
        color: stage === 'miyako' ? 'rgba(180,170,235,0.5)' : 'rgba(214,160,190,0.5)',
        kind: 'petal', drag: 1,
      });
    }
    if (stage === 'yomi' && G.chance(0.12)) {
      part(camx + G.rand(-G.VIEW_W / 2, G.VIEW_W / 2), camy + G.rand(-G.VIEW_H / 2, G.VIEW_H / 2), {
        vx: G.rand(-18, 18), vy: G.rand(-34, -12), life: G.rand(2.2, 4.2), r: G.rand(1, 2.2),
        color: G.chance(0.3) ? 'rgba(255,88,62,0.55)' : 'rgba(165,145,155,0.4)',
        kind: G.chance(0.35) ? 'wisp' : 'ash', drag: 0.995,
      });
    }
  };

  F.text = (x, y, str, color = '#fff', size = 13, o = {}) => {
    const t = F.texts.obtain();
    t.x = x + G.rand(-5, 5); t.y = y - 6;
    t.str = str; t.color = color; t.size = size;
    t.crit = !!o.crit;
    t.rise = o.crit ? 58 : 34;          // 会心は勢いよく跳ね上がる
    t.life = t.maxLife = o.crit ? 0.82 : 0.65;
  };

  F.bolt = (x1, y1, x2, y2) => {
    const pts = [[x1, y1]];
    const seg = 7;
    for (let i = 1; i < seg; i++) {
      const t = i / seg;
      pts.push([G.lerp(x1, x2, t) + G.rand(-16, 16), G.lerp(y1, y2, t) + G.rand(-12, 12)]);
    }
    pts.push([x2, y2]);
    F.bolts.push({ pts, life: 0.16, maxLife: 0.16 });
    F.light(x2, y2, { radius: 82, life: 0.18, color: '#b9e7ff', intensity: 0.5, core: 0.3 });
    if (G.data && G.data.EXPFX) {
      const len = Math.hypot(x2 - x1, y2 - y1);
      F.burst(x2, y2, 'premium_lightning', {
        sz: G.clamp(len * 0.36, 92, 260),
        dur: 0.22, from: 0.52, to: 1.02,
        rot: Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2,
        alpha: 0.82, add: true,
      });
    }
    // 雷の白フラッシュは廃止(2026-06-23): bolt は閃光線+局所ライトのみ。全画面フラッシュは一切加えない。
  };

  // 素材ベースのアニメFX(foozle Pixel Magic Effects, CC0)を読み込み、手続きFXに「本物の」爆発等を重ねる。
  // 未ロード/失敗時は F.anim が no-op = 手続きFXがそのまま見える(graceful fallback)。
  F.loadAnims = () => {
    const defs = {
      explode: 7, portal: 10, fireball: 10, wind: 10, tornado: 9, water: 10, water_geyser: 13, rocks: 10, earth_spike: 9, molten_spear: 12,
      lightning: 10, slash: 10, holy: 10, curse: 9, heal: 9, lampburst: 10, ward: 10, foxfire: 10, levelup: 9, awaken: 10,   // GPT製アトラスから切出(tools/slice_fx_atlas.py)
    };
    for (const name in defs) {
      const frames = [];
      for (let i = 0; i < defs[name]; i++) {
        const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
        const img = new Image();
        img.onload = ((c, im) => () => { try { c.getContext('2d').drawImage(im, 0, 0); c._ok = true; } catch (e) {} })(cv, img);
        img.onerror = () => {};
        // 単一ファイル版(build_standalone)では __FX_DATA に data URI を持つ → 通信ゼロでオフライン動作。
        const fxFile = name + '_' + i + '.png';
        img.src = (window.__FX_DATA && window.__FX_DATA[fxFile]) || ('assets/fx/' + fxFile);
        frames.push(cv);
      }
      F.animSheets[name] = frames;
    }
    F.loadExpFx([
      'meteor', 'dark_vortex', 'holy_nova', 'ice_shard', 'shockwave', 'thunder_orb', 'blood_curse',
      'premium_holy_nova', 'premium_lightning', 'premium_slash', 'premium_explosion',
      'premium_dark_vortex', 'premium_water_geyser', 'premium_tornado', 'premium_shockwave',
      'premium_foxfire', 'premium_lampburst', 'premium_heal', 'premium_curse',
      // ComfyUI生成の追加FX(2026-06-30)。主題別に配線して多様化。
      'bell_ring', 'ember_rise', 'frost_burst', 'petal_blade', 'spirit_wisps', 'talisman_burst', 'wind_slash',
      'earth_shatter', 'blood_splash', 'lightning_strike', 'gold_sparkle', 'holy_seal',   // 第3弾
    ]);   // 実験FX/生成プレミアムFX(画像生成素材)
  };
  F.anim = (x, y, name, o = {}) => {
    // 上位(premium)FXがある anim は premium に「置換」する(手続きアニメシートは描かない)。
    // ⚠️以前は両方描いていたため slash/wind 等が二重に見えた。EXPFX OFF 時のみ下の手続きシート版を使う。
    const premium = (G.data && G.data.EXPFX) ? ({
      lightning: ['premium_lightning', 1.25, 0.72, 1.06],
      slash: ['premium_slash', 1.34, 0.58, 0.98],
      holy: ['premium_holy_nova', 1.26, 0.62, 1.05],
      explode: ['premium_explosion', 1.3, 0.62, 1.1],
      portal: ['premium_dark_vortex', 1.18, 0.55, 1.08],
      water: ['premium_water_geyser', 1.04, 0.58, 0.98],
      water_geyser: ['premium_water_geyser', 1.22, 0.62, 1.08],
      tornado: ['premium_tornado', 1.18, 0.64, 1.08],
      wind: ['premium_tornado', 0.82, 0.52, 0.92],
      foxfire: ['premium_foxfire', 1.1, 0.6, 1.02],
      lampburst: ['premium_lampburst', 1.18, 0.6, 1.04],
      heal: ['premium_heal', 1.1, 0.58, 1.0],
      curse: ['premium_curse', 1.15, 0.58, 1.04],
      levelup: ['premium_holy_nova', 1.25, 0.64, 1.08],
      awaken: ['premium_holy_nova', 1.42, 0.68, 1.16],
      ward: ['premium_shockwave', 1.05, 0.55, 1.02],
      // ComfyUI生成FX(2026-06-30): 未対応だった anim に追加カバレッジ(主題が合うもののみ)
      molten_spear: ['ember_rise', 1.22, 0.5, 1.06],
      earth_spike: ['earth_shatter', 1.1, 0.5, 1.04],
      rocks: ['earth_shatter', 0.95, 0.5, 0.98],
    })[name] : null;
    if (premium) {
      const fxName = premium[0], sizeMul = premium[1], from = premium[2], to = premium[3];
      F.burst(x, y, fxName, {
        sz: 64 * (o.scale || 1) * sizeMul,
        dur: Math.max(o.dur || 0.42, 0.32),
        from, to,
        rot: o.rot || 0,
        spin: name === 'portal' || name === 'curse' ? 1.2 : name === 'tornado' || name === 'wind' ? 0.8 : 0,
        alpha: (o.alpha == null ? 1 : o.alpha) * 0.92,
        add: true,
      });
      return;
    }
    const sheet = F.animSheets[name];
    if (!sheet || !sheet.length) return;
    F.anims.push({ name, x, y, scale: o.scale || 1, dur: o.dur || 0.42, t: 0, rot: o.rot || 0, alpha: o.alpha == null ? 1 : o.alpha, add: o.add !== false });
    if (F.anims.length > 70) F.anims.shift();
  };

  // --- 実験FX (ComfyUI生成の1枚絵を拡大+回転+フェードで再生)。D.EXPFX で全体ON/OFF、assets/fx_exp/ に隔離 ---
  F.expImg = {};
  F.expBursts = [];
  F.loadExpFx = (names) => {
    for (const n of names) {
      const img = new Image();
      img.onload = () => { img._ok = true; };
      img.onerror = () => {};
      img.src = (window.__EXPFX_DATA && window.__EXPFX_DATA[n + '.png']) || ('assets/fx_exp/' + n + '.png');
      F.expImg[n] = img;
    }
  };
  F.burst = (x, y, name, o = {}) => {
    if (!F.expImg[name]) return;
    F.expBursts.push({ name, x, y, t: 0, dur: o.dur || 0.5, sz: o.sz || 96,
      from: o.from == null ? 0.4 : o.from, to: o.to == null ? 1.25 : o.to,
      rot: o.rot || 0, spin: o.spin || 0, alpha: o.alpha == null ? 1 : o.alpha, add: o.add !== false });
    if (F.expBursts.length > 60) F.expBursts.shift();
  };

  F.update = h => {
    const P = F.parts;
    for (let i = P.act.length - 1; i >= 0; i--) {
      const p = P.act[i];
      p.life -= h;
      if (p.life <= 0) { P.releaseAt(i); continue; }
      p.x += p.vx * h;
      p.y += p.vy * h;
      if (p.drag !== 1) { p.vx *= Math.pow(p.drag, h * 60); p.vy *= Math.pow(p.drag, h * 60); }
      if (p.kind === 'soul') p.vy -= 26 * h;
      if (p.kind === 'shard') p.vy += 360 * h;   // debris falls
      if (p.kind === 'petal') p.vx += Math.sin(p.life * 3) * 14 * h;
      if (p.kind === 'ash') p.vx += Math.sin(p.life * 4.3) * 9 * h;
      if (p.kind === 'wisp') { p.vx += Math.sin(p.life * 5) * 15 * h; p.vy -= 12 * h; }
      if (p.kind === 'fly') { p.vx += G.rand(-30, 30) * h; p.vy += G.rand(-30, 30) * h; }
    }
    const T = F.texts;
    for (let i = T.act.length - 1; i >= 0; i--) {
      const t = T.act[i];
      t.life -= h;
      if (t.life <= 0) { T.releaseAt(i); continue; }
      t.y -= (t.rise || 34) * h;
    }
    for (let i = F.bolts.length - 1; i >= 0; i--) {
      F.bolts[i].life -= h;
      if (F.bolts[i].life <= 0) F.bolts.splice(i, 1);
    }
    for (let i = F.anims.length - 1; i >= 0; i--) {
      F.anims[i].t += h;
      if (F.anims[i].t >= F.anims[i].dur) F.anims.splice(i, 1);
    }
    for (let i = F.expBursts.length - 1; i >= 0; i--) {
      F.expBursts[i].t += h;
      if (F.expBursts[i].t >= F.expBursts[i].dur) F.expBursts.splice(i, 1);
    }
    for (let i = F.rings.length - 1; i >= 0; i--) {
      F.rings[i].t += h;
      if (F.rings[i].t >= F.rings[i].life) F.rings.splice(i, 1);
    }
    for (let i = F.pops.length - 1; i >= 0; i--) {
      F.pops[i].t += h;
      if (F.pops[i].t >= F.pops[i].life) F.pops.splice(i, 1);
    }
    for (let i = F.streaks.length - 1; i >= 0; i--) {
      F.streaks[i].life -= h;
      if (F.streaks[i].life <= 0) F.streaks.splice(i, 1);
    }
    for (let i = F.sigils.length - 1; i >= 0; i--) {
      F.sigils[i].t += h;
      if (F.sigils[i].t >= F.sigils[i].life) F.sigils.splice(i, 1);
    }
    for (let i = F.columns.length - 1; i >= 0; i--) {
      F.columns[i].t += h;
      if (F.columns[i].t >= F.columns[i].life) F.columns.splice(i, 1);
    }
    for (let i = F.lights.length - 1; i >= 0; i--) {
      F.lights[i].life -= h;
      if (F.lights[i].life <= 0) F.lights.splice(i, 1);
    }
    F.flash = Math.max(0, F.flash - h * 1.6);
    F.hurtFlash = Math.max(0, F.hurtFlash - h * 2.4);
    F.screenPulse = Math.max(0, F.screenPulse - h * 1.75);
  };

  F.renderGround = ctx => {
    if (!F.sigils.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of F.sigils) {
      const k = s.t / s.life;
      const appear = Math.min(1, k * 6);
      const fade = 1 - k;
      const r = s.radius * (0.72 + 0.28 * appear);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.t * s.spin);
      ctx.globalAlpha = fade * 0.68;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.42, 0, 0, G.TAU); ctx.stroke();
      ctx.globalAlpha = fade * 0.42;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.72, r * 0.3, 0, 0, G.TAU); ctx.stroke();
      ctx.fillStyle = s.color;
      for (let i = 0; i < s.glyphs; i++) {
        const a = i / s.glyphs * G.TAU;
        const gx = Math.cos(a) * r * 0.82;
        const gy = Math.sin(a) * r * 0.34;
        ctx.save();
        ctx.translate(gx, gy);
        ctx.rotate(a + Math.PI / 2);
        ctx.globalAlpha = fade * 0.75;
        ctx.fillRect(-2, -5, 4, 10);
        ctx.fillRect(-5, -1, 10, 2);
        ctx.restore();
      }
      ctx.globalAlpha = fade * s.fill;
      ctx.fillStyle = s.accent;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.92, r * 0.38, 0, 0, G.TAU); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  F.render = ctx => {
    // death pops: white silhouette swelling out — the "I killed it" frame
    if (F.pops.length) {
      for (const p of F.pops) {
        const k = p.t / p.life;
        const sc = p.scale * (1 + 0.55 * (1 - (1 - k) * (1 - k)));
        ctx.globalAlpha = (1 - k) * 0.9;
        G.S.draw(ctx, p.spr, p.x, p.y, { scale: sc, flipX: p.flip });
      }
      ctx.globalAlpha = 1;
    }

    const P = F.parts.act;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      const a = p.life / p.maxLife;
      ctx.globalAlpha = a;
      if (p.kind === 'shard') {
        // tumbling debris: a short streak along its flight, lengthening with speed
        const sp = Math.hypot(p.vx, p.vy);
        const ux = sp > 1 ? p.vx / sp : 1, uy = sp > 1 ? p.vy / sp : 0;
        const len = p.r * 2.0 + Math.min(7, sp * 0.03);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.r * 0.85;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - ux * len, p.y - uy * len);
        ctx.stroke();
        continue;
      }
      if (p.kind === 'petal' || p.kind === 'ash') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.life * 2.5);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.r, -p.r * 0.35, p.r * 2, p.r * 0.7);
        ctx.restore();
        continue;
      }
      if (p.kind === 'wisp') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.r * 1.8, p.r, 0, 0, G.TAU);
        ctx.fill();
        ctx.restore();
        continue;
      }
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (p.kind === 'fade' ? a : 1), 0, G.TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // shockwave rings (additive)
    if (F.rings.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const r of F.rings) {
        const k = r.t / r.life;
        const rad = G.lerp(r.r0, r.r1, 1 - (1 - k) * (1 - k));
        ctx.globalAlpha = (1 - k) * 0.85;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = r.width * (1 - k * 0.6);
        ctx.beginPath();
        ctx.arc(r.x, r.y, rad, 0, G.TAU);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    // impact streaks (additive): the lance of force at the point of a heavy blow
    if (F.streaks.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const s of F.streaks) {
        const k = s.life / s.maxLife;
        const l = s.len * (1.45 - k * 0.45);   // elongate as it fades
        const cx = Math.cos(s.ang), cy = Math.sin(s.ang);
        ctx.globalAlpha = k;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width * k;
        ctx.beginPath();
        ctx.moveTo(s.x - cx * l * 0.35, s.y - cy * l * 0.35);
        ctx.lineTo(s.x + cx * l, s.y + cy * l);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    // spirit-light columns are deliberately drawn over actors: they sell the
    // instant of power without hiding silhouettes for more than a few frames.
    if (F.columns.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const b of F.columns) {
        const k = b.t / b.life;
        const a = Math.sin(Math.min(1, k) * Math.PI) * (1 - k * 0.35);
        const width = b.width * (0.55 + k * 0.65);
        const grad = ctx.createLinearGradient(0, b.y - b.height, 0, b.y + 8);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.35, b.color);
        grad.addColorStop(1, 'rgba(255,255,255,0.08)');
        ctx.globalAlpha = a * 0.38;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(b.x - width * 0.2, b.y - b.height);
        ctx.lineTo(b.x + width * 0.2, b.y - b.height);
        ctx.lineTo(b.x + width, b.y + 8);
        ctx.lineTo(b.x - width, b.y + 8);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = a * 0.8;
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x - 1.5, b.y - b.height * 0.92, 3, b.height * 0.82);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    // lightning bolts (additive)
    if (F.bolts.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const b of F.bolts) {
        const a = b.life / b.maxLife;
        ctx.globalAlpha = a;
        ctx.strokeStyle = '#cfeaff';
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(b.pts[0][0], b.pts[0][1]);
        for (let i = 1; i < b.pts.length; i++) ctx.lineTo(b.pts[i][0], b.pts[i][1]);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    // 素材ベースのアニメFX(foozle CC0): 撃破/着弾に本物の爆発等を重ねる(世界座標)
    if (F.anims.length) {
      for (const an of F.anims) {
        if (G.cam && !G.cam.onScreen(an.x, an.y, 64 * an.scale)) continue;
        const sheet = F.animSheets[an.name]; if (!sheet) continue;
        const fi = Math.min(sheet.length - 1, Math.floor(an.t / an.dur * sheet.length));
        const fr = sheet[fi]; if (!fr || !fr._ok) continue;
        const k = an.t / an.dur;
        ctx.globalAlpha = an.alpha * (k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1);   // 末尾フェード
        if (an.add) ctx.globalCompositeOperation = 'lighter';
        const w = 64 * an.scale;
        ctx.save();
        ctx.translate(an.x, an.y);
        if (an.rot) ctx.rotate(an.rot);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(fr, -w / 2, -w / 2, w, w);
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
    }
    // 実験FX(1枚絵の拡大+回転+フェード)。生成は call 側で D.EXPFX ゲート済
    if (F.expBursts.length) {
      for (const b of F.expBursts) {
        const img = F.expImg[b.name]; if (!img || !img._ok) continue;
        const k = b.t / b.dur;
        const sz = b.sz * (b.from + (b.to - b.from) * k);
        if (G.cam && !G.cam.onScreen(b.x, b.y, sz)) continue;
        ctx.globalAlpha = b.alpha * (k > 0.5 ? Math.max(0, 1 - (k - 0.5) / 0.5) : Math.min(1, k * 5));   // 入りフェード→末尾フェード
        if (b.add) ctx.globalCompositeOperation = 'lighter';
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot + b.spin * b.t);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz);
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
    }
  };

  F.renderScreen = ctx => {
    if (!G.opts.flash || F.screenPulse <= 0) return;   // 見やすさ: 閃光OFFで衝撃パルスを抑制
    const a = Math.min(1, F.screenPulse);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(
      G.VIEW_W / 2, G.VIEW_H / 2, G.VIEW_H * 0.08,
      G.VIEW_W / 2, G.VIEW_H / 2, G.VIEW_W * 0.58
    );
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.72, 'rgba(255,255,255,0)');
    g.addColorStop(1, F.screenColor);
    ctx.globalAlpha = a * 0.09;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, G.VIEW_W, G.VIEW_H);
    ctx.globalAlpha = a * 0.11;
    ctx.fillStyle = '#69d9ff';
    ctx.fillRect(0, 0, 3 + a * 5, G.VIEW_H);
    ctx.fillStyle = '#ff5a72';
    ctx.fillRect(G.VIEW_W - 3 - a * 5, 0, 3 + a * 5, G.VIEW_H);
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  F.renderTexts = ctx => {
    const T = F.texts.act;
    if (!T.length) return;
    ctx.textAlign = 'center';
    for (let i = 0; i < T.length; i++) {
      const t = T[i];
      const a = Math.min(1, t.life / t.maxLife * 1.6);
      ctx.globalAlpha = a;
      if (t.crit) {
        // 会心: 出現の刹那に大きく弾けてから締まる + 金の輝き + 太い縁取り
        const age = t.maxLife - t.life;
        const pop = age < 0.12 ? 1 + (1 - age / 0.12) * 0.7 : 1;
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.scale(pop, pop);
        ctx.font = `900 ${t.size}px Consolas, monospace`;
        ctx.lineWidth = 3.5;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(116,38,8,0.95)';
        ctx.strokeText(t.str, 0, 0);
        ctx.shadowColor = 'rgba(255,196,84,0.95)';
        ctx.shadowBlur = 13;
        ctx.fillStyle = t.color;
        ctx.fillText(t.str, 0, 0);
        ctx.restore();
        continue;
      }
      ctx.font = `bold ${t.size}px Consolas, monospace`;
      ctx.fillStyle = 'rgba(8,10,18,0.8)';
      ctx.fillText(t.str, t.x + 1, t.y + 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  };

  return F;
})();

// shared enemy spatial grid
G.grid = new G.Grid(80);
