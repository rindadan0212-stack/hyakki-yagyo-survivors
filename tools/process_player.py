"""生成した晴(_gen/char/haru_<pose>.png)を輪郭抽出→図の高さ正規化→足元アンカーで
プレイヤーの代表フレームに焼き込む。プレイヤーは状態ごと代表1枚方式(REP)なので5ポーズで足りる。

  REP = idle:0 / walk:3 / cast:2 / dash:1 / hurt:0  (entities.js drawPlayer)
  → p_idle_0, p_walk_3, p_cast_2, p_dash_1, p_hurt_0 + p_0(hitOff/死亡ポーズ)

使い方: python tools/process_player.py [--check]   # --check=チェッカー確認用シートのみ
"""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parent))
from cutout import extract, trim

ROOT = Path(__file__).resolve().parent.parent
GEN = ROOT / "assets/_gen/char"
OUTDIR = ROOT / "assets/sprites/animation/p"
MANI = ROOT / "assets/sprites/manifest.json"

CANVAS_FIG = 120     # 図の正規化高さ(px)
S = 0.64             # manifest(表示単位)/canvas px。図 120 × S × UNIT_SCALE(1.4) ≈ 107px(現行と同等)
PAD = 10
# pose -> (生成src, 焼き込むframe key群)
POSES = {
    'idle': ('haru_idle', ['p_idle_0', 'p_0']),
    'walk': ('haru_walk', ['p_walk_3']),
    'cast': ('haru_cast', ['p_cast_2']),
    'dash': ('haru_dash', ['p_dash_1']),
    'hurt': ('haru_hurt', ['p_hurt_0']),
}


def checker(w, h, s=10):
    im = Image.new("RGB", (w, h))
    px = im.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = (70, 74, 86) if ((x // s + y // s) & 1) else (44, 47, 57)
    return im


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--tol', type=int, default=40)
    args = ap.parse_args()
    mani = json.loads(MANI.read_text(encoding='utf-8'))
    OUTDIR.mkdir(parents=True, exist_ok=True)
    chk = []
    for pose, (src, keys) in POSES.items():
        p = GEN / f"{src}.png"
        if not p.exists():
            print("MISS", src); continue
        im, info = extract(Image.open(p), tol=args.tol)
        im = trim(im, thr=10, pad=2)
        fw, fh = im.size
        f = CANVAS_FIG / fh
        im = im.resize((max(1, round(fw * f)), CANVAS_FIG), Image.LANCZOS)
        cw, ch = im.width + 2 * PAD, im.height + 2 * PAD
        canvas = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
        canvas.paste(im, (PAD, PAD))
        w_disp = round(cw * S, 3); h_disp = round(ch * S, 3)
        ax = round((PAD + im.width / 2) * S, 3); ay = round((PAD + im.height) * S, 3)  # 足元=図の下端
        a = np.asarray(canvas)[:, :, 3]
        opaque = round(float((a > 200).mean()), 2)
        chk.append((pose, canvas, info, opaque))
        if not args.check:
            for key in keys:
                canvas.save(OUTDIR / f"{key}.png")
                mani['sprites'][key] = {'file': f'animation/p/{key}.png', 'w': w_disp, 'h': h_disp, 'ax': ax, 'ay': ay}
        print(f"{pose:5} fig{fw}x{fh}->canvas{cw}x{ch} disp{w_disp}x{h_disp} ax{ax} ay{ay} bg_ok={info.get('ok')} opaque={opaque}")
    if not args.check:
        MANI.write_text(json.dumps(mani, ensure_ascii=False, indent=2), encoding='utf-8')
        print("manifest updated")
    # チェッカー確認シート
    cell = 180
    sheet = Image.new("RGB", (cell * len(chk), cell + 16), (20, 22, 28))
    from PIL import ImageDraw
    d = ImageDraw.Draw(sheet)
    for i, (pose, canvas, info, opaque) in enumerate(chk):
        c = canvas.copy(); c.thumbnail((cell - 8, cell - 8))
        bg = checker(c.width, c.height); bg.paste(c.convert("RGB"), (0, 0), c)
        sheet.paste(bg, (i * cell + 4, 16))
        d.text((i * cell + 4, 3), f"{pose} op{opaque}", fill=(220, 225, 255))
    sheet.save(ROOT / "_player_check.png")
    print("check sheet -> _player_check.png")


if __name__ == '__main__':
    main()
