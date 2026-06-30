/* 百鬼夜行サバイバーズ — audio: procedural BGM + synthesized SFX (アセットゼロ)
 *
 * 音楽設計 「夜祭が壊れていく」:
 *  - A 平調子 (A B C E F) による 32 小節のテーマ曲を譜面で持つ。
 *    形式 = 主題A (問い/答え/高揚/結び 8小節) ×2 → サビB (高く泣く 8小節) → A' (大きな結び)
 *  - intensity (夜の深さ) で楽器が層になって加わり、テンポも 96→112 BPM へ加速する:
 *      宵   I<0.20 : 夜風 + 笙ドローン + 琴の独奏 (骨格のみ) + 鈴
 *      行列 I<0.45 : + 琵琶ベース + 拍子木 + 琴は全旋律
 *      囃子 I<0.65 : + 締太鼓のドンドコ + 縁打ち、サビで笛が重なる
 *      乱   I<0.85 : 笛が主旋律を歌い、大太鼓 + 裏打ち
 *      決戦 I>0.93 : 半音ドローン (E+F) の軋み + 太鼓乱打
 *  - 弦楽器 (琴/琵琶) は Karplus-Strong 物理合成を init 時に事前レンダリング。
 *  - プロシージャル IR のコンボリューションリバーブ = 夜の社の残響。
 *  - SFX は全て同じ A 平調子に乗る (魂拾いは音階を奏で、レベルアップは琴をかき鳴らす)。
 */
'use strict';

G.audio = (() => {
  const A = {
    ctx: null,
    started: false,
    muted: G.store.get('muted', false),
    volBgm: G.store.get('volBgm', 0.175),
    volSfx: G.store.get('volSfx', 0.4),
    intensity: 0.15,
  };

  let master, bgmVol, sfxVol, busSfx, busMus, busDrums, busGtrL, busGtrR, duckG, pumpG, busRev, revGain, busDelay, noiseBuf;
  const lastPlayed = {};                  // sfx throttling
  const strings = {};                     // Karplus-Strong 弦バンク (freq → AudioBuffer)
  const WT = {};                           // PeriodicWave テーブル (楽器固有の倍音スペクトル)
  const BGM_TRIM = 0.25;                    // BGM の実音量トリム (スライダー値に対して更に ×1/4。控えめな背景に)
  let ksReady = false, ksActive = 0;       // AudioWorklet 版 Karplus-Strong の準備状態/稼働ノード数

  // リアルタイム Karplus-Strong プロセッサ (音声スレッドで弦を物理合成)。
  // currentTime>=t で励起 → 自然減衰 → 無音/上限で自己終了。外部ファイル無しで Blob から読む。
  const KS_WORKLET = `
class KSProc extends AudioWorkletProcessor {
  constructor(){ super(); this.b=null; this.i=0; this.damp=0.996; this.on=false; this.sil=0; this.life=0; this.pending=null;
    this.port.onmessage=(e)=>{ this.pending=e.data; }; }
  process(ins,outs){
    const o=outs[0][0]; if(!o) return false; const n=o.length;
    if(this.pending && currentTime>=this.pending.t){ const d=this.pending; this.pending=null;
      const N=Math.max(2,Math.round(sampleRate/d.freq)); this.b=new Float32Array(N); let lp=0; const br=d.br;
      for(let k=0;k<N;k++){ const w=Math.random()*2-1; lp=br*w+(1-br)*lp; this.b[k]=lp*d.vel; }
      this.i=0; this.damp=d.damp; this.on=true; this.sil=0; this.life=0; }
    if(!this.on||!this.b){ for(let k=0;k<n;k++)o[k]=0; return true; }
    const N=this.b.length; let pk=0;
    for(let k=0;k<n;k++){ const cur=this.b[this.i]; const nx=this.b[(this.i+1)%N];
      this.b[this.i]=this.damp*0.5*(cur+nx); o[k]=cur; this.i=(this.i+1)%N; const a=cur<0?-cur:cur; if(a>pk)pk=a; }
    this.life+=n;
    if(pk<0.0003){ if(++this.sil>6){ this.on=false; return false; } } else this.sil=0;
    if(this.life>sampleRate*4){ this.on=false; return false; }
    return true;
  }
}
registerProcessor('ks-proc', KSProc);
`;

  // ---------------- 音階 / 調性 (全 SFX と BGM が共有する) ----------------
  const SCALE = [220.0, 246.94, 261.63, 329.63, 349.23];   // A3 B3 C4 E4 F4 (A 平調子)
  const deg = (d, oct = 1) => SCALE[d] * oct;

  // ---------------- bootstrap (ユーザー操作から呼ぶこと) ----------------
  A.init = () => {
    if (A.ctx) return;
    // 既定音量の段階的引き下げ。保存済の値を持つ環境も一度だけ新既定へ移行する
    const cal = G.store.get('audioCalib', 0);
    if (cal < 1) { A.volSfx = 0.4; G.store.set('volSfx', 0.4); }        // SFX を一度だけ既定へ
    if (cal < 2) { A.volBgm = 0.175; G.store.set('volBgm', 0.175); G.store.set('audioCalib', 2); }  // BGM を更に半分へ
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    A.ctx = new Ctx();
    const sr = A.ctx.sampleRate;

    const C = A.ctx;

    // ===== 共有マスター出力: mute → tilt EQ → 安全リミッタ(≦0.78は素通り) → out =====
    // 音圧用のコンプ/飽和は各バスのフェーダー「前」に置く。こうすると音量つまみが
    // ダイナミクスに飲み込まれず素直に効く (= 以前は飲まれて効かなかった)。
    const limiter = makeShaper(limiterCurve(), '4x');        // 真鍮の天井 (ハードクリップ回避)
    limiter.connect(C.destination);
    const tiltHi = C.createBiquadFilter();                   // 上を開ける (抜け)
    tiltHi.type = 'highshelf'; tiltHi.frequency.value = 3400; tiltHi.gain.value = 2.6;
    tiltHi.connect(limiter);
    const tiltLo = C.createBiquadFilter();                   // 下を据える (土台)
    tiltLo.type = 'lowshelf'; tiltLo.frequency.value = 160; tiltLo.gain.value = 3.2;
    tiltLo.connect(tiltHi);
    master = C.createGain();                                 // mute スイッチ (0/1)
    master.gain.value = A.muted ? 0 : 1;
    master.connect(tiltLo);

    // ===== ユーザー音量フェーダー (ダイナミクスの後段なので確実に効く) =====
    bgmVol = C.createGain(); bgmVol.gain.value = A.volBgm * BGM_TRIM; bgmVol.connect(master);
    sfxVol = C.createGain(); sfxVol.gain.value = A.volSfx; sfxVol.connect(master);

    // ===== 残響 (ステレオ IR) =====
    busRev = C.createConvolver();
    busRev.buffer = makeIR(sr, 2.8);
    revGain = C.createGain(); revGain.gain.value = 0.9;
    busRev.connect(revGain); revGain.connect(master);

    // ===== テンポ同期ピンポンディレイ (左右に跳ねる残響) =====
    busDelay = C.createGain(); busDelay.gain.value = 1;
    const dL = C.createDelay(1.0), dR = C.createDelay(1.0);
    const dt = 0.321;                                        // ≒ 付点8分 @ 140BPM
    dL.delayTime.value = dt; dR.delayTime.value = dt;
    const fb = C.createGain(); fb.gain.value = 0.35;
    const damp = C.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 2600;
    const dpL = C.createStereoPanner(); dpL.pan.value = -0.85;
    const dpR = C.createStereoPanner(); dpR.pan.value = 0.85;
    const dWet = C.createGain(); dWet.gain.value = 0.5;
    busDelay.connect(dL);
    dL.connect(dpL); dpL.connect(dWet);
    dL.connect(dR);
    dR.connect(dpR); dpR.connect(dWet);
    dR.connect(damp); damp.connect(fb); fb.connect(dL);     // クロスフィードバック
    dWet.connect(master);

    // ===== 音楽バス: voices → pump → duck → 飽和 → グルー → BGM音量 → master =====
    const musSat = makeShaper(satCurve(1.6), '2x');          // 真空管的な温かみ・倍音
    const musGlue = C.createDynamicsCompressor();            // バス・グルー (まとめる)
    musGlue.threshold.value = -17; musGlue.knee.value = 10; musGlue.ratio.value = 2.6;
    musGlue.attack.value = 0.012; musGlue.release.value = 0.18;
    duckG = C.createGain(); duckG.gain.value = 1;
    pumpG = C.createGain(); pumpG.gain.value = 1;            // キックで沈む (サイドチェイン)
    busMus = C.createGain(); busMus.gain.value = 1;          // 全メロディ楽器の集約点
    busMus.connect(pumpG); pumpG.connect(duckG); duckG.connect(musSat);
    musSat.connect(musGlue);
    const musMakeup = C.createGain(); musMakeup.gain.value = 2.1;   // 音色刷新(テーブル/KS)で下がった分の戻し
    const musEQ = C.createBiquadFilter();                           // 中低域の濁り(箱鳴り)を削り各音を立てる
    musEQ.type = 'peaking'; musEQ.frequency.value = 340; musEQ.Q.value = 0.9; musEQ.gain.value = -2.5;
    musGlue.connect(musMakeup); musMakeup.connect(musEQ); musEQ.connect(bgmVol);
    busDrums = C.createGain(); busDrums.gain.value = 1;      // ドラムはポンプを通さず BGM音量へ
    busDrums.connect(bgmVol);

    // エレキギター・アンプ (ダブルトラッキング): 左右で独立した歪み段を持ち、
    // テイクごとに違うデチューンで弾く = 本物のリズムギター録りのように左右へ広がる
    const makeAmp = (pan, lvl) => {
      const inp = C.createGain();
      const pre = C.createGain(); pre.gain.value = 7;          // 突っ込んで歪ませる
      const dist = makeShaper(satCurve(3.2), '4x');            // ハードめの歪み
      const cabLo = C.createBiquadFilter(); cabLo.type = 'highpass'; cabLo.frequency.value = 110;
      const cabHi = C.createBiquadFilter(); cabHi.type = 'lowpass'; cabHi.frequency.value = 3600; cabHi.Q.value = 0.9;
      const pres = C.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 2200; pres.Q.value = 1.2; pres.gain.value = 4;
      const lvlG = C.createGain(); lvlG.gain.value = lvl;
      const p = C.createStereoPanner(); p.pan.value = pan;     // ハードパンで左右へ
      inp.connect(pre); pre.connect(dist); dist.connect(cabLo);
      cabLo.connect(cabHi); cabHi.connect(pres); pres.connect(lvlG); lvlG.connect(p); p.connect(busMus);
      return inp;
    };
    busGtrL = makeAmp(-0.72, 0.3);
    busGtrR = makeAmp(0.72, 0.3);

    // 送りはフェーダー「後」をタップ = 音量を下げれば残響/ディレイも一緒に下がる
    const mkSend = (src, amt, dest) => { const g = C.createGain(); g.gain.value = amt; src.connect(g); g.connect(dest); };
    mkSend(bgmVol, 0.24, busRev); mkSend(bgmVol, 0.15, busDelay);

    busSfx = C.createGain(); busSfx.gain.value = 1; busSfx.connect(sfxVol);   // SFXは自分をダックしない
    mkSend(sfxVol, 0.14, busRev); mkSend(sfxVol, 0.06, busDelay);

    // 共有ノイズバッファ (2s)
    const nlen = sr * 2;
    noiseBuf = C.createBuffer(1, nlen, sr);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;

    // Karplus-Strong 弦バンク: 高密度サンプリング (再生レート伸縮を小さく保ち音色を守る)
    for (const o of [0.5, 1, 2, 4]) for (const f of SCALE) makeString(f * o, 1.3, 0.55);
    for (const f of [82.41, 87.31, 110.0, 123.47, 130.81, 164.81]) makeString(f, 1.9, 0.8);

    // 楽器固有の倍音スペクトル (素の sine/saw を脱して"楽器の音"へ)
    WT.flute = mkWave([1.0, 0.42, 0.34, 0.12, 0.07, 0.04, 0.02]);          // 尺八: 中空で息っぽい (3倍音が要)
    WT.sho = mkWave([1.0, 0.82, 0.62, 0.52, 0.42, 0.34, 0.27, 0.21, 0.16, 0.12, 0.09]); // 笙: リードの厚い唸り
    WT.bass = mkWave([1.0, 0.6, 0.42, 0.32, 0.24, 0.18, 0.13, 0.1, 0.07]); // 琵琶低音: 太く倍音豊か

    // AudioWorklet 版 KS を非同期ロード (失敗時は事前レンダKSにフォールバック)
    if (A.ctx.audioWorklet) {
      try {
        const url = URL.createObjectURL(new Blob([KS_WORKLET], { type: 'application/javascript' }));
        A.ctx.audioWorklet.addModule(url)
          .then(() => { ksReady = true; URL.revokeObjectURL(url); })
          .catch(() => { ksReady = false; });
      } catch (e) { ksReady = false; }
    }

    startWind();
    startSequencer();
    A.started = true;
  };

  // Karplus-Strong: ノイズバーストを遅延線+減衰平均で循環させた弦振動を事前レンダリング
  function makeString(freq, dur, bright) {
    const sr = A.ctx.sampleRate;
    const N = Math.round(sr / freq);
    const len = Math.floor(sr * dur);
    const buf = A.ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < N; i++) {                            // 爪弾きの励起 (brightで硬さ)
      const w = Math.random() * 2 - 1;
      lp = bright * w + (1 - bright) * lp;
      d[i] = lp;
    }
    const damp = 0.9965 - 40 / (freq * freq);                // 低い弦ほど長く鳴る
    for (let i = N + 1; i < len; i++) d[i] = damp * 0.5 * (d[i - N] + d[i - N - 1]);
    strings[Math.round(freq)] = buf;
    return buf;
  }

  // ---------------- DSP ヘルパ (マスター / 空間 / ステレオ) ----------------
  function makeShaper(curve, oversample) {
    const ws = A.ctx.createWaveShaper();
    ws.curve = curve;
    ws.oversample = oversample || 'none';
    return ws;
  }
  // 倍音振幅の配列から PeriodicWave を生成 (partials[0]=基音)。WebAudio が自動でバンドリミット
  function mkWave(partials) {
    const n = partials.length + 1;
    const real = new Float32Array(n), imag = new Float32Array(n);
    for (let i = 0; i < partials.length; i++) imag[i + 1] = partials[i];
    return A.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  }
  // tanh ソフト飽和: 小音量はほぼ素通り、大音量を丸めて倍音と温かみを足す
  function satCurve(amount) {
    const n = 2048, c = new Float32Array(n), k = Math.tanh(amount);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(amount * x) / k; }
    return c;
  }
  // ソフトリミッタ: ±0.78 までほぼ線形、その先を圧縮して ±1 を越えさせない
  function limiterCurve() {
    const n = 2048, c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
      const y = a <= 0.78 ? a : 0.78 + (1 - 0.78) * Math.tanh((a - 0.78) / (1 - 0.78));
      c[i] = Math.sign(x) * y;
    }
    return c;
  }
  // ステレオ残響 IR: L/R 独立ノイズで脱相関 (広がり) + 初期反射タップ + 拡散尾
  function makeIR(sr, dur) {
    const len = Math.floor(sr * dur);
    const ir = A.ctx.createBuffer(2, len, sr);
    const tapsL = [[0.011, 0.5], [0.023, 0.38], [0.037, 0.3], [0.053, 0.22], [0.071, 0.16]];
    const tapsR = [[0.013, 0.48], [0.027, 0.36], [0.041, 0.28], [0.059, 0.2], [0.079, 0.15]];
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        const a = 0.4 + 0.56 * (i / len);                    // 後半ほど高域が速く減衰 = 自然な残響の暗転
        lp = lp * a + w * (1 - a);
        d[i] = lp * Math.pow(1 - i / len, 2.0);
      }
      for (const [tt, g] of (ch ? tapsR : tapsL)) {           // 初期反射 (社の柱の反響)
        const idx = Math.floor(tt * sr);
        if (idx < len) d[idx] += g * (0.8 + Math.random() * 0.4);
      }
      const fade = Math.floor(sr * 0.005);
      for (let i = 0; i < fade; i++) d[i] *= i / fade;
    }
    return ir;
  }
  // 任意の dest にパンを挟む (pan=0 はそのまま)。各ボイスの定位に使う
  function chan(dest, pan) {
    const d = dest || busMus;
    if (!pan) return d;
    const p = A.ctx.createStereoPanner();
    p.pan.value = G.clamp(pan, -1, 1);
    p.connect(d);
    return p;
  }
  // サイドチェイン・ポンプ: キックの瞬間に音楽バスを沈め、拍ごとに息づかせる
  function pump(t, depth = 0.6) {
    if (!pumpG) return;
    pumpG.gain.cancelScheduledValues(t);
    pumpG.gain.setValueAtTime(depth, t);
    pumpG.gain.linearRampToValueAtTime(1, t + 0.17);
  }

  // 弦を鳴らす。bank に無い音高は最近接バッファの再生レートで合わせる
  function strike(freq, t, vel, dest, opts = {}) {
    let bestK = 0, bestDiff = 1e9;
    for (const k in strings) {
      const diff = Math.abs(k - freq);
      if (diff < bestDiff) { bestDiff = diff; bestK = +k; }
    }
    const src = A.ctx.createBufferSource();
    src.buffer = strings[bestK];
    src.playbackRate.setValueAtTime(freq / bestK, t);
    if (opts.bendTo) src.playbackRate.exponentialRampToValueAtTime((freq * opts.bendTo) / bestK, t + (opts.bendT || 0.3));
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (opts.dur || src.buffer.duration));
    src.connect(g);
    const out = chan(dest, opts.pan);
    let tail = g;
    if (opts.lpf) {                                          // 高次倍音は速く減衰=自然な余韻 / 強さで明るさ
      const lp = A.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.Q.value = 0.6;
      const bright = G.clamp(freq * 4 + vel * 16000, 1200, 15000);
      lp.frequency.setValueAtTime(bright, t);
      lp.frequency.exponentialRampToValueAtTime(Math.max(700, bright * 0.38), t + (opts.dur || 0.6) * 0.85);
      g.connect(lp); tail = lp;
    }
    if (opts.body) {                                          // 琴の胴鳴り (低中域の共鳴で艶)
      const bp = A.ctx.createBiquadFilter();
      bp.type = 'peaking'; bp.frequency.value = 360; bp.Q.value = 1.1; bp.gain.value = 6;
      tail.connect(bp); bp.connect(out);
    } else {
      tail.connect(out);
    }
    if (opts.pluck) {                                         // 爪のアタック (立ち上がりの定義)
      const gc = env(t, vel * 0.5, 0.0008, 0.02);
      noise(t, 0.02, gc, out, 'highpass', 4000);
    }
    src.start(t);
    src.stop(t + (opts.dur || src.buffer.duration) + 0.05);
  }

  // リアルタイム KS で弦を弾く (全音程で正しい音色)。未対応/過負荷時は事前レンダ strike にフォールバック
  function ksStrike(freq, t, vel, dest, opts = {}) {
    if (!ksReady || ksActive > 24) { strike(freq, t, vel, dest, opts); return; }
    let node;
    try { node = new AudioWorkletNode(A.ctx, 'ks-proc', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] }); }
    catch (e) { strike(freq, t, vel, dest, opts); return; }
    ksActive++;
    const damp = G.clamp(0.9995 - 10 / (freq * freq), 0.99, 0.9997);   // 低い弦ほど長く鳴る (全体に余韻長め)
    const br = G.clamp(0.4 + vel * 3, 0.3, 0.85);                       // 強く弾くほど明るい励起
    node.port.postMessage({ t, freq, vel: Math.min(1, vel * 1.7), damp, br });
    const out = chan(dest, opts.pan);
    let tail = node;
    if (opts.lpf !== false) {                                          // 高次倍音は速く減衰 = 自然な余韻
      const lp = A.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.Q.value = 0.6;
      const bright = G.clamp(freq * 4 + vel * 16000, 1200, 15000);
      lp.frequency.setValueAtTime(bright, t);
      lp.frequency.exponentialRampToValueAtTime(Math.max(700, bright * 0.4), t + (opts.dur || 0.6) * 0.85);
      node.connect(lp); tail = lp;
    }
    if (opts.body) {                                                   // 琴の胴鳴り
      const bp = A.ctx.createBiquadFilter();
      bp.type = 'peaking'; bp.frequency.value = 360; bp.Q.value = 1.1; bp.gain.value = 6;
      tail.connect(bp); tail = bp;
    }
    const g = A.ctx.createGain(); g.gain.setValueAtTime(1, t);
    if (opts.dur) { g.gain.setValueAtTime(1, t + opts.dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur); }
    tail.connect(g); g.connect(out);
    if (opts.pluck) { const gc = env(t, vel * 0.5, 0.0008, 0.02); noise(t, 0.02, gc, out, 'highpass', 4000); }
    const ttl = ((opts.dur || 1.2) + Math.max(0, t - A.ctx.currentTime) + 1.3) * 1000;
    setTimeout(() => { try { node.disconnect(); } catch (e) {} ksActive--; }, ttl);
  }

  A.resume = () => { if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume(); };
  A.suspend = () => { if (A.ctx && A.ctx.state === 'running') A.ctx.suspend(); };

  A.toggleMute = () => {
    A.muted = !A.muted;
    G.store.set('muted', A.muted);
    if (master) master.gain.value = A.muted ? 0 : 1;
    return A.muted;
  };
  A.setVol = (kind, v) => {
    if (kind === 'bgm') { A.volBgm = v; if (bgmVol) bgmVol.gain.value = v * BGM_TRIM; G.store.set('volBgm', v); }
    else { A.volSfx = v; if (sfxVol) sfxVol.gain.value = v; G.store.set('volSfx', v); }
  };
  A.setIntensity = v => { A.intensity = G.clamp(v, 0, 1); };

  // ---------------- voice helpers ----------------
  const now = () => A.ctx.currentTime;

  function env(t0, peak, attack, decay, curveTo = 0.0001) {
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
    g.gain.exponentialRampToValueAtTime(curveTo, t0 + attack + decay);
    return g;
  }

  function osc(type, freq, t0, dur, gainNode, dest) {
    const o = A.ctx.createOscillator();
    if (type && typeof type === 'object') o.setPeriodicWave(type);   // PeriodicWave (楽器テーブル)
    else o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    o.connect(gainNode);
    gainNode.connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
    return o;
  }

  function noise(t0, dur, gainNode, dest, filterType, filterFreq, q = 1) {
    const src = A.ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.playbackRate.value = G.rand(0.85, 1.15);
    let node = src;
    if (filterType) {
      const f = A.ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.setValueAtTime(filterFreq, t0);
      f.Q.value = q;
      src.connect(f);
      node = f;
    }
    node.connect(gainNode);
    gainNode.connect(dest);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
    return { src, filter: node !== src ? node : null };
  }

  // 梵鐘/お寺の鐘: 非整数次倍音の積み (base に対する実鐘の部分音比)
  function bell(t, base, vel, dest, ratios) {
    (ratios || [[1.0, 2.6, 1.0], [2.0, 1.9, 0.55], [2.4, 1.5, 0.34], [3.01, 1.1, 0.2], [4.2, 0.7, 0.12], [5.4, 0.45, 0.07]])
      .forEach(([r, dur, v]) => {
        const g = env(t, vel * v, 0.004, dur);
        const o = osc('sine', base * r, t, dur + 0.1, g, dest);
        o.detune.setValueAtTime(G.rand(-4, 4), t);
      });
    const g2 = env(t, vel * 0.5, 0.001, 0.05);
    noise(t, 0.07, g2, dest, 'lowpass', 3000);
    // FM の金属的な煌めき (非整数比の変調 = 鐘の冴えた当たり)
    const car = A.ctx.createOscillator(); car.frequency.value = base * 3.86;
    const mod = A.ctx.createOscillator(); mod.frequency.value = base * 5.43;
    const mg = A.ctx.createGain();
    mg.gain.setValueAtTime(base * 6, t);
    mg.gain.exponentialRampToValueAtTime(base * 0.5, t + 0.4);
    mod.connect(mg); mg.connect(car.frequency);
    const fg = env(t, vel * 0.3, 0.002, 0.5);
    car.connect(fg); fg.connect(dest);
    car.start(t); car.stop(t + 0.6); mod.start(t); mod.stop(t + 0.6);
  }

  // 大音 SFX の瞬間だけ BGM を沈める (サイドチェイン風)
  function duck(amount, hold) {
    if (!duckG) return;
    const t = now();
    duckG.gain.cancelScheduledValues(t);
    duckG.gain.setValueAtTime(duckG.gain.value, t);
    duckG.gain.linearRampToValueAtTime(amount, t + 0.03);
    duckG.gain.linearRampToValueAtTime(1, t + 0.03 + hold);
  }

  // 重い芯: ピッチ落ちのサブ正弦 (+任意で飽和グリット) = 打撃/ボスの"重厚感"
  function thud(t, dest, f0, f1, peak, dur, sat) {
    const g = env(t, peak, 0.003, dur);
    const o = A.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur * 0.8);
    if (sat) { const ws = makeShaper(satCurve(2.4), '2x'); o.connect(ws); ws.connect(g); }  // 倍音で太く
    else o.connect(g);
    g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // ---------------- SFX (全て A 平調子に乗せる) ----------------
  const SFX = {
    shoot(o) {
      const t = now(), d = chan(busSfx, G.rand(-0.28, 0.28));
      const gc = env(t, 0.07, 0.0005, 0.014); noise(t, 0.018, gc, d, 'bandpass', 4400, 1.0);  // 鋭い当たり(snap)
      const g = env(t, 0.085, 0.0015, 0.08);
      osc('triangle', 1240 * (o.p || 1), t, 0.1, g, d).frequency.exponentialRampToValueAtTime(470, t + 0.075);
      const g3 = env(t, 0.05, 0.0008, 0.035);
      osc('sine', 340, t, 0.05, g3, d).frequency.exponentialRampToValueAtTime(118, t + 0.04);  // 撃ち出しの低い芯
    },
    slash() {
      const t = now(), d = chan(busSfx, G.rand(-0.3, 0.3));
      const g = env(t, 0.17, 0.004, 0.14);                    // 抜ける刃の風切り(本体)
      const n = noise(t, 0.18, g, d, 'bandpass', 3000, 1.0);
      n.filter.frequency.exponentialRampToValueAtTime(360, t + 0.13);
      const gw = env(t, 0.085, 0.005, 0.1);                   // 低い空気の唸り(重み)
      const nw = noise(t, 0.12, gw, d, 'lowpass', 520, 0.8); nw.filter.frequency.exponentialRampToValueAtTime(150, t + 0.1);
      const g2 = env(t, 0.04, 0.002, 0.07); osc('sine', 3400, t, 0.08, g2, d);   // 刃鳴り
      const g3 = env(t, 0.026, 0.002, 0.05); osc('sine', 5100, t, 0.06, g3, d);
      const g4 = env(t, 0.08, 0.0006, 0.02); noise(t, 0.025, g4, d, 'highpass', 6800);  // エッジの冴え(鋭い当たり)
    },
    wind() {
      const t = now(), g = env(t, 0.06, 0.012, 0.15);
      const n = noise(t, 0.2, g, busSfx, 'bandpass', 1900, 2.2);
      n.filter.frequency.exponentialRampToValueAtTime(700, t + 0.16);
    },
    hit(o) {
      const t = now(), d = chan(busSfx, G.rand(-0.18, 0.18));
      const gc = env(t, 0.12, 0.0006, 0.02); noise(t, 0.025, gc, d, 'bandpass', 3200, 0.9);   // 鋭い当たりの皮(存在感)
      const g = env(t, 0.14, 0.001, 0.06);                    // 中域の芯 (ピッチ落ちで打撃感)
      osc('square', G.rand(160, 205) * (o.p || 1), t, 0.07, g, d).frequency.exponentialRampToValueAtTime(86 * (o.p || 1), t + 0.055);
      thud(t, d, 175, 52, 0.14, 0.09, true);                  // 低い当たり (飽和で太い重み)
      const g2 = env(t, 0.075, 0.001, 0.045); noise(t, 0.05, g2, d, 'lowpass', 950);  // 鈍い肉の音
    },
    kill() {
      const t = now(), d = chan(busSfx, G.rand(-0.12, 0.12));
      const gc = env(t, 0.1, 0.0006, 0.02); noise(t, 0.025, gc, d, 'bandpass', 3600, 1.0);   // 砕けの鋭い皮
      thud(t, d, 300, 42, 0.21, 0.18, true);                  // 飽和した重い崩れ (芯・強化)
      const g1 = env(t, 0.1, 0.001, 0.06);
      osc('triangle', 175, t, 0.07, g1, d).frequency.exponentialRampToValueAtTime(58, t + 0.055);  // 潰れる胴
      const g2 = env(t, 0.09, 0.002, 0.1); noise(t, 0.12, g2, d, 'lowpass', 950);
      const g3 = env(t, 0.05, 0.001, 0.05); noise(t, 0.06, g3, d, 'bandpass', 1800, 1.2);  // 砕けのざらつき (中域)
    },
    gem(o) {
      // 連取で少しずつ上がる中立的なブリップ (音階に縛らない = BGM の和声と衝突しない)
      const t = now(), s = Math.min(o.s || 0, 24), d = chan(busSfx, G.rand(-0.18, 0.18));
      const f = 600 + s * 32;
      const g = env(t, 0.06, 0.002, 0.09);
      osc('triangle', f, t, 0.1, g, d).frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.07);
      const g2 = env(t, 0.022, 0.001, 0.03);
      noise(t, 0.03, g2, d, 'highpass', 5200);
    },
    heal() {
      const t = now();
      strike(deg(0, 2), t, 0.11, busSfx, { dur: 0.7 });
      strike(deg(3, 2), t + 0.07, 0.09, busSfx, { dur: 0.7 });
      const g = env(t, 0.02, 0.05, 0.3);
      noise(t, 0.4, g, busSfx, 'bandpass', 1760, 3);
    },
    magnet() {
      const t = now(), g = env(t, 0.06, 0.02, 0.3);
      const v = osc('sine', 220, t, 0.35, g, busSfx);
      v.frequency.exponentialRampToValueAtTime(1318.5, t + 0.3);
      const g2 = env(t + 0.22, 0.03, 0.01, 0.12);
      osc('sine', 2637, t + 0.22, 0.15, g2, busSfx);
    },
    bomb() {
      const t = now();
      duck(0.5, 0.5);
      const g = env(t, 0.32, 0.004, 0.5);
      const n = noise(t, 0.55, g, busSfx, 'lowpass', 2400, 0.6);
      n.filter.frequency.exponentialRampToValueAtTime(85, t + 0.5);
      thud(t, busSfx, 150, 28, 0.3, 0.5, true);               // 飽和した深い炸裂の芯
      const g3 = env(t + 0.03, 0.1, 0.02, 0.45);
      noise(t + 0.03, 0.5, g3, busSfx, 'lowpass', 160);       // 轟きの尾
    },
    levelup() {
      // 琴のかき鳴らし (A C E A) + 鈴のきらめき — 力を得る音
      const t = now();
      [deg(0, 1), deg(2, 1), deg(3, 1), deg(0, 2)].forEach((f, i) => strike(f, t + i * 0.045, 0.16, busSfx, { dur: 0.9 }));
      [4186, 5274, 6644].forEach((f, i) => {
        const g = env(t + 0.16 + i * 0.05, 0.022, 0.005, 0.3);
        osc('sine', f, t + 0.16 + i * 0.05, 0.35, g, busSfx);
      });
    },
    awaken() {
      // 覚醒: 鐘 + 琴の上昇 + 笛の長音 — ランで最も神聖な瞬間
      const t = now();
      duck(0.45, 0.9);
      bell(t, 110, 0.16, busSfx);
      [deg(3, 1), deg(0, 2), deg(2, 2), deg(3, 2), deg(0, 4)].forEach((f, i) => strike(f, t + 0.1 + i * 0.07, 0.13, busSfx, { dur: 0.8 }));
      const g = env(t + 0.3, 0.05, 0.25, 1.0);
      const o = osc('sine', deg(0, 4), t + 0.3, 1.3, g, busSfx);
      const lfo = A.ctx.createOscillator(), lg = A.ctx.createGain();
      lfo.frequency.value = 5.5; lg.gain.value = 9;
      lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(t + 0.55); lfo.stop(t + 1.6);
      const g2 = env(t, 0.06, 0.02, 0.8);
      noise(t, 0.9, g2, busSfx, 'highpass', 6000);
    },
    hurt() {
      // 被弾: 重い太鼓の胴 + E/F 半音の軋み (痛みにも調性を)
      const t = now(), d = chan(busSfx, G.rand(-0.1, 0.1));
      thud(t, d, 200, 46, 0.24, 0.18, true);                  // 重い被弾の芯 (飽和)
      const g2 = env(t, 0.1, 0.002, 0.07);
      noise(t, 0.1, g2, d, 'lowpass', 1000);
      [329.63, 349.23].forEach(f => {
        const g3 = env(t, 0.03, 0.002, 0.09);
        osc('sawtooth', f, t, 0.1, g3, d);
      });
    },
    bolt() {
      const t = now();
      duck(0.5, 0.3);
      const g = env(t, 0.22, 0.001, 0.16); noise(t, 0.2, g, busSfx, 'highpass', 1400);  // 雷の割れ
      thud(t, busSfx, 150, 36, 0.22, 0.18, true);             // 直撃の重い芯 (飽和)
      const g3 = env(t + 0.04, 0.11, 0.02, 0.5);
      noise(t + 0.04, 0.6, g3, busSfx, 'lowpass', 200);       // 轟く尾
    },
    bossroar() {
      const t = now();
      duck(0.42, 1.0);
      const ws = makeShaper(satCurve(2.6), '2x');             // 喉の歪み (太く濁った咆哮)
      const g = env(t, 0.26, 0.05, 1.1);
      const v = A.ctx.createOscillator(); v.type = 'sawtooth';
      v.frequency.setValueAtTime(82, t); v.frequency.exponentialRampToValueAtTime(30, t + 1.0);
      v.connect(ws); ws.connect(g); g.connect(busSfx);
      v.start(t); v.stop(t + 1.15);
      const am = A.ctx.createOscillator(), ag = A.ctx.createGain();   // 喉のうなり (AM)
      am.frequency.value = 24; ag.gain.value = 0.12;
      am.connect(ag); ag.connect(g.gain);
      am.start(t); am.stop(t + 1.15);
      thud(t, busSfx, 70, 26, 0.22, 1.1, false);             // 地を這う重低音
      const g2 = env(t, 0.14, 0.05, 0.85);
      noise(t, 0.95, g2, busSfx, 'lowpass', 420, 2);          // 唸りの空気
    },
    bossdie() {
      const t = now();
      duck(0.4, 1.2);
      const g = env(t, 0.3, 0.005, 0.8);
      const n = noise(t, 0.9, g, busSfx, 'lowpass', 1800, 0.5);
      n.filter.frequency.exponentialRampToValueAtTime(55, t + 0.8);
      thud(t, busSfx, 160, 26, 0.26, 0.9, true);              // 崩れ落ちる重い芯 (飽和)
      [deg(0, 1), deg(4, 0.5), deg(2, 0.5)].forEach((f, i) => strike(f, t + 0.15 + i * 0.16, 0.16, busSfx, { bendTo: 0.94, bendT: 0.5, dur: 1.1 }));
      bell(t + 0.6, 92, 0.12, busSfx);
    },
    select() {
      const t = now();
      strike(deg(3, 2), t, 0.07, busSfx, { dur: 0.25 });
    },
    gong() {
      const t = now();
      bell(t, 92, 0.24, busSfx, [[1.0, 2.8, 1.0], [2.0, 2.0, 0.5], [2.4, 1.6, 0.32], [3.0, 1.2, 0.18], [4.2, 0.8, 0.1], [5.4, 0.5, 0.06]]);
    },
    crit() {
      // 金属的な"シャキン": 非整数比の高い当たり + ノイズの抜け (音階に乗らない = 衝突しない)
      const t = now(), d = chan(busSfx, G.rand(-0.2, 0.2));
      const g = env(t, 0.075, 0.001, 0.05);
      osc('square', 2400, t, 0.07, g, d).frequency.exponentialRampToValueAtTime(5200, t + 0.05);
      const g2 = env(t, 0.05, 0.0008, 0.02); noise(t, 0.03, g2, d, 'highpass', 6500);
      const g3 = env(t, 0.03, 0.001, 0.04);
      const o3 = osc('triangle', 3700, t, 0.05, g3, d); o3.detune.value = 41;        // 非整数 = 金属感
    },
    combo(o) {
      // 拍子木カチ + 段位で上がる中立クリック (音階に縛らない)
      const t = now(), tier = Math.min(o.tier || 1, 12), d = chan(busSfx, G.rand(-0.15, 0.15));
      const g = env(t, 0.05, 0.001, 0.03);
      noise(t, 0.04, g, d, 'bandpass', 2900, 5);
      const f = 500 + tier * 52;
      const g2 = env(t + 0.02, 0.05, 0.001, 0.05);
      osc('triangle', f, t + 0.02, 0.06, g2, d).frequency.exponentialRampToValueAtTime(f * 1.4, t + 0.06);
    },
    heart() {
      const t = now();
      [[0, 0.15], [0.17, 0.09]].forEach(([dt, g0]) => {
        const g = env(t + dt, g0, 0.004, 0.13);
        const v = osc('sine', 64, t + dt, 0.15, g, busSfx);
        v.frequency.exponentialRampToValueAtTime(38, t + dt + 0.13);
      });
    },
    arrow() {
      const t = now(), d = chan(busSfx, G.rand(-0.25, 0.25));
      const g = env(t, 0.08, 0.003, 0.1);
      osc('triangle', 1850, t, 0.12, g, d).frequency.exponentialRampToValueAtTime(430, t + 0.11);
      const g2 = env(t, 0.055, 0.002, 0.07); noise(t, 0.08, g2, d, 'highpass', 3000);
      const g3 = env(t, 0.03, 0.001, 0.03); noise(t, 0.04, g3, d, 'bandpass', 5000, 3);  // 矢羽の風切り
    },
    dash() {
      const t = now(), d = chan(busSfx, G.rand(-0.2, 0.2));
      const g = env(t, 0.14, 0.006, 0.16);                    // 風切り(本体)
      const n = noise(t, 0.22, g, d, 'bandpass', 820, 1.0);
      n.filter.frequency.exponentialRampToValueAtTime(200, t + 0.2);
      thud(t, d, 185, 60, 0.1, 0.12, true);                   // 踏み込みの低い芯(飽和で太い)
      const g3 = env(t, 0.06, 0.0008, 0.04); noise(t, 0.05, g3, d, 'highpass', 5000);  // 抜けの皮
    },
    powerup() {
      const t = now(), g = env(t, 0.09, 0.02, 0.4);
      const v = osc('sawtooth', 220, t, 0.45, g, busSfx);
      v.frequency.exponentialRampToValueAtTime(880, t + 0.36);
      [deg(0, 4), deg(3, 4), deg(0, 8)].forEach((f, i) => {
        const g2 = env(t + 0.16 + i * 0.06, 0.05, 0.008, 0.22);
        osc('triangle', f, t + 0.16 + i * 0.06, 0.27, g2, busSfx);
      });
    },
    deny() {
      // 木の「コッ」+ 沈んだ F (調内で一番暗い音)
      const t = now(), g = env(t, 0.07, 0.001, 0.04);
      noise(t, 0.05, g, busSfx, 'bandpass', 1300, 4);
      const g2 = env(t, 0.06, 0.003, 0.09);
      osc('square', 349.23, t, 0.1, g2, busSfx);
    },
    tick() {
      const t = now(), g = env(t, 0.05, 0.001, 0.028);
      noise(t, 0.04, g, busSfx, 'bandpass', 3100, 5);
    },
    bang() {
      // 種子島: 高い炸裂 + 中域の銃身 + 低い反動 + 残響の轟き
      const t = now(), d = chan(busSfx, G.rand(-0.12, 0.12));
      duck(0.6, 0.18);                                        // 一瞬 BGM を沈めて轟音を立てる
      const g = env(t, 0.3, 0.0006, 0.05); noise(t, 0.06, g, d, 'highpass', 4200);   // 炸裂
      const g2 = env(t, 0.26, 0.002, 0.18);
      const n = noise(t, 0.22, g2, d, 'bandpass', 1200, 0.8);
      n.filter.frequency.exponentialRampToValueAtTime(220, t + 0.16);
      const g3 = env(t, 0.22, 0.002, 0.14);
      osc('sine', 120, t, 0.16, g3, d).frequency.exponentialRampToValueAtTime(40, t + 0.13);  // 反動
      const g4 = env(t, 0.08, 0.004, 0.3); noise(t, 0.34, g4, d, 'lowpass', 300);     // 轟きの尾
    },
    coin() {
      // 明るい"チャリン" (中立的な金属音、和声に乗らない)
      const t = now(), d = chan(busSfx, G.rand(-0.15, 0.15));
      const g = env(t, 0.05, 0.001, 0.04); noise(t, 0.04, g, d, 'bandpass', 5200, 6);
      const g2 = env(t + 0.04, 0.05, 0.001, 0.1);
      osc('triangle', 2100, t + 0.04, 0.13, g2, d).frequency.exponentialRampToValueAtTime(3000, t + 0.11);
      const g3 = env(t, 0.025, 0.0006, 0.02); noise(t, 0.02, g3, d, 'highpass', 7000);
    },
    reveal() {
      const t = now();
      strike(deg(3, 2), t, 0.09, busSfx, { dur: 0.4 });
      strike(deg(1, 4), t + 0.05, 0.07, busSfx, { dur: 0.4 });
    },
    lampignite() {
      const t = now();
      [deg(0, 2), deg(2, 2), deg(3, 2)].forEach((f, i) =>
        strike(f, t + i * 0.055, 0.1, busSfx, { dur: 0.65 }));
      const g = env(t, 0.045, 0.08, 0.48);
      noise(t, 0.6, g, busSfx, 'bandpass', 1800, 2.4);
    },
    lampflare() {
      const t = now();
      duck(0.62, 0.45);
      bell(t, 146.83, 0.095, busSfx);
      [deg(0, 2), deg(3, 2), deg(0, 4)].forEach((f, i) =>
        strike(f, t + 0.05 + i * 0.075, 0.12, busSfx, { dur: 0.75 }));
      const g = env(t, 0.08, 0.01, 0.35);
      noise(t, 0.42, g, busSfx, 'highpass', 4200);
    },
    lampout() {
      const t = now();
      const g = env(t, 0.1, 0.004, 0.3);
      const v = osc('triangle', 330, t, 0.34, g, busSfx);
      v.frequency.exponentialRampToValueAtTime(72, t + 0.3);
      const g2 = env(t, 0.06, 0.02, 0.24);
      noise(t, 0.3, g2, busSfx, 'lowpass', 520);
    },
    mystic() {
      const t = now();
      [deg(4, 1), deg(1, 2), deg(3, 2)].forEach((f, i) =>
        strike(f, t + i * 0.07, 0.1, busSfx, { dur: 0.7 }));
      const g = env(t, 0.025, 0.12, 0.5);
      noise(t, 0.65, g, busSfx, 'bandpass', 2300, 3);
    },
    soulburst() {
      const t = now();
      const g = env(t, 0.2, 0.003, 0.32);
      const v = osc('sine', 180, t, 0.36, g, busSfx);
      v.frequency.exponentialRampToValueAtTime(48, t + 0.3);
      [deg(0, 2), deg(4, 2)].forEach((f, i) =>
        strike(f, t + 0.05 + i * 0.06, 0.11, busSfx, { bendTo: 1.08, bendT: 0.25, dur: 0.55 }));
    },
    soulcall() {
      const t = now();
      const g = env(t, 0.055, 0.03, 0.3);
      const v = osc('sine', 220, t, 0.34, g, busSfx);
      v.frequency.exponentialRampToValueAtTime(1760, t + 0.29);
      strike(deg(3, 4), t + 0.18, 0.08, busSfx, { dur: 0.45 });
    },
    pactoffer() {
      const t = now();
      duck(0.68, 0.45);
      bell(t, 146.83, 0.075, busSfx);
      [deg(0, 2), deg(1, 2), deg(4, 2)].forEach((f, i) =>
        strike(f, t + 0.08 + i * 0.09, 0.09, busSfx, { dur: 0.55 }));
    },
    pactstart() {
      const t = now();
      duck(0.52, 0.7);
      const g = env(t, 0.24, 0.003, 0.42);
      const v = osc('sine', 118, t, 0.46, g, busSfx);
      v.frequency.exponentialRampToValueAtTime(42, t + 0.38);
      const g2 = env(t, 0.14, 0.001, 0.09);
      noise(t, 0.12, g2, busSfx, 'bandpass', 1250, 1.4);
      [deg(0, 1), deg(4, 1)].forEach((f, i) =>
        strike(f, t + 0.12 + i * 0.12, 0.12, busSfx, { bendTo: 0.97, bendT: 0.35, dur: 0.8 }));
    },
    pactwin() {
      const t = now();
      duck(0.5, 0.85);
      [deg(0, 1), deg(2, 1), deg(3, 1), deg(0, 2)].forEach((f, i) =>
        strike(f, t + i * 0.075, 0.14, busSfx, { dur: 0.9 }));
      bell(t + 0.18, 110, 0.11, busSfx);
      const g = env(t + 0.22, 0.035, 0.1, 0.65);
      noise(t + 0.22, 0.8, g, busSfx, 'highpass', 5600);
    },
    pactfail() {
      const t = now();
      duck(0.62, 0.55);
      [deg(4, 1), deg(3, 1), deg(1, 1)].forEach((f, i) =>
        strike(f, t + i * 0.13, 0.12, busSfx, { bendTo: 0.91, bendT: 0.4, dur: 0.8 }));
      const g = env(t, 0.1, 0.01, 0.45);
      noise(t, 0.5, g, busSfx, 'lowpass', 380);
    },
    pactrest() {
      const t = now();
      [deg(0, 1), deg(2, 1), deg(3, 1)].forEach((f, i) =>
        strike(f, t + i * 0.11, 0.085, busSfx, { dur: 0.75 }));
      const g = env(t, 0.018, 0.12, 0.6);
      noise(t, 0.75, g, busSfx, 'bandpass', 1500, 3);
    },
    win() {
      // 夜明け: 鐘 + 琴の駆け上がり + 笛の A 長音 — 全てが解ける音
      const t = now();
      duck(0.35, 2.2);
      bell(t, 110, 0.2, busSfx);
      [deg(0, 1), deg(2, 1), deg(3, 1), deg(0, 2), deg(2, 2), deg(3, 2), deg(0, 4)].forEach((f, i) =>
        strike(f, t + 0.15 + i * 0.07, 0.13, busSfx, { dur: 1.0 }));
      const g = env(t + 0.7, 0.06, 0.3, 1.6);
      const o = osc('sine', deg(0, 4), t + 0.7, 2.0, g, busSfx);
      const lfo = A.ctx.createOscillator(), lg = A.ctx.createGain();
      lfo.frequency.value = 5.2; lg.gain.value = 8;
      lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(t + 1.1); lfo.stop(t + 2.8);
      const g2 = env(t + 0.5, 0.025, 0.4, 1.5);
      noise(t + 0.5, 2.0, g2, busSfx, 'highpass', 5500);
    },
    lose() {
      // 夜没: 琵琶の重い三連 (音が落ちていく) + 遠い鐘
      const t = now();
      duck(0.3, 2.6);
      [deg(0, 1), deg(4, 0.5), deg(2, 0.5)].forEach((f, i) =>
        strike(f, t + i * 0.42, 0.18, busSfx, { bendTo: 0.92, bendT: 0.6, dur: 1.4 }));
      strike(110, t + 1.3, 0.16, busSfx, { bendTo: 0.9, bendT: 0.9, dur: 1.8 });
      bell(t + 1.7, 73.42, 0.13, busSfx, [[1.0, 3.2, 1.0], [2.0, 2.2, 0.45], [2.4, 1.7, 0.28], [3.0, 1.2, 0.15]]);
      const g = env(t + 0.3, 0.03, 0.8, 2.0);
      noise(t + 0.3, 2.8, g, busSfx, 'bandpass', 300, 0.7);
    },
  };

  const THROTTLE = {
    shoot: 0.04, hit: 0.03, kill: 0.05, gem: 0.025, slash: 0.08, wind: 0.08,
    bolt: 0.08, crit: 0.07, arrow: 0.1, dash: 0.12, deny: 0.12, combo: 0.1, bang: 0.06,
    lampignite: 0.25, lampflare: 0.4, lampout: 0.3, mystic: 0.25, soulburst: 0.3, soulcall: 0.2,
    pactoffer: 0.5, pactstart: 0.5, pactwin: 0.5, pactfail: 0.5, pactrest: 0.5,
  };

  A.sfx = (name, opts = {}) => {
    if (!A.ctx || A.muted || A.ctx.state !== 'running') return;
    const th = THROTTLE[name];
    if (th) {
      const t = A.ctx.currentTime;
      if (lastPlayed[name] && t - lastPlayed[name] < th) return;
      lastPlayed[name] = t;
    }
    try { SFX[name](opts); } catch (e) { /* never let audio kill the game */ }
  };

  // ---------------- 夜風 (常時アンビエント) ----------------
  function startWind() {
    const mk = (freq, q, vol, lfoF, lfoAmt) => {
      const g = A.ctx.createGain();
      g.gain.value = vol;
      const src = A.ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const f = A.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = q;
      src.connect(f); f.connect(g); g.connect(busMus);
      src.start();
      const lfo = A.ctx.createOscillator();
      lfo.frequency.value = lfoF;
      const lg = A.ctx.createGain();
      lg.gain.value = lfoAmt;
      lfo.connect(lg); lg.connect(f.frequency);
      lfo.start();
    };
    mk(280, 0.6, 0.016, 0.07, 130);     // 低いうねり
    mk(960, 2.2, 0.005, 0.11, 350);     // 高い口笛 (遠くで鳴る)
  }

  // ---------------- 作曲 (32 小節のテーマ曲) ----------------
  // 旋律 = [step(0-7), 音度(0-4), オクターブ, 長さ(step数)] の列。8分音符 8step/小節。
  // 主題 A (8小節): 問い (A→C→B→A) と答え (…F) — B-C と E-F の半音が「百鬼」の声
  const MA = [
    [[0, 0, 2, 3], [3, 2, 2, 1], [4, 1, 2, 2], [6, 0, 2, 2]],                       // 問い
    [[0, 3, 1, 5], [6, 2, 1, 1], [7, 3, 1, 1]],                                     // E に留まる
    [[0, 0, 2, 3], [3, 2, 2, 1], [4, 1, 2, 1], [5, 0, 2, 1], [6, 4, 1, 2]],         // 答え (F へ)
    [[0, 4, 1, 1], [1, 3, 1, 6]],                                                   // F→E の溜息
    [[0, 3, 1, 2], [2, 4, 1, 2], [4, 0, 2, 2], [6, 1, 2, 2]],                       // 駆け上がり
    [[0, 2, 2, 3], [4, 1, 2, 1], [5, 0, 2, 1], [6, 1, 2, 2]],
    [[0, 2, 2, 2], [2, 3, 2, 2], [4, 2, 2, 1], [5, 1, 2, 1], [6, 0, 2, 1], [7, 1, 2, 1]],  // 頂点 (E5)
    [[0, 0, 2, 5], [6, 3, 1, 2]],                                                   // 結び
  ];
  // サビ B (8小節): 高みで泣き、底へ降りて、結ぶ
  const MB = [
    [[0, 3, 2, 3], [4, 2, 2, 1], [5, 1, 2, 1], [6, 2, 2, 2]],                       // E5 の叫び
    [[0, 4, 2, 4], [5, 3, 2, 1], [6, 2, 2, 2]],                                     // F5 — 最高の緊張
    [[0, 3, 2, 2], [2, 2, 2, 1], [3, 1, 2, 1], [4, 0, 2, 2], [6, 1, 2, 2]],
    [[0, 1, 2, 1], [1, 2, 2, 1], [2, 1, 2, 1], [3, 0, 2, 1], [4, 3, 1, 4]],         // 渦を巻いて降りる
    [[0, 0, 2, 2], [2, 2, 2, 1], [3, 1, 2, 1], [4, 0, 2, 2], [6, 3, 1, 2]],         // 主題の影
    [[0, 4, 1, 2], [2, 3, 1, 2], [4, 4, 1, 1], [5, 3, 1, 1], [6, 2, 1, 2]],         // 低い呟き (F-E)
    [[0, 3, 1, 2], [2, 0, 2, 2], [4, 1, 2, 1], [5, 2, 2, 1], [6, 1, 2, 1], [7, 2, 2, 1]],  // 駆け上がり
    [[0, 0, 2, 6]],
  ];
  // 終結部 A': 主題の前 6 小節 + 大きなカデンツ
  const MA2 = MA.slice(0, 6).concat([
    [[0, 1, 2, 1], [1, 2, 2, 1], [2, 3, 2, 3], [5, 2, 2, 1], [6, 1, 2, 1], [7, 1, 2, 1]],
    [[0, 0, 2, 8]],
  ]);
  const MELODY = MA.concat(MA, MB, MA2);                     // 32 小節

  // 和声 (1小節1コード): i=Am VI=F III=C v=Esus
  const Am = { bass: 110.0, fifth: 164.81, chord: [0, 2, 3] };
  const Fc = { bass: 87.31, fifth: 130.81, chord: [4, 0, 2] };
  const Cc = { bass: 130.81, fifth: 164.81, chord: [2, 3, 0] };
  const Em = { bass: 82.41, fifth: 123.47, chord: [3, 0, 1] };
  const CH_A = [Am, Em, Fc, Em, Am, Fc, Cc, Am];
  const CH_B = [Am, Fc, Cc, Em, Am, Fc, Em, Am];
  const CHART = CH_A.concat(CH_A, CH_B, CH_A);               // 32 小節

  const BARS = 32;
  const STEPS_PER_BAR = 8;

  let seqTimer = null, nextNoteT = 0, step = 0, bar = 0;
  let Ism = 0.15;                                            // 平滑化した intensity
  let phraseRng = G.mulberry32(1234);

  // --- 楽器 ---
  // 琴 (Karplus-Strong) は strike() を使う
  // 笛: 立ち上がりのしゃくり + 遅れて咲くビブラート + 息
  function flute(freq, t, dur, vel, pan = -0.12, meri = false) {
    const out = chan(busMus, pan);
    // アタリ: 吹き始めの息の当たり (子音的な立ち上がり)
    const ga = env(t, vel * 0.5, 0.004, 0.05);
    noise(t, 0.06, ga, out, 'bandpass', freq * 2.4, 1.4);
    // 基音 = 尺八テーブル。ベロシティで明るさ(LPF)が開く = 吹く強さの表情
    const g = env(t, vel, 0.05, dur, 0.0003);
    const lp = A.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 0.7;
    const bright = G.clamp(freq * 3 + vel * 11000, 900, 13000);
    lp.frequency.setValueAtTime(bright * 0.55, t);
    lp.frequency.linearRampToValueAtTime(bright, t + 0.1);     // 息を入れると開く
    const o = A.ctx.createOscillator();
    o.setPeriodicWave(WT.flute);
    o.frequency.setValueAtTime(freq * 0.96, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.08);
    if (meri) o.frequency.exponentialRampToValueAtTime(freq * 0.94, t + dur);
    // ビブラートは遅れて咲き、徐々に速く深く
    const lfo = A.ctx.createOscillator();
    lfo.frequency.setValueAtTime(4.6, t);
    lfo.frequency.linearRampToValueAtTime(6.2, t + dur);
    const lg = A.ctx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(freq * 0.015, t + Math.min(0.35, dur * 0.5));
    lfo.connect(lg); lg.connect(o.frequency);
    lfo.start(t); lfo.stop(t + dur + 0.1);
    o.connect(lp); lp.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.1);
    // 息ノイズ (持続)
    const g4 = env(t, vel * 0.26, 0.06, dur * 0.85);
    noise(t, dur, g4, out, 'bandpass', freq * 2.1, 2.0);
    // コーラス: 僅かにデチューンした分身を逆側へ振り、横幅を出す
    const out2 = chan(busMus, G.clamp(-pan * 1.5, -1, 1));
    const gc = env(t, vel * 0.4, 0.07, dur, 0.0003);
    const oc = A.ctx.createOscillator();
    oc.setPeriodicWave(WT.flute); oc.detune.value = 9;
    oc.frequency.setValueAtTime(freq * 0.96, t);
    oc.frequency.exponentialRampToValueAtTime(freq, t + 0.09);
    oc.connect(gc); gc.connect(out2);
    oc.start(t); oc.stop(t + dur + 0.1);
  }
  // 笙: 2小節持続の和音ドローン。決戦では E+F 半音の軋みに変わる。和音を左右へ広げる
  function drone(t, ch, dur, duel) {
    const fs = duel
      ? [[164.81, 0.017, -0.35], [174.61, 0.015, 0.35], [ch.bass * 2, 0.012, 0]]
      : [[ch.bass * 2, 0.016, -0.3], [ch.fifth * 2, 0.011, 0.3], [ch.bass * 3, 0.006, 0]];
    fs.forEach(([f, v, pan]) => {
      const out = chan(busMus, pan);
      const lp = A.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.5;   // 笙のリードを温かく保つ
      const g = A.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v, t + 1.0);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      const o = A.ctx.createOscillator();
      o.setPeriodicWave(WT.sho);                             // 笙の厚いリード倍音 (テーブル)
      o.frequency.value = f;
      o.detune.setValueAtTime(G.rand(-4, 4), t);             // ユニゾンの揺らぎ
      o.connect(lp); lp.connect(g); g.connect(out);
      o.start(t); o.stop(t + dur + 0.1);
    });
  }
  // 琵琶ベース + シンセ低音: 駆動するアタックと重い土台
  function bassNote(freq, t, vel = 0.16, pan = 0) {
    const out = chan(busMus, pan);
    ksStrike(freq, t, vel * 0.85, out, { dur: 0.7, lpf: true }); // 琵琶の撥 (リアルタイムKS)
    // シンセ・プラック (saw → LP で締める = 推進力)
    const g = env(t, vel * 0.9, 0.006, 0.32);
    const o = A.ctx.createOscillator();
    o.setPeriodicWave(WT.bass); o.frequency.value = freq;     // 倍音整理した太い低音テーブル
    const lp = A.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 5;
    lp.frequency.setValueAtTime(freq * 6, t);
    lp.frequency.exponentialRampToValueAtTime(freq * 1.6, t + 0.18);
    o.connect(lp); lp.connect(g); g.connect(out);
    o.start(t); o.stop(t + 0.4);
    // サブ (重み)
    const g2 = env(t, vel * 0.6, 0.01, 0.3);
    osc('sine', freq * 0.5, t, 0.34, g2, out);
  }
  // 大太鼓: ピッチ落ち + スティックの当たり + 胴の鳴り。パンチ重視でドラムバスへ
  function odaiko(t, vel = 0.5, pan = 0) {
    const out = chan(busDrums, pan);
    const g = env(t, vel, 0.003, 0.34);
    const v = osc('sine', 184, t, 0.38, g, out);
    v.frequency.exponentialRampToValueAtTime(46, t + 0.15);
    const g1 = env(t, vel * 0.45, 0.002, 0.12);              // 倍音で輪郭
    osc('triangle', 150, t, 0.16, g1, out).frequency.exponentialRampToValueAtTime(60, t + 0.1);
    const g2 = env(t, vel * 0.5, 0.001, 0.028);              // スティックの当たり
    noise(t, 0.04, g2, out, 'highpass', 1800);
    const g3 = env(t, vel * 0.3, 0.002, 0.09);               // 胴の鳴り
    noise(t, 0.1, g3, out, 'lowpass', 220);
  }
  // 締太鼓 / 裏拍スネア: 短く締まった抜け
  function shime(t, vel = 0.3, pan = 0.12) {
    const out = chan(busDrums, pan);
    const g = env(t, vel, 0.002, 0.13);
    const v = osc('sine', 244, t, 0.16, g, out);
    v.frequency.exponentialRampToValueAtTime(110, t + 0.09);
    const g2 = env(t, vel * 0.6, 0.001, 0.07);
    noise(t, 0.08, g2, out, 'bandpass', 1900, 1.2);
    const g3 = env(t, vel * 0.35, 0.001, 0.04);              // パリッとした上
    noise(t, 0.05, g3, out, 'highpass', 3000);
  }
  function ka(t, vel = 0.08, pan = 0) {                       // 刻みハット (締太鼓の縁)
    const out = chan(busDrums, pan);
    const g = env(t, vel, 0.001, 0.035);
    noise(t, 0.04, g, out, 'highpass', 6500);
    const g2 = env(t, vel * 0.5, 0.001, 0.02);
    noise(t, 0.025, g2, out, 'bandpass', 3400, 4);
  }
  function ki(t, pan = 0) {                                   // 拍子木
    const out = chan(busDrums, pan);
    const g = env(t, 0.05, 0.001, 0.03);
    noise(t, 0.04, g, out, 'bandpass', 2800, 6);
  }
  function suzu(t, vel = 0.02) {                             // 神楽鈴 (左右に散らしてきらめき)
    [[4434, -0.4], [5920, 0.4], [7458, 0]].forEach(([f, pan], i) => {
      const out = chan(busMus, pan);
      const g = env(t + i * 0.012, vel * (1 - i * 0.25), 0.002, 0.5);
      osc('sine', f * G.rand(0.99, 1.01), t + i * 0.012, 0.55, g, out);
    });
  }

  // エレキギター・パワーコード (根音 + 完全5度 + オクターブ)。busGtr のアンプを通す。
  // mute=パームミュート (短く暗く締めたチャグ) / そうでなければサステイン
  function gtrChord(root, t, dur, vel, mute) {
    const d = mute ? 0.13 : dur;
    [busGtrL, busGtrR].forEach((busG, idx) => {              // 左右で別テイク (独立デチューン + 微小タイミング差 = 広がり)
      const tt = t + idx * 0.012;                            // 2本目をほんの少し遅らせる (実録りのズレ)
      const amp = A.ctx.createGain();
      amp.gain.setValueAtTime(0.0001, tt);
      amp.gain.exponentialRampToValueAtTime(vel, tt + (mute ? 0.004 : 0.01));
      amp.gain.exponentialRampToValueAtTime(0.0001, tt + d);
      let node = amp;
      if (mute) {                                            // パームミュート: 上を削って締める
        const lp = A.ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 1300; lp.Q.value = 0.7;
        amp.connect(lp); node = lp;
      }
      node.connect(busG);
      [1, 1.4983, 2].forEach(r => {                          // 完全5度のパワーコード
        const o = A.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = root * r;
        o.detune.value = G.rand(-13, 13);                    // テイクごとに違う弦のうねり
        o.connect(amp);
        o.start(tt); o.stop(tt + d + 0.05);
      });
    });
  }
  // エレキギターの歪んだ単音リード: チョーキング (しゃくり) + ビブラート。左右ダブルで太く
  function gtrLead(freq, t, dur, vel) {
    [busGtrL, busGtrR].forEach((busG, idx) => {
      const tt = t + idx * 0.01;
      const amp = A.ctx.createGain();
      amp.gain.setValueAtTime(0.0001, tt);
      amp.gain.exponentialRampToValueAtTime(vel * 0.72, tt + 0.02);
      amp.gain.exponentialRampToValueAtTime(0.0001, tt + dur);
      amp.connect(busG);
      const o = A.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(freq * 0.94, tt);
      o.frequency.exponentialRampToValueAtTime(freq, tt + 0.06);   // チョーキング
      o.detune.value = G.rand(-10, 10);
      const lfo = A.ctx.createOscillator(); lfo.frequency.value = 5.6 + idx * 0.4;
      const lg = A.ctx.createGain();
      lg.gain.setValueAtTime(0, tt);
      lg.gain.linearRampToValueAtTime(freq * 0.017, tt + Math.min(0.25, dur * 0.5));
      lfo.connect(lg); lg.connect(o.frequency); lfo.start(tt); lfo.stop(tt + dur + 0.1);
      o.connect(amp); o.start(tt); o.stop(tt + dur + 0.1);
    });
  }

  // --- 1 step 分のスケジューリング ---
  function scheduleStep(t, stepDur) {
    Ism += (A.intensity - Ism) * 0.05;
    const I = Ism;
    const duel = I > 0.93;
    const ch = CHART[bar % BARS];
    const swing = stepDur * 0.05 * (1 - G.clamp((I - 0.3) * 2, 0, 1));   // 疾走では跳ねを直線化
    const tp = t + (step % 2 === 1 ? swing : 0) + G.rand(-0.003, 0.003);
    const barInForm = bar % BARS;
    const inB = barInForm >= 16 && barInForm < 24;                       // サビ
    const pactActive = !!(G.run && G.run.ordeal);
    const next = CHART[(bar + 1) % BARS];
    const beat = (step % 2 === 0);                                       // 0,2,4,6 = 表拍

    // 笙ドローン (2小節ごと)
    if (step === 0 && bar % 2 === 0) drone(t, ch, stepDur * STEPS_PER_BAR * 2, duel);

    // 神楽鈴 / 形式の頭の鐘
    if (step === 0 && bar % 4 === 0 && I < 0.45) suzu(tp);
    if (step === 0 && barInForm === 0 && I > 0.5) bell(t, 110, 0.06, busMus);

    // ===== 疾走ドラム: 太鼓を四つ打ちのキック、裏拍にスネア、16分の刻み =====
    if (I > 0.16) {
      if (I < 0.4) {                                                     // 行列: 表拍だけ踏む
        if (step === 0 || step === 4) { odaiko(tp, 0.28, 0); pump(tp, 0.74); }
      } else {                                                           // 囃子〜乱: 四つ打ち + ポンプ
        if (beat) { odaiko(tp, 0.32 + I * 0.07, 0); pump(tp, 0.66 - I * 0.1); }
      }
      if (I > 0.45 && (step === 2 || step === 6)) shime(tp, 0.24 + I * 0.08, 0.12);  // 裏拍スネア
      if (I > 0.3) ka(tp, 0.05 + I * 0.03, step % 2 ? 0.2 : -0.14);                  // 8分ハット
      if (I > 0.6) ka(tp + stepDur * 0.5, 0.035 + I * 0.02, step % 2 ? -0.2 : 0.14); // 16分の刻み
      if (I > 0.25 && I < 0.72 && (step === 1 || step === 5)) ki(tp, -0.3);
      if (duel && (step === 1 || step === 3 || step === 5 || step === 7)) odaiko(tp, 0.2, 0); // 乱打
      if (bar % 8 === 7 && step >= 5) {                                  // 小節終いのフィル
        shime(tp, 0.18 + (step - 5) * 0.05, -0.2);
        shime(tp + stepDur * 0.5, 0.16 + (step - 5) * 0.05, 0.2);
      }
    }

    // 夜契り中: 別レイヤーの鼓動 (画面を見なくても試練中だと分かる)
    if (pactActive) {
      if (step === 0) odaiko(tp, 0.24, -0.25);
      if (step === 2 || step === 6) ka(tp, 0.05, 0.28);
      if (step === 7 && bar % 2 === 1) suzu(tp, 0.012);
    }

    // ===== 動くベースライン: 根音→5度→オクターブ、高揚で8分の走るベース =====
    if (I > 0.16) {
      const run = I > 0.5;
      if (step === 0) bassNote(ch.bass, tp, 0.17 + I * 0.05, -0.05);
      if (step === 2) bassNote(ch.bass, tp, 0.10 + I * 0.03, -0.05);
      if (step === 4) bassNote(ch.fifth, tp, 0.12 + I * 0.03, -0.05);
      if (step === 6) bassNote(run ? ch.bass * 2 : ch.fifth, tp, 0.10, -0.05);
      if (run && (step === 3 || step === 5)) bassNote(ch.fifth, tp, 0.07, -0.05);
      if (run && step === 7) bassNote(next.bass, tp, 0.08, -0.05);       // 次の和音へ導く
    }

    // 琴アルペジオ: 和声の彩り (右へ定位)
    if (I > 0.3) {
      const ai = [0, 3, 5].indexOf(step);
      if (ai >= 0) ksStrike(deg(ch.chord[ai], 1), tp, 0.05 + I * 0.03, busMus, { dur: 1.1, pan: 0.24, lpf: true });
    }

    // ===== エレキギター: 和音の上にパワーコード、囃子以降でチャグ刻み =====
    if (I > 0.5) {
      const groot = ch.bass * 2;                                        // 低めのギター域
      if (step === 0) gtrChord(groot, tp, stepDur * STEPS_PER_BAR * 0.95, 0.085 + I * 0.05, false);  // 小節頭サステイン
      if (I > 0.66 && step === 4) gtrChord(groot, tp, 0, 0.08 + I * 0.04, true);                       // 中拍チャグ
      if (I > 0.74 && (step === 2 || step === 6)) gtrChord(groot, tp, 0, 0.06, true);                  // 裏のチャグ
    }

    // ===== 旋律: 宵は琴の骨格、行列で全旋律、囃子からサビを尺八、乱では全て尺八 =====
    const motif = MELODY[barInForm];
    for (let i = 0; i < motif.length; i++) {
      const [st, dg, oct, len] = motif[i];
      if (st !== step) continue;
      if (I < 0.2 && st % 2 === 1) continue;                             // 宵: 骨格のみ
      const f = deg(dg, oct);
      const noteDur = len * stepDur * 1.25;                              // 音を長めに (次音へ繋ぐレガート)
      const fluteLead = I > 0.62 || (I > 0.42 && inB);
      const meri = len >= 4 && (dg === 1 || dg === 4);                   // 長音の溜めにメリ下げ
      if (fluteLead) {
        flute(f, tp, Math.max(noteDur, stepDur * 2.0), 0.05 + I * 0.035, -0.12, meri);  // 尺八を長く伸ばす
        if (I > 0.5) ksStrike(f, tp, 0.06, busMus, { dur: 0.5, pan: 0.16, lpf: true, pluck: true });   // 琴が芯を支える
        if (inB && I > 0.55) gtrLead(f, tp, Math.max(noteDur, stepDur * 1.2), 0.05 + I * 0.03);  // サビは尺八にギターを重ねて際立たせる
      } else {
        ksStrike(f, tp, (I < 0.2 ? 0.12 : 0.15) + I * 0.05, busMus, { dur: Math.max(0.5, noteDur), pan: 0.1, body: true, lpf: true, pluck: true });
      }
      // 装飾: コロリン (隣の音度を素早く)
      if (len >= 2 && phraseRng() < 0.18) ksStrike(deg((dg + 1) % 5, oct), tp + stepDur * 0.55, 0.045, busMus, { dur: 0.3, pan: 0.32, lpf: true });
    }

    step++;
    if (step >= STEPS_PER_BAR) {
      step = 0;
      bar++;
      if (bar % BARS === 0) phraseRng = G.mulberry32((Date.now() & 0xffff) + bar);
    }
  }

  function startSequencer() {
    nextNoteT = A.ctx.currentTime + 0.1;
    seqTimer = setInterval(() => {
      if (!A.ctx || A.ctx.state !== 'running') return;
      while (nextNoteT < A.ctx.currentTime + 0.18) {
        const bpm = 128 + 26 * Ism;                          // 疾走: 夜が深まるほど行列は加速
        const stepDur = 60 / bpm / 2;
        scheduleStep(nextNoteT, stepDur);
        nextNoteT += stepDur;
      }
    }, 40);
  }

  // テスト用フック (検証スクリプトが使う)
  A._test = { sfx: SFX, master: () => master, strings: () => strings, gtrChord, gtrLead, busMus: () => busMus, ksReady: () => ksReady, ksActive: () => ksActive };

  return A;
})();
