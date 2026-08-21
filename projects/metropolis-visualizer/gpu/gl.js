export function getGL(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false });
  if (!gl) throw new Error('WebGL2 is not available in this browser.');
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('EXT_color_buffer_float is unavailable (HDR accumulation needs it).');
  }
  gl.canBlendFloat32 = !!gl.getExtension('EXT_float_blend');
  return gl;
}

export function compile(gl, vsSrc, fsSrc) {
  const make = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(`shader compile error:\n${gl.getShaderInfoLog(sh)}\n--- source ---\n${src}`);
    }
    return sh;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, make(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(prog, make(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`program link error:\n${gl.getProgramInfoLog(prog)}`);
  }
  return prog;
}

export function makeFloatTarget(gl, width, height) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const internalFormat = gl.canBlendFloat32 ? gl.RGBA32F : gl.RGBA16F;
  const type = gl.canBlendFloat32 ? gl.FLOAT : gl.HALF_FLOAT;
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fbo, width, height };
}

export function makeFullscreenVAO(gl) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return vao;
}
