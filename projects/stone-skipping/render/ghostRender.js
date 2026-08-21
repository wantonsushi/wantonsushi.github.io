import { compile, makeVAO, uniforms } from '../gl.js';
import { GHOST_VS, GHOST_FS } from './shaders.js';
import { buildDisk, buildArrow } from './primitives.js';
import { stoneModel, directionMatrix, normalMat3 } from '../mat.js';
import { HEADING } from '../physics/stone.js';

const VIS = 7;

const upload = (gl, m) => makeVAO(gl, [
  { loc: 0, size: 3, data: m.position },
  { loc: 1, size: 3, data: m.normal },
], m.index);

export class GhostRender {
  constructor(gl) {
    this.gl = gl;
    this.prog = compile(gl, GHOST_VS, GHOST_FS);
    this.disk = upload(gl, buildDisk(24));
    this.arrow = upload(gl, buildArrow());
    this.u = uniforms(gl, this.prog, ['uViewProj', 'uModel', 'uNormalMat', 'uSunDir', 'uColor']);
  }

  draw(viewProj, sunDir, ghost) {
    if (!ghost) return;
    const gl = this.gl;
    const startX = ghost.startX || 0;
    const world = [HEADING[0] * startX, ghost.startHeight, HEADING[2] * startX];
    const normal = [0, Math.cos(ghost.theta), Math.sin(ghost.theta)];

    const cb = Math.cos(ghost.beta), sb = Math.sin(ghost.beta);
    const parts = [
      [this.arrow, directionMatrix(world, [0, -1, 0], Math.max(0.001, ghost.startHeight), 0.5),
        [0.85, 0.90, 0.98, 0.35]],
      [this.disk, stoneModel(world, normal, HEADING, ghost.radius * VIS, ghost.radius * 0.08 * VIS),
        [0.80, 0.86, 0.95, 0.5]],
      [this.arrow, directionMatrix(world, [HEADING[0] * cb, -sb, HEADING[2] * cb], 0.6 + ghost.speed * 0.22, 1.6),
        [0.98, 0.58, 0.16, 0.5]],
    ];

    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.u.uViewProj, false, viewProj);
    gl.uniform3fv(this.u.uSunDir, sunDir);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    for (const [mesh, model, color] of parts) {
      gl.bindVertexArray(mesh.vao);
      gl.uniformMatrix4fv(this.u.uModel, false, model);
      gl.uniformMatrix3fv(this.u.uNormalMat, false, normalMat3(model));
      gl.uniform4fv(this.u.uColor, color);
      gl.drawElements(gl.TRIANGLES, mesh.count, mesh.type, 0);
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }
}
