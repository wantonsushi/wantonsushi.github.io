import { compile, makeVAO, uniforms } from '../gl.js';
import { STONE_VS, STONE_FS, TRAIL_VS, TRAIL_FS } from './shaders.js';
import { buildDisk } from './primitives.js';
import { stoneModel, normalMat3 } from '../mat.js';
import { stoneWorld, stoneNormal, historyAt, HEADING } from '../physics/stone.js';

const VIS = 4;

export class StoneRender {
  constructor(gl) {
    this.gl = gl;
    this.prog = compile(gl, STONE_VS, STONE_FS);
    this.trailProg = compile(gl, TRAIL_VS, TRAIL_FS);

    const m = buildDisk(28);
    this.mesh = makeVAO(gl, [
      { loc: 0, size: 3, data: m.position },
      { loc: 1, size: 3, data: m.normal },
    ], m.index);

    this.u = uniforms(gl, this.prog,
      ['uViewProj', 'uModel', 'uNormalMat', 'uSunDir', 'uCamPos', 'uAlbedo', 'uPhi']);
    this.tu = uniforms(gl, this.trailProg, ['uViewProj', 'uColor']);

    this.trail = makeVAO(gl, [{ loc: 0, size: 3, name: 'pos', bytes: 0, usage: gl.DYNAMIC_DRAW }]);
    this.trailData = new Float32Array(0);
  }

  draw(viewProj, camPos, sunDir, stones, showTrails) {
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.mesh.vao);
    gl.uniformMatrix4fv(this.u.uViewProj, false, viewProj);
    gl.uniform3fv(this.u.uSunDir, sunDir);
    gl.uniform3fv(this.u.uCamPos, camPos);
    gl.uniform3f(this.u.uAlbedo, 0.52, 0.51, 0.49);
    for (const st of stones) {
      if (!st.alive) continue;
      const model = stoneModel(stoneWorld(st), stoneNormal(st), HEADING, st.R * VIS, st.halfThick * VIS);
      gl.uniformMatrix4fv(this.u.uModel, false, model);
      gl.uniformMatrix3fv(this.u.uNormalMat, false, normalMat3(model));
      gl.uniform1f(this.u.uPhi, st.phi);
      gl.drawElements(gl.TRIANGLES, this.mesh.count, this.mesh.type, 0);
    }
    gl.bindVertexArray(null);
    if (showTrails) this._drawTrails(viewProj, stones);
  }

  _drawTrails(viewProj, stones) {
    const gl = this.gl;
    gl.useProgram(this.trailProg);
    gl.bindVertexArray(this.trail.vao);
    gl.uniformMatrix4fv(this.tu.uViewProj, false, viewProj);
    gl.uniform4f(this.tu.uColor, 0.85, 0.45, 0.2, 1.0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.trail.buffers.pos);
    for (const st of stones) {
      const n = st.historyCount;
      if (n < 2) continue;
      if (this.trailData.length < n * 3) this.trailData = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const [x, y] = historyAt(st, i);
        this.trailData[i * 3] = HEADING[0] * x;
        this.trailData[i * 3 + 1] = y;
        this.trailData[i * 3 + 2] = HEADING[2] * x;
      }
      gl.bufferData(gl.ARRAY_BUFFER, this.trailData.subarray(0, n * 3), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.LINE_STRIP, 0, n);
    }
    gl.bindVertexArray(null);
  }
}
