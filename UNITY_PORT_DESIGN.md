# 百鬼夜行サバイバーズ — Unity 移植設計書

`v1 / 2026-06-17 起案`

Web/Canvas2D 版（依存ゼロ・アセットゼロ・9ファイル/14,109行）を **Unity 6 (6000.4.x)** へ移植するための設計図。
本書は「実装の青写真」であり、各判断は**決定（推奨）＋根拠＋代替案**の形で記す。数値・挙動の真実源は現行 `js/` コード。

---

## 0. 結論（要旨）

- **現実的に可能**。Unity 6 はこのゲームに必要な機能（2D・数百体・手続き描画・音DSP・UI）を公式機能で満たす。
- ただし**機械的移植ではなく約1.4万行のC#再実装**。最大の作業は**描画再設計**と**音響の作り直し**。ロジック/データ（約4千行強）は近直訳。
- 成功の鍵は **「データ指向コアを1:1移植し、Unityは薄いglueに留める」**。GameObject/MonoBehaviour を敵1体ごとに使う設計にすると移植が破綻し性能も落ちる。
- **Web版を“参照オラクル”**として常時パリティ比較し、`data.js` を**単一の真実源**として自動エクスポートすることで、移植時の数値ズレと劣化を防ぐ。

---

## 1. 前提・ゴール・非ゴール

| 区分 | 内容 |
|---|---|
| 現行 | Web/Canvas2D + WebAudio、依存ゼロ・アセットゼロ。`util/engine/data/sprites/systems/entities/main/ui`（9ファイル/14,109行） |
| ターゲット | Unity **6000.4.x**、2D、URP（2D Renderer）、UI Toolkit、Input System |
| 第一目標 | **Android ネイティブ配信**（itch.io はWeb版で既出可）。将来 PC/Steam も視野 |
| ゴール | 現行のゲームフィール・バランスを**忠実再現**しつつ、ネイティブ化の恩恵（保存/入力/2D照明/GPU演出/運用基盤）を得る |
| 非ゴール（初版） | DOTS/ECS化（敵数は現状322で十分、後日）/ オンライン要素 / WebGL再書き出し |

---

## 2. 移植の基本方針（5大原則）

1. **データ指向コアを1:1移植**。エンティティは「プール内のプレーンC#オブジェクト」、更新は配列ループ。Unity 物理・GameObject階層に載せ替えない。
2. **固定ステップ60Hzループを自前で再現**。`FixedUpdate` は使わない（物理タイムステップ依存・hitstop/slowmo/timescale を自前制御するため）。`Update` 内アキュムレータで現行 `main.js` のループ意味論を完全再現。
3. **Unity 物理（Rigidbody/Collider）不使用**。移動も衝突も現行どおり自前（`x += vx*h`＋距離判定＋空間ハッシュ）。決定性とフィールを保つ。
4. **`data.js` を単一の真実源に**。手書き転記でなく **JS→JSON→ScriptableObject の自動エクスポータ**を用意（1,105行を人手で写さない）。
5. **Web版を参照オラクルにパリティ検証**。同条件で数値（ダメージ/出現数/曲線）と挙動を突き合わせ、5pp以上の乖離を回帰扱い。

---

## 3. 技術スタック

| 領域 | 採用 | 代替 / 備考 |
|---|---|---|
| エンジン | Unity 6000.4.x | 既にインストール済 |
| 描画 | **URP 2D Renderer** + 自作バッチレンダラ | Built-in でも可だが2D Lights/Bloomのため URP |
| ライティング | **URP Light2D**（提灯/プレイヤー/結界）+ Global Light で暗闇 | 代替: destination-out 相当のRT合成で完全一致 |
| ポストFX | URP **Bloom**（Volume） | 現行の手動bloom置換 |
| UI | **UI Toolkit (UXML/USS)** | CSS/HTML寄りで `ui.js` 移植が楽。uGUIは非推奨 |
| 入力 | **Input System (new)** | PC/ゲームパッド/タッチを単一アクションマップで |
| 音 | **AudioSource + AudioMixer**（ベイク主体）/ 必要時 `OnAudioFilterRead` | §9 |
| 文字 | **TextMeshPro**（漢字アイコン/ダメージ数字/UI） | 日本語フォントatlas必須 |
| 保存 | `Application.persistentDataPath` の JSON | PlayerPrefs は単純キーのみ |
| 言語 | C# 9+/ .NET Standard 2.1 | — |

---

## 4. プロジェクト構成

```
HyakkiUnity/
├── Assets/
│   ├── Scenes/            Boot.unity / Game.unity
│   ├── Scripts/
│   │   ├── Core/          G(定数) Pool<T> SpatialGrid MathU SaveStore Rng
│   │   ├── Data/          *ScriptableObject + Balance(曲線) + DataLoader
│   │   ├── Sim/           GameLoop実体 / Director / Weapons / Combat /
│   │   │                  EnemyAI / Leveling / Awakening / Synergies / Aura
│   │   │   └── Entities/  Enemy Boss Player Projectile Orb Corpse Lamp Ward Flame Gem Item
│   │   ├── Render/        Batch2D(Canvas2D相当) SpriteBank Camera2D Fx Lighting WorldRenderer
│   │   ├── Audio/         AudioSystem MusicBaker SfxBank
│   │   ├── UI/            Screens(UXML/USS) Hud Meta Tooltips
│   │   ├── App/           GameApp(MonoBehaviour) GameState Input DebugApi
│   │   └── Dev/           PlayModeTests / ParityHarness
│   ├── Art/Generated/     ベイク済スプライトatlas + meta（エクスポータ出力）
│   ├── Audio/Generated/   ベイク済 music/sfx クリップ
│   └── UI/                *.uxml / *.uss
├── Packages/              URP, InputSystem, UIToolkit, TMP, (MCP bridge)
└── Tools/                 data_export.(py|js)  sprite_bake.(py|html)  audio_render.html
```

- **アセンブリ定義**で `Core/Data/Sim/Render` を MonoBehaviour非依存にし、`App/UI` だけ UnityEngine.UI 系に依存させる（テスト容易・将来DOTS化容易）。
- namespace: `Hyakki.Core` / `Hyakki.Sim` / `Hyakki.Render` …

---

## 5. アーキテクチャ全体（レイヤ）

```
App(GameApp MonoBehaviour)
  └─ Update(): 入力収集 → アキュムレータで Sim.Tick(1/60) を0〜N回 → Render.Draw()
GameState (state machine: boot/title/run/pause/levelup/pact/over/win)
Sim   (純C#・UnityEngine非依存): 全ゲームロジック。Web版 systems/entities/data に対応
Render(Batch2D + Lighting + WorldRenderer): Simの状態を読んで描画。Web版 sprites/engine.fx/ENT.render に対応
Audio (AudioSystem): Simからのイベント（撃破/会心/着弾…）を受けて再生
UI    (UI Toolkit): GameState駆動の画面 + HUD
Save  (SaveStore): 永続化
```

**重要**: Sim は UnityEngine に依存しない純ロジック層にする。これにより (a) Web版とのパリティテストが純関数で書ける (b) 描画/音/入力を差し替え可能 (c) PlayModeに依らない単体テストが可能。

---

## 6. モジュール対応表（JS → C#）

| 現行 (JS) | 行数 | 移植先 | 難易度 | 方針 |
|---|---|---|---|---|
| `util.js` (G/Pool/grid/store/math) | 163 | `Core/*` | ◎ | Pool<T>, SpatialGrid, MathU, SaveStore, G定数へ直訳 |
| `data.js` (全バランス) | 1,105 | `Data/*` ScriptableObject + `Balance` | ◎ | **自動エクスポータ**で生成。曲線関数は `Balance.cs` |
| `systems.js` (director/weapons/leveling/synergy/aura) | 1,248 | `Sim/Director,Weapons,Leveling,Awakening,Synergies,Aura` | ◯ | 直訳 |
| `entities.js` (敵/弾/死体/ダメージ/AI/render) | 3,376 | `Sim/Entities/*`,`Sim/Combat`,`Sim/EnemyAI`,`Render/WorldRenderer` | ◯〜△ | ロジックは直訳、`ENT.render` は Render層へ |
| `main.js` (ループ/状態/入力/debug) | 1,270 | `App/GameApp,GameState,Input,Dev/DebugApi` | ◯ | ループは自前アキュムレータ |
| `engine.js` (cam/fx/lighting/bloom/pools) | 735 | `Render/Camera2D,Fx,Lighting` + `Core/Pool` | △ | fxは Batch2D 上に再実装、lightingはURP |
| `sprites.js` (手続きスプライト) | 3,161 | `Render/SpriteBank` + オフライン bake | △ | **事前ベイク**（§8.2） |
| `audio.js` (WebAudio合成) | 1,197 | `Audio/AudioSystem` + bake | ✕(最難) | §9 |
| `ui.js` (DOM/CSS UI) | 1,854 | `UI/*` + UXML/USS | △ | UI Toolkitへ |

---

## 7. シミュレーションコア設計

### 7.1 固定ステップループ（`main.js` のループを完全再現）

```csharp
// GameApp.Update()  ※FixedUpdateは使わない
float dtR = Mathf.Min(Time.deltaTime, 0.05f);          // スパイク保護
if (hitstopT > 0) { hitstopT -= dtR; }                 // hitstop中はsim停止
else acc += dtR * G.timescale * G.GAME_SPEED * (slowmoT > 0 ? slowmoSc : 1f);
int maxSteps = Mathf.Max(12, (int)(G.timescale * 2 + 4));
int steps = 0;
while (acc >= H && steps < maxSteps) {                 // H = 1/60 固定
    Sim.Tick(H); acc -= H; steps++;
}
if (slowmoT > 0) slowmoT -= dtR;
Render.Draw();                                          // 補間は初版なし（sim状態で描画）
```

- `G.GAME_SPEED / H / timescale / slowmo / hitstop` は現行値をそのまま移植。**テストプレイ2倍速＝`G.timescale=2`** がそのまま生きる。
- 将来 >60fps 滑らか化が必要なら描画補間（前後sim状態のlerp）を追加。初版は等速。

### 7.2 オブジェクトプール（`util.js` Pool）

```csharp
public sealed class Pool<T> where T : class, new() {
    public readonly List<T> act = new();   // 生存中
    readonly Stack<T> free = new();
    public int max;
    public T Obtain() { var e = free.Count>0?free.Pop():new T(); act.Add(e); return e; }
    public void ReleaseAt(int i){ var e=act[i]; act[i]=act[^1]; act.RemoveAt(act.Count-1); free.Push(e); }
}
```

- **更新ループは後方反復**（`for i=act.Count-1..0`）を厳守＝Web版と同じ。
- **致命的注意**: プール再利用のため、`SpawnEnemy/SpawnBoss` で**全フィールドを必ず初期化**（現行で再三バグった箇所＝`atk/atkT/atkMax/atkCd/aoeX/dirx/curseT/_face/snT/...`）。C#は構造体化すれば自動ゼロ初期化で安全寄り（§7.4）。

### 7.3 空間ハッシュ（`G.grid`）

- `Clear / Insert / QueryCircle / CellList` を直訳。`QBUF/QBUF2` は再利用配列（`List<Enemy>`）。
- `UpdateEnemies` 冒頭で毎フレーム再構築（現行どおり）。**再帰でQBUF2が壊れる罠**（superBurst/curse spread）は現行同様 `.ToArrayCopy(0,24)` 相当でコピーしてから処理。

### 7.4 エンティティモデル

- 敵/弾/死体/魂/アイテム/提灯/結界/霊炎/orb をそれぞれ class（または struct）でプール化。
- 推奨: **class（参照）**。理由＝相互参照（`run.boss`, `hitIds`）と部分更新が多くstructのコピーコストが不利。ただし「全フィールド初期化」を `Reset()` メソッドに集約し Obtain 時に必ず呼ぶ規約にする。
- 物理は持たせない（Rigidbody/Collider なし）。座標は自前 `x,y,vx,vy,kbx,kby`。

### 7.5 決定性 / RNG

- 初版は現行同様 `UnityEngine.Random`（非シード）。
- 将来リプレイ/厳密パリティが要るなら `System.Random` をシード固定で `Core/Rng` に隔離（`rand/chance/pick`）。**パリティ検証時は両環境で同seed**にできる設計にしておく。

---

## 8. 描画設計（最重要）

現行は Canvas2D：スプライトはオフキャンバスに**事前ベイク**して `S.draw` で blit、fx は毎フレーム即時描画、ライティングは destination-out 2パス。これを次の3本柱で再現する。

### 8.1 Batch2D ＝「Canvas2D相当」即時APIの自作

現行の `ENT.render` / `S.draw` / `fx.*` を**ほぼ行単位で移植**できるよう、Unity上に薄い2D即時描画APIを作る。1枚の動的メッシュ（頂点色つき）＋アトラスで **1〜数ドローコール**に集約。

```csharp
// 各フレーム: Batch2D.Begin() → WorldRenderer が Draw.* を呼ぶ → Batch2D.Flush()
static class Draw {
  void Sprite(int spriteId, float x,float y,float rot,float scale,bool flip,float alpha,Color tint);
  void Circle(float x,float y,float r,Color c);          // 塗り
  void Ring(float x,float y,float r0,float r1,Color c);  // 環
  void Line(float x,float y,float x2,float y2,float w,Color c);
  void Poly(ReadOnlySpan<Vector2> pts,Color c);          // shards/扇など
  void Arc(float x,float y,float r,float a0,float a1,float w,Color c);
  void Text(string s,float x,float y,float size,Color c);// TMPプールへ委譲
}
```

- ソリッドfx（circle/ring/line/poly/arc）は **1pxの白テクスチャ**＋頂点色で描く＝アトラスと同一マテリアルでバッチ可能。
- **加算合成**（霊炎/グロー/会心）はマテリアル別の第2バッチ（BlendMode=One One）。`globalCompositeOperation='lighter'` 相当。
- **yソート**は現行どおり描画順で制御（drawListをy昇順）。Unityのsorting任せにせず順序を握る＝移植が直線的。
- これにより `sprites.js` の `S.draw` 呼び出しと `entities.js ENT.render` の `ctx.*` を `Draw.*` に置換するだけで移植が進む（**4,500行の描画コードの最短経路**）。

### 8.2 スプライトのベイク（`sprites.js`）

- 手続き生成はランタイムで毎回やる必要がない（現行も起動時1回ベイク）。**オフラインで現行JSの生成器を流用**し、各スプライト（2フレーム）を **PNGアトラス＋meta(JSON)** に書き出して Unity に取り込む（`Tools/sprite_bake.html`）。
- **白シルエット `_w` 変種は廃止**し、スプライトシェーダの `_FlashAmount`（白塗り量）/ `_Tint` で表現。被弾フラッシュ・撃破ポップ・squash は MaterialPropertyBlock / 頂点で per-instance 制御。→ ベイク枚数とランタイム分岐が減る。
- 漢字アイコン（`kanjiIcon`）は **TextMeshPro** で実行時描画（ベイク不要）。日本語フォントatlas（必要字のみ）を用意。

### 8.3 fx（`engine.js` F.*）

- spark/shards/soul/ember/trail/ring/bolt/impact/crit/text/flash/screenPulse/screenColor をプール化して Batch2D 上で再実装（Shurikenは使わず**現行の挙動を厳密移植**）。
- `screenPulse/screenColor/flash` は全画面オーバレイ（quad）＋ URP の color grading / 一時マテリアルで。

### 8.4 ライティング

- **採用: URP 2D Renderer + Light2D**。提灯=点光源（灯紋色）、プレイヤー=微光、結界札=円光、暗闇=Global Light を暗く。Bloom は Volume。
  - 利点: 滑らか・正規機能・モバイル対応。提灯の滞在段階（dwell）で `Light2D.pointLightOuterRadius / intensity` をスケール。
- **代替（完全一致が要る場合）**: 暗幕quad＋光円を subtract する RT 合成で destination-out を再現。初版はURPを試し、見た目が要件未達なら代替へ。

### 8.5 カメラ

- `Camera2D`: 現行 `cam.follow` のクランプ（壁際でプレイヤーを画面中央寄せする padX/padY ロジック）と `add(shake)/punch(zoom)` を移植。Unity Camera の orthographicSize/position を駆動。Cinemachine は**使わない**（自前の揺れ/パンチ挙動を握るため）。

---

## 9. オーディオ設計（第二の難所）

現行はWebAudio合成（ステレオ/飽和/ピンポンディレイ/サイドチェイン/128-154BPM四つ打ち/左右独立アンプの本物ダブルトラッキング）。Unityに直接の合成グラフは無い。

| 方式 | 内容 | 採否 |
|---|---|---|
| **A. ベイク（主）** | 現行JSを**オフラインレンダリング**（OfflineAudioContext→WAV）で楽曲ループ/ステムとSFXを書き出し、`AudioSource`＋`AudioMixer`で再生 | **採用** |
| B. `OnAudioFilterRead`（副） | C#でオシレータ/エンベロープ/フィルタを再実装しサンプル合成（WebAudio相当） | 必要時のみ |

- **楽曲**: 強度層（`setIntensity`）が要るので**ステム別**（ドラム/ベース/ギターL/R/パッド）で書き出し、`AudioMixer` のボリューム/スナップショットで層を出し入れ。**サイドチェイン**はキックトリガの ducking（Mixer の send + 自動化 or 簡易スクリプト）で再現。
- **SFX**: クリップ化。`hit/crit/kill/bang/dash/gong/...` のピッチ揺らぎ（`G.rand`）は `AudioSource.pitch` で実行時付与。throttle（`THROTTLE` 表）は C#側で同名移植。
- **空間**: 現行は擬似ステレオのみ。モバイルはモノ寄りでも可。必要なら 2D パンを軽く。
- 注意: `OnAudioFilterRead` はオーディオスレッド実行＝**割当て禁止/ロック注意**。Bを採るのは「ベイクで質感が出ない」と判明した部分だけに限定。

---

## 10. UI 設計

- **UI Toolkit (UXML/USS)** を採用。現行の `index.html` 各画面＋`style.css` が UXML+USS に**近直訳**できる（retained＋CSS風）。
- 画面: `title / settings / levelup / pact / hono(奉納) / forge(鍛錬) / codex(絵巻) / pause / over / win` ＋ `chest` オーバレイ。`GameState` で表示制御（現行 `UI.show` 相当）。
- **データ駆動リスト**（レベルアップ3択・鍛錬グリッド・絵巻・宝箱）は要素を動的生成（現行 innerHTML 生成に対応）。
- **HUD**: 体力/時間/討伐/魂/奥義・技・結界のクールタイム/提灯滞在段階★ をオーバレイ。
- **pendingパターン**（現行の「描画前に状態反映」）は UI Toolkit の rebuild/bindで再現。`設定`の**無敵/2倍速トグル**もそのまま移植（`G.timescale`/god 接続・保存キー `testGod/testFast`）。
- **モバイルUX**（§11）: 仮想スティック＋自動照準を HUD に統合。

---

## 11. 入力設計

| 操作 | PC | ゲームパッド | タッチ(モバイル) |
|---|---|---|---|
| 移動 | WASD | 左スティック | **仮想スティック** |
| 照準 | マウス | 右スティック | **自動照準**（既存武器は最寄り狙いが主体）/任意で右スティック |
| 奥義 | Space | ボタン | HUDボタン |
| 技 | Shift | ボタン | HUDボタン |
| 結界 | Q | ボタン | HUDボタン |
| 一時停止 | Esc/P | Start | HUDボタン |
| 選択 | 1/2/3・クリック | 十字/A | タップ |

- **Input System** のアクションマップ1本でPC/パッド/タッチを束ねる。
- モバイルは照準をデフォルト自動（現行武器のauto-aim設計と整合）。手動照準は右スティック/ドラッグをオプション。

---

## 12. 永続化設計

- `Core/SaveStore`: 現行 `G.store.get/set(key,val)`（localStorage JSON）を **`persistentDataPath/save.json`** のキー値辞書で再現（同一API）。
- キー一覧（現行流用）: `koban / charsOwned / weaponsOwned / stagesClear / charForge / weaponForge / skillForge / achieved / codexFoes / life / lastStage / lastChar / lastUlt / lastSkill / hono / volBgm / volSfx / muted / testGod / testFast`。
- 旧Web版からの移行は不要（別プラットフォーム）。スキーマは互換に保つ。

---

## 13. ゲームフィール保全チェックリスト（**そのまま移植する定数**）

これらは「触ると手触りが変わる」ため厳密移植：

- `H=1/60`, `G.GAME_SPEED`, `G.timescale`, slowmo/hitstop 各時間, `maxSteps` 式
- `ANIM_T=1.5`（キャラ）, `BOSS_ANIM_T=4`（ボス）, `TIME_COMP=2.5`
- カメラ: `cam.follow` の padX/padY（壁際中央寄せ）, `add`(揺れ)/`punch`(ズーム)量
- juice gate: `juiceGap`, `_boomT`, `_stopT`, `_crowdT`, `_mkRingT`（後半の揺れ間引き）
- 撃破/会心の hitstop 量・しきい（`final>80` 等）, `flushKills` の集計しきい(≥5,≥16)
- 爆散: `superKill` 条件(`overkill>=70 && okRatio>=1.5`)、`FAN90=cos45°`(前方90°扇)、power式、死体パラメータ
- 敵AI: charge/slam の `wind*TELE_WIND_MUL(1.3)`、扇判定、range維持
- 出現: `maxAlive=min(322,36+0.252t)`(中盤3/5・終盤3/4), `batchN`, `spawnInterval`
- 提灯 dwell 段階, ward, forge 曲線, synergy 効果量

→ これらは `Data/Balance.cs` と各 Sim に**コメント付きで定数化**。パリティ検証(§16)で監視。

---

## 14. データエクスポータ設計（転記事故の排除）

`data.js`（1,105行）を**手で写さない**。

1. `Tools/data_export`：Node/ブラウザで `js/data.js` を読み、`D.*` を **JSON** にシリアライズ（関数=曲線は値テーブル化 or C#側に手移植する少数のみ別管理）。
2. Unity 側 `Data/DataLoader`：起動時にJSONを読み、または **エディタ拡張で ScriptableObject 群を生成**（推奨＝インスペクタで調整盤的に触れる）。
3. 曲線関数（`hpScale/dmgScale/spawnInterval/batchN/maxAlive/cost`）は数が少ないので `Balance.cs` に手移植し、**エクスポータ側と値一致を自動テスト**。

→ バランス変更は今後も `data.js`→再エクスポートで同期でき、Web版とUnity版の二重管理を避けられる。

---

## 15. 段階移行計画（マイルストーン）

| Phase | 内容 | 完了条件（Definition of Done） |
|---|---|---|
| **0. 実証** | 空2Dプロジェクト＋MCPブリッジ＋`data.js`→ScriptableObject＋Batch2Dでプレイヤー1体＋敵1体が動く最小シーン | エディタで「移動する人型＋追尾する敵」が60Hz自前ループで動く。手触りの素地確認 |
| **1. コアループ** | プール/空間ハッシュ/敵出現(director)/初期武器1種/被弾/XP/レベルアップ3択 | 1ステージを1武器で生存〜被弾死まで遊べる。Web版と出現数・与ダメがパリティ |
| **2. 戦闘の幅** | 全初期武器＋スキル抽選＋calcW/recomputeStats＋会心/ノックバック/死体/**爆散(前方扇)** | 主要ビルドが成立。撃破演出パリティ |
| **3. 敵AI多様化** | chase/sine/hop/swoop/ranged/drift/douse＋**charge/slam(予告・結界防御)** | 予告→発動、結界札で防御、扇当たり判定パリティ |
| **4. 機構** | 提灯(dwell)/結界/油赤子/鍛錬/相乗(7種)/奥義/技/秘術/契り(夜契リ)/月相 | 各機構がWeb版同等に動作 |
| **5. ボス** | 6ボス＋ロジック(濡女trail/鵺落雷/牛鬼telegraph等) | ボス戦パリティ |
| **6. 描画/音/UI仕上げ** | URP Light2D＋Bloom、fx全移植、音ベイク、UI Toolkit全画面、HUD | 見た目・音・UIが要件水準 |
| **7. モバイル** | タッチ操作、解像度/DPI、Android書き出し、保存、(広告/課金は任意) | 実機APKで通し遊技可能 |
| **8. 最適化/QA** | バッチ最適化、プロファイル、PlayModeテスト、パリティ回帰 | 目標FPS達成・回帰ゼロ |

- **各Phase末にコードレビューAgentを立てる**（型境界/アトミック性/サイレント失敗/プール初期化漏れ/境界条件）＝CLAUDE.md方針。

---

## 16. 検証戦略

1. **Web版＝参照オラクル**: 同seed/同条件で「ダメージ式・出現数・曲線・扇判定・爆散」を数値比較。Sim層が純C#なのでテスト容易。
2. **パリティ・ハーネス**(`Dev/ParityHarness`): 主要シナリオ（超過撃破の前方扇命中、slam回避/結界防御/詠唱中撃破不発、maxAlive中盤/終盤比、charge溜め=wind×1.3）を**自動で数値検証**。現行のPlaywright検証項目をPlayModeテストへ移植。
3. **PlayModeテスト**: プール初期化漏れ・null・例外ゼロを担保。
4. **体感QA**: フィール定数(§13)を変えていないか、Web版と並走比較。

---

## 17. リスク登録簿

| リスク | 影響 | 緩和策 |
|---|---|---|
| 描画再設計の工数膨張 | 大 | **Batch2D で `ctx.*`→`Draw.*` 近直訳**にして“描き方”を固定。Phase0で確証 |
| 音響の質感劣化 | 中 | ベイク＋ステム＋Mixer。質感未達部のみ `OnAudioFilterRead` |
| プール初期化漏れ（再利用バグ） | 中 | `Reset()`集約＋PlayModeテスト＋レビューAgent |
| URP 2D照明が現行の見た目と違う | 中 | 初版URP、未達なら destination-out 相当のRT合成へ切替 |
| モバイル性能（多数スプライト+加算fx） | 中 | 単一メッシュ・アトラス・加算は別バッチ1回、fx密度ゲート維持 |
| バランス二重管理 | 中 | data.js→自動エクスポートを唯一経路に |
| MCP未接続で着手不可 | 小 | §19の手順でブリッジを先に立てる |

---

## 18. 工数見積り（目安・私の支援込み）

| 区分 | 目安 |
|---|---|
| Phase 0（最小実証） | 数日 |
| Phase 1–3（遊べるコア〜AI多様化） | 1〜2週間 |
| Phase 4–5（全機構＋ボス） | 2〜4週間 |
| Phase 6–8（仕上げ/モバイル/QA） | 2〜4週間 |
| **合計（機能完備の忠実移植）** | **概ね 1〜2か月規模**（週末1回で終わる量ではない） |

ロジック/データ（約4千行）は速い。**描画約4,500行と音1,200行が時間軸を支配**する。

---

## 19. Phase 0 を始めるための前提（MCP接続）

現状 **UnityMCP インスタンス0・coplay「エディタ未起動」**＝私はまだUnityを操作できない。有効化手順：

1. Unity Hub で **6000.4.x** の新規 **2D (URP)** プロジェクトを作成
2. **MCPブリッジパッケージ**（UnityMCP / coplay のUnity側）を導入、エディタを起動したまま
3. `mcpforunity://instances` に出れば、私が `create_script`/`execute_script`/`create_scene` で Phase 0 に着手

→ 接続できれば **「`data.js`→ScriptableObject ＋ Batch2D でプレイヤー＋敵が動く最小シーン」**を私がこの場で生成し、移植の現実性を“動く形”で確証する。

---

## 20. 未決事項（要判断）

| 項目 | 選択肢 | 暫定推奨 |
|---|---|---|
| 描画の敵描画方式 | 単一動的メッシュ / プールSpriteRenderer | **単一メッシュ(Batch2D)**（移植が直線・最速描画） |
| 照明 | URP Light2D / destination-out相当RT | **URP Light2D**（未達なら切替） |
| 音 | 全ベイク / 一部ランタイム合成 | **ベイク主体** |
| RNG | 非シード / シード固定 | 非シード（パリティ厳密化時に切替） |
| 配信初手 | Web併存維持 / Unity一本化 | **Web併存**（itch.ioはWeb、PlayはUnity） |
| 収益化 | なし / 広告 / 買い切り | 後日（Phase7以降） |

---

### 付記
- 本書の数値・挙動の真実源は現行 `js/`。差異が出たら**現行コードが正**。
- 私が直接着手できるのは **Unity（MCPブリッジ接続後）**。Godot にはこの環境にMCPが無い。
- まず §19 の接続を立て、**Phase 0 の最小実証**から始めるのが最小リスク。
