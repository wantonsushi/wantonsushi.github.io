export const SPLAT_VS = `#version 300 es
layout(location=0) in vec2 aXY;
layout(location=1) in vec3 aRGB;
uniform vec2 uResolution;
out vec3 vRGB;
void main() {
  vec2 ndc = ((aXY + 0.5) / uResolution) * 2.0 - 1.0;
  ndc.y = -ndc.y;
  gl_Position = vec4(ndc, 0.0, 1.0);
  gl_PointSize = 1.0;
  vRGB = aRGB;
}`;

export const SPLAT_FS = `#version 300 es
precision highp float;
in vec3 vRGB;
out vec4 fragColor;
void main() { fragColor = vec4(vRGB, 1.0); }`;

export const DISPLAY_VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main() { vUV = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

export const DISPLAY_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uHDR;
uniform sampler2D uDirect;
uniform float uNorm;
uniform float uExposure;
out vec4 fragColor;
void main() {
  vec3 direct = texture(uDirect, vec2(vUV.x, 1.0 - vUV.y)).rgb;
  vec3 hdr = texture(uHDR, vUV).rgb * uNorm + direct;
  hdr *= uExposure;
  vec3 mapped = pow(vec3(1.0) - exp(-max(hdr, 0.0)), vec3(1.0 / 2.2));
  fragColor = vec4(mapped, 1.0);
}`;
