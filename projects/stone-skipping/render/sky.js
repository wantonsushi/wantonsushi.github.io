import { compile, makeFullscreenVAO, uniforms } from '../gl.js';
import { FULLSCREEN_VS, SKY_FS } from './shaders.js';

export class Sky {
  constructor(gl) {
    this.gl = gl;
    this.prog = compile(gl, FULLSCREEN_VS, SKY_FS);
    this.vao = makeFullscreenVAO(gl);
    this.u = uniforms(gl, this.prog, ['uInvVP', 'uSunDir', 'uTime']);
  }

  draw(invVP, sunDir, time) {
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
    gl.uniformMatrix4fv(this.u.uInvVP, false, invVP);
    gl.uniform3fv(this.u.uSunDir, sunDir);
    gl.uniform1f(this.u.uTime, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.bindVertexArray(null);
  }
}
