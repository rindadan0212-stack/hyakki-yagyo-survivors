# 百鬼夜行サバイバーズ — アイコン & エフェクト 生成ブリーフ（GPT用）

このファイルは **アイコン（武器/技/加護など）** と **まだ素材化していないエフェクト** を
GPT（または任意の画像生成）に描かせるための仕様書。`assets/ART_BRIEF.md` の姉妹版。

- `ART_BRIEF.md` … キャラ/ボス/雑魚の**全身スプライト**用（`p_* / b_* / e_*`）
- **このファイル … ① UIアイコン（`ic_*` / `buff_*`）と ② 戦闘エフェクトのアニメ連番（`assets/fx/`）**

> 画風の一貫性ルール（アンカー1枚を固定 → 全部それを参照入力にする → STYLE SUFFIX を一字も変えない）は
> ART_BRIEF.md §0 と同じ。**アイコンはアイコンで1枚アンカー、エフェクトはエフェクトで1枚アンカー**を先に確定する。

---

# PART A — アイコン（武器/技/加護/能力）

## A0. 現状と方針（重要）

- ゲームのアイコンは現在 **28×28 の手続き描画**（`js/sprites.js` の `icon(name, fn)`、4x焼き）。
  暗い角丸パネル `#161a28` ＋ 細枠 `#2e3650` の上に紋様を描く形。
- **現状アイコンは manifest.json に載っていない＝ラスター差替が未配線。** 生成画像を使うには
  manifest 追記（＋透過シンボル方式なら枠描画を1行）が要る。**それは素材が揃ったらこちらで配線する**（PART C）。
- **推奨フォーマット ＝「透過背景にシンボルだけ」**。枠（暗パネル＋ボーダー）はゲーム側で描く方式に寄せる。
  → GPT は紋様の作画に集中でき、枠が全アイコンで完全に揃う。
  （代替：枠ごと焼き込んだ不透過アイコンでも可。その場合は下のパネル色/枠色を画像内に再現する。）

## A1. アイコンの画風（STYLE）＋ 接尾辞

- **1アイコン＝1モチーフ**。和の道具/呪具を**真上やや手前の俯瞰**で1つだけ。説明的にしない。
- **極小（28px）で読める**こと最優先 → 太いシルエット、要素を1〜2個に削る、細密装飾は禁止。
- **無彩〜藍を土台に、系統アクセント色を“点”で**（下表の色を1色だけ効かせる）。
- 左上からの淡い光、縁にうっすら冷青のリム（暗背景で浮く）。**文字・枠線・influence透かしは入れない**（枠はゲーム側）。

### ICON STYLE SUFFIX（全アイコンのプロンプトに連結・固定）
```
, single Japanese folk-ritual object icon, one bold centered motif, top-down 3/4 view,
hand-painted semi-painterly game icon, thick readable silhouette readable at tiny 28px size,
muted indigo-and-slate base with ONE accent color used sparingly, soft upper-left light,
faint cool blue rim on the silhouette, transparent background, no panel, no border, no text, no frame,
consistent with the reference icon style
```
- 不透過パネル込みで作る場合のみ：`transparent background, no panel` を外し
  `, on a dark rounded square panel #161a28 with a thin #2e3650 border` を足す。

## A2. 技術仕様（OUTPUT）

| 項目 | 指定 |
|---|---|
| 形式 | PNG・**背景完全透過**（推奨：シンボルのみ） |
| 解像度 | 256〜512px 正方形で生成（こちらで28pxに正規化、滲み無し） |
| 構図 | モチーフ中央・上下左右に均等余白。極小で潰れない**太い形** |
| 命名 | **`ic_<id>.png`**（武器）/ `buff_<id>.png`（加護）。下表の id を厳守 |
| 反映 | `assets/sprites/raw/` に置く → manifest 追記（PART C）→ ブラウザ再読込 |

## A3. 武器アイコン カタログ（30種・最優先）

> 系統アクセント色（`D.TAGINFO`）：祓印`#ffd166` / 射撃`#7fb8ff` / 斬撃`#cdd6e6` / 雷`#9fe6ff` / 結界`#ffb86b` / 守り`#a7d18b` / 音`#e0a6ff` / 罠`#d2a273` / 移動`#86e3c2` / 灯`#ffe7a0`。
> 各 PROMPT に **ICON STYLE SUFFIX** を連結。

| ファイル | 武器(系統) | PROMPT（英）＋ 和の意図 | accent |
|---|---|---|---|
| `ic_ofuda.png` | 破魔の御札(祓印/射撃) | a paper o-fuda talisman with a red seal stamp — 朱印の呪符 | `#ffd166` |
| `ic_katana.png` | 太刀「燕」(斬撃) | a swift drawn tachi sword with a swallow-tail motion streak — 抜き身の太刀＋燕 | `#cdd6e6` |
| `ic_fox.png` | 式神・白狐(守り) | a curled white fox spirit (shikigami), blue flame at tail — 巻き尾の白狐 | `#a7d18b` |
| `ic_raitei.png` | 雷霆符(雷) | a talisman crackling with a lightning bolt — 雷をまとう呪符 | `#9fe6ff` |
| `ic_kitsunebi.png` | 狐火(射撃) | a single floating blue foxfire flame, eye-like core — 蒼い鬼火 | `#7fb8ff` |
| `ic_kamaitachi.png` | 鎌鼬の風(斬撃) | a crescent wind-blade / sickle of wind, swirl lines — 風の鎌 | `#cdd6e6` |
| `ic_kekkai.png` | 浄化の結界(結界) | a glowing hexagonal ward barrier ring — 浄化の結界陣 | `#ffb86b` |
| `ic_juzu.png` | 大数珠(射撃) | a large loop of prayer beads (juzu) — 大数珠の輪 | `#7fb8ff` |
| `ic_bonsho.png` | 梵鐘(音) | a bronze temple bell (bonsho) with sound rings — 梵鐘＋響き | `#e0a6ff` |
| `ic_hamaya.png` | 破魔矢(射撃) | a white-feathered ritual demon-breaking arrow — 白羽の破魔矢 | `#7fb8ff` |
| `ic_komainu.png` | 狛犬(守り) | a stone guardian lion-dog (komainu) head, fierce — 石の狛犬 | `#a7d18b` |
| `ic_shuriken.png` | 手裏剣(射撃) | a four-point steel shuriken star — 手裏剣 | `#7fb8ff` |
| `ic_kusarigama.png` | 鎖鎌(斬撃) | a kusarigama: sickle linked by a chain to a weight — 鎖鎌 | `#cdd6e6` |
| `ic_tanegashima.png` | 火縄銃(射撃) | an antique matchlock gun (tanegashima) muzzle flash — 火縄銃 | `#7fb8ff` |
| `ic_fuin.png` | 封印札(罠) | a sealing ward paper pinned to the ground, faint chains — 地に貼る封符 | `#d2a273` |
| `ic_zangetsu.png` | 残月(斬撃) | a crescent-moon blade leaving a moonlight slash arc — 残月の刃 | `#cdd6e6` |
| `ic_tamegiri.png` | 気溜めの一刀(斬撃) | a heavy greatsword charged with glowing ki — 気を溜めた大刀 | `#cdd6e6` |
| `ic_laser.png` | 斎光(射撃/祓印) | a beam of purifying white-gold light, a thin radiant lance — 清めの光条 | `#7fb8ff` |
| `ic_juso.png` | 呪詛の面(祓印/呪) | a cursed Noh hannya mask, purple aura — 呪いの面 | `#c8a0ff` |
| `ic_honoo.png` | 火渡りの行(罠/移動) | a crimson flame trail / fire footpath — 紅蓮の炎 | `#ffb347` |
| `ic_ibara.png` | 茨の呪符(守り) | a knot of thorny brambles around a charm — 茨の棘 | `#a7d18b` |
| `ic_sumiuchi.png` | 墨打ち(射撃/祓印) | a splash of black sumi ink from a brush — 墨の飛沫 | `#7fb8ff` |
| `ic_suzunari.png` | 鈴鳴らし(音/祓印) | a cluster of golden kagura shrine bells on a handle — 神楽鈴の房 | `#e0a6ff` |
| `ic_kiyome.png` | 清め塩(結界) | a small mound of purifying salt with a sparkle — 清め塩の山 | `#ffb86b` |
| `ic_norito.png` | 祝詞連唱(祓印/音) | a golden ensō circle with a chanting scroll — 金の円相 | `#ffd166` |
| `ic_kagami.png` | 鏡返し(守り/音) | a round bronze mirror with a handle, reflective sheen — 円鏡 | `#a7d18b` |
| `ic_henbai.png` | 反閇の足跡(移動/結界) | a ritual stepping pattern of glowing footprints — 反閇の足型 | `#86e3c2` |
| `ic_mandala.png` | 封字曼荼羅(結界/祓印) | a sealing mandala: double circle with a central cross-glyph — 封字の曼荼羅 | `#ffb86b` |
| `ic_sanshu.png` | 三種祓具(斬撃/射撃) | the three sacred treasures: sword, mirror, jewel together — 剣・鏡・玉 | `#cdd6e6` |
| `ic_mihashira.png` | 天ノ御柱(灯) | a heavenly pillar of light rising from a stone base — 天ノ御柱 | `#ffe7a0` |

> ⚠️ 既存だが**未使用の旧アイコン**（描かなくてよい）：`ic_gohei / ic_shimenawa / ic_daiko / ic_makibishi / ic_tsubute / ic_hiken`。

## A4. 任意アイコン（優先度・低／後回し可）

現状は**漢字を彫った角タイル**で十分読めるため**任意**。絵的にしたい場合のみ生成。

- **能力/宝具/秘術（漢字アイコン）**：`ic_might 力 / ic_area 扇 / ic_speed 足 / ic_hp 守 / ic_regen 雫 / ic_haste 鈴 / ic_magnet 磁 / ic_armor / ic_crit / ic_growth / ic_zeni / ic_fuku / ic_pierce / ic_bounce / ic_still / ic_shots / ic_heal / ic_bomb2`。生成するなら「漢字の意味を表す小さな絵物」に。
- **加護オーブ（4種・任意）**：`buff_aratama`(荒/赤 威力2倍) `buff_shinsoku`(速/水色 加速) `buff_kongo`(剛/金 無敵) `buff_bunshin`(分/紫 弾+1)。光る宝珠＋中に漢字、で可。
- **拾い物（任意）**：`onigiri`(おにぎり=回復) `magnet`(磁鉄=吸込) `bomb`(爆) `koban`(小判=銭)。※これらは別系統(actorスプライト)で、差替には別途配線が要る。

---

# PART B — エフェクト（アニメ連番 / `assets/fx/`）

## B0. エフェクトの仕組み（既存・drop-in）

- ランタイムは `G.fx.anim(x, y, name, { scale, dur, rot, add })` で **`assets/fx/<name>_<i>.png`** を順再生。
  - フレームは **64×64px・透過PNG**、`<name>_0.png … <name>_(N-1).png`（0始まり連番）。
  - `add:true`＝加算合成（光物）/ `add:false`＝通常合成（実体物）。`scale` 倍率（`64*scale` px で描画）。
- 追加手順：①フレームを `assets/fx/` に置く ②`js/engine.js` の `F.loadAnims` の `defs` に
  `name: フレーム数` を1行足す ③発火箇所に `G.fx.anim(...)` を1行（**こちらで配線する**＝PART C）。
- **既に素材化済み（foozle CC0・10種）＝重複生成しないこと**：
  `explode / portal / fireball / wind / tornado / water / water_geyser / rocks / earth_spike / molten_spear`。

## B1. エフェクトの画風 ＋ 接尾辞 ＋ モーション指定

- **真俯瞰**（地面に落ちる前提）。中心から**広がって消える**1アクション。背景透過。
- 和風の素地に**役割色を強く**。暗い夜画面で映えるよう、加算で重ねても飛ばない明度に。
- **フレーム設計**：N枚で「立ち上がり→最盛→減衰」。`_0`小さく → 中盤最大 → 末尾は薄れる。
  - 出力形態は **(a) 横並びスプライトストリップ1枚**（後で切り出し）か **(b) 連番個別PNG**。どちらでも可。
  - 連番間で**中心・スケールを揃える**（ブレるとパラつく）。ループ物（狐火等）は端と頭が繋がるように。

### FX STYLE SUFFIX（全エフェクトに連結・固定）
```
, top-down VFX animation frames, a single effect bursting from center and fading out,
hand-painted Japanese-folklore spell effect, bold shape readable on a dark night background,
transparent background, no character, no ground, no text, 64px square per frame, centered,
crisp silhouette with soft glow, consistent frames forming one smooth motion
```

## B2. 不足エフェクト カタログ（生成対象・優先度順）

| 優先 | name | 効果(和) | 枚数目安 | 合成 | PROMPT（英）＋ パレット | 配線先（参考） |
|---|---|---|---|---|---|---|
| ⭐⭐⭐ | `lightning` | 雷（落雷/雷撃） | 8 | add | a vertical lightning strike: jagged white-blue bolt + ground flash ring, electric `#cfeaff`/`#9fe6ff` on white core | 雷霆符・雷鳴・電纏 |
| ⭐⭐⭐ | `slash` | 斬撃（刀の一閃） | 6 | add | a single curved sword slash arc, white core with cool-blue edge `#cdd6e6`, motion-blurred crescent | 太刀/気溜め/三種・受け返し・残心 |
| ⭐⭐⭐ | `holy` | 祓い光（大祓/落光） | 10 | add | a radiant purification burst: gold-white light column + expanding ring of light, sacred `#ffd166`/`#fff7e0` | 祓い/大祓/祝詞/御柱/清祓 |
| ⭐⭐ | `curse` | 呪詛（呪いの刻印） | 8 | add | a creeping purple curse sigil + dark haze swirl, ominous `#b07bff`/`#7a3dff` | 呪詛の面・呪火・呪マーカー |
| ⭐⭐ | `heal` | 回復（癒し） | 8 | add | rising green healing motes + a soft leaf/petal swirl and a gentle ring, `#8ae8a0`/`#dffbe6` | おにぎり/祓いの舞/反魂（現状ほぼ文字だけ＝効果大） |
| ⭐⭐ | `lampburst` | 灯火（点灯/段階/三灯共鳴） | 8 | add | a warm lantern light blooming outward, soft amber halo `#ffce79`/`#ffe7a0`（色替え前提＝白系も可） | 提灯点灯/段階上昇/三灯共鳴 |
| ⭐ | `ward` | 結界（守りの陣） | 8 | add | a hexagonal shimmering barrier rising and settling, warm `#ffb86b` lattice with faint blue glints | 結界/曼荼羅/封印札 |
| ⭐ | `foxfire` | 狐火（蒼炎・ループ） | 6(loop) | add | a looping wisp of blue spectral flame flickering, `#7fd0ff`/`#bfeaff` | 狐火/白狐の尾/狐火奔り |
| ⭐ | `levelup` | 昇華（レベルアップ） | 10 | add | a triumphant golden ascension burst: ring + light pillar + sparks, `#ffd166`/`#fff` | レベルアップ演出 |
| ⭐ | `awaken` | 覚醒/会得/共鳴 | 10 | add | a grand awakening flare with concentric rings and rising glyph sparks（色替え前提） | 相乗会得/共鳴/覚醒/秘術獲得 |

## B3. あえて素材化しない（手続き維持を推奨・GPT生成不要）

正直ベースの判断。ここに労力を割かない方が良い：

- **会心 `crit`** … 発火が高頻度（毎ヒット）。1ヒット毎に64pxスプライトはモバイルfill-rate的に重い。現状の手続き金星で十分。
- **魂 `soul`** … 上昇する粒子表現がすでに綺麗。スプライト化の利得が薄い。
- **斎光ビーム `beam`** … 壁で反射して折れ曲がる幾何なので、固定コマのスプライトと相性が悪い。現状の加算ポリラインが正解。
- **火渡りの地面炎** … 設置時の `fireball` は素材化済。地面に残る炎パッチは手続き3層のままで馴染んでいる。

---

# PART C — 反映（素材が来たらこちらでやること）

1. **アイコン**：`assets/sprites/raw/` に `ic_*.png` を置く →
   - 透過シンボル方式：`installRaster` 経路に**暗パネル＋枠の描画**を1行足す＋ manifest に `ic_<id>: {file, w:28, h:28, ax:14, ay:14}` を追記。
   - 焼き込み方式：そのまま manifest 追記のみ。
   - （`pack.py` をアイコン対応に小拡張するか、手で manifest 追記）
2. **エフェクト**：フレームを `assets/fx/` に連番で置く → `F.loadAnims` の `defs` に `name: 枚数` を足す →
   発火箇所（B2の「配線先」）に `G.fx.anim(...)` を配線 → Playwright で実発火・白飛び・0エラーを数値検証。
3. 本番ビルド：`build-web.bat` は `assets/` をフォルダごとコピーするので、新規PNGは自動同梱（追加対応不要）。

> 生成順のおすすめ：**アイコンは A3 の武器30種**を先に（アンカー1枚→残り）。
> **エフェクトは B2 の ⭐⭐⭐ 3種（雷・斬撃・祓い光）**から。ここが頻度×視認性×テーマ適合で最も効く。
