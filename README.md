# MAGELLAN — bodycam zombie shooter (single-file HTML)

A first-person, found-footage style zombie shooter that lives entirely in **`index.html`**.
No build step, no dependencies, no external assets: open the file in a modern browser
(desktop or mobile, landscape) and play.

## Features

- **Custom WebGL2 renderer** — physically based shading (GGX), normal-mapped procedural
  materials, moon + flashlight shadow maps (PCF), wet surfaces with animated puddles,
  height fog, procedural sky with moving clouds, moon and lightning.
- **Bodycam look** — fisheye barrel distortion with chromatic aberration, animated
  sensor noise tied to automatic gain, auto-exposure that lags like a real camera,
  rain droplets that refract the image, lens dirt, blood on the lens when you are hit,
  vignette, sharpening, glitch/static transitions, camera motion blur, bloom, SSAO,
  FXAA, volumetric flashlight shafts, and an on-screen REC / timestamp / battery overlay.
- **Body simulation** — a chest-mounted camera driven by springs: step impacts,
  landing dips, lean into strafes and turns, breathing that gets heavier with low
  stamina, handheld micro-shake, recoil kick, weapon sway with inertia.
- **Characters** — a procedurally built, smoothly skinned humanoid rig (17 bones) used
  for zombies and soldiers, procedural walk/attack/stagger animation, and a verlet
  ragdoll (22 particles) on death with ground and obstacle collision.
- **Procedural everything** — all textures (asphalt, brick, plaster, metal, zombie skin
  atlases with wounds and blood, soldier uniforms, decals, sprites) are generated on the
  GPU at start-up; all sounds (gunshots, groans, footsteps, rain, wind, thunder, music,
  helicopter, radio) are synthesised with WebAudio.
- **Three weapons** — P9 sidearm, M4A1 carbine (found during the intro), S12 pump shotgun
  (dropped later). Aim down sights, reload animations, shell-by-shell shotgun reloads.
- **Mission with cutscenes** — a scripted, skippable intro at the checkpoint, a mid-game
  pharmacy scene with a horde reveal, a helicopter extraction ending and a death sequence,
  all filmed from the bodycam itself with letterboxing and subtitles.
- **Five objectives** — hold the checkpoint, push north to the pharmacy, restore power at
  the block generator, reach the plaza, hold the landing zone. Checkpoints on every
  objective, retry from checkpoint after death.
- **Mobile friendly** — virtual stick, drag-to-look, on-screen buttons, aim assist,
  landscape lock with a rotate prompt, fullscreen, dynamic resolution.
- **Graphics settings** — Low / Medium / High / Ultra presets plus individual toggles
  (render scale, shadows, SSAO, bloom, motion blur, volumetrics, FXAA, texture size,
  rain density, zombie count, FOV, fisheye, chromatic aberration, grain, vignette,
  sharpening). Settings persist in `localStorage`.

## Controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move | `W A S D` | left stick |
| Look | mouse | drag right half |
| Fire | left button | FIRE (hold) |
| Aim down sights | right button | AIM (toggle) |
| Reload | `R` | RELOAD |
| Weapons | `1` `2` `3`, `Q`, wheel | SWAP |
| Sprint | `Shift` | RUN (toggle) |
| Jump / crouch | `Space` / `C` | JUMP |
| Flashlight | `F` | LIGHT |
| Interact | hold `E` | hold USE |
| Pause | `Esc` | II |

Any key or tap skips a cutscene.

## Running

Open `index.html` directly, or serve the folder with any static server. Requires WebGL2.
Units in the code are metres, seconds and radians; dates on screen are ISO 8601.
