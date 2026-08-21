import { compile, makeFloatTarget } from './gl.js';
import { SPLAT_VS, SPLAT_FS } from './shaders.js';

export class Accumulator {
  constructor(gl, width, height) {
    this.gl = gl;
    this.width = width;
    this.height = height;
    this.prog = compile(gl, SPLAT_VS, SPLAT_FS);
    this.uResolution = gl.getUniformLocation(this.prog, 'uResolution');
    this.target = makeFloatTarget(gl, width, height);

    this.vao = gl.createVertexArray();
    this.buf = gl.createBuffer();
    this.capacityFloats = 0;
    this._ensureCapacity(1 << 16);

    this.totalSplats = 0;
    this.clear();
  }

  _ensureCapacity(floats) {
    const gl = this.gl;
    if (floats <= this.capacityFloats) return;
    this.capacityFloats = Math.max(floats, this.capacityFloats * 2);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.capacityFloats * 4, gl.DYNAMIC_DRAW);
    const stride = 5 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 2 * 4);
    gl.bindVertexArray(null);
  }

  clear() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.totalSplats = 0;
  }

  add(splats) {
    if (splats.length === 0) return;
    const gl = this.gl;
    const nSplats = splats.length / 5;
    this._ensureCapacity(splats.length);

    gl.useProgram(this.prog);
    gl.uniform2f(this.uResolution, this.width, this.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target.fbo);
    gl.viewport(0, 0, this.width, this.height);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, splats);
    gl.drawArrays(gl.POINTS, 0, nSplats);

    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.totalSplats += nSplats;
  }

  get hdrTexture() { return this.target.tex; }
}
