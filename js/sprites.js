/* 百鬼夜行サバイバーズ — sprites: every visual is pre-rendered here in code.
 * No image assets. Pipeline: draw at 2x supersample → optional top-light
 * shading (source-atop) → optional rim outline (silhouette dilation) →
 * cached offscreen canvas. White variants are generated for hit-flash. */
'use strict';

G.S = (() => {
  const SS = 2;
  const reg = {};
  const S = { reg };

  const OUT = '#0a0c14';
  const RIM_FOE = 'rgba(168,205,255,0.88)';   // moonlight rim: every enemy pops on the dark ground
  const RIM_BOSS = 'rgba(255,201,108,0.92)';  // gold rim marks bosses
  const RIM_ALLY = 'rgba(255,230,189,0.85)';  // warm rim for the player & shikigami
  const RIM_ITEM = 'rgba(255,255,255,0.8)';
  const PIXEL_SKIP = /^(portrait_|glow_|fog$|lighthole$|vign$|shadowblob$)/;

  // Collapse procedural art to a shared low-resolution palette, then enlarge
  // with nearest-neighbour sampling. This keeps every yokai readable while
  // giving the whole game one deliberate pixel density.
  function pixelize(name, source, logicalW, logicalH) {
    if (PIXEL_SKIP.test(name)) return source;
    const lw = Math.max(3, Math.round(logicalW * 0.72));
    const lh = Math.max(3, Math.round(logicalH * 0.72));
    const low = document.createElement('canvas');
    low.width = lw; low.height = lh;
    const lx = low.getContext('2d', { willReadFrequently: true });
    lx.imageSmoothingEnabled = true;
    lx.drawImage(source, 0, 0, lw, lh);
    const img = lx.getImageData(0, 0, lw, lh);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 72) {
        d[i + 3] = 0;
        continue;
      }
      d[i] = Math.min(255, Math.round(d[i] / 24) * 24);
      d[i + 1] = Math.min(255, Math.round(d[i + 1] / 24) * 24);
      d[i + 2] = Math.min(255, Math.round(d[i + 2] / 24) * 24);
      d[i + 3] = 255;
    }
    lx.putImageData(img, 0, 0);
    const out = document.createElement('canvas');
    out.width = source.width; out.height = source.height;
    const ox = out.getContext('2d');
    ox.imageSmoothingEnabled = false;
    ox.drawImage(low, 0, 0, out.width, out.height);
    return out;
  }

  function mk(name, w, h, fn, opts = {}) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * SS);
    c.height = Math.ceil(h * SS);
    const x = c.getContext('2d');
    x.scale(SS, SS);
    x.lineJoin = 'round';
    x.lineCap = 'round';
    fn(x, w, h);

    // top-light shading: bright crown, shaded base — kills the "flat vector" look
    if (opts.shade) {
      x.globalCompositeOperation = 'source-atop';
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,250,230,0.20)');
      g.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(8,6,28,0.30)');
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
      x.globalCompositeOperation = 'source-over';
    }

    let fc = c, fw = w, fh = h;
    let ax = opts.ax !== undefined ? opts.ax : w / 2;
    let ay = opts.ay !== undefined ? opts.ay : h / 2;

    // rim outline: stamp the silhouette in 8 directions, tint, redraw on top
    if (opts.rim) {
      const pad = 2;
      const oc = document.createElement('canvas');
      oc.width = c.width + pad * 2 * SS;
      oc.height = c.height + pad * 2 * SS;
      const ox = oc.getContext('2d');
      const t = 1.15 * SS, d = t * 0.7;
      for (const [dx, dy] of [[-t, 0], [t, 0], [0, -t], [0, t], [-d, -d], [d, -d], [-d, d], [d, d]]) {
        ox.drawImage(c, pad * SS + dx, pad * SS + dy);
      }
      ox.globalCompositeOperation = 'source-in';
      ox.fillStyle = opts.rim;
      ox.fillRect(0, 0, oc.width, oc.height);
      ox.globalCompositeOperation = 'source-over';
      ox.drawImage(c, pad * SS, pad * SS);
      fc = oc; fw = w + pad * 2; fh = h + pad * 2;
      ax += pad; ay += pad;
    }

    fc = pixelize(name, fc, fw, fh);
    reg[name] = { c: fc, w: fw, h: fh, ax, ay };
    return reg[name];
  }

  function mkWhite(name) {
    const s = reg[name];
    const c = document.createElement('canvas');
    c.width = s.c.width; c.height = s.c.height;
    const x = c.getContext('2d');
    x.drawImage(s.c, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = '#f6f8ff';
    x.fillRect(0, 0, c.width, c.height);
    reg[name + '_w'] = { c, w: s.w, h: s.h, ax: s.ax, ay: s.ay };
  }

  S.get = name => reg[name];

  S.draw = (ctx, name, x, y, o = {}) => {
    const s = reg[name];
    if (!s) return;
    const sc = o.scale || 1;
    const sx = sc * (o.sx || 1), sy = sc * (o.sy || 1);
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (o.rot) ctx.rotate(o.rot);
    if (o.flipX || sx !== 1 || sy !== 1) ctx.scale(o.flipX ? -sx : sx, sy);
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    ctx.drawImage(s.c, -s.ax, -s.ay, s.w, s.h);
    ctx.restore();
  };

  S.dataURL = name => reg[name] ? reg[name].c.toDataURL() : '';

  // ---------- small helpers ----------
  function poly(x, pts, fill, stroke) {
    x.beginPath();
    x.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]);
    x.closePath();
    if (fill) { x.fillStyle = fill; x.fill(); }
    if (stroke) { x.strokeStyle = stroke; x.lineWidth = 1.4; x.stroke(); }
  }
  function circle(x, cx, cy, r, fill, stroke) {
    x.beginPath();
    x.arc(cx, cy, r, 0, G.TAU);
    if (fill) { x.fillStyle = fill; x.fill(); }
    if (stroke) { x.strokeStyle = stroke; x.lineWidth = 1.4; x.stroke(); }
  }
  function ellipse(x, cx, cy, rx, ry, fill) {
    x.beginPath();
    x.ellipse(cx, cy, rx, ry, 0, 0, G.TAU);
    x.fillStyle = fill;
    x.fill();
  }
  function glowDot(x, cx, cy, r, color) {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color);
    g.addColorStop(0.45, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  function radial(x, cx, cy, r, stops) {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    for (const [p, c] of stops) g.addColorStop(p, c);
    x.fillStyle = g;
    x.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // ---------- composable character-part painters ----------
  // two-tone shaded ellipse: base + belly shadow + top sheen, clipped inside
  function shadedEllipse(x, cx, cy, rx, ry, base, dark, light, outline = OUT) {
    x.save();
    x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, G.TAU); x.clip();
    x.fillStyle = base;
    x.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
    if (dark) ellipse(x, cx + rx * 0.08, cy + ry * 0.58, rx, ry * 0.6, dark);
    if (light) ellipse(x, cx - rx * 0.28, cy - ry * 0.42, rx * 0.52, ry * 0.36, light);
    x.restore();
    if (outline) {
      x.strokeStyle = outline; x.lineWidth = 1.3;
      x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, G.TAU); x.stroke();
    }
  }
  function shadedCircle(x, cx, cy, r, base, dark, light, outline = OUT) {
    shadedEllipse(x, cx, cy, r, r, base, dark, light, outline);
  }
  // spikes along an arc (manes, wild hair, flame crowns)
  function spikeArc(x, cx, cy, r, a0, a1, n, len, color) {
    for (let i = 0; i < n; i++) {
      const a = a0 + (a1 - a0) * (i + 0.5) / n;
      poly(x, [
        [cx + Math.cos(a - 0.16) * r, cy + Math.sin(a - 0.16) * r],
        [cx + Math.cos(a) * (r + len), cy + Math.sin(a) * (r + len)],
        [cx + Math.cos(a + 0.16) * r, cy + Math.sin(a + 0.16) * r],
      ], color);
    }
  }
  // tiger-stripe band (oni loincloths)
  function stripeBand(x, cx, cy, w, h, n, base, stripe) {
    x.fillStyle = base;
    x.fillRect(cx - w / 2, cy - h / 2, w, h);
    for (let i = 0; i < n; i++) {
      const sx = cx - w / 2 + (i + 0.5) * (w / n);
      poly(x, [[sx - 1.6, cy - h / 2], [sx + 1.6, cy - h / 2], [sx, cy + h / 2]], stripe);
    }
  }
  // glowing eye with optional slit pupil
  function eyeGlow(x, cx, cy, r, color, pupil) {
    glowDot(x, cx, cy, r, color);
    if (pupil) {
      x.fillStyle = pupil;
      x.fillRect(cx - r * 0.2, cy - r * 0.5, r * 0.4, r);
    }
  }

  // =====================================================================
  S.build = () => {

    // ---------- player (onmyoji, feet anchor) ----------
    for (let f = 0; f < 2; f++) {
      mk('p_' + f, 30, 36, (x) => {
        const bob = f ? 1 : 0;
        const sway = f ? 0.8 : -0.8;
        // back sleeves (shaded under-layer)
        ellipse(x, 7 + sway * 0.4, 23 + bob, 5, 5.8, '#d8ccae');
        ellipse(x, 23 - sway * 0.4, 23 + bob, 5, 5.8, '#d8ccae');
        // hakama (deep violet, split legs, kikkō gold dots)
        poly(x, [[10, 25 + bob], [20, 25 + bob], [21.8, 33.5], [16.6, 33.5], [15, 28.8], [13.4, 33.5], [8.2, 33.5]], '#5a3268', OUT);
        x.fillStyle = 'rgba(216,162,58,0.55)';
        x.fillRect(11.2, 27.5 + bob, 1.2, 1.2);
        x.fillRect(17.6, 27.5 + bob, 1.2, 1.2);
        x.fillRect(14.4, 26.3 + bob, 1.2, 1.2);
        x.strokeStyle = 'rgba(18,8,28,0.6)'; x.lineWidth = 1;
        x.beginPath(); x.moveTo(12.2, 26.5 + bob); x.lineTo(11.2 + sway, 32.5); x.stroke();
        x.beginPath(); x.moveTo(17.8, 26.5 + bob); x.lineTo(18.8 - sway, 32.5); x.stroke();
        // tabi + asagutsu (black court shoes)
        x.fillStyle = '#f2ead8';
        x.fillRect(9.2 + (f ? 1.6 : 0), 33, 4.2, 1.6);
        x.fillRect(16.6 - (f ? 1.6 : 0), 33, 4.2, 1.6);
        x.fillStyle = '#1a1520';
        x.fillRect(9.2 + (f ? 1.6 : 0), 34.4, 4.2, 1.4);
        x.fillRect(16.6 - (f ? 1.6 : 0), 34.4, 4.2, 1.4);
        // kariginu robe (white, wide shoulders, gold-trimmed hem)
        poly(x, [[9.2, 15 + bob], [20.8, 15 + bob], [22.4, 25.5 + bob], [7.6, 25.5 + bob]], '#f7f0dd', OUT);
        x.save();
        x.beginPath();
        x.moveTo(9.2, 15 + bob); x.lineTo(20.8, 15 + bob); x.lineTo(22.4, 25.5 + bob); x.lineTo(7.6, 25.5 + bob);
        x.closePath(); x.clip();
        x.fillStyle = 'rgba(150,130,95,0.25)';
        x.fillRect(7, 22.5 + bob, 17, 3.4);
        x.strokeStyle = 'rgba(150,130,95,0.45)'; x.lineWidth = 0.8;
        x.beginPath(); x.moveTo(11.4, 16 + bob); x.quadraticCurveTo(10.6, 20, 11, 25 + bob); x.stroke();
        x.beginPath(); x.moveTo(18.6, 16 + bob); x.quadraticCurveTo(19.4, 20, 19, 25 + bob); x.stroke();
        x.restore();
        x.strokeStyle = '#d8a23a'; x.lineWidth = 1;
        x.beginPath(); x.moveTo(7.8, 24.6 + bob); x.lineTo(22.2, 24.6 + bob); x.stroke();
        // collar: red inner kimono + gold edge
        x.strokeStyle = '#b8312a'; x.lineWidth = 1.7;
        x.beginPath(); x.moveTo(12.2, 15.4 + bob); x.lineTo(15, 19.6 + bob); x.lineTo(17.8, 15.4 + bob); x.stroke();
        x.strokeStyle = '#d8a23a'; x.lineWidth = 0.8;
        x.beginPath(); x.moveTo(13, 15.4 + bob); x.lineTo(15, 18.4 + bob); x.lineTo(17, 15.4 + bob); x.stroke();
        // obi sash + gold clasp
        x.fillStyle = '#3a2a4a';
        x.fillRect(9.4, 23.2 + bob, 11.2, 2.1);
        x.fillStyle = '#d8a23a';
        x.fillRect(14, 23.2 + bob, 2, 2.1);
        // front sleeves (billowing, red cuff + kikutoji knots)
        for (const [scx, dirn] of [[6.4 + sway * 0.5, -1], [23.6 - sway * 0.5, 1]]) {
          shadedEllipse(x, scx, 22.4 + bob, 4, 5.2, '#f7f0dd', 'rgba(150,130,95,0.3)', 'rgba(255,255,248,0.7)', 'rgba(120,100,70,0.55)');
          // red inner cuff peeking out
          ellipse(x, scx + dirn * 0.6, 26.6 + bob, 2.4, 1.2, '#b8312a');
          // kikutoji (decorative knot)
          circle(x, scx - dirn * 1.2, 19.6 + bob, 1, '#c0392b');
        }
        // ofuda in hand
        x.save();
        x.translate(25, 19.4 + bob); x.rotate(0.32);
        x.fillStyle = '#fffdf2'; x.fillRect(-1.8, -4.8, 3.6, 9.6);
        x.strokeStyle = '#c9b88a'; x.lineWidth = 0.6; x.strokeRect(-1.8, -4.8, 3.6, 9.6);
        x.fillStyle = '#c0392b'; x.fillRect(-1, -2.8, 2, 3.6);
        x.fillRect(-0.6, -4.2, 1.2, 1);
        x.restore();
        // head with soft shading
        shadedCircle(x, 15, 10.5 + bob * 0.5, 5.2, '#f4dcbc', 'rgba(190,140,95,0.35)', 'rgba(255,245,225,0.7)');
        // sidelocks + fringe
        x.fillStyle = '#1a141f';
        x.beginPath(); x.arc(15, 9.2 + bob * 0.5, 5.2, Math.PI * 1.02, Math.PI * 1.98); x.fill();
        poly(x, [[10, 10 + bob * 0.5], [9.2, 14 + bob * 0.5], [11.2, 11 + bob * 0.5]], '#1a141f');
        poly(x, [[20, 10 + bob * 0.5], [20.8, 14 + bob * 0.5], [18.8, 11 + bob * 0.5]], '#1a141f');
        // tate-eboshi: tall lacquered hat, sheen + gold band + chin cord
        poly(x, [[11.8, 7.5 + bob * 0.5], [13.2, -1.5 + bob * 0.5], [17.4, -0.5 + bob * 0.5], [18.2, 7.5 + bob * 0.5]], '#16121e', OUT);
        x.strokeStyle = 'rgba(170,150,215,0.4)'; x.lineWidth = 1;
        x.beginPath(); x.moveTo(14, 0 + bob * 0.5); x.quadraticCurveTo(13, 3.5, 12.8, 6.5 + bob * 0.5); x.stroke();
        x.fillStyle = '#d8a23a';
        x.fillRect(11.8, 6.4 + bob * 0.5, 6.6, 1.3);
        x.strokeStyle = '#c0392b'; x.lineWidth = 0.8;
        x.beginPath(); x.moveTo(12.2, 7.8 + bob * 0.5); x.quadraticCurveTo(15, 14.6 + bob * 0.5, 18, 7.8 + bob * 0.5); x.stroke();
        // calm eyes + brows + mouth
        x.fillStyle = '#241c14';
        x.fillRect(12.6, 10 + bob * 0.5, 1.5, 2);
        x.fillRect(16.1, 10 + bob * 0.5, 1.5, 2);
        x.fillRect(12.3, 8.7 + bob * 0.5, 2.1, 0.7);
        x.fillRect(15.8, 8.7 + bob * 0.5, 2.1, 0.7);
        x.fillStyle = 'rgba(150,80,60,0.8)';
        x.fillRect(14.3, 13.6 + bob * 0.5, 1.6, 0.7);
      }, { ay: 36, shade: true, rim: RIM_ALLY });
      mkWhite('p_' + f);
    }

    // ---------- 巫女 鈴 (miko, feet anchor) ----------
    for (let f = 0; f < 2; f++) {
      mk('pc_suzu_' + f, 30, 36, (x) => {
        const bob = f ? 1 : 0;
        const sway = f ? 1 : -1;
        // long black hair behind (low ponytail w/ white ribbon)
        x.fillStyle = '#1a141f';
        poly(x, [[11, 8 + bob * 0.5], [9, 20 + bob], [10.5 + sway * 0.6, 27 + bob], [13.5, 24 + bob], [13, 12]], '#1a141f');
        poly(x, [[19, 8 + bob * 0.5], [21, 20 + bob], [19.5 - sway * 0.6, 27 + bob], [16.5, 24 + bob], [17, 12]], '#1a141f');
        // red hakama (long, to the feet)
        poly(x, [[10, 22.5 + bob], [20, 22.5 + bob], [22.4, 34.5], [7.6, 34.5]], '#c0392b', OUT);
        x.strokeStyle = 'rgba(110,20,16,0.7)'; x.lineWidth = 1;
        x.beginPath(); x.moveTo(13, 24 + bob); x.lineTo(12 + sway, 33.5); x.stroke();
        x.beginPath(); x.moveTo(17, 24 + bob); x.lineTo(18 - sway, 33.5); x.stroke();
        // hakama front pleat board
        x.fillStyle = '#a82a20';
        x.fillRect(13, 22.5 + bob, 4, 4);
        // white kosode top
        poly(x, [[9.6, 14.5 + bob], [20.4, 14.5 + bob], [21.4, 23 + bob], [8.6, 23 + bob]], '#f7f0dd', OUT);
        // collar (red inner)
        x.strokeStyle = '#b8312a'; x.lineWidth = 1.5;
        x.beginPath(); x.moveTo(12.4, 15 + bob); x.lineTo(15, 18.8 + bob); x.lineTo(17.6, 15 + bob); x.stroke();
        // sleeves (very wide)
        for (const [scx, dirn] of [[5.8 + sway * 0.5, -1], [24.2 - sway * 0.5, 1]]) {
          shadedEllipse(x, scx, 21 + bob, 4.4, 5.8, '#f7f0dd', 'rgba(150,130,95,0.3)', 'rgba(255,255,248,0.7)', 'rgba(120,100,70,0.55)');
          ellipse(x, scx + dirn * 0.6, 25.8 + bob, 2.6, 1.3, '#c0392b');
        }
        // gohei wand in hand
        x.save();
        x.translate(25.4, 17.6 + bob); x.rotate(0.25);
        x.fillStyle = '#c9a86a'; x.fillRect(-0.8, -7, 1.6, 12);
        x.fillStyle = '#fffdf2';
        poly(x, [[-0.6, -6.5], [-4.4, -4.8], [-1.8, -3.4], [-5, -1.4], [-1.4, -0.6], [-0.6, -2.8]], '#fffdf2', '#c9b88a');
        poly(x, [[0.6, -6.5], [4.4, -4.8], [1.8, -3.4], [5, -1.4], [1.4, -0.6], [0.6, -2.8]], '#fffdf2', '#c9b88a');
        x.restore();
        // head
        shadedCircle(x, 15, 10 + bob * 0.5, 5.2, '#f6e2c8', 'rgba(200,150,110,0.3)', 'rgba(255,248,235,0.7)');
        // hair: center part + side curtains + ribbon
        x.fillStyle = '#1a141f';
        x.beginPath(); x.arc(15, 8.6 + bob * 0.5, 5.3, Math.PI * 1.0, Math.PI * 2.0); x.fill();
        poly(x, [[9.7, 9 + bob * 0.5], [9.2, 15 + bob * 0.5], [11.4, 10.5 + bob * 0.5]], '#1a141f');
        poly(x, [[20.3, 9 + bob * 0.5], [20.8, 15 + bob * 0.5], [18.6, 10.5 + bob * 0.5]], '#1a141f');
        x.strokeStyle = 'rgba(150,150,200,0.35)'; x.lineWidth = 0.8;
        x.beginPath(); x.arc(15, 9 + bob * 0.5, 4.6, Math.PI * 1.2, Math.PI * 1.5); x.stroke();
        // white hair ribbon
        x.fillStyle = '#f7f0dd';
        x.fillRect(11.5, 4.6 + bob * 0.5, 7, 1.6);
        // gentle eyes + red lip dot
        x.fillStyle = '#241c14';
        x.fillRect(12.7, 9.6 + bob * 0.5, 1.4, 1.7);
        x.fillRect(15.9, 9.6 + bob * 0.5, 1.4, 1.7);
        x.fillStyle = '#c0392b';
        x.fillRect(14.5, 13 + bob * 0.5, 1.2, 0.8);
      }, { ay: 36, shade: true, rim: RIM_ALLY });
      mkWhite('pc_suzu_' + f);
    }

    // ---------- 浪人 無月 (ronin, feet anchor) ----------
    for (let f = 0; f < 2; f++) {
      mk('pc_mutsuki_' + f, 32, 36, (x) => {
        const bob = f ? 1 : 0;
        const sway = f ? 0.8 : -0.8;
        // katana saya (sheath) at left hip
        x.save();
        x.translate(8.5, 22 + bob); x.rotate(0.55 + sway * 0.03);
        x.fillStyle = '#1c1822';
        x.fillRect(-1.4, -1.2, 13, 2.6);
        x.strokeStyle = OUT; x.lineWidth = 0.8; x.strokeRect(-1.4, -1.2, 13, 2.6);
        x.fillStyle = '#d8a23a';
        x.fillRect(10.4, -1.2, 1.4, 2.6);
        // tsuba + hilt (diagonal up)
        x.fillStyle = '#3a3444';
        x.fillRect(-5.8, -0.9, 4.6, 2);
        circle(x, -1.2, 0.1, 1.6, '#8a8070');
        x.strokeStyle = '#241c14'; x.lineWidth = 0.6;
        x.beginPath(); x.moveTo(-5.2, -0.6); x.lineTo(-2.2, 0.8); x.stroke();
        x.restore();
        // legs (dark hakama, shorter)
        poly(x, [[11, 24 + bob], [21, 24 + bob], [22.4, 33.5], [17.6, 33.5], [16, 28.6], [14.4, 33.5], [9.6, 33.5]], '#2c2a36', OUT);
        // straw sandals
        x.fillStyle = '#9a7a4a';
        x.fillRect(10.4 + (f ? 1.5 : 0), 33.2, 4.4, 1.8);
        x.fillRect(17.2 - (f ? 1.5 : 0), 33.2, 4.4, 1.8);
        // grey-navy kimono (worn, layered)
        poly(x, [[10.2, 14.5 + bob], [21.8, 14.5 + bob], [23.2, 24.5 + bob], [8.8, 24.5 + bob]], '#46506a', OUT);
        x.save();
        x.beginPath();
        x.moveTo(10.2, 14.5 + bob); x.lineTo(21.8, 14.5 + bob); x.lineTo(23.2, 24.5 + bob); x.lineTo(8.8, 24.5 + bob);
        x.closePath(); x.clip();
        x.fillStyle = 'rgba(20,24,40,0.5)';
        poly(x, [[10.2, 14.5 + bob], [14, 14.5 + bob], [12, 24.5 + bob], [8.8, 24.5 + bob]], 'rgba(20,24,40,0.5)');
        // tattered hem
        x.fillStyle = 'rgba(12,14,26,0.6)';
        for (let i = 0; i < 5; i++) poly(x, [[10 + i * 2.8, 24.5 + bob], [11.4 + i * 2.8, 21.5 + bob], [12.8 + i * 2.8, 24.5 + bob]], 'rgba(12,14,26,0.6)');
        x.restore();
        // white under-collar + chest V
        x.strokeStyle = '#e8e2d0'; x.lineWidth = 1.6;
        x.beginPath(); x.moveTo(13, 15 + bob); x.lineTo(16, 19.6 + bob); x.lineTo(19, 15 + bob); x.stroke();
        // white obi sash
        x.fillStyle = '#d8d2c0';
        x.fillRect(10, 22.4 + bob, 12, 2);
        x.strokeStyle = 'rgba(90,84,70,0.6)'; x.lineWidth = 0.6;
        x.beginPath(); x.moveTo(10, 23.4 + bob); x.lineTo(22, 23.4 + bob); x.stroke();
        // right arm resting on hilt
        ellipse(x, 7.8 + sway * 0.4, 20 + bob, 2.8, 4.4, '#46506a');
        x.strokeStyle = OUT; x.lineWidth = 1.1; x.stroke();
        // left sleeve
        ellipse(x, 24.2 - sway * 0.4, 20.5 + bob, 3.2, 4.8, '#46506a');
        x.strokeStyle = OUT; x.lineWidth = 1.1; x.stroke();
        x.fillStyle = '#f6e2c8';
        circle(x, 24.6, 24.6 + bob, 1.6, '#f6e2c8');
        // head (stubbled jaw)
        shadedCircle(x, 16, 10.5 + bob * 0.5, 5, '#f0d8b8', 'rgba(170,130,90,0.4)', 'rgba(255,245,228,0.6)');
        x.fillStyle = 'rgba(70,60,50,0.4)';
        x.beginPath(); x.arc(16, 13 + bob * 0.5, 3.4, 0.3, Math.PI - 0.3); x.fill();
        // hair (rough topknot peeking)
        x.fillStyle = '#241f29';
        x.beginPath(); x.arc(16, 9 + bob * 0.5, 5, Math.PI * 1.05, Math.PI * 1.95); x.fill();
        // sandogasa (conical straw hat, tilted — shades the eyes)
        x.save();
        x.translate(16, 6.6 + bob * 0.5); x.rotate(-0.08 + sway * 0.02);
        const hg = x.createLinearGradient(0, -6, 0, 2);
        hg.addColorStop(0, '#b8954c');
        hg.addColorStop(1, '#7e652f');
        x.fillStyle = hg;
        poly(x, [[-10.5, 2], [0, -6.5], [10.5, 2]], hg, '#4e3e16');
        x.strokeStyle = 'rgba(78,62,22,0.7)'; x.lineWidth = 0.7;
        x.beginPath(); x.moveTo(-7, -0.6); x.lineTo(7, -0.6); x.stroke();
        x.beginPath(); x.moveTo(-3.5, -3.4); x.lineTo(3.5, -3.4); x.stroke();
        // shadow cast on the face
        x.fillStyle = 'rgba(10,8,18,0.45)';
        poly(x, [[-7.5, 2], [7.5, 2], [5, 4.6], [-5, 4.6]], 'rgba(10,8,18,0.45)');
        x.restore();
        // one sharp eye visible under the brim
        x.fillStyle = '#241c14';
        x.fillRect(17.2, 10.4 + bob * 0.5, 2, 1.2);
        // grim mouth + scar on cheek
        x.fillStyle = 'rgba(120,60,46,0.9)';
        x.fillRect(15.2, 13.8 + bob * 0.5, 1.8, 0.7);
        x.strokeStyle = 'rgba(150,80,70,0.8)'; x.lineWidth = 0.7;
        x.beginPath(); x.moveTo(12.4, 11 + bob * 0.5); x.lineTo(13.4, 13.4 + bob * 0.5); x.stroke();
      }, { ay: 36, shade: true, rim: RIM_ALLY });
      mkWhite('pc_mutsuki_' + f);
    }

    // ---------- large character portraits (menu/UI illustration layer) ----------
    mk('portrait_haru', 104, 132, (x) => {
      radial(x, 52, 70, 58, [
        [0, 'rgba(255,218,150,0.16)'],
        [0.55, 'rgba(130,160,255,0.08)'],
        [1, 'rgba(0,0,0,0)'],
      ]);
      // sleeves and talisman halo
      for (let i = 0; i < 5; i++) {
        x.save();
        x.translate(54 + (i - 2) * 9, 42 + Math.abs(i - 2) * 5);
        x.rotate((i - 2) * 0.16);
        x.fillStyle = '#fffdf2';
        x.fillRect(-4, -16, 8, 25);
        x.strokeStyle = '#c9b88a'; x.lineWidth = 1;
        x.strokeRect(-4, -16, 8, 25);
        x.fillStyle = '#c0392b';
        x.fillRect(-2.2, -9, 4.4, 9);
        x.restore();
      }
      shadedEllipse(x, 52, 96, 34, 27, '#f6efdc', 'rgba(110,82,74,0.38)', 'rgba(255,255,248,0.72)', OUT);
      poly(x, [[27, 86], [77, 86], [88, 129], [16, 129]], '#4b2d64', OUT);
      x.save();
      x.beginPath(); x.moveTo(27, 86); x.lineTo(77, 86); x.lineTo(88, 129); x.lineTo(16, 129); x.closePath(); x.clip();
      x.fillStyle = 'rgba(255,250,230,0.88)';
      poly(x, [[34, 82], [52, 105], [70, 82], [64, 129], [40, 129]], '#f7f0dd');
      x.strokeStyle = '#b8312a'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(40, 86); x.lineTo(52, 104); x.lineTo(64, 86); x.stroke();
      x.strokeStyle = '#d8a23a'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(24, 119); x.lineTo(80, 119); x.stroke();
      x.restore();
      // hands and active talisman
      circle(x, 77, 92, 5, '#f2d6b8', OUT);
      x.save();
      x.translate(83, 80); x.rotate(0.23);
      x.fillStyle = '#fffdf2'; x.fillRect(-5, -19, 10, 30);
      x.strokeStyle = '#c9b88a'; x.lineWidth = 1.2; x.strokeRect(-5, -19, 10, 30);
      x.fillStyle = '#c0392b'; x.fillRect(-3, -10, 6, 14);
      x.fillStyle = '#d8a23a'; x.fillRect(-2, -16, 4, 2);
      x.restore();
      // face
      shadedCircle(x, 52, 52, 21, '#f3d8bb', 'rgba(175,116,83,0.33)', 'rgba(255,244,226,0.72)', OUT);
      x.fillStyle = '#1a141f';
      x.beginPath(); x.arc(52, 47, 21, Math.PI * 1.0, Math.PI * 2.0); x.fill();
      poly(x, [[30, 48], [25, 70], [36, 59]], '#1a141f');
      poly(x, [[74, 48], [79, 70], [68, 59]], '#1a141f');
      poly(x, [[43, 47], [48, 58], [55, 47]], '#1a141f');
      // eboshi
      poly(x, [[39, 35], [43, -4], [61, 1], [65, 36]], '#171320', OUT);
      x.strokeStyle = 'rgba(180,165,230,0.45)'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(48, 0); x.quadraticCurveTo(43, 18, 43, 34); x.stroke();
      x.fillStyle = '#d8a23a'; x.fillRect(38, 32, 28, 5);
      x.strokeStyle = '#c0392b'; x.lineWidth = 1.2;
      x.beginPath(); x.moveTo(40, 37); x.quadraticCurveTo(52, 68, 64, 37); x.stroke();
      // expression
      x.fillStyle = '#241c14';
      x.fillRect(43, 52, 4, 6);
      x.fillRect(57, 52, 4, 6);
      x.fillRect(42, 48, 7, 1.7);
      x.fillRect(55, 48, 7, 1.7);
      x.fillStyle = 'rgba(130,54,48,0.85)';
      x.fillRect(49, 66, 7, 1.8);
    }, { shade: true, rim: RIM_ALLY });

    mk('portrait_suzu', 104, 132, (x) => {
      radial(x, 52, 72, 62, [
        [0, 'rgba(255,220,180,0.15)'],
        [0.5, 'rgba(255,80,70,0.08)'],
        [1, 'rgba(0,0,0,0)'],
      ]);
      // shimenawa crescent behind her
      x.save();
      x.translate(52, 78);
      x.rotate(-0.22);
      x.strokeStyle = '#b89b66'; x.lineWidth = 7;
      x.beginPath(); x.arc(0, 0, 42, Math.PI * 0.18, Math.PI * 0.92); x.stroke();
      x.strokeStyle = 'rgba(70,48,22,0.75)'; x.lineWidth = 1.2;
      for (let i = 0; i < 8; i++) {
        const a = Math.PI * (0.22 + i * 0.085);
        x.beginPath();
        x.moveTo(Math.cos(a) * 39, Math.sin(a) * 39);
        x.lineTo(Math.cos(a) * 45, Math.sin(a) * 45);
        x.stroke();
      }
      x.restore();
      // hair fall
      x.fillStyle = '#15111a';
      poly(x, [[27, 42], [20, 96], [31, 124], [43, 86], [41, 43]], '#15111a', OUT);
      poly(x, [[77, 42], [84, 96], [73, 124], [61, 86], [63, 43]], '#15111a', OUT);
      // garments
      shadedEllipse(x, 52, 96, 33, 26, '#f8f0dd', 'rgba(116,88,66,0.30)', 'rgba(255,255,250,0.72)', OUT);
      poly(x, [[31, 89], [73, 89], [84, 130], [20, 130]], '#c0392b', OUT);
      x.strokeStyle = 'rgba(110,20,16,0.75)'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(44, 94); x.lineTo(40, 128); x.stroke();
      x.beginPath(); x.moveTo(60, 94); x.lineTo(64, 128); x.stroke();
      x.strokeStyle = '#b8312a'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(40, 83); x.lineTo(52, 102); x.lineTo(64, 83); x.stroke();
      // gohei
      x.save();
      x.translate(81, 78); x.rotate(0.4);
      x.fillStyle = '#c9a86a'; x.fillRect(-1.7, -28, 3.4, 56);
      for (const d of [-1, 1]) {
        poly(x, [[d * 1, -28], [d * 15, -22], [d * 7, -15], [d * 17, -8], [d * 5, -3], [d * 1, -14]], '#fffdf2', '#c9b88a');
      }
      x.restore();
      circle(x, 78, 93, 5, '#f4d6bc', OUT);
      // face and hair
      shadedCircle(x, 52, 50, 21, '#f5ddc2', 'rgba(188,134,96,0.30)', 'rgba(255,248,235,0.75)', OUT);
      x.fillStyle = '#15111a';
      x.beginPath(); x.arc(52, 45, 21, Math.PI * 1.0, Math.PI * 2.0); x.fill();
      poly(x, [[31, 48], [28, 72], [39, 58]], '#15111a');
      poly(x, [[73, 48], [76, 72], [65, 58]], '#15111a');
      x.fillStyle = '#f7f0dd';
      x.fillRect(37, 27, 30, 5);
      poly(x, [[37, 28], [28, 23], [32, 35]], '#f7f0dd', '#c9b88a');
      poly(x, [[67, 28], [76, 23], [72, 35]], '#f7f0dd', '#c9b88a');
      // bells and eyes
      for (const [bx, by] of [[33, 85], [85, 91], [78, 54]]) {
        circle(x, bx, by, 3.5, '#d8a23a', OUT);
        x.fillStyle = '#6b4c1c'; x.fillRect(bx - 0.8, by - 1, 1.6, 3);
      }
      x.fillStyle = '#241c14';
      x.fillRect(44, 51, 4, 5.6);
      x.fillRect(57, 51, 4, 5.6);
      x.fillStyle = '#c0392b';
      x.fillRect(49, 65, 6, 2.2);
    }, { shade: true, rim: RIM_ALLY });

    mk('portrait_mutsuki', 108, 132, (x) => {
      radial(x, 55, 72, 64, [
        [0, 'rgba(180,205,255,0.15)'],
        [0.45, 'rgba(255,255,255,0.05)'],
        [1, 'rgba(0,0,0,0)'],
      ]);
      // moon blade and scarf sweep
      x.save();
      x.translate(56, 68);
      x.rotate(-0.35);
      x.strokeStyle = 'rgba(220,238,255,0.75)';
      x.lineWidth = 9;
      x.beginPath(); x.arc(5, 8, 47, Math.PI * 1.08, Math.PI * 1.76); x.stroke();
      x.strokeStyle = 'rgba(120,160,220,0.45)';
      x.lineWidth = 3;
      x.beginPath(); x.arc(5, 8, 37, Math.PI * 1.10, Math.PI * 1.72); x.stroke();
      x.restore();
      x.fillStyle = '#d8d2c0';
      poly(x, [[26, 74], [55, 81], [93, 66], [86, 78], [57, 94], [31, 90]], '#d8d2c0', OUT);
      // body
      poly(x, [[33, 83], [75, 83], [88, 130], [20, 130]], '#3f4962', OUT);
      x.save();
      x.beginPath(); x.moveTo(33, 83); x.lineTo(75, 83); x.lineTo(88, 130); x.lineTo(20, 130); x.closePath(); x.clip();
      poly(x, [[33, 83], [49, 83], [43, 130], [20, 130]], 'rgba(16,18,30,0.62)');
      x.fillStyle = '#d8d2c0'; x.fillRect(33, 105, 43, 6);
      for (let i = 0; i < 7; i++) {
        poly(x, [[27 + i * 7, 129], [31 + i * 7, 113], [35 + i * 7, 129]], 'rgba(10,12,24,0.45)');
      }
      x.restore();
      // katana
      x.save();
      x.translate(28, 102); x.rotate(-0.8);
      x.fillStyle = '#1b1822'; x.fillRect(-2, -6, 4, 58);
      x.strokeStyle = OUT; x.lineWidth = 1; x.strokeRect(-2, -6, 4, 58);
      circle(x, 0, -7, 5, '#8a8070', OUT);
      x.fillStyle = '#d8a23a'; x.fillRect(-1.6, 40, 3.2, 6);
      x.restore();
      circle(x, 30, 103, 5, '#f1d6b8', OUT);
      // face
      shadedCircle(x, 54, 51, 20, '#efd6b7', 'rgba(160,112,88,0.40)', 'rgba(255,245,226,0.65)', OUT);
      x.fillStyle = 'rgba(70,60,50,0.42)';
      x.beginPath(); x.arc(54, 62, 14, 0.2, Math.PI - 0.2); x.fill();
      x.fillStyle = '#211d28';
      x.beginPath(); x.arc(54, 45, 20, Math.PI * 1.05, Math.PI * 1.95); x.fill();
      spikeArc(x, 54, 39, 11, Math.PI * 1.1, Math.PI * 1.9, 6, 6, '#211d28');
      // tilted hat
      x.save();
      x.translate(54, 34); x.rotate(-0.12);
      const hg = x.createLinearGradient(0, -18, 0, 10);
      hg.addColorStop(0, '#c29e52');
      hg.addColorStop(1, '#6f5628');
      poly(x, [[-39, 8], [0, -20], [39, 8]], hg, '#4e3e16');
      x.strokeStyle = 'rgba(70,50,20,0.8)'; x.lineWidth = 1.4;
      for (const yy of [-7, 0, 6]) { x.beginPath(); x.moveTo(-25 + yy, yy); x.lineTo(25 - yy, yy); x.stroke(); }
      x.fillStyle = 'rgba(8,8,18,0.52)';
      poly(x, [[-27, 8], [27, 8], [18, 19], [-18, 19]], 'rgba(8,8,18,0.52)');
      x.restore();
      x.fillStyle = '#22180f';
      x.fillRect(58, 51, 8, 2.4);
      x.fillStyle = 'rgba(120,58,48,0.9)';
      x.fillRect(51, 66, 8, 2);
      x.strokeStyle = 'rgba(150,80,70,0.9)'; x.lineWidth = 1.4;
      x.beginPath(); x.moveTo(42, 54); x.lineTo(45, 63); x.stroke();
    }, { shade: true, rim: RIM_ALLY });

    // ---------- enemies ----------
    // 小鬼 imp — tiger loincloth, claws, wild tuft
    for (let f = 0; f < 2; f++) {
      mk('e_imp_' + f, 22, 22, (x) => {
        const sq = f ? 1.5 : 0;
        // ears with inner colour
        poly(x, [[3.6, 12], [0.8, 10], [4, 14.6]], '#3a3152', OUT);
        poly(x, [[18.4, 12], [21.2, 10], [18, 14.6]], '#3a3152', OUT);
        x.fillStyle = '#6a5080';
        poly(x, [[3.4, 12.2], [2, 11.2], [3.7, 13.6]], '#6a5080');
        poly(x, [[18.6, 12.2], [20, 11.2], [18.3, 13.6]], '#6a5080');
        // body (two-tone)
        shadedEllipse(x, 11, 13 + sq * 0.5, 8, 7.6 - sq * 0.6, '#3f3558', '#2c2440', '#564a7c');
        // belly patch with spots
        ellipse(x, 11, 15.4 + sq * 0.5, 4.4, 3.8 - sq * 0.4, '#564a7c');
        x.fillStyle = 'rgba(34,26,52,0.7)';
        x.fillRect(9.4, 14.6 + sq * 0.5, 1.1, 1.1);
        x.fillRect(12.4, 15.8 + sq * 0.5, 1.1, 1.1);
        // tiger loincloth
        stripeBand(x, 11, 19 + sq * 0.4, 9, 3, 3, '#d8a23a', '#241c14');
        // claws (feet)
        x.fillStyle = '#e8dcc4';
        for (const cx2 of [7.2, 9.2, 12.8, 14.8]) {
          poly(x, [[cx2 - 0.8, 20.6], [cx2, 22], [cx2 + 0.8, 20.6]], '#e8dcc4');
        }
        // horns (shaded)
        poly(x, [[6.5, 8 + sq], [5, 3 + sq], [8.5, 6.5 + sq]], '#e8dcc4', OUT);
        poly(x, [[15.5, 8 + sq], [17, 3 + sq], [13.5, 6.5 + sq]], '#e8dcc4', OUT);
        x.strokeStyle = 'rgba(140,120,90,0.7)'; x.lineWidth = 0.7;
        x.beginPath(); x.moveTo(6, 6.4 + sq); x.lineTo(7.2, 6.8 + sq); x.stroke();
        x.beginPath(); x.moveTo(16, 6.4 + sq); x.lineTo(14.8, 6.8 + sq); x.stroke();
        // wild hair tuft
        spikeArc(x, 11, 8.5 + sq, 2.6, Math.PI * 1.15, Math.PI * 1.85, 4, 2.6, '#241c30');
        // eyes with slit pupils
        eyeGlow(x, 8, 11.5 + sq * 0.4, 2.7, '#ffb14a', 'rgba(60,28,8,0.85)');
        eyeGlow(x, 14, 11.5 + sq * 0.4, 2.7, '#ffb14a', 'rgba(60,28,8,0.85)');
        // grin + fangs
        x.strokeStyle = '#1a1424'; x.lineWidth = 1;
        x.beginPath(); x.arc(11, 14.6 + sq * 0.4, 2.8, 0.3, Math.PI - 0.3); x.stroke();
        poly(x, [[8.6, 15.6 + sq * 0.4], [9.5, 17.6 + sq * 0.4], [10.3, 15.9 + sq * 0.4]], '#f0ead8');
        poly(x, [[11.7, 15.9 + sq * 0.4], [12.5, 17.6 + sq * 0.4], [13.4, 15.6 + sq * 0.4]], '#f0ead8');
      }, { ay: 21, shade: true, rim: RIM_FOE });
      mkWhite('e_imp_' + f);
    }

    // 油赤子 aburaakago — 油でぬめる嬰児の妖。大きな吸い口で灯火を舐め尽くす
    for (let f = 0; f < 2; f++) {
      mk('e_aburaakago_' + f, 24, 24, (x) => {
        const op = f ? 1.7 : 0;   // 口の開閉
        // 油でぬめる体
        shadedEllipse(x, 12, 13, 8.5, 8, '#2b3a31', '#16221d', '#415a4a');
        // 脂のテカり
        ellipse(x, 9.3, 9, 2.3, 1.4, 'rgba(180,255,210,0.22)');
        // 短い手足
        ellipse(x, 4.6, 16.4, 2.2, 1.8, '#1b2a22');
        ellipse(x, 19.4, 16.4, 2.2, 1.8, '#1b2a22');
        // 大きな吸い口 (油を啜る)
        ellipse(x, 12, 17 + op * 0.3, 4 + op * 0.5, 3 + op, '#0a0f0c');
        ellipse(x, 12, 17.4 + op * 0.3, 2.3, 1.3 + op * 0.6, 'rgba(120,200,150,0.5)');   // 口内の燐光
        // 嬰児の前髪
        spikeArc(x, 12, 7, 2.4, Math.PI * 1.1, Math.PI * 1.9, 4, 2.2, '#101813');
        // 燐光の眼
        eyeGlow(x, 8.6, 11.4, 2.6, '#9effc0', 'rgba(10,30,18,0.85)');
        eyeGlow(x, 15.4, 11.4, 2.6, '#9effc0', 'rgba(10,30,18,0.85)');
        // 油の雫
        ellipse(x, 12, 22.2 + op * 0.3, 1.1, 1.7, 'rgba(150,230,180,0.5)');
      }, { ay: 22, shade: true, rim: RIM_FOE });
      mkWhite('e_aburaakago_' + f);
    }

    // 蝙蝠 bat — membrane gradient, finger bones, fur, fangs
    for (let f = 0; f < 2; f++) {
      mk('e_bat_' + f, 28, 18, (x) => {
        const up = f ? -3.5 : 2.5;
        // wings: gradient membrane with scalloped trailing edge
        for (const dir of [-1, 1]) {
          const wx = 14 + dir * 0;
          x.save();
          const g = x.createLinearGradient(14, 9, 14 + dir * 13, 5 + up);
          g.addColorStop(0, '#6a58a4');
          g.addColorStop(1, '#3c3066');
          x.fillStyle = g;
          x.beginPath();
          x.moveTo(14, 9);
          x.lineTo(14 + dir * 9.5, 9 + up);
          x.lineTo(14 + dir * 13, 5 + up);
          x.quadraticCurveTo(14 + dir * 10, 7.2 + up * 0.6, 14 + dir * 8, 8.4 + up * 0.5);
          x.quadraticCurveTo(14 + dir * 6, 9.4, 14, 9);
          x.closePath(); x.fill();
          x.strokeStyle = OUT; x.lineWidth = 1; x.stroke();
          // finger bones
          x.strokeStyle = 'rgba(24,16,44,0.85)'; x.lineWidth = 0.9;
          x.beginPath(); x.moveTo(14, 9); x.lineTo(14 + dir * 9.5, 8.6 + up); x.stroke();
          x.beginPath(); x.moveTo(14, 9); x.lineTo(14 + dir * 12, 5.6 + up); x.stroke();
          x.restore();
        }
        // furry body
        shadedEllipse(x, 14, 9.5, 4, 4.8, '#3c3458', '#2a2342', '#574a82');
        spikeArc(x, 14, 11.5, 2.4, Math.PI * 0.15, Math.PI * 0.85, 4, 1.8, '#3c3458');
        // ears with inner
        poly(x, [[11.8, 6], [11, 2.6], [13.2, 5.2]], '#3c3458', OUT);
        poly(x, [[16.2, 6], [17, 2.6], [14.8, 5.2]], '#3c3458', OUT);
        x.fillStyle = '#6a5080';
        poly(x, [[11.9, 5.6], [11.5, 3.6], [12.7, 5.2]], '#6a5080');
        poly(x, [[16.1, 5.6], [16.5, 3.6], [15.3, 5.2]], '#6a5080');
        // eyes + tiny fangs
        eyeGlow(x, 12.4, 8.4, 1.9, '#ff5a4a');
        eyeGlow(x, 15.6, 8.4, 1.9, '#ff5a4a');
        x.fillStyle = '#f0ead8';
        poly(x, [[12.6, 11.4], [13.2, 12.8], [13.8, 11.5]], '#f0ead8');
        poly(x, [[14.2, 11.5], [14.8, 12.8], [15.4, 11.4]], '#f0ead8');
      }, { shade: true, rim: RIM_FOE });
      mkWhite('e_bat_' + f);
    }

    // 提灯お化け chochin-obake — torn paper, hanging ring, long tongue
    for (let f = 0; f < 2; f++) {
      mk('e_lantern_' + f, 24, 32, (x) => {
        const sway = f ? 1 : -1;
        x.save();
        x.translate(12 + sway, 0);
        // hanging ring + caps
        x.strokeStyle = '#4a3826'; x.lineWidth = 1.4;
        x.beginPath(); x.arc(0, 1.4, 1.8, 0, G.TAU); x.stroke();
        x.fillStyle = '#3a2c20';
        x.fillRect(-5, 3, 10, 2.8);
        x.fillStyle = '#52402c';
        x.fillRect(-5, 3, 10, 1);
        x.fillStyle = '#3a2c20';
        x.fillRect(-5, 25.5, 10, 2.6);
        // paper body with warm inner-light gradient
        const g = x.createRadialGradient(-1, 14, 2, 0, 15.6, 10.5);
        g.addColorStop(0, '#ffd98e');
        g.addColorStop(0.55, '#f0ac56');
        g.addColorStop(1, '#c9853c');
        x.fillStyle = g;
        x.beginPath(); x.ellipse(0, 15.6, 8.8, 11, 0, 0, G.TAU); x.fill();
        x.strokeStyle = OUT; x.lineWidth = 1.3; x.stroke();
        // ribs
        x.strokeStyle = 'rgba(116,58,14,0.6)'; x.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
          const ry = 7.2 + i * 4.1;
          x.beginPath(); x.moveTo(-8.6, ry); x.quadraticCurveTo(0, ry + 1.7, 8.6, ry); x.stroke();
        }
        // torn rip on the side (dark with curled paper edge)
        poly(x, [[5.2, 9.5], [8.2, 11.5], [6.4, 12.5], [8, 14.5], [5, 14]], '#52301a');
        x.strokeStyle = '#ffd98e'; x.lineWidth = 0.7;
        x.beginPath(); x.moveTo(5.2, 9.5); x.lineTo(8.2, 11.5); x.stroke();
        // single eye with iris
        circle(x, -1.4, 12, 3.5, '#fff6e0', OUT);
        circle(x, -1, 12.4, 1.9, '#8a5a1c');
        circle(x, -1, 12.4, 1, '#241c14');
        circle(x, -1.7, 11.6, 0.6, '#fffdf2');
        // grinning mouth + long wavy tongue
        x.fillStyle = '#5a2018';
        x.beginPath(); x.arc(0, 19.8, 3.8, 0.12, Math.PI - 0.12); x.fill();
        x.strokeStyle = '#f0ead8'; x.lineWidth = 0.8;
        x.beginPath(); x.moveTo(-2.6, 20.4); x.lineTo(2.6, 20.4); x.stroke();
        x.fillStyle = '#d04838';
        x.beginPath();
        x.moveTo(-1.6, 21.5);
        x.quadraticCurveTo(-1 + sway, 25, 0.4 + sway, 27.5);
        x.quadraticCurveTo(1.8 + sway, 26, 1.8, 21.8);
        x.closePath(); x.fill();
        x.strokeStyle = '#8a2030'; x.lineWidth = 0.6;
        x.beginPath(); x.moveTo(0, 21.8); x.quadraticCurveTo(0.4 + sway * 0.7, 24.5, 0.4 + sway, 26.8); x.stroke();
        x.restore();
      }, { shade: true, rim: RIM_FOE });
      mkWhite('e_lantern_' + f);
    }

    // 傘お化け kasa-obake — paper gradient, patch, one-tooth geta
    for (let f = 0; f < 2; f++) {
      mk('e_kasa_' + f, 24, 34, (x) => {
        const tilt = f ? 0.18 : -0.1;
        x.save();
        x.translate(12, 13); x.rotate(tilt);
        // umbrella cone: radial paper gradient
        const g = x.createLinearGradient(0, -12, 0, 4);
        g.addColorStop(0, '#7a589a');
        g.addColorStop(1, '#4c3460');
        x.fillStyle = g;
        x.beginPath(); x.moveTo(0, -12); x.lineTo(-10.5, 3.5); x.lineTo(10.5, 3.5); x.closePath(); x.fill();
        x.strokeStyle = OUT; x.lineWidth = 1.4; x.stroke();
        // ribs radiating from apex
        x.strokeStyle = 'rgba(26,16,38,0.8)'; x.lineWidth = 1;
        for (const dx of [-7.5, -4, 0, 4, 7.5]) { x.beginPath(); x.moveTo(0, -12); x.lineTo(dx, 3.5); x.stroke(); }
        // top knob
        circle(x, 0, -12.2, 1.4, '#3a2848', OUT);
        // lighter paper patch (継ぎ当て)
        x.save();
        x.translate(-4.6, -2.4); x.rotate(-0.15);
        x.fillStyle = 'rgba(220,196,160,0.85)';
        x.fillRect(-2.2, -2.2, 4.4, 4.4);
        x.strokeStyle = 'rgba(90,60,30,0.7)'; x.lineWidth = 0.6;
        x.setLineDash([1.2, 1]);
        x.strokeRect(-2.2, -2.2, 4.4, 4.4);
        x.setLineDash([]);
        x.restore();
        // sheen band
        x.strokeStyle = 'rgba(236,210,170,0.4)'; x.lineWidth = 1.7;
        x.beginPath(); x.moveTo(-7.8, 0.8); x.quadraticCurveTo(0, -2.4, 7.8, 0.8); x.stroke();
        // eye with iris + highlight
        circle(x, 1, -3, 3.5, '#fff6e0', OUT);
        circle(x, 1.4, -2.7, 1.9, '#6a4a18');
        circle(x, 1.4, -2.7, 1, '#241c14');
        circle(x, 0.7, -3.4, 0.6, '#fffdf2');
        // tongue with centre crease
        poly(x, [[-1.8, 3.5], [0, 9.5], [2, 3.5]], '#d04838', '#8a2030');
        x.strokeStyle = '#8a2030'; x.lineWidth = 0.6;
        x.beginPath(); x.moveTo(0.1, 4); x.lineTo(0.1, 8); x.stroke();
        x.restore();
        // leg with knee + one-tooth geta
        const hop = f ? -2.2 : 0;
        x.strokeStyle = '#e0cfae'; x.lineWidth = 2.4;
        x.beginPath(); x.moveTo(12, 16.5); x.quadraticCurveTo(13, 21, 12, 28.5 + hop); x.stroke();
        x.fillStyle = '#3a2c20';
        x.fillRect(8, 28.5 + hop, 8, 2.2);
        x.fillRect(11, 30.7 + hop, 2, 2.6);
        x.strokeStyle = '#c0392b'; x.lineWidth = 0.9;
        x.beginPath(); x.moveTo(12, 28.5 + hop); x.lineTo(9.5, 30 + hop); x.stroke();
      }, { ay: 32, shade: true, rim: RIM_FOE });
      mkWhite('e_kasa_' + f);
    }

    // 骸骨武者 skeleton samurai — broken kabuto, shoulder plate, sword stub
    for (let f = 0; f < 2; f++) {
      mk('e_skel_' + f, 26, 33, (x) => {
        const step = f ? 1.4 : -1.4;
        // legs
        x.strokeStyle = '#e4e7ee'; x.lineWidth = 2.4;
        x.beginPath(); x.moveTo(11, 23); x.lineTo(10 + step, 31); x.stroke();
        x.beginPath(); x.moveTo(15, 23); x.lineTo(16 - step, 31); x.stroke();
        x.fillStyle = '#c9ccd6';
        circle(x, 11, 23, 1.3, '#c9ccd6');
        circle(x, 15, 23, 1.3, '#c9ccd6');
        // arms (sword arm holds a broken blade)
        x.strokeStyle = '#e4e7ee'; x.lineWidth = 2;
        x.beginPath(); x.moveTo(9, 16.5); x.lineTo(5 - step, 22); x.stroke();
        x.beginPath(); x.moveTo(17, 16.5); x.lineTo(21 + step, 22); x.stroke();
        // broken katana stub in right hand
        x.save();
        x.translate(21 + step, 22); x.rotate(-0.8 + step * 0.05);
        x.fillStyle = '#cfd6e4'; x.fillRect(-0.8, -7.5, 1.6, 7.5);
        poly(x, [[-0.8, -7.5], [1.2, -9], [0.8, -7]], '#cfd6e4');
        x.fillStyle = '#3a2c20'; x.fillRect(-1, 0, 2, 2.6);
        x.fillStyle = '#d8a23a'; x.fillRect(-1.6, -0.8, 3.2, 1);
        x.restore();
        // ribcage + spine
        x.strokeStyle = '#e4e7ee'; x.lineWidth = 1.8;
        for (let i = 0; i < 3; i++) {
          x.beginPath(); x.moveTo(8.4, 16 + i * 2.6); x.quadraticCurveTo(13, 18 + i * 2.6, 17.6, 16 + i * 2.6); x.stroke();
        }
        x.beginPath(); x.moveTo(13, 13.5); x.lineTo(13, 23); x.stroke();
        // rusted shoulder plate (sode) on the left
        poly(x, [[6.2, 14.5], [10.4, 14], [10.8, 18.5], [6.4, 19.5]], '#6a4a38', '#3a281e');
        x.strokeStyle = '#8a6048'; x.lineWidth = 0.8;
        x.beginPath(); x.moveTo(6.4, 16.2); x.lineTo(10.5, 15.7); x.stroke();
        x.beginPath(); x.moveTo(6.5, 17.9); x.lineTo(10.7, 17.3); x.stroke();
        // skull with jaw
        shadedCircle(x, 13, 8, 5.4, '#e8ebf2', 'rgba(150,156,176,0.5)', 'rgba(255,255,255,0.8)');
        x.fillStyle = '#e8ebf2';
        x.fillRect(10.2, 11, 5.6, 3);
        // cracked line on skull
        x.strokeStyle = 'rgba(110,116,140,0.8)'; x.lineWidth = 0.7;
        x.beginPath(); x.moveTo(15.5, 4); x.lineTo(14.6, 6.2); x.lineTo(15.6, 7.4); x.stroke();
        // broken kabuto (helmet) + gold crescent maedate
        x.fillStyle = '#42351f';
        x.beginPath(); x.arc(13, 6.2, 5.6, Math.PI * 1.05, Math.PI * 1.95); x.fill();
        x.strokeStyle = OUT; x.lineWidth = 1; x.stroke();
        x.fillStyle = '#564429';
        x.beginPath(); x.arc(13, 6.2, 5.6, Math.PI * 1.05, Math.PI * 1.4); x.fill();
        x.strokeStyle = '#d8a23a'; x.lineWidth = 1.4;
        x.beginPath(); x.arc(13, 3.2, 3.2, Math.PI * 1.2, Math.PI * 1.8); x.stroke();
        // eye sockets + cyan soul fire
        circle(x, 10.8, 7.8, 1.8, '#10131e');
        circle(x, 15.2, 7.8, 1.8, '#10131e');
        eyeGlow(x, 10.8, 7.8, 1.5, '#7ee8ff');
        eyeGlow(x, 15.2, 7.8, 1.5, '#7ee8ff');
        // nose + teeth
        x.fillStyle = '#10131e';
        x.fillRect(12.4, 9.8, 1.2, 1.2);
        x.fillRect(10.6, 12.2, 0.9, 1.5); x.fillRect(12.5, 12.2, 0.9, 1.5); x.fillRect(14.4, 12.2, 0.9, 1.5);
      }, { ay: 32, shade: true, rim: RIM_FOE });
      mkWhite('e_skel_' + f);
    }

    // 鬼火 onibi — a skull face flickering inside layered soul-fire
    for (let f = 0; f < 2; f++) {
      mk('e_onibi_' + f, 22, 26, (x) => {
        const k = f ? 1.12 : 1;
        // outer glow
        radial(x, 11, 14, 10 * k, [[0, 'rgba(190,240,255,0.9)'], [0.4, 'rgba(110,210,235,0.7)'], [0.8, 'rgba(40,120,160,0.22)'], [1, 'rgba(0,0,0,0)']]);
        // layered flame tongues
        x.fillStyle = 'rgba(120,210,245,0.8)';
        x.beginPath();
        x.moveTo(11, 2 * (f ? 0.7 : 1));
        x.quadraticCurveTo(16, 8, 11 + (f ? -2.4 : 2.4), 13);
        x.quadraticCurveTo(6.5, 8.5, 11, 2 * (f ? 0.7 : 1));
        x.fill();
        x.fillStyle = 'rgba(170,235,255,0.7)';
        x.beginPath();
        x.moveTo(6.4, 6 + (f ? 1.4 : 0));
        x.quadraticCurveTo(8.4, 9.5, 7.4, 12.5);
        x.quadraticCurveTo(5, 9.5, 6.4, 6 + (f ? 1.4 : 0));
        x.fill();
        x.beginPath();
        x.moveTo(15.6, 6.6 - (f ? 1.4 : 0));
        x.quadraticCurveTo(13.8, 9.8, 14.8, 12.6);
        x.quadraticCurveTo(17.2, 9.8, 15.6, 6.6 - (f ? 1.4 : 0));
        x.fill();
        // ghostly skull face inside
        x.fillStyle = 'rgba(255,255,255,0.55)';
        x.beginPath(); x.ellipse(11, 14.5, 5.2, 5.8, 0, 0, G.TAU); x.fill();
        x.fillStyle = 'rgba(8,42,58,0.9)';
        x.beginPath(); x.ellipse(8.9, 13.6, 1.5, 2, 0.18, 0, G.TAU); x.fill();
        x.beginPath(); x.ellipse(13.1, 13.6, 1.5, 2, -0.18, 0, G.TAU); x.fill();
        // grinning gap teeth
        x.fillRect(9, 17.6, 0.9, 1.6);
        x.fillRect(10.6, 17.8, 0.9, 1.6);
        x.fillRect(12.2, 17.6, 0.9, 1.6);
      });
      mkWhite('e_onibi_' + f);
    }

    // 赤鬼 red oni — kanabo club, tiger loincloth, wild mane
    for (let f = 0; f < 2; f++) {
      mk('e_oni_' + f, 32, 31, (x) => {
        const sq = f ? 1.2 : 0;
        // kanabo club in right paw
        x.save();
        x.translate(26, 14 + sq); x.rotate(0.42 + (f ? 0.06 : 0));
        x.fillStyle = '#4a3a2c';
        x.fillRect(-1.8, -11.5, 3.6, 15);
        x.strokeStyle = OUT; x.lineWidth = 1; x.strokeRect(-1.8, -11.5, 3.6, 15);
        x.fillStyle = '#8a8070';
        for (let i = 0; i < 3; i++) circle(x, -0.6 + (i % 2) * 1.4, -9 + i * 3.4, 0.8, '#9a9080');
        x.restore();
        // legs
        x.fillStyle = '#962e22';
        x.fillRect(10 + (f ? 1 : 0), 24, 4.6, 5.5);
        x.fillRect(17.4 - (f ? 1 : 0), 24, 4.6, 5.5);
        // body two-tone + pec line
        shadedEllipse(x, 16, 16.5 + sq * 0.4, 9.8, 9 - sq * 0.4, '#d04838', '#9c2c1e', '#ec7050');
        x.strokeStyle = 'rgba(90,18,10,0.8)'; x.lineWidth = 1.1;
        x.beginPath(); x.moveTo(11.5, 15 + sq * 0.4); x.quadraticCurveTo(16, 17.6, 20.5, 15 + sq * 0.4); x.stroke();
        x.beginPath(); x.moveTo(16, 17.5 + sq * 0.4); x.lineTo(16, 21 + sq * 0.4); x.stroke();
        // tiger loincloth
        stripeBand(x, 16, 23 + sq * 0.3, 11, 3.6, 4, '#d8a23a', '#241c14');
        // arms
        ellipse(x, 5.8, 16.5 + sq, 2.8, 4.6, '#d04838');
        x.strokeStyle = OUT; x.lineWidth = 1.2; x.stroke();
        // wrist cuff
        x.fillStyle = '#241c14';
        x.fillRect(4, 19.5 + sq, 4, 1.6);
        // horns with ridges
        poly(x, [[10.5, 8.5 + sq], [8.8, 2.4 + sq], [13, 7 + sq]], '#f0e4d0', OUT);
        poly(x, [[21.5, 8.5 + sq], [23.2, 2.4 + sq], [19, 7 + sq]], '#f0e4d0', OUT);
        x.strokeStyle = 'rgba(150,128,96,0.8)'; x.lineWidth = 0.7;
        x.beginPath(); x.moveTo(9.8, 5.6 + sq); x.lineTo(11.5, 6.2 + sq); x.stroke();
        x.beginPath(); x.moveTo(22.2, 5.6 + sq); x.lineTo(20.5, 6.2 + sq); x.stroke();
        // wild mane
        spikeArc(x, 16, 9.5 + sq, 4.4, Math.PI * 1.08, Math.PI * 1.92, 6, 3, '#241c14');
        ellipse(x, 16, 9 + sq, 6, 3, '#241c14');
        // fierce eyes + heavy brows
        eyeGlow(x, 12.4, 13.8 + sq * 0.4, 2.5, '#ffd166', 'rgba(70,30,8,0.9)');
        eyeGlow(x, 19.6, 13.8 + sq * 0.4, 2.5, '#ffd166', 'rgba(70,30,8,0.9)');
        x.strokeStyle = '#241c14'; x.lineWidth = 1.3;
        x.beginPath(); x.moveTo(10.4, 11.8 + sq * 0.4); x.lineTo(13.8, 12.6 + sq * 0.4); x.stroke();
        x.beginPath(); x.moveTo(21.6, 11.8 + sq * 0.4); x.lineTo(18.2, 12.6 + sq * 0.4); x.stroke();
        // grin + fangs
        x.strokeStyle = '#241c14'; x.lineWidth = 1.4;
        x.beginPath(); x.arc(16, 17 + sq * 0.4, 3.8, 0.25, Math.PI - 0.25); x.stroke();
        poly(x, [[12.6, 18 + sq * 0.4], [13.5, 20.4 + sq * 0.4], [14.3, 18.3 + sq * 0.4]], '#f0ead8');
        poly(x, [[17.7, 18.3 + sq * 0.4], [18.5, 20.4 + sq * 0.4], [19.4, 18 + sq * 0.4]], '#f0ead8');
      }, { ay: 30, shade: true, rim: RIM_FOE });
      mkWhite('e_oni_' + f);
    }

    // 大入道 onyudo — one huge eye, rope belt, sutra-marked robe
    for (let f = 0; f < 2; f++) {
      mk('e_nyudo_' + f, 38, 48, (x) => {
        const lean = f ? 1.4 : -1.4;
        // robe with hem shadow
        poly(x, [[19 + lean, 7], [31, 17], [34, 46], [4, 46], [7, 17]], '#3c4c72', OUT);
        x.save();
        x.beginPath();
        x.moveTo(19 + lean, 7); x.lineTo(31, 17); x.lineTo(34, 46); x.lineTo(4, 46); x.lineTo(7, 17);
        x.closePath(); x.clip();
        // fold shadows
        x.fillStyle = 'rgba(14,22,44,0.55)';
        poly(x, [[12, 22], [15 + lean, 30], [13, 46], [8, 46], [9, 26]], 'rgba(14,22,44,0.55)');
        poly(x, [[27, 22], [24 + lean, 32], [26, 46], [31, 46], [30, 26]], 'rgba(14,22,44,0.55)');
        // faint sutra glyph column
        x.fillStyle = 'rgba(150,170,210,0.28)';
        for (let i = 0; i < 5; i++) {
          x.fillRect(18 + lean * 0.5, 22 + i * 4.6, 2.6, 2.6);
        }
        // hem dirt
        x.fillStyle = 'rgba(10,14,28,0.5)';
        x.fillRect(4, 43, 30, 3);
        x.restore();
        // rope belt (shimenawa style)
        x.strokeStyle = '#b89b66'; x.lineWidth = 2.4;
        x.beginPath(); x.moveTo(7.5, 24); x.quadraticCurveTo(19 + lean, 27.5, 30.5, 24); x.stroke();
        x.strokeStyle = 'rgba(90,70,40,0.7)'; x.lineWidth = 0.8;
        for (let i = 0; i < 5; i++) {
          const tx = 10 + i * 4.6;
          x.beginPath(); x.moveTo(tx, 23.4 + (i % 2)); x.lineTo(tx + 1.6, 26 + (i % 2)); x.stroke();
        }
        // bald head with shading
        shadedCircle(x, 19 + lean, 10.5, 7.8, '#4c5c84', 'rgba(40,50,80,0.6)', 'rgba(110,130,170,0.5)');
        // ONE huge eye
        ellipse(x, 19 + lean, 10.2, 4.4, 3.6, '#f4f8ff');
        x.strokeStyle = '#1a2438'; x.lineWidth = 1; x.stroke();
        circle(x, 19 + lean, 10.4, 2, '#7ee8ff');
        circle(x, 19 + lean, 10.4, 1, '#0c2030');
        circle(x, 18.2 + lean, 9.6, 0.7, '#ffffff');
        // heavy brow
        x.fillStyle = '#2c3a5a';
        x.fillRect(13.6 + lean, 5.6, 10.8, 2);
        // grim mouth + chin stubble dots
        x.strokeStyle = '#1a2438'; x.lineWidth = 1.6;
        x.beginPath(); x.moveTo(16 + lean, 15.8); x.quadraticCurveTo(19 + lean, 14.8, 22 + lean, 15.8); x.stroke();
        x.fillStyle = 'rgba(20,28,48,0.8)';
        x.fillRect(16.5 + lean, 16.8, 1, 1); x.fillRect(19 + lean, 17.2, 1, 1); x.fillRect(21.5 + lean, 16.8, 1, 1);
        // chunky prayer beads with tassel
        x.fillStyle = '#7a5640';
        for (let i = 0; i < 7; i++) {
          const a = Math.PI * (0.15 + i * 0.115);
          shadedCircle(x, 19 + lean + Math.cos(a) * -9.6, 19 + Math.sin(a) * 6.4, 1.9, '#7a5640', 'rgba(70,46,28,0.8)', 'rgba(200,160,120,0.5)', null);
        }
        x.strokeStyle = '#8a3030'; x.lineWidth = 1.2;
        x.beginPath(); x.moveTo(10.5, 23.5); x.lineTo(10, 27.5); x.stroke();
      }, { ay: 47, shade: true, rim: RIM_FOE });
      mkWhite('e_nyudo_' + f);
    }

    // 夜烏 crow-tengu — tiny tokin cap, layered feathers, fanned tail
    for (let f = 0; f < 2; f++) {
      mk('e_crow_' + f, 30, 20, (x) => {
        const up = f ? -4 : 3;
        // wings: two feather layers
        for (const dir of [-1, 1]) {
          const bx = 14 + dir * 1;
          poly(x, [[bx, 10], [bx + dir * 10, 10 + up], [bx + dir * 13.5, 6 + up], [bx + dir * 7, 9 + up * 0.4]], '#3a3260', OUT);
          poly(x, [[bx, 11], [bx + dir * 8.5, 11 + up * 0.8], [bx + dir * 10.5, 8.5 + up * 0.8], [bx + dir * 5.5, 10.4 + up * 0.3]], '#2c2648');
          // feather separations + moonlit sheen
          x.strokeStyle = 'rgba(150,170,255,0.4)'; x.lineWidth = 0.9;
          x.beginPath(); x.moveTo(bx + dir * 3, 9.8 + up * 0.3); x.lineTo(bx + dir * 11.5, 7.2 + up); x.stroke();
          x.strokeStyle = 'rgba(16,12,30,0.8)'; x.lineWidth = 0.7;
          x.beginPath(); x.moveTo(bx + dir * 5, 10 + up * 0.4); x.lineTo(bx + dir * 8, 8.8 + up * 0.8); x.stroke();
        }
        // fanned tail (3 feathers)
        poly(x, [[9.5, 10.5], [4, 13.8], [9.2, 12.2]], '#2c2648', OUT);
        poly(x, [[9.5, 10.8], [4.6, 15.4], [9.6, 12.8]], '#3a3260');
        poly(x, [[9.8, 11], [6, 16.4], [10.2, 13]], '#2c2648');
        // body with sheen
        shadedEllipse(x, 15, 10.5, 6.2, 3.9, '#2e2850', '#1e1a38', '#4a4078');
        // head
        shadedCircle(x, 19.8, 8, 3.4, '#2e2850', '#1e1a38', '#4a4078');
        // tokin cap (tengu's little black box hat) + red cord
        x.fillStyle = '#16121e';
        x.fillRect(18.2, 3.2, 4, 2.6);
        x.strokeStyle = OUT; x.lineWidth = 0.8;
        x.strokeRect(18.2, 3.2, 4, 2.6);
        x.strokeStyle = '#c0392b'; x.lineWidth = 0.7;
        x.beginPath(); x.moveTo(18.6, 5.8); x.lineTo(17.8, 8.4); x.stroke();
        x.beginPath(); x.moveTo(21.8, 5.8); x.lineTo(22.4, 8.4); x.stroke();
        // beak with open gap
        poly(x, [[22.4, 7.4], [27, 8.6], [22.6, 9.2]], '#e8b03e', '#8a5e14');
        x.strokeStyle = '#5a3c0c'; x.lineWidth = 0.6;
        x.beginPath(); x.moveTo(22.6, 8.4); x.lineTo(26, 8.7); x.stroke();
        // eye with glint
        eyeGlow(x, 19.2, 7.6, 1.9, '#ff5a4a');
        circle(x, 18.7, 7.1, 0.5, '#ffd9d2');
        // talons tucked
        x.strokeStyle = '#e8b03e'; x.lineWidth = 1;
        x.beginPath(); x.moveTo(14, 14); x.lineTo(13, 15.8); x.stroke();
        x.beginPath(); x.moveTo(16, 14.2); x.lineTo(15.4, 16); x.stroke();
      }, { shade: true, rim: RIM_FOE });
      mkWhite('e_crow_' + f);
    }

    // ろくろ首 — 着物の胴から伸びる長い首、結い髪の白い面
    for (let f = 0; f < 2; f++) {
      mk('e_rokuro_' + f, 24, 34, (x) => {
        const sw = f ? 2.2 : -2.2;
        // kimono body
        shadedEllipse(x, 12, 27, 7.5, 6.2, '#4a3a5e', '#332848', '#6a5486');
        // obi
        x.fillStyle = '#a83a4a'; x.fillRect(6, 25.4, 12, 2.6);
        x.strokeStyle = OUT; x.lineWidth = 0.8; x.strokeRect(6, 25.4, 12, 2.6);
        // collar
        poly(x, [[9, 21.8], [12, 25.6], [15, 21.8]], '#e8e0cc', OUT);
        // long swaying neck
        x.strokeStyle = OUT; x.lineWidth = 5.4;
        x.beginPath(); x.moveTo(12, 23); x.quadraticCurveTo(12 - sw * 2, 16, 12 + sw, 9); x.stroke();
        x.strokeStyle = '#e8dcc8'; x.lineWidth = 4;
        x.beginPath(); x.moveTo(12, 23); x.quadraticCurveTo(12 - sw * 2, 16, 12 + sw, 9); x.stroke();
        x.strokeStyle = 'rgba(160,130,110,0.5)'; x.lineWidth = 1;
        x.beginPath(); x.moveTo(13.4, 22.6); x.quadraticCurveTo(13.4 - sw * 2, 16, 13.2 + sw, 9.5); x.stroke();
        // pale face
        shadedCircle(x, 12 + sw, 6.5, 4.6, '#ecdfc8', '#cfbfa4', '#f8efe0');
        // hair (sweep + bun)
        x.fillStyle = '#1c1626';
        x.beginPath(); x.arc(12 + sw, 5.2, 4.7, Math.PI * 0.95, Math.PI * 2.05); x.fill();
        circle(x, 12 + sw, 2.2, 1.8, '#1c1626', OUT);
        // narrow eyes + red lips
        x.strokeStyle = '#3a2430'; x.lineWidth = 1;
        x.beginPath(); x.moveTo(10.2 + sw, 6.6); x.lineTo(11.4 + sw, 6.3); x.stroke();
        x.beginPath(); x.moveTo(12.6 + sw, 6.3); x.lineTo(13.8 + sw, 6.6); x.stroke();
        circle(x, 12 + sw, 8.6, 0.8, '#b03040');
      }, { ay: 33, shade: true, rim: RIM_FOE });
      mkWhite('e_rokuro_' + f);
    }

    // 一つ目小僧 — 大頭に単眼、僧衣、長い舌
    for (let f = 0; f < 2; f++) {
      mk('e_hitotsume_' + f, 26, 28, (x) => {
        const sq = f ? 1.2 : 0;
        // monk robe
        shadedEllipse(x, 13, 21 + sq * 0.4, 8, 6 - sq * 0.4, '#5a4632', '#42301e', '#7a6448');
        x.strokeStyle = '#2a1c10'; x.lineWidth = 0.8;
        x.beginPath(); x.moveTo(13, 16.5 + sq); x.lineTo(13, 26); x.stroke();
        // big bald head
        shadedCircle(x, 13, 10 + sq, 7.8, '#e8cfae', '#caa886', '#f6e4cc');
        // the one eye
        circle(x, 13, 9.6 + sq, 3.4, '#fdf8ee', OUT);
        eyeGlow(x, 13, 9.6 + sq, 2.0, '#ffb14a', 'rgba(60,28,8,0.9)');
        // tongue
        poly(x, [[11.4, 15 + sq], [13, 18.4 + sq], [14.6, 15 + sq]], '#c05060', '#7c2c38');
        // geta feet
        x.fillStyle = '#3a2a18';
        x.fillRect(8, 26, 4, 1.8); x.fillRect(14, 26, 4, 1.8);
      }, { ay: 27, shade: true, rim: RIM_FOE });
      mkWhite('e_hitotsume_' + f);
    }

    // 琵琶牧々 — 宙を漂う琵琶の付喪神、弦と眼
    for (let f = 0; f < 2; f++) {
      mk('e_biwa_' + f, 26, 30, (x) => {
        const up = f ? -1.4 : 1.4;
        x.save(); x.translate(13, 16 + up);
        // teardrop body
        x.beginPath();
        x.moveTo(0, -12);
        x.bezierCurveTo(7, -8, 9.5, 2, 0, 12);
        x.bezierCurveTo(-9.5, 2, -7, -8, 0, -12);
        x.closePath();
        const g = x.createLinearGradient(0, -12, 0, 12);
        g.addColorStop(0, '#7a5836'); g.addColorStop(1, '#4a3018');
        x.fillStyle = g; x.fill();
        x.strokeStyle = OUT; x.lineWidth = 1.3; x.stroke();
        // strings
        x.strokeStyle = '#e8d8b0'; x.lineWidth = 0.7;
        for (const sx of [-2.4, -0.8, 0.8, 2.4]) {
          x.beginPath(); x.moveTo(sx * 0.4, -10); x.lineTo(sx, 10); x.stroke();
        }
        x.fillStyle = '#2a1c0c'; x.fillRect(-3.4, 4.4, 6.8, 2.2);
        // neck
        x.fillStyle = '#3a2812'; x.fillRect(-1.4, -15.5, 2.8, 5);
        x.strokeStyle = OUT; x.lineWidth = 0.8; x.strokeRect(-1.4, -15.5, 2.8, 5);
        // face in the wood
        eyeGlow(x, -3, -3, 2.2, '#ffb14a', 'rgba(60,28,8,0.85)');
        eyeGlow(x, 3, -3, 2.2, '#ffb14a', 'rgba(60,28,8,0.85)');
        x.strokeStyle = '#1a1206'; x.lineWidth = 1;
        x.beginPath(); x.arc(0, 0.6, 2.2, 0.4, Math.PI - 0.4); x.stroke();
        x.restore();
      }, { shade: true, rim: RIM_FOE });
      mkWhite('e_biwa_' + f);
    }

    // 狂骨 — 髑髏と背骨が霊布を曳いて飛ぶ
    for (let f = 0; f < 2; f++) {
      mk('e_kyokotsu_' + f, 26, 24, (x) => {
        const wv = f ? 2 : -2;
        // ghost-cloth trail
        x.fillStyle = 'rgba(190,210,235,0.5)';
        x.beginPath();
        x.moveTo(9, 8);
        x.quadraticCurveTo(2, 10 + wv, 1, 16 + wv);
        x.quadraticCurveTo(7, 14, 9, 16);
        x.quadraticCurveTo(12, 13, 12, 10);
        x.closePath(); x.fill();
        // spine
        x.strokeStyle = '#cfd8e0'; x.lineWidth = 1.6;
        x.beginPath(); x.moveTo(15, 12); x.quadraticCurveTo(10, 13 + wv, 6, 12 + wv); x.stroke();
        for (const t of [0.25, 0.55, 0.85]) {
          const px = 15 - 9 * t, py = 12 + wv * t;
          x.fillStyle = '#cfd8e0'; x.fillRect(px - 0.6, py - 1.6, 1.2, 3.2);
        }
        // skull + jaw
        shadedCircle(x, 18, 9, 5, '#e8ecf2', '#b8c2cc', '#fafcff');
        x.fillStyle = '#e8ecf2';
        x.fillRect(15.5, 12.4, 5, 3);
        x.strokeStyle = OUT; x.lineWidth = 0.8; x.strokeRect(15.5, 12.4, 5, 3);
        x.strokeStyle = '#8a96a4'; x.lineWidth = 0.6;
        for (const tx of [16.6, 18, 19.4]) { x.beginPath(); x.moveTo(tx, 12.6); x.lineTo(tx, 15); x.stroke(); }
        // hollow sockets, mad glow
        ellipse(x, 16.4, 8.8, 1.2, 1.5, 'rgba(10,12,20,0.85)');
        ellipse(x, 20, 8.8, 1.2, 1.5, 'rgba(10,12,20,0.85)');
        eyeGlow(x, 16.4, 8.8, 1.0, '#6ee8ff');
        eyeGlow(x, 20, 8.8, 1.0, '#6ee8ff');
      }, { shade: true, rim: RIM_FOE });
      mkWhite('e_kyokotsu_' + f);
    }

    // 雲外鏡 — 青銅の鏡に妖しい顔が浮かぶ
    for (let f = 0; f < 2; f++) {
      mk('e_ungaikyo_' + f, 28, 30, (x) => {
        const sq = f ? 1 : 0;
        // little legs
        x.strokeStyle = '#5a4a2a'; x.lineWidth = 2;
        x.beginPath(); x.moveTo(10, 24); x.lineTo(8.5, 28.6); x.stroke();
        x.beginPath(); x.moveTo(18, 24); x.lineTo(19.5, 28.6); x.stroke();
        // bronze frame with studs
        shadedCircle(x, 14, 14 + sq, 11, '#8a6a30', '#64481c', '#b08c48');
        x.fillStyle = '#caa850';
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * G.TAU + 0.4;
          circle(x, 14 + Math.cos(a) * 9.6, 14 + sq + Math.sin(a) * 9.6, 0.9, '#caa850');
        }
        // glass
        shadedCircle(x, 14, 14 + sq, 7.4, '#aebfca', '#7e93a2', '#d8e6ee', '#4a3a18');
        // the face inside
        eyeGlow(x, 11.4, 12.6 + sq, 2.2, '#ff5a4a');
        eyeGlow(x, 16.6, 12.6 + sq, 2.2, '#ff5a4a');
        x.strokeStyle = '#502828'; x.lineWidth = 1.2;
        x.beginPath(); x.arc(14, 15.6 + sq, 3.2, 0.25, Math.PI - 0.25); x.stroke();
        poly(x, [[12, 17.4 + sq], [12.8, 19 + sq], [13.4, 17.7 + sq]], '#e8ecf0');
        poly(x, [[14.6, 17.7 + sq], [15.2, 19 + sq], [16, 17.4 + sq]], '#e8ecf0');
      }, { ay: 29, shade: true, rim: RIM_FOE });
      mkWhite('e_ungaikyo_' + f);
    }

    // 餓鬼 — 痩せ細った体に膨れた腹、伸ばす手
    for (let f = 0; f < 2; f++) {
      mk('e_gaki_' + f, 20, 22, (x) => {
        const sq = f ? 1.2 : 0;
        // reaching arms
        x.strokeStyle = '#7a8468'; x.lineWidth = 1.8;
        x.beginPath(); x.moveTo(7, 12); x.lineTo(2, 9 - sq); x.stroke();
        x.beginPath(); x.moveTo(13, 12); x.lineTo(18, 9 - sq); x.stroke();
        // swollen belly
        shadedEllipse(x, 10, 15 + sq * 0.4, 5.8, 5 - sq * 0.4, '#8a9474', '#68744e', '#a8b28e');
        circle(x, 10, 16 + sq * 0.4, 0.8, '#5a6644');
        // rib line
        x.strokeStyle = 'rgba(70,80,50,0.8)'; x.lineWidth = 0.7;
        x.beginPath(); x.moveTo(7.6, 11.6); x.lineTo(12.4, 11.6); x.stroke();
        // gaunt head
        shadedCircle(x, 10, 7 + sq, 4.2, '#8a9474', '#68744e', '#a8b28e');
        // sunken hungry eyes
        ellipse(x, 8.4, 6.6 + sq, 1.5, 1.8, 'rgba(20,26,14,0.9)');
        ellipse(x, 11.6, 6.6 + sq, 1.5, 1.8, 'rgba(20,26,14,0.9)');
        eyeGlow(x, 8.4, 6.8 + sq, 1.0, '#ffd166');
        eyeGlow(x, 11.6, 6.8 + sq, 1.0, '#ffd166');
        // gaping mouth
        ellipse(x, 10, 9.8 + sq, 1.6, 1.2, '#1a140c');
        // spindly legs
        x.strokeStyle = '#7a8468'; x.lineWidth = 1.6;
        x.beginPath(); x.moveTo(8, 19.6); x.lineTo(7.4, 21.6); x.stroke();
        x.beginPath(); x.moveTo(12, 19.6); x.lineTo(12.6, 21.6); x.stroke();
      }, { ay: 21, shade: true, rim: RIM_FOE });
      mkWhite('e_gaki_' + f);
    }

    // 死霊 — 三角頭巾の亡者、合掌して漂う
    for (let f = 0; f < 2; f++) {
      mk('e_shiryo_' + f, 22, 26, (x) => {
        const wv = f ? 1.6 : -1.6;
        // tail wisp
        x.fillStyle = 'rgba(150,190,230,0.55)';
        x.beginPath();
        x.moveTo(7, 12);
        x.quadraticCurveTo(8 + wv, 19, 6 + wv, 24);
        x.quadraticCurveTo(11, 21, 12 + wv * 0.5, 23.5);
        x.quadraticCurveTo(14.5, 19, 15, 12);
        x.closePath(); x.fill();
        // pale body
        shadedEllipse(x, 11, 9.5, 6, 7, '#b8d0e6', '#8aa8c4', '#dceaf6', 'rgba(40,60,90,0.9)');
        // praying hands
        poly(x, [[10, 12.5], [11, 9.6], [12, 12.5]], '#dceaf6', 'rgba(70,100,140,0.8)');
        // 三角頭巾
        poly(x, [[6.5, 5.5], [11, 1], [15.5, 5.5]], '#e8eef6', 'rgba(70,100,140,0.9)');
        // sorrowful eyes
        x.strokeStyle = '#2a3a52'; x.lineWidth = 1.1;
        x.beginPath(); x.moveTo(8, 7); x.lineTo(9.8, 7.9); x.stroke();
        x.beginPath(); x.moveTo(14, 7); x.lineTo(12.2, 7.9); x.stroke();
        // hitodama
        glowDot(x, 18.5, 5 - wv, 2.6, 'rgba(110,232,255,0.8)');
      }, { shade: true, rim: RIM_FOE });
      mkWhite('e_shiryo_' + f);
    }

    // 火車 — 炎を纏って疾駆する黒猫の獣
    for (let f = 0; f < 2; f++) {
      mk('e_kasha_' + f, 32, 24, (x) => {
        const rn = f ? 2 : -2;
        // flame mane
        spikeArc(x, 13, 12, 7.5, Math.PI * 0.6, Math.PI * 1.5, 6, 4.5, 'rgba(255,140,60,0.85)');
        spikeArc(x, 13, 12, 6, Math.PI * 0.65, Math.PI * 1.45, 5, 3, 'rgba(255,210,100,0.9)');
        // stretched body
        shadedEllipse(x, 16, 13, 9, 5.4, '#3a2a30', '#281a20', '#5c4248');
        // running legs
        x.strokeStyle = '#2a1c22'; x.lineWidth = 2.2;
        x.beginPath(); x.moveTo(10, 17); x.lineTo(7 - rn, 22.5); x.stroke();
        x.beginPath(); x.moveTo(14, 17.6); x.lineTo(13 + rn, 23); x.stroke();
        x.beginPath(); x.moveTo(19, 17.6); x.lineTo(18 - rn, 23); x.stroke();
        x.beginPath(); x.moveTo(23, 17); x.lineTo(25 + rn, 22.5); x.stroke();
        // head + ears
        shadedCircle(x, 24.5, 9.5, 4.6, '#3a2a30', '#281a20', '#5c4248');
        poly(x, [[21.8, 6.6], [21, 3.4], [24, 5.4]], '#3a2a30', OUT);
        poly(x, [[27.2, 6.6], [28, 3.4], [25, 5.4]], '#3a2a30', OUT);
        // burning eyes + fangs
        eyeGlow(x, 22.8, 9, 2, '#ffd166', 'rgba(80,30,0,0.9)');
        eyeGlow(x, 26.4, 9, 2, '#ffd166', 'rgba(80,30,0,0.9)');
        poly(x, [[23.2, 12], [24, 13.8], [24.7, 12.1]], '#f0ead8');
        poly(x, [[25.3, 12.1], [26, 13.8], [26.8, 12]], '#f0ead8');
        // tail flame
        glowDot(x, 6, 9 + rn * 0.5, 3, 'rgba(255,160,70,0.9)');
      }, { ay: 23, shade: true, rim: RIM_FOE });
      mkWhite('e_kasha_' + f);
    }

    // 百々目鬼 — 無数の眼を宿す影法師
    for (let f = 0; f < 2; f++) {
      mk('e_dodomeki_' + f, 28, 30, (x) => {
        const sq = f ? 1.2 : 0;
        // hunched mass
        shadedEllipse(x, 14, 17 + sq * 0.5, 10, 10.5 - sq * 0.5, '#2e2438', '#1e1828', '#4a3a58');
        // arms
        x.strokeStyle = '#241c2e'; x.lineWidth = 2.4;
        x.beginPath(); x.moveTo(6, 18); x.lineTo(3, 24 + sq); x.stroke();
        x.beginPath(); x.moveTo(22, 18); x.lineTo(25, 24 + sq); x.stroke();
        // central eye
        circle(x, 14, 12.5 + sq, 3.6, '#fdf8ee', OUT);
        eyeGlow(x, 14, 12.5 + sq, 2.2, '#ff5a4a', 'rgba(60,8,8,0.9)');
        // scattered eyes
        const eyes = [[8, 10], [20, 10], [6.5, 15], [21.5, 15], [9, 20], [19, 20], [12, 24], [16, 24], [14, 7.4]];
        for (const [ex, ey] of eyes) {
          circle(x, ex, ey + sq * 0.6, 1.6, '#f4ecd8', 'rgba(10,12,20,0.8)');
          eyeGlow(x, ex, ey + sq * 0.6, 0.9, '#ffb14a');
        }
        // grim mouth
        x.strokeStyle = '#120c1a'; x.lineWidth = 1.2;
        x.beginPath(); x.arc(14, 27 + sq * 0.3, 2.6, Math.PI + 0.4, G.TAU - 0.4); x.stroke();
      }, { ay: 29, shade: true, rim: RIM_FOE });
      mkWhite('e_dodomeki_' + f);
    }

    // 食人鬼 — 襤褸を纏う大鬼、虚ろな眼と鉤爪
    for (let f = 0; f < 2; f++) {
      mk('e_jikininki_' + f, 34, 36, (x) => {
        const sq = f ? 1.6 : 0;
        // massive body
        shadedEllipse(x, 17, 22 + sq * 0.5, 12, 11 - sq * 0.5, '#5a5244', '#423c30', '#7a7060');
        // ragged hem
        for (const hx of [8, 13, 18, 23]) {
          poly(x, [[hx - 2, 31], [hx, 35], [hx + 2, 31]], '#423c30');
        }
        // claw arms
        x.strokeStyle = '#4a4438'; x.lineWidth = 3.4;
        x.beginPath(); x.moveTo(7, 20); x.lineTo(2.5, 27 + sq); x.stroke();
        x.beginPath(); x.moveTo(27, 20); x.lineTo(31.5, 27 + sq); x.stroke();
        x.fillStyle = '#e8dcc4';
        for (const bx of [2.5, 31.5]) {
          for (let c2 = 0; c2 < 3; c2++) {
            poly(x, [[bx - 1.5 + c2 * 1.5, 27 + sq], [bx - 1.2 + c2 * 1.5, 30.4 + sq], [bx - 0.4 + c2 * 1.5, 27.2 + sq]], '#e8dcc4');
          }
        }
        // sunken head
        shadedCircle(x, 17, 10 + sq, 6.4, '#6a6250', '#4e4838', '#8a8068');
        spikeArc(x, 17, 7 + sq, 4.5, Math.PI * 1.1, Math.PI * 1.9, 5, 3, '#2e2a20');
        // hollow eyes
        ellipse(x, 14.4, 9.4 + sq, 2, 2.4, 'rgba(16,14,8,0.92)');
        ellipse(x, 19.6, 9.4 + sq, 2, 2.4, 'rgba(16,14,8,0.92)');
        eyeGlow(x, 14.4, 9.6 + sq, 1.2, '#c8e858');
        eyeGlow(x, 19.6, 9.6 + sq, 1.2, '#c8e858');
        // hungry mouth + teeth
        ellipse(x, 17, 14 + sq, 3.6, 2, '#1a140c');
        x.fillStyle = '#e8dcc4';
        for (const tx of [14.6, 16.4, 18.2]) {
          poly(x, [[tx, 12.6 + sq], [tx + 0.7, 14.2 + sq], [tx + 1.4, 12.7 + sq]], '#e8dcc4');
        }
      }, { ay: 35, shade: true, rim: RIM_FOE });
      mkWhite('e_jikininki_' + f);
    }

    // ---------- bosses ----------
    // 化け狸 — straw hat, sake jug, drum belly, striped tail
    for (let f = 0; f < 2; f++) {
      mk('b_tanuki_' + f, 70, 64, (x) => {
        const sq = f ? 2 : 0;
        // striped tail
        x.save();
        x.translate(58, 38 + sq); x.rotate(0.15);
        shadedEllipse(x, 0, 0, 9.5, 13.5, '#6a4c2c', '#4c361e', '#8a683c');
        x.fillStyle = '#42301c';
        x.fillRect(-8, -8, 16, 4.4);
        x.fillRect(-8.6, -0.5, 17.2, 4.4);
        x.restore();
        // body with shading
        shadedEllipse(x, 33, 39 + sq * 0.5, 23, 21 - sq * 0.5, '#84613e', '#5e4226', '#a8825a');
        // drum belly (tanuki-bayashi!) — pale circle with drum shading
        shadedEllipse(x, 33, 45 + sq * 0.5, 13.6, 11.4, '#ecd0a4', 'rgba(180,140,95,0.5)', 'rgba(255,245,225,0.7)', 'rgba(120,85,50,0.6)');
        x.strokeStyle = 'rgba(140,100,60,0.5)'; x.lineWidth = 1;
        x.beginPath(); x.ellipse(33, 45 + sq * 0.5, 9.2, 7.4, 0, 0, G.TAU); x.stroke();
        // paws + feet pads
        ellipse(x, 18, 58.5, 5.6, 3.6, '#6a4c2c');
        ellipse(x, 48, 58.5, 5.6, 3.6, '#6a4c2c');
        x.fillStyle = '#42301c';
        circle(x, 16.6, 58.6, 1, '#42301c'); circle(x, 19.4, 58.6, 1, '#42301c');
        circle(x, 46.6, 58.6, 1, '#42301c'); circle(x, 49.4, 58.6, 1, '#42301c');
        // sake jug (徳利) cradled in left paw
        x.save();
        x.translate(12, 42 + sq * 0.5); x.rotate(-0.18);
        x.fillStyle = '#f2ead8';
        x.beginPath();
        x.moveTo(-3.4, 8); x.quadraticCurveTo(-4.6, 0, -1.8, -3);
        x.lineTo(-1.8, -6); x.lineTo(1.8, -6); x.lineTo(1.8, -3);
        x.quadraticCurveTo(4.6, 0, 3.4, 8);
        x.closePath(); x.fill();
        x.strokeStyle = '#9a8a66'; x.lineWidth = 1; x.stroke();
        x.fillStyle = '#b8312a';
        x.font = 'bold 5px "Yu Mincho", serif'; x.textAlign = 'center';
        x.fillText('酒', 0, 4);
        x.restore();
        // head
        shadedEllipse(x, 33, 17 + sq, 14.5, 12, '#84613e', '#5e4226', '#a8825a');
        // ears
        poly(x, [[22, 8.5 + sq], [19, 1.5 + sq], [27, 5.5 + sq]], '#6a4c2c', OUT);
        poly(x, [[44, 8.5 + sq], [47, 1.5 + sq], [39, 5.5 + sq]], '#6a4c2c', OUT);
        // eye mask + glowing eyes
        ellipse(x, 26, 16 + sq, 5.6, 4.6, '#3a2a20');
        ellipse(x, 40, 16 + sq, 5.6, 4.6, '#3a2a20');
        eyeGlow(x, 26, 16 + sq, 2.9, '#ffd166', 'rgba(60,30,8,0.85)');
        eyeGlow(x, 40, 16 + sq, 2.9, '#ffd166', 'rgba(60,30,8,0.85)');
        // muzzle + nose + sly grin
        shadedEllipse(x, 33, 22.5 + sq, 5.6, 4.2, '#ecd0a4', 'rgba(180,140,95,0.45)', null, null);
        circle(x, 33, 20.8 + sq, 1.8, '#241c14');
        x.strokeStyle = '#241c14'; x.lineWidth = 1;
        x.beginPath(); x.arc(33, 23 + sq, 2.6, 0.3, Math.PI - 0.3); x.stroke();
        // straw hat (sandogasa), tilted
        x.save();
        x.translate(33, 5 + sq); x.rotate(-0.22);
        const hg = x.createLinearGradient(0, -5, 0, 3);
        hg.addColorStop(0, '#c9a85e');
        hg.addColorStop(1, '#9a7a3c');
        x.fillStyle = hg;
        x.beginPath(); x.ellipse(0, 0, 13.5, 4.6, 0, 0, G.TAU); x.fill();
        x.strokeStyle = '#5e4a1e'; x.lineWidth = 1; x.stroke();
        poly(x, [[-5, -2.5], [0, -7], [5, -2.5]], '#b8954c', '#5e4a1e');
        // weave lines
        x.strokeStyle = 'rgba(94,74,30,0.55)'; x.lineWidth = 0.7;
        x.beginPath(); x.moveTo(-10, 1); x.lineTo(10, 1); x.stroke();
        x.beginPath(); x.moveTo(-7, -1.4); x.lineTo(7, -1.4); x.stroke();
        x.restore();
      }, { ay: 62, shade: true, rim: RIM_BOSS });
      mkWhite('b_tanuki_' + f);
    }

    // 濡女 — flowing hair w/ golden comb, clawed hands, scaled neck
    for (let f = 0; f < 2; f++) {
      mk('b_nure_' + f, 52, 44, (x) => {
        const sway = f ? 2 : -2;
        // long flowing hair mass
        poly(x, [[26, 6], [5, 13 + sway], [1, 28 + sway], [11, 23.5], [7, 39], [17.5, 30], [22, 41], [28, 30.5], [37, 37], [34.5, 24], [45, 26], [41, 13]], '#1c1830', OUT);
        // hair sheen strands (blue-black)
        x.strokeStyle = 'rgba(110,110,180,0.4)'; x.lineWidth = 1.1;
        x.beginPath(); x.moveTo(11, 15 + sway); x.quadraticCurveTo(8.5, 24, 9.6, 33); x.stroke();
        x.beginPath(); x.moveTo(39, 15); x.quadraticCurveTo(37.5, 21, 35.5, 30); x.stroke();
        x.strokeStyle = 'rgba(70,70,120,0.45)'; x.lineWidth = 0.8;
        x.beginPath(); x.moveTo(17, 13 + sway * 0.6); x.quadraticCurveTo(14, 24, 15.5, 33); x.stroke();
        x.beginPath(); x.moveTo(33, 12); x.quadraticCurveTo(31.5, 22, 30, 31); x.stroke();
        // golden kushi comb tucked in hair
        x.save();
        x.translate(34.6, 8.6); x.rotate(0.5);
        x.fillStyle = '#d8a23a';
        x.beginPath(); x.arc(0, 0, 4, Math.PI, 0); x.fill();
        x.fillStyle = '#a8761c';
        for (let i = -2; i <= 2; i++) x.fillRect(i * 1.4 - 0.4, 0, 0.8, 2.2);
        x.restore();
        // pale clawed hands reaching forward
        for (const dir of [-1, 1]) {
          const hx = 26 + dir * 13, hy = 33 + (dir > 0 ? 2 : 0) + sway * 0.4;
          shadedEllipse(x, hx, hy, 3.4, 2.6, '#f0e0d0', 'rgba(170,140,130,0.5)', null, OUT);
          x.strokeStyle = '#e8d4c4'; x.lineWidth = 1;
          for (let i = -1; i <= 1; i++) {
            x.beginPath(); x.moveTo(hx + i * 1.8, hy + 1.6); x.lineTo(hx + i * 2.4, hy + 4.6); x.stroke();
          }
        }
        // face with shading
        shadedEllipse(x, 26, 19, 9.8, 11.4, '#f0e0d0', 'rgba(180,150,140,0.4)', 'rgba(255,248,240,0.75)');
        // hairline + sidelocks
        x.fillStyle = '#1c1830';
        x.beginPath(); x.arc(26, 14, 9.8, Math.PI * 1.02, Math.PI * 1.98); x.fill();
        poly(x, [[16.5, 15], [18.5, 23.5], [21, 15.5]], '#1c1830');
        poly(x, [[35.5, 15], [33.5, 23.5], [31, 15.5]], '#1c1830');
        // narrow crimson eyes with slits
        eyeGlow(x, 22, 19.5, 2.2, '#ff4a4a', 'rgba(40,4,8,0.9)');
        eyeGlow(x, 30, 19.5, 2.2, '#ff4a4a', 'rgba(40,4,8,0.9)');
        // blood-red lips + forked tongue
        x.fillStyle = '#a01828';
        ellipse(x, 26, 25.8, 2.2, 1.1, '#a01828');
        x.strokeStyle = '#d04838'; x.lineWidth = 1.2;
        x.beginPath(); x.moveTo(26, 27); x.lineTo(26 + sway, 33); x.lineTo(24 + sway, 36.5); x.stroke();
        x.beginPath(); x.moveTo(26 + sway, 33); x.lineTo(28 + sway, 36.5); x.stroke();
        // scaled neck hint below chin
        x.strokeStyle = 'rgba(70,130,130,0.6)'; x.lineWidth = 1;
        x.beginPath(); x.arc(26, 31.5, 4, Math.PI * 1.15, Math.PI * 1.85); x.stroke();
        x.beginPath(); x.arc(26, 33.8, 3.4, Math.PI * 1.15, Math.PI * 1.85); x.stroke();
      }, { shade: true, rim: RIM_BOSS });
      mkWhite('b_nure_' + f);
    }

    // 牛鬼 — six spider legs, plated carapace, gold nose ring, drool
    for (let f = 0; f < 2; f++) {
      mk('b_ushi_' + f, 96, 76, (x) => {
        const st = f ? 3 : -3;
        // six segmented legs with claw tips
        x.strokeStyle = '#2c2546'; x.lineWidth = 4.6;
        const legs = [
          [[32, 42], [10, 28 + st], [3, 54]],
          [[30, 46], [7, 40 - st], [2, 64]],
          [[30, 50], [12, 52 + st], [8, 70]],
          [[64, 42], [86, 28 - st], [93, 54]],
          [[66, 46], [89, 40 + st], [94, 64]],
          [[66, 50], [84, 52 - st], [88, 70]],
        ];
        for (const L of legs) {
          x.beginPath(); x.moveTo(L[0][0], L[0][1]);
          x.lineTo(L[1][0], L[1][1]); x.lineTo(L[2][0], L[2][1]); x.stroke();
        }
        // leg joint highlights + claw tips
        x.fillStyle = '#4a4070';
        for (const L of legs) circle(x, L[1][0], L[1][1], 2.2, '#4a4070');
        x.fillStyle = '#15101c';
        for (const L of legs) poly(x, [[L[2][0] - 1.5, L[2][1]], [L[2][0], L[2][1] + 3.5], [L[2][0] + 1.5, L[2][1]]], '#15101c');
        // carapace with plates + spot pattern
        shadedEllipse(x, 48, 44, 27, 19, '#382e54', '#251e3c', '#544880', OUT);
        x.strokeStyle = 'rgba(140,120,190,0.45)'; x.lineWidth = 1.6;
        x.beginPath(); x.moveTo(25, 39); x.quadraticCurveTo(48, 31, 71, 39); x.stroke();
        x.beginPath(); x.moveTo(28, 48); x.quadraticCurveTo(48, 41.5, 68, 48); x.stroke();
        x.beginPath(); x.moveTo(33, 56); x.quadraticCurveTo(48, 51, 63, 56); x.stroke();
        x.fillStyle = 'rgba(110,90,160,0.35)';
        circle(x, 36, 44, 2.2, 'rgba(110,90,160,0.35)');
        circle(x, 58, 42, 2.6, 'rgba(110,90,160,0.35)');
        circle(x, 48, 52, 2, 'rgba(110,90,160,0.35)');
        // bull head with shading
        shadedEllipse(x, 48, 23, 16.5, 13.5, '#4a3f60', '#322a48', '#665886');
        // horns with ridges
        x.strokeStyle = '#f0e4d0'; x.lineWidth = 4.6;
        x.beginPath(); x.moveTo(35, 19); x.quadraticCurveTo(23, 13, 21, 1.5); x.stroke();
        x.beginPath(); x.moveTo(61, 19); x.quadraticCurveTo(73, 13, 75, 1.5); x.stroke();
        x.strokeStyle = 'rgba(150,128,96,0.8)'; x.lineWidth = 1;
        x.beginPath(); x.moveTo(27.5, 12.5); x.lineTo(31, 14.5); x.stroke();
        x.beginPath(); x.moveTo(24, 7); x.lineTo(27.5, 9); x.stroke();
        x.beginPath(); x.moveTo(68.5, 12.5); x.lineTo(65, 14.5); x.stroke();
        x.beginPath(); x.moveTo(72, 7); x.lineTo(68.5, 9); x.stroke();
        // shaggy brow fur
        spikeArc(x, 48, 15, 8, Math.PI * 1.1, Math.PI * 1.9, 7, 3.4, '#382e54');
        // muzzle + gold nose ring + nostrils
        shadedEllipse(x, 48, 30.5, 8.4, 5.6, '#665a7e', 'rgba(60,50,80,0.6)', null, null);
        circle(x, 44.4, 29.6, 1.7, '#15101c');
        circle(x, 51.6, 29.6, 1.7, '#15101c');
        x.strokeStyle = '#d8a23a'; x.lineWidth = 1.6;
        x.beginPath(); x.arc(48, 33.5, 3, 0.15, Math.PI - 0.15); x.stroke();
        // burning eyes
        eyeGlow(x, 39.5, 20, 3.6, '#ff7a3c', 'rgba(60,16,4,0.9)');
        eyeGlow(x, 56.5, 20, 3.6, '#ff7a3c', 'rgba(60,16,4,0.9)');
        // fangs + drool strand
        poly(x, [[41.5, 34.5], [43.5, 40.5], [45.5, 35]], '#f0e4d0');
        poly(x, [[50.5, 35], [52.5, 40.5], [54.5, 34.5]], '#f0e4d0');
        x.strokeStyle = 'rgba(180,230,230,0.55)'; x.lineWidth = 1;
        x.beginPath(); x.moveTo(52.5, 40.5); x.quadraticCurveTo(53 + st * 0.3, 44, 52.5 + st * 0.4, 47); x.stroke();
        circle(x, 52.5 + st * 0.4, 47.6, 1, 'rgba(180,230,230,0.55)');
      }, { ay: 72, shade: true, rim: RIM_BOSS });
      mkWhite('b_ushi_' + f);
    }

    // 酒呑童子 — studded kanabo, sake gourd, chest scar, ringed horns
    for (let f = 0; f < 2; f++) {
      mk('b_shuten_' + f, 100, 100, (x) => {
        const sq = f ? 2.4 : 0;
        // kanabo (heavily studded, shaded)
        x.save();
        x.translate(83, 56 + sq); x.rotate(0.32 + (f ? 0.05 : 0));
        const kg = x.createLinearGradient(-4.5, 0, 4.5, 0);
        kg.addColorStop(0, '#6a543c');
        kg.addColorStop(0.5, '#4a3a28');
        kg.addColorStop(1, '#32261a');
        x.fillStyle = kg;
        x.fillRect(-5, -40, 10, 55);
        x.strokeStyle = OUT; x.lineWidth = 1.8; x.strokeRect(-5, -40, 10, 55);
        x.fillStyle = '#9a9080';
        for (let r2 = 0; r2 < 6; r2++) for (let c2 = 0; c2 < 2; c2++) {
          shadedCircle(x, -2.2 + c2 * 4.4, -35 + r2 * 7, 1.4, '#aaa092', 'rgba(80,72,60,0.8)', 'rgba(240,238,230,0.7)', null);
        }
        // grip wrap
        x.strokeStyle = '#241c14'; x.lineWidth = 1;
        for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(-5, 4 + i * 2.6); x.lineTo(5, 6 + i * 2.6); x.stroke(); }
        x.restore();
        // legs
        x.fillStyle = '#8a2a1c';
        x.fillRect(30 + (f ? 2 : 0), 82, 13, 16);
        x.fillRect(54 - (f ? 2 : 0), 82, 13, 16);
        x.fillStyle = 'rgba(40,10,6,0.5)';
        x.fillRect(30 + (f ? 2 : 0), 92, 13, 6);
        x.fillRect(54 - (f ? 2 : 0), 92, 13, 6);
        // tiger loincloth
        poly(x, [[28, 70 + sq * 0.4], [70, 70 + sq * 0.4], [66, 86], [32, 86]], '#e0ab42', OUT);
        x.fillStyle = '#241c14';
        for (let i = 0; i < 4; i++) poly(x, [[33 + i * 9, 70.5 + sq * 0.4], [37 + i * 9, 70.5 + sq * 0.4], [35 + i * 9, 85]], '#241c14');
        // torso two-tone + chest scar
        shadedEllipse(x, 49, 52 + sq * 0.5, 26, 22 - sq * 0.5, '#bc3e2c', '#8a2418', '#e0604a');
        x.strokeStyle = 'rgba(68,14,9,0.85)'; x.lineWidth = 1.8;
        x.beginPath(); x.moveTo(38, 48 + sq * 0.5); x.quadraticCurveTo(49, 54, 60, 48 + sq * 0.5); x.stroke();
        x.beginPath(); x.moveTo(49, 54); x.lineTo(49, 68); x.stroke();
        x.beginPath(); x.moveTo(40, 56 + sq * 0.5); x.quadraticCurveTo(44, 60, 43, 65); x.stroke();
        x.beginPath(); x.moveTo(58, 56 + sq * 0.5); x.quadraticCurveTo(54, 60, 55, 65); x.stroke();
        // old X scar (pale)
        x.strokeStyle = 'rgba(255,210,190,0.65)'; x.lineWidth = 1.6;
        x.beginPath(); x.moveTo(38, 40 + sq * 0.5); x.lineTo(45, 48 + sq * 0.5); x.stroke();
        x.beginPath(); x.moveTo(45, 40 + sq * 0.5); x.lineTo(38, 48 + sq * 0.5); x.stroke();
        // arms
        shadedEllipse(x, 20, 52 + sq, 7.6, 13.4, '#bc3e2c', '#8a2418', '#e0604a');
        shadedEllipse(x, 78, 52 + sq, 7.6, 13.4, '#bc3e2c', '#8a2418', '#e0604a');
        // sake gourd (red hyotan) on hip cord
        x.save();
        x.translate(24, 68 + sq * 0.5); x.rotate(-0.2);
        x.strokeStyle = '#3a2a18'; x.lineWidth = 1.2;
        x.beginPath(); x.moveTo(0, -7); x.lineTo(2, -12); x.stroke();
        x.fillStyle = '#a82a20';
        circle(x, 0, -4.5, 3, '#a82a20');
        ellipse(x, 0, 1, 4.2, 4.8, '#a82a20');
        x.strokeStyle = OUT; x.lineWidth = 1.1;
        x.beginPath(); x.ellipse(0, 1, 4.2, 4.8, 0, 0, G.TAU); x.stroke();
        x.strokeStyle = '#d8a23a'; x.lineWidth = 0.9;
        x.beginPath(); x.moveTo(-3.4, -2.6); x.quadraticCurveTo(0, -1, 3.4, -2.6); x.stroke();
        x.fillStyle = 'rgba(255,230,210,0.4)';
        ellipse(x, -1.4, -0.4, 1.2, 2, 'rgba(255,230,210,0.4)');
        x.restore();
        // wild white mane (spiked)
        circle(x, 49, 22 + sq, 19, '#eee8d6');
        x.strokeStyle = OUT; x.lineWidth = 2; x.stroke();
        spikeArc(x, 49, 22 + sq, 17, -Math.PI * 1.05, Math.PI * 0.05, 9, 8, '#eee8d6');
        x.fillStyle = 'rgba(180,172,150,0.5)';
        spikeArc(x, 49, 22 + sq, 16, -Math.PI * 0.95, -Math.PI * 0.45, 4, 5, 'rgba(180,172,150,0.5)');
        // face
        shadedEllipse(x, 49, 25 + sq, 13.6, 12.2, '#d04838', '#a02c1e', '#ec7050');
        // ringed gold horns
        poly(x, [[38, 14 + sq], [33, 1.5 + sq], [43.5, 10 + sq]], '#ffd166', OUT);
        poly(x, [[60, 14 + sq], [65, 1.5 + sq], [54.5, 10 + sq]], '#ffd166', OUT);
        x.strokeStyle = '#a8761c'; x.lineWidth = 1;
        x.beginPath(); x.moveTo(35.4, 8.5 + sq); x.lineTo(40, 10.5 + sq); x.stroke();
        x.beginPath(); x.moveTo(34.2, 5 + sq); x.lineTo(38, 6.8 + sq); x.stroke();
        x.beginPath(); x.moveTo(62.6, 8.5 + sq); x.lineTo(58, 10.5 + sq); x.stroke();
        x.beginPath(); x.moveTo(63.8, 5 + sq); x.lineTo(60, 6.8 + sq); x.stroke();
        // fierce brows + burning eyes
        x.fillStyle = '#241c14';
        poly(x, [[38.5, 19 + sq], [46, 20.6 + sq], [45.6, 22.2 + sq], [38.8, 20.8 + sq]], '#241c14');
        poly(x, [[59.5, 19 + sq], [52, 20.6 + sq], [52.4, 22.2 + sq], [59.2, 20.8 + sq]], '#241c14');
        eyeGlow(x, 43, 23 + sq, 3.5, '#ffd166', 'rgba(80,32,6,0.9)');
        eyeGlow(x, 55, 23 + sq, 3.5, '#ffd166', 'rgba(80,32,6,0.9)');
        // grin with fangs (up + down)
        x.strokeStyle = '#241c14'; x.lineWidth = 2;
        x.beginPath(); x.arc(49, 28.5 + sq, 7.2, 0.2, Math.PI - 0.2); x.stroke();
        poly(x, [[42.4, 30.5 + sq], [44, 35.4 + sq], [45.6, 31.1 + sq]], '#f0ead8');
        poly(x, [[52.4, 31.1 + sq], [54, 35.4 + sq], [55.6, 30.5 + sq]], '#f0ead8');
        poly(x, [[47, 34.6 + sq], [48, 31.8 + sq], [49, 34.8 + sq]], '#f0ead8');
      }, { ay: 98, shade: true, rim: RIM_BOSS });
      mkWhite('b_shuten_' + f);
    }

    // 鵺 — 猿の面、虎の体躯、蛇の尾。黒雲を纏って飛ぶ
    for (let f = 0; f < 2; f++) {
      mk('b_nue_' + f, 78, 56, (x) => {
        const up = f ? -2.5 : 2.5;
        // 黒雲 (下に渦巻く)
        for (const [cx2, cy2, r2] of [[24, 46, 12], [40, 49, 14], [56, 46, 11]]) {
          ellipse(x, cx2, cy2 + up * 0.4, r2, r2 * 0.5, 'rgba(40,34,66,0.75)');
        }
        x.fillStyle = 'rgba(70,60,110,0.5)';
        ellipse(x, 40, 44 + up * 0.4, 26, 7, 'rgba(70,60,110,0.5)');
        // 蛇の尾 (左へ伸びてうねる)
        x.strokeStyle = OUT; x.lineWidth = 7;
        x.beginPath(); x.moveTo(20, 30 + up); x.quadraticCurveTo(8, 24 + up, 6, 13 - up); x.stroke();
        x.strokeStyle = '#4a7050'; x.lineWidth = 5.4;
        x.beginPath(); x.moveTo(20, 30 + up); x.quadraticCurveTo(8, 24 + up, 6, 13 - up); x.stroke();
        // 蛇頭
        shadedCircle(x, 6, 11 - up, 4, '#54805c', '#3a5c42', '#6e9a76');
        eyeGlow(x, 4.6, 10 - up, 1.4, '#ffd166');
        eyeGlow(x, 7.4, 10 - up, 1.4, '#ffd166');
        poly(x, [[4.5, 14 - up], [6, 17.5 - up], [7.5, 14 - up]], '#c05060');
        // 虎の胴 (縞)
        shadedEllipse(x, 38, 30 + up, 20, 12, '#b88a3a', '#8a6420', '#d8aa56');
        x.fillStyle = '#241c10';
        for (const sx of [26, 33, 40, 47]) {
          poly(x, [[sx - 2, 20 + up], [sx + 2, 20 + up], [sx, 33 + up]], '#241c10');
        }
        // 前脚 + 鉤爪
        x.strokeStyle = '#8a6420'; x.lineWidth = 5;
        x.beginPath(); x.moveTo(30, 38 + up); x.lineTo(27, 50 + up * 0.4); x.stroke();
        x.beginPath(); x.moveTo(48, 38 + up); x.lineTo(51, 50 + up * 0.4); x.stroke();
        x.fillStyle = '#e8dcc4';
        for (const [bx2, dr] of [[27, -1], [51, 1]]) {
          for (let c2 = 0; c2 < 3; c2++) {
            poly(x, [[bx2 - 2.4 + c2 * 2.2, 50 + up * 0.4], [bx2 - 1.8 + c2 * 2.2 + dr, 53.4 + up * 0.4], [bx2 - 0.8 + c2 * 2.2, 50.2 + up * 0.4]], '#e8dcc4');
          }
        }
        // 猿の頭 (右上)
        shadedCircle(x, 58, 18 + up, 10.5, '#8a5c34', '#684222', '#aa7c4e');
        spikeArc(x, 58, 13 + up, 8, Math.PI * 1.05, Math.PI * 1.95, 6, 4, '#3c2c4e');
        // 白い面 (顔)
        shadedEllipse(x, 60, 20 + up, 6.8, 7.6, '#e8d8c0', '#c8b298', '#f6ecd8', '#5a4630');
        eyeGlow(x, 57.5, 18 + up, 2.4, '#ffd166', 'rgba(80,40,0,0.9)');
        eyeGlow(x, 63, 18 + up, 2.4, '#ffd166', 'rgba(80,40,0,0.9)');
        // 牙の覗く口
        x.strokeStyle = '#4a2c18'; x.lineWidth = 1.2;
        x.beginPath(); x.arc(60.5, 23.5 + up, 2.8, 0.3, Math.PI - 0.3); x.stroke();
        poly(x, [[58.4, 24.4 + up], [59.4, 26.6 + up], [60.2, 24.7 + up]], '#f0ead8');
        // 耳
        poly(x, [[50, 12 + up], [48, 7 + up], [53, 9.6 + up]], '#8a5c34', OUT);
        poly(x, [[66, 12 + up], [68, 7 + up], [63, 9.6 + up]], '#8a5c34', OUT);
      }, { shade: true, rim: RIM_BOSS });
      mkWhite('b_nue_' + f);
    }

    // がしゃどくろ — 巨大髑髏と肋、骨の鉤爪
    for (let f = 0; f < 2; f++) {
      mk('b_gasha_' + f, 68, 82, (x) => {
        const sq = f ? 2 : 0;
        // 背後の瘴気
        ellipse(x, 34, 44 + sq * 0.4, 26, 30, 'rgba(40,30,40,0.45)');
        // 脊椎
        x.strokeStyle = '#cfd2d8'; x.lineWidth = 3;
        x.beginPath(); x.moveTo(34, 40 + sq); x.lineTo(34, 66 + sq * 0.4); x.stroke();
        for (const ty of [44, 50, 56, 62]) {
          x.fillStyle = '#cfd2d8';
          x.fillRect(31, ty + sq * 0.6, 6, 2.4);
        }
        // 肋骨 (左右に弧)
        x.strokeStyle = '#dfe2e8'; x.lineWidth = 2.6;
        for (let rIdx = 0; rIdx < 4; rIdx++) {
          const ry = 44 + rIdx * 5.5 + sq * 0.6;
          const rw = 16 - rIdx * 2;
          x.beginPath(); x.arc(34, ry, rw, Math.PI * 0.15, Math.PI * 0.85); x.stroke();
        }
        // 腕骨 + 鉤爪 (前へ伸ばす)
        x.strokeStyle = '#cfd2d8'; x.lineWidth = 4.4;
        x.beginPath(); x.moveTo(16, 42 + sq); x.lineTo(5, 56 + sq); x.stroke();
        x.beginPath(); x.moveTo(52, 42 + sq); x.lineTo(63, 56 + sq); x.stroke();
        x.fillStyle = '#e8ecf2';
        for (const [bx2, dr] of [[5, -1], [63, 1]]) {
          for (let c2 = 0; c2 < 3; c2++) {
            poly(x, [[bx2 - 2.6 + c2 * 2.4, 56 + sq], [bx2 - 2 + c2 * 2.4 + dr * 1.4, 61 + sq], [bx2 - 0.8 + c2 * 2.4, 56.2 + sq]], '#e8ecf2');
          }
        }
        // 巨大髑髏
        shadedCircle(x, 34, 22 + sq, 17, '#e8ecf2', '#b4bec8', '#fafcff');
        // 顎
        x.fillStyle = '#e8ecf2';
        x.fillRect(24, 33 + sq, 20, 9);
        x.strokeStyle = OUT; x.lineWidth = 1.2; x.strokeRect(24, 33 + sq, 20, 9);
        x.strokeStyle = '#8a96a4'; x.lineWidth = 1.2;
        for (const tx of [27.5, 31.5, 35.5, 39.5]) {
          x.beginPath(); x.moveTo(tx, 33.4 + sq); x.lineTo(tx, 41.4 + sq); x.stroke();
        }
        // ひび
        x.strokeStyle = 'rgba(120,130,145,0.8)'; x.lineWidth = 1;
        x.beginPath(); x.moveTo(44, 10 + sq); x.lineTo(40, 16 + sq); x.lineTo(43, 19 + sq); x.stroke();
        // 眼窩 (燃える)
        ellipse(x, 27, 21 + sq, 4.6, 5.4, 'rgba(8,10,16,0.95)');
        ellipse(x, 41, 21 + sq, 4.6, 5.4, 'rgba(8,10,16,0.95)');
        eyeGlow(x, 27, 21.5 + sq, 2.6, '#7ee8ff');
        eyeGlow(x, 41, 21.5 + sq, 2.6, '#7ee8ff');
        // 鼻腔
        poly(x, [[33, 27 + sq], [34, 30.4 + sq], [35, 27 + sq]], 'rgba(8,10,16,0.9)');
      }, { ay: 78, shade: true, rim: RIM_BOSS });
      mkWhite('b_gasha_' + f);
    }

    // 土蜘蛛 — 巨大な腹部・八本脚・前面の多眼
    for (let f = 0; f < 2; f++) {
      mk('b_tsuchigumo_' + f, 86, 60, (x) => {
        const lg = f ? 1.5 : -1.5;
        x.strokeStyle = '#3a3026'; x.lineWidth = 4;
        for (let s = -1; s <= 1; s += 2) {
          for (let l = 0; l < 4; l++) {
            const kx = 43 + s * (22 + l * 3), ky = 18 + l * 9 + (l % 2 ? lg : -lg);
            const tx = 43 + s * (34 + l * 3), ty = 30 + l * 8;
            x.beginPath(); x.moveTo(43 + s * 6, 26 + l * 4); x.lineTo(kx, ky); x.lineTo(tx, ty); x.stroke();
          }
        }
        shadedEllipse(x, 43, 22, 19, 16, '#5a4a36', '#3c2e20', '#7a684e');
        ellipse(x, 43, 21, 7, 8, 'rgba(216,206,176,0.45)');
        ellipse(x, 40, 19, 1.8, 2.2, 'rgba(30,24,16,0.7)');
        ellipse(x, 46, 19, 1.8, 2.2, 'rgba(30,24,16,0.7)');
        shadedCircle(x, 43, 40, 12, '#4a3e2e', '#322617', '#6a5a44');
        poly(x, [[39, 48], [41, 53], [43, 48]], '#241a12', OUT);
        poly(x, [[43, 48], [45, 53], [47, 48]], '#241a12', OUT);
        for (const [ex, ey] of [[38, 37], [43, 35], [48, 37], [40, 40], [46, 40]]) eyeGlow(x, ex, ey, 1.7, '#ff4a4a');
      }, { shade: true, rim: RIM_BOSS });
      mkWhite('b_tsuchigumo_' + f);
    }

    // 大天狗 — 赤面・長い鼻・羽・羽団扇
    for (let f = 0; f < 2; f++) {
      mk('b_daitengu_' + f, 80, 74, (x) => {
        const up = f ? -2 : 2;
        for (const s of [-1, 1]) {
          for (let w2 = 0; w2 < 4; w2++) {
            poly(x, [
              [40, 34 + up],
              [40 + s * (14 + w2 * 7), 26 + w2 * 5 + up],
              [40 + s * (10 + w2 * 7), 36 + w2 * 5 + up],
            ], w2 % 2 ? '#3a3148' : '#2a2336', OUT);
          }
        }
        shadedEllipse(x, 40, 48 + up, 15, 15, '#7a2a24', '#561c18', '#9a3a32');
        shadedCircle(x, 40, 26 + up, 13, '#d2483a', '#a83228', '#ee6a58');
        poly(x, [[38, 26 + up], [42, 26 + up], [40, 44 + up]], '#b83c2c', OUT);
        x.strokeStyle = '#2a1a14'; x.lineWidth = 1.6;
        x.beginPath(); x.moveTo(31, 20 + up); x.lineTo(37, 22 + up); x.stroke();
        x.beginPath(); x.moveTo(49, 20 + up); x.lineTo(43, 22 + up); x.stroke();
        eyeGlow(x, 34, 24 + up, 2.3, '#ffd166');
        eyeGlow(x, 46, 24 + up, 2.3, '#ffd166');
        ellipse(x, 40, 15 + up, 5, 4, '#15151f');
        x.strokeStyle = '#6a4a30'; x.lineWidth = 2;
        x.beginPath(); x.moveTo(56, 50 + up); x.lineTo(62, 38 + up); x.stroke();
        poly(x, [[62, 38 + up], [56, 30 + up], [68, 30 + up]], '#e8dcc4', OUT);
      }, { shade: true, rim: RIM_BOSS });
      mkWhite('b_daitengu_' + f);
    }

    // 大蝦蟇 — 幅広の胴・大きな口・突き出た両眼
    for (let f = 0; f < 2; f++) {
      mk('b_ogama_' + f, 92, 58, (x) => {
        const br = f ? 1 : 0;
        shadedEllipse(x, 46, 38 - br, 33, 18 + br, '#5a8a46', '#3c6630', '#7caa5c');
        for (const [wx, wy] of [[30, 30], [42, 26], [54, 28], [60, 34], [26, 40], [64, 40], [46, 32]]) ellipse(x, wx, wy, 2.6, 2.6, 'rgba(40,72,28,0.7)');
        x.fillStyle = '#2a1614';
        x.beginPath(); x.arc(46, 42, 24, 0.12, Math.PI - 0.12); x.fill();
        x.strokeStyle = '#caa44e'; x.lineWidth = 1.6;
        x.beginPath(); x.arc(46, 42, 24, 0.12, Math.PI - 0.12); x.stroke();
        poly(x, [[18, 40], [12, 52], [26, 48]], '#4e7a3c', OUT);
        poly(x, [[74, 40], [80, 52], [66, 48]], '#4e7a3c', OUT);
        shadedCircle(x, 32, 20, 8, '#6e9a52', '#456a32', '#92c070');
        shadedCircle(x, 60, 20, 8, '#6e9a52', '#456a32', '#92c070');
        eyeGlow(x, 32, 20, 3.2, '#ffd166', 'rgba(20,40,10,0.9)');
        eyeGlow(x, 60, 20, 3.2, '#ffd166', 'rgba(20,40,10,0.9)');
      }, { ay: 50, shade: true, rim: RIM_BOSS });
      mkWhite('b_ogama_' + f);
    }

    // ---------- projectiles ----------
    mk('ofuda', 10, 20, (x) => {
      x.fillStyle = '#fffdf2';
      x.fillRect(1.5, 1, 7, 18);
      x.strokeStyle = '#c9b88a'; x.lineWidth = 0.8;
      x.strokeRect(1.5, 1, 7, 18);
      x.fillStyle = '#c0392b';
      x.font = 'bold 6px serif';
      x.textAlign = 'center';
      x.fillText('封', 5, 8.5);
      x.fillText('魔', 5, 15.5);
    });
    mk('ofuda_g', 10, 20, (x) => {
      x.fillStyle = '#fff2c8';
      x.fillRect(1.5, 1, 7, 18);
      x.strokeStyle = '#d8a23a'; x.lineWidth = 1;
      x.strokeRect(1.5, 1, 7, 18);
      x.fillStyle = '#b0701a';
      x.font = 'bold 6px serif';
      x.textAlign = 'center';
      x.fillText('破', 5, 8.5);
      x.fillText('魔', 5, 15.5);
    });
    mk('wind', 30, 12, (x) => {
      const g = x.createLinearGradient(0, 0, 30, 0);
      g.addColorStop(0, 'rgba(120,220,255,0)');
      g.addColorStop(0.55, 'rgba(190,245,255,0.75)');
      g.addColorStop(1, 'rgba(255,255,255,0.98)');
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(0, 6);
      x.quadraticCurveTo(16, -1.5, 30, 6);
      x.quadraticCurveTo(16, 13.5, 0, 6);
      x.fill();
    });
    mk('kitsunebi', 18, 18, (x) => {
      radial(x, 9, 9, 9, [[0, 'rgba(235,255,255,1)'], [0.3, 'rgba(140,235,255,0.9)'], [0.7, 'rgba(60,150,200,0.35)'], [1, 'rgba(0,0,0,0)']]);
    });
    mk('juzu', 26, 26, (x) => {
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * G.TAU;
        const bx = 13 + Math.cos(a) * 8.6, by = 13 + Math.sin(a) * 8.6;
        circle(x, bx, by, 3.1, '#7a5640', OUT);
        circle(x, bx - 0.9, by - 0.9, 1.0, 'rgba(230,192,150,0.85)');
      }
      circle(x, 13, 3.6, 3.8, '#9a3838', OUT);
    });
    // 式神・白狐 — inari bib; golden form gains three tails
    function drawFox(x, f, base, dark, light, legCol, accent, tails) {
      const run = f ? 1.6 : -1.6;
      // tails
      for (let tIdx = 0; tIdx < tails; tIdx++) {
        x.save();
        x.translate(4.5, 7.5); x.rotate((f ? -0.25 : 0.05) + (tIdx - (tails - 1) / 2) * 0.5);
        shadedEllipse(x, -1.4, 0, 5.6, 2.6, base, dark, light, null);
        ellipse(x, -5.4, 0, 2, 1.7, accent);
        x.restore();
      }
      // body
      shadedEllipse(x, 12.5, 9, 7, 4.3, base, dark, light, 'rgba(120,90,60,0.45)');
      // legs
      x.strokeStyle = legCol; x.lineWidth = 1.8;
      x.beginPath(); x.moveTo(9.5, 11.5); x.lineTo(8.5 + run, 15.6); x.stroke();
      x.beginPath(); x.moveTo(15.5, 11.5); x.lineTo(16.5 - run, 15.6); x.stroke();
      // head + ears (inner pink)
      shadedCircle(x, 19.8, 6.6, 3.5, base, dark, light, null);
      poly(x, [[17.8, 4.2], [17, 0.6], [19.8, 3.2]], base);
      poly(x, [[21, 3.6], [22.4, 0.4], [23, 4]], base);
      x.fillStyle = 'rgba(220,120,110,0.7)';
      poly(x, [[17.9, 3.6], [17.5, 1.6], [19, 3.1]], 'rgba(220,120,110,0.7)');
      // muzzle
      poly(x, [[22.2, 6.8], [24.6, 7.8], [22, 8.6]], base);
      circle(x, 24.2, 7.8, 0.6, '#241c14');
      // inari bib (red knot collar)
      poly(x, [[17.4, 8.8], [22, 8.8], [19.7, 11.6]], accent, '#7a241c');
      // eye (closed serene line) + red marking
      x.strokeStyle = '#b03020'; x.lineWidth = 0.9;
      x.beginPath(); x.moveTo(18.6, 5.8); x.lineTo(20.4, 6.2); x.stroke();
      x.beginPath(); x.moveTo(17.2, 4.6); x.lineTo(18, 5.1); x.stroke();
    }
    for (let f = 0; f < 2; f++) {
      mk('fox_' + f, 26, 17, (x) => {
        drawFox(x, f, '#f4ecdc', 'rgba(200,180,150,0.55)', 'rgba(255,255,250,0.8)', '#e0d4ba', '#c0392b', 1);
      }, { shade: true, rim: RIM_ALLY });
      mk('fox_g_' + f, 26, 17, (x) => {
        drawFox(x, f, '#ffd166', 'rgba(200,140,40,0.6)', 'rgba(255,245,200,0.85)', '#e8b84a', '#b03020', 3);
      }, { shade: true, rim: 'rgba(255,220,130,0.9)' });
    }
    mk('orb', 14, 14, (x) => {
      radial(x, 7, 7, 7, [[0, 'rgba(255,235,240,1)'], [0.35, 'rgba(255,90,120,0.9)'], [0.75, 'rgba(160,30,80,0.4)'], [1, 'rgba(0,0,0,0)']]);
    });

    // 手裏剣 (4-point star)
    mk('shuriken', 16, 16, (x) => {
      x.save(); x.translate(8, 8);
      x.fillStyle = '#c9ccd6';
      for (let i = 0; i < 4; i++) {
        x.rotate(Math.PI / 2);
        poly(x, [[0, -7.5], [1.8, -1.8], [-1.8, -1.8]], '#c9ccd6', '#5a6070');
      }
      circle(x, 0, 0, 1.8, '#3a4050', '#1a2030');
      x.restore();
    });

    // 鎖鎌の鎌 (sickle for the whirl)
    mk('kama', 26, 18, (x) => {
      // handle
      x.save(); x.translate(4, 14); x.rotate(-0.5);
      x.fillStyle = '#6a4a2c';
      x.fillRect(-1.6, -2, 3.2, 10);
      x.restore();
      // blade (curved)
      x.beginPath();
      x.moveTo(4, 10);
      x.quadraticCurveTo(8, 1, 22, 2.5);
      x.quadraticCurveTo(12, 4.5, 7.5, 12);
      x.closePath();
      const g = x.createLinearGradient(4, 2, 22, 6);
      g.addColorStop(0, '#aab2c4');
      g.addColorStop(1, '#e8edf6');
      x.fillStyle = g;
      x.fill();
      x.strokeStyle = '#4a5266'; x.lineWidth = 1; x.stroke();
    });

    // 火縄銃の弾 (tracer ball)
    mk('tama', 12, 12, (x) => {
      radial(x, 6, 6, 6, [[0, 'rgba(255,250,230,1)'], [0.4, 'rgba(255,200,120,0.9)'], [1, 'rgba(0,0,0,0)']]);
    });

    // 封印札 (ground sigil)
    mk('fuin', 30, 30, (x) => {
      x.save(); x.translate(15, 15);
      glowDot(x, 0, 0, 14, 'rgba(255,120,80,0.25)');
      // paper square (rotated 45°)
      x.rotate(Math.PI / 4);
      x.fillStyle = '#f4ead2';
      x.fillRect(-7.5, -7.5, 15, 15);
      x.strokeStyle = '#b04030'; x.lineWidth = 1.1;
      x.strokeRect(-7.5, -7.5, 15, 15);
      x.rotate(-Math.PI / 4);
      // pentagram circle
      x.strokeStyle = '#c0392b'; x.lineWidth = 0.9;
      circle(x, 0, 0, 6.4, null, '#c0392b');
      x.beginPath();
      for (let i = 0; i <= 5; i++) {
        const a = -Math.PI / 2 + i * G.TAU * 2 / 5;
        const px = Math.cos(a) * 6.4, py = Math.sin(a) * 6.4;
        i === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
      }
      x.stroke();
      x.fillStyle = '#b04030';
      x.font = 'bold 6px "Yu Mincho", serif';
      x.textAlign = 'center';
      x.fillText('封', 0, 2.2);
      x.restore();
    });

    // 残月 crescent wave
    mk('zangetsu', 48, 48, (x) => {
      x.save();
      x.translate(24, 24);
      // outer glow
      radial(x, 0, 0, 23, [[0, 'rgba(0,0,0,0)'], [0.62, 'rgba(150,200,255,0.0)'], [0.8, 'rgba(170,215,255,0.22)'], [1, 'rgba(0,0,0,0)']]);
      // crescent: big arc minus offset arc
      x.beginPath();
      x.arc(0, 0, 19, -Math.PI * 0.62, Math.PI * 0.62);
      x.arc(-7, 0, 14.5, Math.PI * 0.55, -Math.PI * 0.55, true);
      x.closePath();
      const g = x.createLinearGradient(6, -18, 18, 18);
      g.addColorStop(0, 'rgba(235,248,255,0.98)');
      g.addColorStop(0.5, 'rgba(170,215,255,0.9)');
      g.addColorStop(1, 'rgba(110,160,230,0.75)');
      x.fillStyle = g;
      x.fill();
      x.strokeStyle = 'rgba(70,110,190,0.8)'; x.lineWidth = 1.2; x.stroke();
      // inner edge highlight
      x.strokeStyle = 'rgba(255,255,255,0.95)'; x.lineWidth = 1.6;
      x.beginPath();
      x.arc(0, 0, 18.2, -Math.PI * 0.55, Math.PI * 0.55);
      x.stroke();
      x.restore();
    });

    // 小判 koban coin
    mk('koban', 18, 13, (x) => {
      const g = x.createLinearGradient(0, 0, 0, 13);
      g.addColorStop(0, '#ffe08a');
      g.addColorStop(1, '#cf9a2c');
      x.fillStyle = g;
      x.beginPath(); x.ellipse(9, 6.5, 8, 5.2, 0, 0, G.TAU); x.fill();
      x.strokeStyle = '#8a6014'; x.lineWidth = 1; x.stroke();
      x.strokeStyle = 'rgba(138,96,20,0.8)'; x.lineWidth = 0.8;
      x.beginPath(); x.ellipse(9, 6.5, 5.6, 3.4, 0, 0, G.TAU); x.stroke();
      // embossed stamp marks
      x.fillStyle = 'rgba(138,96,20,0.85)';
      x.fillRect(8.2, 3.4, 1.6, 2.2);
      x.fillRect(8.2, 7.4, 1.6, 2.2);
      glowDot(x, 6, 4.4, 2, 'rgba(255,250,220,0.6)');
    }, { rim: RIM_ITEM });

    // 梵鐘 temple bell
    mk('bonsho', 38, 42, (x) => {
      x.strokeStyle = '#5a4a30'; x.lineWidth = 2.5;
      x.beginPath(); x.arc(19, 5, 3.5, Math.PI, 0); x.stroke();
      x.fillStyle = '#8a7448';
      x.beginPath();
      x.moveTo(8, 12);
      x.quadraticCurveTo(8, 7, 19, 7);
      x.quadraticCurveTo(30, 7, 30, 12);
      x.lineTo(31.5, 32);
      x.quadraticCurveTo(33, 36, 30, 36);
      x.lineTo(8, 36);
      x.quadraticCurveTo(5, 36, 6.5, 32);
      x.closePath(); x.fill();
      x.strokeStyle = '#3a2f1c'; x.lineWidth = 1.4; x.stroke();
      x.strokeStyle = '#5e4e30'; x.lineWidth = 1.6;
      x.beginPath(); x.moveTo(7.4, 15); x.lineTo(30.6, 15); x.stroke();
      x.beginPath(); x.moveTo(7, 28); x.lineTo(31, 28); x.stroke();
      for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) circle(x, 11.5 + i * 5, 18.5 + r * 4, 1.2, '#6a5838');
      circle(x, 19, 31.8, 2.6, '#e0c070');
      x.fillStyle = 'rgba(255,240,200,0.28)';
      x.fillRect(10, 9, 3, 25);
    }, { shade: true });

    // 破魔矢 arrow
    mk('hamaya', 30, 10, (x) => {
      x.fillStyle = '#f2ead0';
      x.fillRect(4, 4.2, 20, 1.6);
      poly(x, [[23.5, 1.8], [30, 5], [23.5, 8.2]], '#ffd166', '#a87818');
      poly(x, [[0, 1.5], [6, 3.4], [6, 6.6], [0, 8.5], [2.5, 5]], '#d84038');
      poly(x, [[2.5, 2.8], [6, 3.9], [6, 6.1], [2.5, 7.2]], '#fffdf2');
    });

    // 狛犬 guardian dog (2 run frames)
    for (let f = 0; f < 2; f++) {
      mk('komainu_' + f, 28, 22, (x) => {
        const run = f ? 2 : -2;
        // curled tail
        circle(x, 4.5, 8.5, 3, '#9aa2bc');
        circle(x, 4.5, 8.5, 1.4, '#737b96');
        // legs
        x.strokeStyle = '#8a92ac'; x.lineWidth = 2.6;
        x.beginPath(); x.moveTo(9, 14); x.lineTo(7.4 + run, 20); x.stroke();
        x.beginPath(); x.moveTo(16, 14); x.lineTo(17.6 - run, 20); x.stroke();
        // body
        ellipse(x, 13, 12, 8, 5.4, '#9aa2bc');
        x.strokeStyle = OUT; x.lineWidth = 1.3; x.stroke();
        // mane curls along the back
        circle(x, 9.5, 8, 2, '#7c849e');
        circle(x, 13.5, 7, 2, '#7c849e');
        // head
        circle(x, 21.5, 7.5, 5, '#9aa2bc');
        x.strokeStyle = OUT; x.lineWidth = 1.3; x.stroke();
        circle(x, 18.4, 3.8, 1.9, '#7c849e');
        circle(x, 22, 2.6, 1.9, '#7c849e');
        circle(x, 25.2, 4.2, 1.9, '#7c849e');
        // fierce eyes + open mouth (阿形)
        glowDot(x, 20.2, 6.4, 1.7, '#ffd166');
        glowDot(x, 23.8, 6.4, 1.7, '#ffd166');
        x.fillStyle = '#5a2018';
        x.beginPath(); x.arc(23.6, 10, 2.2, 0, Math.PI); x.fill();
        poly(x, [[22, 10], [22.8, 11.8], [23.6, 10.2]], '#f0ead8');
        // red bib
        poly(x, [[17.6, 11.5], [25.4, 11.5], [21.5, 15.5]], '#c84038', '#7a241c');
      }, { ay: 21, shade: true, rim: RIM_ALLY });
    }

    // 御幣 purification wand
    mk('gohei', 20, 22, (x) => {
      x.save(); x.translate(10, 11);
      x.fillStyle = '#8a6a44';
      x.fillRect(-1.1, -9.5, 2.2, 19);
      poly(x, [[-1, -7], [-7.5, -5], [-3.5, -3], [-8.5, 0.5], [-4, 1.8], [-1, -0.8]], '#fffdf2', '#c9b88a');
      poly(x, [[1, -7], [7.5, -5], [3.5, -3], [8.5, 0.5], [4, 1.8], [1, -0.8]], '#fffdf2', '#c9b88a');
      x.fillStyle = '#d8a23a';
      x.fillRect(-1.6, -9.5, 3.2, 1.8);
      x.restore();
    });

    // ---------- pickups ----------
    mk('gem_c', 14, 18, (x) => {
      x.fillStyle = 'rgba(110,232,255,0.92)';
      x.beginPath();
      x.moveTo(7, 1);
      x.quadraticCurveTo(12.4, 8, 11, 12.5);
      x.arc(7, 12.5, 4, 0, Math.PI);
      x.quadraticCurveTo(1.6, 8, 7, 1);
      x.fill();
      radial(x, 7, 12, 3.6, [[0, 'rgba(255,255,255,0.95)'], [1, 'rgba(255,255,255,0)']]);
    });
    mk('gem_v', 16, 20, (x) => {
      x.fillStyle = 'rgba(177,140,255,0.94)';
      x.beginPath();
      x.moveTo(8, 1);
      x.quadraticCurveTo(14.2, 9, 12.5, 14);
      x.arc(8, 14, 4.5, 0, Math.PI);
      x.quadraticCurveTo(1.8, 9, 8, 1);
      x.fill();
      radial(x, 8, 13.5, 4, [[0, 'rgba(255,255,255,0.95)'], [1, 'rgba(255,255,255,0)']]);
    });
    mk('gem_g', 18, 22, (x) => {
      x.fillStyle = 'rgba(255,209,102,0.96)';
      x.beginPath();
      x.moveTo(9, 1);
      x.quadraticCurveTo(16, 10, 14, 15.5);
      x.arc(9, 15.5, 5, 0, Math.PI);
      x.quadraticCurveTo(2, 10, 9, 1);
      x.fill();
      radial(x, 9, 15, 4.6, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
    });
    mk('onigiri', 18, 16, (x) => {
      poly(x, [[9, 1.5], [16.6, 13.5], [1.4, 13.5]], '#f6f2e6', '#c8c0a8');
      x.fillStyle = '#1d2a20';
      x.fillRect(6, 9, 6, 5.5);
    }, { rim: RIM_ITEM });
    mk('magnet', 18, 16, (x) => {
      x.strokeStyle = '#d84038'; x.lineWidth = 4.6;
      x.beginPath(); x.arc(9, 7, 5.4, Math.PI, 0); x.stroke();
      x.fillStyle = '#d84038';
      x.fillRect(1.6, 7, 4.6, 5);
      x.fillRect(11.8, 7, 4.6, 5);
      x.fillStyle = '#e8eaf2';
      x.fillRect(1.6, 12, 4.6, 3);
      x.fillRect(11.8, 12, 4.6, 3);
    }, { rim: RIM_ITEM });
    mk('bomb', 12, 20, (x) => {
      x.fillStyle = '#4a2a62';
      x.fillRect(1.5, 1, 9, 18);
      x.strokeStyle = '#7a4aa2'; x.lineWidth = 0.9;
      x.strokeRect(1.5, 1, 9, 18);
      x.strokeStyle = '#ffd166'; x.lineWidth = 0.9;
      x.beginPath();
      for (let i = 0; i <= 5; i++) {
        const a = -Math.PI / 2 + i * G.TAU * 2 / 5;
        const px = 6 + Math.cos(a) * 4, py = 10 + Math.sin(a) * 4;
        i === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
      }
      x.stroke();
    }, { rim: RIM_ITEM });

    // ---------- treasure chest (唐櫃 karabitsu) ----------
    mk('chest', 30, 28, (x) => {
      // legs
      x.fillStyle = '#1e1620';
      x.fillRect(4, 22, 3, 5.5);
      x.fillRect(23, 22, 3, 5.5);
      x.fillRect(9, 23, 2.6, 4.5);
      x.fillRect(18.4, 23, 2.6, 4.5);
      // body (black lacquer, subtle sheen)
      const bg = x.createLinearGradient(0, 8, 0, 24);
      bg.addColorStop(0, '#3a2c34');
      bg.addColorStop(1, '#221821');
      x.fillStyle = bg;
      x.fillRect(3.5, 11, 23, 12);
      x.strokeStyle = OUT; x.lineWidth = 1.3;
      x.strokeRect(3.5, 11, 23, 12);
      // domed lid
      const lg = x.createLinearGradient(0, 3, 0, 11);
      lg.addColorStop(0, '#4a3a44');
      lg.addColorStop(1, '#2c2029');
      x.fillStyle = lg;
      x.beginPath();
      x.moveTo(2.5, 11);
      x.quadraticCurveTo(15, 1.5, 27.5, 11);
      x.closePath(); x.fill();
      x.strokeStyle = OUT; x.lineWidth = 1.3; x.stroke();
      // gold fittings: bands + lock plate + corner caps
      x.fillStyle = '#d8a23a';
      x.fillRect(3.5, 11, 23, 1.6);
      x.fillRect(6.5, 13.5, 1.8, 9.5);
      x.fillRect(21.7, 13.5, 1.8, 9.5);
      x.strokeStyle = '#d8a23a'; x.lineWidth = 1.4;
      x.beginPath(); x.moveTo(4, 9.5); x.quadraticCurveTo(15, 1, 26, 9.5); x.stroke();
      // lock plate with mon
      x.fillStyle = '#e8b84a';
      x.fillRect(12.4, 13, 5.2, 5.8);
      x.strokeStyle = '#8a6014'; x.lineWidth = 0.7;
      x.strokeRect(12.4, 13, 5.2, 5.8);
      circle(x, 15, 15.4, 1.4, '#8a6014');
      circle(x, 15, 15.4, 0.6, '#3a2a08');
      // inner glow seeping from the lid seam
      glowDot(x, 15, 11.2, 5, 'rgba(255,220,140,0.55)');
    }, { ay: 27, shade: true, rim: 'rgba(255,217,140,0.7)' });
    mkWhite('chest');

    mk('chest_open', 30, 30, (x) => {
      // legs + body
      x.fillStyle = '#1e1620';
      x.fillRect(4, 24, 3, 5.5);
      x.fillRect(23, 24, 3, 5.5);
      const bg = x.createLinearGradient(0, 12, 0, 26);
      bg.addColorStop(0, '#3a2c34');
      bg.addColorStop(1, '#221821');
      x.fillStyle = bg;
      x.fillRect(3.5, 13, 23, 12);
      x.strokeStyle = OUT; x.lineWidth = 1.3;
      x.strokeRect(3.5, 13, 23, 12);
      x.fillStyle = '#d8a23a';
      x.fillRect(3.5, 13, 23, 1.6);
      x.fillRect(6.5, 15.5, 1.8, 9.5);
      x.fillRect(21.7, 15.5, 1.8, 9.5);
      // light bursting out
      radial(x, 15, 11, 11, [[0, 'rgba(255,240,190,0.95)'], [0.4, 'rgba(255,220,140,0.55)'], [1, 'rgba(0,0,0,0)']]);
      // lid flipped open behind
      x.save();
      x.translate(15, 6); x.rotate(-0.12);
      x.fillStyle = '#2c2029';
      x.beginPath();
      x.moveTo(-12, 0);
      x.quadraticCurveTo(0, -7, 12, 0);
      x.closePath(); x.fill();
      x.strokeStyle = OUT; x.lineWidth = 1.2; x.stroke();
      x.strokeStyle = '#d8a23a'; x.lineWidth = 1.2;
      x.beginPath(); x.moveTo(-11, -1); x.quadraticCurveTo(0, -7.5, 11, -1); x.stroke();
      x.restore();
    }, { ay: 29, shade: true });

    // ---------- temporary blessing orbs ----------
    for (const bk in G.data.BUFFS) {
      const cfg = G.data.BUFFS[bk];
      mk('buff_' + bk, 26, 26, (x) => {
        radial(x, 13, 13, 13, [[0, hexA(cfg.color, 0.8)], [0.45, hexA(cfg.color, 0.3)], [1, 'rgba(0,0,0,0)']]);
        circle(x, 13, 13, 7.2, '#171024', cfg.color);
        x.fillStyle = cfg.color;
        x.font = 'bold 10px "Yu Mincho", serif';
        x.textAlign = 'center';
        x.fillText(cfg.kanji, 13, 16.6);
      });
    }

    // ---------- destructible ----------
    mk('toro', 28, 42, (x) => {
      x.fillStyle = '#454b61';
      x.fillRect(6, 36, 16, 5);
      x.fillRect(9, 30, 10, 6);
      x.fillRect(11, 22, 6, 8);
      x.fillStyle = '#525870';
      x.fillRect(6, 12, 16, 10);
      x.fillStyle = '#ffb866';
      x.fillRect(9.5, 14, 9, 6);
      glowDot(x, 14, 17, 7, 'rgba(255,190,110,0.45)');
      poly(x, [[3, 12], [14, 5], [25, 12]], '#454b61', OUT);
      circle(x, 14, 3.6, 2, '#454b61');
      x.strokeStyle = OUT; x.lineWidth = 1.2;
      x.strokeRect(6, 12, 16, 10);
      // moss
      x.fillStyle = 'rgba(80,130,100,0.5)';
      x.fillRect(6, 21, 5, 1.4);
      x.fillRect(15, 35, 5, 1.4);
    }, { ay: 41, shade: true, rim: 'rgba(255,217,160,0.55)' });
    mkWhite('toro');

    // ---------- decorations ----------
    mk('torii', 130, 110, (x) => {
      x.fillStyle = '#6a2e26';
      x.save(); x.translate(20, 14); x.rotate(0.02); x.fillRect(0, 0, 11, 96); x.restore();
      x.save(); x.translate(99, 14); x.rotate(-0.02); x.fillRect(0, 0, 11, 96); x.restore();
      poly(x, [[2, 12], [128, 12], [124, 2], [6, 2]], '#763229');
      x.fillStyle = '#6a2e26';
      x.fillRect(8, 13, 114, 6);
      x.fillRect(12, 38, 106, 8);
      x.fillRect(60, 19, 10, 19);
      // moonlight on the top beam
      x.fillStyle = 'rgba(190,160,150,0.22)';
      x.fillRect(6, 2, 118, 3);
      // weathering
      x.fillStyle = 'rgba(10,12,20,0.4)';
      x.fillRect(20, 60, 11, 50);
      x.fillRect(99, 70, 11, 40);
      // shimenawa rope
      x.strokeStyle = '#b89b66'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(31, 22); x.quadraticCurveTo(65, 34, 99, 22); x.stroke();
      x.fillStyle = '#e8e0cc';
      for (const px of [48, 65, 82]) poly(x, [[px - 3, 28], [px, 38], [px + 3, 28]], 'rgba(238,232,214,0.85)');
    }, { ay: 108 });

    for (let i = 0; i < 3; i++) {
      mk('grass_' + i, 14, 12, (x) => {
        x.strokeStyle = i === 2 ? '#46689a' : '#33507e';
        x.lineWidth = 1.6;
        for (let b = 0; b < 3 + i; b++) {
          const bx = 3 + b * (8 / (2 + i));
          x.beginPath();
          x.moveTo(bx, 11);
          x.quadraticCurveTo(bx + (b % 2 ? 2.5 : -2.5), 5, bx + (b % 2 ? 4 : -3), 1 + (b % 3));
          x.stroke();
        }
      }, { ay: 11 });
    }
    for (let i = 0; i < 2; i++) {
      mk('stone_' + i, 16, 12, (x) => {
        poly(x, [[2, 10], [3, 5], [8, 2], [13 + i, 4], [14, 10]], '#39466c', '#222c48');
        poly(x, [[4, 5.5], [8, 3], [11, 4.5], [8.5, 6.5]], 'rgba(150,175,220,0.3)');
      }, { ay: 11 });
    }
    mk('mush', 10, 10, (x) => {
      x.fillStyle = '#3a4458';
      x.fillRect(4, 5, 2, 4);
      glowDot(x, 5, 4, 4, 'rgba(110,232,255,0.75)');
      circle(x, 5, 4, 2.6, '#6ee8ff');
    }, { ay: 9 });
    mk('leaf', 12, 8, (x) => {
      x.save(); x.translate(6, 4); x.rotate(0.5);
      ellipse(x, 0, 0, 4.2, 2, '#2c3c64');
      x.restore();
      x.save(); x.translate(3, 5); x.rotate(-0.4);
      ellipse(x, 0, 0, 3, 1.5, '#243254');
      x.restore();
    });

    // 竹 bamboo stalks
    for (let i = 0; i < 2; i++) {
      mk('bamboo_' + i, 14, 42 - i * 5, (x, w, h) => {
        const lean = i ? -1.6 : 1.4;
        x.save();
        x.translate(7, h);
        x.rotate(lean * 0.045);
        x.fillStyle = '#3f7256';
        x.fillRect(-2, -h + 3, 4, h - 3);
        x.fillStyle = 'rgba(190,230,200,0.25)';
        x.fillRect(-2, -h + 3, 1.3, h - 3);
        x.strokeStyle = '#6ba37b'; x.lineWidth = 1.1;
        for (let s = 1; s <= 4; s++) {
          const sy = -s * (h - 4) / 4.4;
          x.beginPath(); x.moveTo(-2.4, sy); x.lineTo(2.4, sy); x.stroke();
        }
        x.strokeStyle = '#52906a'; x.lineWidth = 1.3;
        x.beginPath(); x.moveTo(0, -h + 4); x.quadraticCurveTo(4, -h - 1, 7, -h + 1); x.stroke();
        x.beginPath(); x.moveTo(0, -h + 7); x.quadraticCurveTo(-4, -h + 3, -6.5, -h + 6); x.stroke();
        ellipse(x, 6.4, -h + 1.4, 2.6, 1, '#52906a');
        ellipse(x, -6, -h + 6.4, 2.4, 0.9, '#52906a');
        x.restore();
      }, { ay: 41 - i * 5 });
    }

    // 卒塔婆 wooden grave tablet
    mk('sotoba', 10, 38, (x) => {
      x.fillStyle = '#9a8866';
      poly(x, [[3, 4.5], [5, 1], [7, 4.5], [7, 37], [3, 37]], '#9a8866', '#5e503a');
      // notches
      x.fillStyle = '#5e503a';
      x.fillRect(3, 7.5, 4, 1);
      x.fillRect(3, 11, 4, 1);
      // ink writing strokes
      x.fillStyle = '#2a2620';
      for (let s = 0; s < 5; s++) {
        x.fillRect(4.4, 15 + s * 4, 1.4, 2.2);
      }
      // weathering
      x.fillStyle = 'rgba(40,34,24,0.4)';
      x.fillRect(3, 30, 4, 7);
    }, { ay: 37 });

    // 墓石 gravestone
    mk('grave', 16, 26, (x) => {
      x.fillStyle = '#4e567a';
      x.fillRect(2, 22, 12, 3.4);
      x.fillRect(3.6, 19, 8.8, 3.4);
      x.beginPath();
      x.moveTo(5, 19.5); x.lineTo(5, 5);
      x.quadraticCurveTo(5, 2, 8, 2);
      x.quadraticCurveTo(11, 2, 11, 5);
      x.lineTo(11, 19.5);
      x.closePath(); x.fill();
      x.strokeStyle = '#2e3450'; x.lineWidth = 1; x.stroke();
      x.fillStyle = 'rgba(190,205,240,0.22)';
      x.fillRect(5.6, 2.8, 1.6, 15.5);
      x.fillStyle = '#323a5c';
      for (let s = 0; s < 4; s++) x.fillRect(7.4, 6 + s * 3.4, 1.4, 2);
      x.fillStyle = 'rgba(80,130,100,0.55)';
      x.fillRect(5, 16.5, 3.4, 1.6);
    }, { ay: 25 });

    // 地蔵 jizo statue (red bib accent)
    mk('jizo', 14, 21, (x) => {
      x.fillStyle = '#5e668a';
      x.fillRect(2.4, 18, 9.2, 2.6);
      ellipse(x, 7, 13.5, 4.2, 5.2, '#5e668a');
      circle(x, 7, 5.6, 3.6, '#6a7295');
      x.strokeStyle = '#3a4060'; x.lineWidth = 0.9;
      x.beginPath(); x.arc(7, 5.6, 3.6, 0, G.TAU); x.stroke();
      // closed eyes
      x.strokeStyle = '#2e3450'; x.lineWidth = 0.8;
      x.beginPath(); x.moveTo(5.4, 5.8); x.lineTo(6.4, 6); x.stroke();
      x.beginPath(); x.moveTo(7.6, 6); x.lineTo(8.6, 5.8); x.stroke();
      // red bib
      poly(x, [[4.4, 9], [9.6, 9], [7, 13.5]], '#c84038', '#7a241c');
      // moss
      x.fillStyle = 'rgba(80,130,100,0.5)';
      x.fillRect(3, 17, 2.6, 1.2);
    }, { ay: 20 });

    // 彼岸花 red spider lily
    mk('higan', 16, 17, (x) => {
      glowDot(x, 8, 5.5, 6.5, 'rgba(232,72,60,0.28)');
      x.strokeStyle = '#3a5a46'; x.lineWidth = 1.2;
      x.beginPath(); x.moveTo(8, 16); x.lineTo(8, 7); x.stroke();
      x.strokeStyle = '#e8483c'; x.lineWidth = 1.1;
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.5;
        const ex = 8 + Math.cos(a) * 5.6, ey = 6 + Math.sin(a) * 5.2;
        x.beginPath();
        x.moveTo(8, 7);
        x.quadraticCurveTo(8 + Math.cos(a) * 3, 6.4 + Math.sin(a) * 3 - 1.2, ex, ey);
        x.stroke();
        circle(x, ex, ey, 0.9, '#ff7a5c');
      }
    }, { ay: 16 });

    // 倒木 fallen log
    mk('log', 46, 17, (x) => {
      x.save();
      x.translate(23, 9); x.rotate(-0.06);
      x.fillStyle = '#5a4632';
      x.beginPath();
      x.roundRect(-20, -4.5, 40, 9, 4);
      x.fill();
      x.strokeStyle = '#382a1c'; x.lineWidth = 1; x.stroke();
      // bark lines
      x.strokeStyle = 'rgba(30,22,14,0.5)'; x.lineWidth = 0.9;
      for (const lx of [-12, -4, 5, 13]) {
        x.beginPath(); x.moveTo(lx, -3.6); x.quadraticCurveTo(lx + 1.5, 0, lx, 3.6); x.stroke();
      }
      // cut end with rings
      ellipse(x, 19, 0, 3.4, 4.6, '#8a6f4e');
      x.strokeStyle = '#5e4a32'; x.lineWidth = 0.8;
      x.beginPath(); x.ellipse(19, 0, 2.2, 3, 0, 0, G.TAU); x.stroke();
      x.beginPath(); x.ellipse(19, 0, 1, 1.4, 0, 0, G.TAU); x.stroke();
      // moss
      x.fillStyle = 'rgba(80,130,100,0.55)';
      x.fillRect(-16, -4.5, 7, 2);
      x.fillRect(-2, 2.5, 8, 2);
      x.restore();
    }, { ay: 15 });

    // 水たまり puddle (moon reflection)
    mk('puddle', 36, 15, (x) => {
      ellipse(x, 18, 8, 16, 6, '#0e1a32');
      ellipse(x, 18, 8, 13, 4.6, '#15263f');
      x.strokeStyle = 'rgba(150,185,235,0.4)'; x.lineWidth = 1;
      x.beginPath(); x.ellipse(18, 8, 15.6, 5.6, 0, Math.PI * 1.05, Math.PI * 1.7); x.stroke();
      // moon + ripple
      glowDot(x, 22.5, 6.8, 3.4, 'rgba(235,240,255,0.55)');
      circle(x, 22.5, 6.8, 1.5, 'rgba(245,248,255,0.9)');
      x.strokeStyle = 'rgba(200,220,255,0.35)'; x.lineWidth = 0.8;
      x.beginPath(); x.ellipse(22.5, 7.2, 4.4, 1.6, 0, 0, G.TAU); x.stroke();
    }, { ay: 8 });

    // 木陰 canopy shadow blob (breaks ground tiling)
    mk('shadowblob', 200, 200, (x) => {
      radial(x, 100, 100, 100, [[0, 'rgba(3,5,14,0.5)'], [0.55, 'rgba(3,5,14,0.3)'], [1, 'rgba(0,0,0,0)']]);
      // dappled holes
      const rng = G.mulberry32(5);
      x.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 7; i++) {
        const px = 40 + rng() * 120, py = 40 + rng() * 120, pr = 7 + rng() * 13;
        const g = x.createRadialGradient(px, py, 0, px, py, pr);
        g.addColorStop(0, 'rgba(255,255,255,0.55)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g;
        x.fillRect(px - pr, py - pr, pr * 2, pr * 2);
      }
      x.globalCompositeOperation = 'source-over';
    });

    // ---------- light / glow ----------
    mk('lighthole', 256, 256, (x) => {
      radial(x, 128, 128, 128, [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,0.88)'], [0.75, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
    });
    mk('glow_warm', 64, 64, (x) => {
      radial(x, 32, 32, 32, [[0, 'rgba(255,180,90,0.55)'], [0.5, 'rgba(255,140,60,0.18)'], [1, 'rgba(0,0,0,0)']]);
    });
    mk('glow_cool', 64, 64, (x) => {
      radial(x, 32, 32, 32, [[0, 'rgba(120,230,255,0.5)'], [0.5, 'rgba(80,170,220,0.16)'], [1, 'rgba(0,0,0,0)']]);
    });
    mk('fog', 160, 160, (x) => {
      radial(x, 80, 80, 80, [[0, 'rgba(150,170,210,0.13)'], [0.6, 'rgba(150,170,210,0.06)'], [1, 'rgba(0,0,0,0)']]);
    });

    // ---------- ground tile ----------
    mk('tile', 256, 256, (x) => {
      x.fillStyle = '#131e36';
      x.fillRect(0, 0, 256, 256);
      const rng = G.mulberry32(77);
      // soft patches, drawn wrapped so the tile is seamless
      for (let i = 0; i < 9; i++) {
        const px = rng() * 256, py = rng() * 256, pr = 40 + rng() * 70;
        const col = rng() < 0.5 ? 'rgba(28,42,74,0.5)' : 'rgba(12,18,34,0.55)';
        for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
          const g = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, pr);
          g.addColorStop(0, col);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          x.fillStyle = g;
          x.fillRect(px + ox - pr, py + oy - pr, pr * 2, pr * 2);
        }
      }
      // moss flecks
      for (let i = 0; i < 26; i++) {
        const px = rng() * 256, py = rng() * 256;
        x.fillStyle = 'rgba(46,96,76,0.30)';
        const s = 1.6 + rng() * 1.6;
        for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
          x.fillRect(px + ox, py + oy, s, s);
        }
      }
      // speckles
      for (let i = 0; i < 130; i++) {
        const px = rng() * 256, py = rng() * 256;
        x.fillStyle = rng() < 0.25 ? 'rgba(64,92,140,0.55)' : 'rgba(34,48,82,0.65)';
        const s = rng() < 0.85 ? 1.5 : 2.5;
        for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
          x.fillRect(px + ox, py + oy, s, s);
        }
      }
    });

    // ---------- weapon / passive icons ----------
    // アイコンはUI要素なので pixelize を通さず高解像度(4x=112px)で滑らかに焼く。
    // 論理寸は 28x28 のまま(S.draw が s.w/s.h で縮小描画 → 表示サイズ不変・拡大で滲まない)。
    function icon(name, fn) {
      const SC = 4;
      const c = document.createElement('canvas');
      c.width = 28 * SC; c.height = 28 * SC;
      const x = c.getContext('2d');
      x.scale(SC, SC);
      x.lineJoin = 'round'; x.lineCap = 'round';
      x.fillStyle = '#161a28';
      x.fillRect(0.5, 0.5, 27, 27);
      x.strokeStyle = '#2e3650';
      x.lineWidth = 1;
      x.strokeRect(0.5, 0.5, 27, 27);
      fn(x);
      reg[name] = { c, w: 28, h: 28, ax: 14, ay: 14 };
    }
    icon('ic_ofuda', (x) => {
      x.save(); x.translate(14, 14); x.rotate(0.25);
      x.fillStyle = '#fffdf2'; x.fillRect(-4.5, -9, 9, 18);
      x.fillStyle = '#c0392b'; x.font = 'bold 7px serif'; x.textAlign = 'center';
      x.fillText('封', 0, 0); x.fillText('魔', 0, 7);
      x.restore();
    });
    icon('ic_katana', (x) => {
      x.save(); x.translate(14, 14); x.rotate(-Math.PI / 4);
      x.fillStyle = '#dfe6f0'; x.fillRect(-1.4, -11, 2.8, 15);
      x.fillStyle = '#9aa4b8';
      poly(x, [[-1.4, -11], [0, -13.5], [1.4, -11]], '#dfe6f0');
      x.fillStyle = '#3a2a20'; x.fillRect(-1.8, 4, 3.6, 6);
      x.fillStyle = '#d8a23a'; x.fillRect(-2.6, 3, 5.2, 1.8);
      x.restore();
    });
    icon('ic_fox', (x) => {
      circle(x, 14, 15, 6.4, '#f2ead8');
      poly(x, [[9.5, 11], [8, 4.5], [12.5, 9]], '#f2ead8');
      poly(x, [[18.5, 11], [20, 4.5], [15.5, 9]], '#f2ead8');
      x.fillStyle = '#c0392b';
      x.fillRect(11, 14, 1.8, 1.8); x.fillRect(15.2, 14, 1.8, 1.8);
      poly(x, [[13, 18.5], [14, 20], [15, 18.5]], '#3a2a20');
    });
    icon('ic_raitei', (x) => {
      poly(x, [[16, 3], [9, 15], [13.5, 15], [11, 25], [20, 12], [15, 12]], '#ffe79a', '#d8a23a');
    });
    icon('ic_kitsunebi', (x) => {
      radial(x, 14, 16, 9, [[0, 'rgba(235,255,255,1)'], [0.4, 'rgba(140,235,255,0.9)'], [1, 'rgba(0,0,0,0)']]);
      x.fillStyle = 'rgba(140,225,250,0.9)';
      x.beginPath();
      x.moveTo(14, 4);
      x.quadraticCurveTo(18.5, 10, 14, 15);
      x.quadraticCurveTo(9.5, 10, 14, 4);
      x.fill();
    });
    icon('ic_kamaitachi', (x) => {
      x.strokeStyle = '#bff7ff'; x.lineWidth = 2.4;
      x.beginPath(); x.arc(10, 14, 8, -0.9, 0.9); x.stroke();
      x.strokeStyle = 'rgba(190,247,255,0.55)'; x.lineWidth = 2;
      x.beginPath(); x.arc(15, 14, 8, -0.9, 0.9); x.stroke();
      x.strokeStyle = 'rgba(190,247,255,0.3)'; x.lineWidth = 1.6;
      x.beginPath(); x.arc(20, 14, 8, -0.9, 0.9); x.stroke();
    });
    icon('ic_kekkai', (x) => {
      x.strokeStyle = '#9ad8ff'; x.lineWidth = 1.8;
      circle(x, 14, 14, 9, null, '#9ad8ff');
      x.fillStyle = '#9ad8ff'; x.font = '7px serif'; x.textAlign = 'center';
      x.fillText('結', 14, 16.5);
      x.strokeStyle = 'rgba(154,216,255,0.4)';
      circle(x, 14, 14, 11.5, null, 'rgba(154,216,255,0.4)');
    });
    icon('ic_juzu', (x) => {
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * G.TAU - Math.PI / 2;
        circle(x, 14 + Math.cos(a) * 7.5, 15 + Math.sin(a) * 7.5, 2.6, '#6a4a33');
      }
      circle(x, 14, 5, 3.2, '#8a3030');
    });
    icon('ic_bonsho', (x) => {
      x.strokeStyle = '#5a4a30'; x.lineWidth = 1.8;
      x.beginPath(); x.arc(14, 5.5, 2.4, Math.PI, 0); x.stroke();
      x.fillStyle = '#a8905a';
      x.beginPath();
      x.moveTo(7.5, 9.5);
      x.quadraticCurveTo(7.5, 6, 14, 6);
      x.quadraticCurveTo(20.5, 6, 20.5, 9.5);
      x.lineTo(21.5, 22);
      x.lineTo(6.5, 22);
      x.closePath(); x.fill();
      x.strokeStyle = '#5e4e30'; x.lineWidth = 1;
      x.beginPath(); x.moveTo(7, 11.5); x.lineTo(21, 11.5); x.stroke();
      x.beginPath(); x.moveTo(6.8, 18.5); x.lineTo(21.2, 18.5); x.stroke();
      circle(x, 14, 20.4, 1.6, '#ffd166');
      x.fillStyle = '#a8905a';
      x.fillRect(10, 22, 8, 2);
    });
    icon('ic_hamaya', (x) => {
      x.save(); x.translate(14, 14); x.rotate(-Math.PI / 4);
      x.fillStyle = '#f2ead0'; x.fillRect(-9, -0.9, 14, 1.8);
      poly(x, [[5, -2.6], [10.5, 0], [5, 2.6]], '#ffd166', '#a87818');
      poly(x, [[-12, -2.6], [-7, -1.4], [-7, 1.4], [-12, 2.6], [-10, 0]], '#d84038');
      x.restore();
    });
    icon('ic_komainu', (x) => {
      circle(x, 14, 14, 7.5, '#9aa2bc');
      circle(x, 9.5, 8.4, 2.6, '#7c849e');
      circle(x, 14, 7, 2.6, '#7c849e');
      circle(x, 18.5, 8.4, 2.6, '#7c849e');
      glowDot(x, 11.3, 13, 2, '#ffd166');
      glowDot(x, 16.7, 13, 2, '#ffd166');
      x.fillStyle = '#5a2018';
      x.beginPath(); x.arc(14, 17.5, 2.6, 0, Math.PI); x.fill();
      poly(x, [[10.5, 20.5], [17.5, 20.5], [14, 24.5]], '#c84038');
    });
    icon('ic_gohei', (x) => {
      x.save(); x.translate(14, 14); x.rotate(0.35);
      x.fillStyle = '#8a6a44'; x.fillRect(-1.2, -10, 2.4, 20);
      poly(x, [[-1, -7.5], [-8, -5], [-4, -2.5], [-9, 1], [-4.5, 2.5], [-1, -0.5]], '#fffdf2', '#9a8a66');
      poly(x, [[1, -7.5], [8, -5], [4, -2.5], [9, 1], [4.5, 2.5], [1, -0.5]], '#fffdf2', '#9a8a66');
      x.restore();
    });
    icon('ic_shimenawa', (x) => {
      x.strokeStyle = '#b89b66'; x.lineWidth = 3.2;
      x.beginPath(); x.arc(14, 14, 8.5, -0.6, Math.PI + 0.6); x.stroke();
      x.strokeStyle = 'rgba(110,86,46,0.8)'; x.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const a = -0.4 + i * 0.75;
        const px = 14 + Math.cos(a) * 8.5, py = 14 + Math.sin(a) * 8.5;
        x.beginPath(); x.moveTo(px - 1.4, py - 1.4); x.lineTo(px + 1.4, py + 1.4); x.stroke();
      }
      x.fillStyle = '#fffdf2';
      for (const a of [0.4, 1.6, 2.7]) {
        const px = 14 + Math.cos(a) * 8.5, py = 14 + Math.sin(a) * 8.5;
        poly(x, [[px - 1.6, py], [px - 0.4, py + 4.4], [px + 1.4, py], [px + 0.2, py + 2.6]], '#fffdf2', '#c9b88a');
      }
    });
    // --- Unity移植で data に在ったがWebに無かった得物アイコン (祓印リデザイン他)。Web素朴スタイルで自作 ---
    icon('ic_daiko', (x) => {                 // 陣太鼓
      x.fillStyle = '#b5793f'; x.fillRect(9, 9.5, 10, 10);
      x.fillStyle = '#d8a23a'; x.fillRect(8, 9, 12, 2); x.fillRect(8, 18, 12, 2);
      circle(x, 14, 14.5, 2.2, '#c0392b');
      x.strokeStyle = '#8a6a40'; x.lineWidth = 1.6;
      x.beginPath(); x.moveTo(5, 6); x.lineTo(11, 12); x.stroke();
      x.beginPath(); x.moveTo(23, 6); x.lineTo(17, 12); x.stroke();
    });
    icon('ic_makibishi', (x) => {             // 撒き菱
      x.save(); x.translate(14, 14);
      for (let i = 0; i < 4; i++) { x.rotate(Math.PI / 2); poly(x, [[0, -10], [2.4, -2.2], [-2.4, -2.2]], '#aeb6c8', '#5a6070'); }
      circle(x, 0, 0, 2.6, '#cdd6e6'); circle(x, -0.6, -0.7, 1, '#ffffff');
      x.restore();
    });
    icon('ic_tsubute', (x) => {               // 礫(石つぶて)
      circle(x, 11, 17, 4.2, '#878d9b'); circle(x, 17.6, 15, 3.6, '#9aa0ad'); circle(x, 14, 9.6, 3.2, '#aab0bd');
      glowDot(x, 9.6, 15.4, 1.5, 'rgba(255,255,255,0.6)');
    });
    icon('ic_sumiuchi', (x) => {              // 墨打ち(墨の飛沫)
      circle(x, 12, 15, 5, '#3c4d70'); circle(x, 18.4, 11, 2.7, '#48597f'); circle(x, 19, 18.4, 1.9, '#48597f'); circle(x, 9, 9.4, 1.7, '#48597f');
      glowDot(x, 10.6, 13, 1.7, 'rgba(150,180,235,0.6)');
    });
    icon('ic_suzunari', (x) => {              // 鈴鳴らし(神楽鈴=金鈴の房)
      x.fillStyle = '#8a6a44'; x.fillRect(13, 4, 2, 6);
      for (const p of [[10, 15], [18, 15], [14, 19]]) { circle(x, p[0], p[1], 3.2, '#e8c45a', '#9a7a30'); circle(x, p[0], p[1] + 1.4, 0.9, '#7a5a20'); }
    });
    icon('ic_kiyome', (x) => {                // 清め塩(塩の山+煌めき)
      poly(x, [[7, 20], [21, 20], [14, 8]], '#eef2fb', '#b9c6e0'); x.fillStyle = '#dfe8f8'; x.fillRect(7, 19, 14, 2);
      poly(x, [[14, 2.5], [15, 5.5], [18, 6.5], [15, 7.5], [14, 10.5], [13, 7.5], [10, 6.5], [13, 5.5]], '#ffe79a');
    });
    icon('ic_norito', (x) => {                // 祝詞連唱(金の円相)
      x.lineWidth = 1.8; circle(x, 14, 14, 8.5, null, '#e8c45a');
      x.fillStyle = '#ffe79a'; x.font = '7px serif'; x.textAlign = 'center'; x.fillText('祝', 14, 16.6);
    });
    icon('ic_kagami', (x) => {                // 鏡返し(円鏡+柄)
      circle(x, 14, 11.5, 6.5, '#cdd9ee', '#8a98b4'); circle(x, 14, 11.5, 3.2, '#7e90b0');
      x.fillStyle = '#8a6a44'; x.fillRect(12.8, 17, 2.4, 7);
    });
    icon('ic_mandala', (x) => {               // 封字曼荼羅(二重円+中央十字)
      x.lineWidth = 1.6; circle(x, 14, 14, 9, null, '#e8c45a'); circle(x, 14, 14, 5, null, '#e8c45a');
      x.strokeStyle = '#ffe79a'; x.lineWidth = 1.4;
      x.beginPath(); x.moveTo(14, 9); x.lineTo(14, 19); x.moveTo(9, 14); x.lineTo(19, 14); x.stroke();
      circle(x, 14, 14, 1.6, '#ffd166');
    });
    icon('ic_sanshu', (x) => {                // 三種祓具(三宝珠)
      circle(x, 14, 9.5, 3.4, '#ffe79a', '#d8a23a');
      circle(x, 9.5, 17.5, 3.4, '#ffe79a', '#d8a23a');
      circle(x, 18.5, 17.5, 3.4, '#ffe79a', '#d8a23a');
      circle(x, 14, 9.5, 1.1, '#ffffff');
    });
    icon('ic_mihashira', (x) => {             // 天ノ御柱(光柱+礎+頂光)
      x.fillStyle = '#efe6c8'; x.fillRect(11, 7.5, 6, 15);
      x.fillStyle = '#d8c89a'; x.fillRect(9, 6, 10, 2.2); x.fillRect(9, 21, 10, 2.4);
      glowDot(x, 14, 5, 3, 'rgba(255,236,170,0.9)');
    });
    icon('ic_shuriken', (x) => {
      x.save(); x.translate(14, 14); x.rotate(0.4);
      x.fillStyle = '#c9ccd6';
      for (let i = 0; i < 4; i++) {
        x.rotate(Math.PI / 2);
        poly(x, [[0, -10], [2.6, -2.6], [-2.6, -2.6]], '#c9ccd6', '#5a6070');
      }
      circle(x, 0, 0, 2.4, '#3a4050', '#1a2030');
      x.restore();
    });
    icon('ic_kusarigama', (x) => {
      // chain
      x.strokeStyle = '#8a8fa0'; x.lineWidth = 1.4;
      for (let i = 0; i < 4; i++) {
        x.beginPath(); x.ellipse(7 + i * 3.4, 20 - i * 2.6, 1.8, 1.2, -0.6, 0, G.TAU); x.stroke();
      }
      // sickle
      x.save(); x.translate(17, 9); x.rotate(0.3);
      x.fillStyle = '#6a4a2c'; x.fillRect(-1.4, 0, 2.8, 9);
      x.beginPath();
      x.moveTo(-1.4, 1);
      x.quadraticCurveTo(-2, -7, 8, -7.5);
      x.quadraticCurveTo(0, -5, 1.6, 1);
      x.closePath();
      x.fillStyle = '#dfe6f0'; x.fill();
      x.strokeStyle = '#4a5266'; x.lineWidth = 0.9; x.stroke();
      x.restore();
    });
    icon('ic_tanegashima', (x) => {
      x.save(); x.translate(14, 14); x.rotate(-0.5);
      // barrel
      x.fillStyle = '#3a3444';
      x.fillRect(-11, -1.6, 17, 3.2);
      x.fillStyle = '#5a5468';
      x.fillRect(-11, -1.6, 17, 1.2);
      // stock
      poly(x, [[5, -1.8], [12, 1.5], [11, 4.5], [4, 1.8]], '#6a4a2c', '#3a2a18');
      // muzzle flash
      glowDot(x, -12.5, 0, 4, 'rgba(255,200,110,0.9)');
      x.restore();
    });
    icon('ic_fuin', (x) => {
      x.save(); x.translate(14, 14); x.rotate(Math.PI / 4);
      x.fillStyle = '#f4ead2';
      x.fillRect(-8, -8, 16, 16);
      x.strokeStyle = '#b04030'; x.lineWidth = 1.2;
      x.strokeRect(-8, -8, 16, 16);
      x.restore();
      x.strokeStyle = '#c0392b'; x.lineWidth = 1;
      circle(x, 14, 14, 6.6, null, '#c0392b');
      x.fillStyle = '#b04030';
      x.font = 'bold 8px "Yu Mincho", serif';
      x.textAlign = 'center';
      x.fillText('封', 14, 17);
    });
    icon('ic_zangetsu', (x) => {
      x.beginPath();
      x.arc(14, 14, 9.5, -Math.PI * 0.62, Math.PI * 0.62);
      x.arc(10.5, 14, 7.2, Math.PI * 0.55, -Math.PI * 0.55, true);
      x.closePath();
      const g = x.createLinearGradient(8, 5, 22, 23);
      g.addColorStop(0, '#ecf6ff');
      g.addColorStop(1, '#7aa2e6');
      x.fillStyle = g;
      x.fill();
      x.strokeStyle = 'rgba(70,110,190,0.9)'; x.lineWidth = 1; x.stroke();
    });
    const kanjiIcon = (name, ch, color) => icon(name, (x) => {
      x.save(); x.translate(14, 14); x.rotate(Math.PI / 4);
      x.fillStyle = '#1d2336';
      x.fillRect(-8.5, -8.5, 17, 17);
      x.strokeStyle = color; x.lineWidth = 1.2;
      x.strokeRect(-8.5, -8.5, 17, 17);
      x.restore();
      x.fillStyle = color;
      x.font = 'bold 12px "Yu Mincho", serif';
      x.textAlign = 'center';
      x.fillText(ch, 14, 18.5);
    });
    kanjiIcon('ic_might', '力', '#ff8a6a');
    kanjiIcon('ic_area', '扇', '#8ad8a0');
    kanjiIcon('ic_speed', '足', '#8ab8ff');
    kanjiIcon('ic_hp', '守', '#ff9a9a');
    kanjiIcon('ic_regen', '雫', '#7ee8d8');
    kanjiIcon('ic_haste', '鈴', '#ffd166');
    kanjiIcon('ic_magnet', '磁', '#d8a2ff');
    kanjiIcon('ic_armor', '鉢', '#c8ccd8');
    kanjiIcon('ic_crit', '朱', '#ff6a4a');
    kanjiIcon('ic_growth', '才', '#8ae8a0');
    kanjiIcon('ic_zeni', '銭', '#ffd166');
    kanjiIcon('ic_fuku', '福', '#ff9a9a');
    kanjiIcon('ic_pierce', '貫', '#a8c8e8');
    kanjiIcon('ic_bounce', '跳', '#ff9ad2');
    kanjiIcon('ic_still', '澄', '#9ad8c8');
    kanjiIcon('ic_tamegiri', '溜', '#ffcf6a');
    kanjiIcon('ic_hiken', '剣', '#9fe6ff');
    kanjiIcon('ic_shots', '射', '#ffb060');
    kanjiIcon('ic_laser', '光', '#a8f0ff');
    kanjiIcon('ic_juso', '呪', '#c08bff');
    kanjiIcon('ic_honoo', '炎', '#ff7a32');
    kanjiIcon('ic_ibara', '茨', '#9ed98b');
    // 新スキル(2026-06-23)
    kanjiIcon('ic_kasumigiri', '霞', '#bcd0e6');
    kanjiIcon('ic_konshin', '渾', '#ffd166');
    kanjiIcon('ic_hajin', '破', '#cdd6e6');
    kanjiIcon('ic_raisou', '槍', '#9fe6ff');
    kanjiIcon('ic_hourai', '放', '#bfe9ff');
    kanjiIcon('ic_nokoribi', '残', '#ff9a4a');
    kanjiIcon('ic_messe', '滅', '#c87bd6');
    kanjiIcon('ic_lampboost', '灯', '#ffd98a');
    icon('ic_heal', (x) => {
      poly(x, [[14, 5], [22, 19], [6, 19]], '#f6f2e6', '#c8c0a8');
      x.fillStyle = '#1d2a20'; x.fillRect(11, 14.5, 6, 6);
    });
    icon('ic_bomb2', (x) => {
      x.fillStyle = '#4a2a62'; x.fillRect(9, 5, 10, 18);
      x.strokeStyle = '#ffd166'; x.lineWidth = 1;
      x.beginPath();
      for (let i = 0; i <= 5; i++) {
        const a = -Math.PI / 2 + i * G.TAU * 2 / 5;
        const px = 14 + Math.cos(a) * 4.4, py = 14 + Math.sin(a) * 4.4;
        i === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
      }
      x.stroke();
    });

    // vignette (rendered small, stretched at draw time)
    mk('vign', 320, 180, (x) => {
      const g = x.createRadialGradient(160, 90, 60, 160, 90, 195);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.72, 'rgba(4,5,12,0.12)');
      g.addColorStop(1, 'rgba(3,4,10,0.62)');
      x.fillStyle = g;
      x.fillRect(0, 0, 320, 180);
    });
  };

  // ---------- raster override pipeline ----------
  // Every animation frame in the manifest is an independent PNG asset. Runtime
  // animation only switches registered frame names; it never deforms a base image.
  const PLAYER_MOTION_POSES = {
    idle: [
      { lift: 0, upper: 0, lean: 0 },
      { lift: -1, upper: 1, lean: 0 },
      { lift: -2, upper: 0, lean: 1 },
      { lift: -1, upper: -1, lean: 0 },
    ],
    walk: [
      { lift: 0, upper: 1, lean: 1, stride: 2 },
      { lift: -2, upper: 0, lean: 1, stride: 1 },
      { lift: -1, upper: -1, lean: 0, stride: -2 },
      { lift: 0, upper: -1, lean: -1, stride: -2 },
      { lift: -2, upper: 0, lean: -1, stride: -1 },
      { lift: -1, upper: 1, lean: 0, stride: 2 },
    ],
    attack: [
      { lift: 0, upper: -2, lean: -2 },
      { lift: -1, upper: 3, lean: 2 },
      { lift: -1, upper: 6, lean: 5 },
      { lift: 0, upper: 2, lean: 2 },
    ],
    cast: [
      { lift: 0, upper: -1, lean: 0, flare: 0 },
      { lift: -2, upper: 1, lean: -1, flare: 2 },
      { lift: -4, upper: 0, lean: 0, flare: 4 },
      { lift: -2, upper: -1, lean: 1, flare: 2 },
    ],
    dash: [
      { lift: 1, upper: 4, lean: 4, stride: -2 },
      { lift: 2, upper: 7, lean: 7, stride: -3 },
      { lift: 1, upper: 5, lean: 5, stride: -1 },
    ],
    hurt: [
      { lift: 1, upper: -5, lean: -4, stride: 1 },
      { lift: 2, upper: -1, lean: -3, stride: -1 },
    ],
  };
  const PLAYER_MOTION_PAD = 32;   // 手続き生成フォールバック用の余白(歪みで頭・腕が枠を超えないよう16→32)。実体はPNG資産(下のpad_player_frames相当で余白付与)
  const PLAYER_MOTION_COLORS = {
    p_: '#ffd166',
    pc_suzu_: '#ff8f88',
    pc_mutsuki_: '#9ad8ff',
  };
  const BOSS_MOTION_POSES = {
    idle: [
      { lift: 0, upper: 0, lean: 0, breathe: 0 },
      { lift: -1, upper: 1, lean: 0, breathe: 1 },
      { lift: -2, upper: 0, lean: 1, breathe: 2 },
      { lift: -1, upper: -1, lean: 0, breathe: 1 },
    ],
    move: [
      { lift: 0, upper: 2, lean: 2, spread: 1 },
      { lift: -2, upper: 1, lean: 1, spread: 0 },
      { lift: 0, upper: -2, lean: -1, spread: 1 },
      { lift: -1, upper: 0, lean: 0, spread: 0 },
    ],
    telegraph: [
      { lift: 1, upper: -3, lean: -2, spread: 1 },
      { lift: 2, upper: -1, lean: -1, spread: 3 },
      { lift: -1, upper: 1, lean: 1, spread: 4 },
    ],
    attack: [
      { lift: 1, upper: -4, lean: -3, spread: 1 },
      { lift: -2, upper: 4, lean: 4, spread: 2 },
      { lift: 0, upper: 8, lean: 7, spread: 3 },
      { lift: 1, upper: 3, lean: 3, spread: 1 },
    ],
    hurt: [
      { lift: 2, upper: -7, lean: -6, spread: -1 },
      { lift: 1, upper: -3, lean: -3, spread: 0 },
    ],
    rage: [
      { lift: 0, upper: -2, lean: -1, spread: 2 },
      { lift: -3, upper: 1, lean: 0, spread: 4 },
      { lift: -1, upper: 2, lean: 1, spread: 3 },
      { lift: -2, upper: -1, lean: 0, spread: 4 },
    ],
  };
  const BOSS_MOTION_PAD = 36;
  const BOSS_MOTION_COLORS = {
    b_tanuki: '#a8d89a',
    b_nure: '#79d4df',
    b_ushi: '#ff9a63',
    b_nue: '#b49cff',
    b_gasha: '#f2e7cf',
    b_shuten: '#ff5d48',
    b_tsuchigumo: '#b89a6a',
    b_daitengu: '#ef6a52',
    b_ogama: '#7ec25e',
  };

  function playerMotionPrefix(name) {
    if (name === 'p_0') return 'p_';
    if (name === 'pc_suzu_0') return 'pc_suzu_';
    if (name === 'pc_mutsuki_0') return 'pc_mutsuki_';
    return null;
  }

  function buildPlayerMotionFrame(source, pose, state, frame, color, sourceScaleX, sourceScaleY) {
    const c = document.createElement('canvas');
    c.width = source.width + PLAYER_MOTION_PAD * 2;
    c.height = source.height + PLAYER_MOTION_PAD * 2;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    const w = source.width, h = source.height;
    const pad = PLAYER_MOTION_PAD;
    const lift = Math.round((pose.lift || 0) * sourceScaleY);
    for (let sy = 0; sy < h; sy++) {
      const t = sy / Math.max(1, h - 1);
      const upperWeight = Math.max(0, 1 - t / 0.7);
      const leanWeight = 1 - t;
      const lowerWeight = Math.max(0, (t - 0.62) / 0.38);
      const flareWeight = Math.max(0, 1 - Math.abs(t - 0.56) / 0.24);
      const dx = Math.round(
        ((pose.upper || 0) * upperWeight +
        (pose.lean || 0) * leanWeight) * sourceScaleX
      );
      const split = Math.floor(w / 2);
      const spread = Math.round(
        ((pose.stride || 0) * lowerWeight +
        (pose.flare || 0) * flareWeight) * sourceScaleX
      );
      const groundedLift = Math.round(lift * Math.max(0, 1 - lowerWeight));
      if (spread) {
        const leftWidth = Math.max(1, split + spread);
        const rightWidth = Math.max(1, w - split + spread);
        x.drawImage(source, 0, sy, split, 1,
          pad + dx - spread, pad + sy + groundedLift, leftWidth, 1);
        x.drawImage(source, split, sy, w - split, 1,
          pad + dx + split, pad + sy + groundedLift, rightWidth, 1);
      } else {
        x.drawImage(source, 0, sy, w, 1,
          pad + dx, pad + sy + groundedLift, w, 1);
      }
    }
    x.fillStyle = color;
    if (state === 'cast') {
      const pulse = frame === 2 ? 3 : 2;
      x.fillRect(pad + 2 - frame, pad + Math.round(h * 0.34), pulse, pulse);
      x.fillRect(pad + w + frame - 3, pad + Math.round(h * 0.52), 2, 2);
      if (frame > 0) x.fillRect(pad + Math.round(w * 0.72), pad - 4 + frame, 2, 3);
    } else if (state === 'attack' && frame >= 2) {
      x.fillRect(pad + w + 2, pad + Math.round(h * 0.42), 8 - frame, 2);
      x.fillRect(pad + w, pad + Math.round(h * 0.48), 5, 1);
    } else if (state === 'dash') {
      x.globalAlpha = 0.75;
      x.fillRect(1 + frame * 2, pad + Math.round(h * 0.38), 11, 2);
      x.fillRect(5, pad + Math.round(h * 0.58), 8 + frame, 1);
      x.globalAlpha = 1;
    }
    return c;
  }

  function installPlayerMotionSet(name) {
    const pref = playerMotionPrefix(name);
    const base = reg[name];
    if (!pref || !base || !base.raster) return;
    const scaleX = base.w / base.c.width;
    const scaleY = base.h / base.c.height;
    const sourceScaleX = 1 / scaleX;
    const sourceScaleY = 1 / scaleY;
    const color = PLAYER_MOTION_COLORS[pref];
    Object.keys(PLAYER_MOTION_POSES).forEach(state => {
      PLAYER_MOTION_POSES[state].forEach((pose, i) => {
        const frameName = pref + state + '_' + i;
        const c = buildPlayerMotionFrame(
          base.c, pose, state, i, color, sourceScaleX, sourceScaleY
        );
        reg[frameName] = {
          c,
          w: base.w + PLAYER_MOTION_PAD * 2 * scaleX,
          h: base.h + PLAYER_MOTION_PAD * 2 * scaleY,
          ax: base.ax + PLAYER_MOTION_PAD * scaleX,
          ay: base.ay + PLAYER_MOTION_PAD * scaleY,
          raster: true,
        };
        mkWhite(frameName);
      });
    });
  }

  function bossMotionPrefix(name) {
    const m = /^(b_(?:tanuki|nure|ushi|nue|gasha|shuten))_[01]$/.exec(name);
    return m ? m[1] : null;
  }

  function buildBossMotionFrame(source, pose, state, frame, color, sourceScaleX, sourceScaleY) {
    const c = document.createElement('canvas');
    c.width = source.width + BOSS_MOTION_PAD * 2;
    c.height = source.height + BOSS_MOTION_PAD * 2;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    const w = source.width, h = source.height, pad = BOSS_MOTION_PAD;
    const lift = Math.round((pose.lift || 0) * sourceScaleY);
    for (let sy = 0; sy < h; sy++) {
      const t = sy / Math.max(1, h - 1);
      const upperWeight = Math.max(0, 1 - t / 0.72);
      const leanWeight = 1 - t;
      const bodyWeight = Math.max(0, 1 - Math.abs(t - 0.58) / 0.38);
      const groundWeight = Math.max(0, (t - 0.72) / 0.28);
      const dx = Math.round(
        ((pose.upper || 0) * upperWeight +
        (pose.lean || 0) * leanWeight) * sourceScaleX
      );
      const widen = Math.round(
        ((pose.spread || 0) * bodyWeight +
        (pose.breathe || 0) * bodyWeight * 0.5) * sourceScaleX
      );
      const groundedLift = Math.round(lift * (1 - groundWeight));
      if (widen) {
        const split = Math.floor(w / 2);
        const leftWidth = Math.max(1, split + widen);
        const rightWidth = Math.max(1, w - split + widen);
        x.drawImage(source, 0, sy, split, 1,
          pad + dx - widen, pad + sy + groundedLift, leftWidth, 1);
        x.drawImage(source, split, sy, w - split, 1,
          pad + dx + split, pad + sy + groundedLift, rightWidth, 1);
      } else {
        x.drawImage(source, 0, sy, w, 1,
          pad + dx, pad + sy + groundedLift, w, 1);
      }
    }

    x.fillStyle = color;
    if (state === 'telegraph') {
      const reach = 5 + frame * 4;
      x.globalAlpha = 0.55 + frame * 0.15;
      x.fillRect(pad - reach, pad + Math.round(h * 0.45), reach - 2, 2);
      x.fillRect(pad + w + 2, pad + Math.round(h * 0.45), reach - 2, 2);
      x.fillRect(pad + Math.round(w * 0.5), pad - 5 - frame * 2, 2, 4 + frame);
      x.globalAlpha = 1;
    } else if (state === 'attack' && frame >= 1) {
      x.globalAlpha = 0.8;
      x.fillRect(pad + w + 3, pad + Math.round(h * 0.38), 13 + frame * 4, 3);
      x.fillRect(pad + w, pad + Math.round(h * 0.48), 9 + frame * 3, 2);
      x.globalAlpha = 1;
    } else if (state === 'hurt') {
      x.globalAlpha = 0.9;
      x.fillRect(pad + w + 3, pad + Math.round(h * 0.3), 5, 3);
      x.fillRect(pad + w + 8, pad + Math.round(h * 0.3) - 4, 3, 3);
      x.globalAlpha = 1;
    } else if (state === 'rage') {
      const sparks = [
        [pad - 5, pad + Math.round(h * 0.25)],
        [pad + w + 4, pad + Math.round(h * 0.4)],
        [pad + Math.round(w * 0.25), pad - 7],
        [pad + Math.round(w * 0.75), pad - 4],
      ];
      x.globalAlpha = 0.75;
      for (let i = 0; i <= frame; i++) {
        const s = sparks[i];
        x.fillRect(s[0], s[1], 3, 4);
      }
      x.globalAlpha = 1;
    }
    return c;
  }

  function installBossMotionSet(name) {
    const pref = bossMotionPrefix(name);
    if (!pref) return;
    const base0 = reg[pref + '_0'];
    const base1 = reg[pref + '_1'];
    if (!base0 || !base1 || !base0.raster || !base1.raster) return;
    const color = BOSS_MOTION_COLORS[pref];
    const scaleX = base0.w / base0.c.width;
    const scaleY = base0.h / base0.c.height;
    const sourceScaleX = 1 / scaleX;
    const sourceScaleY = 1 / scaleY;
    Object.keys(BOSS_MOTION_POSES).forEach(state => {
      BOSS_MOTION_POSES[state].forEach((pose, i) => {
        const base = i % 2 ? base1 : base0;
        const frameName = pref + '_' + state + '_' + i;
        const c = buildBossMotionFrame(
          base.c, pose, state, i, color, sourceScaleX, sourceScaleY
        );
        reg[frameName] = {
          c,
          w: base0.w + BOSS_MOTION_PAD * 2 * scaleX,
          h: base0.h + BOSS_MOTION_PAD * 2 * scaleY,
          ax: base0.ax + BOSS_MOTION_PAD * scaleX,
          ay: base0.ay + BOSS_MOTION_PAD * scaleY,
          raster: true,
        };
        mkWhite(frameName);
      });
    });
  }

  function installRaster(name, img, ent) {
    const base = reg[name];
    let { w, h, ax, ay } = ent;
    const scale = ent.scale || 1;
    if (base) {
      if (w === undefined) w = base.w * scale;
      if (h === undefined) h = base.h * scale;
      if (ax === undefined) ax = base.ax * scale;
      if (ay === undefined) ay = base.ay * scale;
    } else {
      const fit = ent.fit || 1;
      if (w === undefined) w = img.naturalWidth * fit * scale;
      if (h === undefined) h = img.naturalHeight * fit * scale;
      if (ax === undefined) ax = w / 2;
      if (ay === undefined) ay = h / 2;
    }
    // bake the PNG into a canvas so mkWhite's source-in flash variant works on raster
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    cx.drawImage(img, 0, 0);
    reg[name] = { c, w, h, ax, ay, raster: true };
    mkWhite(name);
  }

  // load assets/sprites/manifest.json and override matching sprites (non-blocking)
  S.loadRaster = (manifestUrl = 'assets/sprites/manifest.json') => {
    const manifestPromise = window.__SPRITE_MANIFEST
      ? Promise.resolve(window.__SPRITE_MANIFEST)
      : fetch(manifestUrl, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null));
    return manifestPromise
      .then(man => {
        if (!man || !man.sprites) return { loaded: 0, total: 0, skipped: 'no-manifest' };
        const basePath = man.basePath || '';
        const names = Object.keys(man.sprites);
        let loaded = 0;
        return Promise.all(names.map(name => new Promise(res => {
          const ent = man.sprites[name] || {};
          const img = new Image();
          img.onload = () => {
            try { installRaster(name, img, ent); loaded++; }
            catch (e) { console.warn('raster install failed:', name, e); }
            res();
          };
          img.onerror = () => { console.warn('raster missing:', name, ent.file); res(); };
          const file = ent.file || (name + '.png');
          img.src = (window.__SPRITE_DATA && window.__SPRITE_DATA[file]) || (basePath + file);
        }))).then(() => ({ loaded, total: names.length }));
      })
      .catch(() => ({ loaded: 0, total: 0, skipped: 'fetch-failed' }));
  };

  // dump every registered sprite name + logical footprint — author the manifest against this
  S.manifestStub = () => {
    const out = {};
    Object.keys(reg).filter(n => !n.endsWith('_w')).sort().forEach(n => {
      const s = reg[n];
      out[n] = { w: s.w, h: s.h, ax: +s.ax.toFixed(1), ay: +s.ay.toFixed(1) };
    });
    return out;
  };

  return S;
})();
