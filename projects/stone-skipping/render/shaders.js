import { WIND_WAVE_COUNT } from './wind.js';

const HEAD = '#version 300 es\nprecision highp float;\nprecision highp sampler2D;\n';

const NOISE = /* glsl */ `
float hash21(vec2 p){
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  float a=hash21(i), b=hash21(i+vec2(1,0)), c=hash21(i+vec2(0,1)), d=hash21(i+vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float fbm(vec2 p, int octaves, float lacunarity){
  float v=0.0, amp=0.5, norm=0.0;
  for(int i=0;i<octaves;i++){ v+=amp*vnoise(p); norm+=amp; p*=lacunarity; amp*=0.5; }
  return v/norm;
}
`;

const SUN = /* glsl */ `
uniform vec3 uSunDir;
`;

const SKY = /* glsl */ `
vec3 skyColor(vec3 dir){
  float up = clamp(dir.y*0.5+0.5, 0.0, 1.0);
  vec3 col = mix(vec3(0.74,0.80,0.86), vec3(0.27,0.46,0.74), pow(up, 0.7));
  float sun = clamp(dot(normalize(dir), normalize(uSunDir)), 0.0, 1.0);
  col += vec3(1.0,0.96,0.86) * pow(sun, 700.0) * 6.0;
  col += vec3(1.0,0.93,0.80) * pow(sun, 12.0) * 0.18;
  return col;
}
`;

const SURFACE = /* glsl */ `
const vec3 SUN_RADIANCE = vec3(1.0, 0.95, 0.85);
const vec3 SKY_RADIANCE = vec3(0.55, 0.62, 0.72);
vec3 shadeDiffuse(vec3 n, vec3 albedo, float sunGain, vec3 lightDir, float ambient){
  float sun = max(dot(n, lightDir), 0.0) * sunGain;
  float sky = n.y*0.5 + 0.5;
  return albedo * (SUN_RADIANCE*sun*0.75 + (SKY_RADIANCE*sky*0.40 + 0.22) * ambient);
}
`;

const WATER_SURFACE = /* glsl */ `
uniform sampler2D uHeight;
uniform sampler2D uField;
uniform vec2 uHeightTexel;
uniform vec2 uCellSize;
uniform float uHeightScale;
uniform vec2 uWorldMin;
uniform vec2 uWorldSize;
uniform float uTime;
uniform float uWind;
const float ETA = 1.0/1.33;
const float GRAVITY = 9.81;
const int WIND_WAVES = ${WIND_WAVE_COUNT};
uniform vec4 uWave[WIND_WAVES];

vec2 windSlope(vec2 world){
  vec2 slope = vec2(0.0);
  for (int i = 0; i < WIND_WAVES; i++) {
    vec4 w = uWave[i];
    slope += w.xy * (w.w * cos(w.z * dot(w.xy, world) - sqrt(GRAVITY * w.z) * uTime));
  }
  return slope * uWind;
}

float waterHeight(vec2 uv){ return texture(uHeight, uv).r * uHeightScale; }

vec3 waterNormal(vec2 uv){
  float hl = texture(uHeight, uv - vec2(uHeightTexel.x,0.0)).r;
  float hr = texture(uHeight, uv + vec2(uHeightTexel.x,0.0)).r;
  float hd = texture(uHeight, uv - vec2(0.0,uHeightTexel.y)).r;
  float hu = texture(uHeight, uv + vec2(0.0,uHeightTexel.y)).r;
  vec2 grad = vec2((hr-hl)*uHeightScale/(2.0*uCellSize.x),
                   (hu-hd)*uHeightScale/(2.0*uCellSize.y));
  grad += windSlope(uWorldMin + uv * uWorldSize);
  return normalize(vec3(-grad.x, 1.0, -grad.y));
}
`;

const CAUSTIC_LOOKUP = /* glsl */ `
uniform sampler2D uCaustics;
uniform vec3 uSunDirWater;
uniform vec2 uCausticMin;
uniform vec2 uCausticSize;
uniform float uCausticStrength;
float causticGain(vec3 world){
  if (uCausticStrength <= 0.0 || world.y >= 0.0) return 1.0;
  vec2 uv = (world.xz - uCausticMin) / uCausticSize;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 1.0;
  return mix(1.0, texture(uCaustics, uv).r, uCausticStrength);
}
`;

const CLIP = /* glsl */ `
uniform float uClipY;
uniform float uClipSign;
void applyClip(float worldY){
  if ((worldY - uClipY) * uClipSign < 0.0) discard;
}
`;

export const FULLSCREEN_VS = HEAD + /* glsl */ `
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main(){ vUV = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }
`;

export const SKY_FS = HEAD + SUN + SKY + NOISE + /* glsl */ `
in vec2 vUV;
uniform mat4 uInvVP;
uniform float uTime;
out vec4 frag;
void main(){
  vec4 nearP = uInvVP * vec4(vUV*2.0-1.0, -1.0, 1.0);
  vec4 farP  = uInvVP * vec4(vUV*2.0-1.0,  1.0, 1.0);
  vec3 dir = normalize(farP.xyz/farP.w - nearP.xyz/nearP.w);
  vec3 col = skyColor(dir);
  if (dir.y > 0.02) {
    vec2 cp = dir.xz / dir.y * 1.4 + vec2(uTime*0.012, uTime*0.006);
    float c = smoothstep(0.52, 0.95, fbm(cp*1.3, 5, 2.02));
    float fade = smoothstep(0.02, 0.35, dir.y);
    col = mix(col, mix(vec3(0.85,0.87,0.90), vec3(1.0,0.99,0.96), c), c*fade*0.9);
  }
  frag = vec4(col, 1.0);
}
`;

export const CAUSTIC_GATHER_FS = HEAD + WATER_SURFACE + /* glsl */ `
in vec2 vUV;
uniform vec2 uMapRes;
uniform vec3 uLightDir;
uniform vec3 uRestRefract;
layout(location=0) out vec4 outA;
layout(location=1) out vec4 outB;

const int N = 7;
const int HALF = 3;

void main(){
  vec2 texel = 1.0 / uMapRes;
  vec2 toPixels = uMapRes / uWorldSize;
  vec2 gPix = vUV * uMapRes;
  vec2 slope = (uRestRefract.xz / max(1e-4, -uRestRefract.y)) * toPixels;

  vec2 centre = gPix;
  for (int it = 0; it < 3; it++) centre = gPix - slope * texture(uField, centre * texel).g;
  float depth = texture(uField, centre * texel).g;

  float intensity[N];
  for (int m = 0; m < N; m++) intensity[m] = 0.0;

  for (int k = 0; k < N; k++) {
    vec2 samplePix = centre + vec2(float(k - HALF), 0.0);
    vec2 sampleUV = samplePix * texel;
    vec3 r = refract(uLightDir, waterNormal(sampleUV), ETA);
    float travel = (waterHeight(sampleUV) + depth) / max(1e-4, -r.y);
    vec2 hit = samplePix + r.xz * travel * toPixels;
    float ax = max(0.0, 1.0 - abs(gPix.x - hit.x));
    if (ax <= 0.0) continue;
    for (int m = 0; m < N; m++) {
      float targetY = gPix.y + float(m - HALF);
      intensity[m] += ax * max(0.0, 1.0 - abs(targetY - hit.y));
    }
  }
  outA = vec4(intensity[0], intensity[1], intensity[2], intensity[3]);
  outB = vec4(intensity[4], intensity[5], intensity[6], 0.0);
}
`;

export const CAUSTIC_SUM_FS = HEAD + /* glsl */ `
in vec2 vUV;
uniform sampler2D uGatherA;
uniform sampler2D uGatherB;
uniform vec2 uMapRes;
out vec4 frag;
void main(){
  vec2 texel = 1.0 / uMapRes;
  float v = 0.0;
  v += texture(uGatherA, vUV + vec2(0.0,  3.0) * texel).r;
  v += texture(uGatherA, vUV + vec2(0.0,  2.0) * texel).g;
  v += texture(uGatherA, vUV + vec2(0.0,  1.0) * texel).b;
  v += texture(uGatherA, vUV).a;
  v += texture(uGatherB, vUV + vec2(0.0, -1.0) * texel).r;
  v += texture(uGatherB, vUV + vec2(0.0, -2.0) * texel).g;
  v += texture(uGatherB, vUV + vec2(0.0, -3.0) * texel).b;
  frag = vec4(v, 0.0, 0.0, 1.0);
}
`;

export const WATER_VS = HEAD + /* glsl */ `
layout(location=0) in vec2 aXZ;
uniform mat4 uViewProj;
uniform sampler2D uHeight;
uniform vec2 uWorldMin;
uniform vec2 uWorldSize;
uniform float uHeightScale;
out vec3 vWorld;
out vec2 vUV;
out vec4 vClip;
void main(){
  vUV = (aXZ - uWorldMin) / uWorldSize;
  vWorld = vec3(aXZ.x, texture(uHeight, vUV).r * uHeightScale, aXZ.y);
  vClip = uViewProj * vec4(vWorld, 1.0);
  gl_Position = vClip;
}
`;

export const WATER_FS = HEAD + SUN + SKY + WATER_SURFACE + /* glsl */ `
in vec3 vWorld;
in vec2 vUV;
in vec4 vClip;
uniform sampler2D uRefraction;
uniform sampler2D uReflection;
uniform vec3 uCamPos;
uniform vec3 uExtinction;
uniform vec3 uScatterColor;
uniform float uRefractionStrength;
uniform float uReflectionStrength;
out vec4 frag;

void main(){
  vec2 field = texture(uField, vUV).rg;
  if (field.x >= 0.0) discard;
  float depth = field.y;

  vec3 n = waterNormal(vUV);
  vec3 view = normalize(uCamPos - vWorld);
  vec3 sun = normalize(uSunDir);
  vec3 rdir = refract(-view, n, ETA);
  float cosT = max(0.25, -rdir.y);

  vec2 screenUV = vClip.xy / vClip.w * 0.5 + 0.5;
  float perturb = uRefractionStrength * clamp(depth / 2.0, 0.0, 1.0);
  vec3 bottom = texture(uRefraction, clamp(screenUV + n.xz*perturb, 0.001, 0.999)).rgb;

  float path = depth * (1.0 + 1.0/cosT);
  vec3 T = exp(-uExtinction * path);
  vec3 refr = mix(uScatterColor, bottom, T);

  vec4 near = texture(uReflection, clamp(screenUV + n.xz*uReflectionStrength, 0.001, 0.999));
  vec3 mirror = mix(skyColor(reflect(-view, n)), near.rgb, near.a);
  float fres = 0.02 + 0.98*pow(1.0 - max(dot(view,n),0.0), 5.0);
  vec3 col = mix(refr, mirror, fres);

  vec3 hh = normalize(view + sun);
  col += vec3(1.0,0.97,0.88) * pow(max(dot(n,hh),0.0), 140.0) * 1.1;

  float foam = (1.0 - smoothstep(0.0, 1.6, -field.x)) * clamp(0.5 + texture(uHeight, vUV).r*8.0, 0.0, 1.0);
  col = mix(col, vec3(0.86,0.88,0.86), foam*0.30);
  frag = vec4(col, 1.0);
}
`;

export const TERRAIN_VS = HEAD + /* glsl */ `
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
uniform mat4 uViewProj;
out vec3 vN;
out vec3 vColor;
out vec3 vWorld;
void main(){
  vN = aNormal;
  vColor = aColor;
  vWorld = aPos;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;

export const TERRAIN_FS = HEAD + SUN + SURFACE + NOISE + CAUSTIC_LOOKUP + CLIP + /* glsl */ `
in vec3 vN;
in vec3 vColor;
in vec3 vWorld;
out vec4 frag;
void main(){
  applyClip(vWorld.y);
  float w = max(fwidth(vWorld.x), fwidth(vWorld.z));
  float broad = fbm(vWorld.xz * 0.40, 3, 2.11) * 2.0 - 1.0;
  float grain = fbm(vWorld.xz * 2.30, 3, 2.03) * 2.0 - 1.0;
  float grit  = vnoise(vWorld.xz * 8.5) * 2.0 - 1.0;
  vec3 albedo = vColor * (1.0 + 0.055*broad
                              + 0.070*grain * clamp(1.0 - w*1.2, 0.0, 1.0)
                              + 0.055*grit  * clamp(1.0 - w*4.0, 0.0, 1.0));
  bool wet = vWorld.y < 0.0;
  vec3 L = wet ? uSunDirWater : normalize(uSunDir);
  frag = vec4(shadeDiffuse(normalize(vN), albedo, causticGain(vWorld), L, wet ? 0.55 : 1.0), 1.0);
}
`;

export const PROP_VS = HEAD + /* glsl */ `
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
layout(location=3) in float aSway;
layout(location=4) in vec4 iPos;
layout(location=5) in vec4 iParam;
uniform mat4 uViewProj;
uniform float uTime;
out vec3 vN;
out vec3 vColor;
out vec3 vWorld;
void main(){
  float c = cos(iParam.x), s = sin(iParam.x);
  mat2 rot = mat2(c, -s, s, c);
  vec3 p = aPos * iParam.y;
  p.y *= iPos.w;
  p.xz = rot * p.xz;
  float w = sin(uTime*1.3 + iParam.w) + 0.4*sin(uTime*2.7 + iParam.w*1.7);
  p.xz += w * aSway * iParam.z * vec2(1.0, 0.5);
  vec3 world = p + iPos.xyz;
  vec3 n = aNormal;
  n.y /= iPos.w;
  n.xz = rot * n.xz;
  vN = normalize(n);
  vColor = aColor;
  vWorld = world;
  gl_Position = uViewProj * vec4(world, 1.0);
}
`;

export const PROP_FS = HEAD + SUN + SURFACE + CAUSTIC_LOOKUP + CLIP + /* glsl */ `
in vec3 vN;
in vec3 vColor;
in vec3 vWorld;
out vec4 frag;
void main(){
  applyClip(vWorld.y);
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  bool wet = vWorld.y < 0.0;
  vec3 L = wet ? uSunDirWater : normalize(uSunDir);
  frag = vec4(shadeDiffuse(n, vColor, causticGain(vWorld), L, wet ? 0.55 : 1.0), 1.0);
}
`;

export const STONE_VS = HEAD + /* glsl */ `
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform mat3 uNormalMat;
out vec3 vN;
out vec3 vWorld;
out vec3 vLocal;
void main(){
  vec4 wp = uModel * vec4(aPos,1.0);
  vWorld = wp.xyz;
  vN = normalize(uNormalMat * aNormal);
  vLocal = aPos;
  gl_Position = uViewProj * wp;
}
`;

export const STONE_FS = HEAD + SUN + SURFACE + NOISE + /* glsl */ `
in vec3 vN;
in vec3 vWorld;
in vec3 vLocal;
uniform vec3 uCamPos;
uniform vec3 uAlbedo;
uniform float uPhi;
out vec4 frag;
void main(){
  float c = cos(uPhi), s = sin(uPhi);
  vec2 uv = mat2(c,-s,s,c) * vLocal.xz;
  float t = clamp(fbm(uv*2.3 + 5.0, 4, 2.07)*0.7 + fbm(uv*9.0 + 17.0, 4, 2.07)*0.4, 0.0, 1.0);
  vec3 rock = mix(vec3(0.30,0.29,0.28), vec3(0.62,0.61,0.58), t);
  rock = mix(rock, vec3(0.78,0.76,0.70), smoothstep(0.86, 0.95, vnoise(uv*22.0 + 3.0))*0.8);
  rock *= (0.92 + 0.08*sin(atan(uv.y, uv.x)*3.0)) * uAlbedo / vec3(0.46);

  vec3 n = normalize(vN);
  vec3 view = normalize(uCamPos - vWorld);
  vec3 hh = normalize(view + normalize(uSunDir));
  frag = vec4(shadeDiffuse(n, rock, 1.0, normalize(uSunDir), 1.0) + pow(max(dot(n,hh),0.0), 40.0)*0.25, 1.0);
}
`;

export const TRAIL_VS = HEAD + /* glsl */ `
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
void main(){ gl_Position = uViewProj * vec4(aPos,1.0); }
`;

export const TRAIL_FS = HEAD + /* glsl */ `
uniform vec4 uColor;
out vec4 frag;
void main(){ frag = uColor; }
`;

export const GHOST_VS = HEAD + /* glsl */ `
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform mat3 uNormalMat;
out vec3 vN;
void main(){
  vN = normalize(uNormalMat * aNormal);
  gl_Position = uViewProj * (uModel * vec4(aPos,1.0));
}
`;

export const GHOST_FS = HEAD + SUN + /* glsl */ `
in vec3 vN;
uniform vec4 uColor;
out vec4 frag;
void main(){
  float diff = max(dot(normalize(vN), normalize(uSunDir)),0.0)*0.5 + 0.5;
  frag = vec4(uColor.rgb*diff, uColor.a);
}
`;

export const MIST_VS = HEAD + /* glsl */ `
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aLife;
uniform mat4 uViewProj;
uniform float uPixelScale;
out float vLife;
void main(){
  vLife = aLife.x;
  vec4 clip = uViewProj * vec4(aPos, 1.0);
  gl_Position = clip;
  gl_PointSize = max(2.0, uPixelScale * aLife.y * mix(0.6, 1.6, 1.0 - aLife.x) / max(0.001, clip.w));
}
`;

export const MIST_FS = HEAD + /* glsl */ `
in float vLife;
uniform vec3 uColor;
out vec4 frag;
void main(){
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  frag = vec4(uColor, exp(-r2*2.2) * vLife * 0.5);
}
`;
