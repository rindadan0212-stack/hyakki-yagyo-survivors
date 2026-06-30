/* 百鬼夜行サバイバーズ — data: weapons, passives, enemies, bosses, waves.
 * 全バランス数値はここに集約。run は 15:00 (900s) で夜明け=勝利。 */
'use strict';

G.data = (() => {
  const D = {};

  D.RUN_LENGTH = 900;          // seconds to dawn
  D.MAX_WEAPONS = 6;
  D.MAX_PASSIVES = 6;
  D.MAX_TALENTS = 4;

  // ---------------- レア度 (抽選確率と出現演出) ----------------
  // weight = 新規取得時の抽選重みに乗算 (高レアほど出にくい)。tier>=2 でカードに輝き演出。
  D.RARITY = {
    common: { name: '常', tier: 0, weight: 1.0,  color: '#aab4c8' },
    rare:   { name: '希', tier: 1, weight: 0.5,  color: '#5fd0e6' },
    epic:   { name: '秘', tier: 2, weight: 0.24, color: '#c08bff' },
    legend: { name: '伝', tier: 3, weight: 0.1,  color: '#ffd166' },
  };
  // スキルごとのレア度 (未登録は common)。1箇所に集約 = 各定義を汚さない。
  D.RARITY_OF = {
    weapon: {
      raitei: 'rare', kitsunebi: 'rare', kekkai: 'rare',
      juzu: 'rare', komainu: 'rare',
      shuriken: 'rare', kusarigama: 'rare',
      tanegashima: 'epic', fuin: 'epic', zangetsu: 'epic', laser: 'rare',
      juso: 'epic', honoo: 'rare',   // 呪い / 炎の足跡
      suzunari: 'rare', kagami_gaeshi: 'epic', inazuma: 'rare',
      // 新スキル(2026-06-23): 斬/雷/呪火 拡充
      kasumigiri: 'rare', hajingiri: 'epic', raisou: 'rare', hourai: 'epic', nokoribi: 'rare',
      // 伝説=ビルドの決め手 (各系統の到達点。出にくいぶん強力)
      norito: 'legend', hamaya: 'epic', bonsho: 'epic',
      konshingiri: 'legend', messe: 'legend', kazuuchi: 'legend',
      sanshu_harae: 'epic', amenomihashira: 'epic', raijin: 'legend', hyakuju: 'legend',
    },
    passive: {
      crit: 'rare', haste: 'rare', lifesteal: 'rare', pierce: 'rare', bounce: 'rare',
      lampboost: 'rare',
      critdmg: 'epic', dodge: 'epic', tamegiri: 'epic',
    },
    talent: {
      zansho: 'rare', yawatari: 'rare', himori: 'rare', tamayori: 'rare', hikugi: 'rare',
      konpaku: 'epic', utsusemi: 'epic',
    },
  };
  D.rarityOf = (kind, id) => (D.RARITY_OF[kind] && D.RARITY_OF[kind][id]) || 'common';

  // ---------------- weapons ----------------
  // base: 武器のレベル1ステータス。levels[i] = Lv(i+2) になった時の加算値。
  // d: レベルアップカードに表示する差分テキスト。
  // pierceable: 有限貫通の弾を撃つ得物 = 宝具「貫きの鏃/跳ね鞠」が効く。これが無い得物では
  //   両宝具は無効なので抽選から外す (systems.js の hasPierceWeapon が参照)。
  D.W = {
    ofuda: {
      name: '破魔の御札', icon: 'ic_ofuda', pierceable: true, charOnly: 'haru',
      desc: '最も近い妖を自動で狙い、呪符を連射する。貫通と跳弾は対応する宝具を得た時だけ発動する。',
      evolveWith: 'might', evolveName: '破魔百連の符', awakeDesc: '黄金の符を絶え間なく連ねる',
      base: { dmg: 17, cd: 0.9, amount: 1, speed: 480 },
      levels: [
        { amount: 1, d: '符 +1' },
        { dmg: 6, d: '威力 +6' },
        { amount: 1, d: '符 +1' },
        { speed: 70, dmg: 4, d: '弾速 +70 / 威力 +4' },
        { dmg: 8, d: '威力 +8' },
        { amount: 1, cd: -0.08, d: '符 +1 / 発動 -0.08s' },
      ],
      awake: { amount: 2, dmgMul: 1.3 },
      forgeMilestones: [
        { lv: 25, name: '疾走の符', desc: '弾速 +12%', apply: st => { st.speed *= 1.12; } },
        { lv: 50, name: '速符', desc: '発動 -10%', apply: st => { st.cd *= 0.9; } },
        { lv: 75, name: '連符', desc: '符 +1', apply: st => { st.amount = (st.amount || 1) + 1; } },
        { lv: 100, name: '破魔究め', desc: '威力 +25%', apply: st => { st.dmg *= 1.25; } },
      ],
    },
    katana: {
      name: '太刀「燕」', icon: 'ic_katana',
      desc: '進行方向へ太刀を一閃する近接攻撃。間合いは短いが一撃が重く、会心が乗りやすい。育つと背後にも振る。',
      evolveWith: 'haste', evolveName: '居合「飛燕」', awakeDesc: '神速の居合。太刀風が止まらない',
      base: { dmg: 22, cd: 1.3, range: 180, arc: 1.9, crit: 0.15 },
      levels: [
        { dmg: 8, d: '威力 +8' },
        { back: 1, d: '背後にも一閃' },
        { range: 16, dmg: 6, d: '間合い +20% / 威力 +6' },
        { cd: -0.18, d: '発動 -0.18s' },
        { dmg: 12, d: '威力 +12' },
        { range: 18, dmg: 8, d: '間合い +20% / 威力 +8' },
      ],
      awake: { cdMul: 0.6, dmgMul: 1.3 },
    },
    fox: {
      name: '式神・白狐', icon: 'ic_fox', summon: true,
      desc: '白狐の式神が主の周りに付き従い、間合いに入った妖へ自ら飛びかかって裂く。数を増やすほど狩りが速い。',
      evolveWith: 'speed', evolveName: '九尾の陣', awakeDesc: '金毛九尾が顕現し、絶え間なく食らいつく',
      base: { dmg: 11, amount: 2, radius: 72, spin: 2, hitCd: 0.5 },
      levels: [
        { amount: 1, d: '式神 +1' },
        { dmg: 6, d: '威力 +6' },
        { amount: 1, radius: 10, d: '式神 +1 / 半径 +10' },
        { spin: 0.45, dmg: 5, d: '速度 +30% / 威力 +5' },
        { amount: 1, d: '式神 +1' },
        { dmg: 9, radius: 12, d: '威力 +9 / 半径 +12' },
      ],
      awake: { amount: 2, dmgMul: 1.5, radiusMul: 1.2 },
    },
    raitei: {
      name: '雷霆符', icon: 'ic_raitei',
      desc: '画面内の妖へ無作為に雷を落とす。狙えないが必ず当たり、着弾点で爆発して巻き込む。',
      evolveWith: 'haste', evolveName: '神鳴り', awakeDesc: '雷雲が従い、雷の数が増す',
      base: { dmg: 26, cd: 1.9, amount: 1, aoe: 70 },
      levels: [
        { amount: 1, d: '落雷 +1' },
        { dmg: 8, d: '威力 +8' },
        { amount: 1, d: '落雷 +1' },
        { aoe: 16, d: '爆発範囲 +25%' },
        { dmg: 12, d: '威力 +12' },
        { amount: 1, d: '落雷 +1' },
      ],
      awake: { amount: 2, aoeMul: 1.3 },
    },
    inazuma: {
      name: '稲妻', icon: 'ic_raitei',
      desc: '最も近い妖へ雷を放ち、稲妻が妖から妖へ次々と伝い渡る。密集した群れに連鎖して滅法強い雷の中核。',
      evolveWith: 'haste', evolveName: '八雷神', awakeDesc: '雷が絶えず伝い、夜を白く灼く',
      base: { dmg: 22, cd: 1.35, chains: 3, range: 220, falloff: 0.85, crit: 0.06 },
      levels: [
        { chains: 1, d: '連鎖 +1' },
        { dmg: 6, d: '威力 +6' },
        { chains: 1, d: '連鎖 +1' },
        { dmg: 7, d: '威力 +7' },
        { range: 60, d: '連鎖距離 +60' },
        { dmg: 9, chains: 1, d: '威力 +9 / 連鎖 +1' },
      ],
      awake: { chains: 3, dmgMul: 1.3 },
    },
    kitsunebi: {
      name: '狐火', icon: 'ic_kitsunebi', pierceable: true,
      desc: '妖を追尾する蒼い鬼火を放つ。曲がって追うため取り逃しが少なく、複数を貫く。',
      evolveWith: 'regen', evolveName: '青蓮の業火', awakeDesc: '消えぬ霊火が無限に貫く',
      base: { dmg: 15, cd: 1.7, amount: 1, pierce: 2, speed: 250, life: 3.2 },
      levels: [
        { amount: 1, d: '狐火 +1' },
        { dmg: 6, d: '威力 +6' },
        { amount: 1, d: '狐火 +1' },
        { pierce: 2, d: '貫通 +2' },
        { dmg: 10, d: '威力 +10' },
        { amount: 2, d: '狐火 +2' },
      ],
      awake: { amount: 2, pierce: 99, dmgMul: 1.3 },
    },
    kekkai: {
      name: '浄化の結界', icon: 'ic_kekkai',
      desc: '身の周りに張り続ける結界。踏み入った妖を焼いて足を鈍らせ、祓った気で身を癒す。囲まれた時の生命線。',
      evolveWith: 'hp', evolveName: '五芒の浄域', awakeDesc: '結界が拡がり、夜を拒む聖域となる',
      base: { dmg: 7, radius: 86, tick: 0.55, slow: 0.14, heal: 0.5 },
      levels: [
        { radius: 11, d: '半径 +12%' },
        { dmg: 3, d: '威力 +3' },
        { radius: 11, slow: 0.06, d: '半径 +12% / 鈍化強化' },
        { dmg: 4, d: '威力 +4' },
        { radius: 14, d: '半径 +15%' },
        { dmg: 6, tick: -0.13, d: '威力 +6 / 間隔短縮' },
      ],
      awake: { radiusMul: 1.35, dmgMul: 1.5, slowAdd: 0.15 },
    },
    juzu: {
      name: '大数珠', icon: 'ic_juzu',
      desc: '巨大な数珠を投げ、行きと帰りの二度打ち据える。中距離を太く制圧する。',
      evolveWith: 'might', evolveName: '金剛念珠', awakeDesc: '数珠が金剛と化し、三度打ち据える',
      base: { dmg: 24, cd: 2.1, amount: 1, range: 270, speed: 420, maxHits: 2 },
      levels: [
        { dmg: 8, d: '威力 +8' },
        { amount: 1, d: '数珠 +1' },
        { dmg: 8, d: '威力 +8' },
        { amount: 1, d: '数珠 +1' },
        { dmg: 12, d: '威力 +12' },
        { amount: 1, cd: -0.3, d: '数珠 +1 / 発動 -0.3s' },
      ],
      awake: { amount: 1, maxHits: 1, dmgMul: 1.4 },
    },
    bonsho: {
      name: '梵鐘', icon: 'ic_bonsho',
      desc: '頭上に大鐘を落とし、撞音で周囲一円を薙ぎ払う。発動は遅いが範囲がきわめて広い。',
      evolveWith: 'hp', evolveName: '無明の大鐘', awakeDesc: '鐘音が夜を震わせ、妖の足を縫い止める',
      base: { dmg: 34, cd: 3.5, radius: 155 },   // 伝説の决め手: 広範囲化
      levels: [
        { dmg: 12, d: '威力 +12' },
        { radius: 18, d: '轟き +18' },
        { cd: -0.5, d: '発動 -0.5s' },
        { dmg: 16, d: '威力 +16' },
        { radius: 24, d: '轟き +24' },
        { dmg: 22, cd: -0.5, d: '威力 +22 / 発動 -0.5s' },
      ],
      awake: { radiusMul: 1.4, dmgMul: 1.5, stun: 1 },
    },
    hamaya: {
      name: '破魔矢', icon: 'ic_hamaya', pierceable: true,
      desc: '画面内で最も手強い妖を自動で狙撃する。深く貫通し、会心率が高い。エリート・ボス退治の主砲。',
      evolveWith: 'crit', evolveName: '天魔覆滅', awakeDesc: '矢が光となり、列なす全てを貫く',
      base: { dmg: 74, cd: 2.7, amount: 1, speed: 920, pierce: 7, crit: 0.25 },   // 伝説の决め手: 威力/貫通増
      levels: [
        { dmg: 20, d: '威力 +20' },
        { amount: 1, d: '矢 +1' },
        { dmg: 24, d: '威力 +24' },
        { pierce: 5, d: '貫通 +5' },
        { cd: -0.4, d: '発動 -0.4s' },
        { dmg: 34, amount: 1, d: '威力 +34 / 矢 +1' },
      ],
      awake: { pierce: 99, dmgMul: 1.4, critAdd: 0.30 },
    },
    komainu: {
      name: '狛犬', icon: 'ic_komainu', summon: true,
      desc: '石の狛犬が直線に駆け抜け、轢いた妖を全て弾き飛ばす。群れに突っ込ませて道をこじ開ける。',
      evolveWith: 'speed', evolveName: '阿吽の驅け', awakeDesc: '阿と吽、二体が対になって驅け抜ける',
      base: { dmg: 50, cd: 3.4, amount: 2, speed: 540, life: 1.15 },
      levels: [
        { dmg: 8, d: '威力 +8' },
        { amount: 1, d: '狛犬 +1' },
        { speed: 60, dmg: 6, d: '速度 +60 / 威力 +6' },
        { life: 0.25, d: '持続 +0.25s' },
        { dmg: 10, d: '威力 +10' },
        { amount: 1, dmg: 12, d: '狛犬 +1 / 威力 +12' },
      ],
      awake: { amount: 1, dmgMul: 1.4, speed: 80 },
    },
    shuriken: {
      name: '手裏剣', icon: 'ic_shuriken', unlock: 600, pierceable: true, baseDesc: '超連射 ・ 敵から敵へ跳弾',
      desc: '矢継ぎ早に投げ、当たった妖から近くの妖へ刃が跳ね渡る。跳ね鞠の跳弾と加算される。',
      evolveWith: 'haste', evolveName: '八重手裏剣', awakeDesc: '残像が見えぬ速さで刃が舞う',
      base: { dmg: 8, cd: 0.45, amount: 1, speed: 560, pierce: 1, bounce: 2 },
      levels: [
        { amount: 1, d: '手裏剣 +1' },
        { dmg: 3, d: '威力 +3' },
        { bounce: 2, d: '跳弾 +2' },
        { amount: 1, d: '手裏剣 +1' },
        { dmg: 4, d: '威力 +4' },
        { amount: 1, cd: -0.06, d: '手裏剣 +1 / 発動 -0.06s' },
      ],
      awake: { cdMul: 0.65, bounce: 3, amount: 1 },
    },
    kusarigama: {
      name: '鎖鎌', icon: 'ic_kusarigama', unlock: 850, baseDesc: '全周を一回転で薙ぎ払う',
      desc: '鎖鎌を全周に一回転。間合いの妖をまとめて薙ぎ、外へ弾き飛ばす。囲まれてからが本領。',
      evolveWith: 'speed', evolveName: '鎖鎌・疾風', awakeDesc: '鎖は嵐となり、円陣を二度薙ぐ',
      base: { dmg: 26, cd: 2.2, r1: 270, crit: 0.1 },
      levels: [
        { dmg: 8, d: '威力 +8' },
        { r1: 15, d: '間合い +15' },
        { cd: -0.25, d: '発動 -0.25s' },
        { dmg: 10, d: '威力 +10' },
        { r1: 15, d: '間合い +15' },
        { dmg: 14, d: '威力 +14' },
      ],
      awake: { dmgMul: 1.5, r1Mul: 1.3 },
    },
    tanegashima: {
      name: '火縄銃', icon: 'ic_tanegashima', unlock: 1100, baseDesc: '低速発射 ・ 一撃必殺の貫通弾',
      desc: '轟音とともに一直線を撃ち抜く貫通弾。一発の重さは全武器でも最重量級。',
      evolveWith: 'might', evolveName: '国崩し', awakeDesc: '三段撃ちの礼法、ここに極まる',
      base: { dmg: 70, cd: 3.2, amount: 1, speed: 1300, crit: 0.15 },
      levels: [
        { dmg: 25, d: '威力 +25' },
        { cd: -0.4, d: '発動 -0.4s' },
        { dmg: 30, d: '威力 +30' },
        { amount: 1, d: '二連撃ち' },
        { dmg: 35, d: '威力 +35' },
        { amount: 1, cd: -0.4, d: '三段撃ち / 発動 -0.4s' },
      ],
      awake: { dmgMul: 1.5, amount: 1 },
    },
    fuin: {
      name: '封印札', icon: 'ic_fuin', unlock: 1300, baseDesc: '設置式 ・ 踏んだ妖を爆破',
      desc: '足元周辺に封印の符を置き、踏んだ妖を霊爆で吹き飛ばす。逃げ道に敷くのが上手い使い方。',
      evolveWith: 'might', evolveName: '八陣の封', awakeDesc: '封印の陣が大地を埋め尽くす',
      base: { dmg: 45, cd: 2.6, mines: 1, aoe: 95 },
      levels: [
        { mines: 1, d: '符 +1' },
        { dmg: 15, d: '威力 +15' },
        { aoe: 15, d: '爆発範囲 +15' },
        { mines: 1, d: '符 +1' },
        { dmg: 20, d: '威力 +20' },
        { mines: 1, aoe: 15, d: '符 +1 / 範囲 +15' },
      ],
      awake: { mines: 2, dmgMul: 1.3, aoeMul: 1.4 },
    },
    zangetsu: {
      name: '残月', icon: 'ic_zangetsu', charOnly: 'mutsuki',
      desc: '月影の巨大な斬撃波を放つ。弾足は遅いが消えず、列なす全てを薙ぎ斬って進む。',
      evolveWith: 'crit', evolveName: '朧月夜', awakeDesc: '月輪が冴えわたり、巨大な刃と化す',
      base: { dmg: 40, cd: 2.5, amount: 1, speed: 270, crit: 0.1 },
      levels: [
        { dmg: 12, d: '威力 +12' },
        { amount: 1, d: '斬撃 +1' },
        { dmg: 14, d: '威力 +14' },
        { cd: -0.3, d: '発動 -0.3s' },
        { dmg: 16, d: '威力 +16' },
        { amount: 1, cd: -0.2, d: '斬撃 +1 / 発動 -0.2s' },
      ],
      awake: { dmgMul: 1.45, big: 1, amount: 1 },
      forgeMilestones: [
        { lv: 25, name: '冴える月', desc: '会心 +8%', apply: st => { st.crit = (st.crit || 0) + 0.08; } },
        { lv: 50, name: '速断', desc: '発動 -10%', apply: st => { st.cd *= 0.9; } },
        { lv: 75, name: '大薙ぎ', desc: '斬撃 +1', apply: st => { st.amount = (st.amount || 1) + 1; } },
        { lv: 100, name: '残月究め', desc: '威力 +25%', apply: st => { st.dmg *= 1.25; } },
      ],
    },
    // --- 追加スキル (board の新スキル案より。武器=初期1挺以外は抽選で取れる「スキル」) ---
    laser: {
      name: '斎光', icon: 'ic_laser', pierceable: true, charOnly: 'suzu',
      desc: '最寄りの妖へ清めの光を一条放ち、直線上の妖をまとめて貫く。宝具「跳ね鞠（反射）」を得ると、塀に反射して折れ曲がる。',
      evolveWith: 'hp', evolveName: '天照の光条', awakeDesc: '光条が太く伸び、二条に分かれて境内を薙ぐ',
      base: { dmg: 27, cd: 1.4, amount: 1, range: 3200, beamW: 13, crit: 0.08 },
      levels: [
        { dmg: 7, d: '威力 +7' },
        { beamW: 4, d: '光条 太く' },
        { cd: -0.2, d: '発動 -0.2s' },
        { dmg: 9, d: '威力 +9' },
        { amount: 1, d: '光条 +1' },
        { cd: -0.25, dmg: 12, d: '発動 -0.25s / 威力 +12' },
      ],
      awake: { dmgMul: 1.4, beamW: 6, amount: 1 },
      forgeMilestones: [
        { lv: 25, name: '太光', desc: '光条が太く (+3)', apply: st => { st.beamW = (st.beamW || 11) + 3; } },
        { lv: 50, name: '速射', desc: '発動 -10%', apply: st => { st.cd *= 0.9; } },
        { lv: 75, name: '双光', desc: '光条 +1', apply: st => { st.amount = (st.amount || 1) + 1; } },
        { lv: 100, name: '天照究め', desc: '威力 +25%', apply: st => { st.dmg *= 1.25; } },
      ],
    },
    // --- 新役割スキル (2026-06-16: 御幣/飛剣を整理して入替) ---
    // 呪詛: 直接ダメージを持たず、範囲の妖に呪い(被ダメ増)を刻む弱体・刻印役。瞬間火力と相乗。
    juso: {
      name: '呪詛の面', icon: 'ic_juso',
      desc: '面を掲げ、周囲の妖へ呪いを刻む。呪われた妖は受ける痛手が増し、倒れると呪いが近くへ伝播する。自らは傷つけない布石の役。',
      evolveWith: 'might', evolveName: '百鬼の呪詛', awakeDesc: '呪いが境内に満ち、触れる妖を悉く弱らせる',
      base: { cd: 3.2, radius: 150, curse: 0.30, dur: 5 },
      levels: [
        { radius: 20, d: '範囲 +20' },
        { curse: 0.08, d: '呪い +8%' },
        { dur: 1.5, d: '持続 +1.5s' },
        { radius: 24, d: '範囲 +24' },
        { curse: 0.10, d: '呪い +10%' },
        { radius: 26, curse: 0.07, d: '範囲 +26 / 呪い +7%' },
      ],
      awake: { radiusMul: 1.35, curse: 0.15 },
    },
    // 炎の足跡: 歩いた跡に霊炎を残す移動型ハザード。動き回るほど強い。
    honoo: {
      name: '火渡りの行', icon: 'ic_honoo',
      desc: '歩いた跡に紅蓮の炎を点々と残す。踏み続けた妖をじわりと灼く。動き回るほど道が燃え盛る。',
      evolveWith: 'speed', evolveName: '火車の輪道', awakeDesc: '炎の道が太く長く、夜を焼き尽くす',
      base: { cd: 0.5, dmg: 9, r: 46, life: 2.4, tick: 0.35 },
      levels: [
        { dmg: 4, d: '威力 +4' },
        { r: 8, d: '範囲 +8' },
        { life: 0.6, d: '持続 +0.6s' },
        { dmg: 5, d: '威力 +5' },
        { r: 10, d: '範囲 +10' },
        { dmg: 7, life: 0.6, d: '威力 +7 / 持続 +0.6s' },
      ],
      awake: { dmgMul: 1.4, rMul: 1.2, life: 1.0 },
    },
    // 茨の反射: 被弾の刹那に棘で反撃する防御反撃役。攻めず、囲まれてこそ輝く。
    // --- 祓印リデザイン新規(2026-06-20) ---
    sumiuchi: {
      name: '墨打ち', icon: 'ic_sumiuchi', pierceable: true,
      desc: '前方へ墨を撒き散らし、当てた妖に祓印を確実に刻む。墨は近くの妖へも飛沫いて印が伝播する。火力は捨て、印を面で撒く専任(御札=火力寄りとの差別化)。貫通の宝具と好相性。',
      evolveWith: 'might', evolveName: '破邪墨染め', awakeDesc: '墨が黒く渦巻き、触れる妖を悉く穢す',
      base: { dmg: 8, cd: 0.95, amount: 4, pierce: 1, speed: 420 },
      levels: [
        { amount: 1, d: '墨 +1' },
        { dmg: 3, d: '威力 +3' },
        { amount: 1, d: '墨 +1' },
        { pierce: 1, dmg: 3, d: '貫通 +1 / 威力 +3' },
        { dmg: 4, d: '威力 +4' },
        { amount: 1, dmg: 5, d: '墨 +1 / 威力 +5' },
      ],
      awake: { amount: 2, pierce: 2, dmgMul: 1.25 },
    },
    suzunari: {
      name: '鈴鳴', icon: 'ic_suzunari',
      desc: '神楽鈴を打ち振り、清音波で周囲を薙ぐ。祓印を刻んだ妖に強く、印が満ちた妖を祓い清める。',
      evolveWith: 'haste', evolveName: '神楽鈴の清響', awakeDesc: '鈴の音が絶えず、撞くたび祓いが連なる',
      base: { dmg: 14, cd: 1.65, radius: 120, crit: 0.05 },
      levels: [
        { dmg: 5, d: '威力 +5' },
        { radius: 14, d: '範囲 +12%' },
        { cd: -0.15, d: '発動 -0.15s' },
        { dmg: 7, d: '威力 +7' },
        { radius: 16, d: '範囲 +14%' },
        { dmg: 9, cd: -0.18, d: '威力 +9 / 発動 -0.18s' },
      ],
      awake: { cdMul: 0.72, dmgMul: 1.3, radiusMul: 1.15 },
    },
    norito: {
      name: '祝詞連唱', icon: 'ic_norito',
      desc: '【祓いビルドの決め手・解禁至難】祓の宝を究めた者だけが唱える大祓詞。点灯した提灯すべての灯火圏へ超光を落とし、圏内の妖を絶大な威力で薙ぎ、祓印を一気に満たす。灯を多く灯すほど制圧力は青天井。',
      evolveWith: 'might', evolveName: '大祓詞', awakeDesc: '祝詞が大祓と化し、灯火の境内を光が満たす',
      base: { dmg: 150, cd: 3.0, crit: 0.18 },
      levels: [
        { dmg: 20, d: '威力 +20' },
        { cd: -0.4, d: '発動 -0.4s' },
        { dmg: 26, d: '威力 +26' },
        { dmg: 30, d: '威力 +30' },
        { cd: -0.4, d: '発動 -0.4s' },
        { dmg: 40, cd: -0.4, d: '威力 +40 / 発動 -0.4s' },
      ],
      awake: { dmgMul: 1.5 },
    },
    kagami_gaeshi: {
      name: '鏡返し', icon: 'ic_kagami',
      desc: '鏡を掲げ、迫る敵弾を弾き返し周囲を打つ。発動の刹那わずかに身を守る。弾幕と詠唱持ちへの備え。',
      evolveWith: 'hp', evolveName: '八咫鏡の守り', awakeDesc: '八咫の鏡が冴え、返す光が倍する',
      base: { dmg: 30, cd: 4.5, radius: 110, crit: 0.05 },
      levels: [
        { dmg: 10, d: '威力 +10' },
        { radius: 16, d: '範囲 +15%' },
        { cd: -0.45, d: '発動 -0.45s' },
        { dmg: 14, d: '威力 +14' },
        { radius: 18, d: '範囲 +16%' },
        { dmg: 18, cd: -0.4, d: '威力 +18 / 発動 -0.4s' },
      ],
      awake: { dmgMul: 1.4, radiusMul: 1.3 },
    },
    sanshu_harae: {
      name: '三種祓具', icon: 'ic_sanshu',
      desc: '発動ごとに三宝のいずれかを無作為に放つ ― 剣: 前方へ貫通の三刃 / 鏡: 周囲一帯を打つ波 / 玉: 八方へ跳ねる弾。形は選べないが、間合いを問わず戦える。',
      evolveWith: 'crit', evolveName: '三種大祓', awakeDesc: '剣・鏡・玉、三つ揃いて祓いと化す',
      base: { dmg: 30, cd: 2.8, radius: 150, crit: 0.08 },
      levels: [
        { dmg: 10, d: '威力 +10' },
        { cd: -0.3, d: '発動 -0.3s' },
        { dmg: 12, d: '威力 +12' },
        { radius: 16, d: '範囲 +16' },
        { dmg: 14, d: '威力 +14' },
        { dmg: 18, cd: -0.35, d: '威力 +18 / 発動 -0.35s' },
      ],
      awake: { dmgMul: 1.4, radiusMul: 1.2 },
    },
    amenomihashira: {
      name: '天ノ御柱', icon: 'ic_mihashira',
      desc: '最も近い灯火へ御柱を呼び降ろす。灯火圏に落とすと威力と範囲が増し祓印も刻む。灯を使うほど冴える切り札。',
      evolveWith: 'hp', evolveName: '高天の御柱', awakeDesc: '御柱が天を衝き、灯火の妖を悉く祓う',
      base: { dmg: 44, cd: 9.5, radius: 140 },   // ナーフ: 威力↓/CD↑/範囲↓
      levels: [
        { dmg: 20, d: '威力 +20' },
        { radius: 25, d: '範囲 +25' },
        { cd: -0.7, d: '発動 -0.7s' },
        { dmg: 30, d: '威力 +30' },
        { radius: 30, d: '範囲 +30' },
        { dmg: 34, cd: -0.8, d: '威力 +34 / 発動 -0.8s' },
      ],
      awake: { dmgMul: 1.5, radiusMul: 1.35 },
    },
    // --- 伝説の决め手 新規(2026-06-23): 雷=雷神招来 / 召喚=百獣招来 ---
    raijin: {
      name: '雷神招来', icon: 'ic_raitei',
      desc: '【雷ビルドの決め手】頭上に天叢雲を招来し、数秒のあいだ自動で画面の妖へ落雷し続ける。各落雷は広範囲＋感電(鈍足)。雷霆符(単発)と違い「雷雲フィールド」を展開する持続技。Lvで一度に落ちる本数が増す。',
      evolveWith: 'haste', evolveName: '天叢雲剣', awakeDesc: '雷雲が絶えず、落ちぬ間を作らぬ',
      base: { dmg: 66, cd: 4.8, amount: 6, aoe: 128, crit: 0.1, life: 2.6 },
      levels: [
        { amount: 1, d: '落雷 +1' },
        { dmg: 18, d: '威力 +18' },
        { aoe: 18, d: '範囲 +18' },
        { amount: 1, d: '落雷 +1' },
        { dmg: 24, d: '威力 +24' },
        { amount: 1, dmg: 28, d: '落雷 +1 / 威力 +28' },
      ],
      awake: { dmgMul: 1.4, amount: 2 },
    },
    hyakuju: {
      name: '百獣招来', icon: 'ic_komainu',
      desc: '【召喚ビルドの決め手】百鬼の眷属を一斉に解き放つ。四方へ散った獣が1.5秒の間、妖を追尾して貫き続ける。式神を増やすほど群れは厚くなる。',
      evolveWith: 'speed', evolveName: '百鬼夜行の主', awakeDesc: '眷属が絶えず、夜行が止まらぬ',
      base: { dmg: 140, cd: 3.6, amount: 8, speed: 560, life: 1.5, crit: 0.08 },
      levels: [
        { amount: 1, d: '眷属 +1' },
        { dmg: 16, d: '威力 +16' },
        { amount: 1, d: '眷属 +1' },
        { life: 0.3, d: '持続 +0.3s' },
        { dmg: 22, d: '威力 +22' },
        { amount: 2, dmg: 26, d: '眷属 +2 / 威力 +26' },
      ],
      awake: { amount: 2, dmgMul: 1.4, speed: 80 },
    },
    // --- 新スキル(2026-06-23): 斬/雷/呪火 拡充 ---
    kasumigiri: {
      name: '霞斬り', icon: 'ic_kasumigiri',
      desc: '一閃の軌跡に霞が滞留し、触れた妖をじわじわ削りつつ鈍足にする。瞬間で刈る太刀・破陣と違い、面で足止めする唯一の斬。',
      evolveWith: 'haste', evolveName: '八重霞', awakeDesc: '霞が四重に立ち込め、戦場を覆う',
      base: { dmg: 13, cd: 1.5, radius: 450, amount: 2, crit: 0.06 },
      levels: [
        { dmg: 4, d: '威力 +4' },
        { radius: 18, d: '範囲 +18' },
        { amount: 1, d: '連撃 +1' },
        { dmg: 6, d: '威力 +6' },
        { radius: 20, d: '範囲 +20' },
        { dmg: 8, cd: -0.2, d: '威力 +8 / 発動 -0.2s' },
      ],
      awake: { amount: 2, dmgMul: 1.3, radiusMul: 1.2 },
    },
    konshingiri: {
      name: '渾身斬り', icon: 'ic_konshin',
      desc: '【斬ビルドの決め手】斬撃に渾身の冴えを宿す修飾。斬属性スキルの会心ダメージが3倍になる(自前の攻撃は持たない)。会心を積むほど化ける。',
      evolveWith: 'crit', evolveName: '一閃必殺', awakeDesc: '斬の会心が必殺と化し、刃が運命を断つ',
      base: { critX: 3.0 },
      levels: [
        { critX: 0.3, d: '斬 会心ダメ +0.3倍' },
        { critX: 0.3, d: '斬 会心ダメ +0.3倍' },
        { critX: 0.4, d: '斬 会心ダメ +0.4倍' },
        { critX: 0.4, d: '斬 会心ダメ +0.4倍' },
        { critX: 0.5, d: '斬 会心ダメ +0.5倍' },
        { critX: 0.6, d: '斬 会心ダメ +0.6倍' },
      ],
      awake: { critX: 1.5 },
    },
    hajingiri: {
      name: '破陣斬り', icon: 'ic_hajin',
      desc: '近くの妖へ大きな一閃を叩き込む。灯火圏内の妖には追加威力。陣を破る決め技。',
      evolveWith: 'might', evolveName: '破軍一閃', awakeDesc: '一閃が陣形を両断し、灯の妖を悉く斬る',
      base: { dmg: 42, cd: 2.2, radius: 320, litBonus: 1.7, crit: 0.08 },
      levels: [
        { dmg: 12, d: '威力 +12' },
        { radius: 16, d: '範囲 +16' },
        { dmg: 16, d: '威力 +16' },
        { radius: 18, d: '範囲 +18' },
        { dmg: 20, d: '威力 +20' },
        { dmg: 26, cd: -0.3, d: '威力 +26 / 発動 -0.3s' },
      ],
      awake: { dmgMul: 1.4, radiusMul: 1.2 },
    },
    raisou: {
      name: '雷槍', icon: 'ic_raisou',
      desc: '雷の槍を直線状に投じ、貫いた妖を撃ち感電させる。直線の群れを貫き、触れた妖の足を止める。',
      evolveWith: 'pierce', evolveName: '雷霆の長槍', awakeDesc: '槍が幾条にも裂け、戦場を雷で縫う',
      base: { dmg: 30, cd: 1.3, len: 520, width: 22, speed: 900, zapR: 85, slow: 0.4, crit: 0.07 },
      levels: [
        { dmg: 8, d: '威力 +8' },
        { width: 8, d: '太さ +8' },
        { len: 60, d: '射程 +60' },
        { dmg: 10, d: '威力 +10' },
        { width: 8, d: '太さ +8' },
        { dmg: 14, cd: -0.25, d: '威力 +14 / 発動 -0.25s' },
      ],
      awake: { dmgMul: 1.35, widthMul: 1.4 },
    },
    hourai: {
      name: '放雷', icon: 'ic_hourai',
      desc: '雷の力を溜め込み、雷ダメージが一定量に達すると全方位の広範囲へ一斉放電する。雷の得物を束ねるほど早く満ちる。',
      evolveWith: 'might', evolveName: '万雷の解放', awakeDesc: '溜めの間も漏電し、放電が絶えぬ',
      base: { dmg: 22, cd: 0.3, charge: 1250, radius: 250, crit: 0.1 },
      levels: [
        { dmg: 12, d: '威力 +12' },
        { charge: -90, d: '必要雷気 -90' },
        { radius: 24, d: '範囲 +24' },
        { dmg: 16, d: '威力 +16' },
        { charge: -110, d: '必要雷気 -110' },
        { dmg: 22, radius: 30, d: '威力 +22 / 範囲 +30' },
      ],
      awake: { dmgMul: 1.4, charge: -150 },
    },
    nokoribi: {
      name: '残り火', icon: 'ic_nokoribi',
      desc: '祓印を帯びた妖が倒れると、その場に残り火が燻り一定時間ダメージを与える(自前の攻撃は持たない・印ビルドと好相性)。',
      evolveWith: 'might', evolveName: '業火の燠', awakeDesc: '燠が消えず、踏む妖を永く焼く',
      base: { dmg: 18, r: 58, life: 2.6, tick: 0.3 },
      levels: [
        { dmg: 6, d: '威力 +6' },
        { r: 8, d: '範囲 +8' },
        { life: 0.6, d: '持続 +0.6s' },
        { dmg: 8, d: '威力 +8' },
        { r: 10, d: '範囲 +10' },
        { dmg: 10, life: 0.8, d: '威力 +10 / 持続 +0.8s' },
      ],
      awake: { dmgMul: 1.4, r: 16 },
    },
    messe: {
      name: '滅穢の火柱', icon: 'ic_messe',
      desc: '【呪火ビルドの決め手】祓印が満ちた妖(3段)を中心に、黒い火柱を噴き上げる。発動間隔は遅いが超ダメージ＋広範囲。印を満たすほど苛烈。',
      evolveWith: 'might', evolveName: '滅穢大火', awakeDesc: '黒炎が天を焦がし、穢れを根こそぎ焼く',
      base: { dmg: 260, cd: 3.8, radius: 240, crit: 0.12 },
      levels: [
        { dmg: 28, d: '威力 +28' },
        { radius: 18, d: '範囲 +18' },
        { cd: -0.4, d: '発動 -0.4s' },
        { dmg: 36, d: '威力 +36' },
        { radius: 20, d: '範囲 +20' },
        { dmg: 48, cd: -0.5, d: '威力 +48 / 発動 -0.5s' },
      ],
      awake: { dmgMul: 1.5, radiusMul: 1.25 },
    },
    kazuuchi: {
      name: '数打ちの極意', icon: 'ic_shots',
      desc: '【射ビルドの決め手】初期武器と射撃ジャンルの得物すべての発射数を増やす修飾(自前の攻撃は持たない)。弾幕を厚くする射の到達点。',
      evolveWith: 'crit', evolveName: '万箭一斉', awakeDesc: '放つ弾がさらに増え、夜を弾幕で覆う',
      base: { shots: 2 },
      levels: [ { shots: 1, d: '発射数 +1' } ],
      awake: { shots: 1 },
    },
  };

  // 得物のタグ(役割の見える化＋同タグ抽選補正用)。export_data.js が各 weapon に tags として付与。
  // 印=祓印関与 / 灯 / 結界 / 斬撃 / 射撃 / 音 / 守り / 移動 / 罠 / 雷
  // ビルドジャンルは6本(祓/斬/雷/守/射/呪火)に統一。各5-7個で偏り無し。trap/light/move/sound/wardは独立廃止し各ジャンルへ統合。
  D.WTAGS = {
    ofuda: ['mark'], laser: ['mark'], zangetsu: ['slash'],
    katana: ['slash'], fox: ['guard'],
    raitei: ['thunder'], kitsunebi: ['guard'], kekkai: ['guard'],
    juzu: ['shot'], komainu: ['guard'], shuriken: ['shot'],
    kusarigama: ['slash'], honoo: ['curse'],
    bonsho: ['mark'], hamaya: ['shot'], tanegashima: ['shot'],
    fuin: ['curse'], juso: ['curse'],
    sumiuchi: ['mark'], suzunari: ['mark'],
    norito: ['mark'], kagami_gaeshi: ['guard'],
    sanshu_harae: ['mark'], amenomihashira: ['mark'],
    inazuma: ['thunder'], raijin: ['thunder'], hyakuju: ['guard'],
    kasumigiri: ['slash'], konshingiri: ['slash'], hajingiri: ['slash'],
    raisou: ['thunder'], hourai: ['thunder'],
    nokoribi: ['curse'], messe: ['curse'], kazuuchi: ['shot'],
  };

  // 系統の表示情報 (得物タグ→和名+色)。ビルド構築時に視覚でジャンルを判別する用。
  D.TAGINFO = {
    mark:    { name: '祓印', color: '#ffd166' },
    slash:   { name: '斬撃', color: '#cdd6e6' },
    thunder: { name: '雷',   color: '#9fe6ff' },
    guard:   { name: '守り', color: '#a7d18b' },
    shot:    { name: '射撃', color: '#7fb8ff' },
    curse:   { name: '呪火', color: '#c08bff' },
  };
  // 宝具/秘術の役割→和名+色
  D.CATINFO = {
    offense: { name: '攻め', color: '#ff8a6b' },
    guard:   { name: '守り', color: '#a7d18b' },
    tempo:   { name: '機動', color: '#86e3c2' },
    mystic:  { name: '秘',   color: '#c8a0ff' },
  };

  // ---------------- passives (max Lv5) ----------------
  // cat = 役割 (offense=攻め / guard=守り / tempo=機動・回収)。レベルUPの抽選は cat が偏らないよう散らす
  D.P = {
    might:  { name: '力の勾玉',     icon: 'ic_might',  cat: 'offense', desc: '与える霊撃の威力を高める。',       per: 'Lv毎 威力 +12%',  apply: (s, lv) => { s.might += 0.12 * lv; } },
    crit:   { name: '朱の御印',     icon: 'ic_crit',   cat: 'offense', desc: '霊撃が妖の急所を穿ちやすくなる。', per: 'Lv毎 会心 +4%',   apply: (s, lv) => { s.crit += 0.04 * lv; } },
    haste:  { name: '神楽鈴',       icon: 'ic_haste',  cat: 'offense', desc: '霊撃の発動が速くなる。',           per: 'Lv毎 発動 -7%',   apply: (s, lv) => { s.haste *= Math.pow(0.93, lv); } },
    hp:     { name: '達磨の御守',   icon: 'ic_hp',     cat: 'guard',   desc: '最大体力を高める。取得時に少し回復。', per: 'Lv毎 体力 +25',   apply: (s, lv) => { s.maxHp += 25 * lv; } },
    regen:  { name: '霊泉の雫',     icon: 'ic_regen',  cat: 'guard',   desc: '時とともに体力が静かに癒えていく。', per: 'Lv毎 回復 +1.0/s', apply: (s, lv) => { s.regen += 1.0 * lv; } },
    lifesteal: { name: '吸命の蠱',  icon: 'ic_still',  cat: 'guard',   desc: '妖を討つたび、その精を吸って体力をわずかに癒す (撃破が回復に変わる)。', per: 'Lv毎 撃破回復 +0.15', apply: (s, lv) => { s.lifesteal += 0.15 * lv; } },
    speed:  { name: '韋駄天の足袋', icon: 'ic_speed',  cat: 'tempo',   desc: '駆ける速さを高める。',             per: 'Lv毎 移動 +8%',   apply: (s, lv) => { s.speed += 0.08 * lv; } },
    // reqPierceWeapon: pierceable な飛び道具の得物を持つ時だけ抽選 (近接等では無効=死にスキルなので隠す)
    // projOnly: 絵巻に「飛び道具専用」と明記するための印 / clashWeapon: 指定 trait を持つ武器の所持中は抽選しない (流派競合)
    pierce: { name: '貫きの鏃',     icon: 'ic_pierce', cat: 'offense', projOnly: true, desc: '放った弾が妖を貫くようになる。',   per: 'Lv毎 貫通 +1',    excludes: 'bounce', reqPierceWeapon: true, clashWeapon: 'bounce', apply: (s, lv) => { s.pierce += lv; } },
    bounce: { name: '跳ね鞠',       icon: 'ic_bounce', cat: 'offense', projOnly: true, desc: '放った弾が妖から妖へ跳ね移る。',   per: 'Lv毎 跳弾 +1',    excludes: 'pierce', reqPierceWeapon: true, apply: (s, lv) => { s.bounce += lv; } },
    // --- 追加宝具 (レア度高め) ---
    critdmg: { name: '止メの一手', icon: 'ic_crit',   cat: 'offense', desc: '会心の一撃が、さらに深く急所を抉る。',       per: 'Lv毎 会心威力 +25%', apply: (s, lv) => { s.critDmg += 0.25 * lv; } },
    dodge:   { name: '神避けの守', icon: 'ic_armor',  cat: 'guard',   desc: '紙一重で妖の攻撃を見切ることがある。',       per: 'Lv毎 回避 +6%',      apply: (s, lv) => { s.dodge += 0.06 * lv; } },
    tamegiri: { name: '気溜めの一刀', icon: 'ic_tamegiri', cat: 'offense', maxLv: 3, desc: '初期武器が「溜め」を帯びる。発動は遅くなるが、一撃の威力と刃・弾が大きくなる(溜め一撃)。', per: 'Lv毎 初期武器 威力↑/サイズ↑(発動は遅い)', apply: (s, lv) => { s.tgDmg = 1.55 + 0.3 * lv; s.tgSize = 1.4 + 0.18 * lv; s.tgCd = 1.5 - 0.05 * lv; } },
    lampboost: { name: '灯明の加護', icon: 'ic_lampboost', cat: 'guard', maxLv: 3, desc: '提灯の灯りに早く馴染み、灯火が長く燃える。滞在の段階が速く上がり、最大効力が長持ちする。', per: 'Lv毎 滞在上昇 +25% / 灯火持続 +30%', apply: (s, lv) => { s.lampDwell = (s.lampDwell || 0) + 0.25 * lv; s.lampHold = (s.lampHold || 0) + 0.30 * lv; } },
  };

  // ---------------- 秘術 (数値ではなく戦い方を変えるラン内技能) ----------------
  // levels は次の段で起きる変化。最大4系統まで所持できる。
  D.TALENTS = {
    konpaku: {
      name: '魂爆の印', icon: 'ic_bomb2', cat: 'mystic', maxLv: 3,
      desc: '討伐を重ねると、倒した妖を核に魂の爆発が起きる。',
      levels: ['32体ごとに魂爆・威力80', '26体ごと・威力120', '20体ごと・威力170'],
    },
    zansho: {
      name: '残照の型', icon: 'ic_might', cat: 'mystic', maxLv: 3,
      desc: '提灯の灯りに身を置く間、霊撃が冴え発動も速まる。',
      levels: ['灯内 威力+12% / 発動-6%', '灯内 威力+22% / 発動-11%', '灯内 威力+32% / 発動-16%'],
    },
    yawatari: {
      name: '夜渡り', icon: 'ic_speed', cat: 'tempo', maxLv: 3,
      desc: '灯りの外を駆けるほど足が速まり、連撃の猶予が伸びる。',
      levels: ['闇中 移動+10% / 連撃猶予+0.35秒', '闇中 移動+18% / 猶予+0.65秒', '闇中 移動+26% / 猶予+1秒'],
    },
    himori: {
      name: '火守の誓い', icon: 'ic_armor', cat: 'guard', maxLv: 3,
      desc: '灯内で身を守り、提灯を丈夫にして灯勢を集めやすくする。',
      levels: ['灯内 防御+2 / 提灯耐久+25%', '防御+3 / 耐久+50% / 灯勢+50%', '防御+5 / 耐久+75% / 灯勢2倍'],
    },
    tamayori: {
      name: '魂寄せの環', icon: 'ic_magnet', cat: 'tempo', maxLv: 3,
      desc: '魂を一定数拾うたび、周囲の魂を呼び寄せ技と結界を早める。',
      levels: ['18魂ごと 範囲260 / 合間-0.7秒', '14魂ごと 範囲340 / 合間-1.1秒', '10魂ごと 範囲440 / 合間-1.6秒'],
    },
    utsusemi: {
      name: '空蝉の法', icon: 'buff_kongo', cat: 'guard', maxLv: 3,
      desc: '一定時間ごとに痛手を一度だけ無効化し、周囲を祓う。',
      levels: ['55秒ごと / 反撃60', '43秒ごと / 反撃90', '32秒ごと / 反撃130'],
    },
    hikugi: {
      name: '火継ぎの作法', icon: 'ic_regen', cat: 'mystic', maxLv: 3,
      desc: '提灯を灯すたび、傷と奥義が回復し灯勢を受け取る。',
      levels: ['点灯時 体力+5 / 奥義+3 / 灯勢+4', '体力+9 / 奥義+5 / 灯勢+7', '体力+14 / 奥義+8 / 灯勢+11'],
    },
  };

  // ---------------- 共鳴 (宝具セットのシナジー) ----------------
  // ★削除(2026-06-29): 宝具の相乗効果は廃止。空配列にすると checkReso が何も立てず、
  //   各使用箇所の run.reso.<id> は全て falsy = 効果オフ、UIの相乗ヒントも出なくなる。
  D.RESO = [];

  // ---------------- enemies ----------------
  // move: chase=直進 / sine=ふらつき / hop=跳ねる / swoop=高速突進 / ranged=距離を取って射撃 / drift=ゆるい追尾
  //       charge=溜め→急な突進(予告:進路ライン) / slam=遠距離から範囲攻撃(予告:着弾円。結界札の内側なら防げる)
  // charge:{range 溜め開始距離, wind 溜め時間, spd 突進速度, time 突進時間, cd 再使用間隔}
  // slam:{range 維持間合い(遠距離砲撃), wind 詠唱(予告)時間, r 着弾半径, dmgMul ダメージ倍率, cd 再使用間隔}
  D.E = {
    imp:     { name: '小鬼',       spr: 'e_imp',     hp: 12,  spd: 64,  dmg: 8,  xp: 1, r: 8,  move: 'chase', anim: 0.22, fly: false },
    bat:     { name: '蝙蝠',       spr: 'e_bat',     hp: 9,   spd: 116, dmg: 6,  xp: 1, r: 7,  move: 'sine',  anim: 0.12, fly: true },
    lantern: { name: '提灯お化け', spr: 'e_lantern', hp: 15,  spd: 46,  dmg: 11, xp: 2, r: 10, move: 'drift', anim: 0.45, fly: true, light: true },
    kasa:    { name: '傘お化け',   spr: 'e_kasa',    hp: 22,  spd: 88,  dmg: 12, xp: 2, r: 9,  move: 'hop',   anim: 0.3,  fly: false },
    skel:    { name: '骸骨武者',   spr: 'e_skel',    hp: 48,  spd: 42,  dmg: 15, xp: 3, r: 11, move: 'chase', anim: 0.34, fly: false },
    onibi:   { name: '鬼火',       spr: 'e_onibi',   hp: 26,  spd: 74,  dmg: 9,  xp: 3, r: 8,  move: 'ranged', anim: 0.2, fly: true, light: true,
               shot: { cd: 3.4, speed: 165, dmg: 11, range: 260 } },
    oni:     { name: '赤鬼',       spr: 'e_oni',     hp: 70,  spd: 92,  dmg: 17, xp: 4, r: 11, move: 'charge', anim: 0.22, fly: false,
               charge: { range: 300, wind: 0.5, spd: 540, time: 0.32, cd: 3.0 } },
    nyudo:   { name: '大入道',     spr: 'e_nyudo',   hp: 160, spd: 36,  dmg: 24, xp: 8, r: 16, move: 'slam', anim: 0.5,  fly: false, kbResist: 0.7,
               slam: { range: 300, wind: 0.85, r: 61, dmgMul: 1.6, cd: 3.6 } },
    crow:    { name: '夜烏',       spr: 'e_crow',    hp: 29,  spd: 152, dmg: 10, xp: 2, r: 8,  move: 'swoop', anim: 0.1,  fly: true },
    // 油赤子: プレイヤーを無視して最寄りの提灯へ走り、油を舐めて消灯させる妖
    aburaakago: { name: '油赤子', spr: 'e_aburaakago', hp: 24, spd: 90, dmg: 12, xp: 2, r: 8, move: 'douse', anim: 0.16, fly: false, douse: 9 },
    // --- 朧月の古都 (stage 2) の妖 ---
    rokuro:   { name: 'ろくろ首',   spr: 'e_rokuro',   hp: 30,  spd: 56,  dmg: 12, xp: 3, r: 9,  move: 'ranged', anim: 0.3,  fly: false,
                shot: { cd: 3.0, speed: 185, dmg: 12, range: 300 } },
    hitotsume:{ name: '一つ目小僧', spr: 'e_hitotsume', hp: 95, spd: 68,  dmg: 16, xp: 4, r: 12, move: 'charge', anim: 0.28, fly: false,
                charge: { range: 320, wind: 0.55, spd: 580, time: 0.34, cd: 3.2 } },
    biwa:     { name: '琵琶牧々',   spr: 'e_biwa',     hp: 42,  spd: 56,  dmg: 13, xp: 3, r: 10, move: 'volley', anim: 0.4,  fly: true,
                volley: { range: 340, wind: 0.6, count: 5, spread: 0.62, speed: 205, dmg: 10, cd: 3.8 } },
    kyokotsu: { name: '狂骨',       spr: 'e_kyokotsu', hp: 22,  spd: 142, dmg: 11, xp: 2, r: 8,  move: 'swoop', anim: 0.12, fly: true },
    ungaikyo: { name: '雲外鏡',     spr: 'e_ungaikyo', hp: 130, spd: 42,  dmg: 18, xp: 5, r: 13, move: 'slam', anim: 0.45, fly: false, light: true, kbResist: 0.4,
                slam: { range: 300, wind: 0.78, r: 58, dmgMul: 1.5, cd: 3.8 } },
    // --- 黄泉比良坂 (stage 3) の妖 ---
    gaki:     { name: '餓鬼',       spr: 'e_gaki',     hp: 14,  spd: 123, dmg: 9,  xp: 1, r: 7,  move: 'chase', anim: 0.18, fly: false },
    shiryo:   { name: '死霊',       spr: 'e_shiryo',   hp: 28,  spd: 78,  dmg: 12, xp: 2, r: 8,  move: 'nova',  anim: 0.3,  fly: true, light: true,
                nova: { range: 165, wind: 0.7, count: 12, speed: 180, dmg: 8, cd: 4.2 } },
    kasha:    { name: '火車',       spr: 'e_kasha',    hp: 62,  spd: 158, dmg: 16, xp: 4, r: 10, move: 'swoop', anim: 0.1,  fly: false, light: true },
    dodomeki: { name: '百々目鬼',   spr: 'e_dodomeki', hp: 150, spd: 38,  dmg: 18, xp: 5, r: 13, move: 'slam', anim: 0.4, fly: false,
                slam: { range: 320, wind: 0.78, r: 63, dmgMul: 1.5, cd: 3.6 } },
    jikininki:{ name: '食人鬼',     spr: 'e_jikininki', hp: 270, spd: 34, dmg: 26, xp: 9, r: 16, move: 'charge', anim: 0.5,  fly: false, kbResist: 0.7,
                charge: { range: 340, wind: 0.62, spd: 620, time: 0.38, cd: 3.6 } },
  };

  // ---------------- bosses ----------------
  D.B = {
    tanuki: {
      name: '化け狸「八畳坊」', spr: 'b_tanuki', hp: 1200, spd: 58, dmg: 20, r: 45, anim: 0.4, scale: 2.4,
      xp: 60, at: 180, rank: 1,
      warn: '何かが化けて出る……',
    },
    nure: {
      name: '濡女', spr: 'b_nure', hp: 2600, spd: 105, dmg: 24, r: 39, anim: 0.3, fly: true, scale: 2.4,
      xp: 100, at: 420, rank: 2,
      warn: '濡れた髪の音が近づく……',
    },
    ushi: {
      name: '牛鬼', spr: 'b_ushi', hp: 6800, spd: 52, dmg: 28, r: 60, anim: 0.45, scale: 2.4,
      xp: 150, at: 660, rank: 4,
      warn: '大地が軋む――巨影が来る',
    },
    shuten: {
      name: '酒呑童子', spr: 'b_shuten', hp: 13500, spd: 62, dmg: 32, r: 57, anim: 0.5, scale: 2.4,
      xp: 300, at: 810, rank: 6,
      warn: '鬼神の王が、宴に飽いた',
    },
    nue: {
      name: '鵺', spr: 'b_nue', hp: 4200, spd: 112, dmg: 26, r: 45, anim: 0.22, fly: true, scale: 2.4,
      xp: 130, rank: 3,
    },
    gasha: {
      name: 'がしゃどくろ', spr: 'b_gasha', hp: 9500, spd: 38, dmg: 30, r: 58, anim: 0.55, scale: 2.4,
      xp: 220, rank: 5,
    },
    tsuchigumo: {
      name: '土蜘蛛', spr: 'b_tsuchigumo', hp: 3400, spd: 50, dmg: 25, r: 50, anim: 0.34, scale: 2.4,
      xp: 110, rank: 2, warn: '足元の土が、ざわめいている',
    },
    daitengu: {
      name: '大天狗', spr: 'b_daitengu', hp: 5600, spd: 96, dmg: 27, r: 46, anim: 0.3, scale: 2.4,
      xp: 140, rank: 3, warn: '木々がどよめく――翼の影',
    },
    ogama: {
      name: '大蝦蟇', spr: 'b_ogama', hp: 7800, spd: 46, dmg: 29, r: 56, anim: 0.42, scale: 2.4,
      xp: 170, rank: 4, warn: '沼の底から、低い唸りが',
    },
  };
  D.BOSS_ORDER = ['tanuki', 'nure', 'tsuchigumo', 'nue', 'daitengu', 'ushi', 'ogama', 'gasha', 'shuten'];
  D.BOSS_RANKS = [
    null,
    { name: '怪異', mark: '壱', color: '#b7c7b0' },
    { name: '大怪異', mark: '弐', color: '#8ed7c5' },
    { name: '妖将', mark: '参', color: '#8fc7ff' },
    { name: '大妖将', mark: '肆', color: '#d4a4ff' },
    { name: '災禍', mark: '伍', color: '#ff9b67' },
    { name: '鬼神', mark: '極', color: '#ff5a4a' },
  ];
  // 後の夜に再登場するボスは、同じ個体でも明確に格上の「深度個体」になる。
  D.BOSS_STAGE_ASCEND = [
    { hp: 1, dmg: 1, tempo: 1, grand: 1, title: '' },
    { hp: 1.10, dmg: 1.06, tempo: 1.08, grand: 0.92, title: '朧月' },
    { hp: 1.22, dmg: 1.12, tempo: 1.16, grand: 0.84, title: '黄泉' },
  ];
  // 高DPSビルドでも格上ほど十分な戦闘時間を持つ。壱は抑え、極は大きく伸ばす。
  D.BOSS_RANK_HP = [0, 1, 1.15, 1.35, 1.6, 1.9, 2.25];
  D.bossRankText = id => {
    const b = D.B[id], r = b && D.BOSS_RANKS[b.rank || 1];
    return r ? `${r.mark}ノ格・${r.name}` : '大妖';
  };
  D.BOSS_DMG_MUL = 1.6;    // ボス攻撃の全体威力倍率(苛烈化。弾/AoE/近接/落雷すべてe.dmg基準)。脅威UP: 1.35→1.6
  D.BOSS_AOE_MUL = 1.16;   // 大技感は残しつつ、回避可能な余白を確保
  D.BOSS_WIND_MUL = 3.315; // 現在の予告開始から攻撃発生までをさらに1.3倍へ延長
  D.BOSS_CD_MUL = 2.775;   // ボスの攻撃間隔を従来の1.5倍へ延長
  D.BOSS_HP_MUL = 6;       // 武器6枠・覚醒後のDPSを基準に、ボス戦が瞬殺されない全体倍率
  D.FIRST_BOSS_HP_MUL = 0.5;   // 道中の第1ボス(各夜の最初)だけHPを軽減=序盤の壁を緩和(半減)
  // 夜別の被ダメ猶予(stageIdx別の incoming damage 倍率)。序盤の夜を緩めて「まともなプレイヤーなら完走できる」入口に。
  // 後の夜(apexの理不尽が出る所)ほど full に戻す。ボット検証: night1 ×0.72 で完走率~15-20%(従来0%)、ボスは据え置き。
  D.STAGE_DMG_GRACE = [0.72, 0.85, 1.0];
  D.BOSS_HIT_RX_MUL = 1.7;     // ボスの横当たり半径 = e.r×この倍率(見た目の胴体幅に合わせ撃ち/接触を当てやすく。移動/AI/近接のe.rは不変)
  // ボスは画面の55〜79%を占めるほど巨大(足元から上へ~85%伸びる)。カメラ追従ゆえボスが上にいると上端が
  // 画面外へ出て「上で水平に切れて」見える(=描画/素材バグではなく超過)。ボス戦中だけ引いて全身を収める。
  D.BOSS_CAM_ZOOM = 0.8;       // ボス出現中のカメラ倍率(G.ZOOMへの乗数)。小さいほど引く。1で従来どおり
  D.BOSS_TELE_T = 0.85;        // ★全ボス攻撃の「予告→発生」までの秒数を統一(弾幕/突進/落雷/近接すべて同じ猶予に)
  D.EXPFX = true;          // 実験FX(ComfyUI生成・assets/fx_exp/)のON/OFF。false で全て無効化(すぐ戻せる)
  D.DASH_CD = 4.5;         // 翔(共通ダッシュ Shift/E)のクールタイム秒

  // 時間圧縮: 夜を最大8分に縮めたぶん、強さ曲線は 2.5 倍の時計で参照して同じ弧を保つ
  // (旧 length×4/3 の終端強度 = 新 length×2.5。length は ×0.5333 で再設定済み)
  D.TIME_COMP = 2.5;

  // ---------------- 灯りと結界 (本作の核機構) ----------------
  // 据置提灯は紅・蒼・白の灯紋を宿す戦術拠点。圏内撃破で灯勢が満ち、灯紋固有の祓いを放つ。
  // 消灯中の提灯は圏内に留まって点灯する。初点灯を3基重ねると「三灯共鳴」が発動。
  // 油赤子は灯勢の高い提灯へ寄り、消灯させて再点灯を一時封じる。
  D.LAMP = {
    hp: 90,
    igniteR: 72,
    igniteTime: 1.05,
    relightTime: 1.65,
    relightLock: 4,
    bless: 3,
    chargeNeed: 24,
    // 滞在(灯りの中に居続ける)で段階が上がり、効果と範囲が増す。
    // dwellStages = 各段の累積滞在秒。gap が広がる = 上の段ほど必要時間が長い。
    dwellStages: [4, 10, 18, 28],            // 1段4s / 2段10s / 3段18s / 4段28s (gap 4,6,8,10)
    dwellDecay: 2.2,                         // 灯りの外ではこの速さで滞在ゲージが減る
    stagePower: [1, 1.15, 1.3, 1.45, 1.6],  // 効果倍率 (index = 段階 0..4)。強すぎたのでナーフ (旧 max 2.6→1.6)
    stageRange: [1, 1.18, 1.36, 1.56, 1.8], // 範囲倍率 (index = 段階 0..4)
    maxHold: 10,                            // 最大効力(最終段)の持続秒。尽きると灯りが燃え尽きて一時停止 → 付け直しで再開
    afterglow: 4,                           // 残り火: 灯りを離れても段(=加護)を満充填で保つ猶予秒。尽きてからdwellDecayで減衰。「充填→持ち出して削る」リズムの核
  };
  // 全灯点灯ボーナス: ステージの全提灯を灯すと「灯明満ち」=百鬼退散の加護(位置を問わない常時バフ)
  D.LAMP_ALLLIT = { might: 0.25, armor: 4, regen: 2 };   // 威力+25% / 防御+4 / 回復+2.0/s

  // 祓印(はらいいん): 0-3段のコンボ通貨。付与で段が増え、段ごとに被ダメ増 (敵側=乗算積み回避)。
  // 3段で「祓い」=消費し清めの一撃。tier別に控えめ (ボスは更に小)。Unity版から移植 (visual-overhaul/harai-mark)。
  D.HARAI = {
    dur: 7,                          // 印の持続秒 (haraiDurMul で延長 / 灯火圏)。維持しやすく
    trash: [0, 0.08, 0.16, 0.26],    // デバフ主軸: 印持ちは全攻撃が大きく通る (段0..3)
    elite: [0, 0.06, 0.12, 0.20],    // 精鋭
    boss:  [0, 0.04, 0.09, 0.15],    // ボス: 3段で全被ダメ+15% (高難度ビルドの見返り。封殺は祝詞の消費側で)
    purgeMul: 1.1,                   // 祓い(消費)の基礎倍率 (purgeMul ステで増)
  };

  // Web版で未実装の得物 (Unity移植で data に入れたが js/ に fire/描画なし & アイコンがアトラス未収録)。
  // 抽選から除外して「選ぶと無反応＋表示崩れ」を防ぐ。Web実装したら順次このリストから外す。
  // [[web-primary-pivot]] の祓印スライス3で実装予定: 墨打ち/鈴鳴らし/清め塩/祝詞/鏡返し/反閇/曼荼羅/三種/御柱
  // 機能不全だった 礫/陣太鼓/撒き菱/注連縄 は削除済(2026-06-21・役割被り精選)。残りは全て実装済。
  D.WEB_WIP = [];
  D.LAMP_SIGILS = {
    koubou: {
      name: '紅灯', kanji: '攻', color: '#ff765c', glow: 'rgba(255,108,76,0.9)',
      desc: '妖を深く怯ませ、満ちれば紅蓮の祓いを放つ。',
      enemyDmgMul: 1.38, enemySlow: 0.48,
    },
    seiran: {
      name: '蒼灯', kanji: '迅', color: '#70d8ff', glow: 'rgba(92,202,255,0.9)',
      desc: '霊撃と魂寄せを速め、満ちれば魂を一斉に呼ぶ。',
      enemyDmgMul: 1.18, enemySlow: 0.58,
    },
    byakuren: {
      name: '白灯', kanji: '守', color: '#e9e0ba', glow: 'rgba(255,239,190,0.9)',
      desc: '傷を癒して身を守り、満ちれば敵弾を祓う。',
      enemyDmgMul: 1.22, enemySlow: 0.54,
    },
  };
  D.LAMP_SIGIL_ORDER = ['koubou', 'seiran', 'byakuren'];
  // 結界札: 足元に灯りの杭を打つ。光+鈍足+継続ダメージ+内部の敵弾を消す
  D.WARD = {
    r: 160,                        // 結界の灯り半径
    life: 9,                       // 持続秒
    cd: 12,                        // 設置のクールタイム (秒)
    tick: 0.5,                     // ダメージ間隔
    dmg: 16,                       // tick 威力 (might 乗算)
    slow: 0.35,                    // 内部の鈍足率
  };

  // ---------------- 百鬼語り (全文手書きのフレーバー文集) ----------------
  D.LORE = {
    // 絵巻の伝承: 討伐して初めて読める
    foe: {
      imp:       '鬼の眷属の末子。一匹は他愛もないが、百鬼の先触れとして群れで夜を行く。',
      bat:       '夜陰に紛れる羽音。古来「かわほり」と呼ばれ、闇からの遣いとされた。',
      lantern:   '百年を経た提灯に魂が宿った付喪神。破れ目から覗く長い舌は、行灯の油を嘗めた名残という。',
      kasa:      '捨てられた唐傘の成れの果て。一本足で跳ね回り、雨も降らぬ夜にけたけたと笑う。',
      skel:      '戦に果てて弔われなかった武者の骨。主君の名はとうに忘れ、太刀の振り方だけを覚えている。',
      onibi:     '雨の夜、川辺や墓所に燃える青白い火。近づく者の精気を吸って、ひとまわり大きくなる。',
      oni:       '言わずと知れた赤鬼。その肌の色は怒りの色と伝わる。力を誇り、痛みを知らない。',
      nyudo:     '見上げれば見上げるほど大きくなる坊主頭の巨妖。「見越した」と唱えれば消えるというが、唱える暇をくれるかどうか。',
      crow:      '深山の天狗に仕える烏たち。小さな頭巾を被り、夜空の高みから獲物を見定める。',
      rokuro:    '昼は嫋やかな女の姿。夜が更ければ、首だけが行灯の油を求めてするすると伸びる。',
      hitotsume: '額に大きな一つ目を持つ童僧。本来は人を驚かすだけの愛嬌者だが、百鬼の列に加わった夜は牙を剥く。',
      biwa:      '名器と謳われた琵琶が百年を経て化けた付喪神。誰も弾いていないのに、夜ごと葬送の調べを奏でる。',
      kyokotsu:  '井戸に打ち捨てられた者の骨の怨念。「狂骨」の名の通り、その恨みは骨の髄まで沁みている。',
      ungaikyo:  '百年を経た鏡の付喪神。覗き込んだ者の姿を映し取り、魂ごと鏡の中へ閉じ込めるという。',
      gaki:      '生前の貪りの報いで、満ちることなき飢えに堕ちた亡者。喉は針のように細く、腹は山のように膨れる。',
      shiryo:    '成仏できぬまま夜を彷徨う亡者。額の三角布は死装束の名残。合掌したまま、生者を行列へ誘う。',
      kasha:     '葬列を襲って亡骸を奪い去る、火を纏う獣。罪深き者の亡骸を地獄へ運ぶ車だと伝わる。',
      dodomeki:  '盗みを重ねた女の腕に、盗んだ銭の鳥目が百も宿って妖と化した。百の目に映れば、逃げ場はない。',
      jikininki: '僧の形をして死肉を喰らう鬼。生前、法を説きながら布施を貪った僧の成れの果てという。',
      tanuki:    '八畳敷に化けるという大狸。腹鼓は山をも揺らし、徳利を片手に夜道を歩く。化かされたが最後、朝まで帰り道は見つからない。',
      nure:      '川辺で長い髪を洗う女の妖。うっかり声をかけた者は濡れ髪に絡め取られ、二度と岸には上がれない。',
      nue:       '猿の面、虎の手足、蛇の尾を持つ怪鳥。黒雲とともに御所の空に現れ、帝を病に伏せさせた。源頼政の矢に射られて尚、夜空にはその声だけが残るという。',
      ushi:      '牛の首に鬼の体を持つ西国の大妖。性質は凶猛にして執念深く、影を舐められた者は必ず喰われると恐れられた。',
      gasha:     '野に果てて弔われなかった者たちの骨が、恨みを束ねて立ち上がった巨躯。夜半、がしゃがしゃと骨を鳴らして歩き、生者を摘んで喰う。',
      shuten:    '大江山に住まう鬼どもの頭領。都から姫君をさらい、血の酒宴を開いた。源頼光に毒酒で討たれたはずが――この夜、再び杯を掲げる。',
      tsuchigumo:'山中に棲む古い土蜘蛛。脚の数ほどの糸を吐き、地を掘って獲物の足元から喰らいつく。退治された塚の跡には、今も子蜘蛛が湧くという。',
      daitengu:  '深山の天狗を束ねる大天狗。羽団扇の一振りが谷を渡る突風を呼ぶ。慢心した修験者を攫っては、高い梢に置き去りにして嗤う。',
      ogama:     '沼の主と崇められた巨大な蝦蟇。口から水柱を噴き、長い舌で岸の獲物を一息に絡め取る。その吐く息は瘴気となり、近づく者を蝕むという。',
    },
    // 死亡画面: 殺した妖ごとの一文
    death: {
      imp:       '小さき牙も、百集まれば。小鬼たちが戦利品を取り合っている。',
      bat:       '羽音は、一つではなかった。',
      lantern:   '提灯の火がふっと消えた。あなたの灯も、共に。',
      kasa:      '雨も降らぬ夜に、傘に呑まれた。',
      skel:      '骸骨武者は今夜も律儀に務めを果たした。',
      onibi:     '青い火に巻かれて、地面には影だけが残った。',
      oni:       '金棒の唸りを聞いた。避け方は、次の夜に。',
      nyudo:     '見上げた時には、もう遅かった。',
      crow:      '夜烏は群れで狩る。覚えておくといい。',
      rokuro:    '長い首が、満足げにするすると戻っていった。',
      hitotsume: '一つ目がじっと見ていた。瞬きほどの間に、夜は終わった。',
      biwa:      '琵琶の音が止んだ。あれは葬送の調べだった。',
      kyokotsu:  '井戸の底から呼ぶ声に、とうとう捕まった。',
      ungaikyo:  '鏡が最後に映したのは、逃げるあなたの背中だった。',
      gaki:      '餓鬼の飢えは満ちない。あなたの分でも、足りなかった。',
      shiryo:    '死霊の行列に、見覚えのある影がひとつ増えた。',
      kasha:     '火車はあなたを乗せて走り去った。行き先は、聞くまでもない。',
      dodomeki:  '百の目が、逃げ道のすべてを見ていた。',
      jikininki: '食人鬼は丁寧に手を合わせてから、箸を取った。',
      tanuki:    '腹鼓の音が遠ざかっていく。勝鬨のように。',
      nure:      '濡れた髪は、最後まで離してくれなかった。',
      nue:       '鵺の声を聞いた者は長く生きられぬという。伝承は、正しかった。',
      ushi:      '牛鬼は執念深い。あなたの影を、最初から舐めていたのだ。',
      gasha:     '骨の指があなたを摘み上げた。雨ざらしの仲間がひとり増える。',
      shuten:    '酒呑童子は杯を掲げた。「良い宴であった」',
      tsuchigumo:'糸が四肢に絡みつく。土蜘蛛は、ゆっくりと塚の底へ引き込んでいった。',
      daitengu:  '突風に足をさらわれた。次に見えたのは、ずっと下に小さくなっていく地面だった。',
      ogama:     '長い舌が伸びてきた。沼の水面が、ぱしゃりと閉じた。',
    },
    // 夜明け直前 (生存 9 割以降) の死
    dawnDeath: [
      '空は白み始めていた。あと一息、届かなかった。',
      '鳥の声が聞こえる。だが夜明けを見る目は、もう無い。',
      '朝は、すぐそこまで来ていた。',
    ],
    // 決戦 (overtime) での死
    otDeath: [
      '決戦に敗れた。この夜は、明けない。',
      '鬼はまだ立っている。夜明けは取り上げられた。',
    ],
    genericDeath: [
      '百鬼に呑まれた。',
      '夜があなたの名を覚えた。次は、違う結末を。',
      '行列は何事もなかったかのように進んでいく。',
    ],
    // 夜明けの結び (ステージ × 使い手)
    win: {
      mori: {
        haru:    '森の夜が明けた。晴は御札を仕舞い、東雲に向かって一礼した。',
        suzu:    '鈴の音が朝靄に溶けていく。鈴は社へ帰り、まず湯を沸かすだろう。',
        mutsuki: '無月は刀を納めた。「月も沈んだか」とだけ呟いて。',
      },
      miyako: {
        haru:    '廃都に朝日が差す。瓦礫の影に、もう妖の気配はない。晴は短く息を吐いた。',
        suzu:    '鈴は崩れた鳥居に手を合わせた。この都にも、ちゃんと朝は来る。',
        mutsuki: '無月は都大路をひとり歩く。背の刀だけが、昨夜を覚えている。',
      },
      yomi: {
        haru:    '黄泉比良坂を、晴は生きて登り切った。坂の上の光は、ただ眩しかった。',
        suzu:    '死者の国にも鈴の音は届いた。鈴は振り返らずに坂を登った。',
        mutsuki: '無月は黄泉路に背を向けた。「迎えはまだ要らん」',
      },
    },
  };

  // エリートの二つ名: 名乗りと固有の性質 (手書き 10 種)
  D.ELITE_TITLES = [
    { t: '韋駄天',   mod: e => { e.spd *= 1.4; } },
    { t: '巌',       mod: e => { e.maxHp = e.hp = e.hp * 1.6; } },
    { t: '怨念',     mod: e => { e.deathBurst = true; } },               // 死して尚、弾を撒く
    { t: '福持ち',   mod: e => { e.buffRich = true; } },                 // 加護 2 個確定
    { t: '銭袋',     mod: e => { e.kobanRich = true; } },                // 小判 3 倍
    { t: '夜啼き',   mod: e => { e.dmg *= 1.4; } },
    { t: '手負い',   mod: e => { e.maxHp = e.hp = e.hp * 0.55; e.spd *= 1.5; } },
    { t: '大いなる', mod: e => { e.r *= 1.25; e.scale *= 1.25; e.maxHp = e.hp = e.hp * 1.3; } },
    { t: '魂満ち',   mod: e => { e.xp *= 2; } },
    { t: '古強者',   mod: e => { e.dmg *= 1.25; e.maxHp = e.hp = e.hp * 1.25; } },
  ];

  // ---------------- spawn waves ----------------
  // until 秒までの間有効な構成。w = type:weight
  D.WAVES = [
    { until: 60,  w: { imp: 1 } },
    { until: 150, w: { imp: 3, bat: 1.3 } },
    { until: 240, w: { imp: 2.6, bat: 1.8, lantern: 1.1, kasa: 0.6 } },
    { until: 330, w: { imp: 2, bat: 1.4, lantern: 1.4, kasa: 1.2, skel: 0.9 } },
    { until: 430, w: { imp: 1.4, bat: 1, lantern: 1.4, kasa: 1.2, skel: 1.5, onibi: 0.9 } },
    { until: 540, w: { lantern: 1, kasa: 1, skel: 1.6, onibi: 1.2, oni: 1.2, imp: 1.2, biwa: 0.8 } },
    { until: 660, w: { skel: 1.3, onibi: 1.2, oni: 1.7, crow: 0.9, nyudo: 0.55, imp: 1, biwa: 0.7, shiryo: 0.7 } },
    { until: 780, w: { oni: 1.9, nyudo: 1.0, crow: 1.3, onibi: 1.2, skel: 1.1 } },
    { until: 9999, w: { oni: 2.1, nyudo: 1.4, crow: 1.7, onibi: 1.1, imp: 2.2, skel: 1, biwa: 0.9, shiryo: 0.9 } },
  ];

  // scripted events
  D.EVENTS = [
    { at: 235, kind: 'ring', type: 'bat', n: 36, text: '蝙蝠の環!' },
    { at: 380, kind: 'ring', type: 'kasa', n: 24, text: '唐傘の輪舞!' },
    { at: 510, kind: 'ring', type: 'onibi', n: 9, text: '鬼火の包囲!' },   // 遠距離(鬼火)の一括湧きを16→9に(遠距離上限の趣旨に合わせ過密回避)
    { at: 600, kind: 'storm', type: 'crow', n: 26, text: '夜烏の嵐!' },
    { at: 735, kind: 'ring', type: 'skel', n: 26, text: '骸骨の囲い!' },
    { at: 778, kind: 'storm', type: 'crow', n: 34, text: '夜烏の大嵐!' },
    { at: 858, kind: 'ring', type: 'bat', n: 60, text: '百鬼、総出!' },
  ];

  // ambient flavor announcements
  D.ANN = [
    { at: 2,   main: '逢魔ヶ刻',     sub: '夜明けまで生き延びろ' },
    { at: 95,  main: '宵の口',       sub: '' },
    { at: 295, main: '夜半',         sub: '' },
    { at: 560, main: '丑三つ刻',     sub: '' },
    { at: 762, main: '暁闇',         sub: '' },
  ];

  // ---------------- scaling curves ----------------
  // 雑魚HPの伸び。終盤はプレイヤーDPSが急伸する(36倍)のに対し雑魚HPが追いつかず(旧5.5倍止まり)
  // 後半の雑魚が「近づくと即溶ける置物」になっていた。後半(t>300=clock120)から強めに伸ばし、
  // 夜明けで約9-10倍まで上げて存在感を戻す。min(8,..)で最長ステージ(黄泉)の暴騰を抑える。
  D.hpScale = t => 1 + (t / 60) * 0.20 + Math.min(8, Math.pow(Math.max(0, t - 300) / 60, 1.65) * 0.12);
  D.dmgScale = t => 1 + Math.min(0.9, (t / 900) * 0.9);
  D.spawnInterval = t => Math.max(0.34, 1.22 - t * 0.0009);
  D.batchN = t => Math.min(6, 1 + Math.floor(t / 170));
  D.maxAlive = t => Math.min(260, 48 + Math.floor(t * 0.23));
  // 約60秒ごとに「呼吸→増勢→高潮→余韻」を作る。常時飽和よりも波の到来が読め、高潮が緊迫する。
  D.waveIntervalMul = t => {
    const p = (t % 150) / 150;
    if (p < 0.14) return 1.28;
    if (p < 0.70) return 1.06 - ((p - 0.14) / 0.56) * 0.32;
    if (p < 0.90) return 0.68;
    return 0.82 + ((p - 0.90) / 0.10) * 0.34;
  };
  D.waveBatchBonus = t => {
    const p = (t % 150) / 150;
    return p >= 0.70 && p < 0.90 ? 1 : 0;
  };
  // 遠距離脅威(射撃/砲撃/弾幕)の同時生存上限: 画面が遠距離攻撃で溢れないようにする(序盤5→終盤12)
  D.RANGED_MOVES = { ranged: 1, slam: 1, volley: 1, nova: 1 };
  D.rangedCap = t => Math.min(10, 4 + Math.floor(t / 135));
  // 予備モーション(突進の溜め / 範囲攻撃の詠唱)から発動までの時間倍率
  D.TELE_WIND_MUL = 1.69;   // 予備モーション→攻撃の時間(c.wind 倍率)。1.3 を 2026-06-19 に ×1.3=1.69 へ
  // レベルアップの間隔を広げる (回数を減らしリズムを良く)。1回ごとは calcW の LEVEL_DMG で強化
  // 後半ほど必要魂を増やし、撃破が溢れてもモーダル中断が連発しないようにする (指数項を強めた)
  D.needXp = lvl => Math.round(10 + (lvl - 1) * 11 + Math.pow(lvl - 1, 1.75) * 1.2);   // 緩和(2026-06-23): 同じXPで到達Lv/ドロー数↑(線形15→11, 指数1.8/1.9→1.75/1.2)
  D.PLAYER_DMG_MUL = 0.8; // プレイヤー由来の全ダメージを一律80%へ
  D.ENEMY_HP_MUL = 1.5;   // 雑魚敵の基礎体力倍率
  D.LEVEL_DMG = 0.9;      // Lvアップ時の威力加算。従来1.5から40%減
  D.LEVEL_STAT_MUL = 0.8; // 射程・範囲・速度・CD短縮など連続値のLv上昇量
  D.LEVEL_FULL_STATS = { amount: 1, pierce: 1, bounce: 1, chains: 1, mines: 1, maxHits: 1, back: 1, cross: 1 };
  // 各ステージ中盤から雑魚HPを引き上げ、進行60%で3倍に到達する。
  D.midWaveHpMul = (clock, length) => {
    const p = length > 0 ? clock / length : 0;
    if (p <= 0.45) return 1;
    if (p >= 0.60) return 3;
    return 1 + ((p - 0.45) / 0.15) * 2;
  };

  D.ELITE_FIRST = 110;
  D.ELITE_EVERY = 38;
  D.ELITE = { hpMul: 6.5, dmgMul: 1.42, spdMul: 0.94, sizeMul: 1.48, xp: 30 };

  // ---------------- temporary blessings (rare kill drops) ----------------
  D.BUFFS = {
    aratama:  { name: '荒魂', kanji: '荒', color: '#ff5a3c', glow: 'rgba(255,90,60,0.65)',   dur: 10, desc: '威力2倍' },
    shinsoku: { name: '神速', kanji: '速', color: '#6ee8ff', glow: 'rgba(110,232,255,0.6)',  dur: 10, desc: '移動・発動 加速' },
    kongo:    { name: '金剛', kanji: '剛', color: '#ffd166', glow: 'rgba(255,209,102,0.65)', dur: 8,  desc: '無敵' },
    bunshin:  { name: '分身', kanji: '分', color: '#b18cff', glow: 'rgba(177,140,255,0.6)',  dur: 12, desc: '全武器の弾 +1' },
  };
  D.BUFF_DROP = 0.0035;
  D.BUFF_DROP_ELITE = 0.25;

  // ---------------- moon phases (run modifiers) ----------------
  // 毎ランひとつ選ばれる小さなルール差。強化だけでなく、湧きや宝匣のテンポも揺らす。
  D.MOON_PHASES = [
    {
      id: 'mikazuki', name: '三日月', kanji: '弦', color: '#9ad8ff',
      desc: '足取りが冴え、技と結界札が少し早く戻る。',
      mods: { speed: 0.08 }, skillCdMul: 0.92, wardCdMul: 0.86, spawnIntervalMul: 1.02,
    },
    {
      id: 'kogetsu', name: '狐月', kanji: '狐', color: '#ffd166',
      desc: '奥義が満ちやすいが、強き妖も寄ってくる。',
      mods: { magnet: 0.12 }, ultNeedMul: 0.88, eliteEveryMul: 0.86, enemyHpMul: 1.04,
    },
    {
      id: 'akatsuki', name: '朱月', kanji: '朱', color: '#ff7a5c',
      desc: '霊撃は鋭い。かわりに百鬼の圧も強まる。',
      mods: { might: 0.10, crit: 0.03 }, spawnIntervalMul: 0.90, enemyHpMul: 1.06,
    },
    {
      id: 'utsuro', name: '虚月', kanji: '虚', color: '#b18cff',
      desc: '宝匣の気配が増え、魂を拾うほど立て直しやすい。',
      mods: { regen: 0.25 }, chestEveryMul: 0.78, wardCdMul: 0.94,
    },
  ];
  D.rollMoon = () => D.MOON_PHASES[(Math.random() * D.MOON_PHASES.length) | 0];

  // ---------------- night pacts (mid-run risk / reward decisions) ----------------
  // Each offer contains two ordeals and one safe prayer. Ordeals temporarily
  // change the director, then grant a permanent run bonus when completed.
  D.PACT_SCHEDULE = [0.18, 0.42, 0.66];
  D.PACTS = {
    shura: {
      id: 'shura', name: '修羅の契', kanji: '殺', icon: 'ic_might', color: '#ff6b50',
      objective: 'kills', target: [40, 95, 165], dur: 48,
      desc: '押し寄せる百鬼を、力で祓い切れ。',
      risk: { spawnIntervalMul: 0.86, enemySpeedMul: 1.05 },
      reward: { might: 0.08 },
    },
    rengeki: {
      id: 'rengeki', name: '連祓の契', kanji: '連', icon: 'ic_haste', color: '#ffd166',
      objective: 'combo', target: [45, 90, 150], dur: 52,
      desc: '流れを切らさず、祓いを連ねよ。',
      risk: { enemyDmgMul: 1.10 },
      reward: { hasteMul: 0.95 },
    },
    kari: {
      id: 'kari', name: '首狩の契', kanji: '将', icon: 'ic_crit', color: '#e6a35c',
      objective: 'elite', target: [1, 2, 3], dur: 58,
      desc: '名を持つ強き妖を呼び、討ち取れ。',
      risk: { enemyDmgMul: 1.08, spawnElite: true },
      reward: { crit: 0.035, might: 0.035, reroll: 1 },
    },
    tamashii: {
      id: 'tamashii', name: '魂喰の契', kanji: '魂', icon: 'ic_magnet', color: '#8ab8ff',
      objective: 'souls', target: [55, 110, 185], dur: 50,
      desc: '危地へ踏み込み、散る魂を集めよ。',
      risk: { magnet: -0.20, speed: -0.05 },
      reward: { area: 0.09, magnet: 0.13 },
    },
    musho: {
      id: 'musho', name: '無傷の契', kanji: '潔', icon: 'ic_armor', color: '#7ee8a0',
      objective: 'nohit', target: [22, 31, 38], dur: 44,
      desc: '一撃も受けず、荒ぶる夜を凌げ。',
      risk: { spawnIntervalMul: 0.84, enemySpeedMul: 1.07 },
      reward: { maxHp: 18, armor: 1 },
    },
    inori: {
      id: 'inori', name: '静謐の祈り', kanji: '休', icon: 'ic_regen', color: '#b8c7e6',
      objective: 'safe',
      desc: '契りを結ばず、呼吸を整える。',
      riskText: '試練なし',
      rewardText: '体力 30%回復 / 奥義 25%充填',
    },
  };
  D.PACT_ORDER = ['shura', 'rengeki', 'kari', 'tamashii', 'musho'];

  // ---------------- stages ----------------
  // waveShift: ウェーブ表/湧き曲線の参照時刻倍率 (強い妖が早く来る)
  D.STAGES = [
    {
      id: 'mori', name: '逢魔ヶ刻の森', sub: '六分の夜', length: 360,
      hpMul: 1, dmgMul: 1, spawnMul: 0.82, waveShift: 2.5,
      tint: [7, 9, 22], ground: null,
      bosses: [
        { id: 'tanuki', at: 72 }, { id: 'nure', at: 168 },
        { id: 'tsuchigumo', at: 216 }, { id: 'daitengu', at: 270 }, { id: 'ushi', at: 324 },
      ],
      desc: '始まりの夜。百鬼の行列はここから生まれる。',
    },
    {
      id: 'miyako', name: '朧月の古都', sub: '七分の夜 ・ 鵺', length: 432,
      hpMul: 1.55, dmgMul: 1.25, spawnMul: 0.72, waveShift: 3.125,
      tint: [14, 7, 30], ground: 'rgba(80,50,120,0.07)',
      bosses: [
        { id: 'nure', at: 62 }, { id: 'tsuchigumo', at: 125 }, { id: 'nue', at: 185 },
        { id: 'daitengu', at: 245 }, { id: 'ushi', at: 300 }, { id: 'ogama', at: 355 },
        { id: 'gasha', at: 405 },
      ],
      // 都の妖たち (時刻は waveShift 後の参照時計)
      waves: [
        { until: 70,   w: { imp: 2, bat: 1 } },
        { until: 170,  w: { kasa: 2, bat: 1.2, rokuro: 0.8, imp: 1 } },
        { until: 280,  w: { kasa: 1.4, rokuro: 1.3, biwa: 1.2, lantern: 1, kyokotsu: 0.6 } },
        { until: 400,  w: { rokuro: 1.2, biwa: 1.3, kyokotsu: 1.3, hitotsume: 1.0, kasa: 0.8 } },
        { until: 540,  w: { hitotsume: 1.5, kyokotsu: 1.3, biwa: 1, ungaikyo: 0.7, rokuro: 1 } },
        { until: 700,  w: { hitotsume: 1.5, ungaikyo: 1.1, oni: 1.2, kyokotsu: 1.2, rokuro: 0.9 } },
        { until: 880,  w: { oni: 1.6, ungaikyo: 1.3, nyudo: 0.8, hitotsume: 1.2, kyokotsu: 1 } },
        { until: 9999, w: { oni: 2, nyudo: 1.3, ungaikyo: 1.4, hitotsume: 1.4, kyokotsu: 1.4 } },
      ],
      desc: '妖気濃き廃都。ろくろ首と一つ目が彷徨う。',
    },
    {
      id: 'yomi', name: '黄泉比良坂', sub: '八分の夜 ・ 終焉', length: 480,
      hpMul: 2.05, dmgMul: 1.55, spawnMul: 0.64, waveShift: 3.75,
      tint: [26, 5, 16], ground: 'rgba(120,30,30,0.08)',
      bosses: [
        { id: 'tsuchigumo', at: 50 }, { id: 'nue', at: 105 }, { id: 'daitengu', at: 160 },
        { id: 'ushi', at: 215 }, { id: 'ogama', at: 275 }, { id: 'gasha', at: 345 },
        { id: 'shuten', at: 432 },
      ],
      // 死者の国の行列
      waves: [
        { until: 70,   w: { gaki: 2, shiryo: 0.8 } },
        { until: 180,  w: { gaki: 2.2, shiryo: 1.4, skel: 0.7 } },
        { until: 300,  w: { shiryo: 1.5, skel: 1.3, onibi: 1, gaki: 1.6, kasha: 0.5 } },
        { until: 430,  w: { kasha: 1.2, skel: 1.4, dodomeki: 0.9, shiryo: 1.2, gaki: 1.2 } },
        { until: 580,  w: { dodomeki: 1.2, kasha: 1.3, jikininki: 0.6, onibi: 1.1, skel: 1.1 } },
        { until: 740,  w: { jikininki: 1.0, kasha: 1.4, dodomeki: 1.2, oni: 1.1, gaki: 1.8 } },
        { until: 920,  w: { jikininki: 1.3, oni: 1.6, dodomeki: 1.2, kasha: 1.4, nyudo: 0.9 } },
        { until: 9999, w: { jikininki: 1.6, nyudo: 1.4, oni: 1.8, kasha: 1.6, gaki: 2.4 } },
      ],
      desc: '帰らずの坂。餓鬼の群れと火車が駆ける。',
    },
  ];

  // ---------------- playable characters ----------------
  D.CHARS = {
    haru: {
      name: '陰陽師 晴', sub: '均衡', spr: 'p_', portrait: 'portrait_haru', portraitFile: 'assets/portraits/haru.png', weapon: 'ofuda', cost: 0,
      mods: {}, trait: '癖がなく扱いやすい',
      style: '狙撃札・結界・万能型',
      desc: '若き陰陽師。破魔の御札で夜を祓う。',
      forge: { per: '威力 +0.3% / 発動 -0.15% (毎Lv)', apply: (s, r) => { s.might += 0.003 * r; s.haste *= Math.pow(0.9985, r); } },
      forgeMilestones: [
        { lv: 25, name: '二の御札', desc: '初期武器の弾数 +1', apply: s => { s.shots += 1; } },
        { lv: 75, name: '祓いの冴え', desc: '会心 +6%', apply: s => { s.crit += 0.06; } },
        { lv: 100, name: '陰陽究め', desc: '威力 +12% / 防御 +5', apply: s => { s.might += 0.12; s.armor += 5; } },
      ],
      special: { name: '森羅の目', desc: '力ヲ選ベの選択肢が 4 つになる' },
    },
    suzu: {
      name: '巫女 鈴', sub: '範囲・縁', spr: 'pc_suzu_', portrait: 'portrait_suzu', portraitFile: 'assets/portraits/suzu.png', weapon: 'laser', cost: 800,
      mods: { area: 0.2, magnet: 0.4, might: -0.1 }, healMul: 1.5,
      trait: '範囲+20% / 吸引+40% / 回復1.5倍 / 威力-10%',
      style: '広範囲・回収・粘り勝ち',
      desc: '社の巫女。注連縄を廻して広く清める。',
      forge: { per: '範囲 +0.4% / 吸引 +0.6% (毎Lv)', apply: (s, r) => { s.area += 0.004 * r; s.magnet += 0.006 * r; } },
      forgeMilestones: [
        { lv: 25, name: '広縁', desc: '範囲 +10%', apply: s => { s.area += 0.10; } },
        { lv: 75, name: '集いの力', desc: '吸引 +50% / 毎秒回復 +1.5', apply: s => { s.magnet += 0.5; s.regen += 1.5; } },
        { lv: 100, name: '斎き究め', desc: '威力 +10% / 範囲 +10%', apply: s => { s.might += 0.10; s.area += 0.10; } },
      ],
      special: { name: '祓いの舞', desc: '体力が 3 割を切ると自動で大祓+回復 (60秒に一度)' },
    },
    mutsuki: {
      name: '浪人 無月', sub: '一撃・会心', spr: 'pc_mutsuki_', portrait: 'portrait_mutsuki', portraitFile: 'assets/portraits/mutsuki.png', weapon: 'zangetsu', cost: 1500,
      mods: { might: 0.15, crit: 0.08, speed: 0.05, area: -0.1 },
      trait: '威力+15% / 会心+8% / 移動+5% / 範囲-10%',
      style: '重い一撃・会心・月波',
      desc: '流浪の剣客。月を斬る一閃を放つ。',
      forge: { per: '威力 +0.3% / 会心 +0.1% (毎Lv)', apply: (s, r) => { s.might += 0.003 * r; s.crit += 0.001 * r; } },
      forgeMilestones: [
        { lv: 25, name: '鋭刃', desc: '会心 +6%', apply: s => { s.crit += 0.06; } },
        { lv: 75, name: '修羅', desc: '会心ダメージ +30%', apply: s => { s.critDmg += 0.30; } },
        { lv: 100, name: '月斬究め', desc: '会心 +8% / 威力 +10%', apply: s => { s.crit += 0.08; s.might += 0.10; } },
      ],
      special: { name: '残心', desc: '会心で妖を斬り伏せた時、月波が周囲を薙ぐ' },
    },
  };
  D.CHAR_ORDER = ['haru', 'suzu', 'mutsuki'];
  D.W_UNLOCKABLE = ['shuriken', 'kusarigama', 'tanegashima', 'fuin'];
  // setup 画面の得物カードに出す一言 (専用武器ぶん)
  D.W_BASEDESC = {
    ofuda: '狙い撃ちの呪符 ・ 扱いやすい (晴 専用)',
    zangetsu: '巨大な月の斬撃波 (無月 専用)',
  };
  // 注: shimenawa(注連縄) は調整盤の指示で削除済

  // ---------------- 奉納 (permanent upgrades bought with koban) ----------------
  // apply: ステータス系のみ (growth/zeni/fuku は使用箇所で参照)
  D.HONO = {
    might:  { name: '力の絵馬', icon: 'ic_might',  per: '威力 +3%',        ranks: 5, base: 180, apply: (s, r) => { s.might += 0.03 * r; } },
    hp:     { name: '体の絵馬', icon: 'ic_hp',     per: '体力 +10',        ranks: 5, base: 150, apply: (s, r) => { s.maxHp += 10 * r; } },
    speed:  { name: '足の絵馬', icon: 'ic_speed',  per: '移動 +2%',        ranks: 5, base: 150, apply: (s, r) => { s.speed += 0.02 * r; } },
    haste:  { name: '刻の絵馬', icon: 'ic_haste',  per: '発動 -2%',        ranks: 5, base: 220, apply: (s, r) => { s.haste *= Math.pow(0.98, r); } },
    magnet: { name: '縁の絵馬', icon: 'ic_magnet', per: '吸引 +10%',       ranks: 5, base: 120, apply: (s, r) => { s.magnet += 0.10 * r; } },
    armor:  { name: '守の絵馬', icon: 'ic_armor',  per: '防御 +1',         ranks: 3, base: 300, apply: (s, r) => { s.armor += r; } },
    growth: { name: '才の絵馬', icon: 'ic_growth', per: '経験 +4%',        ranks: 5, base: 200 },
    zeni:   { name: '銭の絵馬', icon: 'ic_zeni',   per: '小判 +10%',       ranks: 5, base: 250 },
    fuku:   { name: '福の絵馬', icon: 'ic_fuku',   per: '加護の出現 +10%', ranks: 3, base: 250 },
  };
  D.HONO_ORDER = ['might', 'hp', 'speed', 'haste', 'magnet', 'armor', 'growth', 'zeni', 'fuku'];
  D.honoCost = (cfg, rank) => cfg.base * (rank + 1);   // 次の段の値段

  // ---------------- 鍛錬 (使い手・得物・技のレベル制 / 小判) ----------------
  // スキル(武器)ごとの強化は廃止。鍛錬の対象は 使い手 / 得物(=使い手固定の初期武器のみ) / 技 の3本。
  // 各レベルで小さく数値が伸び、節目レベル(forgeMilestones)で能力が追加される。
  // 使い手・得物 = Lv上限100 / 技 = Lv上限50。
  D.FORGE = {
    charCap: 100, weaponCap: 100, skillCap: 50,
    specialAt: 50,                         // 使い手の特殊能力(森羅の目/祓いの舞/残心)が解放されるLv
    wDmgPerLevel: 0.005,                   // 得物: 毎Lv 威力 +0.5% (Lv100 で +50%)
    // 小判コスト: Lv→Lv+1 (lv は 0 始まり)。緩→急。調整可。
    cost: lv => Math.round(35 + lv * 16),
    // 得物の鍛錬対象 = 使い手の初期武器のみ (重複除外)
    weaponIds: (() => {
      const seen = {};
      const out = [];
      for (const id of D.CHAR_ORDER) {
        const w = D.CHARS[id].weapon;
        if (w && !seen[w]) { seen[w] = 1; out.push(w); }
      }
      return out;
    })(),
  };

  // ---------------- 奥義 (必殺技 ・ 出陣支度で 1 つ編成) ----------------
  // need = 討伐数。効果は特化させ、万能にしない (旧・百鬼祓いの全部入りが OP だった反省)
  D.ULTS = {
    harai:     { name: '百鬼祓い', kanji: '祓', need: 320, color: '#ffd166',
                 desc: '画面の妖を薙ぎ、敵弾を消す。威力は霊力に乗る。鬼神には薄い。' },
    kagome:    { name: '籠目',     kanji: '籠', need: 230, color: '#9ad8ff',
                 desc: '押し返して金剛 3 秒、小さく回復。' },
    arakagura: { name: '荒神楽',   kanji: '荒', need: 330, color: '#ff7a5c',
                 desc: '5 秒のあいだ、威力 2 倍と神速。' },
    tamayose:  { name: '魂寄せ',   kanji: '魂', need: 140, color: '#b18cff',
                 desc: '散らばる魂をすべて引き寄せる。' },
  };
  D.ULT_ORDER = ['harai', 'kagome', 'arakagura', 'tamayose'];

  // ---------------- 技 (合間=クールタイム式 ・ Shift / E ・ 鍛錬で3段強化) ----------------
  // rank(r) が鍛錬段位 r での実効値を返す
  // 別々の"動詞"に: カウンター防御 / 群れ制御(恐慌) / 拘束&火力増 / 祓い系。
  // ※機動斬撃(旧・韋駄天駆け[駆])は翔(M.dash・Shift共通ダッシュ)に統合し、技プールからは廃止。
  // rank(lv) は鍛錬レベル lv (0..50) での実効値。毎Lv小さく伸び、節目(forgeMilestones)で能力追加。
  D.SKILLS = {
    goho:    { name: '護法の珠',   kanji: '護', color: '#ffd166',
               desc: '唱えてから数秒だけ珠を纏う。その間に受ける痛手を一度だけ防ぎ、珠が弾けて周囲を打ち払う。受けなければ珠は虚しく消える(使い時の駆け引き)。',
               per: '返し威力 +1.8% / 構え +0.02s / 発動 -0.08s (毎Lv)',
               rank: lv => ({ cd: Math.max(8, 16 - 0.08 * lv), dmg: 72 * (1 + 0.018 * lv), counter: 165, guard: 3 + 0.02 * lv }),
               forgeMilestones: [
                 { lv: 10, name: '堅守', desc: '合間 -10%', apply: e => { e.cd *= 0.9; } },
                 { lv: 25, name: '反撃の珠', desc: '返し範囲 +40', apply: e => { e.counter += 40; } },
                 { lv: 40, name: '長気', desc: '構えの間 +1.0s', apply: e => { e.guard += 1.0; } },
                 { lv: 50, name: '金剛', desc: '返し威力 +35%', apply: e => { e.dmg *= 1.35; } },
               ] },
    hoeru:   { name: '吼える符',   kanji: '吼', color: '#ff7a5c',
               desc: '大喝で周囲の妖を弾き飛ばし、しばし怯えさせて逃げ散らす。囲みを割る制圧。',
               per: '恐慌 +0.01s / 威力 +1.2% (毎Lv)',
               rank: lv => ({ cd: Math.max(5.5, 9 - 0.025 * lv), dmg: 40 * (1 + 0.012 * lv), radius: 168, fear: 1.1 + 0.01 * lv }),
               forgeMilestones: [
                 { lv: 10, name: '大喝', desc: '恐慌 +0.3s', apply: e => { e.fear += 0.3; } },
                 { lv: 25, name: '威圧', desc: '範囲 +40', apply: e => { e.radius += 40; } },
                 { lv: 50, name: '獅子吼', desc: '威力 +40%', apply: e => { e.dmg *= 1.4; } },
               ] },
    kagenui: { name: '影縫い',     kanji: '縫', color: '#b18cff',
               desc: '周囲の妖の影を縫って動きを止め、被ダメ増の印を刻む(武器でまとめて狩る布石)。',
               per: '拘束 +0.01s / 発動 -0.04s (毎Lv)',
               rank: lv => ({ cd: Math.max(8, 12 - 0.04 * lv), radius: 190, root: 1.3 + 0.01 * lv, mark: 4, markAmp: 0.24 }),   // 強すぎた影縫いを調整(被ダメ増+30%→+24%/拘束1.4→1.3)
               forgeMilestones: [
                 { lv: 10, name: '長縛', desc: '拘束 +0.3s', apply: e => { e.root += 0.3; } },
                 { lv: 25, name: '深印', desc: '被ダメ印を強化 (+0.1)', apply: e => { e.markAmp += 0.1; } },
                 { lv: 50, name: '影狩り', desc: '範囲 +40', apply: e => { e.radius += 40; } },
               ] },
    seihara: { name: '清祓の印',   kanji: '清', color: '#ffe0a0',
               desc: '指定方向へ短い清め波を放ち、触れた妖に祓印を刻む。祓印が満ちた妖には小祓い。手で印を回す布石。',
               per: '印付与+ / 発動 -0.04s (毎Lv)',
               rank: lv => ({ cd: Math.max(4, 8 - 0.04 * lv), dmg: 46 * (1 + 0.015 * lv), radius: 175 }),   // 弱すぎた清祓を強化(威力30→46/範囲150→175)
               forgeMilestones: [
                 { lv: 10, name: '清波', desc: '範囲 +30', apply: e => { e.radius += 30; } },
                 { lv: 25, name: '深祓', desc: '祓印3への小祓い +30%', apply: e => { e.dmg *= 1.3; } },
                 { lv: 50, name: '常清', desc: '使用時 周囲の祓印持続 +2s', apply: e => { } },
               ] },
    kekkai:  { name: '結界札',     kanji: '結', color: '#ffd166',
               desc: '足元に清めの結界を張る。触れた敵弾を祓い、内側に居る間はボスの遠距離着弾(範囲攻撃)を防ぐ。籠って凌ぐ守りの要。',
               per: '持続 +0.05s / 発動 -0.05s (毎Lv)',
               rank: lv => ({ cd: Math.max(7, 11 - 0.05 * lv), r: 160 + 0.5 * lv, life: 9 + 0.05 * lv }),
               forgeMilestones: [
                 { lv: 10, name: '堅結', desc: '合間 -10%', apply: e => { e.cd *= 0.9; } },
                 { lv: 25, name: '広結', desc: '結界 範囲 +40', apply: e => { e.r += 40; } },
                 { lv: 50, name: '常結', desc: '結界 持続 +3s', apply: e => { e.life += 3; } },
               ] },
  };
  D.SKILL_ORDER = ['goho', 'hoeru', 'kagenui', 'seihara', 'kekkai'];

  // ---------------- 隠し相乗 (スキルの組合せで追加効果) ----------------
  // ゲーム内には recipe を明示しない。特定スキルを併せ持つと自動で発動し、見た目が変わって気づける。
  // need = 同時所持を要するスキル(得物)/宝具の id。発動判定は SYS.checkSynergies。
  // 隠し相乗。規則: ①各スキルは最大1相乗のみ ②必ず別ジャンル同士の組合せ(同ジャンル禁止)
  // ③効果は既存スキル/宝具と役割が被らない「組合せでしか生まれない新挙動」にする。
  // need の2スキルを両方所持で成立。kanji は成立演出の結印に使う。
  D.SYNERGIES = {
    denten: { name: '電纏', kanji: '電', need: ['raitei', 'shuriken'], color: '#9fe6ff',   // 雷×射
              tip: '手裏剣に雷気が宿り、命中先から敵へ電撃が伝う' },
    jujin:  { name: '呪刃', kanji: '呪', need: ['juso', 'katana'], color: '#c08bff',        // 呪火×斬
              tip: '呪われた妖を斬ると急所を断つ ─ 確定の会心で処刑する' },
    raisaku:{ name: '雷柵', kanji: '柵', need: ['inazuma', 'kekkai'], color: '#9fd8ff',     // 雷×守
              tip: '結界が妖を感電させ、弾かれた妖が触れた仲間へ雷を伝播させる' },
    gouka:  { name: '業火', kanji: '業', need: ['honoo', 'tanegashima'], color: '#ff8a4a',  // 呪火×射
              tip: '火縄銃の弾が炎の尾を曳き、通り道を焼き払う' },
    bakuin: { name: '縛印', kanji: '縛', need: ['sumiuchi', 'kagami_gaeshi'], color: '#bfe0ff', // 祓×守
              tip: '祓印が枷となり、印を負う妖の足を鈍らせる' },
    hiya:   { name: '狐矢', kanji: '狐', need: ['kitsunebi', 'hamaya'], color: '#7fd0ff',   // 守×射
              tip: '狐火に導かれ、破魔矢がゆるやかに獲物を追う' },
  };

  // ---------------- 実績 (絵巻) ----------------
  // chk は生涯統計 L (store 'life') を見る。reward: koban / weapon / char
  D.ACHIEVE = [
    { id: 'win0',     name: '夜明け',     cond: '逢魔ヶ刻の森を生き延びる',  chk: L => !!L.win0,                reward: { koban: 500 } },
    { id: 'boss1',    name: '狸退治',     cond: 'ボスを討つ',               chk: L => (L.bossKills || 0) >= 1, reward: { weapon: 'shuriken' } },
    { id: 'combo60',  name: '六十連撃',   cond: '一夜で 60 連撃',           chk: L => (L.maxCombo || 0) >= 60, reward: { weapon: 'kusarigama' } },
    { id: 'chest8',   name: '宝匣狩り',   cond: '宝匣を 8 つ開く',          chk: L => (L.chests || 0) >= 8,    reward: { weapon: 'tanegashima' } },
    { id: 'awaken1',  name: '初覚醒',     cond: '武器を覚醒させる',          chk: L => (L.awakens || 0) >= 1,   reward: { weapon: 'fuin' } },
    { id: 'souls5k',  name: '五千の魂',   cond: '魂を累計 5,000 集める',    chk: L => (L.souls || 0) >= 5000,  reward: { char: 'suzu' } },
    { id: 'win1',     name: '古都踏破',   cond: '朧月の古都を生き延びる',   chk: L => !!L.win1,                reward: { char: 'mutsuki' } },
    { id: 'otwin',    name: '決戦を制す', cond: '決戦でボスを討ち果たす',   chk: L => !!L.otWin,               reward: { koban: 800 } },
    { id: 'kills10k', name: '万鬼斬り',   cond: '妖を累計 10,000 体討つ',   chk: L => (L.kills || 0) >= 10000, reward: { koban: 800 } },
    { id: 'codex19',  name: '百鬼絵巻',   cond: '妖 19 種すべてを討つ',     chk: () => Object.keys(G.store.get('codexFoes', {})).filter(k => D.E[k]).length >= 19, reward: { koban: 1000 } },
  ];

  // ---------------- treasure chests ----------------
  D.CHEST = {
    first: 30,            // 最初の宝箱は 0:30
    every: 30,            // 以後 30秒ごとに出現 (max未満なら)
    max: 2,               // 未取得で同時に存在できる数
    life: 15,             // 未取得は 15秒で消滅
    dist: [620, 880],     // プレイヤーからの出現距離
    slots: 3,             // 宝箱=スキルのみ3枠固定の抽選 (大当たり廃止)
  };

  return D;
})();
