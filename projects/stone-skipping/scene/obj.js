async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`cannot load ${url}: ${res.status} ${res.statusText}`);
  return res.text();
}

function parseMTL(text) {
  const mats = new Map();
  let cur = null;
  for (const line of text.split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'newmtl') mats.set((cur = p[1]), [0.8, 0.8, 0.8]);
    else if (p[0] === 'Kd' && cur) mats.set(cur, [+p[1], +p[2], +p[3]]);
  }
  return mats;
}

const deref = (token, count) => {
  const i = parseInt(token, 10);
  return i < 0 ? count + i : i - 1;
};

export async function loadOBJ(url) {
  const text = await fetchText(url);
  const lib = text.match(/^\s*mtllib\s+(\S+)/m);
  const base = url.slice(0, url.lastIndexOf('/') + 1);
  const mats = lib ? parseMTL(await fetchText(base + lib[1])) : new Map();

  const V = [], N = [];
  const pos = [], nrm = [], col = [], index = [];
  const unique = new Map();
  let albedo = [0.8, 0.8, 0.8];
  let albedoKey = '';

  const emit = (token) => {
    const key = `${token}|${albedoKey}`;
    const hit = unique.get(key);
    if (hit !== undefined) return hit;
    const [vt, , nt] = token.split('/');
    const vi = deref(vt, V.length / 3);
    pos.push(V[vi * 3], V[vi * 3 + 1], V[vi * 3 + 2]);
    if (nt) {
      const ni = deref(nt, N.length / 3);
      nrm.push(N[ni * 3], N[ni * 3 + 1], N[ni * 3 + 2]);
    } else {
      nrm.push(0, 0, 0);
    }
    col.push(albedo[0], albedo[1], albedo[2]);
    const id = pos.length / 3 - 1;
    unique.set(key, id);
    return id;
  };

  for (const line of text.split('\n')) {
    const p = line.trim().split(/\s+/);
    switch (p[0]) {
      case 'v': V.push(+p[1], +p[2], +p[3]); break;
      case 'vn': N.push(+p[1], +p[2], +p[3]); break;
      case 'usemtl':
        albedoKey = p[1];
        albedo = mats.get(p[1]) || albedo;
        break;
      case 'f': {
        const fan = p.slice(1).map(emit);
        for (let i = 1; i < fan.length - 1; i++) index.push(fan[0], fan[i], fan[i + 1]);
        break;
      }
    }
  }

  const position = new Float32Array(pos);
  const normal = new Float32Array(nrm);
  if (N.length === 0) faceNormals(position, index, normal);

  let maxY = 0;
  for (let i = 1; i < position.length; i += 3) maxY = Math.max(maxY, position[i]);
  const sway = new Float32Array(position.length / 3);
  for (let i = 0; i < sway.length; i++) {
    sway[i] = maxY > 0 ? Math.pow(Math.max(0, position[i * 3 + 1]) / maxY, 1.5) : 0;
  }

  return {
    position,
    normal,
    color: new Float32Array(col),
    sway,
    index: new Uint16Array(index),
  };
}

function faceNormals(position, index, out) {
  for (let f = 0; f < index.length; f += 3) {
    const a = index[f] * 3, b = index[f + 1] * 3, c = index[f + 2] * 3;
    const ux = position[b] - position[a], uy = position[b + 1] - position[a + 1], uz = position[b + 2] - position[a + 2];
    const wx = position[c] - position[a], wy = position[c + 1] - position[a + 1], wz = position[c + 2] - position[a + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const L = Math.hypot(nx, ny, nz) || 1;
    for (const v of [a, b, c]) {
      out[v] += nx / L; out[v + 1] += ny / L; out[v + 2] += nz / L;
    }
  }
  for (let i = 0; i < out.length; i += 3) {
    const L = Math.hypot(out[i], out[i + 1], out[i + 2]) || 1;
    out[i] /= L; out[i + 1] /= L; out[i + 2] /= L;
  }
}
