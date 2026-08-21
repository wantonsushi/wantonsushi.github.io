import { makeDataTexture } from '../scene/pond.js';

const G = 9.81;
const SUBSTEP_DT = 1 / 120;
const MIN_DEPTH = 0.25;
const SPEED_SCALE = 1.5;
const MAX_COEFF = 0.25;
const SHORE_SKIN = 2.0;
const SHORE_ABSORB = 0.94;
const SPLAT_FALLOFF = 3.0;

export class Water {
  constructor(gl, pond, { worldSize, damping = 0.998 } = {}) {
    this.gl = gl;
    this.worldSize = worldSize;
    this.worldMin = [-worldSize[0] / 2, -worldSize[1] / 2];
    this.heightScale = 12.0;
    this.damping = damping;

    const field = pond.bakeField(gl, this.worldMin, worldSize);
    this.field = field.texture;
    this.dist = field.distance;
    this.nx = field.nx;
    this.nz = field.nz;
    this.cell = [worldSize[0] / this.nx, worldSize[1] / this.nz];

    const cellSize = 0.5 * (this.cell[0] + this.cell[1]);
    const n = this.nx * this.nz;
    this.coeff = new Float32Array(n);
    this.waveSpeed = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const c = SPEED_SCALE * Math.sqrt(G * Math.max(field.depth[k], MIN_DEPTH));
      this.waveSpeed[k] = c;
      const step = c * SUBSTEP_DT / cellSize;
      this.coeff[k] = Math.min(MAX_COEFF, 0.5 * step * step);
    }

    this.h = new Float32Array(n);
    this.hPrev = new Float32Array(n);
    this.hNext = new Float32Array(n);
    this.heightTex = makeDataTexture(gl, gl.R16F, gl.RED, this.nx, this.nz, this.h);
  }

  worldToUV(wx, wy) {
    return [(wx - this.worldMin[0]) / this.worldSize[0],
            (wy - this.worldMin[1]) / this.worldSize[1]];
  }

  deposit(wx, wy, radius, dp) {
    const amp = Math.min(0.09, Math.abs(dp) * 0.027 + 0.007);
    const r = Math.max(radius * 3, 0.35);
    const [u, v] = this.worldToUV(wx, wy);
    const cx = u * (this.nx - 1), cy = v * (this.nz - 1);
    const rx = Math.max(1, r / this.cell[0]), ry = Math.max(1, r / this.cell[1]);
    const i0 = Math.max(0, Math.floor(cx - rx)), i1 = Math.min(this.nx - 1, Math.ceil(cx + rx));
    const j0 = Math.max(0, Math.floor(cy - ry)), j1 = Math.min(this.nz - 1, Math.ceil(cy + ry));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = (i - cx) / rx, dy = (j - cy) / ry;
        const d2 = dx * dx + dy * dy;
        if (d2 > 1) continue;
        const crater = amp * Math.exp(-d2 * SPLAT_FALLOFF);
        const k = j * this.nx + i;
        this.h[k] -= crater;
        this.hPrev[k] -= crater;
      }
    }
    if (this.onSplash) this.onSplash(wx, wy, Math.abs(dp));
  }

  sampleHeight(wx, wy) {
    const { nx, nz, h } = this;
    const [u, v] = this.worldToUV(wx, wy);
    if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
    const fx = u * (nx - 1), fy = v * (nz - 1);
    const i = Math.floor(fx), j = Math.floor(fy);
    const tx = fx - i, ty = fy - j;
    const i1 = Math.min(nx - 1, i + 1), j1 = Math.min(nz - 1, j + 1);
    const a = h[j * nx + i], b = h[j * nx + i1];
    const c = h[j1 * nx + i], d = h[j1 * nx + i1];
    return ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty) * this.heightScale;
  }

  step(subSteps = 1) {
    for (let s = 0; s < subSteps; s++) this._advance();
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.heightTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.nx, this.nz, gl.RED, gl.FLOAT, this.h);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  _advance() {
    const { nx, nz, h, hPrev, hNext, dist, coeff } = this;
    const damp = this.damping;
    for (let j = 1; j < nz - 1; j++) {
      const row = j * nx;
      for (let i = 1; i < nx - 1; i++) {
        const k = row + i;
        const d = dist[k];
        if (d >= 0) { hNext[k] = 0; continue; }
        const lap =
          h[k - 1] + h[k + 1] + h[k - nx] + h[k + nx] +
          0.5 * (h[k - nx - 1] + h[k - nx + 1] + h[k + nx - 1] + h[k + nx + 1]) -
          6 * h[k];
        const skin = Math.min(1, -d / SHORE_SKIN);
        hNext[k] = (2 * h[k] - hPrev[k] + coeff[k] * lap) * damp * (SHORE_ABSORB + (1 - SHORE_ABSORB) * skin);
      }
    }
    this.hPrev = h;
    this.h = hNext;
    this.hNext = hPrev;
  }

  reset() {
    this.h.fill(0);
    this.hPrev.fill(0);
    this.hNext.fill(0);
  }
}
