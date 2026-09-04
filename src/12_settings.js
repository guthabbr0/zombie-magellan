/* ============================================================
   Device detection & settings
   ============================================================ */
const IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
const IS_MOBILE = IS_TOUCH && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (IS_TOUCH && Math.min(screen.width, screen.height) < 900);
if (IS_TOUCH) document.body.classList.add('touch');

const PRESETS = {
  low:    { scale: IS_MOBILE ? 0.55 : 0.7, dprCap: 1.0, shadows: 1, ssao: 0, bloom: 1, mblur: 0, vol: 0, fxaa: 0, tex: 512,  rain: 600,  zombies: 14, sharpen: 0.3, dynres: 1 },
  medium: { scale: IS_MOBILE ? 0.7 : 0.85, dprCap: 1.5, shadows: 2, ssao: 0, bloom: 1, mblur: 1, vol: 0, fxaa: 1, tex: 1024, rain: 1400, zombies: 20, sharpen: 0.35, dynres: 1 },
  high:   { scale: 1.0, dprCap: 2.0, shadows: 3, ssao: 1, bloom: 1, mblur: 1, vol: 1, fxaa: 1, tex: 1024, rain: 2400, zombies: 28, sharpen: 0.4, dynres: 0 },
  ultra:  { scale: 1.0, dprCap: 3.0, shadows: 4, ssao: 1, bloom: 1, mblur: 1, vol: 1, fxaa: 1, tex: 2048, rain: 4000, zombies: 36, sharpen: 0.45, dynres: 0 },
};
const SHADOW_SIZES = [0, 512, 1024, 2048, 4096];
const DEFAULTS = {
  preset: IS_MOBILE ? ((navigator.hardwareConcurrency || 4) >= 6 ? 'medium' : 'low') : 'high',
  fov: 96, fisheye: 0.6, ca: 0.6, grain: 0.7, vignette: 0.6, lensfx: 1, bodycamHud: 1, showFps: 0, crosshair: 1,
  sens: 1.0, touchSens: 1.0, invertY: 0, autoAim: IS_TOUCH ? 1 : 0, gyro: 0,
  master: 0.9, sfx: 1.0, music: 0.7, ambience: 0.9,
};
const S = Object.assign({}, DEFAULTS, PRESETS[DEFAULTS.preset]);
(function loadSettings() {
  try { const j = JSON.parse(localStorage.getItem('magellan.settings') || 'null'); if (j && typeof j === 'object') Object.assign(S, j); } catch (e) { }
})();
function saveSettings() { try { localStorage.setItem('magellan.settings', JSON.stringify(S)); } catch (e) { } }
function applyPreset(name) { Object.assign(S, PRESETS[name]); S.preset = name; }

const $ = id => document.getElementById(id);
