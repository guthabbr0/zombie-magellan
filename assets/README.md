# Baked assets

The game generates every texture and sound at run time. The files in this folder are those
same generators rendered to conventional formats so they can be reused elsewhere (any engine,
image editor or DAW). They were exported with `tools/export_textures.js` and
`tools/export_sounds.js`; re-run those after changing the generators.

## textures/

Five PNG maps per material, 1024 × 1024 px for surfaces and character atlases,
512 px for decals and lens dirt, 256 px for sprites and chain link:

| Suffix | Content | Colour space |
| --- | --- | --- |
| `_albedo.png` | base colour | sRGB |
| `_ao_alpha.png` | ambient occlusion for surfaces; coverage alpha for `decals`, `sprites`, `chain` | linear grey |
| `_normal.png` | tangent-space normal, OpenGL convention (+Y up), Z stored as 255 (reconstruct with `z = sqrt(1 − x² − y²)`) | linear |
| `_roughness.png` | roughness, 0 = mirror, 255 = fully rough | linear grey |
| `_metallic.png` | metalness | linear grey |

Materials: `asphalt`, `road` (16 m × 9 m, u across the road), `concrete`, `brickFacade` and
`plasterFacade` (4 m × 3.6 m with a window), `brick`, `plaster`, `metal` (paint, multiply by a
tint), `rust`, `wood`, `fabric`, `roof`, `tiles`, `chain`, `blank`, `zombie0`–`zombie2` and
`soldier` (4 × 4 body-part atlases, see `docs/DESIGN.md` §3 for the region layout), `decals`
(2 × 2: blood splat, blood pool, bullet hole, scorch), `sprites` (2 × 2: soft, smoke, blood drop,
spark), `lensdirt` (R = smudges and specks, G = blood pattern; not tileable).

Tileable materials repeat seamlessly; the atlases, decals, sprites and lens dirt do not tile.

## sounds/

32 mono/stereo 16-bit 44.1 kHz WAV files, peak-normalised to −0.9 dBFS, rendered with an
`OfflineAudioContext` from the game's synthesis code (`src/44_audio.js`). Sequenced sounds that
use timers in the game (magazine in/out clicks, shell casing tinks) are exported as single
elements; the loops (`ambience_rain_wind`, `ambience_fire`, `helicopter_loop`, `music_drone`)
are 4–8 s excerpts of continuous generators and are not seamless.

## artifact/

`magellan.html` is `index.html` without the document wrapper (`<!DOCTYPE>`, `<html>`,
`<head>`, `<body>`), which is how the claude.ai artifact host expects a page to be authored.
