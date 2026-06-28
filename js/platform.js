/* 百鬼夜行サバイバーズ — platform: 保存/入力/音の薄い抽象化レイヤ。
 * Web / Capacitor(Android) / Tauri(Steam) など配信ラッパーの差をここで吸収する seam。
 * 現状の主目的: localStorage が使えない環境(プライベートモード/一部 WebView)でも
 * 同一セッション中は確実に読み書きできるメモリ・フォールバックを足し、
 * 「set が静かに失敗して進捗が消える」事故を防ぐ。将来 Capacitor の native 保存もここに差せる。 */
(function () {
  const G = window.G;
  const PREFIX = 'hyakki_';
  const mem = Object.create(null);   // localStorage 不可時のセッション内フォールバック
  let backend = 'local';
  try { localStorage.setItem(PREFIX + '__t', '1'); localStorage.removeItem(PREFIX + '__t'); }
  catch (e) { backend = 'memory'; }

  const P = {
    get backend() { return backend; },
    save(key, v) {
      let s; try { s = JSON.stringify(v); } catch (e) { return; }
      mem[key] = s;                                  // 常にメモリにも保持(同一セッションは必ず読める)
      if (backend === 'local') { try { localStorage.setItem(PREFIX + key, s); } catch (e) { backend = 'memory'; } }
    },
    load(key, fallback) {
      if (backend === 'local') {
        try { const v = localStorage.getItem(PREFIX + key); if (v !== null) return JSON.parse(v); } catch (e) { }
      }
      if (key in mem) { try { return JSON.parse(mem[key]); } catch (e) { } }
      return fallback;
    },
    get isTouch() { return !!G.IS_TOUCH; },
    // モバイル/WebView は最初のユーザー操作まで AudioContext が suspended。解錠する。
    unlockAudio() {
      try { const a = G.audio; if (a && a.ctx && a.ctx.state === 'suspended') a.ctx.resume(); } catch (e) { }
    },
  };

  // 最初の入力で音を解錠(冪等・一度きり)
  const unlock = () => { P.unlockAudio(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  G.platform = P;
})();
