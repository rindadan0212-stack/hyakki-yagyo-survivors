"""オフライン1ファイル版をビルド。

index.html の <link>/<script> を全てインライン展開し、外部参照ゼロの
単一 HTML (百鬼夜行.html) を出力する。スマホに転送してブラウザで開くだけで
オフライン (通信なし・サーバーなし) で遊べる。

  python build_standalone.py
"""
from __future__ import annotations

import base64
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "百鬼夜行.html"


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def main() -> int:
    html = read("index.html")

    # Raster sprite manifest + PNG files are exposed before the inlined game JS.
    # The browser build still fetches these normally; the standalone build never
    # needs a server or network request.
    manifest_path = ROOT / "assets/sprites/manifest.json"
    sprite_boot = ""
    n_sprite_png = 0
    if manifest_path.is_file():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        sprite_data: dict[str, str] = {}
        for ent in manifest.get("sprites", {}).values():
            filename = ent.get("file")
            if not filename or filename in sprite_data:
                continue
            path = ROOT / "assets/sprites" / filename
            if path.is_file():
                data = base64.b64encode(path.read_bytes()).decode("ascii")
                sprite_data[filename] = f"data:image/png;base64,{data}"
                n_sprite_png += 1
        payload = (
            "window.__SPRITE_MANIFEST="
            + json.dumps(manifest, ensure_ascii=False, separators=(",", ":"))
            + ";window.__SPRITE_DATA="
            + json.dumps(sprite_data, separators=(",", ":"))
            + ";"
        )
        sprite_boot = f"<script>{payload}</script>\n"
        html = html.replace("<body>", "<body>\n" + sprite_boot, 1)

    # FX animation frames (assets/fx/<name>_<i>.png) are loaded via a *constructed*
    # runtime path in engine.loadAnims, so the literal-PNG pass below can't reach them.
    # Embed every frame as window.__FX_DATA so the standalone uses data URIs (no fetch).
    fx_dir = ROOT / "assets/fx"
    n_fx_png = 0
    if fx_dir.is_dir():
        fx_data: dict[str, str] = {}
        for path in sorted(fx_dir.glob("*.png")):
            data = base64.b64encode(path.read_bytes()).decode("ascii")
            fx_data[path.name] = f"data:image/png;base64,{data}"
            n_fx_png += 1
        if fx_data:
            fx_payload = "window.__FX_DATA=" + json.dumps(fx_data, separators=(",", ":")) + ";"
            html = html.replace("<body>", f"<body>\n<script>{fx_payload}</script>\n", 1)

    # 実験FX (assets/fx_exp/<name>.png) も engine.loadExpFx が構築パスで読むので埋め込む。
    expfx_dir = ROOT / "assets/fx_exp"
    n_expfx_png = 0
    if expfx_dir.is_dir():
        expfx_data: dict[str, str] = {}
        for path in sorted(expfx_dir.glob("*.png")):
            if path.name.startswith("_"):   # _contact.png 等の作業ファイルは除外
                continue
            data = base64.b64encode(path.read_bytes()).decode("ascii")
            expfx_data[path.name] = f"data:image/png;base64,{data}"
            n_expfx_png += 1
        if expfx_data:
            expfx_payload = "window.__EXPFX_DATA=" + json.dumps(expfx_data, separators=(",", ":")) + ";"
            html = html.replace("<body>", f"<body>\n<script>{expfx_payload}</script>\n", 1)

    # <link rel="stylesheet" href="css/style.css"> -> <style>...</style>
    def css_repl(m: re.Match) -> str:
        return f"<style>\n{read(m.group(1))}\n</style>"

    html, n_css = re.subn(r'<link rel="stylesheet" href="([^"]+)">', css_repl, html)

    # <script src="js/x.js"></script> -> <script>...</script>
    def js_repl(m: re.Match) -> str:
        js = read(m.group(1))
        # 念のため: JS 文字列中の </script> が HTML パーサを誤切断しないよう退避
        js = re.sub(r"</script", r"<\\/script", js, flags=re.IGNORECASE)
        return f"<script>\n{js}\n</script>"

    html, n_js = re.subn(r'<script src="([^"]+)"></script>', js_repl, html)

    # Literal PNG references in HTML/CSS/JS -> embedded data URI.
    # This covers title portraits and future project-local image UI assets.
    def png_repl(m: re.Match) -> str:
        rel = m.group(2)
        path = (ROOT / rel).resolve()
        if ROOT not in path.parents or not path.is_file():
            return m.group(0)
        data = base64.b64encode(path.read_bytes()).decode("ascii")
        return f'{m.group(1)}data:image/png;base64,{data}{m.group(1)}'

    html, n_png = re.subn(r'(["\'])(assets/[^"\']+\.png)\1', png_repl, html)

    OUT.write_text(html, encoding="utf-8")
    size_kb = OUT.stat().st_size / 1024
    print(
        f"built {OUT.name}  "
        f"(css {n_css}, js {n_js}, ui png {n_png}, sprite png {n_sprite_png}, "
        f"fx png {n_fx_png}, {size_kb:.0f} KB)"
    )
    if n_css < 1 or n_js < 1:
        print("WARNING: 期待した <link>/<script> が見つからない。index.html の構造を確認。")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
