# 百鬼夜行サバイバーズ — ヴァンサバ系ギャップ分析レポート

`deep-research / 2026-06-18 / mode: deep`

## エグゼクティブサマリ

ヴァンサバ系（bullet heaven / survivor-like）の設計・構造・プレイヤー体験を調査し、本プロジェクトの現状（Web版＋Unity移植）と突き合わせて「足りないもの」を洗い出した。

**最重要の所見:** 本プロジェクトの不足は「メカニクスの不足」ではない。むしろ逆で、初期武器固定＋スキル抽選＋宝具＋覚醒＋隠し相乗＋提灯滞在段階＋鍛錬＋奉納＋夜契リ＋月相と、**本家ヴァンサバ（武器6＋パッシブ6＋進化）より systems が多い**。したがってジャンルの典型的失敗「奥行き不足」には当たらない。当たるのは**反対側の失敗＝「過剰な複雑さ／目標の不明瞭さ／scope creep」**である[13][14][15]。

その前提で、本当に足りないのは次の6点（優先順）:
1. **コンテンツ量**（使い手3／舞台3／ボス6）— ジャンルのリテンションは第一にコンテンツ量で駆動される[4][6]。
2. **発見・秘密・objective の広がり**（実績9止まり）— 本家は「隠し相互作用＋数百の目標」が中核リテンションエンジン[4][6]。
3. **エンドレス／クリア後の到達度（スコア追い）**— 夜明けクリアで終わると「もう一度」の動機が弱い。本家は Reaper＋Endless サイクル[5]。
4. **音響**（Unity版未移植）— ジャンルは聴覚フィードバック（撃破音／回収チャイム／LvUPファンファーレ）に大きく依存[1]。
5. **自分の多systemsを教える導線＆ビルド目標の可視化** — 過剰複雑の緩和。隠し相乗は発見性◎だが「何を目指すか」が見えにくい。
6. **アクセシビリティ／QoL＆モバイル・リテンション**（Android狙い）— 揺れ/点滅/ダメージ数字トグル、auto-aim付きタッチ、公正なデイリー/シード[8][9][18][19]。

---

## 序論（スコープ・方法・前提）

- **スコープ**: ヴァンサバ系の (a) コアループと「意味ある選択」、(b) ラン構造/ペーシング、(c) メタ進行/リテンション、(d) 進化・相乗、(e) コンテンツ量/発見、(f) ゲームフィール/可読性/QoL、(g) モバイル設計 を調査し、本プロジェクトの不足を特定する。
- **方法**: 組み込み Web 検索で 8 クエリ・19 出典を収集し三角検証。本プロジェクトの現状は既知のコード/設計（memory・実装）から記述。主張は出典[N]で裏付け、設計判断は「推測」と明記。
- **前提（材料性の高い仮定を明示）**:
  - 想定読者＝開発者本人（Indie）。技術前提あり。
  - プラットフォーム第一目標＝**Android ネイティブ**（Unity移植）。itch.io はWeb版。
  - **方針: 堅実・ダークパターン回避・個人開発（過剰拡張を避ける）**（ユーザCLAUDE.md準拠）。よって収益化は射幸性でなく「公正な関与」を前提に評価。
  - 本プロジェクトの現状認識（Web版＝完成度高、Unity版＝UIをuGUI+TMP化済・**音源のみ未移植**）。

---

## 主要分析

### F1. コアループは充足。ジャンルの肝＝「数秒ごとの報酬」と「弱→神の全能感」
本家は単一動詞（移動）＋自動攻撃＋XP/Lv/3択で、**数秒も間を空けず良いことが起きる**（XPドロップ→Lv→3択→宝箱）構造に最適化されている[1]。マグネット（魂寄せ）が「蓄積を可視の洪水に変える」ドーパミン設計の象徴[1]。
→ **本プロジェクトは充足**: 移動＋自動攻撃＋XP/Lv/3択抽選＋魂寄せの環（磁石）を実装済。コアは健全。

### F2. 「意味ある選択」＝ビルド構築。本家は武器6＋パッシブ6・進化・相乗で巨大な組合せ空間
本家は最大6武器＋6パッシブ、Lv8で進化（武器＋触媒パッシブ＋10分後の宝箱）[7]、32武器で6.5億通り[8]。**進化は明確な「ビルド目標」**として各ランを駆動する[3][7]。
→ **本プロジェクトは別モデル**: 初期武器固定（晴札/鈴縄/無月残月・交換なし）＋スキル抽選（全20種・累積・再取得Lvアップ）＋宝具＋**覚醒（＝進化相当：対の宝具を最大Lv）**＋**隠し相乗7種**。質的差・発見性は良いが、(a) 相乗が7種と少なめ、(b) 進化/相乗が**隠し＝「何を目指すか」が画面上で見えにくい**（本家は進化レシピが攻略目標として機能[3]）。

### F3. リテンションの第一柱＝メタ進行とコンテンツ量
ジャンルはメタ進行＋「数百の objective・追うべき gear・**隠し相互作用が体系的実験を報いる**」でリテンションする[4][6]。本家は165キャラ・32武器・秘密ステージ・秘密メニュー・10万体撃破等の長期目標[10][11]。
→ **本プロジェクトの充足**: 鍛錬（使い手/得物/技 Lv最大100）・奉納（小判で永続強化）・夜契リ・月相＝メタは厚い。**不足はコンテンツ量と objective 数**: 使い手3（本家48基本）・舞台3・ボス6・実績9・絵巻25。**「追い続ける理由」の広がりが薄い**。

### F4. ラン構造＝時限＋クリア後のエスカレーション
本家は30分（一部15分）時限→上限到達で Reaper、さらに **Endless モード（サイクルで敵+HP/出現/ダメージ）**で無限延長[5]。
→ **本プロジェクト**: 夜明け（runLen）で勝利。**クリア後のエンドレス/魔王化やスコア・自己ベストが無い**＝「もう一度深く」の牽引が弱い。

### F5. 発見・秘密＝最大級の低コストリテンション
本家は秘密キャラ/ステージ・イースターエッグ・「playしてれば大半が解禁」される膨大な解禁網[10][12]。
→ **本プロジェクト**: 実績9（→使い手2解禁）＋絵巻25。**秘密/イースターエッグ/長期 objective が薄い**＝ジャンルで最も費用対効果の高いリテンション源を取りこぼしている。

### F6. 失敗パターンは「単調反復・目標不明瞭・過剰複雑・未調整」
変化/報酬の乏しい反復、不明瞭な目標、scope creep（機能の盛りすぎ）、playtest不足、無革新が定番の失敗[13][14][15]。
→ **本プロジェクトの固有リスク**: systems が本家より多い分、**「過剰複雑・目標不明瞭」側のリスク**が高い。新規機能の追加より、**既存systemsの教示と目標可視化**が効く。

### F7. ゲームフィール／可読性／アクセシビリティ
本家は撃破音・回収チャイム・LvUPファンファーレで体感を作る[1]一方、**画面過密で自機を見失う**問題があり、**揺れ/点滅/ダメージ数字トグル・高コントラスト・読みやすいフォント・片手操作**を用意[7-feel][18][19]。
→ **本プロジェクト**: ジュース（shards/impact/hitstop/カットイン）＋**照明オーバレイで自機が闇に浮く＝可読性はむしろ強み**。だが **(a) Unity版は音が無音（最大の体感欠落）、(b) アクセシビリティ/QoLトグル（揺れ/点滅/ダメージ数字/コントラスト）が未整備**。

### F8. モバイル（Android）設計＝タッチ＋auto-aim＋公正なリテンション
Survivor.io は joystick＋auto-aim＋「ゲームループを1つずつ解禁して摩擦前に楽しませる」進行＋デイリー/liveops で3年後も月$5M[8][9]。
→ **本プロジェクト**: タッチHUDあり（要・実機検証）。**デイリー/週替わり/シード等の公正な再訪フックが無い**（射幸性は不要だが「今日の夜」のような公正な日替わりは有効）。

---

## 統合と洞察

- **本プロジェクトは「奥行き不足のクローン」ではなく「systems 過多・content 過少」**。VS系の標準処方（＝もっとメカ追加）は**逆効果**。打つべきは「**コンテンツ・objective・クリア後到達度・教示・音・QoL**」。
- **隠し相乗(7)は諸刃**: 発見性は本家の「隠し相互作用」哲学と一致[4]し正しい。しかし**数が少なく、目標として可視化されない**。→ 相乗/覚醒を増やし、**発見済みを絵巻化（recipe codex）**して「次はこれを狙う」を作るのが最小コストで最大効果。
- **照明＝差別化資産**: 可読性（自機を見失う）はジャンル共通の弱点[7-feel]だが、本作の destination-out 照明は**自機可読性を構造的に解決**しており、強みとして押し出せる。
- **Android 第一目標なら音とQoLは「任意」でなく「必須」**: 無音＋a11yトグル無しはストア評価に直結。

---

## 推奨（優先順・効果/工数）

| # | 施策 | なぜ（出典） | 効果 | 工数 |
|---|---|---|---|---|
| 1 | **音響をUnity移植**（撃破/会心/回収/LvUP/ボス/BGM強度層） | 体感の中核[1]。現状無音 | 大 | 中〜大（既知の最終項目） |
| 2 | **クリア後エンドレス＋自己ベスト/スコア** | 「もう一度深く」の牽引[5] | 大 | 中（runLen後にサイクル＋HP/出現スケール、score保存） |
| 3 | **objective を9→数十へ＋秘密/解禁網を厚く** | 最大級の低コストリテンション[4][6][10] | 大 | 中（実績/解禁条件の量産。既存achieveインフラ流用） |
| 4 | **相乗/覚醒を増やし「発見済みレシピ絵巻」を追加** | ビルド目標の可視化＋発見性[3][4] | 中〜大 | 中（既存synergy/codex流用、recipe表示の新規） |
| 5 | **アクセシビリティ/QoLトグル**（揺れ/点滅/ダメージ数字/コントラスト/UI拡大） | ジャンル標準・モバイル必須[18][19] | 中 | 小（既存fxにゲート追加。設定画面に） |
| 6 | **コンテンツ量**（使い手＋2〜4／舞台＋1〜2／ボス追加） | リテンションの第一柱[4][6] | 大 | 大（アート/バランス。立ち絵パイプライン流用） |
| 7 | **モバイル: 仮想スティック＋auto-aim 一級化＋公正なデイリー/シード** | Android リテンション[8][9] | 中 | 中（タッチHUD実機検証＋日替わりseed） |
| 8 | **初回オンボーディング（体験的・テキスト最小）＋ビルド目標の最初の提示** | 過剰複雑の緩和[13][14] | 中 | 小〜中 |

**やらない方が良いこと（重要）**: 新しいメタ system（第8の機構）を足すこと。本作は既に systems 過多側。**「機構を増やす」より「各機構のコンテンツ・目標・教示・体感（音）を満たす」**方がジャンルのリテンション原理[4][6]と失敗回避[13][14]の両面で正しい。

---

## 限界・留意

- Web検索は二次情報（攻略wiki/解説/レビュー）中心で、一次の開発者談話は限定的。数値（165キャラ等）はDLC込みで版により変動。
- 「本プロジェクトの現状」は実装/設計知識ベースの記述で、最新コードと差異の可能性。特に「タッチ操作の完成度」「現行runの正確なrun長/勝利条件」は要・実機確認。
- リテンション施策の効果量はジャンル一般論であり、本作固有の検証（プレイテスト）が必要。

---

## 出典（Bibliography）

1. kokutech — Vampire Survivors Design Analysis: Power Fantasy. https://www.kokutech.com/blog/gamedev/design-patterns/power-fantasy/vampire-survivors
2. Lost Attic Games — How VS Made Me Rethink the Core Gameplay Loop. https://www.lostatticgames.com/post/how-vampire-survivors-made-me-rethink-the-concept-of-the-core-gameplay-loop
3. egamersworld — VS Evolution Guide: Pairing & Best Builds. https://egamersworld.com/blog/what-to-pair-vampire-survivors-evolution-guide-NV539Y8B_F
4. Wikipedia — Vampire Survivors–like. https://en.wikipedia.org/wiki/Vampire_Survivors%E2%80%93like
5. Steam Community — Is 30 minutes the maximum time limit? / Endless. https://steamcommunity.com/app/1794680/discussions/0/3734079567829009940/
6. Rogueliker — Bullet Heavens / games like Vampire Survivors. https://rogueliker.com/bullet-heaven-games-like-vampire-survivors/
7. Vampire Survivors Wiki — Evolution. https://vampire.survivors.wiki/w/Evolution
8. Global Games Forum — How Survivor.io pulls in $5M a month. https://www.globalgamesforum.com/news/how-survivor.io-continues-to-pull-in-5-million-a-month-three-years-later
9. Gamigion — Survivor.io: The "Progressive" Monetization Masterclass. https://www.gamigion.com/survivor-io-the-progressive-monetization-masterclass/
10. Game Rant — Vampire Survivors: All Unlocks. https://gamerant.com/vampire-survivors-item-unlocks-characters-weapons-accessories-stages/
11. Game Rant — VS: The 28 Best Weapon Combinations. https://gamerant.com/vampire-survivors-best-weapon-combinations/
12. PCGamesN — How to unlock secret characters. https://www.pcgamesn.com/vampire-survivors/unlock-characters
13. RetroStyle Games — What's Wrong with Survival Games and How to Fix. https://retrostylegames.com/blog/whats-wrong-with-survival-games-and-how-can-they-be-fixed/
14. Game-Developers.org — Pitfalls / Common Mistakes in Game Dev. https://www.game-developers.org/pitfalls-in-game-development-common-mistakes-game-developers
15. Cliffski (Positech) — Common mistakes by indie game developers. https://www.positech.co.uk/cliffsblog/2021/10/14/common-mistakes-by-indie-game-developers/
16. Critback — Accessibility Deepdive: Vampire Survivors. https://www.critback.com/accessibility-vampire-survivors/
17. Family Gaming Database — Vampire Survivors Accessibility Report. https://www.familygamingdatabase.com/accessibility/Vampire+Survivors
18. The Arcade Artificer — The Secret Sauce of Vampire Survivors. https://jboger.substack.com/p/the-secret-sauce-of-vampire-survivors
19. Nat Rowley — The Addictive Nature of Vampire Survivors. https://www.natrowley.com/the-addictive-nature-of-vampire-survivors/

## 方法論付記

- 検索8クエリ（コアループ/ジャンル規約/進化・相乗/ラン構造/コンテンツ・秘密/失敗パターン/モバイル/ゲームフィール）。出典19、独立クラスタ複数で三角検証。
- 本作の現状はコード/設計知識から記述（一次）。施策の効果量はジャンル一般論（要プレイテスト）。
- mode=deep（Web検索＝Claude組み込み、第三者API/キー不使用）。PDF/HTML出力は weasyprint 未導入のため Markdown のみ。
