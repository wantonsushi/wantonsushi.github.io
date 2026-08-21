import { compile, makeVAO, uniforms } from '../gl.js';
import { WATER_VS, WATER_FS } from './shaders.js';
import { WIND_WAVES } from './wind.js';

const EXTINCTION = [0.42, 0.10, 0.09];
export const SCATTER_COLOR = [0.05, 0.12, 0.14];
const REFRACTION_STRENGTH = 0.05;
const REFLECTION_STRENGTH = 0.028;

export class WaterRender {
  constructor(gl, water, { dim = 256 } = {}) {
    this.gl = gl;
    this.water = water;
    this.prog = compile(gl, WATER_VS, WATER_FS);
    this.wind = 1.0;

    const min = water.worldMin, size = water.worldSize;
    const verts = new Float32Array(dim * dim * 2);
    for (let j = 0; j < dim; j++) {
      for (let i = 0; i < dim; i++) {
        const k = (j * dim + i) * 2;
        verts[k] = min[0] + (i / (dim - 1)) * size[0];
        verts[k + 1] = min[1] + (j / (dim - 1)) * size[1];
      }
    }
    const index = new Uint32Array((dim - 1) * (dim - 1) * 6);
    let w = 0;
    for (let j = 0; j < dim - 1; j++) {
      for (let i = 0; i < dim - 1; i++) {
        const a = j * dim + i, b = a + 1, c = a + dim, d = c + 1;
        index[w++] = a; index[w++] = c; index[w++] = b;
        index[w++] = b; index[w++] = c; index[w++] = d;
      }
    }
    this.mesh = makeVAO(gl, [{ loc: 0, size: 2, data: verts }], index);

    this.u = uniforms(gl, this.prog, [
      'uViewProj', 'uHeight', 'uField', 'uRefraction', 'uReflection', 'uWorldMin', 'uWorldSize',
      'uHeightScale', 'uHeightTexel', 'uCellSize', 'uCamPos', 'uSunDir', 'uTime', 'uWind', 'uWave',
      'uExtinction', 'uScatterColor', 'uRefractionStrength', 'uReflectionStrength',
    ]);
  }

  draw(viewProj, camPos, sunDir, time, refractionTex, reflectionTex) {
    const gl = this.gl, w = this.water;
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.mesh.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, w.heightTex);
    gl.uniform1i(this.u.uHeight, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, w.field);
    gl.uniform1i(this.u.uField, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, refractionTex);
    gl.uniform1i(this.u.uRefraction, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, reflectionTex);
    gl.uniform1i(this.u.uReflection, 3);

    gl.uniformMatrix4fv(this.u.uViewProj, false, viewProj);
    gl.uniform2f(this.u.uWorldMin, w.worldMin[0], w.worldMin[1]);
    gl.uniform2f(this.u.uWorldSize, w.worldSize[0], w.worldSize[1]);
    gl.uniform1f(this.u.uHeightScale, w.heightScale);
    gl.uniform2f(this.u.uHeightTexel, 1 / w.nx, 1 / w.nz);
    gl.uniform2f(this.u.uCellSize, w.cell[0], w.cell[1]);
    gl.uniform3fv(this.u.uCamPos, camPos);
    gl.uniform3fv(this.u.uSunDir, sunDir);
    gl.uniform3fv(this.u.uExtinction, EXTINCTION);
    gl.uniform3fv(this.u.uScatterColor, SCATTER_COLOR);
    gl.uniform1f(this.u.uTime, time);
    gl.uniform1f(this.u.uWind, this.wind);
    gl.uniform4fv(this.u.uWave, WIND_WAVES);
    gl.uniform1f(this.u.uRefractionStrength, REFRACTION_STRENGTH);
    gl.uniform1f(this.u.uReflectionStrength, REFLECTION_STRENGTH);

    gl.drawElements(gl.TRIANGLES, this.mesh.count, this.mesh.type, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
  }
}
