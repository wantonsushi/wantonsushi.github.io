const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

function hash2(x, y) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

function valueNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
}

function fbm(x, y, octaves = 3) {
  let v = 0, amp = 0.5, fx = x, fy = y, norm = 0;
  for (let i = 0; i < octaves; i++) {
    v += amp * valueNoise(fx, fy);
    norm += amp;
    fx *= 2.03; fy *= 2.03; amp *= 0.5;
  }
  return v / norm * 2 - 1;
}

export class Pond {
  static async load(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`cannot load ${url}: ${res.status} ${res.statusText}`);
    return new Pond(await res.json());
  }

  constructor(doc) {
    const pts = doc.outline;
    this.n = pts.length;
    this.vx = new Float64Array(this.n);
    this.vz = new Float64Array(this.n);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < this.n; i++) {
      const [x, z] = pts[i];
      this.vx[i] = x; this.vz[i] = z;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    this.bounds = { minX, maxX, minZ, maxZ };
    this.bathymetry = doc.bathymetry;
    this.shore = doc.shore;
    this.props = doc.props;
    this.grid = doc.grid;

    const reach = this.shore.bankWidth + this.shore.margin;
    this.extent = {
      minX: minX - reach, maxX: maxX + reach,
      minZ: minZ - reach, maxZ: maxZ + reach,
    };
  }

  distance(x, z) {
    const { vx, vz, n } = this;
    let best = Infinity, sign = 1;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ix = vx[i], iz = vz[i];
      const ex = vx[j] - ix, ez = vz[j] - iz;
      const wx = x - ix, wz = z - iz;
      const t = clamp((wx * ex + wz * ez) / (ex * ex + ez * ez), 0, 1);
      const bx = wx - ex * t, bz = wz - ez * t;
      const d2 = bx * bx + bz * bz;
      if (d2 < best) best = d2;
      const c1 = z >= iz, c2 = z < vz[j], c3 = ex * wz > ez * wx;
      if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) sign = -sign;
    }
    return sign * Math.sqrt(best);
  }

  groundY(x, z, d = this.distance(x, z)) {
    if (d < 0) return -this.bathymetry.maxDepth * smoothstep(0, this.bathymetry.shelfWidth, -d);
    const { bankWidth, bankHeight, bankCurve, hillAmplitude, hillFrequency } = this.shore;
    const t = clamp(d / bankWidth, 0, 1);
    const hills = fbm(x * hillFrequency, z * hillFrequency) * hillAmplitude * t;
    return bankHeight * Math.pow(t, bankCurve) + hills;
  }

  bakeField(gl, worldMin, worldSize) {
    const [nx, nz] = this.grid;
    const distance = new Float32Array(nx * nz);
    const depth = new Float32Array(nx * nz);
    const interleaved = new Float32Array(nx * nz * 2);
    for (let j = 0; j < nz; j++) {
      const z = worldMin[1] + ((j + 0.5) / nz) * worldSize[1];
      for (let i = 0; i < nx; i++) {
        const x = worldMin[0] + ((i + 0.5) / nx) * worldSize[0];
        const k = j * nx + i;
        const d = this.distance(x, z);
        distance[k] = d;
        depth[k] = Math.max(0, -this.groundY(x, z, d));
        interleaved[k * 2] = d;
        interleaved[k * 2 + 1] = depth[k];
      }
    }
    const texture = makeDataTexture(gl, gl.RG16F, gl.RG, nx, nz, interleaved);
    return { distance, depth, texture, nx, nz };
  }
}

export function makeDataTexture(gl, internalFormat, format, width, height, data) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, gl.FLOAT, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}
