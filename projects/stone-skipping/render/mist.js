import { compile, makeVAO, uniforms } from '../gl.js';
import { MIST_VS, MIST_FS } from './shaders.js';

const MAX = 600;
const STRIDE = 5;
const GRAVITY = 9.0;
const DRAG = 1.6;

export class Mist {
  constructor(gl) {
    this.gl = gl;
    this.prog = compile(gl, MIST_VS, MIST_FS);
    this.u = uniforms(gl, this.prog, ['uViewProj', 'uPixelScale', 'uColor']);

    this.px = new Float32Array(MAX); this.py = new Float32Array(MAX); this.pz = new Float32Array(MAX);
    this.vx = new Float32Array(MAX); this.vy = new Float32Array(MAX); this.vz = new Float32Array(MAX);
    this.age = new Float32Array(MAX);
    this.ttl = new Float32Array(MAX);
    this.size = new Float32Array(MAX);
    this.head = 0;
    this.gpu = new Float32Array(MAX * STRIDE);

    this.mesh = makeVAO(gl, [
      { loc: 0, size: 3, name: 'p', bytes: this.gpu.byteLength, usage: gl.DYNAMIC_DRAW, stride: STRIDE, offset: 0 },
      { loc: 1, size: 2, name: 'p', stride: STRIDE, offset: 3 },
    ]);
  }

  spawn(x, y, z, strength) {
    const s = Math.max(0, Math.min(1, strength));
    const count = Math.round(3 + s * 9);
    const up = 1.4 + s * 3.4;
    for (let k = 0; k < count; k++) {
      const i = this.head;
      this.head = (this.head + 1) % MAX;
      const a = Math.random() * Math.PI * 2;
      const rad = 0.3 + Math.random() * 0.7;
      this.px[i] = x + Math.cos(a) * rad * 0.15;
      this.py[i] = y + 0.02;
      this.pz[i] = z + Math.sin(a) * rad * 0.15;
      this.vx[i] = Math.cos(a) * rad * (0.6 + s);
      this.vy[i] = up * (0.6 + Math.random() * 0.7);
      this.vz[i] = Math.sin(a) * rad * (0.6 + s);
      this.age[i] = 0;
      this.ttl[i] = 0.5 + Math.random() * 0.7;
      this.size[i] = 18 + Math.random() * 26;
    }
  }

  update(dt) {
    if (dt <= 0) return;
    const drag = Math.exp(-DRAG * dt);
    for (let i = 0; i < MAX; i++) {
      if (this.ttl[i] <= 0) continue;
      this.age[i] += dt;
      if (this.age[i] >= this.ttl[i]) { this.ttl[i] = 0; continue; }
      this.vy[i] -= GRAVITY * dt;
      this.vx[i] *= drag; this.vy[i] *= drag; this.vz[i] *= drag;
      this.vx[i] += 0.25 * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < 0) { this.py[i] = 0; this.vy[i] *= -0.2; }
    }
  }

  draw(viewProj, canvasHeight) {
    const gl = this.gl;
    const out = this.gpu;
    let n = 0;
    for (let i = 0; i < MAX; i++) {
      if (this.ttl[i] <= 0) continue;
      const o = n * STRIDE;
      out[o] = this.px[i]; out[o + 1] = this.py[i]; out[o + 2] = this.pz[i];
      out[o + 3] = 1 - this.age[i] / this.ttl[i];
      out[o + 4] = this.size[i];
      n++;
    }
    if (n === 0) return;

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.mesh.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.mesh.buffers.p);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, out.subarray(0, n * STRIDE));
    gl.uniformMatrix4fv(this.u.uViewProj, false, viewProj);
    gl.uniform1f(this.u.uPixelScale, canvasHeight * 0.0016);
    gl.uniform3f(this.u.uColor, 0.92, 0.95, 1.0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    gl.drawArrays(gl.POINTS, 0, n);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }
}
