// FX観測ハーネス: 全FX(anim昇格 + expBurst)をプレイヤー無しで個別に実描画し、
// 向き・サイズ・形・縁(コラ感)を一覧監査する。緑の右向き矢印 = 狙い方向の基準。
//
// 使い方:
//   ・ブラウザのコンソールにこのファイル全文を貼り付け → __fxObserve() を実行
//   ・または Playwright: browser_evaluate でこの中身を実行 → #__fxo を screenshot
//   ・anim名/burst名を増減したら ANIMS / (expImgから自動) に反映される
//
// 仕組み: F.render(ctx) は anims と expBursts を両方描く。world(0,0)発のFXを
//   各セル中心へ transform して描画。G.cam.onScreen を一時 true 固定で必ず描く。
//   timescale不要(tを手動でピークに設定して同期描画)。
(() => {
  window.__fxObserve = (opts = {}) => {
    const G = window.G, F = G.fx;
    if (!G.run || G.main.state !== 'run') { G.debug.god = true; G.main.startGame(); }
    // anim昇格FX(F.anim名)。directional は rot:0(右向き)で出して矢印と比較。
    const ANIMS = ['slash', 'lightning', 'holy', 'explode', 'portal', 'water', 'water_geyser',
      'tornado', 'wind', 'foxfire', 'lampburst', 'heal', 'curse', 'levelup', 'awaken', 'ward',
      'molten_spear', 'earth_spike', 'rocks'];
    const DIR = { slash: 1, wind: 1 };   // 向きが意味を持つanim(rot:0で出す)
    // expBurst FX = 読み込まれている全て(自動)
    const BURSTS = Object.keys(F.expImg).filter(n => !n.startsWith('premium_') || opts.premium);
    const items = ANIMS.map(n => ['anim', n]).concat(BURSTS.map(n => ['burst', n]));

    const cell = opts.cell || 220, cols = opts.cols || 7, rows = Math.ceil(items.length / cols);
    const m = document.createElement('canvas'); m.width = cell * cols; m.height = cell * rows;
    const mx = m.getContext('2d');
    const orig = G.cam.onScreen; G.cam.onScreen = () => true;
    const clearFX = () => { for (const k of ['parts', 'rings', 'bolts', 'pops', 'streaks', 'sigils', 'columns', 'lights', 'anims', 'expBursts']) if (F[k]) F[k].length = 0; };
    for (let i = 0; i < items.length; i++) {
      const [type, name] = items[i];
      clearFX();
      if (type === 'anim') F.anim(0, 0, name, { scale: 1.5, dur: 0.5, add: true, rot: DIR[name] ? 0 : 0 });
      else F.burst(0, 0, name, { sz: 150, dur: 0.6, add: true });
      F.anims.forEach(a => a.t = (a.dur || 0.42) * 0.45);
      F.expBursts.forEach(b => b.t = (b.dur || 0.5) * 0.42);
      const gx = (i % cols) * cell, gy = ((i / cols) | 0) * cell;
      mx.setTransform(1, 0, 0, 1, 0, 0);
      mx.fillStyle = '#0b0e16'; mx.fillRect(gx, gy, cell, cell);
      const ay = gy + 16 + (cell - 16) / 2, ax0 = gx + cell / 2;
      mx.strokeStyle = 'rgba(90,210,120,0.45)'; mx.lineWidth = 1.5;
      mx.beginPath(); mx.moveTo(ax0, ay); mx.lineTo(ax0 + 50, ay); mx.lineTo(ax0 + 44, ay - 5); mx.moveTo(ax0 + 50, ay); mx.lineTo(ax0 + 44, ay + 5); mx.stroke();
      mx.save();
      mx.beginPath(); mx.rect(gx, gy + 16, cell, cell - 16); mx.clip();
      mx.setTransform(1, 0, 0, 1, ax0, ay);
      try { F.render(mx); } catch (e) { mx.setTransform(1, 0, 0, 1, 0, 0); mx.fillStyle = '#f55'; mx.fillText('ERR ' + e, gx + 4, gy + 40); }
      mx.restore(); mx.setTransform(1, 0, 0, 1, 0, 0);
      mx.fillStyle = '#cfe0ff'; mx.font = '12px sans-serif'; mx.fillText(name, gx + 4, gy + 12);
    }
    G.cam.onScreen = orig;
    let img = document.getElementById('__fxo');
    if (!img) { img = document.createElement('img'); img.id = '__fxo'; img.style.cssText = 'position:fixed;left:0;top:0;z-index:99999'; document.body.appendChild(img); }
    img.src = m.toDataURL(); img.width = m.width; img.height = m.height;
    return { count: items.length, anims: ANIMS.length, bursts: BURSTS.length };
  };
  // 後片付け
  window.__fxObserveClose = () => { const el = document.getElementById('__fxo'); if (el) el.remove(); };
})();
