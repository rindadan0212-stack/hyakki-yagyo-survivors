# Player Motion Sprite System

The game derives animation frames at runtime from each character's existing
transparent pixel-art PNG. This preserves the character identity and palette
while avoiding dozens of duplicate raster files in the standalone build.

## Animation sets

- `idle`: 4 frames
- `walk`: 6 frames
- `cast`: 4 frames
- `dash`: 3 frames
- `hurt`: 2 frames

The sets are generated for Haru (`p_`), Suzu (`pc_suzu_`), and Mutsuki
(`pc_mutsuki_`). Every generated frame retains the source sprite's logical
footprint and foot anchor.

## State priority

`hurt > dash > cast > attack-as-walk > walk > idle`

Attack-specific player frames are disabled. When `attackT` is active, player
rendering uses the walk animation frames instead of a separate attack set.

Damage animation has its own timer and is not inferred from invulnerability,
so Idaten dash invulnerability does not incorrectly play a hurt pose.

## Art reference

`player_motion_reference.png` is a pose and silhouette reference only. The
shipping frames are generated from the existing in-game character sprites.
