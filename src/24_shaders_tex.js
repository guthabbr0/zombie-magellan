/* ---------- procedural texture generator ----------
   MAT ids: 0 asphalt 1 road 2 concrete 3 brickFacade 4 plasterFacade 5 metalPaint 6 rustMetal 7 wood 8 fabric
            9 zombie 10 soldier 11 decals 12 sprites 13 lensdirt 14 chainlink 15 blank 16 tarmacRoof 17 tiles
   outputs: o0 = albedo(rgb, linear) + ao ; o1 = normal.xy, roughness, metallic   */
const FS_TEXGEN = GLSL_NOISE + `
precision highp float; in vec2 vUV; layout(location=0) out vec4 o0; layout(location=1) out vec4 o1;
uniform float uSeed;
float sat(float x){ return clamp(x, 0.0, 1.0); }
float box(vec2 p, vec2 c, vec2 s){ vec2 d = abs(p - c) - s; return max(d.x, d.y); }
float ell(vec2 p, vec2 c, vec2 r){ vec2 d = (p - c)/r; return dot(d, d); }
vec3 hsv(float h, float s, float v){ vec3 k = clamp(abs(fract(h + vec3(0.0, 2.0/3.0, 1.0/3.0))*6.0 - 3.0) - 1.0, 0.0, 1.0); return v*mix(vec3(1.0), k, s); }

// ---- surfaces ----
void mAsphalt(vec2 uv, float per, out vec3 col, out float rough, out float metal, out float h, out float ao){
  float grain = fbmT(uv*per*16.0, per*16.0, 3); float ag = voroT(uv*per*40.0, per*40.0).x;
  float stone = smoothstep(0.35, 0.05, ag);
  float patches = fbmT(uv*per*1.5 + 3.0, per*1.5, 3);
  vec3 cr = voroT(uv*per*2.5 + 7.0, per*2.5); float crack = 1.0 - smoothstep(0.0, 0.06 + 0.05*fbmT(uv*per*8.0, per*8.0, 2), cr.y - cr.x);
  crack *= smoothstep(0.5, 0.68, fbmT(uv*per*1.0 + 11.0, per*1.0, 2));
  vec3 base = vec3(0.11, 0.108, 0.105)*(0.75 + 0.5*grain)*(0.8 + 0.4*patches);
  base += stone*vec3(0.06); base = mix(base, base*0.35, crack);
  col = base; rough = 0.86 - stone*0.15 + crack*0.1; metal = 0.0;
  h = grain*0.25 + stone*0.5 - crack*1.5 + patches*0.2; ao = 1.0 - crack*0.5;
}
void mRoad(vec2 uv, out vec3 col, out float rough, out float metal, out float h, out float ao){
  // texture spans 16 m in u, 9 m in v ; keep noise square with aspect
  vec2 q = vec2(uv.x*16.0/9.0, uv.y); mAsphalt(q, 9.0, col, rough, metal, h, ao);
  float wear = fbmT(uv*vec2(16.0, 9.0)*0.7, 9.0, 3);
  float dash = step(0.5, fract(uv.y*1.0 + 0.25))*(1.0 - smoothstep(0.004, 0.0075, abs(uv.x - 0.5)));
  float edge = (1.0 - smoothstep(0.0045, 0.007, abs(uv.x - 0.035))) + (1.0 - smoothstep(0.0045, 0.007, abs(uv.x - 0.965)));
  float lane = (1.0 - smoothstep(0.004, 0.007, abs(uv.x - 0.27)))*step(0.5, fract(uv.y*3.0)) + (1.0 - smoothstep(0.004, 0.007, abs(uv.x - 0.73)))*step(0.5, fract(uv.y*3.0 + 0.5));
  float mark = clamp(dash*1.0 + edge + lane*0.8, 0.0, 1.0)*smoothstep(0.35, 0.7, wear);
  vec3 mc = mix(vec3(0.75, 0.72, 0.6), vec3(0.8, 0.65, 0.2), step(abs(uv.x - 0.5), 0.02));
  col = mix(col, mc, mark*0.85); rough = mix(rough, 0.6, mark); h += mark*0.3;
  // gutter darkening
  float gut = smoothstep(0.06, 0.0, uv.x) + smoothstep(0.94, 1.0, uv.x); col *= 1.0 - gut*0.35; ao *= 1.0 - gut*0.3;
}
void mConcrete(vec2 uv, out vec3 col, out float rough, out float metal, out float h, out float ao){
  float per = 4.0; vec2 p = uv*2.0; // 2 slabs per tile
  vec2 f = fract(p); float joint = 1.0 - smoothstep(0.0, 0.03, min(min(f.x, 1.0-f.x), min(f.y, 1.0-f.y)));
  float grain = fbmT(uv*per*24.0, per*24.0, 3); float stain = fbmT(uv*per*1.2 + 5.0, per*1.2, 4); float spots = smoothstep(0.62, 0.72, fbmT(uv*per*5.0 + 2.0, per*5.0, 3));
  vec3 cr = voroT(uv*per*1.7 + 4.0, per*1.7); float crack = (1.0 - smoothstep(0.0, 0.03, cr.y - cr.x))*smoothstep(0.55, 0.7, fbmT(uv*per*0.8 + 9.0, per*0.8, 2));
  vec3 base = vec3(0.36, 0.35, 0.33)*(0.8 + 0.4*grain); base = mix(base, base*vec3(0.55, 0.5, 0.45), stain*0.6); base = mix(base, base*0.7, spots*0.5); base = mix(base, base*0.4, joint); base = mix(base, base*0.4, crack);
  col = base; rough = 0.82 + 0.1*grain - crack*0.1; metal = 0.0; h = grain*0.3 - joint*2.0 - crack*1.2 + spots*0.1; ao = 1.0 - joint*0.5 - crack*0.4;
}
void mBrick(vec2 uv, out vec3 col, out float rough, out float metal, out float h, out float ao){
  // tile = 4 m x 3.6 m; brick 0.25 x 0.075
  vec2 bp = vec2(uv.x*16.0, uv.y*48.0); float row = floor(bp.y); bp.x += mod(row, 2.0)*0.5; vec2 bi = floor(bp); vec2 bf = fract(bp);
  float bhash = hash12(mod(bi, vec2(16.0, 48.0)) + uSeed);
  float mortar = 1.0 - smoothstep(0.0, 0.08, min(bf.x*2.0, min(bf.y*2.5, min((1.0-bf.x)*2.0, (1.0-bf.y)*2.5))));
  float grain = fbmT(uv*64.0, 64.0, 3);
  vec3 bc = mix(vec3(0.42, 0.18, 0.12), vec3(0.55, 0.30, 0.2), bhash)*(0.75 + 0.5*grain); bc = mix(bc, vec3(0.25, 0.14, 0.11), smoothstep(0.8, 0.95, hash12(bi*1.7)));
  vec3 mc = vec3(0.45, 0.42, 0.38)*(0.7 + 0.5*grain);
  float dirt = fbmT(uv*3.0 + 1.0, 3.0, 4); float streak = fbmT(vec2(uv.x*40.0, uv.y*2.0), 40.0, 3)*smoothstep(0.5, 1.0, uv.y);
  col = mix(bc, mc, mortar); col *= 1.0 - dirt*0.45 - streak*0.2; rough = mix(0.8, 0.95, mortar); metal = 0.0; h = (1.0 - mortar)*1.0 + grain*0.2 + bhash*0.15; ao = 1.0 - mortar*0.35;
}
void mPlaster(vec2 uv, out vec3 col, out float rough, out float metal, out float h, out float ao){
  float grain = fbmT(uv*40.0, 40.0, 3); float blotch = fbmT(uv*2.0 + 7.0, 2.0, 4);
  float streak = fbmT(vec2(uv.x*60.0, uv.y*3.0), 60.0, 3); float peel = smoothstep(0.6, 0.75, fbmT(uv*4.0 + 3.0, 4.0, 3));
  vec3 cr = voroT(uv*7.0 + 2.0, 7.0); float crack = (1.0 - smoothstep(0.0, 0.012 + 0.01*fbmT(uv*20.0, 20.0, 2), cr.y - cr.x))*smoothstep(0.58, 0.7, fbmT(uv*2.0 + 4.0, 2.0, 3));
  vec3 base = vec3(0.52, 0.48, 0.40)*(0.85 + 0.3*grain); base = mix(base, base*0.6, blotch*0.7); base = mix(base, base*vec3(0.6, 0.62, 0.65), streak*0.5*(1.0 - uv.y*0.5));
  base = mix(base, vec3(0.3, 0.28, 0.25), peel); base = mix(base, base*0.4, crack);
  col = base; rough = 0.9; metal = 0.0; h = grain*0.3 - peel*1.2 - crack*1.5; ao = 1.0 - crack*0.5 - peel*0.2;
}
// facade layout on top of a wall function: window at u [0.3,0.7], v [0.22,0.72]
void facade(vec2 uv, inout vec3 col, inout float rough, inout float metal, inout float h, inout float ao){
  float win = 1.0 - smoothstep(0.0, 0.006, box(uv, vec2(0.5, 0.47), vec2(0.2, 0.25)));
  float frame = (1.0 - smoothstep(0.0, 0.006, box(uv, vec2(0.5, 0.47), vec2(0.23, 0.28)))) - win;
  float sill = (1.0 - smoothstep(0.0, 0.006, box(uv, vec2(0.5, 0.185), vec2(0.26, 0.018))));
  float mull = win*(1.0 - smoothstep(0.006, 0.012, abs(uv.x - 0.5)) + 1.0 - smoothstep(0.006, 0.012, abs(uv.y - 0.47)));
  float glassDirt = fbmT(uv*8.0 + 5.0, 8.0, 3);
  vec3 glass = vec3(0.02, 0.025, 0.03) + vec3(0.06, 0.05, 0.04)*glassDirt;
  col = mix(col, glass, win); rough = mix(rough, 0.06 + glassDirt*0.25, win); metal = mix(metal, 0.0, win); h = mix(h, -3.0, win);
  col = mix(col, vec3(0.16, 0.15, 0.14), frame + mull); rough = mix(rough, 0.55, frame + mull); metal = mix(metal, 0.3, frame + mull); h = mix(h, -0.8, frame); h = mix(h, -2.0, mull);
  col = mix(col, vec3(0.4, 0.38, 0.35), sill); h = mix(h, 1.2, sill); rough = mix(rough, 0.8, sill);
  ao *= 1.0 - 0.5*(1.0 - smoothstep(0.0, 0.05, box(uv, vec2(0.5, 0.47), vec2(0.23, 0.28)))) + 0.5*(1.0 - smoothstep(0.0, 0.006, box(uv, vec2(0.5, 0.47), vec2(0.23, 0.28))));
}
void mMetalPaint(vec2 uv, out vec3 col, out float rough, out float metal, out float h, out float ao){
  float grain = fbmT(uv*30.0, 30.0, 3); float scratch = smoothstep(0.02, 0.0, voroT(uv*vec2(60.0, 6.0), 6.0).x*0.2)*step(0.6, fbmT(uv*3.0 + 2.0, 3.0, 2));
  float rust = smoothstep(0.58, 0.72, fbmT(uv*5.0 + 9.0, 5.0, 4)); float chip = smoothstep(0.7, 0.8, fbmT(uv*12.0 + 4.0, 12.0, 3));
  vec3 base = vec3(0.85)*(0.92 + 0.08*grain); base = mix(base, vec3(0.32, 0.14, 0.06)*(0.7 + 0.6*grain), rust); base = mix(base, vec3(0.5), chip*(1.0 - rust)); base = mix(base, vec3(0.9), scratch*0.5);
  col = base; rough = mix(0.32 + grain*0.15, 0.9, rust); rough = mix(rough, 0.5, chip); metal = mix(0.85, 0.05, rust); h = grain*0.1 - rust*0.5 - chip*0.3 + scratch*0.2; ao = 1.0 - rust*0.2;
}
void mRust(vec2 uv, out vec3 col, out float rough, out float metal, out float h, out float ao){
  float corr = sin(uv.x*PI*2.0*12.0); float grain = fbmT(uv*24.0, 24.0, 3); float rust = smoothstep(0.35, 0.7, fbmT(uv*4.0 + 3.0, 4.0, 4)); float rust2 = fbmT(uv*16.0 + 8.0, 16.0, 3);
  vec3 base = mix(vec3(0.45, 0.45, 0.43), vec3(0.35, 0.16, 0.07)*(0.6 + 0.8*rust2), rust)*(0.8 + 0.4*grain);
  col = base; rough = mix(0.55, 0.95, rust); metal = mix(0.7, 0.1, rust); h = corr*1.5 - rust*0.6 + grain*0.15; ao = 1.0 - rust*0.15;
}
void mWood(vec2 uv, out vec3 col, out float rough, out float metal, out float h, out float ao){
  float nplank = 6.0; float pi_ = floor(uv.x*nplank); float pf = fract(uv.x*nplank); float ph = hash12(vec2(pi_, 3.0) + uSeed);
  float grain = fbmT(vec2(uv.x*nplank*2.0 + ph*7.0, uv.y*3.0 + ph)*vec2(1.0, 8.0), 24.0, 4); float rings = sin((uv.y*10.0 + grain*3.0 + ph*10.0)*6.0)*0.5 + 0.5;
  float gap = 1.0 - smoothstep(0.0, 0.05, min(pf, 1.0 - pf)); float knots = smoothstep(0.75, 0.85, fbmT(uv*6.0 + ph, 6.0, 3));
  vec3 base = mix(vec3(0.42, 0.28, 0.16), vec3(0.28, 0.18, 0.10), rings*0.6 + knots)*(0.7 + 0.6*ph)*(0.8 + 0.4*grain); base = mix(base, base*0.5, smoothstep(0.55, 0.7, fbmT(uv*2.0 + 5.0, 2.0, 3)));
  col = mix(base, base*0.25, gap); rough = 0.75 + rings*0.1; metal = 0.0; h = -gap*2.0 + rings*0.15 + grain*0.2; ao = 1.0 - gap*0.6;
}
void mFabric(vec2 uv, out vec3 col, out float rough, out float metal, out float h, out float ao){
  float weave = (sin(uv.x*PI*2.0*120.0)*0.5 + 0.5)*(sin(uv.y*PI*2.0*120.0)*0.5 + 0.5); float grain = fbmT(uv*6.0, 6.0, 4); float dirt = fbmT(uv*2.0 + 8.0, 2.0, 3);
  col = vec3(0.16, 0.15, 0.10)*(0.75 + 0.3*grain)*(0.85 + 0.15*weave)*(1.0 - dirt*0.4); rough = 0.95; metal = 0.0; h = weave*0.3 + grain*0.5; ao = 0.9 + 0.1*weave;
}
void mTiles(vec2 uv, out vec3 col, out float rough, out float metal, out float h, out float ao){
  vec2 p = uv*4.0; vec2 f = fract(p); vec2 i = floor(p); float joint = 1.0 - smoothstep(0.0, 0.04, min(min(f.x, 1.0-f.x), min(f.y, 1.0-f.y)));
  float grain = fbmT(uv*30.0, 30.0, 3); float th = hash12(mod(i, 4.0)); float crack = smoothstep(0.6, 0.75, fbmT(uv*8.0 + th, 8.0, 3))*step(0.7, th);
  col = mix(vec3(0.35, 0.36, 0.34)*(0.85 + 0.3*th)*(0.8 + 0.3*grain), vec3(0.2), joint); col = mix(col, col*0.5, crack); rough = mix(0.5 + grain*0.2, 0.9, joint); metal = 0.0; h = -joint*1.5 - crack*0.8 + grain*0.1; ao = 1.0 - joint*0.5;
}
// ---- character atlases (4x4 regions) ----
vec3 skinBase(vec2 p, float zombie){
  float pores = fbmT(p*60.0, 60.0, 3); float blotch = fbmT(p*5.0 + 3.0, 5.0, 4);
  vec3 s = mix(vec3(0.40, 0.26, 0.19), vec3(0.50, 0.36, 0.27), blotch)*(0.9 + 0.2*pores);
  vec3 z = mix(vec3(0.17, 0.19, 0.14), vec3(0.30, 0.29, 0.22), blotch)*(0.8 + 0.4*pores);
  return mix(s, z, zombie);
}
void charRegion(vec2 uv, float soldier, out vec3 col, out float rough, out float metal, out float h, out float ao){
  vec2 cell = floor(uv*4.0); vec2 p = fract(uv*4.0); int region = int(cell.x + (3.0 - cell.y)*4.0); // 0..15 from top-left
  float zombie = 1.0 - soldier;
  vec3 skin = skinBase(p + cell*0.37, zombie);
  // zombie damage layers (world of the atlas)
  float veins = smoothstep(0.025, 0.0, abs(fbmT(p*7.0 + cell, 7.0, 3) - 0.5))*zombie*smoothstep(0.4, 0.6, fbmT(p*2.0 + cell*3.0, 2.0, 2));
  float bruise = smoothstep(0.55, 0.8, fbmT(p*3.0 + cell*2.0 + 5.0, 3.0, 3))*zombie;
  float grime = smoothstep(0.45, 0.75, fbmT(p*4.0 + cell*5.0 + 2.0, 4.0, 4))*zombie;
  float wn = fbmT(p*14.0 + cell, 14.0, 3);
  vec3 vr = voroT(p*5.0 + cell*3.0 + 1.0, 1000.0); float wound = smoothstep(0.22, 0.08, vr.x + (wn - 0.5)*0.25)*step(0.82, vr.z)*zombie; float woundRim = smoothstep(0.36, 0.2, vr.x + (wn - 0.5)*0.25)*step(0.82, vr.z)*zombie;
  vec3 vb = voroT(p*2.5 + cell*1.3 + 9.0, 1000.0); float blood = smoothstep(0.5, 0.15, vb.x + (fbmT(p*9.0 + cell*2.0, 9.0, 3) - 0.5)*0.6)*step(0.65, vb.z)*zombie;
  float drip = smoothstep(0.015, 0.0, abs(fract(p.x*7.0 + hash12(cell)) - 0.5) - 0.0)*step(0.6, fbmT(vec2(p.x*7.0, p.y*0.7) + cell, 7.0, 2))*zombie*0.6;
  skin = mix(skin, vec3(0.10, 0.13, 0.17), veins*0.55); skin = mix(skin, vec3(0.12, 0.07, 0.12), bruise*0.6); skin = mix(skin, vec3(0.06, 0.05, 0.03), grime*0.5);
  skin = mix(skin, vec3(0.14, 0.008, 0.004), max(blood, drip)*0.9); skin = mix(skin, vec3(0.22, 0.02, 0.01), woundRim*0.8); skin = mix(skin, vec3(0.05, 0.004, 0.0), wound);
  float skinR = 0.58 - blood*0.35 - wound*0.35 - grime*0.1; float skinH = -wound*2.5 + woundRim*0.6 + veins*0.35 - blood*0.2;
  // clothing
  float camo1 = fbmT(p*4.0 + cell*3.0, 4.0, 3), camo2 = fbmT(p*9.0 + cell*5.0 + 2.0, 9.0, 2);
  vec3 camo = mix(mix(vec3(0.13, 0.16, 0.09), vec3(0.30, 0.26, 0.15), step(0.5, camo1)), vec3(0.09, 0.08, 0.05), step(0.62, camo2));
  float weave = (sin(p.x*PI*2.0*160.0)*0.5 + 0.5)*(sin(p.y*PI*2.0*160.0)*0.5 + 0.5); camo *= 0.85 + 0.15*weave;
  float dirt = fbmT(p*2.0 + cell*7.0 + 3.0, 2.0, 3);
  vec3 shirt = mix(vec3(0.22, 0.24, 0.30), vec3(0.34, 0.2, 0.16), step(0.5, hash12(vec2(uSeed, 2.0))))*(0.85 + 0.15*weave)*(1.0 - dirt*0.5);
  float tear = smoothstep(0.35, 0.2, voroT(p*4.0 + cell*2.0 + 4.0, 1000.0).x)*step(0.55, fbmT(p*3.0 + cell + 1.0, 3.0, 2))*zombie;
  vec3 pants = vec3(0.16, 0.17, 0.22)*(0.85 + 0.15*weave)*(1.0 - dirt*0.5);
  vec3 vest = vec3(0.09, 0.09, 0.08)*(0.85 + 0.2*weave); vec3 boot = vec3(0.06, 0.05, 0.045); vec3 glove = vec3(0.07, 0.07, 0.065);
  col = skin; rough = skinR; metal = 0.0; h = skinH; ao = 1.0;
  if(region == 0){ // head: face front at u=0.5, v from neck(0) to top(1)
    float hairMask = smoothstep(0.62, 0.7, p.y + (fbmT(p*10.0, 10.0, 2) - 0.5)*0.15)*step(0.08, abs(p.x - 0.5) + smoothstep(0.75, 0.85, p.y)) ; hairMask = max(hairMask, smoothstep(0.32, 0.4, abs(p.x - 0.5))*step(0.5, p.y));
    hairMask *= step(0.3, fbmT(p*12.0, 12.0, 2) + zombie*0.0 + 0.4); float hairThin = mix(1.0, 0.6, zombie);
    vec3 hair = vec3(0.08, 0.06, 0.05)*(0.7 + 0.6*fbmT(vec2(p.x*80.0, p.y*8.0), 80.0, 2));
    // eyes
    float eyeL = ell(p, vec2(0.44, 0.56), vec2(0.035, 0.022)), eyeR = ell(p, vec2(0.56, 0.56), vec2(0.035, 0.022));
    float socket = smoothstep(2.6, 1.0, min(ell(p, vec2(0.44, 0.56), vec2(0.06, 0.05)), ell(p, vec2(0.56, 0.56), vec2(0.06, 0.05))));
    float eye = step(min(eyeL, eyeR), 1.0); float iris = step(min(ell(p, vec2(0.44, 0.56), vec2(0.014, 0.014)), ell(p, vec2(0.56, 0.56), vec2(0.014, 0.014))), 1.0); float pupil = step(min(ell(p, vec2(0.44, 0.56), vec2(0.006, 0.006)), ell(p, vec2(0.56, 0.56), vec2(0.006, 0.006))), 1.0);
    float mouth = step(ell(p, vec2(0.5, 0.36), vec2(0.06, 0.012 + zombie*0.012)), 1.0); float nose = smoothstep(1.2, 0.4, ell(p, vec2(0.5, 0.47), vec2(0.02, 0.04)));
    float brow = smoothstep(1.4, 0.8, min(ell(p, vec2(0.44, 0.61), vec2(0.05, 0.012)), ell(p, vec2(0.56, 0.61), vec2(0.05, 0.012))));
    col = mix(col, col*mix(1.0, 0.35, zombie), socket*(0.4 + 0.6*zombie));
    vec3 sclera = mix(vec3(0.75, 0.74, 0.7), vec3(0.6, 0.62, 0.5), zombie); vec3 irisC = mix(vec3(0.15, 0.25, 0.32), vec3(0.75, 0.78, 0.7), zombie);
    col = mix(col, sclera, eye); col = mix(col, irisC, iris); col = mix(col, vec3(0.02), pupil*(1.0 - zombie*0.7));
    col = mix(col, vec3(0.08, 0.02, 0.02), mouth); col = mix(col, col*0.6, brow*0.7);
    col = mix(col, vec3(0.3, 0.02, 0.01), mouth*0.0 + smoothstep(0.03, 0.0, abs(p.x - 0.5) - 0.05)*step(p.y, 0.36)*step(0.25, p.y)*zombie*step(0.4, fbmT(p*20.0, 20.0, 2)));
    col = mix(col, hair, hairMask*hairThin); h += nose*0.8 - mouth*1.0 - eye*0.6 + hairMask*0.3; rough = mix(rough, 0.2, eye); rough = mix(rough, 0.7, hairMask);
    if(soldier > 0.5){ float helmet = step(0.72, p.y + (abs(p.x - 0.5) > 0.36 ? 0.2 : 0.0)); col = mix(col, vec3(0.2, 0.22, 0.16)*(0.8 + 0.4*fbmT(p*20.0, 20.0, 3)), helmet); rough = mix(rough, 0.85, helmet); h = mix(h, 1.0, helmet); }
  } else if(region == 1 || region == 2){ // torso upper / lower
    vec3 c = mix(shirt, camo, soldier); float ao_ = 1.0;
    if(soldier > 0.5){ float vestM = step(0.12, p.y)*step(p.y, 0.95)*step(0.12, abs(p.x - 0.5) - 0.0)*0.0 + step(abs(p.x - 0.5), 0.36)*step(0.05, p.y)*(region == 1 ? 1.0 : step(p.y, 0.7));
      float pouch = step(0.25, abs(p.x - 0.5))*step(abs(p.x - 0.5), 0.34)*step(0.3, p.y)*step(p.y, 0.6)*float(region == 2); float strap = step(abs(abs(p.x - 0.5) - 0.2), 0.03)*float(region == 1);
      c = mix(c, vest, vestM); c = mix(c, vest*1.3, pouch); c = mix(c, vest*0.7, strap); h += vestM*1.0 + pouch*1.5 + strap*0.5; rough = mix(0.85, 0.9, vestM); }
    else { c = mix(c, skin, tear); rough = mix(0.9, skinR, tear); h += -tear*1.0 + weave*0.1; }
    col = c; ao = ao_;
  } else if(region == 3 || region == 7 || region == 8){ // pelvis, thigh, shin
    col = mix(pants, camo, soldier); rough = 0.88; h = weave*0.1 + (fbmT(p*3.0 + cell, 3.0, 3) - 0.5)*0.3;
    if(region == 3){ float belt = step(0.82, p.y)*step(p.y, 0.92); col = mix(col, vec3(0.08, 0.06, 0.05), belt); h += belt*0.6; rough = mix(rough, 0.5, belt); }
    if(region == 8 && soldier > 0.5){ float bt = step(p.y, 0.35); col = mix(col, boot, bt); rough = mix(rough, 0.45, bt); h += bt*0.6; }
    col = mix(col, skin, tear*0.6*float(region != 3));
  } else if(region == 4){ // upper arm
    col = mix(mix(skin, shirt, step(p.y, 0.45)*zombie), camo, soldier); rough = mix(skinR, 0.9, step(p.y, 0.45)*zombie + soldier); h += step(p.y, 0.45)*0.4*zombie;
  } else if(region == 5){ // forearm
    col = mix(skin, camo, soldier); rough = mix(skinR, 0.9, soldier); h += soldier*weave*0.2;
    if(soldier > 0.5){ float cuff = step(0.85, p.y); col = mix(col, glove, cuff); }
  } else if(region == 6){ // hand
    col = mix(skin, glove, soldier); rough = mix(skinR, 0.6, soldier); float finger = step(0.55, p.y)*(sin(p.x*PI*2.0*4.0)*0.5 + 0.5); h += -finger*0.6*step(0.55, p.y); col *= 1.0 - finger*0.25*step(0.55, p.y);
  } else if(region == 9){ // foot
    col = mix(vec3(0.1, 0.08, 0.07)*(0.8 + 0.4*fbmT(p*10.0, 10.0, 3)), boot, soldier); rough = 0.5; h = -step(p.y, 0.15)*1.0; float lace = step(0.5, p.y)*step(abs(p.x - 0.5), 0.1)*(sin(p.y*PI*2.0*12.0)*0.5 + 0.5); col = mix(col, col*1.4, lace*0.5*soldier); h += lace*0.3;
  } else if(region == 10){ // neck & shoulder caps
    col = mix(skin, camo, soldier*step(0.4, p.y)); rough = skinR;
  } else if(region == 11){ // helmet
    col = vec3(0.2, 0.22, 0.16)*(0.8 + 0.4*fbmT(p*20.0, 20.0, 3)); rough = 0.85; h = fbmT(p*30.0, 30.0, 2)*0.3;
  } else { // gear (rifle body etc.)
    col = vec3(0.12)*(0.9 + 0.2*fbmT(p*30.0, 30.0, 3)); rough = 0.5; metal = 0.6; h = 0.0;
  }
}
// ---- decals: 0 splat, 1 pool, 2 bullet hole, 3 scorch ----
void mDecals(vec2 uv, out vec4 c, out float rough, out float h){
  vec2 cell = floor(uv*2.0); vec2 p = fract(uv*2.0) - 0.5; int id = int(cell.x + (1.0 - cell.y)*2.0);
  float r = length(p); float ang = atan(p.y, p.x);
  if(id == 0){ float n = fbm(p*6.0 + 3.0, 4); float blob = smoothstep(0.42, 0.25, r + (n - 0.5)*0.5); float drops = 0.0;
    for(int i=0;i<10;i++){ vec2 dp = (hash22(vec2(float(i), 7.0)) - 0.5)*0.9; float dr = 0.02 + 0.05*hash12(vec2(float(i), 3.0)); drops = max(drops, smoothstep(dr, dr*0.6, length(p - dp))); }
    float a = clamp(blob + drops, 0.0, 1.0); c = vec4(mix(vec3(0.25, 0.01, 0.005), vec3(0.12, 0.005, 0.0), fbm(p*10.0, 3)), a); rough = 0.15; h = 0.0; }
  else if(id == 1){ float n = fbm(p*3.0 + 9.0, 4); float a = smoothstep(0.46, 0.3, r + (n - 0.5)*0.35); c = vec4(vec3(0.16, 0.005, 0.0)*(0.7 + 0.6*fbm(p*8.0, 3)), a); rough = 0.08; h = 0.0; }
  else if(id == 2){ float hole = smoothstep(0.08, 0.05, r); float ring = smoothstep(0.16, 0.06, r)*(0.6 + 0.4*fbm(vec2(ang*3.0, r*20.0), 3)); float a = clamp(hole + ring*0.7, 0.0, 1.0);
    c = vec4(mix(vec3(0.05), vec3(0.01), hole), a); rough = 0.8; h = -hole*3.0; }
  else { float n = fbm(p*4.0 + 1.0, 4); float a = smoothstep(0.48, 0.15, r + (n - 0.5)*0.4)*(0.6 + 0.4*n); c = vec4(vec3(0.02, 0.015, 0.01), a); rough = 0.9; h = 0.0; }
}
// ---- sprites: 0 soft, 1 smoke, 2 blood drop, 3 spark ----
float mSprites(vec2 uv){
  vec2 cell = floor(uv*2.0); vec2 p = fract(uv*2.0) - 0.5; int id = int(cell.x + (1.0 - cell.y)*2.0); float r = length(p)*2.0;
  if(id == 0) return pow(sat(1.0 - r), 2.2);
  if(id == 1){ float n = fbm(p*6.0 + 2.0, 4); return sat(1.0 - r*1.15 + (n - 0.5)*0.9)*(0.55 + 0.45*fbm(p*12.0, 3))*smoothstep(1.0, 0.6, r); }
  if(id == 2){ float n = fbm(p*8.0 + 5.0, 3); return smoothstep(0.9, 0.5, r + (n - 0.5)*0.7); }
  return pow(sat(1.0 - abs(p.x*2.0)), 4.0)*pow(sat(1.0 - abs(p.y*8.0)), 1.5);
}
vec3 mLensDirt(vec2 uv){
  vec2 p = (uv - 0.5)*vec2(1.78, 1.0);
  float smudge = smoothstep(0.55, 0.85, fbm(uv*3.0 + 1.0, 4))*0.6 + smoothstep(0.7, 0.9, fbm(uv*9.0 + 4.0, 3))*0.4;
  float specks = 0.0; for(int i=0;i<40;i++){ vec2 sp = hash22(vec2(float(i), 11.0)); float sr = 0.002 + 0.006*hash12(vec2(float(i), 5.0)); specks = max(specks, smoothstep(sr, sr*0.4, length(uv - sp))*0.8); }
  float arc = smoothstep(0.02, 0.0, abs(length(p - vec2(0.4, -0.2)) - 0.35))*smoothstep(0.5, 0.9, fbm(uv*20.0, 2))*0.5;
  float blood = 0.0; for(int i=0;i<18;i++){ vec2 bp = hash22(vec2(float(i), 23.0)); vec2 d = uv - bp; d.y *= 0.7; float br = 0.008 + 0.03*hash12(vec2(float(i), 9.0)); float n = fbm(uv*40.0 + float(i), 3); blood = max(blood, smoothstep(br, br*0.45, length(d) + (n - 0.5)*br*1.2)*(0.5 + 0.5*hash12(vec2(float(i), 4.0)))); }
  float drips = 0.0; for(int i=0;i<5;i++){ float x = hash12(vec2(float(i), 31.0)); float y0 = hash12(vec2(float(i), 32.0)); float len = 0.06 + 0.2*hash12(vec2(float(i), 33.0)); drips = max(drips, smoothstep(0.004, 0.0012, abs(uv.x - x) - 0.0015*fbm(uv*50.0, 2))*step(y0 - len, uv.y)*step(uv.y, y0)*0.7); }
  return vec3(sat(smudge*0.5 + specks + arc), sat(blood + drips*0.8), 0.0);
}
float mChain(vec2 uv){
  vec2 p = uv*12.0; float a = abs(fract(p.x + p.y) - 0.5), b = abs(fract(p.x - p.y) - 0.5);
  return 1.0 - smoothstep(0.03, 0.06, min(a, b)*0.5);
}
void surface(vec2 uv, out vec3 col, out float rough, out float metal, out float h, out float ao){
  col = vec3(0.5); rough = 0.8; metal = 0.0; h = 0.0; ao = 1.0;
#if MAT == 0
  mAsphalt(uv, 6.0, col, rough, metal, h, ao);
#elif MAT == 1
  mRoad(uv, col, rough, metal, h, ao);
#elif MAT == 2
  mConcrete(uv, col, rough, metal, h, ao);
#elif MAT == 3
  mBrick(uv, col, rough, metal, h, ao); facade(uv, col, rough, metal, h, ao);
#elif MAT == 4
  mPlaster(uv, col, rough, metal, h, ao); facade(uv, col, rough, metal, h, ao);
#elif MAT == 5
  mMetalPaint(uv, col, rough, metal, h, ao);
#elif MAT == 6
  mRust(uv, col, rough, metal, h, ao);
#elif MAT == 7
  mWood(uv, col, rough, metal, h, ao);
#elif MAT == 8
  mFabric(uv, col, rough, metal, h, ao);
#elif MAT == 9
  charRegion(uv, 0.0, col, rough, metal, h, ao);
#elif MAT == 10
  charRegion(uv, 1.0, col, rough, metal, h, ao);
#elif MAT == 16
  mAsphalt(uv, 4.0, col, rough, metal, h, ao); col *= 0.8; float grav = smoothstep(0.4, 0.2, voroT(uv*60.0, 60.0).x); col += grav*0.05; h += grav*0.5;
#elif MAT == 17
  mTiles(uv, col, rough, metal, h, ao);
#elif MAT == 18
  mBrick(uv, col, rough, metal, h, ao);
#elif MAT == 19
  mPlaster(uv, col, rough, metal, h, ao);
#endif
}
void main(){
  vec2 uv = vUV;
#if MAT == 11
  vec4 c; float rough, h; mDecals(uv, c, rough, h); o0 = c; o1 = vec4(0.5, 0.5, rough, 0.0); return;
#elif MAT == 12
  float a = mSprites(uv); o0 = vec4(1.0, 1.0, 1.0, a); o1 = vec4(0.5, 0.5, 1.0, 0.0); return;
#elif MAT == 13
  o0 = vec4(mLensDirt(uv), 1.0); o1 = vec4(0.5, 0.5, 1.0, 0.0); return;
#elif MAT == 14
  float a = mChain(uv); o0 = vec4(vec3(0.5, 0.5, 0.52), a); o1 = vec4(0.5, 0.5, 0.45, 0.85); return;
#elif MAT == 15
  o0 = vec4(1.0); o1 = vec4(0.5, 0.5, 0.6, 0.0); return;
#else
  vec3 col; float rough, metal, h, ao; surface(uv, col, rough, metal, h, ao);
  float e = 1.0/float(TEXSIZE); vec3 c2; float r2, m2, hx, hy, a2;
  surface(uv + vec2(e, 0.0), c2, r2, m2, hx, a2); surface(uv + vec2(0.0, e), c2, r2, m2, hy, a2);
  float K = 2.2*float(TEXSIZE)/1024.0; // slope scale so bump strength is resolution independent
  vec3 n = normalize(vec3(-(hx - h)*K, -(hy - h)*K, 1.0));
  o0 = vec4(clamp(col, 0.0, 1.0), sat(ao)); o1 = vec4(n.xy*0.5 + 0.5, sat(rough), sat(metal));
#endif
}`;
