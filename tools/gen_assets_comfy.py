"""ComfyUI で和風ヴァンサバ用の素材を多カテゴリ自律生成する(gen_fx_comfy.py の汎用版)。

カテゴリ別スタイルプリセットを持ち、BATCH(辞書) を回して 1024 の生原画を staging に保存する。
後段で tools/postprocess_gen.py が 黒背景→透過・トリム・縮小して game-ready 素材にする。

使い方:
  python tools/gen_assets_comfy.py                         # BATCH 全部
  python tools/gen_assets_comfy.py --only sakura_storm,torii_gate
  python tools/gen_assets_comfy.py --cat fx                # fx カテゴリのみ
  python tools/gen_assets_comfy.py --spec extra_batch.json # 外部 JSON {name:[cat,prompt]}
出力: assets/_gen/<cat>/<name>.png (生1024)
"""
from __future__ import annotations
import argparse, json, time, urllib.request, urllib.parse
from pathlib import Path

COMFY = "http://127.0.0.1:8188"
CKPT = "pixelArtDiffusionXL_spriteShaper.safetensors"

# カテゴリ別: (positive 前置きスタイル, negative, w, h, steps, cfg)
PRESETS = {
    # 発光VFX。黒背景=後で透過しやすい。中央1要素。
    "fx": (
        "pixel art, retro game vfx sprite, single centered magic effect on pure black background, "
        "vibrant glowing, additive light, high contrast, crisp pixels, no character, no text, no border",
        "photo, realistic, 3d render, character, person, creature, text, watermark, frame, ui, "
        "multiple objects, grid, sprite sheet, tiling, dull, muddy",
        1024, 1024, 26, 6.5,
    ),
    # 世界装飾の単体オブジェクト。地面に置く小物。中央・正面やや俯瞰・黒背景。
    "prop": (
        "pixel art game prop, single japanese yokai-world object centered on pure black background, "
        "edo period spooky atmosphere, clean silhouette, soft rim light, no character, no text, no border, no ground shadow",
        "photo, realistic, 3d render, character, person, creature, text, watermark, frame, ui, "
        "multiple objects, scene, landscape, grid, tiling",
        1024, 1024, 26, 6.0,
    ),
    # プレイヤーキャラの全身ポーズ。単体・純黒背景(後で輪郭抽出)。縦長で全身を収める。
    "char": (
        "pixel art game sprite, full body chibi character, single character centered on pure black background, "
        "dynamic readable pose, soft rim light, crisp pixels, no scene, no ground, no shadow, no border",
        "scene, landscape, background, multiple characters, two people, text, watermark, ui, frame, cropped, "
        "realistic photo, blurry, extra limbs, extra arms, deformed hands, grid, sprite sheet, "
        "wide brim hat, witch hat, straw hat, conical hat, pointed hat, purple kimono, dark kimono, "
        "colorful patterned kimono, floral kimono, miko, witch",
        896, 1152, 28, 6.5,
    ),
    # スキル/バフのアイコン記号。円形メダル上の単一象徴。
    "icon": (
        "game skill icon, single ornate emblem symbol centered on dark circular medallion, "
        "japanese mystic motif, gold and ink, glowing accent, crisp, no text, no border outside the medallion",
        "photo, realistic, 3d render, full body character, scene, text, watermark, multiple icons, "
        "grid, sprite sheet, tiling, blurry",
        1024, 1024, 26, 6.5,
    ),
}

# name -> (category, subject prompt)。既存(curse/dark_vortex/explosion/foxfire/heal/holy_nova/
# lampburst/lightning/shockwave/slash)と重複しない和風の新規。
BATCH = {
    # --- 新FX(属性/妖怪テーマ) ---
    "sakura_storm":  ("fx", "a swirling storm of pink cherry blossom petals spiraling, soft pink and white, gentle glow"),
    "talisman_burst":("fx", "a burst of white paper talismans ofuda with red kanji radiating outward, holy white red"),
    "water_splash":  ("fx", "a crashing blue water splash wave burst, droplets, deep blue and white foam"),
    "wind_slash":    ("fx", "crescent wind blade slashes, pale green white air gusts, sharp curved streaks"),
    "spirit_wisps":  ("fx", "floating pale blue ghostly will-o-wisp spirit flames, hitodama, eerie cyan glow"),
    "bell_ring":     ("fx", "concentric golden brass temple bell sound wave rings expanding, warm gold glow"),
    "ink_splatter":  ("fx", "a black sumi ink splatter burst with droplets, calligraphy ink, deep black and grey"),
    "frost_burst":   ("fx", "a burst of pale blue ice frost crystal shards radiating, cold cyan white sparkle"),
    "ember_rise":    ("fx", "rising orange embers and fire sparks drifting upward, warm orange yellow glow"),
    "petal_blade":   ("fx", "a spinning ring of red maple leaves and wind blades, autumn crimson, swirling"),
    # --- 世界装飾(雰囲気付け) ---
    "stone_lantern": ("prop", "a mossy japanese stone toro lantern, weathered grey stone, faint warm light inside"),
    "torii_gate":    ("prop", "a small red torii gate, vermilion lacquer, weathered, standing"),
    "gravestone":    ("prop", "an old mossy japanese stone gravestone with faint carving, leaning, grey"),
    "dead_tree":     ("prop", "a gnarled bare dead tree silhouette, twisted branches, dark bark"),
    "paper_lantern": ("prop", "a hanging round red paper lantern chochin glowing warm, japanese characters faint"),
    "spirit_gate":   ("prop", "a crumbling old shrine gate covered in talisman papers, eerie, dark wood"),
}


def post(path, payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(COMFY + path, data=data, headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=30))


def build_wf(pos, neg, seed, w, h, steps, cfg):
    return {
        "4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": pos, "clip": ["4", 1]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": neg, "clip": ["4", 1]}},
        "5": {"class_type": "EmptyLatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
        "3": {"class_type": "KSampler", "inputs": {"seed": seed, "steps": steps, "cfg": cfg,
              "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0,
              "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0]}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "asetgen", "images": ["8", 0]}},
    }


def wait_image(pid, timeout=300):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            h = json.load(urllib.request.urlopen(COMFY + f"/history/{pid}", timeout=15))
        except Exception:
            h = {}
        if pid in h:
            for o in h[pid].get("outputs", {}).values():
                if "images" in o and o["images"]:
                    return o["images"][0]
        time.sleep(1.2)
    return None


def fetch(img, dest: Path):
    q = urllib.parse.urlencode({"filename": img["filename"], "subfolder": img.get("subfolder", ""), "type": img.get("type", "output")})
    data = urllib.request.urlopen(COMFY + "/view?" + q, timeout=30).read()
    dest.write_bytes(data)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="assets/_gen")
    ap.add_argument("--only", default="")
    ap.add_argument("--cat", default="")
    ap.add_argument("--seed", type=int, default=4242)
    ap.add_argument("--spec", default="")
    args = ap.parse_args()
    root = Path(__file__).resolve().parent.parent

    batch = dict(BATCH)
    if args.spec:
        ext = json.loads((root / args.spec).read_text(encoding="utf-8"))
        batch.update({k: tuple(v) for k, v in ext.items()})

    names = [n.strip() for n in args.only.split(",") if n.strip()] or list(batch)
    if args.cat:
        names = [n for n in names if batch.get(n, ("",))[0] == args.cat]

    done = 0
    for i, name in enumerate(names):
        if name not in batch:
            print(f"skip unknown {name}", flush=True); continue
        cat, subject = batch[name]
        style, neg, w, h, steps, cfg = PRESETS[cat]
        pos = style + ", " + subject
        outdir = root / args.out / cat
        outdir.mkdir(parents=True, exist_ok=True)
        wf = build_wf(pos, neg, args.seed + i * 13, w, h, steps, cfg)
        try:
            pid = post("/prompt", {"prompt": wf})["prompt_id"]
        except Exception as e:
            print(f"[{name}] submit FAIL {e}", flush=True); continue
        print(f"[{cat}/{name}] submitted {pid} ...", flush=True)
        img = wait_image(pid)
        if not img:
            print(f"[{name}] TIMEOUT", flush=True); continue
        fetch(img, outdir / f"{name}.png")
        done += 1
        print(f"[{cat}/{name}] saved -> {outdir / (name + '.png')}", flush=True)
    print(f"done {done}/{len(names)}", flush=True)


if __name__ == "__main__":
    main()
