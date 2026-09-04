/* ---------- post-processing shaders ---------- */
const FS_SSAO = GLSL_NOISE + `
precision highp float; in vec2 vUV; out vec4 o;
uniform sampler2D uND; uniform vec2 uTanHalf; uniform vec3 uSamples[16]; uniform float uRadius, uStrength;
void main(){
  vec4 nd = texture(uND, vUV); float d = nd.a; if(d > 300.0){ o = vec4(1.0); return; }
  vec3 P = vec3((vUV*2.0-1.0)*uTanHalf*d, -d); vec3 N = normalize(nd.xyz);
  float ang = hash12(gl_FragCoord.xy)*6.2831; vec3 rv = vec3(cos(ang), sin(ang), 0.37);
  vec3 T = normalize(rv - N*dot(rv, N)); vec3 B = cross(N, T); mat3 TBN = mat3(T, B, N);
  float occ = 0.0; float rad = uRadius*(0.5 + 0.5*clamp(4.0/d, 0.2, 1.0));
  for(int i=0;i<16;i++){
    vec3 s = P + TBN*uSamples[i]*rad;
    vec2 suv = (s.xy/(-s.z))/uTanHalf*0.5+0.5;
    if(suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
    float sd = texture(uND, suv).a;
    float rangeCheck = smoothstep(0.0, 1.0, rad/abs(d - sd));
    occ += (sd < -s.z - 0.03 ? 1.0 : 0.0)*rangeCheck;
  }
  o = vec4(vec3(1.0 - occ/16.0*uStrength), 1.0);
}`;
const FS_BLUR4 = `precision mediump float; in vec2 vUV; out vec4 o; uniform sampler2D uTex; uniform vec2 uTexel;
void main(){ vec4 s = vec4(0.0); for(int y=-2;y<2;y++) for(int x=-2;x<2;x++) s += texture(uTex, vUV + (vec2(float(x),float(y))+0.5)*uTexel); o = s/16.0; }`;
const FS_BLOOM_PRE = `precision mediump float; in vec2 vUV; out vec4 o; uniform sampler2D uTex; uniform vec2 uTexel; uniform float uThreshold, uKnee;
void main(){
  vec3 c = (texture(uTex, vUV + vec2(-0.5,-0.5)*uTexel).rgb + texture(uTex, vUV + vec2(0.5,-0.5)*uTexel).rgb + texture(uTex, vUV + vec2(-0.5,0.5)*uTexel).rgb + texture(uTex, vUV + vec2(0.5,0.5)*uTexel).rgb)*0.25;
  c = min(c, vec3(60.0));
  float br = max(c.r, max(c.g, c.b)); float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0*uKnee); soft = soft*soft/(4.0*uKnee + 1e-4);
  float contrib = max(soft, br - uThreshold)/max(br, 1e-4); o = vec4(c*contrib, 1.0); }`;
const FS_DOWN = `precision mediump float; in vec2 vUV; out vec4 o; uniform sampler2D uTex; uniform vec2 uTexel;
void main(){ vec3 c = (texture(uTex, vUV + vec2(-1.0,-1.0)*uTexel).rgb + texture(uTex, vUV + vec2(1.0,-1.0)*uTexel).rgb + texture(uTex, vUV + vec2(-1.0,1.0)*uTexel).rgb + texture(uTex, vUV + vec2(1.0,1.0)*uTexel).rgb)*0.125 + texture(uTex, vUV).rgb*0.5; o = vec4(c, 1.0); }`;
const FS_UP = `precision mediump float; in vec2 vUV; out vec4 o; uniform sampler2D uTex, uPrev; uniform vec2 uTexel; uniform float uMix;
void main(){ vec3 c = vec3(0.0); vec2 t = uTexel*1.5;
  c += texture(uTex, vUV + vec2(-t.x, -t.y)).rgb; c += texture(uTex, vUV + vec2(0.0, -t.y)).rgb*2.0; c += texture(uTex, vUV + vec2(t.x, -t.y)).rgb;
  c += texture(uTex, vUV + vec2(-t.x, 0.0)).rgb*2.0; c += texture(uTex, vUV).rgb*4.0; c += texture(uTex, vUV + vec2(t.x, 0.0)).rgb*2.0;
  c += texture(uTex, vUV + vec2(-t.x, t.y)).rgb; c += texture(uTex, vUV + vec2(0.0, t.y)).rgb*2.0; c += texture(uTex, vUV + vec2(t.x, t.y)).rgb;
  o = vec4(c/16.0 + texture(uPrev, vUV).rgb*uMix, 1.0); }`;
const FS_VOL = GLSL_NOISE + GLSL_PBR + `
precision highp float; in vec2 vUV; out vec4 o;
uniform sampler2D uND; uniform sampler2DShadow uFlashShadow; uniform mat4 uFlashVP, uInvVP; uniform vec3 uCamPos, uCamFwd;
uniform vec4 uFlashPos, uFlashDir, uFlashParams; uniform vec3 uFlashColor; uniform float uTime, uDensity;
void main(){
  float sd = texture(uND, vUV).a;
  vec4 fp = uInvVP*vec4(vUV*2.0-1.0, 1.0, 1.0); vec3 dir = normalize(fp.xyz/fp.w - uCamPos);
  float maxT = min(sd/max(dot(dir, uCamFwd), 0.05), 28.0);
  const int N = 18; float jit = hash12(gl_FragCoord.xy + fract(uTime*7.0)*13.0); float dt = maxT/float(N); vec3 acc = vec3(0.0);
  for(int i=0;i<N;i++){
    float t = (float(i) + jit)*dt; vec3 p = uCamPos + dir*t;
    vec3 L = p - uFlashPos.xyz; float d = length(L); L /= d; float cosA = dot(L, uFlashDir.xyz);
    if(cosA < uFlashDir.w - 0.03) continue;
    float att = spotAtt(d, uFlashParams.z, cosA, uFlashDir.w - 0.03, uFlashParams.x);
    vec4 sc = uFlashVP*vec4(p, 1.0); float vis = 1.0;
    if(sc.w > 0.0){ vec3 sp = sc.xyz/sc.w*0.5+0.5; if(sp.x > 0.0 && sp.x < 1.0 && sp.y > 0.0 && sp.y < 1.0 && sp.z < 1.0) vis = texture(uFlashShadow, vec3(sp.xy, sp.z - 0.0001)); }
    acc += att*vis*dt*(0.6 + 0.4*noise(p.xz*2.0 + uTime*0.5));
  }
  o = vec4(acc*uFlashColor*uFlashParams.y*uDensity, 1.0);
}`;
const FS_LUM = `precision highp float; in vec2 vUV; out vec4 o; uniform sampler2D uTex, uPrev; uniform float uDt, uKey, uMin, uMax;
void main(){ float s = 0.0; for(int y=0;y<8;y++) for(int x=0;x<8;x++){ vec3 c = texture(uTex, (vec2(float(x),float(y))+0.5)/8.0).rgb; s += log(dot(c, vec3(0.3,0.59,0.11)) + 0.004); }
  float avg = exp(s/64.0); float target = clamp(uKey/avg, uMin, uMax); float prev = texture(uPrev, vec2(0.5)).r; if(prev <= 0.0) prev = target;
  float k = target > prev ? 0.9 : 2.2; o = vec4(mix(prev, target, 1.0 - exp(-uDt*k)), avg, 0.0, 1.0); }`;
const FS_RESOLVE = GLSL_NOISE + `
precision highp float; in vec2 vUV; out vec4 o;
uniform sampler2D uScene, uBloom, uAO, uVol, uND, uLum; uniform mat4 uPrevVP, uInvVP; uniform vec3 uCamPos, uCamFwd;
uniform vec4 uParams; // bloomStr, mblur, aoOn, volOn
uniform float uExposure, uFlashGlow; uniform vec4 uGrade; // saturation, contrast, lift, warmth
vec3 aces(vec3 x){ const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0); }
void main(){
  vec4 nd = texture(uND, vUV); float d = nd.a;
  vec3 col;
  if(uParams.y > 0.0){
    vec4 fp = uInvVP*vec4(vUV*2.0-1.0, 1.0, 1.0); vec3 dir = normalize(fp.xyz/fp.w - uCamPos);
    vec3 P = uCamPos + dir*(min(d, 400.0)/max(dot(dir, uCamFwd), 0.05));
    vec4 pc = uPrevVP*vec4(P, 1.0); vec2 puv = pc.xy/pc.w*0.5+0.5;
    vec2 vel = (vUV - puv)*uParams.y; float vl = length(vel); if(vl > 0.035) vel *= 0.035/vl;
    float j = hash12(gl_FragCoord.xy)*0.5;
    col = vec3(0.0); for(int i=0;i<8;i++){ col += texture(uScene, vUV + vel*((float(i)+j)/8.0 - 0.5)).rgb; } col /= 8.0;
  } else col = texture(uScene, vUV).rgb;
  float ao = mix(1.0, texture(uAO, vUV).r, uParams.z); col *= ao;
  col += texture(uVol, vUV).rgb*uParams.w;
  col += texture(uBloom, vUV).rgb*uParams.x;
  // faux flashlight haze glow (cheap in-scatter)
  float rc = length((vUV - 0.5)*vec2(1.6, 1.0)); col += vec3(0.95, 0.9, 0.8)*uFlashGlow*smoothstep(0.55, 0.0, rc)*0.06;
  float ev = uExposure*texture(uLum, vec2(0.5)).r; col *= ev;
  col = aces(col);
  // grade: bodycam look — lifted blacks, slightly crushed, cool shadows / warm highlights, desaturated
  float l = dot(col, vec3(0.3, 0.59, 0.11));
  col = mix(vec3(l), col, uGrade.x);
  col = (col - 0.5)*uGrade.y + 0.5 + uGrade.z;
  col += (vec3(-0.02, 0.0, 0.035)*(1.0-l) + vec3(0.03, 0.01, -0.02)*l)*uGrade.w;
  col = clamp(col, 0.0, 1.0);
  o = vec4(pow(col, vec3(1.0/2.2)), 1.0);
}`;
const FS_FXAA = `precision mediump float; in vec2 vUV; out vec4 o; uniform sampler2D uTex; uniform vec2 uTexel;
void main(){
  vec3 rgbNW = texture(uTex, vUV + vec2(-1.0,-1.0)*uTexel).rgb, rgbNE = texture(uTex, vUV + vec2(1.0,-1.0)*uTexel).rgb, rgbSW = texture(uTex, vUV + vec2(-1.0,1.0)*uTexel).rgb, rgbSE = texture(uTex, vUV + vec2(1.0,1.0)*uTexel).rgb, rgbM = texture(uTex, vUV).rgb;
  const vec3 luma = vec3(0.299, 0.587, 0.114);
  float lNW = dot(rgbNW, luma), lNE = dot(rgbNE, luma), lSW = dot(rgbSW, luma), lSE = dot(rgbSE, luma), lM = dot(rgbM, luma);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float dirReduce = max((lNW + lNE + lSW + lSE)*(0.25/8.0), 1.0/128.0);
  float rcp = 1.0/(min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = min(vec2(8.0), max(vec2(-8.0), dir*rcp))*uTexel;
  vec3 rgbA = 0.5*(texture(uTex, vUV + dir*(1.0/3.0 - 0.5)).rgb + texture(uTex, vUV + dir*(2.0/3.0 - 0.5)).rgb);
  vec3 rgbB = rgbA*0.5 + 0.25*(texture(uTex, vUV + dir*-0.5).rgb + texture(uTex, vUV + dir*0.5).rgb);
  float lB = dot(rgbB, luma);
  o = vec4((lB < lMin || lB > lMax) ? rgbA : rgbB, 1.0); }`;
const FS_LENS = GLSL_NOISE + `
precision highp float; in vec2 vUV; out vec4 o;
uniform sampler2D uTex, uDirt, uLum; uniform vec2 uRes, uTexel; uniform float uTime;
uniform vec4 uLens; // fisheye, CA, grain, vignette
uniform vec4 uFx;   // damage, glitch, static, fade
uniform vec4 uFx2;  // droplets, whiteFlash, sharpen, bloodOnLens
uniform float uDirtAmt;
void main(){
  float aspect = uRes.x/uRes.y; float gain = clamp(texture(uLum, vec2(0.5)).r/3.0, 0.2, 1.4);
  vec2 p = (vUV - 0.5)*vec2(aspect, 1.0); float r2 = dot(p, p);
  float k = uLens.x*0.32; float maxR2 = 0.25*aspect*aspect + 0.25; float zoom = 1.0 + k*maxR2*0.92;
  vec2 pd = p*(1.0 + k*r2)/zoom;
  // rain droplets on the lens
  float rim = 0.0;
  if(uFx2.x > 0.001){
    for(int layer=0; layer<2; layer++){
      float sc = layer == 0 ? 5.0 : 9.0; float fl = float(layer);
      vec2 gp = pd*sc + vec2(0.0, uTime*(0.06 + 0.05*fl)); vec2 id = floor(gp); vec2 f = fract(gp) - 0.5;
      vec2 h = hash22(id + fl*17.3); float ex = step(h.x, uFx2.x*0.55);
      vec2 c = (hash22(id*2.1 + fl) - 0.5)*0.6; float rad = (0.07 + 0.11*h.y)*(1.0 - 0.3*fl);
      vec2 dd = f - c; float l = length(dd); float inside = smoothstep(rad, rad*0.55, l)*ex;
      pd += dd*inside*(-0.9)/sc; rim += (smoothstep(rad, rad*0.85, l) - smoothstep(rad*0.85, rad*0.55, l))*ex*0.5;
    }
  }
  // glitch rows
  if(uFx.y > 0.001){ float row = floor(vUV.y*48.0); float h = hash12(vec2(row, floor(uTime*24.0)));
    if(h < uFx.y*0.6) pd.x += (hash12(vec2(row*3.1, floor(uTime*24.0)*0.7)) - 0.5)*0.12*uFx.y; }
  vec2 uvd = pd/vec2(aspect, 1.0) + 0.5;
  float ca = uLens.y*(0.006*r2 + 0.0006);
  vec2 cad = p*ca/vec2(aspect, 1.0);
  vec3 col; col.r = texture(uTex, uvd + cad).r; col.g = texture(uTex, uvd).g; col.b = texture(uTex, uvd - cad).b;
  // sharpen
  vec3 blur = (texture(uTex, uvd + vec2(uTexel.x, 0.0)).rgb + texture(uTex, uvd - vec2(uTexel.x, 0.0)).rgb + texture(uTex, uvd + vec2(0.0, uTexel.y)).rgb + texture(uTex, uvd - vec2(0.0, uTexel.y)).rgb)*0.25;
  col += (col - blur)*uFx2.z;
  col += rim*0.10;
  // lens dirt & blood on lens
  vec3 dirt = texture(uDirt, vUV).rgb; float bright = dot(col, vec3(0.333));
  col += dirt.r*bright*bright*0.9*uDirtAmt;
  float blood = clamp(dirt.g*uFx2.w*1.3, 0.0, 1.0); col = mix(col, vec3(0.42, 0.02, 0.01)*(0.35 + col*1.2), blood*0.85);
  // sensor noise: luminance grain + chroma noise, more with gain
  float lum = dot(col, vec3(0.3, 0.59, 0.11));
  vec2 gc = vUV*uRes; float tt = fract(uTime)*97.0;
  float g = hash12(gc + tt) - 0.5;
  col += g*uLens.z*(0.045 + 0.09*gain)*(1.0 - lum*0.55);
  vec3 cn = vec3(hash12(gc*0.5 + tt + 1.0), hash12(gc*0.5 + tt + 2.0), hash12(gc*0.5 + tt + 3.0)) - 0.5;
  col += cn*0.035*gain*uLens.z*(1.0 - lum);
  // subtle 8x8 block quantization in dark areas (compression look)
  float blk = hash12(floor(gc/8.0) + floor(uTime*10.0)) - 0.5; col += blk*0.012*uLens.z*(1.0 - lum);
  // vignette
  col *= 1.0 - uLens.w*smoothstep(0.30, 1.35, r2*2.0);
  // damage
  float dv = smoothstep(0.05, 1.2, r2*2.0);
  col = mix(col, vec3(0.45, 0.0, 0.0), uFx.x*0.75*dv); col.r += uFx.x*0.08;
  // static
  if(uFx.z > 0.001){ float n = hash12(gc*0.7 + uTime*100.0); float n2 = hash12(vec2(floor(vUV.y*200.0), floor(uTime*60.0))); col = mix(col, vec3(n*0.7 + n2*0.3), uFx.z); }
  col = mix(col, vec3(1.0), uFx2.y);
  col *= uFx.w;
  o = vec4(col, 1.0);
}`;
