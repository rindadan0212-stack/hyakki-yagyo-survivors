# Boss Motion Sprite System

The six bosses derive animated pixel-art frames at runtime from their two
existing raster frames. The source identity, palette, logical scale, and
anchor remain intact.

## Animation sets

- `idle`: 4 frames
- `move`: 4 frames
- `telegraph`: 3 frames
- `attack`: 4 frames
- `hurt`: 2 frames
- `rage`: 4 frames

This creates 21 frames per boss and 126 frames in total.

## Bosses

- Bake-danuki
- Nure-onna
- Ushi-oni
- Nue
- Gashadokuro
- Shuten-doji

## State priority

`hurt > rage > scripted boss state > attack > telegraph > move > idle`

Scripted states include Tanuki's drum, Ushi-oni's charge warning and rush,
Nue's swoop, Nure-onna's dash, and Gashadokuro's sweep.
