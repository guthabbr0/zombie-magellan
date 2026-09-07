/* ============================================================
   GLSL sources
   ============================================================ */
const GLSL_NOISE = `
#ifndef PI
#define PI 3.14159265359
#endif
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
// lattice hashes: scramble integer inputs first (the raw hash is biased for small integers)
float hashI(vec2 p){ return hash12(p*1.7183 + vec2(31.37, 17.71)); }
vec2 hash2I(vec2 p){ return hash22(p*1.4142 + vec2(11.13, 27.59)); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hashI(i), hashI(i+vec2(1,0)), u.x), mix(hashI(i+vec2(0,1)), hashI(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p, int oct){ float v = 0.0, a = 0.5; for(int i=0;i<oct;i++){ v += a*noise(p); p = p*2.03 + 17.1; a *= 0.5; } return v; }
float noiseT(vec2 p, float per){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  float a = hashI(mod(i, per)), b = hashI(mod(i+vec2(1,0), per)), c = hashI(mod(i+vec2(0,1), per)), d = hashI(mod(i+vec2(1,1), per));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y); }
float fbmT(vec2 p, float per, int oct){ float v = 0.0, a = 0.5; for(int i=0;i<oct;i++){ v += a*noiseT(p, per); p *= 2.0; per *= 2.0; a *= 0.5; } return v; }
vec3 voroT(vec2 p, float per){ vec2 i = floor(p), f = fract(p); float f1 = 8.0, f2 = 8.0, id = 0.0;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec2 g = vec2(float(x),float(y)); vec2 o = hash2I(mod(i+g, per)); vec2 r = g + o - f; float d = dot(r,r);
    if(d < f1){ f2 = f1; f1 = d; id = hashI(mod(i+g, per)); } else if(d < f2) f2 = d; }
  return vec3(sqrt(f1), sqrt(f2), id); }
`;

const GLSL_PBR = `
#ifndef PI
#define PI 3.14159265359
#endif
float D_GGX(float NoH, float a){ float a2 = a*a; float d = NoH*NoH*(a2-1.0)+1.0; return a2/(PI*d*d+1e-6); }
float V_Smith(float NoV, float NoL, float a){ float a2 = a*a; float gv = NoL*sqrt(NoV*NoV*(1.0-a2)+a2); float gl = NoV*sqrt(NoL*NoL*(1.0-a2)+a2); return 0.5/max(gv+gl, 1e-4); }
vec3 F_Schlick(float VoH, vec3 f0){ float f = pow(1.0-VoH, 5.0); return f0 + (1.0-f0)*f; }
vec3 shade(vec3 N, vec3 V, vec3 L, vec3 albedo, float rough, float metal, vec3 lc, float wrap){
  vec3 H = normalize(L+V); float NoLr = dot(N,L); float NoL = max((NoLr + wrap)/(1.0+wrap), 0.0);
  float NoV = max(dot(N,V), 1e-3), NoH = max(dot(N,H), 0.0), VoH = max(dot(V,H), 0.0);
  float a = max(rough*rough, 0.002); vec3 f0 = mix(vec3(0.04), albedo, metal);
  vec3 F = F_Schlick(VoH, f0); float D = D_GGX(NoH, a); float Vis = V_Smith(NoV, NoL, a);
  vec3 spec = D*Vis*F*max(NoLr,0.0); vec3 diff = (1.0-F)*(1.0-metal)*albedo/PI*NoL;
  return (diff + spec)*lc; }
float spotAtt(float d, float range, float cosA, float cosOuter, float cosInner){
  float x = clamp(1.0 - pow(d/range, 4.0), 0.0, 1.0); float cone = smoothstep(cosOuter, cosInner, cosA);
  return x*x/(d*d + 4.0)*cone; }
float pointAtt(float d, float range){ float x = clamp(1.0 - pow(d/range, 4.0), 0.0, 1.0); return x*x/(d*d + 0.25); }
`;

/* ---------- mesh shaders ---------- */
const VS_MESH = `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec2 aUV; layout(location=3) in vec4 aTan; layout(location=4) in vec4 aBone;
uniform mat4 uModel, uVP, uView;
#ifdef SKINNED
uniform mat4 uBones[24];
#endif
out vec3 vWorld; out vec3 vNrm; out vec4 vTan; out vec2 vUV; out float vDepth;
void main(){
  vec4 p = vec4(aPos, 1.0); vec3 n = aNrm, t = aTan.xyz;
#ifdef SKINNED
  mat4 s = uBones[int(aBone.x)]*aBone.z + uBones[int(aBone.y)]*aBone.w;
  p = s*p; n = mat3(s)*n; t = mat3(s)*t;
#endif
  vec4 w = uModel*p; vWorld = w.xyz;
  mat3 nm = mat3(uModel);
  vNrm = normalize(nm*n); vTan = vec4(normalize(nm*t), aTan.w); vUV = aUV;
  vDepth = -(uView*w).z;
  gl_Position = uVP*w;
}`;

const FS_MESH = GLSL_NOISE + GLSL_PBR + `
precision highp float;
in vec3 vWorld; in vec3 vNrm; in vec4 vTan; in vec2 vUV; in float vDepth;
layout(location=0) out vec4 oColor; layout(location=1) out vec4 oND;
uniform sampler2D uAlbedo, uNormalRM; uniform sampler2DShadow uMoonShadow, uFlashShadow;
uniform mat4 uView, uMoonVP, uFlashVP;
uniform vec3 uCamPos; uniform vec2 uTiling; uniform vec4 uTint; uniform vec3 uEmissive; uniform vec2 uRoughMetal; uniform float uNormalStr;
uniform vec4 uFlags; // x ground, y wrap, z unlit, w moonShadowOn
uniform vec3 uMoonDir, uMoonColor, uSkyColor, uGroundColor;
uniform vec4 uFlashPos, uFlashDir, uFlashParams; uniform vec3 uFlashColor; // pos.xyz, on ; dir.xyz, cosOuter ; cosInner, intensity, range, shadowOn
uniform int uNumPoint; uniform vec4 uPointPos[10]; uniform vec4 uPointColor[10];
uniform int uNumSpot; uniform vec4 uSpotPos[4]; uniform vec4 uSpotDir[4]; uniform vec4 uSpotColor[4];
uniform vec4 uFog; uniform float uWet, uTime; uniform vec2 uShadowTexel; uniform float uLightning;

float shadowMoon(vec3 N, float NoL){
  vec4 sc = uMoonVP*vec4(vWorld + N*0.06, 1.0); vec3 p = sc.xyz/sc.w*0.5+0.5;
  if(p.x<0.0||p.x>1.0||p.y<0.0||p.y>1.0||p.z>1.0) return 1.0;
  float bias = 0.0006 + 0.0012*(1.0-NoL); float s = 0.0;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) s += texture(uMoonShadow, vec3(p.xy + vec2(float(x),float(y))*uShadowTexel.x, p.z - bias));
  return s/9.0; }
float shadowFlash(vec3 N, float dist, float NoL){
  vec4 sc = uFlashVP*vec4(vWorld + N*(0.012 + 0.006*dist)*(1.5-NoL), 1.0); if(sc.w <= 0.0) return 1.0;
  vec3 p = sc.xyz/sc.w*0.5+0.5; if(p.x<0.0||p.x>1.0||p.y<0.0||p.y>1.0||p.z>1.0) return 1.0;
  float s = 0.0;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) s += texture(uFlashShadow, vec3(p.xy + vec2(float(x),float(y))*uShadowTexel.y, p.z - 0.00004));
  return s/9.0; }

void main(){
  vec2 uv = vUV*uTiling;
  vec4 alb = texture(uAlbedo, uv);
  float alpha = 1.0, ao = alb.a;
#ifdef ALPHA
  alpha = alb.a*uTint.a; ao = 1.0;
  #ifdef CUTOUT
  if(alpha < 0.45) discard; alpha = 1.0;
  #else
  if(alpha < 0.004) discard;
  #endif
#endif
  vec4 nrm = texture(uNormalRM, uv);
  vec3 albedo = alb.rgb*uTint.rgb;
  float rough = clamp(nrm.b*uRoughMetal.x, 0.03, 1.0), metal = clamp(nrm.a*uRoughMetal.y, 0.0, 1.0);
  vec3 Ng = normalize(vNrm); if(!gl_FrontFacing) Ng = -Ng;
  vec3 T = normalize(vTan.xyz - Ng*dot(Ng, vTan.xyz)); vec3 B = cross(Ng, T)*vTan.w;
  vec3 tn = vec3((nrm.rg*2.0-1.0)*uNormalStr, 0.0); tn.z = sqrt(max(0.0, 1.0 - dot(tn.xy, tn.xy)));
  vec3 N = normalize(T*tn.x + B*tn.y + Ng*tn.z);
  vec3 V = uCamPos - vWorld; float dist = length(V); V /= dist;
  if(uFlags.x > 0.5){ // ground: wetness & puddles
    float pn = fbm(vWorld.xz*0.33 + 3.0, 3);
    float pud = smoothstep(0.50, 0.60, pn)*uWet;
    albedo *= 1.0 - 0.32*uWet;
    rough = mix(rough*(1.0 - 0.45*uWet), 0.05, pud);
    vec2 rip = vec2(noise(vWorld.xz*7.0 + uTime*2.1), noise(vWorld.zx*7.0 - uTime*1.7)) - 0.5;
    vec3 flatN = normalize(vec3(rip.x*0.35*uWet, 1.0, rip.y*0.35*uWet));
    N = normalize(mix(N, flatN, pud)); metal = mix(metal, 0.0, pud);
  }
  vec3 col = vec3(0.0);
  if(uFlags.z > 0.5){ col = albedo; }
  else {
    float wrap = uFlags.y;
    // ambient hemisphere + lightning
    vec3 skyC = uSkyColor*(1.0 + uLightning*6.0);
    vec3 amb = mix(uGroundColor, skyC, N.y*0.5+0.5)*ao;
    float NoV = max(dot(N,V), 1e-3); vec3 f0 = mix(vec3(0.04), albedo, metal);
    vec3 Fa = f0 + (max(vec3(1.0-rough), f0) - f0)*pow(1.0-NoV, 5.0);
    col += amb*albedo*(1.0-metal)*(1.0-Fa*0.5) + skyC*Fa*(1.0-rough)*ao*(0.6 + 0.4*N.y);
    // moon
    float NoLm = dot(N, uMoonDir);
    if(NoLm > -wrap){ float sh = uFlags.w > 0.5 ? shadowMoon(Ng, max(NoLm,0.0)) : 1.0; col += shade(N, V, uMoonDir, albedo, rough, metal, uMoonColor*(1.0 + uLightning*4.0), wrap)*sh; }
    // flashlight
    if(uFlashPos.w > 0.5){
      vec3 L = uFlashPos.xyz - vWorld; float d = length(L); L /= d;
      float cosA = dot(-L, uFlashDir.xyz);
      if(cosA > uFlashDir.w - 0.02){
        float att = spotAtt(d, uFlashParams.z, cosA, uFlashDir.w, uFlashParams.x)*uFlashParams.y;
        float NoL = dot(N, L);
        float sh = uFlashParams.w > 0.5 ? shadowFlash(Ng, d, max(NoL,0.0)) : 1.0;
        col += shade(N, V, L, albedo, rough, metal, uFlashColor*att, wrap)*sh;
      }
    }
    for(int i=0;i<10;i++){ if(i>=uNumPoint) break;
      vec3 L = uPointPos[i].xyz - vWorld; float d = length(L); if(d > uPointPos[i].w) continue; L /= d;
      col += shade(N, V, L, albedo, rough, metal, uPointColor[i].rgb*uPointColor[i].a*pointAtt(d, uPointPos[i].w), wrap); }
    for(int i=0;i<4;i++){ if(i>=uNumSpot) break;
      vec3 L = uSpotPos[i].xyz - vWorld; float d = length(L); if(d > uSpotPos[i].w) continue; L /= d;
      float cosA = dot(-L, uSpotDir[i].xyz); if(cosA < uSpotDir[i].w) continue;
      col += shade(N, V, L, albedo, rough, metal, uSpotColor[i].rgb*spotAtt(d, uSpotPos[i].w, cosA, uSpotDir[i].w, uSpotColor[i].w), wrap); }
  }
  col += uEmissive;
  // height fog
  float k = 0.045; float dy = vWorld.y - uCamPos.y;
  float fogAmt = uFog.w*exp(-uCamPos.y*k)*(abs(dy) > 0.01 ? (1.0 - exp(-dist*(dy/dist)*k))/((dy/dist)*k) : dist);
  float f = 1.0 - exp(-max(fogAmt,0.0));
  vec3 fogC = uFog.rgb*(1.0 + uLightning*5.0);
  col = mix(col, fogC, clamp(f, 0.0, 1.0));
  oColor = vec4(col, alpha);
  oND = vec4(mat3(uView)*N, vDepth);
}`;

const VS_SHADOW = `
layout(location=0) in vec3 aPos; layout(location=4) in vec4 aBone;
uniform mat4 uModel, uVP;
#ifdef SKINNED
uniform mat4 uBones[24];
#endif
void main(){ vec4 p = vec4(aPos, 1.0);
#ifdef SKINNED
  p = (uBones[int(aBone.x)]*aBone.z + uBones[int(aBone.y)]*aBone.w)*p;
#endif
  gl_Position = uVP*uModel*p; }`;
const FS_SHADOW = `precision mediump float; void main(){}`;

/* ---------- sky ---------- */
const VS_FS = `layout(location=0) in vec2 aP; out vec2 vUV; void main(){ vUV = aP*0.5+0.5; gl_Position = vec4(aP, 0.999999, 1.0); }`;
const FS_SKY = GLSL_NOISE + `
precision highp float; in vec2 vUV; layout(location=0) out vec4 oColor; layout(location=1) out vec4 oND;
uniform mat4 uInvVP; uniform vec3 uCamPos, uMoonDir, uMoonColor, uSkyColor; uniform vec4 uFog; uniform float uTime, uLightning;
void main(){
  vec4 fp = uInvVP*vec4(vUV*2.0-1.0, 1.0, 1.0); vec3 dir = normalize(fp.xyz/fp.w - uCamPos);
  float up = max(dir.y, 0.0);
  vec3 zen = uSkyColor*0.55, hor = uFog.rgb*1.15;
  vec3 col = mix(hor, zen, pow(up, 0.55));
  // clouds
  float t = 300.0/max(dir.y, 0.03);
  vec2 cuv = (uCamPos.xz + dir.xz*t)*0.0011 + vec2(uTime*0.010, uTime*0.004);
  float c1 = fbm(cuv*1.5, 5); float c2 = fbm(cuv*4.0 + 9.0, 3);
  float cov = smoothstep(0.38, 0.62, c1 + (c2-0.5)*0.35);
  float md = max(dot(dir, uMoonDir), 0.0);
  vec3 cloudDark = uSkyColor*0.35 + hor*0.25;
  vec3 cloudLit = cloudDark + uMoonColor*0.6*(0.25 + pow(md, 6.0))*(1.0-cov*0.5);
  vec3 cloud = mix(cloudLit, cloudDark, cov)*(1.0 + uLightning*7.0);
  // moon disc + glow
  float disc = smoothstep(0.99975, 0.99992, md);
  vec3 moon = uMoonColor*(disc*8.0 + pow(md, 400.0)*1.5 + pow(md, 24.0)*0.15);
  // stars
  vec3 sd = dir*300.0; float st = hash13(floor(sd)); float star = smoothstep(0.985, 0.995, st)*step(0.02, hash13(floor(sd)+7.0)*up)*0.6;
  col += moon*(1.0-cov) + vec3(star)*(1.0-cov)*(1.0 - smoothstep(0.0,0.2,dot(dir,uMoonDir)*0.5+0.5)*0.0);
  col = mix(col, cloud, cov*smoothstep(0.0, 0.12, dir.y));
  // haze near horizon
  col = mix(col, hor, pow(1.0-up, 5.0));
  col *= 1.0 + uLightning*2.0;
  oColor = vec4(col, 1.0); oND = vec4(0.0, 1.0, 0.0, 5000.0);
}`;

/* ---------- particles ---------- */
const VS_PART = GLSL_PBR + `
layout(location=0) in vec2 aP;
layout(location=1) in vec4 aI0; layout(location=2) in vec4 aI1; layout(location=3) in vec4 aI2; layout(location=4) in vec4 aI3;
uniform mat4 uVP, uView; uniform vec3 uCamPos;
uniform vec3 uSkyColor, uGroundColor; uniform vec4 uFlashPos, uFlashDir, uFlashParams; uniform vec3 uFlashColor;
uniform int uNumPoint; uniform vec4 uPointPos[10]; uniform vec4 uPointColor[10];
out vec2 vUV; out vec4 vCol; out float vType; out float vDepth;
void main(){
  vec3 pos = aI0.xyz; float size = aI0.w; vec4 col = aI1; vec3 vel = aI2.xyz; float rot = aI2.w; float type = aI3.x; float stretch = aI3.z;
  vec3 right = vec3(uView[0][0], uView[1][0], uView[2][0]); vec3 up = vec3(uView[0][1], uView[1][1], uView[2][1]);
  vec2 c = aP;
  float cr = cos(rot), sr = sin(rot); c = vec2(c.x*cr - c.y*sr, c.x*sr + c.y*cr);
  vec3 wp;
  if(stretch > 0.0){ // streak along velocity
    vec3 vdir = normalize(vel + 1e-5); vec3 side = normalize(cross(vdir, normalize(uCamPos - pos)) + 1e-6);
    wp = pos + vdir*aP.y*size*stretch + side*aP.x*size;
  } else wp = pos + (right*c.x + up*c.y)*size;
  // simple lighting for lit types (0 dust, 1 smoke, 2 blood)
  if(aI3.w < 0.5){
    vec3 l = mix(uGroundColor, uSkyColor, 0.6)*1.2;
    if(uFlashPos.w > 0.5){ vec3 L = uFlashPos.xyz - pos; float d = length(L); L /= d; float cosA = dot(-L, uFlashDir.xyz);
      l += uFlashColor*spotAtt(d, uFlashParams.z, cosA, uFlashDir.w, uFlashParams.x)*uFlashParams.y*0.35; }
    for(int i=0;i<10;i++){ if(i>=uNumPoint) break; vec3 L = uPointPos[i].xyz - pos; float d = length(L); if(d > uPointPos[i].w) continue;
      l += uPointColor[i].rgb*uPointColor[i].a*pointAtt(d, uPointPos[i].w)*0.35; }
    col.rgb *= l;
  }
  vUV = aP + 0.5; vCol = col; vType = type; vDepth = -(uView*vec4(wp,1.0)).z;
  gl_Position = uVP*vec4(wp, 1.0);
}`;
const FS_PART = `
precision mediump float; in vec2 vUV; in vec4 vCol; in float vType; in float vDepth;
uniform sampler2D uSprite, uND; uniform vec2 uRes; uniform float uSoft; uniform vec4 uFog;
out vec4 o;
void main(){
  vec2 cell = vec2(mod(vType, 2.0), floor(vType/2.0));
  float a = texture(uSprite, (vUV + cell)*0.5).a;
  float sd = texture(uND, gl_FragCoord.xy/uRes).a;
  float soft = clamp((sd - vDepth)/uSoft, 0.0, 1.0);
  float f = exp(-vDepth*uFog.w*0.8);
  o = vec4(vCol.rgb*f, vCol.a*a*soft);
}`;

/* ---------- rain ---------- */
const VS_RAIN = GLSL_NOISE + GLSL_PBR + `
layout(location=0) in vec2 aP;
uniform mat4 uVP, uView; uniform vec3 uCamPos; uniform float uTime; uniform vec3 uWind;
uniform vec3 uSkyColor; uniform vec4 uFlashPos, uFlashDir, uFlashParams; uniform vec3 uFlashColor;
uniform int uNumPoint; uniform vec4 uPointPos[10]; uniform vec4 uPointColor[10];
out vec2 vUV; out float vLight;
void main(){
  float id = float(gl_InstanceID);
  vec3 h = vec3(hash12(vec2(id, 1.0)), hash12(vec2(id, 2.0)), hash12(vec2(id, 3.0)));
  float R = 24.0, H = 16.0;
  float speed = 9.0 + h.z*3.0;
  float y = mod(h.y*H - uTime*speed, H);
  float x = uCamPos.x + mod(h.x*R + uWind.x*uTime*0.6 - uCamPos.x, R) - R*0.5;
  float z = uCamPos.z + mod(h.z*R + uWind.z*uTime*0.6 - uCamPos.z, R) - R*0.5;
  vec3 pos = vec3(x, y, z);
  vec3 right = vec3(uView[0][0], uView[1][0], uView[2][0]);
  vec3 fall = normalize(vec3(uWind.x*0.15, -1.0, uWind.z*0.15));
  float d = length(pos - uCamPos);
  float w = 0.006 + d*0.0015; float len = 0.28 + h.z*0.2;
  vec3 wp = pos + right*aP.x*w - fall*aP.y*len;
  float l = 0.05 + uSkyColor.g*0.4;
  if(uFlashPos.w > 0.5){ vec3 L = uFlashPos.xyz - pos; float dd = length(L); L /= dd; float cosA = dot(-L, uFlashDir.xyz);
    l += spotAtt(dd, uFlashParams.z, cosA, uFlashDir.w, uFlashParams.x)*uFlashParams.y*0.8; }
  for(int i=0;i<10;i++){ if(i>=uNumPoint) break; vec3 L = uPointPos[i].xyz - pos; float dd = length(L); if(dd > uPointPos[i].w) continue;
    l += uPointColor[i].a*pointAtt(dd, uPointPos[i].w)*0.6; }
  vLight = l*(1.0 - smoothstep(6.0, 24.0, d)) ; vUV = aP + 0.5;
  gl_Position = uVP*vec4(wp, 1.0);
}`;
const FS_RAIN = `precision mediump float; in vec2 vUV; in float vLight; out vec4 o;
void main(){ float a = (1.0 - abs(vUV.x*2.0-1.0))*(1.0 - abs(vUV.y*2.0-1.0)); o = vec4(vec3(0.7,0.75,0.8)*vLight, a*0.35*min(vLight*3.0, 1.0)); }`;
