# Lighting Implementation

## Rendering

- Darkness is cut by lanterns, player powers, wards, bosses, projectiles, chests, and transient impacts.
- Colored additive lights add ground reflections, radial halos, rays, and glints.
- A low-resolution bloom buffer is composited before the vignette and HUD so the interface remains crisp.

## Adaptive Quality

- Bloom update frequency and opacity scale with measured FPS.
- Low-priority halos and decorative rays are reduced under load.
- The active colored-light count is capped dynamically to preserve combat readability and frame rate.

## Integration

- Lantern color, damage flicker, and surge state affect emitted light.
- Player sigils, casting, buffs, projectiles, elite enemies, and bosses use distinct light colors.
- `G.fx.light()` provides short-lived colored light for impacts and special effects.
