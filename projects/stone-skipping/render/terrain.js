import { compile, makeVAO, uniforms } from '../gl.js';
import { TERRAIN_VS, TERRAIN_FS } from './shaders.js';
import { norm3 } from '../mat.js';

const COLS = 160, ROWS = 220;

const BED_DEEP = [0.40, 0.39, 0.30];
const BED_SHALLOW = [0.56, 0.50, 0.36];
const SAND_WET = [0.48, 0.42, 0.31];
const SAND_DRY = [0.66, 0.58, 0.43];
const GRASS = [0.32, 0.45, 0.22];

const mix3 = (a, b, t) => {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
};

function groundColor(d, depth) {
  if (d < 0) return mix3(BED_SHALLOW, BED_DEEP, depth / 2.2);
  if (d < 2.2) return mix3(SAND_WET, SAND_DRY, d / 2.2);
  return mix3(SAND_DRY, GRASS, (d - 2.2) / 6.0);
}

export class Terrain {
  constructor(gl, pond) {
    this.gl = gl;
    this.prog = compile(gl, TERRAIN_VS, TERRAIN_FS);

    const { minX, maxX, minZ, maxZ } = pond.extent;
    const dx = (maxX - minX) / COLS, dz = (maxZ - minZ) / ROWS;
    const cols = COLS + 1, rows = ROWS + 1;
    const height = new Float32Array(cols * rows);
    const dist = new Float32Array(cols * rows);

    for (let j = 0; j < rows; j++) {
      const z = minZ + j * dz;
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        const d = pond.distance(minX + i * dx, z);
        dist[k] = d;
        height[k] = pond.groundY(minX + i * dx, z, d);
      }
    }

    const position = new Float32Array(cols * rows * 3);
    const normal = new Float32Array(cols * rows * 3);
    const color = new Float32Array(cols * rows * 3);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i, o = k * 3;
        const hl = height[j * cols + Math.max(0, i - 1)];
        const hr = height[j * cols + Math.min(COLS, i + 1)];
        const hd = height[Math.max(0, j - 1) * cols + i];
        const hu = height[Math.min(ROWS, j + 1) * cols + i];
        const n = norm3([-(hr - hl) / (2 * dx), 1, -(hu - hd) / (2 * dz)]);
        const c = groundColor(dist[k], -height[k]);
        position[o] = minX + i * dx; position[o + 1] = height[k]; position[o + 2] = minZ + j * dz;
        normal[o] = n[0]; normal[o + 1] = n[1]; normal[o + 2] = n[2];
        color[o] = c[0]; color[o + 1] = c[1]; color[o + 2] = c[2];
      }
    }

    const index = new Uint32Array(COLS * ROWS * 6);
    let w = 0;
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
        index[w++] = a; index[w++] = c; index[w++] = b;
        index[w++] = b; index[w++] = c; index[w++] = d;
      }
    }

    this.mesh = makeVAO(gl, [
      { loc: 0, size: 3, data: position },
      { loc: 1, size: 3, data: normal },
      { loc: 2, size: 3, data: color },
    ], index);
    this.u = uniforms(gl, this.prog, ['uViewProj', 'uSunDir', 'uClipY', 'uClipSign',
      'uCaustics', 'uSunDirWater', 'uCausticMin', 'uCausticSize', 'uCausticStrength']);
  }

  draw(viewProj, sunDir, clip, caustics) {
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.mesh.vao);
    gl.uniformMatrix4fv(this.u.uViewProj, false, viewProj);
    gl.uniform3fv(this.u.uSunDir, sunDir);
    gl.uniform1f(this.u.uClipY, clip.y);
    gl.uniform1f(this.u.uClipSign, clip.sign);
    caustics.bind(this.u, 0);
    gl.drawElements(gl.TRIANGLES, this.mesh.count, this.mesh.type, 0);
    gl.bindVertexArray(null);
  }
}
