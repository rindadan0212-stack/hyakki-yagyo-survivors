"""百鬼夜行サバイバーズ — raster sprite packer.

Drop AI-generated PNGs into  assets/sprites/raw/  then run:

    python assets/sprites/pack.py            # pack everything in raw/
    python assets/sprites/pack.py --chroma   # also key out a flat background
    python assets/sprites/pack.py --dry-run   # report only, write nothing

What it does, per raw file (transparent PNG, one creature, full body):
  1. (optional) key out a flat/near-uniform background sampled from the corners.
  2. trim transparent margins to the content.
  3. resize to a crisp internal resolution, keeping the art's native aspect.
  4. compute w/h/ax/ay so the sprite lands at the SAME in-game size + anchor as
     the procedural sprite it replaces (read from footprints.json) — no distortion.
  5. write the packed PNG and merge an entry into manifest.json.

Naming:  name the raw file after the creature's *base* sprite key, e.g.
    e_oni.png  -> fills  e_oni_0  and  e_oni_1   (idle frames share one image)
    b_tanuki.png -> b_tanuki_0 / b_tanuki_1
    p_haru.png (or haru.png) -> p_0 / p_1
    suzu.png   -> pc_suzu_0 / pc_suzu_1
    mutsuki.png-> pc_mutsuki_0 / pc_mutsuki_1
You may also name a file after an exact frame key (e_oni_0.png) to target just it.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required:  pip install Pillow")

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"
FOOT = json.loads((HERE / "footprints.json").read_text(encoding="utf-8"))
MANIFEST = HERE / "manifest.json"

# longer side of the packed PNG (display is downscaled from this — bigger = crisper, heavier)
INTERNAL_MAX = 320
# friendly aliases for the player characters (whose base keys are awkward filenames)
CHAR_ALIAS = {"haru": "p", "p_haru": "p", "suzu": "pc_suzu", "mutsuki": "pc_mutsuki"}


def base_groups() -> dict[str, list[str]]:
    """base sprite key -> the frame keys it expands to, derived from footprints.json."""
    groups: dict[str, list[str]] = {}
    for key in FOOT:
        base = key[:-2] if key.endswith(("_0", "_1")) else key
        groups.setdefault(base, [])
        if key not in groups[base]:
            groups[base].append(key)
    for g in groups.values():
        g.sort()
    return groups


def resolve_targets(stem: str, groups: dict[str, list[str]]) -> list[str]:
    """map a raw filename stem to the list of sprite frame keys it should fill."""
    if stem in CHAR_ALIAS:
        stem = CHAR_ALIAS[stem]
    if stem in FOOT:                 # exact frame key, e.g. e_oni_0
        return [stem]
    if stem in groups:               # base key, e.g. e_oni -> [e_oni_0, e_oni_1]
        return groups[stem]
    return []


def chroma_key(im: Image.Image, tol: int = 26) -> Image.Image:
    """drop pixels close to the background colour sampled from the four corners."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    # use the most common corner as the background reference
    bg = max(set(corners), key=corners.count)
    br, bgc, bb = bg[0], bg[1], bg[2]
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and abs(r - br) <= tol and abs(g - bgc) <= tol and abs(b - bb) <= tol:
                px[x, y] = (r, g, b, 0)
    return im


def pack_one(path: Path, groups: dict[str, list[str]], chroma: bool, dry: bool):
    targets = resolve_targets(path.stem, groups)
    if not targets:
        print(f"  ?? {path.name}: no matching sprite key (stem '{path.stem}') — skipped")
        return None

    im = Image.open(path).convert("RGBA")
    if chroma:
        im = chroma_key(im)
    bbox = im.getbbox()
    if not bbox:
        print(f"  !! {path.name}: fully transparent — skipped")
        return None
    exact_enemy_frame = path.stem in FOOT and path.stem.startswith(("e_", "b_"))
    if not exact_enemy_frame:
        im = im.crop(bbox)
    cw, ch = im.size
    # crisp internal resolution, native aspect preserved
    scale = INTERNAL_MAX / max(cw, ch)
    if scale < 1:
        im = im.resize((max(1, round(cw * scale)), max(1, round(ch * scale))), Image.LANCZOS)
    out_name = path.stem + ".png"
    if not dry:
        im.save(HERE / out_name)

    aspect = cw / ch
    entries = {}
    for key in targets:
        fp = FOOT[key]
        if exact_enemy_frame:
            entries[key] = {
                "file": out_name,
                "w": fp["w"],
                "h": fp["h"],
                "ax": fp["ax"],
                "ay": fp["ay"],
            }
            continue
        # keep the procedural HEIGHT (same on-screen size); take width from the art's aspect
        h = fp["h"]
        w = round(h * aspect)
        ax = round(w * (fp["ax"] / fp["w"]))   # usually centred
        ay = fp["ay"]                            # same anchor height as procedural
        entries[key] = {"file": out_name, "w": w, "h": h, "ax": ax, "ay": ay}
    print(f"  ok {path.name}: {cw}x{ch} -> {', '.join(targets)}")
    return entries


def main():
    ap = argparse.ArgumentParser(description="pack raster sprites into manifest.json")
    ap.add_argument("--chroma", action="store_true", help="key out a flat background")
    ap.add_argument("--dry-run", action="store_true", help="report only; write nothing")
    args = ap.parse_args()

    if not RAW.exists():
        sys.exit(f"no raw folder: {RAW}")
    raws = sorted(p for p in RAW.glob("*.png"))
    if not raws:
        sys.exit(f"no PNGs in {RAW}")
    exact_bases = {
        p.stem[:-2]
        for p in raws
        if p.stem.endswith(("_0", "_1")) and p.stem in FOOT
    }
    raws = [p for p in raws if p.stem not in exact_bases]

    groups = base_groups()
    manifest = {"basePath": "assets/sprites/", "sprites": {}}
    if MANIFEST.exists():
        try:
            manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
            manifest.setdefault("basePath", "assets/sprites/")
            manifest.setdefault("sprites", {})
        except json.JSONDecodeError:
            pass

    print(f"packing {len(raws)} raw file(s){' [DRY RUN]' if args.dry_run else ''}:")
    added = 0
    for p in raws:
        entries = pack_one(p, groups, args.chroma, args.dry_run)
        if entries:
            manifest["sprites"].update(entries)
            added += len(entries)

    if not args.dry_run:
        MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nwrote {added} sprite entr(ies) -> {MANIFEST.name}")
        print(f"total sprites overridden: {len(manifest['sprites'])}")
    else:
        print(f"\n[dry run] would write {added} sprite entr(ies)")


if __name__ == "__main__":
    main()
