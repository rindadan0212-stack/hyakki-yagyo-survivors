/* 百鬼夜行サバイバーズ — util: math, RNG, object pool, spatial hash */
'use strict';

const G = window.G = {};

G.TAU = Math.PI * 2;
G.VIEW_W = 1280;
G.VIEW_H = 720;

// タッチ端末か (オンスクリーン操作の表示判定)
G.IS_TOUCH = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
  || ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

// ---- プレイ感チューニング (実行時に __G.gspeed/zoom/pspeed で変更可) ----
G.GAME_SPEED = 1.12;   // 進行速度の全体倍率 (1=従来。敵/弾/湧き/時計すべてに比例)
G.ZOOM = 0.87;         // 常時ズーム倍率 (1=従来)。さらに1.2倍引き: 1.04→0.87(=÷1.2)で視界を広げた
G.UNIT_SCALE = 1.4;    // ユニット(プレイヤー/妖/ボス)の見た目+当たり判定の倍率 (1=従来。識別しやすく)
G.PLAYER_SPD = 218.4;  // プレイヤー基礎移動速度 px/s (182の1.2倍)
G.ANIM_T = 1.5;        // キャラのモーション尺の倍率 (1=従来。1.5=スプライト動作を1.5倍の時間でゆっくり流す。挙動/当たり判定の時間は不変、見た目のフレーム送りのみ)
G.BOSS_ANIM_T = 4;     // ボス専用のモーション尺の倍率 (4=通常の4倍ゆっくり。e.t自体=AIは不変、見た目のフレーム送りのみ)

// ---- 有限マップ (塀で囲まれた闘技場) ----
G.MAP_W = 3400;        // マップ全幅 (~3.5 画面)
G.MAP_H = 1920;        // マップ全高
G.WALL = 42;           // 塀の厚み (px)
G.LAMP_R = 210;        // 据置提灯の灯り/安全半径

G.clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// 座標を壁の内側に丸める (margin = 物体半径ぶん内側に)
G.clampMap = (x, y, m = 0) => {
  const hw = G.MAP_W / 2 - G.WALL - m, hh = G.MAP_H / 2 - G.WALL - m;
  return [G.clamp(x, -hw, hw), G.clamp(y, -hh, hh)];
};
G.lerp = (a, b, t) => a + (b - a) * t;
G.rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
G.randInt = (a, b) => Math.floor(G.rand(a, b + 1));
G.pick = arr => arr[(Math.random() * arr.length) | 0];
G.chance = p => Math.random() < p;
G.dist2 = (x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; };
G.angleTo = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);
G.easeOut = t => 1 - (1 - t) * (1 - t);
G.easeIn = t => t * t;

G.norm = (x, y) => {
  const m = Math.hypot(x, y);
  return m > 1e-6 ? [x / m, y / m] : [0, 0];
};

// deterministic hash for procedural world decoration
G.hash2 = (x, y) => {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
};

G.fmtTime = s => {
  s = Math.max(0, Math.floor(s));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// seeded RNG (for music phrase generation)
G.mulberry32 = seed => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/* Object pool.
 * Contract: update loops iterate backwards (i = act.length-1 .. 0) and may
 * call releaseAt(i) for the current index only — swap-remove keeps it sound. */
G.Pool = class {
  constructor(create, max = Infinity) {
    this.create = create;
    this.max = max;
    this.free = [];
    this.act = [];
  }
  obtain() {
    if (this.act.length >= this.max) this.releaseAt(0);
    const o = this.free.pop() || this.create();
    this.act.push(o);
    return o;
  }
  releaseAt(i) {
    const o = this.act[i];
    const last = this.act.pop();
    if (i < this.act.length) this.act[i] = last;
    this.free.push(o);
    return o;
  }
  release(o) {
    const i = this.act.indexOf(o);
    if (i >= 0) this.releaseAt(i);
  }
  clear() {
    while (this.act.length) this.releaseAt(this.act.length - 1);
  }
  get n() { return this.act.length; }
};

/* Spatial hash grid for enemy lookups (rebuilt every step). */
G.Grid = class {
  constructor(cell = 80) {
    this.cell = cell;
    this.map = new Map();
    this._qid = 0;   // queryCircleの重複排除スタンプ
  }
  key(cx, cy) { return (cx + 32768) + (cy + 32768) * 65536; }
  clear() {
    for (const a of this.map.values()) a.length = 0;
  }
  insert(e) {
    // 背の高いユニット(ボス)は当たり判定の縦長楕円が複数セルにまたがる。
    // 足元セルだけに登録すると上半身に当たった弾をbroad-phaseで取りこぼす→楕円が重なる全セルに登録する。
    const c = this.cell;
    const ho = e.hitOff || 0;
    const cyc = e.y;                                 // 楕円中心=e.y(イラストの中心)
    const ryy = ho > e.r ? ho + e.r * 0.4 : e.r;     // queryCircleと同じ縦半径(体半径ho)
    const rxh = e.hitRX || e.r;                      // 横の当たり半径(ボスは胴体幅に合わせ e.r と別個に拡張)
    const x0 = Math.floor((e.x - rxh) / c), x1 = Math.floor((e.x + rxh) / c);
    const y0 = Math.floor((cyc - ryy) / c), y1 = Math.floor((cyc + ryy) / c);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const k = this.key(cx, cy);
        let a = this.map.get(k);
        if (!a) { a = []; this.map.set(k, a); }
        a.push(e);
      }
    }
    e._cx = Math.floor(e.x / c); e._cy = Math.floor(e.y / c);   // 分離処理用の代表セル(足元)
  }
  cellList(cx, cy) { return this.map.get(this.key(cx, cy)); }
  /* collect entities whose circle intersects (x,y,r); pads search range by one
   * cell so large-radius entities centred in neighbouring cells are found */
  queryCircle(x, y, r, out) {
    out.length = 0;
    const c = this.cell, pad = c;
    const qid = ++this._qid;
    const x0 = Math.floor((x - r - pad) / c), x1 = Math.floor((x + r + pad) / c);
    const y0 = Math.floor((y - r - pad) / c), y1 = Math.floor((y + r + pad) / c);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const a = this.map.get(this.key(cx, cy));
        if (!a) continue;
        for (let i = 0; i < a.length; i++) {
          const e = a[i];
          if (e.dead || e._q === qid) continue;   // 複数セル登録の重複を排除(1クエリで1回だけ判定)
          e._q = qid;
          // 当たり判定はe.y中心(=イラストの中心)の縦長楕円。体半径hoで体全体をカバー
          const ho = e.hitOff || 0;
          const dx = e.x - x, dy = e.y - y;
          const rxx = r + (e.hitRX || e.r), ryy = r + (ho > e.r ? ho + e.r * 0.4 : e.r);
          if ((dx * dx) / (rxx * rxx) + (dy * dy) / (ryy * ryy) <= 1) out.push(e);
        }
      }
    }
    return out;
  }
};

// shared scratch buffers (avoid per-frame allocation)
G.QBUF = [];
G.QBUF2 = [];

G.store = {
  get(key, fallback) {
    if (G.platform) return G.platform.load(key, fallback);   // platform.js: メモリ・フォールバック付き
    try {
      const v = localStorage.getItem('hyakki_' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  },
  set(key, v) {
    if (G.platform) { G.platform.save(key, v); return; }
    try { localStorage.setItem('hyakki_' + key, JSON.stringify(v)); } catch (e) { /* private mode */ }
  }
};
