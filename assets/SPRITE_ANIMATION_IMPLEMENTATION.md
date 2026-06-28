# Sprite Animation Implementation

## Assets

- Three player characters and six bosses use 183 independent PNG frames.
- Player states: idle, walk, cast, dash, and hurt.
- Boss states: idle, move, telegraph, attack, rage, and hurt.
- Source sheets live in `assets/sprites/animation_sheets/`.
- Runtime frames live in `assets/sprites/animation/`.

## Build

Run:

```text
python tool/build_sprite_animation_frames.py
python build_standalone.py
```

The frame builder removes neighbouring-cell fragments, keeps a stable ground
anchor, exports separate transparent PNG files, and updates `manifest.json`.

Player attack-specific sprite frames are intentionally disabled. While attacking,
the runtime reuses the walk animation so character bodies keep the same movement
language as normal traversal.

## Runtime

Animation selects registered frame names from the entity state and timer.
The raster loader copies each PNG into its canvas without deforming a base image.
