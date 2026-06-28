# Player Animation Reference

The AI-generated pose sheet is stored as `player_motion_reference.png`.

It is a motion-design reference only. Shipping frames are generated from the
existing low-resolution character PNGs so faces, costumes, palettes, and foot
anchors remain stable in every animation.

Motion set:

- `idle`: 4 frames
- `walk`: 6 frames
- `cast`: 4 frames
- `dash`: 3 frames
- `hurt`: 2 frames

Attack-specific player frames are no longer shipped. Runtime attack display
reuses the walk motion.
