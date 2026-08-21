import { vec, sub, cross, dot } from './vec.js';

const EPS = 1e-6;
const NODE_STRIDE = 8;

export class BVH {
  constructor(posA, posB, posC) {
    this.posA = posA;
    this.posB = posB;
    this.posC = posC;
    this.nTri = posA.length / 3;
    this.triIndex = new Int32Array(this.nTri);
    for (let i = 0; i < this.nTri; i++) this.triIndex[i] = i;
    this._build();
  }

  _triBounds(i, out) {
    const a = i * 3;
    out.minx = Math.min(this.posA[a], this.posB[a], this.posC[a]);
    out.miny = Math.min(this.posA[a + 1], this.posB[a + 1], this.posC[a + 1]);
    out.minz = Math.min(this.posA[a + 2], this.posB[a + 2], this.posC[a + 2]);
    out.maxx = Math.max(this.posA[a], this.posB[a], this.posC[a]);
    out.maxy = Math.max(this.posA[a + 1], this.posB[a + 1], this.posC[a + 1]);
    out.maxz = Math.max(this.posA[a + 2], this.posB[a + 2], this.posC[a + 2]);
  }

  _build() {
    const n = this.nTri;
    const cx = new Float32Array(n), cy = new Float32Array(n), cz = new Float32Array(n);
    const b = {};
    for (let i = 0; i < n; i++) {
      this._triBounds(i, b);
      cx[i] = (b.minx + b.maxx) * 0.5;
      cy[i] = (b.miny + b.maxy) * 0.5;
      cz[i] = (b.minz + b.maxz) * 0.5;
    }
    const nodes = new Float32Array((2 * n) * NODE_STRIDE);
    let nodeCount = 0;
    const idx = this.triIndex;

    const computeBounds = (start, count, node) => {
      let minx = Infinity, miny = Infinity, minz = Infinity;
      let maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
      for (let i = start; i < start + count; i++) {
        this._triBounds(idx[i], b);
        if (b.minx < minx) minx = b.minx; if (b.miny < miny) miny = b.miny; if (b.minz < minz) minz = b.minz;
        if (b.maxx > maxx) maxx = b.maxx; if (b.maxy > maxy) maxy = b.maxy; if (b.maxz > maxz) maxz = b.maxz;
      }
      nodes[node] = minx; nodes[node + 1] = miny; nodes[node + 2] = minz;
      nodes[node + 3] = maxx; nodes[node + 4] = maxy; nodes[node + 5] = maxz;
    };

    const stack = [{ start: 0, count: n, nodeIdx: nodeCount++ * NODE_STRIDE }];
    while (stack.length) {
      const { start, count, nodeIdx } = stack.pop();
      computeBounds(start, count, nodeIdx);
      if (count <= 4) {
        nodes[nodeIdx + 6] = start;
        nodes[nodeIdx + 7] = count;
        continue;
      }
      const ex = nodes[nodeIdx + 3] - nodes[nodeIdx];
      const ey = nodes[nodeIdx + 4] - nodes[nodeIdx + 1];
      const ez = nodes[nodeIdx + 5] - nodes[nodeIdx + 2];
      const axis = ex > ey ? (ex > ez ? 0 : 2) : (ey > ez ? 1 : 2);
      const c = axis === 0 ? cx : axis === 1 ? cy : cz;
      const mid = (nodes[nodeIdx + axis] + nodes[nodeIdx + 3 + axis]) * 0.5;
      let i = start, j = start + count - 1;
      while (i <= j) {
        if (c[idx[i]] < mid) i++;
        else { const tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp; j--; }
      }
      let leftCount = i - start;
      if (leftCount === 0 || leftCount === count) leftCount = count >> 1;
      const left = nodeCount++ * NODE_STRIDE;
      const right = nodeCount++ * NODE_STRIDE;
      nodes[nodeIdx + 6] = left;
      nodes[nodeIdx + 7] = 0;
      stack.push({ start, count: leftCount, nodeIdx: left });
      stack.push({ start: start + leftCount, count: count - leftCount, nodeIdx: right });
    }
    this.nodes = nodes.subarray(0, nodeCount * NODE_STRIDE);
  }

  intersect(ox, oy, oz, dx, dy, dz, tMax = Infinity) {
    const invx = 1 / dx, invy = 1 / dy, invz = 1 / dz;
    const nodes = this.nodes, idx = this.triIndex;
    const posA = this.posA, posB = this.posB, posC = this.posC;
    let bestT = tMax, bestTri = -1, bestU = 0, bestV = 0;

    const stack = this._stack || (this._stack = new Int32Array(64));
    let sp = 0;
    stack[sp++] = 0;
    while (sp > 0) {
      const node = stack[--sp];
      let t0 = (nodes[node] - ox) * invx, t1 = (nodes[node + 3] - ox) * invx;
      let tmin = Math.min(t0, t1), tmax = Math.max(t0, t1);
      t0 = (nodes[node + 1] - oy) * invy; t1 = (nodes[node + 4] - oy) * invy;
      tmin = Math.max(tmin, Math.min(t0, t1)); tmax = Math.min(tmax, Math.max(t0, t1));
      t0 = (nodes[node + 2] - oz) * invz; t1 = (nodes[node + 5] - oz) * invz;
      tmin = Math.max(tmin, Math.min(t0, t1)); tmax = Math.min(tmax, Math.max(t0, t1));
      if (tmax < Math.max(tmin, 0) || tmin > bestT) continue;

      const count = nodes[node + 7];
      if (count === 0) {
        const left = nodes[node + 6];
        stack[sp++] = left;
        stack[sp++] = left + NODE_STRIDE;
      } else {
        const start = nodes[node + 6];
        for (let k = start; k < start + count; k++) {
          const tri = idx[k], a = tri * 3;
          const e1x = posB[a] - posA[a], e1y = posB[a + 1] - posA[a + 1], e1z = posB[a + 2] - posA[a + 2];
          const e2x = posC[a] - posA[a], e2y = posC[a + 1] - posA[a + 1], e2z = posC[a + 2] - posA[a + 2];
          const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
          const det = e1x * px + e1y * py + e1z * pz;
          if (det > -EPS && det < EPS) continue;
          const inv = 1 / det;
          const tx = ox - posA[a], ty = oy - posA[a + 1], tz = oz - posA[a + 2];
          const u = (tx * px + ty * py + tz * pz) * inv;
          if (u < 0 || u > 1) continue;
          const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
          const v = (dx * qx + dy * qy + dz * qz) * inv;
          if (v < 0 || u + v > 1) continue;
          const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
          if (t > EPS && t < bestT) { bestT = t; bestTri = tri; bestU = u; bestV = v; }
        }
      }
    }
    return bestTri < 0 ? null : { t: bestT, tri: bestTri, u: bestU, v: bestV };
  }

  triNormal(tri) {
    const a = tri * 3;
    const e1 = sub(vec(this.posB[a], this.posB[a + 1], this.posB[a + 2]),
                   vec(this.posA[a], this.posA[a + 1], this.posA[a + 2]));
    const e2 = sub(vec(this.posC[a], this.posC[a + 1], this.posC[a + 2]),
                   vec(this.posA[a], this.posA[a + 1], this.posA[a + 2]));
    const n = cross(e1, e2);
    const l = Math.sqrt(dot(n, n));
    return l > 0 ? { x: n.x / l, y: n.y / l, z: n.z / l } : vec(0, 1, 0);
  }
}
