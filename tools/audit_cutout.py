#!/usr/bin/env python3
"""Audit the cutout / alpha-extraction quality of game image assets.

Investigation-only: reads PNGs, computes per-asset cutout-quality metrics,
aggregates per category, ranks the worst, and renders a checkerboard contact
sheet of the worst offenders so transparency problems are visible.

Metrics (RGBA):
  corner_alpha       max alpha of the 4 corner pixels (255 = box/bg not removed)
  edge_opaque_ratio  fraction of 1px border that is opaque (alpha>40)
  hard_edge_frac     of boundary pixels, fraction with near 0<->255 jump and
                     almost no semi-transparent neighbours (jaggy / no AA)
  semi_alpha_frac    fraction of all pixels with 16<alpha<240 (AA rim presence)
  bg_residue         0..1 score for leftover near-uniform opaque bg at the border
  size               (w, h)

No assets are modified.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"

# ---------------------------------------------------------------------------
# Asset set definitions: (category, list of globs relative to ROOT)
# ---------------------------------------------------------------------------
SETS: dict[str, list[str]] = {
    "boss": [
        "assets/sprites/animation/b_*/*.png",
        "assets/sprites/b_*.png",
    ],
    "enemy": [
        "assets/sprites/e_*.png",
        "assets/sprites/raw/e_*.png",
    ],
    "player": [
        "assets/sprites/p_*.png",
        "assets/sprites/mutsuki.png",
        "assets/sprites/suzu.png",
        "assets/sprites/animation/p/*.png",
        "assets/sprites/animation/pc_mutsuki/*.png",
        "assets/sprites/animation/pc_suzu/*.png",
    ],
    "prop": [
        "assets/sprites/world/prop_*.png",
    ],
    "fx": [
        "assets/fx_exp/*.png",
    ],
    "icon": [
        "assets/sprites/icons/*.png",
        "assets/ai_generated/icons/*.png",
    ],
}

ALPHA_OPAQUE = 40       # >this counts as "opaque" for border tests
SEMI_LO, SEMI_HI = 16, 240


def collect_files() -> list[tuple[str, Path]]:
    out: list[tuple[str, Path]] = []
    seen: set[Path] = set()
    for cat, globs in SETS.items():
        for g in globs:
            # globs that contain no wildcard are direct files
            if "*" in g:
                base, pat = g.split("*", 1)
                for p in sorted(ROOT.glob(g)):
                    if p.is_file() and p not in seen:
                        # skip obvious contact-sheet / alpha-aux files
                        n = p.name.lower()
                        if n.startswith("_") or "contact" in n or "_alpha" in n:
                            continue
                        seen.add(p)
                        out.append((cat, p))
            else:
                p = ROOT / g
                if p.is_file() and p not in seen:
                    seen.add(p)
                    out.append((cat, p))
    return out


def metrics(path: Path) -> dict | None:
    try:
        im = Image.open(path).convert("RGBA")
    except Exception as e:  # noqa: BLE001
        print(f"  !! failed {path}: {e}")
        return None
    arr = np.asarray(im, dtype=np.float32)
    h, w = arr.shape[:2]
    a = arr[:, :, 3]
    rgb = arr[:, :, :3]

    # --- corner alpha ---
    corners = [a[0, 0], a[0, w - 1], a[h - 1, 0], a[h - 1, w - 1]]
    corner_alpha = float(max(corners))

    # --- border (1px frame) opaque ratio ---
    border_mask = np.zeros((h, w), dtype=bool)
    border_mask[0, :] = True
    border_mask[-1, :] = True
    border_mask[:, 0] = True
    border_mask[:, -1] = True
    border_a = a[border_mask]
    edge_opaque_ratio = float((border_a > ALPHA_OPAQUE).mean())

    # --- semi-alpha fraction (only over non-transparent footprint) ---
    semi = (a > SEMI_LO) & (a < SEMI_HI)
    nonzero = a > 4
    nz = int(nonzero.sum())
    semi_alpha_frac = float(semi.sum() / nz) if nz else 0.0

    # --- alpha boundary detection (gradient of alpha) ---
    # Boundary = pixels where alpha changes a lot vs 4-neighbours.
    gx = np.zeros_like(a)
    gy = np.zeros_like(a)
    gx[:, 1:] = np.abs(a[:, 1:] - a[:, :-1])
    gy[1:, :] = np.abs(a[1:, :] - a[:-1, :])
    grad = np.maximum(gx, gy)
    boundary = grad > 24  # there is an alpha transition here
    n_boundary = int(boundary.sum())

    # hard_edge_frac: of boundary pixels, fraction whose 3x3 neighbourhood has
    # almost no semi-transparent pixels (i.e. alpha jumps 0->255 cleanly).
    if n_boundary:
        # count semi pixels in a 3x3 window via integral-ish convolution
        semi_i = semi.astype(np.float32)
        pad = np.pad(semi_i, 1, mode="constant")
        win = (
            pad[0:-2, 0:-2] + pad[0:-2, 1:-1] + pad[0:-2, 2:]
            + pad[1:-1, 0:-2] + pad[1:-1, 1:-1] + pad[1:-1, 2:]
            + pad[2:, 0:-2] + pad[2:, 1:-1] + pad[2:, 2:]
        )
        hard = boundary & (win <= 1)  # <=1 semi neighbour around a transition
        hard_edge_frac = float(hard.sum() / n_boundary)
    else:
        hard_edge_frac = 0.0

    # --- bg_residue: near-uniform opaque pixels touching the border ---
    # Look at the opaque pixels on the border ring (2px). If they cluster around
    # a single colour (low variance) it is leftover flat background. Darkness
    # boosts the score (black box leftovers are the common case here).
    ring = np.zeros((h, w), dtype=bool)
    t = 2
    ring[:t, :] = True
    ring[-t:, :] = True
    ring[:, :t] = True
    ring[:, -t:] = True
    ring_opaque = ring & (a > 180)
    n_ring_op = int(ring_opaque.sum())
    bg_residue = 0.0
    if n_ring_op >= 8:
        cols = rgb[ring_opaque]
        mean = cols.mean(axis=0)
        std = cols.std(axis=0).mean()
        frac_ring_opaque = n_ring_op / int(ring.sum())
        uniformity = max(0.0, 1.0 - std / 40.0)  # std<40 -> fairly uniform
        darkness = max(0.0, 1.0 - mean.mean() / 90.0)  # darker -> more boxy
        # base residue: uniform opaque border present
        base = frac_ring_opaque * uniformity
        bg_residue = float(min(1.0, base * (0.5 + 0.5 * (1 + darkness))))

    return {
        "path": str(path),
        "rel": str(path.relative_to(ROOT)).replace("\\", "/"),
        "w": int(w),
        "h": int(h),
        "corner_alpha": corner_alpha,
        "edge_opaque_ratio": edge_opaque_ratio,
        "hard_edge_frac": hard_edge_frac,
        "semi_alpha_frac": semi_alpha_frac,
        "bg_residue": bg_residue,
        "n_boundary": n_boundary,
    }


def badness(m: dict) -> float:
    """Combined 0..~1.5 badness score; higher = worse cutout.

    NOTE: low-res pixel-art sprites legitimately have hard, AA-free edges, so
    the "no AA" / "hard edge" penalties are scaled DOWN for small sprites
    (<=160px) and weighted lightly. The real cutout defects we care about are
    leftover opaque background (bg_residue + corner_alpha) and content cut at
    the canvas boundary (edge_opaque_ratio).
    """
    ca = m["corner_alpha"] / 255.0
    eo = m["edge_opaque_ratio"]
    he = m["hard_edge_frac"]
    sa = m["semi_alpha_frac"]
    bg = m["bg_residue"]
    pixel_art = max(m["w"], m["h"]) <= 160  # tiny sprite -> AA-free is fine
    aa_w = 0.02 if pixel_art else 0.13
    hard_w = 0.04 if pixel_art else 0.20
    no_aa = max(0.0, 1.0 - sa / 0.06)
    score = (
        0.40 * ca
        + 0.22 * min(1.0, eo / 0.5)
        + hard_w * he
        + aa_w * no_aa
        + 0.40 * bg
    )
    return float(score)


def is_bad(m: dict) -> bool:
    # hard_edge alone is NOT a defect for pixel art; require a real bg/box signal
    return (
        m["corner_alpha"] > 40
        or m["edge_opaque_ratio"] > 0.25
        or m["bg_residue"] > 0.25
    )


def main_problem(m: dict) -> str:
    bg = m["bg_residue"]
    ca = m["corner_alpha"] / 255.0
    eo = m["edge_opaque_ratio"]
    he = m["hard_edge_frac"]
    sa = m["semi_alpha_frac"]
    cand = []
    if bg > 0.25 and ca > 0.5:
        cand.append((0.35 * bg + 0.3 * ca, "leftover bg box"))
    if ca > 0.5:
        cand.append((0.3 * ca, "corner opaque"))
    if eo > 0.2:
        cand.append((0.22 * min(1, eo / 0.5), "content cut at edge"))
    if he > 0.55:
        cand.append((0.2 * he, "hard/jaggy edge (no AA)"))
    if sa < 0.02:
        cand.append((0.13, "no AA rim"))
    if not cand:
        return "minor"
    cand.sort(reverse=True)
    return cand[0][1]


# ---------------------------------------------------------------------------
def checkerboard(size: tuple[int, int], cell: int = 8) -> Image.Image:
    w, h = size
    bg = Image.new("RGBA", (w, h), (170, 170, 170, 255))
    dark = (110, 110, 110, 255)
    d = ImageDraw.Draw(bg)
    for y in range(0, h, cell):
        for x in range(0, w, cell):
            if ((x // cell) + (y // cell)) % 2 == 0:
                d.rectangle([x, y, x + cell - 1, y + cell - 1], fill=dark)
    return bg


def build_contact_sheet(worst: list[dict], out_path: Path, n: int = 24) -> None:
    cols = 6
    cell = 150
    pad = 6
    label_h = 30
    rows = (min(n, len(worst)) + cols - 1) // cols
    cw = cell + pad * 2
    ch = cell + label_h + pad * 2
    W = cols * cw
    H = rows * ch
    sheet = Image.new("RGBA", (W, H), (30, 30, 34, 255))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("arial.ttf", 11)
        font_s = ImageFont.truetype("arial.ttf", 10)
    except Exception:  # noqa: BLE001
        font = ImageFont.load_default()
        font_s = font

    for i, m in enumerate(worst[:n]):
        r, c = divmod(i, cols)
        x0 = c * cw + pad
        y0 = r * ch + pad
        # checkerboard tile
        tile = checkerboard((cell, cell))
        try:
            im = Image.open(m["path"]).convert("RGBA")
        except Exception:  # noqa: BLE001
            continue
        im.thumbnail((cell, cell), Image.NEAREST)
        ox = (cell - im.width) // 2
        oy = (cell - im.height) // 2
        tile.alpha_composite(im, (ox, oy))
        sheet.alpha_composite(tile, (x0, y0))
        # frame
        draw.rectangle([x0, y0, x0 + cell - 1, y0 + cell - 1], outline=(0, 0, 0, 255))
        # labels
        name = Path(m["rel"]).name
        prob = main_problem(m)
        ty = y0 + cell + 2
        draw.text((x0, ty), f"#{i+1} {name[:22]}", fill=(255, 240, 200, 255), font=font)
        draw.text((x0, ty + 13), f"{prob}", fill=(255, 160, 140, 255), font=font_s)

    sheet.convert("RGB").save(out_path)
    print(f"\nContact sheet -> {out_path} ({W}x{H})")


# ---------------------------------------------------------------------------
def main() -> int:
    files = collect_files()
    print(f"Scanning {len(files)} PNGs across {len(SETS)} categories...\n")

    results: list[dict] = []
    for cat, p in files:
        m = metrics(p)
        if m is None:
            continue
        m["cat"] = cat
        m["bad_score"] = badness(m)
        m["bad"] = is_bad(m)
        results.append(m)

    # --- per-category aggregate ---
    print("=" * 78)
    print("PER-CATEGORY CUTOUT HEALTH")
    print("=" * 78)
    hdr = (
        f"{'cat':<7}{'n':>4}{'bad':>5}  {'corner':>7}{'edgeOp':>8}"
        f"{'hardE':>7}{'semiA':>7}{'bgRes':>7}{'avgBad':>8}"
    )
    print(hdr)
    print("-" * 78)
    cats = sorted({m["cat"] for m in results})
    cat_summ = {}
    for cat in cats:
        ms = [m for m in results if m["cat"] == cat]
        n = len(ms)
        nbad = sum(1 for m in ms if m["bad"])
        avg = lambda k: sum(m[k] for m in ms) / n  # noqa: E731
        cat_summ[cat] = {
            "n": n, "bad": nbad,
            "corner": avg("corner_alpha"),
            "edge": avg("edge_opaque_ratio"),
            "hard": avg("hard_edge_frac"),
            "semi": avg("semi_alpha_frac"),
            "bg": avg("bg_residue"),
            "score": avg("bad_score"),
        }
        s = cat_summ[cat]
        print(
            f"{cat:<7}{n:>4}{nbad:>5}  {s['corner']:>7.0f}{s['edge']:>8.2f}"
            f"{s['hard']:>7.2f}{s['semi']:>7.3f}{s['bg']:>7.2f}{s['score']:>8.3f}"
        )

    # --- worst 30 overall ---
    results.sort(key=lambda m: m["bad_score"], reverse=True)
    print("\n" + "=" * 78)
    print("30 WORST ASSETS OVERALL (by combined badness)")
    print("=" * 78)
    print(
        f"{'#':>3} {'cat':<6}{'corn':>5}{'edgeO':>7}{'hardE':>7}"
        f"{'semiA':>7}{'bgRes':>7}{'bad':>6}  {'WxH':>9}  problem / path"
    )
    print("-" * 78)
    for i, m in enumerate(results[:30]):
        print(
            f"{i+1:>3} {m['cat']:<6}{m['corner_alpha']:>5.0f}"
            f"{m['edge_opaque_ratio']:>7.2f}{m['hard_edge_frac']:>7.2f}"
            f"{m['semi_alpha_frac']:>7.3f}{m['bg_residue']:>7.2f}"
            f"{m['bad_score']:>6.2f}  {m['w']}x{m['h']:<5}  "
            f"[{main_problem(m)}] {m['rel']}"
        )

    # --- per-category worst examples (for the report) ---
    print("\n" + "=" * 78)
    print("WORST 3 PER CATEGORY")
    print("=" * 78)
    for cat in cats:
        ms = [m for m in results if m["cat"] == cat][:3]
        print(f"\n[{cat}]")
        for m in ms:
            print(
                f"   {m['bad_score']:.2f}  corner={m['corner_alpha']:.0f} "
                f"edgeOp={m['edge_opaque_ratio']:.2f} hard={m['hard_edge_frac']:.2f} "
                f"semi={m['semi_alpha_frac']:.3f} bg={m['bg_residue']:.2f}  "
                f"[{main_problem(m)}] {m['rel']}"
            )

    build_contact_sheet(results, ROOT / "tools" / "_cutout_worst.png", n=24)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
