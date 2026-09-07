# MAGELLAN — design and architecture notes

This document is the "how it works" companion to the game. It exists so the pieces can be
reused: the renderer, the procedural texture and sound generators, the humanoid rig, the
cutscene scripting, the level builder, and the headless test harness. Everything is plain
ES2020 JavaScript and GLSL ES 3.00; there is no framework and no build step beyond
concatenation.

Units throughout: metres, seconds, radians. World axes: +X east, +Y up, −Z north
(a yaw of 0 faces north). Dates on screen are ISO 8601.

## 1. Repository layout

```
index.html              the whole game, built from src/ (do not edit by hand)
src/                    ordered source parts; tools/build.sh concatenates them
  00_head.html          document head, CSS, DOM overlays (menu, HUD, touch, cutscene)
  10_math.js            vec3 / mat4 / ray helpers
  12_settings.js        device detection, quality presets, persisted settings (S)
  14_gl.js              WebGL2 helpers: programs, textures, FBOs, meshes
  20_shaders_a.js       noise + PBR GLSL chunks, mesh/shadow/sky/particle/rain shaders
  22_shaders_post.js    SSAO, bloom, volumetrics, exposure, resolve, FXAA, lens pass
  24_shaders_tex.js     procedural texture generator (one program per material id)
  30_assets.js          texture generation driver, MeshBuilder, humanoid rig, weapon meshes
  40_renderer.js        render targets, lights, shadow matrices, frame graph (R)
  42_world.js           city block construction, colliders, nav grid, spawns (W, NAV)
  44_audio.js           WebAudio synthesis (A)
  50_player.js          player controller, camera body simulation, weapons, viewmodel (P)
  52_humanoid.js        skeleton FK, ragdoll, Zombie AI, NPC soldiers
  54_fx.js              particles, decals, temporary lights, pickups (FX)
  60_cutscene.js        generator-based cutscene engine and the four scripts (CS)
  70_game.js            state machine, objectives, waves, HUD, input, settings UI (G)
  80_main.js            boot sequence and main loop
  99_tail.html          closing tags
tools/                  build and headless test tooling (Playwright + SwiftShader)
assets/textures/        the GPU-generated materials baked to PNG (see assets/README.md)
assets/sounds/          the synthesized sounds rendered to WAV
assets/artifact/        variant of index.html without the document wrapper, for claude.ai artifacts
docs/screenshots/       development captures used to tune the look
```

`tools/build.sh` rebuilds `index.html` and runs `node --check` on the JavaScript. The build is
deterministic; the committed `index.html` is byte-identical to a fresh build.

## 2. Rendering

### 2.1 Frame graph (`R.renderFrame`)

1. **Shadow passes.** Moon: orthographic 140 m box that follows the camera, snapped to shadow
   texels to avoid shimmer; 512–4096 px depending on the preset. Flashlight: perspective map
   from the weapon light, 512–2048 px. Both are `DEPTH_COMPONENT24` textures sampled with
   `sampler2DShadow` (hardware compare, LINEAR = free 2×2 PCF) plus a 3×3 software kernel.
   Polygon offset is enabled during shadow rendering; the main shader adds normal-offset bias.
2. **Main opaque pass** into an MRT framebuffer: attachment 0 is HDR colour (`RGBA16F`, falls
   back to `RGBA8` when float attachments are unavailable), attachment 1 is view-space
   normal + linear depth (`RGBA16F`). Static world groups are drawn first, then skinned
   characters, then the procedural sky as a full-screen triangle at depth ≈ 1, then the
   weapon viewmodel after a depth clear with its own narrower projection.
3. **Transparent pass** into a second FBO that shares the colour texture and depth
   renderbuffer but does *not* attach the normal/depth texture (so it can be sampled for soft
   particles without a feedback loop): decals with polygon offset, alpha particles, additive
   particles, rain streaks, the storefront glass.
4. **Post chain**: half-res SSAO (16 hemisphere samples, 4×4 blur) → bloom (soft-knee
   prefilter, 5 downsample levels, tent upsample) → half-res volumetric flashlight (18-step
   raymarch through the flashlight shadow map, jittered, blurred) → 1×1 auto-exposure
   (8×8 log-average luminance, asymmetric temporal adaptation) → resolve (camera motion blur
   by depth reprojection, AO, volumetrics, bloom, exposure, ACES, colour grade, sRGB) → optional
   FXAA → lens pass to the screen.

### 2.2 Materials

Every surface uses the same PBR shader (`FS_MESH`) with defines for `SKINNED`, `ALPHA` and
`CUTOUT`. Inputs are two textures: albedo RGB + ambient occlusion in alpha (stored as
`SRGB8_ALPHA8` so filtering happens in linear space), and normal XY + roughness + metalness.
A material object (`mat({...})`) carries tint, emissive colour, roughness/metal multipliers,
normal strength, tiling and flags: `ground` enables the wetness/puddle model (procedural
puddle mask from world-space FBM, ripple normals, darkened albedo, low roughness), `wrap`
adds wrap lighting for skin, `unlit` bypasses lighting for emissive panels.

Lights per pixel: moon (directional, shadowed), flashlight (spot, shadowed), up to 10 point
lights and 4 spot lights chosen each frame by relevance (`intensity·radius / distance²`).
Spot attenuation uses `1/(d²+4)` so a light held at arm's length does not blow out the
subject; auto-exposure is clamped to [0.5, 2.0] with a key of 0.05 so night stays night.

Height fog is analytic (exponential in height, integrated along the view ray) and the sky
shader blends into the same fog colour at the horizon.

### 2.3 The bodycam lens pass (`FS_LENS`)

Applied last, on the tone-mapped image, in this order: rain droplets (two hashed cell layers
that slide down, refract the image and add a rim highlight) → glitch rows → barrel distortion
with zoom compensation (`p' = p(1 + k r²)/zoom`) → chromatic aberration (per-channel radial
offsets growing with r²) → unsharp-mask sharpening → lens dirt (procedural smudge texture,
weighted by scene brightness) → blood on lens (drop pattern in the dirt texture's G channel)
→ luminance grain and chroma noise scaled by the current auto-exposure gain (AGC noise) →
faint 8×8 block quantisation in the shadows → vignette → damage tint → static → white flash →
fade. Field of view in the settings is horizontal; the projection converts it to vertical.

### 2.4 Procedural sky

Full-screen pass driven by the inverse view-projection: horizon glow from the fog colour,
two-octave-set FBM clouds projected onto a plane at 300 m, moon disc and glow with cloud
occlusion, hashed star field, lightning multiplier shared with the mesh shader.

## 3. Procedural textures (`FS_TEXGEN`, `generateTexture`)

One small program is compiled per material id (`#define MAT n`) and rendered once into an
MRT pair (albedo+AO, normal+rough+metal) at 512/1024/2048 px depending on the preset. Height
is evaluated three times per texel to derive the normal by finite differences (`K` scales with
resolution so bumps look the same at every size). All surface noise is periodic (`noiseT`,
`fbmT`, `voroT` wrap their lattice) so tiles are seamless. Lattice hashes scramble integer
inputs first; the raw Hoskins hash is biased for small integers, which produced a regular dot
field in the first zombie skin.

Material ids: 0 asphalt, 1 road (16 m × 9 m tile with markings), 2 concrete slabs, 3 brick
facade (4 m × 3.6 m tile with an inset window), 4 plaster facade, 5 painted metal, 6 rusted
corrugated metal, 7 wood planks, 8 fabric, 9 zombie atlas, 10 soldier atlas, 11 decal atlas
(splat, pool, bullet hole, scorch), 12 sprite atlas (soft, smoke, blood drop, spark), 13 lens
dirt (R smudges, G blood pattern), 14 chain link (cutout), 15 blank, 16 roof gravel, 17 floor
tiles, 18 plain brick, 19 plain plaster.

The character atlas is a 4×4 grid of regions, one per body part; the humanoid mesh maps each
tube or ellipsoid to its region (`MB.regionUV`). Region 0 is the head with the face at u = 0.5,
so eyes, mouth, hair and (for soldiers) the helmet band are drawn procedurally.

## 4. Geometry

`MB` (MeshBuilder) emits an interleaved vertex layout: position, normal, uv, tangent (xyz + handedness)
and bone data (two indices + two weights). Primitives: boxes (with per-face world-space UV
mapping so facades tile in metres), tapered tubes with optional joint blending, ellipsoids,
and planes. Tangents are computed from UV derivatives after construction.

The world is built as ~45 draw calls by merging every static object into one mesh per
material key. Dynamic emissive parts (strobes, lamps, generator lamp) are separate drawables
with an `emissiveFn(t)`.

## 5. Characters

### 5.1 Rig

17 bones defined by head/tail positions in a rest pose (`BONES`): pelvis → spine → chest →
neck → head, two arms (upper, forearm, hand) and two legs (thigh, shin, foot). Skinning is
linear blend with two weights; tube vertices near a joint blend 50/50 with the parent bone.
Bone local rotations are Euler angles filled by the animation code; `computeBones` runs FK and
writes skin matrices (`world · translate(−restHead)`) into a `Float32Array(17·16)` uploaded as
`uBones`.

### 5.2 Animation

`Zombie.animate` builds every pose procedurally from a walk phase and per-instance style
parameters (sway, arm raise, limp, hunch, head tilt, stride). States: chase, attack (wind-up
then strike, damage at 0.42 s), stagger, dead. Hit reactions are spring offsets added on top.
Runners use a different gait and arm pump. NPC soldiers share the rig with idle, talk, aim,
fire, run and dead poses; their rifle is attached to the chest bone and carries a spotlight.

### 5.3 Ragdoll

On death the 22 joint points are initialised from the current bone matrices, given the
character's velocity plus an impulse at the hit bone, and integrated with Verlet (2 substeps,
4 constraint iterations): bone-length constraints, structural cross constraints for the torso,
minimum-distance joint limits, ground contact with friction and axis-aligned obstacle push-out.
Bone matrices are rebuilt from point pairs: for each bone a basis from its current direction
and a torso reference vector, multiplied by the transpose of the same basis at rest. Corpses
sink and are recycled after 18 s; at most 14 are kept.

## 6. Player and camera

The camera is a chest-mounted bodycam driven by springs rather than direct input:
- a vertical dip spring receives impulses on footsteps, landings and hits;
- roll follows strafe velocity and yaw rate; pitch follows forward acceleration;
- breathing amplitude rises as stamina falls; a layered-sine handheld tremor is always present;
- recoil kicks pitch/yaw through a damped spring and pushes the weapon back along its axis.

The viewmodel lives in camera space (hip and ADS anchors per weapon, sway from look rates,
bob, sprint pose, reload/pump timelines that move the magazine, left hand and slide bones)
and is rendered with a narrower projection after a depth clear. Its world matrix is
`cameraWorld · viewmodel`, so lighting, shadows and the flashlight (attached to the rail) are
all consistent with the world.

Weapons are hitscan with per-pellet spread, capsule tests against every bone of every zombie
(head ×3, torso ×1, limbs ×0.6) and AABB tests against the world. Three weapons: P9 (15 rounds,
semi), M4A1 (30, auto), S12 pump (8 shells, 9 pellets, shell-by-shell reload).

## 7. World and navigation

`buildWorld` lays out Harbor Street: a 16 m main road running north–south with sidewalks,
a cross street, generated building strips with random widths/heights/facades and alleys with
fences and dumpsters, backdrop rows without collision, the checkpoint (Humvee, floodlight,
sandbags, barriers), the pharmacy with a hollow ground floor, the north plaza with landing
lights, cars, a police cruiser with strobes, a burning car, lamps (some lit, some flickering),
traffic lights, trees, rubble, pickups and spawn points tagged by area.

Collision is 2D circle-vs-AABB with a ground-height function for kerbs and the plaza.
Navigation is a 1 m grid (80 × 194 cells) blocked by colliders; a breadth-first flow field is
recomputed from the player every 0.3 s and zombies descend it (no corner cutting), switching
to direct pursuit with line of sight inside 14 m, with separation forces between them.

## 8. Audio

Everything is synthesised at call time from oscillators, noise buffers (white and pink) and
biquads, routed through a compressor and a generated impulse-response reverb. Positional sounds
get distance gain, distance low-pass and stereo pan from the listener frame. Notable recipes:
gunshots (band-passed noise with a sweeping centre + low sine thump + high-pass crack),
zombie groans (saw with vibrato through a wave shaper and two formant band-passes plus breath
noise), thunder (low-passed pink noise with a multi-stage envelope), helicopter (amplitude
modulated low-passed noise plus a 28 Hz sub), music (four detuned saws through a slow LFO
low-pass with a pulse layer that speeds up with intensity).

## 9. Cutscenes

`CS.start(name, generatorFn, finishFn, opts)` runs a `function*` script; each `yield n`
waits n seconds. Helpers: `say`, `card`, `setBlack`, `letterbox`, `static`, `lookAt`,
`lookDir`, `moveTo`, `setPos`, `shake`, `flashWhite`. Player input is disabled but the camera
body simulation keeps running, so every scene stays "on the bodycam". `finish` is called on
natural end and on skip and must set the end state idempotently. The stepper accumulates
elapsed time so tight loops (the white-out flash) stay in sync even on slow frames.

Scripts: intro (checkpoint briefing, ambush, rifle pickup), pharmacy (survivor briefing,
horde reveal, radio loss of the checkpoint), extraction (helicopter, searchlight, white-out,
evidence card), death (camera falls, static, signal lost).

## 10. Game flow

Objectives: hold the checkpoint (70 s) → pharmacy → generator (hold E for 3.2 s) → landing
zone → hold the LZ (105 s) → extraction. Each objective snapshots a checkpoint (position,
weapons, world power state) for retry. The wave director keeps a target number of zombies alive
that grows with objective index and time, spawns 20–75 m from the player out of line of sight,
and raises the runner probability over time. Music intensity follows nearby threats.

## 11. Settings and performance

Presets set render scale, DPR cap, shadow size, SSAO, bloom, motion blur, volumetrics, FXAA,
texture size, rain count and zombie cap. Dynamic resolution (on for Low/Medium) steps the
render scale by 0.1 to hold a frame-time target. Everything is persisted in `localStorage`
under `magellan.settings`.

Cost centres, most expensive first: the flashlight shadow pass (redraws the scene), the
volumetric raymarch, SSAO, the lens pass at full canvas resolution. On the software rasteriser
used for testing the High preset ran at roughly one frame per second at 720p; the Low preset at
480p reached about 5 fps. Real GPUs are two orders of magnitude faster, but the presets have not
been benchmarked on hardware.

## 12. Testing

`tools/run2.js` drives the built page with Playwright on SwiftShader (`--use-angle=swiftshader
--enable-unsafe-swiftshader`), executes JSON step lists (`tools/steps/*.json`: waits, JS
evaluations against `window.MAGELLAN`, screenshots), and reports page errors. `tools/run3.js`
does the same with iPhone touch emulation. `tools/shot.js` is the simpler single-screenshot
variant, `tools/glprobe.*` checks WebGL2 capabilities, `tools/dbg.*` isolates a shader.
`tools/export_textures.js` and `tools/export_sounds.js` bake the procedural assets.

Because frame time is clamped to 50 ms, simulation time runs slower than wall time on a slow
renderer; test steps advance cutscenes explicitly (`CS.wait = 0; CS.step(n)`) rather than
waiting in real time.

## 13. Known limitations and ideas

- No mid-air ledge or slope handling; the world is flat with 0.12 m kerbs.
- Ragdoll knees can bend backwards (no directional joint limits).
- Decals are placed on ground and AABB faces only; no projection onto arbitrary geometry.
- The moon has no volumetric scattering; only the flashlight does.
- Presets are estimates, not measured on hardware; the FPS overlay (Settings → Show performance
  stats) helps tune them.
- Ideas: gyro aiming on mobile, a photo-mode, a proper NPC inverse-kinematics grip, streaming a
  larger district, save slots.
