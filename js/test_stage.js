/* テストステージ — 全モブ・全ボスを陳列して動作確認する開発用モード。
   - 全ユニットを格子状に配置(モブ→上段グリッド / ボス→下段グリッド)
   - プレイヤーの弾で当たり判定+吹っ飛び、死んだら一定後にリスポーン
   - モブは2フレームidleが回り、ボスは idle/move/telegraph/attack/hurt/rage を一定間隔で巡回
   - プレイヤーは自由移動+通常通り射撃(god ON で被弾しない)
   - スキル(得物)を ON/OFF できるDOMパネル付き
   entry: タイトルの「テストステージ」ボタン → G.test.enter()
*/
(() => {
  const G = window.G;
  const T = { active: false, slots: [] };
  G.test = T;
  const STATES = ['idle', 'move', 'telegraph', 'attack', 'hurt', 'rage'];
  let token = 0;

  T.enter = () => {
    G.main.startGame();             // 通常のrunを開始(player/weapons/描画が動く)
    const run = G.run;
    run._test = true;
    G.debug.god = true;
    T.setup();
    T.buildPanel();
    T.active = true;
    if (G.ui.announce) G.ui.announce('テストステージ', '右のパネルでスキルをON/OFF');
  };

  T.setup = () => {
    const run = G.run, p = run.player;
    for (const e of run.en.act) e.dead = true;     // 既存敵を一掃
    run.boss = null;
    run.dir.bossIdx = 1e9; run.dir.evIdx = 1e9; run.dir.annIdx = 1e9; run.dir.nextSpawn = 1e9;  // ディレクター停止
    run.t = 8;
    T.slots.length = 0;
    const E = Object.keys(G.data.E), B = Object.keys(G.data.B);
    // モブ格子(6列・上半分)
    const ecols = 6, esp = 150, ex0 = -((ecols - 1) * esp) / 2, ey0 = -800;
    E.forEach((id, i) => T.slots.push({ id, boss: false, x: ex0 + (i % ecols) * esp, y: ey0 + Math.floor(i / ecols) * esp }));
    // ボス格子: 闘技場(±1700×±960)内に全員収める。5列・下半分に2段(塀外に出さない)
    const bcols = 5, bsp = 600, brow = 480, bx0 = -((bcols - 1) * bsp) / 2, by0 = 150;
    B.forEach((id, i) => T.slots.push({ id, boss: true, x: bx0 + (i % bcols) * bsp, y: by0 + Math.floor(i / bcols) * brow }));
    p.x = 0; p.y = -880;            // プレイヤーは上端の空きへ
    G.cam.x = p.x; G.cam.y = p.y;
    for (const s of T.slots) T.spawnSlot(s);
    run.boss = null;
  };

  T.spawnSlot = (s) => {
    const run = G.run;
    const e = s.boss ? G.ent.spawnBoss(s.id) : G.ent.spawnEnemy(s.id, s.x, s.y, { force: true });
    if (!e) { s.respawnT = 1; return; }
    e.x = s.x; e.y = s.y;
    e.kbx = 0; e.kby = 0; e.vx = 0; e.vy = 0;
    e._preview = true; e._slot = s; e._token = ++token; e._mt = Math.random() * (STATES.length * 1.1);
    if (s.boss) run.boss = null;   // ボスHUDの体力バーは出さない
    s.e = e; s.token = e._token; s.respawnT = 1.4;
  };

  // 敵更新ループから呼ばれる(AIを止め、ノックバック物理+スロット復帰+モーション巡回のみ)
  T.unit = (e, h) => {
    const s = e._slot;
    e.x += (e.kbx || 0) * h; e.y += (e.kby || 0) * h;             // 吹っ飛び物理
    const d = Math.pow(0.0025, h); e.kbx *= d; e.kby *= d;
    if (s && Math.abs(e.kbx) + Math.abs(e.kby) < 50) {           // 落ち着いたらスロットへ復帰
      e.x += (s.x - e.x) * Math.min(1, h * 2.5);
      e.y += (s.y - e.y) * Math.min(1, h * 2.5);
    }
    e.slowT = 0; e.feared = 0; e.rootT = 0;                       // 状態異常で見た目が乱れないように
    if (e.boss) {                                                 // ボス=状態を一定間隔で巡回
      e._mt += h;
      const st = STATES[Math.floor(e._mt / 1.1) % STATES.length];
      e.bossAttackT = 0; e.bossCastT = 0; e.bossHurtT = 0; e.bossRageT = 0; e.bstate = 'chase'; e.vx = 0; e.vy = 0;
      if (st === 'move') e.vx = 30;
      else if (st === 'telegraph') e.bossCastT = 0.5;
      else if (st === 'attack') e.bossAttackT = 0.5;
      else if (st === 'hurt') e.bossHurtT = 0.2;
      else if (st === 'rage') e.bossRageT = 0.5;
    }
  };

  T.update = (h) => {
    const run = G.run;
    if (run.t > 20) run.t = 8;     // hpScale安定
    for (const s of T.slots) {
      const dead = !s.e || s.e.dead || s.e._token !== s.token;
      if (dead) { s.respawnT -= h; if (s.respawnT <= 0) T.spawnSlot(s); }
      else s.respawnT = 1.4;
    }
  };

  T.exit = () => {
    T.active = false;
    if (G.run) G.run._test = false;
    const pn = document.getElementById('test-panel'); if (pn) pn.remove();
    if (G.main.toTitle) G.main.toTitle();
  };

  T.buildPanel = () => {
    const old = document.getElementById('test-panel'); if (old) old.remove();
    const run = G.run;
    const pn = document.createElement('div'); pn.id = 'test-panel';
    pn.style.cssText = 'position:fixed;right:8px;top:8px;width:188px;max-height:90vh;overflow:auto;' +
      'background:rgba(12,16,26,0.94);border:1px solid #2e3650;border-radius:6px;padding:8px;' +
      'font:12px/1.4 sans-serif;color:#cdd6e6;z-index:99999;';
    const h = document.createElement('div'); h.textContent = '🧪 スキル ON/OFF';
    h.style.cssText = 'font-weight:bold;margin-bottom:6px;color:#ffd166;'; pn.appendChild(h);
    for (const id of Object.keys(G.data.W)) {
      const w = G.data.W[id];
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:1px 0;cursor:pointer;';
      const cb = document.createElement('input'); cb.type = 'checkbox';
      cb.checked = run.weapons.some(x => x.id === id);
      cb.addEventListener('change', () => {
        if (cb.checked) { if (!run.weapons.some(x => x.id === id)) G.sys.addWeapon(id); }
        else {
          const i = run.weapons.findIndex(x => x.id === id);
          if (i >= 0) { run.weapons.splice(i, 1); if (id === 'fox' && G.sys.rebuildFoxes) G.sys.rebuildFoxes(); }
        }
      });
      const sp = document.createElement('span'); sp.textContent = (w && w.name) || id;
      row.appendChild(cb); row.appendChild(sp); pn.appendChild(row);
    }
    const ex = document.createElement('button'); ex.textContent = 'テスト終了';
    ex.style.cssText = 'margin-top:8px;width:100%;padding:4px;cursor:pointer;';
    ex.addEventListener('click', T.exit); pn.appendChild(ex);
    document.body.appendChild(pn);
  };

  // タイトルのボタンに配線
  function bind() {
    const b = document.getElementById('bt-test');
    if (b) b.addEventListener('click', () => T.enter());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
