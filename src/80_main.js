/* ============================================================
   Boot & main loop
   ============================================================ */
const nextFrame = () => new Promise(r => requestAnimationFrame(r));
async function boot() {
  const status = $('status'), pbar = $('pbar');
  if (!GL_OK) { status.textContent = 'WebGL2 is not available in this browser.'; $('warn').textContent = 'This game needs WebGL2 (Chrome, Firefox, Edge, Safari 15+). Try enabling hardware acceleration.'; return; }
  try {
    status.textContent = 'Compiling shaders…'; await nextFrame(); R.init(); pbar.style.width = '10%'; await nextFrame();
    for (let i = 0; i < TEX_DEFS.length; i++) { status.textContent = 'Generating textures… ' + TEX_DEFS[i][0]; generateTexture(TEX_DEFS[i]); pbar.style.width = (10 + 60 * (i + 1) / TEX_DEFS.length) + '%'; await nextFrame(); }
    status.textContent = 'Building district…'; await nextFrame(); P.initMeshes(); Zombies.init(); NPCs.init(); FX.init(); buildWorld(); pbar.style.width = '90%'; await nextFrame();
    G.init(); navUpdate(0, 60); pbar.style.width = '100%'; status.textContent = 'Camera ready · ' + (IS_MOBILE ? 'mobile profile' : 'desktop profile') + ' · ' + S.preset.toUpperCase();
    $('btnStart').disabled = false;
    if (IS_TOUCH) $('foot').innerHTML = 'Touch: left stick to move · drag right side to look · FIRE / AIM / RELOAD buttons<br>Play in landscape · headphones recommended';
    requestAnimationFrame(loop);
  } catch (e) { console.error(e); status.textContent = 'Initialization failed: ' + e.message; $('warn').textContent = 'Your GPU or browser rejected the renderer. Try another browser or update graphics drivers.'; }
}
let lastT = 0, frames = 0, fpsT = 0;
function loop(now) {
  requestAnimationFrame(loop); window.__frame = (window.__frame || 0) + 1;
  const rawDt = Math.max(0.001, (now - lastT) / 1000); const dt = Math.min(0.05, rawDt); lastT = now;
  frames++; fpsT += rawDt; if (fpsT > 0.5) { G.fps = frames / fpsT; frames = 0; fpsT = 0; }
  if (document.hidden) return;
  try {
    const t0 = performance.now(); G.update(dt); const t1 = performance.now(); R.dynamicRes(rawDt); G.render(dt); const t2 = performance.now();
    G.perf.update = lerp(G.perf.update, t1 - t0, 0.1); G.perf.render = lerp(G.perf.render, t2 - t1, 0.1);
  } catch (e) { if (!window.__errLogged) { window.__errLogged = true; console.error(e); } }
}
window.MAGELLAN = { G, P, R, W, S, Zombies, NPCs, FX, CS, A, V3, M4, B };
boot();
