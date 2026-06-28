# WEB_FUTUREPROOF — Web版を「将来の正」として進める設計

> 目的: UnityMCPの作業効率が悪く継続性を損ねるため、**Web版(js/)を単一の正(source of truth)に戻し**、
> それでも Android / Steam / 課金 など将来の配信目標に届く進め方を定義する。
> 結論: **Web主軸は現実的**。Unityが本当に必要なのは「最底辺モバイルの生性能で詰んだ時」だけで、それは*測ってから*判断する。
>
> 抽出日: 2026-06-21 / 前提: [[unity-port-eval-2026-06-17]] [[visual-overhaul-2026-06-21]]

---

## 0. 現状棚卸し（実地調査の結果）

| 項目 | 実態 |
|---|---|
| Web版 描画 | **Canvas2D**。本体 `E.ctx` ＋ 光 `E.lctx` ＋ **bloom `E.bctx`** の多重canvas合成＝**bloom/ライティングは既に実装済**（"演出のためUnity"は不要） |
| 描画の結合度 | `ctx.` 呼び出し **約970箇所**（entities 330 / ui 283 / main 152 / engine 143）。**描画とロジックが密結合**＝描画層の差し替えは一括では効かない（後述） |
| 祓印(hmark)システム | **Unity専用**。Web の `harai` は大半が**百鬼祓いの奥義**で、0-3段コンボ通貨(hmark)は js/ に無い |
| 新得物 | **乖離(diverged)**。data.js にデータ21箇所はあるが、発火ロジックは版で別物。例: 注連縄=Webは回転掃き(`snArms/snLen`) / Unityは直交拘束縄。多くの新武器の発火はUnity専用 |
| 今日の視覚刷新 | **Unity専用**（IconGen v2 レア度額装 / 自作FX行 斬撃・雷・祓い光 / 弾トレイル） |
| 編集体感 | Web=Claude/Codex が素直・Playwright で即検証。Unity=MCPブリッジ断・ドメインリロード待ち・撮影不安定（本セッションで実証） |

**結論**: 両版は片方が他方の上位互換ではない。**Web=滑らかな土台だが祓印/最新視覚を欠く / Unity=それらを持つが作業が重い**。Web主軸に戻すなら「移し戻し(統合)」が要る（量は限定的・JSが原語なので楽）。

---

## 1. 将来性アーキテクチャ（書き直さず“届く”構成）

ゲーム本体は**純JSのまま**。配信先ごとに**ラッパー**を被せるだけ。

| 配信目標 | 手段 | 状態 |
|---|---|---|
| itch.io | HTML5 をそのまま | 今すぐ可 |
| **Android(Google Play)** | **Capacitor**: WebView を APK/AAB 化。保存/課金(Play Billing)/広告(AdMob)/通知はプラグイン | 本命。要・実機性能測定 |
| PC / Steam | **Tauri**(軽量) or Electron でデスクトップ化 | 中期 |

### 設計原則（“将来性”の肝）
1. **ロジックは描画/プラットフォーム非依存に寄せる**（sim内で `ctx`/DOM を直接触らない）。※現状は密結合なので「新規コードから守る／触る所だけ薄く剥がす」漸進方針。一括リファクタはしない。
2. **`platform.js`** を1枚: 保存(localStorage↔native)・入力(kbd/touch/gamepad)・音 を抽象化 → 各ラッパーが差を吸収。
3. **描画は当面 Canvas2D 据置**。WebGL/Pixi 化は **#3 の実機測定で60fpsが出ない時だけ**（970 ctx を投機的に剥がさない＝過剰最適化回避）。

---

## 2. 配信ロードマップ（measure-first）

```
[今] itch.io(HTML5)  ── 既に配信可
      │
[次] Capacitor で実機APKを1本 ── ★まずこれ。中位/低位Androidで体感fpsを測る
      │      ├─ 60fps圏内 → そのまま Play 申請準備(課金/保存プラグイン)
      │      └─ 重い      → 描画層のみ WebGL/Pixi 化(ロジック不変)
[後] Tauri/Electron で Steam
```
**先に大改修しない。実機で詰まって初めて WebGL に投資する**（壁の高さを測ってから動く）。

---

## 3. Unity→js 移し戻し計画（Web主軸にする場合）

JSが原語なので C#→JS は素直。**“統合”であり単純コピーではない**点に注意（版が乖離）。

| 移す物 | 元(Unity) | 方針 |
|---|---|---|
| **祓印システム** | `CoreSim` の hmark/hmarkT・AddHarai/HaraiBonus/HaraiPurge・被ダメ倍率・各得物の付与/消費フック | コアmechanicとして最優先。entities/systems に hmark 層を新設(既存 curse/mark と別層) |
| 新得物の挙動 | FireShimenawa/FireHenbai/FireMandala/FireNorito/FireKagami/FireSanshu/FireMihashira ほか | **どちらの設計を正とするか要決定**（例: 注連縄=回転掃き or 拘束縄）。欲しい挙動だけ移植 |
| 視覚アイデア | IconGen v2(レア度額装) / 自作FX(斬撃/雷/祓い光) / 弾トレイル | Webは sprites.js(焼き) ＋ Canvas2D。**レア度枠は icon 描画 or アトラスに反映、加算FXは bloom canvas で再現**(機構は既にある) |
| バランス | data.js | **既に Web 側が正**。Unity は JsonUtility で読むだけ＝移行不要 |

> 量の目安: 祓印コア＋主要な新武器数種＋視覚の要点で、Webの編集速度なら現実的な範囲。全部を急がず「遊びに効く順」。

---

## 4. 推奨実行順（おすすめ）

1. **Capacitor で実機APKを1本**ビルド → 中位/低位Androidで fps 測定（**性能リスクを最初に潰す**＝以降の判断が全部これで決まる）
2. **得物の正典を決める**（Web実装 / Unity実装 のどちらを採るか、武器ごと）
3. **祓印システムを js/ に移植**（最も“効く”最新mechanic）
4. **`platform.js`** で保存/入力/音を抽象化（Capacitor連携の土台）
5. WebGL化は **#1で必要と出たときだけ**

## 5. 正直なトレードオフ
- 失う物: 最底辺モバイルの生性能 / “標準的”ストア・コンソール統合の楽さ。あなたの規模(itch＋Play＋ことによるとSteam)なら Web+ラッパーで到達域。
- 得る物: **開発速度と継続性**（折れない）。ソロ開発では一級の資産。
- Unity資産は捨てない: `HyakkiUnity/` は保険として温存（Android性能で詰んだ時の再評価先）。
