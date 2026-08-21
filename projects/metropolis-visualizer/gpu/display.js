import { compile, makeFullscreenVAO } from './gl.js';
import { DISPLAY_VS, DISPLAY_FS } from './shaders.js';

export class Display {
  constructor(gl) {
    this.gl = gl;
    this.prog = compile(gl, DISPLAY_VS, DISPLAY_FS);
    this.uHDR = gl.getUniformLocation(this.prog, 'uHDR');
    this.uDirect = gl.getUniformLocation(this.prog, 'uDirect');
    this.uNorm = gl.getUniformLocation(this.prog, 'uNorm');
    this.uExposure = gl.getUniformLocation(this.prog, 'uExposure');
    this.vao = makeFullscreenVAO(gl);
    this.directTex = null;
  }

  setDirectImage(rgb, width, height) {
    const gl = this.gl;
    if (!this.directTex) this.directTex = gl.createTexture();
    const rgba = new Float32Array(width * height * 4);
    for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
      rgba[j] = rgb[i]; rgba[j + 1] = rgb[i + 1]; rgba[j + 2] = rgb[i + 2]; rgba[j + 3] = 1;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.directTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, rgba);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  draw(hdrTexture, norm, exposure, canvasWidth, canvasHeight) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvasWidth, canvasHeight);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, hdrTexture);
    gl.uniform1i(this.uHDR, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.directTex);
    gl.uniform1i(this.uDirect, 1);
    gl.uniform1f(this.uNorm, norm);
    gl.uniform1f(this.uExposure, exposure);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }
}
