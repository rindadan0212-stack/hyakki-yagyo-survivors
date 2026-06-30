"""assets/_gen/<cat>/ の生1024画像を game-ready 素材にする。

- fx   : 輝度→アルファ(加算合成FX向け・黒は透過/光は不透明)。トリム→正方→256px → assets/fx_exp/<name>.png
- prop : 縁から黒背景をフラッドフィル除去(内部の暗部は保持)。トリム→ assets/_gen/_ready/prop/<name>.png
- icon : 同上(object)で透過。256px正方 → assets/_gen/_ready/icon/<name>.png

使い方:
  python tools/postprocess_gen.py            # assets/_gen 配下を全処理
  python tools/postprocess_gen.py --cat fx
  python tools/postprocess_gen.py --only sakura_storm
"""
from __future__ import annotations
import argparse
from collections import deque
from pathlib import Path
import numpy as np
from PIL import Image


def luminance(arr):
    return arr[:, :, 0] * 0.299 + arr[:, :, 1] * 0.587 + arr[:, :, 2] * 0.114


def trim_to_alpha(im: Image.Image, thr=8, pad=6):
    a = np.asarray(im)[:, :, 3]
    ys, xs = np.where(a > thr)
    if len(xs) == 0:
        return im
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    x0 = max(0, x0 - pad); y0 = max(0, y0 - pad)
    x1 = min(im.width - 1, x1 + pad); y1 = min(im.height - 1, y1 + pad)
    return im.crop((x0, y0, x1 + 1, y1 + 1))


def square_pad(im: Image.Image):
    w, h = im.size
    s = max(w, h)
    out = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    out.paste(im, ((s - w) // 2, (s - h) // 2))
    return out


def glow_alpha(im: Image.Image, floor=12, boost=1.18, vin0=0.58, vin1=0.95):
    """加算FX用: アルファ=輝度 × 放射状フォールオフ。純黒を切り、光は中央で不透明・縁で完全透明。
    vin(ビネット)で矩形境界を消す: 中心(r=0)〜vin0 は素通し、vin0→vin1 で減衰、vin1 以遠は0。
    これにより「キャンバス全面の絵がそのまま矩形で出る=コラ感」を排除し、FXとして自然に溶け込ませる。"""
    arr = np.asarray(im.convert("RGB")).astype(np.float32)
    H, W = arr.shape[:2]
    lum = luminance(arr)
    a = np.clip((lum - floor) / (255 - floor) * 255 * boost, 0, 255)
    yy, xx = np.mgrid[0:H, 0:W]
    r = np.sqrt(((xx - W / 2.0) / (W / 2.0)) ** 2 + ((yy - H / 2.0) / (H / 2.0)) ** 2)  # 0=中心, 1=辺中央, ~1.41=隅
    vig = np.clip((vin1 - r) / (vin1 - vin0), 0.0, 1.0)  # vin0までは1, vin1で0
    a = a * vig
    out = np.dstack([arr, a]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def flood_bg_alpha(im: Image.Image, dark_thr=42):
    """object用: 画像の縁から連結する暗い背景だけ透過。内部の暗部は残す。"""
    arr = np.asarray(im.convert("RGB"))
    H, W = arr.shape[:2]
    lum = luminance(arr.astype(np.float32))
    darkish = lum < dark_thr
    bg = np.zeros((H, W), dtype=bool)
    dq = deque()
    for x in range(W):
        for y in (0, H - 1):
            if darkish[y, x] and not bg[y, x]:
                bg[y, x] = True; dq.append((y, x))
    for y in range(H):
        for x in (0, W - 1):
            if darkish[y, x] and not bg[y, x]:
                bg[y, x] = True; dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and darkish[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True; dq.append((ny, nx))
    a = np.where(bg, 0, 255).astype(np.uint8)
    # 縁を少しソフトに(1px収縮の代わりに暗背景との境界の輝度で軽く減衰)
    out = np.dstack([arr, a]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gen", default="assets/_gen")
    ap.add_argument("--cat", default="")
    ap.add_argument("--only", default="")
    ap.add_argument("--fx-size", type=int, default=256)
    ap.add_argument("--prop-size", type=int, default=320)
    ap.add_argument("--icon-size", type=int, default=256)
    args = ap.parse_args()
    root = Path(__file__).resolve().parent.parent
    gen = root / args.gen
    only = {n.strip() for n in args.only.split(",") if n.strip()}

    fx_out = root / "assets/fx_exp"
    ready = gen / "_ready"
    n = 0
    for cat in ("fx", "prop", "icon"):
        if args.cat and cat != args.cat:
            continue
        cdir = gen / cat
        if not cdir.exists():
            continue
        for src in sorted(cdir.glob("*.png")):
            name = src.stem
            if only and name not in only:
                continue
            im = Image.open(src).convert("RGBA")
            if cat == "fx":
                im = glow_alpha(im)
                im = trim_to_alpha(im, thr=10)
                im = square_pad(im)
                im = im.resize((args.fx_size, args.fx_size), Image.LANCZOS)
                dest = fx_out / f"{name}.png"
            else:
                im = flood_bg_alpha(im)
                im = trim_to_alpha(im, thr=8)
                size = args.icon_size if cat == "icon" else args.prop_size
                im = square_pad(im) if cat == "icon" else im
                # propはアスペクト維持で長辺=size
                if cat == "prop":
                    w, h = im.size; f = size / max(w, h)
                    im = im.resize((max(1, round(w * f)), max(1, round(h * f))), Image.LANCZOS)
                else:
                    im = im.resize((size, size), Image.LANCZOS)
                d = ready / cat
                d.mkdir(parents=True, exist_ok=True)
                dest = d / f"{name}.png"
            dest.parent.mkdir(parents=True, exist_ok=True)
            im.save(dest)
            n += 1
            print(f"[{cat}] {name} -> {dest.relative_to(root)}  {im.size}")
    print(f"done {n}")


if __name__ == "__main__":
    main()
