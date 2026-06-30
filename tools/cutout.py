"""輪郭ベースの背景抜き(チョマキー+縁フラッドフィル+アンチエイリアス縁)。

単色背景(黒/緑/赤/マゼンタ等、画像ごとに自動判定)の上に置かれた1オブジェクトを、
輪郭で境界を把握して切り抜く。暗いオブジェクトでも内部が抜けないよう「縁から連結する背景」だけ除去。
縁は1pxフェザーでAA。背景色のにじみ(フリンジ)は除染。

使い方:
  python tools/cutout.py --in assets/_gen/prop --map props --out assets/sprites/world --size 148
  python tools/cutout.py --in <dir> --out <dir>            # 同名で書き出し(マップ無し)
"""
from __future__ import annotations
import argparse, json
from collections import deque
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent

# source名 -> ゲームkey (props 用)
PROP_MAP = {
    'stone_lantern': 'prop_toro', 'paper_lantern': 'prop_chochin', 'dead_tree': 'prop_kareki', 'sakura_storm': 'prop_sakura',
    'gravestone': 'prop_haka', 'spirit_gate': 'prop_reimon', 'torii_gate': 'prop_torii2', 'water_splash': 'prop_nami',
    'jizo_statue': 'prop_jizo2', 'fox_statue': 'prop_kitsune', 'bone_pile': 'prop_hone', 'spider_web': 'prop_kumo',
    'old_well': 'prop_ido', 'skull_lantern': 'prop_dokuro', 'stone_buddha': 'prop_butsu', 'dead_bush': 'prop_kuzu',
    'broken_torii': 'prop_torii_oimg', 'offering_stand': 'prop_kumotsu', 'higanbana': 'prop_higanbana', 'susuki': 'prop_susuki',
    'fox_mask': 'prop_kitsunemen', 'ema_rack': 'prop_ema', 'kagaribi': 'prop_kagaribi', 'mush_ring': 'prop_kinoko',
    'bamboo_grove': 'prop_take', 'rock_cairn': 'prop_tou', 'lotus_pond': 'prop_hasu', 'skull_fire': 'prop_dokurobi',
}


def detect_bg(rgb):
    """4隅から背景色と均一度を推定。均一(=単色背景)なら(bg, True)、ばらつけば(_, False)。"""
    s = 10
    H, W = rgb.shape[:2]
    patches = [rgb[:s, :s], rgb[:s, -s:], rgb[-s:, :s], rgb[-s:, -s:]]
    cps = np.concatenate([p.reshape(-1, 3) for p in patches], 0)
    bg = np.median(cps, 0)
    # 各隅の中央値が互いに近いか(全隅が同色 = 単色背景)
    cmeds = np.array([np.median(p.reshape(-1, 3), 0) for p in patches])
    spread = np.sqrt(((cmeds - bg) ** 2).sum(1)).max()
    return bg, spread < 36   # 全隅が背景色に近ければ単色背景


def flood_bg(isbg):
    """縁から連結する背景(True)だけを残すマスク。内部の背景色の穴は残さない(=オブジェクト内部を保護)。"""
    H, W = isbg.shape
    bg = np.zeros((H, W), bool)
    dq = deque()
    for x in range(W):
        for y in (0, H - 1):
            if isbg[y, x] and not bg[y, x]:
                bg[y, x] = True; dq.append((y, x))
    for y in range(H):
        for x in (0, W - 1):
            if isbg[y, x] and not bg[y, x]:
                bg[y, x] = True; dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and isbg[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True; dq.append((ny, nx))
    return bg


def extract(im, tol=40, work=512, feather=0.9):
    """輪郭抽出。戻り: (RGBA画像, info)。info.ok=単色背景で抜けた / opaque=不透明率。"""
    im = im.convert('RGBA')
    arr = np.asarray(im).astype(np.float32)
    rgb = arr[:, :, :3]
    H, W = rgb.shape[:2]
    bg, uniform = detect_bg(rgb)
    if not uniform:
        return im, {'ok': False, 'reason': 'non-uniform-bg(情景の絵=抽出不能)', 'opaque': 1.0}
    dist = np.sqrt(((rgb - bg) ** 2).sum(2))
    isbg = dist < tol
    # フラッドフィルは作業解像度で(高速化)→マスクを元解像度へ
    if max(H, W) > work:
        sc = work / max(H, W)
        small = np.asarray(Image.fromarray((isbg * 255).astype(np.uint8)).resize((max(1, int(W * sc)), max(1, int(H * sc))), Image.NEAREST)) > 127
        bgs = flood_bg(small)
        bgmask = np.asarray(Image.fromarray((bgs * 255).astype(np.uint8)).resize((W, H), Image.NEAREST)) > 127
        bgmask = bgmask & isbg   # 元解像度の背景判定で締める
    else:
        bgmask = flood_bg(isbg)
    alpha = np.where(bgmask, 0.0, 255.0)
    # AA: アルファをわずかにぼかして縁を滑らかに(輪郭のジャギー解消)
    a_im = Image.fromarray(alpha.astype(np.uint8)).filter(ImageFilter.GaussianBlur(feather))
    alpha = np.asarray(a_im).astype(np.float32)
    # 除染: 縁(部分透明)で背景色のにじみを引く(暗/色背景のフリンジ除去)
    rim = (alpha > 8) & (alpha < 248)
    if rim.any():
        a = (alpha[rim] / 255.0)[:, None]
        rgb[rim] = np.clip((rgb[rim] - bg * (1 - a)) / np.maximum(a, 0.2), 0, 255)
    out = np.dstack([rgb, alpha]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA'), {'ok': True, 'bg': bg.round().astype(int).tolist(), 'opaque': round(float((alpha > 200).mean()), 2)}


def trim(im, thr=8, pad=4):
    a = np.asarray(im)[:, :, 3]
    ys, xs = np.where(a > thr)
    if not len(xs):
        return im
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    return im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad + 1), min(im.height, y1 + pad + 1)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='inp', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--map', default='')
    ap.add_argument('--size', type=int, default=0)
    ap.add_argument('--manifest', action='store_true')
    args = ap.parse_args()
    indir = ROOT / args.inp
    outdir = ROOT / args.out
    outdir.mkdir(parents=True, exist_ok=True)
    mp = PROP_MAP if args.map == 'props' else None
    mani = None
    if args.manifest:
        mpath = ROOT / 'assets/sprites/manifest.json'
        mani = json.loads(mpath.read_text(encoding='utf-8'))
    bad = []
    for src in sorted(indir.glob('*.png')):
        key = (mp.get(src.stem) if mp else None) or src.stem
        if mp and not mp.get(src.stem):
            continue
        im, info = extract(Image.open(src))
        if not info['ok'] or info['opaque'] > 0.93:
            bad.append((key, info.get('reason', 'opaque%.2f' % info['opaque'])))
        im = trim(im)
        if args.size:
            f = args.size / max(im.size)
            im = im.resize((max(1, round(im.width * f)), max(1, round(im.height * f))), Image.LANCZOS)
        im.save(outdir / f'{key}.png')
        if mani is not None:
            mani['sprites'][key] = {'file': f'world/{key}.png', 'w': im.width, 'h': im.height, 'ax': round(im.width / 2, 1), 'ay': im.height}
        print(f"{'OK ' if info['ok'] else '!! '}{key:18} opaque={info['opaque']:.2f} {info.get('reason','')}")
    if mani is not None:
        (ROOT / 'assets/sprites/manifest.json').write_text(json.dumps(mani, ensure_ascii=False, indent=2), encoding='utf-8')
    if bad:
        print('\n抽出不能/疑い(要・再生成):', ', '.join(f'{k}({r})' for k, r in bad))


if __name__ == '__main__':
    main()
