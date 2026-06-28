# 百鬼夜行サバイバーズ — スプライト画風バイブル & 生成ブリーフ

このファイルは **Codex（または任意の画像生成）にスプライトを描かせるための仕様書**。
画像が来たら `assets/sprites/raw/` に置いて `python assets/sprites/pack.py` を回すだけで
ゲームに反映される（差し替え方は末尾「パイプライン」参照）。

---

## 0. 最重要：一貫性のための鉄則（210枚を崩さない）

1. **まず「画風アンカー」を1枚だけ確定させる。** おすすめは `e_oni`（赤鬼）。
   納得いくまで描き直す。これが**全妖怪の見本**になる。
2. 以降は全部 **そのアンカー画像を参照入力（reference / img2img）にして** 描く。
   「同じ画風で / in the same art style as the reference」を毎回付ける。
3. **下の「共通スタイル接尾辞（STYLE SUFFIX）」を全プロンプトに必ず連結する。** 一字一句変えない。
4. 1体ずつでなく **シート（同一プロンプトで4体並べて1枚）** で出すと画風がさらに揃う
   （pack.py は1体1ファイル前提なので、シートは後で切り分けて raw/ へ）。

> 揃わなさは「プロンプトの揺れ」から来る。被写体（subject line）だけ差し替え、
> **STYLE SUFFIX と参照画像は固定**するのが唯一の勝ち筋。

---

## 1. 世界観・画風（STYLE）

- **題材**：和風ホラー「百鬼夜行」。月夜、藍色の闇。妖怪が群れで襲ってくる見下ろし型。
- **トーン**：不気味だが可愛げのある妖怪絵巻。怖すぎず、シルエットで一目で種類が分かる。
- **タッチ**：手描き風の半厚塗り（painterly）。極端なセル塗りでもドット絵でもない。
  少しデフォルメ（頭身低め・特徴を誇張）。**極小表示でも読める情報量**に絞る。
- **画角**：ほぼ真上に近い **ハイアングル3/4（俯瞰寄り）**。全身。正面〜やや斜め。
- **接地**：足／底面が**下端中央**。地面影は**描かない**（ゲーム側で落とす）。

### ライティング（闇で映えるための生命線）
ゲーム画面は暗い。**輪郭が背景に溶けないこと**が最優先。

- **キーライト**：左上からの**月光（cool）**。上面・左肩が明るく、下・右が沈む。
- **リムライト（必須）**：シルエットの縁に **冷たい青白い縁取り** `#A8CDFF`。
  これで暗い地面から浮き上がる。**全妖怪に必ず入れる。**
  - 例外：自分が光る妖（提灯/鬼火/死霊/火車）は縁＋**暖色の内発光**も足す。
  - ボスは青白リムでなく **金のリム** `#FFC96C`（格上だと一目で分かる記号）。
  - 自機（陰陽師）は **暖色リム** `#FFE6BD`（味方＝暖色）。
- **コントラスト**：中間色を厚くしすぎない。暗部は潰す。彩度は**点で**効かせる。

### パレット土台（シーンに馴染ませる）
- 夜の地面 `#131E36` / 草 `#33507E`〜`#46689A`（この上に乗る前提で値を決める）
- 無彩色〜藍を支配的に。各妖の**シグネチャ色は1〜2色だけ点で**。
  - 鬼＝朱 `#D23C32` / 骨＝灰白 `#E6E2D0` / 火・灯＝橙金 `#FFB347` / 霊・鬼火＝青緑 `#3CE6DC` / 闇妖＝紫 `#7A4AA0`

---

## 2. 技術仕様（OUTPUT）

| 項目 | 指定 |
|---|---|
| 形式 | **PNG・背景完全透過**（α付き）。背景が残るなら単色フラットにして `pack.py --chroma` で除去 |
| 内容 | **1体だけ・全身・余計な小物や台座なし**。テキスト・枠・influence 透かし無し |
| 解像度 | 生成は **512〜1024px 正方形** 程度。pack.py が自動トリム＆縮小（内部最大320px）するので大きめでOK |
| 構図 | 被写体を中央、足/底を下端寄り、上下左右に**均等な余白**。複数フレーム間で構図を揃える |
| アニメ | フレーム `_0`/`_1` は**1枚でOK**（同一画像を両方に割当＝v1）。動きはゲーム側のバウンド/スカッシュが付ける。後で `_1` だけ差替も可 |
| 命名 | 後述のベースキー名で保存（例 `e_oni.png`）。これで両フレームに自動展開される |

### 共通スタイル接尾辞（STYLE SUFFIX）— 全プロンプトに連結（固定）
```
, single yokai character, full body, centered, high 3/4 top-down view,
hand-painted semi-painterly Japanese folklore art, slightly deformed chibi proportions,
moonlit night palette of deep indigo and violet, cool blue moonlight key light from upper-left,
crisp cool blue-white rim light on the silhouette so it reads on a dark background,
bold readable silhouette, low clutter, transparent background, no ground shadow, no text, no frame,
game asset sprite, consistent with the reference style
```
- ボスは `cool blue-white rim` → **`golden rim light`** に置換、`, imposing large boss` を追加。
- 自機は `, warm amber rim light, heroic onmyoji exorcist` を追加。

---

## 3. 優先順（インパクト順・ここから生成）

> 雑魚 `_1` は `_0` と同一画像で良いので、**実際に描くのは下記の「1体＝1枚」だけ**。
> 第1〜3バッチ＝**計29枚**でゲームの見た目はほぼ刷新される。小物/UIアイコン（残り）は手続きのままで十分。

- **バッチ1（最優先・自機3）**：`p_haru` `suzu` `mutsuki`
- **バッチ2（ボス9）**：`b_tanuki` `b_nure` `b_ushi` `b_nue` `b_gasha` `b_shuten` `b_tsuchigumo` `b_daitengu` `b_ogama`
- **バッチ3（主要雑魚 全20）**：下表の `e_*`
- **バッチ4（任意）**：各妖の `_1` 差替（動きを足したい妖だけ）、小物・UIアイコン

---

## 4. 被写体カタログ（subject line ＋ デザイン指定）

各行の **PROMPT** に **STYLE SUFFIX** を連結して生成。デザインは既存の妖怪設定に準拠。

### 自機（陰陽師 / 暖色リム）
| ファイル名 | 妖/役 | PROMPT（英）+ 和の意図 |
|---|---|---|
| `p_haru.png` | 晴・主人公の陰陽師 | a young onmyoji exorcist in deep-violet hakama and pale over-robe, paper talismans, calm focused face — 凛とした術者、烏帽子か前髪、札を携える |
| `suzu.png` | 鈴・巫女系術者 | a shrine-maiden exorcist with a sacred straw rope (shimenawa) and bells, red-and-white attire — 注連縄を振るう巫女 |
| `mutsuki.png` | 無月・残月の剣士 | a moonlit ronin exorcist wielding a crescent-moon blade, dark robe, white scarf — 月を背負う抜刀の剣士 |

### ボス（金リム・大きめ・各3パターン持つ強敵）
| ファイル名 | 妖 | PROMPT（英）+ 和の意図 |
|---|---|---|
| `b_tanuki.png` | 化け狸 | a giant trickster tanuki with a straw hat, sake gourd, drumming its big belly — 笠＋徳利＋腹鼓 |
| `b_nure.png` | 濡女 | a serpentine wet-haired woman yokai, long black dripping hair, golden comb, clawed hands — 金櫛＋爪の手＋蛇身 |
| `b_ushi.png` | 牛鬼 | a monstrous ox-demon with six legs and a golden nose ring, dark hide — 六脚＋金鼻輪 |
| `b_nue.png` | 鵺 | a flying chimera: monkey face, tiger limbs, snake tail, storm aura — 飛行するキメラ（空中ボス） |
| `b_gasha.png` | がしゃどくろ | a colossal skeleton boss towering over the field, hollow eye-glow — 巨大骸骨 |
| `b_shuten.png` | 酒呑童子 | the oni king, red-skinned horned demon with a sake gourd and a chest scar, final boss menace — 鬼神・最終ボス、瓢箪＋胸の傷 |
| `b_tsuchigumo.png` | 土蜘蛛 | a giant earth-spider yokai with a bulbous abdomen marked by a faint skull pattern, eight thick legs, a cluster of red eyes and venom fangs — 髑髏紋の腹＋八脚＋赤い多眼 |
| `b_daitengu.png` | 大天狗 | a great tengu boss: crimson long-nosed face, small black tokin cap, large dark feathered wings, a feather war-fan in hand — 赤面長鼻＋兜巾＋翼＋羽団扇 |
| `b_ogama.png` | 大蝦蟇 | a colossal toad yokai: wide warty green body, a huge gaping mouth, two bulging eyes on top, squat front legs — 疣だらけの緑体＋大口＋突き出た両眼 |

### 主要雑魚（青白リム。光る妖は内発光も）
| ファイル名 | 妖 | PROMPT（英）+ 意図 / 備考 |
|---|---|---|
| `e_imp.png` | 小鬼 | a small red imp demon, little horns, quick — ザコ筆頭 |
| `e_bat.png` | 蝙蝠 | a night bat, spread wings, gliding — 飛行 |
| `e_lantern.png` | 提灯お化け | a one-eyed paper chochin lantern ghost with a lolling tongue, **glowing warm from within** — 発光 |
| `e_kasa.png` | 傘お化け | a one-eyed one-legged karakasa umbrella spirit, hopping — 跳ねる |
| `e_skel.png` | 骸骨武者 | a skeletal samurai with a helmet, shoulder guards and a broken sword — 兜＋肩当て＋折れ刀 |
| `e_onibi.png` | 鬼火 | a will-o-wisp: a skull cradled in **blue spectral flame, self-glowing** — 炎中の髑髏・発光・遠隔 |
| `e_oni.png` | 赤鬼 | **【画風アンカー推奨】** a red oni with horns and a fanged grin, holding a small iron club — 朱の鬼 |
| `e_nyudo.png` | 大入道 | a huge looming bald monk silhouette with a single eye, hulking — 単眼・巨体・鈍重 |
| `e_crow.png` | 夜烏 | a tengu crow-spirit wearing a hood, wings spread, swooping — 天狗頭巾・急襲 |
| `e_aburaakago.png` | 油赤子 | a creepy oil-licking baby spirit with green phosphor eyes and a sucking mouth — 緑燐光の眼＋吸い口 |
| `e_gaki.png` | 餓鬼 | an emaciated hungry ghost with a distended belly, gaunt — 痩せ＋膨れた腹 |
| `e_shiryo.png` | 死霊 | a pale floating wraith, **soft self-glow**, trailing tatters — 浮遊・発光 |
| `e_kasha.png` | 火車 | a flaming cat-cart demon wreathed in **fire, fast**, fierce — 炎纏う・発光・高速 |
| `e_dodomeki.png` | 百々目鬼 | a many-eyed demon covered in countless glowing eyes, arms outstretched — 多眼・遠隔 |
| `e_rokuro.png` | ろくろ首 | a pale woman with an unnaturally long stretching neck, kimono — 長い首 |
| `e_hitotsume.png` | 一つ目小僧 | a one-eyed boy monk yokai, single big eye, tongue out — 単眼の小僧 |
| `e_biwa.png` | 琵琶牧々 | an animated biwa lute spirit with a face and little limbs — 化け琵琶 |
| `e_kyokotsu.png` | 狂骨 | a wild skeletal ghost rising from a well, tangled hair, frenzied — 井戸の狂骨 |
| `e_ungaikyo.png` | 雲外鏡 | a round bronze mirror spirit with a leering face on its surface, small legs — 鏡の妖 |
| `e_jikininki.png` | 食人鬼 | a gaunt corpse-eating ghoul, ragged, hunched, sharp teeth — 食人の餓鬼 |

---

## 5. パイプライン（画像→ゲーム反映）

```
1. 画像を生成（上記プロンプト＋STYLE SUFFIX、背景透過PNG）
2. assets/sprites/raw/ に保存  （例: e_oni.png, b_tanuki.png, suzu.png …）
3. python assets/sprites/pack.py            # 透過済みならこれだけ
   python assets/sprites/pack.py --chroma   # 背景が単色で残っている場合
4. ブラウザを再読込（serve.py はキャッシュ無効）→ 反映を確認
```

- `pack.py` が自動でやること：余白トリム → 内部解像度に縮小 → **手続きスプライトと同じ
  ゲーム内サイズ・アンカーに正規化（歪み無し）** → `manifest.json` へ追記。
- 1体＝1ファイルで `_0`/`_1` 両方に自動割当。フレーム別に差し替えたい時だけ
  `e_oni_0.png` のように**フレーム名そのもの**で保存すればその1枚だけ上書き。
- **未生成の妖は手続き描画のまま**動く（壊れない）。気が向いた分だけ差し替えればよい。
- 確認用：ブラウザのコンソールに `[sprites] raster art: N/総数` が出る。
- 全名と既定サイズは `assets/sprites/footprints.json` 参照（pack.py が使用）。

---

## 6. itch.io 配布時の注意（ビルド肥大対策）
- ラスター化でサイズが増える。**単一HTML（百鬼夜行.html）に base64 同梱すると数MB**になる。
- 配布は **`index.html` + `js/` + `assets/` を zip**（assets を別ファイルのまま）にする方が軽い。
  単一HTMLは「1ファイルで渡したい時」用と割り切る（`build_standalone.py` は assets 同梱対応が要追加）。
```
