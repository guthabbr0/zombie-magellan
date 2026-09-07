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

Any key or tap skips a cutscene. If the browser refuses pointer capture (for example inside
an embedded frame), looking falls back to plain mouse movement.

## Running

Open `index.html` directly, or serve the folder with any static server. Requires WebGL2.
Units in the code are metres, seconds and radians; dates on screen are ISO 8601.

## Repository layout (branch `dev`)

| Path | What it is |
| --- | --- |
| `index.html` | the complete game, generated from `src/` |
| `src/` | ordered source parts (HTML head, math, GL helpers, shaders, assets, renderer, world, audio, player, characters, effects, cutscenes, game, main) |
| `tools/build.sh` | concatenates `src/` into `index.html` and syntax-checks the JavaScript |
| `tools/run2.js`, `run3.js`, `shot.js`, `steps/` | headless Playwright test runners (desktop and touch emulation) and the scripted test scenarios |
| `tools/export_textures.js`, `export_sounds.js` | bake the procedural textures to PNG and the synthesised sounds to WAV |
| `assets/textures/`, `assets/sounds/` | the baked assets, ready to reuse elsewhere (see `assets/README.md`) |
| `assets/artifact/magellan.html` | the page without its document wrapper, for the claude.ai artifact host |
| `docs/DESIGN.md` | architecture and reuse notes for every subsystem |
| `docs/TRANSCRIPT.md` | curated transcript of the development session and lessons learned |
| `docs/screenshots/` | development captures used to tune the look |

To change the game: edit files under `src/`, run `tools/build.sh`, then test with
`NODE_PATH=<global node_modules> node tools/run2.js tools/steps/steps_e.json 960 540`.
