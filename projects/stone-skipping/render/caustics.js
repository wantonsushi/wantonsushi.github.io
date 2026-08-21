import { compile, makeFullscreenVAO, uniforms } from '../gl.js';
import { FULLSCREEN_VS, CAUSTIC_GATHER_FS, CAUSTIC_SUM_FS } from './shaders.js';
import { WIND_WAVES } from './wind.js';

const ETA = 1 / 1.33;

function target(gl, width, height, attachments) {
  const texs = [];
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  for (let i = 0; i < attachments; i++) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, tex, 0);
    texs.push(tex);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, texs, width, height };
}

function refractRest(sunDir) {
  const L = 1 / Math.hypot(sunDir[0], sunDir[1], sunDir[2]);
  const d = [-sunDir[0] * L, -sunDir[1] * L, -sunDir[2] * L];
  const cosI = -d[1];
  const k = 1 - ETA * ETA * (1 - cosI * cosI);
  if (k < 0) return null;
  const f = ETA * cosI - Math.sqrt(k);
  return [ETA * d[0], ETA * d[1] + f, ETA * d[2]];
}

export class Caustics {
  constructor(gl, water, { resolution = [256, 512] } = {}) {
    this.gl = gl;
    this.water = water;
    this.strength = 1.0;
    this.sunDirWater = [0, 1, 0];
    this.enabled = !!gl.getExtension('EXT_color_buffer_float');
    if (!this.enabled) return;

    const [w, h] = resolution;
    this.res = resolution;
    this.gather = target(gl, w, h, 2);
    this.map = target(gl, w, h, 1);

    this.vao = makeFullscreenVAO(gl);
    this.gatherProg = compile(gl, FULLSCREEN_VS, CAUSTIC_GATHER_FS);
    this.sumProg = compile(gl, FULLSCREEN_VS, CAUSTIC_SUM_FS);
    this.gu = uniforms(gl, this.gatherProg, ['uHeight', 'uField', 'uHeightTexel', 'uCellSize',
      'uHeightScale', 'uWorldMin', 'uWorldSize', 'uLightDir', 'uRestRefract', 'uMapRes', 'uTime', 'uWind', 'uWave']);
    this.su = uniforms(gl, this.sumProg, ['uGatherA', 'uGatherB', 'uMapRes']);
  }

  get texture() { return this.enabled ? this.map.texs[0] : null; }

  bind(u, unit) {
    const gl = this.gl, w = this.water;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.enabled ? this.map.texs[0] : null);
    gl.uniform1i(u.uCaustics, unit);
    gl.uniform3fv(u.uSunDirWater, this.sunDirWater);
    gl.uniform2f(u.uCausticMin, w.worldMin[0], w.worldMin[1]);
    gl.uniform2f(u.uCausticSize, w.worldSize[0], w.worldSize[1]);
    gl.uniform1f(u.uCausticStrength, this.enabled ? this.strength : 0);
  }

  update(sunDir, time, wind) {
    if (!this.enabled) return;
    const gl = this.gl, w = this.water;
    const [mw, mh] = this.res;
    const rest = refractRest(sunDir);
    if (!rest) return;
    this.sunDirWater = [-rest[0], -rest[1], -rest[2]];
    const inv = -1 / Math.hypot(sunDir[0], sunDir[1], sunDir[2]);
    const light = [sunDir[0] * inv, sunDir[1] * inv, sunDir[2] * inv];

    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, mw, mh);
    gl.disable(gl.DEPTH_TEST);

    gl.useProgram(this.gatherProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.gather.fbo);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, w.heightTex);
    gl.uniform1i(this.gu.uHeight, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, w.field);
    gl.uniform1i(this.gu.uField, 1);
    gl.uniform2f(this.gu.uHeightTexel, 1 / w.nx, 1 / w.nz);
    gl.uniform2f(this.gu.uCellSize, w.cell[0], w.cell[1]);
    gl.uniform1f(this.gu.uHeightScale, w.heightScale);
    gl.uniform2f(this.gu.uWorldMin, w.worldMin[0], w.worldMin[1]);
    gl.uniform2f(this.gu.uWorldSize, w.worldSize[0], w.worldSize[1]);
    gl.uniform3fv(this.gu.uLightDir, light);
    gl.uniform3fv(this.gu.uRestRefract, rest);
    gl.uniform2f(this.gu.uMapRes, mw, mh);
    gl.uniform1f(this.gu.uTime, time);
    gl.uniform1f(this.gu.uWind, wind);
    gl.uniform4fv(this.gu.uWave, WIND_WAVES);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.useProgram(this.sumProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.map.fbo);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.gather.texs[0]);
    gl.uniform1i(this.su.uGatherA, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.gather.texs[1]);
    gl.uniform1i(this.su.uGatherB, 1);
    gl.uniform2f(this.su.uMapRes, mw, mh);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
    gl.enable(gl.DEPTH_TEST);
    gl.activeTexture(gl.TEXTURE0);
  }
}
