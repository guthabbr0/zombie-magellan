# Session transcript and development log

Session: https://claude.ai/code/session_01LD5KB44V1fSvnTvcmoBbng · 2026-09-04
Model: Claude Fable 5.1 (Claude Code, remote environment, headless Linux with Chromium + SwiftShader)

The raw message log of the session is not stored inside the container, so this is a curated
transcript: the user's requests verbatim, and a faithful, chronological account of what was
decided, built, tested and fixed in response. Tool output has been summarised.

---

## Request 1 (user)

> You are a professional game developer and creativity genius. You have to create a game in
> single file html. The game will be a first person focused Zombie shooter game. Main features
> which I need: Absolute photorealism, textures, and tricks used by games such as bodycam to
> fake footage look such as fisheye distortion, chromatic aberration, post processing, true body
> simulation etc. It has to be mobile friendly (landscape orientation), optimised for all devices
> and also have graphics settings and a proper startup screen. It has to have cutscenes (make them
> as good and realistic as possible). You have to decide on everything else. All the best. This
> test is being evaluated.

### Decisions taken before writing code

- **No dependencies.** A single HTML file with a CDN import is not self-contained, so the
  renderer, asset generation and audio were written from scratch on WebGL2 and WebAudio.
- **Found-footage as the unifying rule.** Every cutscene is shot from the bodycam itself. This
  keeps the illusion consistent, avoids third-person animation quality problems, and lets the
  camera body simulation (breathing, handheld tremor) run through the scenes.
- **Photorealism through lighting rather than geometry.** Night, rain, fog, wet surfaces,
  PBR shading, shadow maps, auto-exposure, grain and lens artefacts hide the fact that all
  geometry is boxes, tubes and ellipsoids. This is exactly the trick the bodycam genre relies on.
- **Procedural everything.** Textures generated on the GPU at start-up (20 materials, two
  character atlases with faces, wounds and uniforms), sounds synthesised with WebAudio, a city
  block laid out by code with a seeded random generator.
- **Development method.** The game was written as ordered source parts concatenated by a build
  script, and validated headlessly with Playwright on Chromium's SwiftShader software
  rasteriser: shader compilation, screenshots, and scripted gameplay through
  `window.MAGELLAN`.

### Build order and what each step surfaced

1. **Environment probe.** Confirmed WebGL2 with `EXT_color_buffer_float`, anisotropic
   filtering and 8192 px textures in headless Chromium. Playwright found in the global
   node modules.
2. **HTML/CSS skeleton**: menu, settings sheet with tabs, HUD (REC, timestamp, battery,
   ammo, health, objective, marker), touch controls, cutscene letterbox and subtitles,
   game-over panel, rotate-device overlay.
3. **Math, settings, GL helpers.**
4. **Shaders.** Mesh PBR with moon/flashlight shadows, point and spot lights, wetness and
   puddles, fog; shadow depth; procedural sky; particles with soft depth; rain streaks;
   SSAO; bloom; volumetric flashlight; auto-exposure; resolve with motion blur and ACES;
   FXAA; the lens pass. First compile errors: fragment precision must precede the shared
   noise chunk (fixed by injecting precision qualifiers in the program header), and `PI`
   had to be guarded in both GLSL chunks.
5. **Texture generator.** Inspected each material as albedo/normal previews. Fixes: normal
   strength scaled with resolution; the zombie skin was far too pale with a regular field of
   round wounds — the lattice hash was biased for small integer inputs (28 % of cells passed
   an 18 % gate and the pattern repeated per atlas region). Scrambling integer lattice
   coordinates before hashing, dropping the tiling period for atlas regions, and reworking the
   gore layers (organic FBM-distorted blood, sparse wounds with rims, veins, bruises, grime)
   fixed it. Asphalt cracks thinned, camo darkened, sandbag fabric darkened later.
6. **Mesh builder, humanoid rig, weapon meshes.**
7. **Renderer**, **world**, **audio**, **player**, **humanoid/zombie/NPC**, **effects**,
   **cutscenes**, **game controller**, **main loop**. First full build: 289 KB, boots to the
   menu with no errors.
8. **Headless gameplay tests.** Discovered the frame rate on SwiftShader was under 1 fps at the
   High preset, and that the FPS counter had been reading clamped simulation time instead of
   wall time. A "low" test profile (render scale 0.5, 512 px shadows, no SSAO/volumetrics/
   FXAA) gives about 5 fps, enough for functional testing. Test steps advance cutscenes
   explicitly instead of waiting in real time.
9. **Verified**: intro cutscene, skip, objectives 1–5, generator interaction, LZ hold,
   extraction, death, retry, weapon switching, reload, ADS, shotgun pump, hit registration
   (one aimed shot at a chest capsule removed exactly the rifle's damage), ragdoll physics
   (numerically and visually), blood decals, mobile layout with touch emulation, settings sheet.

### Bugs found and fixed during testing

- HUD crashed when the interact prompt was stale after an objective change (guard added,
  flag reset in `setObjective`).
- Cutscene stepper advanced one `yield` per frame; changed to accumulate elapsed time so
  timing loops stay correct on slow frames.
- Dividing by a zombie speed of zero (a test set-up) produced NaN bones; guarded.
- A freshly killed zombie rendered at the origin for one frame because the ragdoll bone
  matrices were only computed on the next step; now computed on the death frame.
- Severe overexposure: auto-exposure maximum lowered from 5.5× to 2.0×, key 0.11 → 0.05;
  flashlight, floodlight, headlights and lamps re-balanced; spot attenuation changed from
  `1/(d²+0.5)` to `1/(d²+4)` so close subjects keep detail; bloom threshold raised.
- Field of view was applied as vertical; the setting is now horizontal (96° default) and
  the viewmodel projection widened to 74°, after which the weapon hip anchors were raised so
  all three weapons sit in frame.
- The pharmacy interior and survivor were hidden because the building box covered the ground
  floor; the upper floors now start at 3.6 m, with separate ground-floor walls, a see-through
  storefront (alpha material in the transparent pass) and a barricaded door.
- Blood-on-lens blobs were large and opaque; made smaller, translucent and less frequent.
- Landing-zone lights and pharmacy sign/ceiling light reduced; the touch ammo readout was
  moved off the FIRE button; gameplay HUD elements are hidden during cutscenes.
- Menu camera was facing a wall; now frames the checkpoint from the east sidewalk.

### Delivery

- Commits on `claude/zombie-shooter-game-gmsx09`. The first pushes failed with HTTP 403
  because the Claude GitHub App was not authorised for the repository; the game was also
  published as a private artifact (https://claude.ai/code/artifact/77582a79-7148-41d0-b000-7d2687a7cb74)
  with a mouse-look fallback added for environments where pointer lock is unavailable.

## Request 2 (user)

> please commit/push to the repo

Push retried with back-off; still 403. Delivered `index.html`, `README.md` and a git bundle of
the branch as file attachments as a manual fallback.

## Request 3 (user)

> try now, there was some auth issues with github requesting new permissions for claude

Push succeeded: four commits on `claude/zombie-shooter-game-gmsx09`
(`ed4c9d3`, `b11268c`, `4c80791`, `eae4b33`).

## Request 4 (user)

> I need you to push all the resources you used to generated this, the textures, th documentes
> and all the stuff to make sure what I can reuse the thing properly, I changed the master branch
> to main (renamed), make another one called dev and push all the resources, sounds, anything you
> generated and it's around here so we have a perfect copy, also include a transcript of this
> conversation and anything you determined is important to keep, thanks choom, may the code be
> with you

Actions:
- Fetched `origin/main` (the renamed branch plus the user's upload of the git bundle).
- Created `dev` from `origin/main`.
- Added `src/` (the ordered source parts), `tools/` (build script, Playwright runners, test
  step files, shader probe, asset exporters), `docs/` (this transcript, DESIGN.md, curated
  screenshots), `assets/textures/` (every material baked to PNG: albedo, AO/alpha, normal,
  roughness, metallic), `assets/sounds/` (32 synthesised sounds rendered to WAV via an
  OfflineAudioContext), `assets/artifact/` (the artifact variant of the page).
- The exporter initially produced blank normal maps (out-of-bounds `readPixels` is not a GL
  error, so a size probe picked 2048 px, and the metalness channel in alpha made PNGs
  transparent); fixed by reading sizes from the game's own table and splitting channels.
  The WAV exporter first only attenuated; changed to normalise peaks to −0.9 dBFS.

---

## Things worth keeping in mind for future work

- Rebuild with `tools/build.sh` after editing anything under `src/`; never edit `index.html`
  directly.
- Headless testing on SwiftShader is slow; use the low profile in `tools/steps/*.json`
  (`LOWCFG` environment variable in `tools/run2.js`) and expect ~5 fps at 960×540.
- The lattice-hash bias lesson applies to any procedural texture code: never feed small
  integers straight into a fract/dot hash; scramble first.
- Reading back from an FBO outside its bounds returns zeros silently; derive sizes from
  metadata, not probes.
- Auto-exposure needs hard limits in a night scene, or the average-luminance key will drag
  the gain up and wash everything out.
- Spot lights near the camera need a large softening constant in the attenuation or subjects
  at arm's length clip to white.
- `S.fov` is horizontal. Keep the viewmodel projection and the weapon anchors in step when
  changing it.
