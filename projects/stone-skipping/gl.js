export function getGL(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: false });
  if (!gl) throw new Error('WebGL2 is not available in this browser.');
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

export function uniforms(gl, prog, names) {
  const u = {};
  for (const name of names) u[name] = gl.getUniformLocation(prog, name);
  return u;
}

export function makeVAO(gl, attribs, index) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buffers = {};
  const shared = new Map();
  let previous = null;
  for (const a of attribs) {
    const source = a.data ?? a.bytes;
    let buf = source === undefined ? previous : shared.get(source);
    if (!buf) {
      buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, source, a.usage ?? gl.STATIC_DRAW);
      if (ArrayBuffer.isView(source)) shared.set(source, buf);
    } else {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    }
    previous = buf;
    gl.enableVertexAttribArray(a.loc);
    gl.vertexAttribPointer(a.loc, a.size, gl.FLOAT, false, (a.stride ?? 0) * 4, (a.offset ?? 0) * 4);
    if (a.divisor) gl.vertexAttribDivisor(a.loc, a.divisor);
    if (a.name) buffers[a.name] = buf;
  }
  let count = 0, type = gl.UNSIGNED_SHORT;
  if (index) {
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);
    count = index.length;
    type = index instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
  }
  gl.bindVertexArray(null);
  return { vao, count, type, buffers };
}

export function makeSceneTarget(gl) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const depth = gl.createRenderbuffer();
  const fbo = gl.createFramebuffer();
  const target = {
    tex, fbo, width: 0, height: 0,
    resize(width, height) {
      if (width === this.width && height === this.height) return;
      this.width = width; this.height = height;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },
  };
  return target;
}

export function makeFullscreenVAO(gl) {
  return makeVAO(gl, [{ loc: 0, size: 2, data: new Float32Array([-1, -1, 3, -1, -1, 3]) }]).vao;
}
