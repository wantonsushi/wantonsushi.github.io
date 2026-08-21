export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CANDIDATES = 30;
const SEED_ATTEMPTS = 400;

export function poissonDisk(bounds, radius, accept, rand) {
  const cell = radius / Math.SQRT2;
  const cols = Math.ceil((bounds.maxX - bounds.minX) / cell);
  const rows = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
  const grid = new Int32Array(cols * rows).fill(-1);
  const xs = [], zs = [];
  const active = [];

  const col = (x) => Math.floor((x - bounds.minX) / cell);
  const row = (z) => Math.floor((z - bounds.minZ) / cell);

  const free = (x, z) => {
    const c = col(x), r = row(z);
    if (c < 0 || r < 0 || c >= cols || r >= rows) return false;
    const c0 = Math.max(0, c - 2), c1 = Math.min(cols - 1, c + 2);
    const r0 = Math.max(0, r - 2), r1 = Math.min(rows - 1, r + 2);
    for (let j = r0; j <= r1; j++) {
      for (let i = c0; i <= c1; i++) {
        const s = grid[j * cols + i];
        if (s >= 0 && Math.hypot(xs[s] - x, zs[s] - z) < radius) return false;
      }
    }
    return true;
  };

  const add = (x, z) => {
    grid[row(z) * cols + col(x)] = xs.length;
    xs.push(x); zs.push(z);
    active.push(xs.length - 1);
  };

  let starved = 0;
  while (starved < SEED_ATTEMPTS) {
    const x = bounds.minX + rand() * (bounds.maxX - bounds.minX);
    const z = bounds.minZ + rand() * (bounds.maxZ - bounds.minZ);
    if (!accept(x, z) || !free(x, z)) { starved++; continue; }
    starved = 0;
    add(x, z);
    while (active.length) {
      const pick = (rand() * active.length) | 0;
      const s = active[pick];
      let placed = false;
      for (let n = 0; n < CANDIDATES; n++) {
        const a = rand() * Math.PI * 2;
        const r = radius * (1 + rand());
        const cx = xs[s] + Math.cos(a) * r;
        const cz = zs[s] + Math.sin(a) * r;
        if (!accept(cx, cz) || !free(cx, cz)) continue;
        add(cx, cz);
        placed = true;
        break;
      }
      if (!placed) { active[pick] = active[active.length - 1]; active.pop(); }
    }
  }

  return { x: Float64Array.from(xs), z: Float64Array.from(zs), count: xs.length };
}

const MEMBER_TRIES = 8;

export function clusteredDisk(bounds, cluster, accept, rand) {
  const centres = poissonDisk(bounds, cluster.spacing, accept, rand);
  const [lo, hi] = cluster.count;
  const xs = [], zs = [];
  for (let c = 0; c < centres.count; c++) {
    const members = lo + Math.floor(rand() * (hi - lo + 1));
    for (let m = 0; m < members; m++) {
      for (let attempt = 0; attempt < MEMBER_TRIES; attempt++) {
        const a = rand() * Math.PI * 2;
        const r = cluster.radius * Math.sqrt(rand());
        const x = centres.x[c] + Math.cos(a) * r;
        const z = centres.z[c] + Math.sin(a) * r;
        if (!accept(x, z)) continue;
        xs.push(x); zs.push(z);
        break;
      }
    }
  }
  return { x: Float64Array.from(xs), z: Float64Array.from(zs), count: xs.length };
}
