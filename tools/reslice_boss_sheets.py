"""既存ボスのアニメシート(animation_sheets/b_*_sheet_v2_alpha.png, 6x4@256)を
切れ無しで再分割し、manifest.json を更新する。

現行 animation/b_*/*.png は 256セルの内側だけを切り出して幅広ポーズが端で切れている。
本スクリプトは:
  1. 各現行フレームを、シルエット相関の一意割当でソースセルに対応付け(現行の見た目を保つ)
  2. そのセルを「ボスごとの共通窓(全フレーム内容のunion)」で全内容クロップ=切れ無し・均一サイズ
  3. 表示倍率Sは現行manifestから継承(ボディの大きさ・足元位置を維持)
  4. manifest.json の該当エントリ(w/h/ax/ay)を更新

使い方: python tools/reslice_boss_sheets.py [--montage] [--dry-run]
"""
from __future__ import annotations
import argparse, json, os, glob
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SHEETS = ROOT / "assets/sprites/animation_sheets"
ANIM = ROOT / "assets/sprites/animation"
MANIFEST = ROOT / "assets/sprites/manifest.json"
BOSSES = ["b_tanuki", "b_nure", "b_ushi", "b_nue", "b_gasha", "b_shuten", "b_daitengu", "b_tsuchigumo", "b_ogama"]
COLS, ROWS = 6, 4
ATHR = 40        # alpha threshold for content (エフェクト含む全内容)
BODY_THR = 140   # 本体(solid)判定の高alpha閾値: faint なオーラ/エフェクトの光を除外し、キャラ本体だけを取る
TARGET_BODY = 130.0   # 全ボス共通の本体表示高さ(display units) = サイズ統一の基準
TARGET_PX = 150       # 出力PNGの最大辺(px)。表示はmanifest(display単位)依存なので解像度を落としてもサイズ不変=データ削減


def content_bbox(alpha, thr=ATHR):
    ys, xs = np.where(alpha > thr)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def thumb(alpha):
    bb = content_bbox(alpha)
    if not bb:
        return None
    x0, y0, x1, y1 = bb
    sub = (alpha[y0:y1 + 1, x0:x1 + 1] > ATHR).astype(np.float32)
    return np.asarray(Image.fromarray((sub * 255).astype(np.uint8)).resize((28, 28), Image.BILINEAR)).astype(np.float32) / 255.0


def process(boss, manifest, montage, dry):
    sp = SHEETS / f"{boss}_sheet_v2_alpha.png"
    if not sp.exists():
        print(f"  ! {boss}: no sheet"); return None
    sheet = Image.open(sp).convert("RGBA")
    W, H = sheet.size
    CW, CH = W // COLS, H // ROWS
    sa = np.asarray(sheet)[:, :, 3]

    # 全24セルの content bbox(セル局所)とthumb
    cell_bbox, cell_thumb = {}, {}
    for i in range(COLS * ROWS):
        r, c = divmod(i, COLS)
        a = sa[r * CH:(r + 1) * CH, c * CW:(c + 1) * CW]
        bb = content_bbox(a)
        if bb:
            cell_bbox[i] = bb
            cell_thumb[i] = thumb(a)

    # 現行フレーム(ファイル名=action_n)を読み、一意割当でセルへ対応付け
    cur = sorted(glob.glob(str(ANIM / boss / f"{boss}_*.png")))
    if not cur:
        print(f"  ! {boss}: no current frames"); return None
    fnames, fthumb = [], {}
    for f in cur:
        nm = os.path.basename(f)[len(boss) + 1:-4]   # idle_0 等
        fa = np.asarray(Image.open(f).convert("RGBA"))[:, :, 3]
        t = thumb(fa)
        if t is not None:
            fnames.append(nm); fthumb[nm] = t
    pairs = sorted((float(np.abs(fthumb[nm] - cell_thumb[ci]).mean()), nm, ci)
                   for nm in fnames for ci in cell_thumb)
    usedF, usedC, asg = set(), set(), {}
    for sc, nm, ci in pairs:
        if nm in usedF or ci in usedC:
            continue
        asg[nm] = ci; usedF.add(nm); usedC.add(ci)

    # === 本体(エフェクト除外)検出 ===
    # 各割当フレームについて、本体(高alpha=BODY_THR)と全内容(ATHR=エフェクト込み)の bbox をセル局所で取得。
    # 本体中心x・本体足元y を「アンカー」とし、フレームを本体基準で揃える(エフェクトでサイズ/位置がブレない)。
    BODY = {}; FULL = {}; ANCH = {}
    for nm in asg:
        ci = asg[nm]; r, c = divmod(ci, COLS)
        a = sa[r * CH:(r + 1) * CH, c * CW:(c + 1) * CW]
        bb = content_bbox(a, BODY_THR) or cell_bbox[ci]   # 本体検出失敗時は全内容で代替
        FULL[nm] = cell_bbox[ci]
        BODY[nm] = bb
        ANCH[nm] = ((bb[0] + bb[2]) / 2.0, float(bb[3]))   # (本体中心x, 本体足元y)

    import statistics
    body_h = statistics.median(BODY[nm][3] - BODY[nm][1] + 1 for nm in asg)   # 本体高さ(代表)
    # 表示倍率S = 本体高さを全ボス共通 TARGET_BODY に正規化 → 全ボスの本体サイズが揃う
    S = TARGET_BODY / body_h

    # 窓 = 本体アンカーからの「全内容(エフェクト込み)」の最大はみ出しを全フレームで取る(エフェクトも欠けさせない)
    pad = 4
    maxL = max(ANCH[nm][0] - FULL[nm][0] for nm in asg)
    maxR = max(FULL[nm][2] - ANCH[nm][0] for nm in asg)
    maxU = max(ANCH[nm][1] - FULL[nm][1] for nm in asg)
    maxD = max(FULL[nm][3] - ANCH[nm][1] for nm in asg)
    axc = maxL + pad; ayc = maxU + pad                      # 窓内での本体アンカー位置(px)
    Wwin = int(round(maxL + maxR)) + 2 * pad
    Hwin = int(round(maxU + maxD)) + 2 * pad
    w_disp = round(Wwin * S, 3); h_disp = round(Hwin * S, 3)
    ax = round(axc * S, 3); ay = round(ayc * S, 3)          # アンカー(本体中心x/足元y)→ 全フレーム共通

    # 書き出し: 各フレームを「自分の本体アンカー」を窓内同一位置に来るよう切り出す(配置が本体基準で均等)。
    # セルからのみ切り出す(セル外は透明=隣ポーズの混入を防止)。
    montage_frames = []
    for nm in fnames:
        ci = asg[nm]; r, c = divmod(ci, COLS)
        cell_img = sheet.crop((c * CW, r * CH, (c + 1) * CW, (r + 1) * CH))
        bcx, bbot = ANCH[nm]
        x0 = int(round(bcx - axc)); y0 = int(round(bbot - ayc))
        fr = cell_img.crop((x0, y0, x0 + Wwin, y0 + Hwin))   # 範囲外は透明で padding される
        mx = max(Wwin, Hwin)   # データ削減: 最大辺を TARGET_PX に縮小(manifestは表示単位で不変=見た目同じ)
        if mx > TARGET_PX:
            f = TARGET_PX / mx
            fr = fr.resize((max(1, round(Wwin * f)), max(1, round(Hwin * f))), Image.LANCZOS)
        if not dry:
            fr.save(ANIM / boss / f"{boss}_{nm}.png")
        key = f"{boss}_{nm}"
        if key in manifest["sprites"]:
            e = manifest["sprites"][key]
            e["w"], e["h"], e["ax"], e["ay"] = w_disp, h_disp, ax, ay
        montage_frames.append((nm, fr))
    print(f"  ok {boss}: {len(fnames)} fr, bodyH={body_h:.0f} S={S:.3f} win {Wwin}x{Hwin} disp {w_disp}x{h_disp} ax{ax} ay{ay}")
    return montage_frames


def build_montage(all_frames):
    th, pad, lab = 110, 4, 12
    cols = 21
    rows = len(all_frames)
    m = Image.new("RGBA", (cols * (th + pad) + pad, rows * (th + lab + pad) + pad), (18, 22, 32, 255))
    dr = ImageDraw.Draw(m)
    for ri, (boss, frames) in enumerate(all_frames):
        y = pad + ri * (th + lab + pad)
        dr.text((pad, y), boss, fill=(200, 210, 230, 255))
        for ci, (nm, fr) in enumerate(frames):
            t = fr.copy(); t.thumbnail((th, th))
            x = pad + ci * (th + pad)
            m.alpha_composite(t, (x + (th - t.width) // 2, y + (th - t.height) // 2))
            dr.text((x + 1, y + th + 1), nm, fill=(140, 160, 190, 255))
    mp = ROOT / "_boss_reslice_montage.png"
    m.save(mp); print("montage ->", mp)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--montage", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    manifest.setdefault("sprites", {})
    all_frames = []
    for b in BOSSES:
        fr = process(b, manifest, args.montage, args.dry_run)
        if fr:
            all_frames.append((b, fr))
    if not args.dry_run:
        MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        print("manifest updated")
    if args.montage:
        build_montage(all_frames)


if __name__ == "__main__":
    main()
