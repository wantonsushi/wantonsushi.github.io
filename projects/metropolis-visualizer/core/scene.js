import { vec, add, sub, scale, dot, cross, norm, luminance, xformDir, matIdentity } from './vec.js';
import { BVH } from './bvh.js';
import { makeMaterial } from './material.js';

function sphereT(s, ox, oy, oz, dx, dy, dz) {
  const px = s.center.x - ox, py = s.center.y - oy, pz = s.center.z - oz;
  const b = px * dx + py * dy + pz * dz;
  const det = b * b - (px * px + py * py + pz * pz) + s.radius * s.radius;
  if (det < 0) return Infinity;
  const sq = Math.sqrt(det);
  const near = b - sq;
  if (near > 1e-4) return near;
  const far = b + sq;
  return far > 1e-4 ? far : Infinity;
}

export class Scene {
  constructor(json, resolution) {
    this.name = json.name;
    const aspect = json.camera.aspect || 1;
    if (aspect >= 1) { this.width = resolution; this.height = Math.round(resolution / aspect); }
    else { this.height = resolution; this.width = Math.round(resolution * aspect); }
    this.materials = json.materials.map(makeMaterial);
    this.emitters = json.emitters;
    this.spheres = json.spheres || [];

    const t = json.triangles;
    this.triMat = Int32Array.from(t.mat);
    this.triEmit = Int32Array.from(t.emit);
    this.bvh = new BVH(Float32Array.from(t.pA), Float32Array.from(t.pB), Float32Array.from(t.pC));
    this.nTri = t.count;
    this.triUV = t.uv ? Float32Array.from(t.uv) : null;
    this.textures = (json.textures || []).map((tx) => ({ width: tx.width, height: tx.height, data: Float32Array.from(tx.data) }));

    const m = json.camera.toWorld || matIdentity();
    this.camPos = vec(m[3], m[7], m[11]);
    this.camU = norm(xformDir(m, vec(1, 0, 0)));
    this.camV = norm(xformDir(m, vec(0, 1, 0)));
    this.camW = norm(xformDir(m, vec(0, 0, 1)));
    const fovRad = (json.camera.fov * Math.PI) / 180;
    const tanHalf = Math.tan(fovRad / 2);
    const sceneAspect = this.width / this.height;
    if ((json.camera.fovAxis || 'x') === 'x') { this.tanX = tanHalf; this.tanY = tanHalf / sceneAspect; }
    else { this.tanY = tanHalf; this.tanX = tanHalf * sceneAspect; }
    this.imagePlaneArea = (2 * this.tanX) * (2 * this.tanY);

    this._buildLightList();
  }

  _buildLightList() {
    const lights = [];
    let total = 0;
    const A = this.bvh.posA, B = this.bvh.posB, C = this.bvh.posC;
    for (let i = 0; i < this.nTri; i++) {
      if (this.triEmit[i] < 0) continue;
      const a = i * 3;
      const p0 = vec(A[a], A[a + 1], A[a + 2]);
      const p1 = vec(B[a], B[a + 1], B[a + 2]);
      const p2 = vec(C[a], C[a + 1], C[a + 2]);
      const e = cross(sub(p1, p0), sub(p2, p0));
      const area = 0.5 * Math.sqrt(dot(e, e));
      lights.push({ kind: 'tri', tri: i, p0, p1, p2, area, emit: this.triEmit[i] });
      total += area;
    }
    for (let i = 0; i < this.spheres.length; i++) {
      const s = this.spheres[i];
      if (s.emit < 0) continue;
      const area = 4 * Math.PI * s.radius * s.radius;
      lights.push({ kind: 'sphere', sphere: i, area, emit: s.emit });
      total += area;
    }
    this.lights = lights;
    this.totalLightArea = total;

    const power = lights.map((lg) => Math.max(luminance(this.emitterRadiance(lg.emit)), 1e-8) * lg.area);
    const totalPower = power.reduce((s, p) => s + p, 0) || 1;
    this.lightCdf = new Float64Array(lights.length + 1);
    for (let i = 0; i < lights.length; i++) {
      lights[i].pmf = power[i] / totalPower;
      this.lightCdf[i + 1] = this.lightCdf[i] + lights[i].pmf;
    }
    this.emitArea = new Map();
    this.emitPmf = new Map();
    for (const lg of lights) {
      this.emitArea.set(lg.emit, (this.emitArea.get(lg.emit) || 0) + lg.area);
      this.emitPmf.set(lg.emit, (this.emitPmf.get(lg.emit) || 0) + lg.pmf);
    }
  }

  lightOriginPdf(emit) {
    const area = this.emitArea.get(emit);
    return area > 0 ? this.emitPmf.get(emit) / area : 0;
  }

  sampleCameraRay(u0, u1) {
    const sx = (1 - 2 * u0) * this.tanX;
    const sy = (1 - 2 * u1) * this.tanY;
    const d = norm(add(add(this.camW, scale(this.camU, sx)), scale(this.camV, sy)));
    return { o: this.camPos, d };
  }

  cameraWe(dir) {
    const cosT = dot(dir, this.camW);
    if (cosT <= 0) return 0;
    const c2 = cosT * cosT;
    return 1 / (this.imagePlaneArea * c2 * c2);
  }

  cameraPdfDir(dir) {
    const cosT = dot(dir, this.camW);
    if (cosT <= 0) return 0;
    return 1 / (this.imagePlaneArea * cosT * cosT * cosT);
  }

  cameraRaster(dir, out) {
    const cosT = dot(dir, this.camW);
    if (cosT <= 1e-6) return false;
    const x = dot(dir, this.camU) / cosT, y = dot(dir, this.camV) / cosT;
    const u0 = (1 - x / this.tanX) * 0.5, u1 = (1 - y / this.tanY) * 0.5;
    out.px = u0 * this.width; out.py = u1 * this.height;
    return u0 >= 0 && u0 < 1 && u1 >= 0 && u1 < 1;
  }

  sampleCameraWi(refP) {
    const toCam = sub(this.camPos, refP);
    const dist2 = dot(toCam, toCam);
    const dist = Math.sqrt(dist2);
    const wi = scale(toCam, 1 / dist);
    const dir = scale(wi, -1);
    const raster = {};
    if (!this.cameraRaster(dir, raster)) return null;
    const cosT = dot(dir, this.camW);
    if (cosT <= 0) return null;
    const pdf = dist2 / cosT;
    const we = this.cameraWe(dir);
    return { p: this.camPos, We: vec(we, we, we), pdf, raster };
  }

  _pickLight(u) {
    const cdf = this.lightCdf;
    let lo = 0, hi = this.lights.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m + 1] <= u) lo = m + 1; else hi = m; }
    return this.lights[Math.min(lo, this.lights.length - 1)];
  }

  _pointOnLight(L, up0, up1) {
    if (L.kind === 'tri') {
      let a = up0, b = up1; if (a + b > 1) { a = 1 - a; b = 1 - b; }
      const p = add(add(L.p0, scale(sub(L.p1, L.p0), a)), scale(sub(L.p2, L.p0), b));
      return { p, n: norm(this.bvh.triNormal(L.tri)) };
    }
    const s = this.spheres[L.sphere];
    const z = 1 - 2 * up0;
    const rr = Math.sqrt(Math.max(0, 1 - z * z));
    const phi = 2 * Math.PI * up1;
    const dir = vec(rr * Math.cos(phi), z, rr * Math.sin(phi));
    return { p: add(s.center, scale(dir, s.radius)), n: dir };
  }

  sampleLight(uPick, up0, up1, ud0, ud1) {
    if (this.lights.length === 0) return null;
    const L = this._pickLight(uPick);
    const { p, n } = this._pointOnLight(L, up0, up1);
    const r = Math.sqrt(ud0), phi = 2 * Math.PI * ud1;
    const local = vec(r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(Math.max(0, 1 - ud0)));
    const d = this._hemi(n, local);
    return {
      p, n, d, emit: L.emit,
      pdfPos: L.pmf / L.area,
      pdfDir: Math.max(local.z, 1e-6) / Math.PI,
    };
  }

  sampleLightLi(refP, uPick, up0, up1) {
    if (this.lights.length === 0) return null;
    const L = this._pickLight(uPick);
    const { p, n } = this._pointOnLight(L, up0, up1);
    let w = sub(p, refP);
    const dist2 = dot(w, w);
    if (dist2 === 0) return null;
    w = scale(w, 1 / Math.sqrt(dist2));
    const cosL = dot(n, scale(w, -1));
    if (cosL <= 0) return null;
    const pdf = (L.pmf / L.area) * dist2 / cosL;
    return { p, n, radiance: this.emitterRadiance(L.emit), pdf, emit: L.emit };
  }

  _hemi(n, local) {
    const sign = n.z >= 0 ? 1 : -1;
    const a = -1 / (sign + n.z), b = n.x * n.y * a;
    const t = vec(1 + sign * n.x * n.x * a, sign * b, -sign * n.x);
    const bt = vec(b, sign + n.y * n.y * a, -n.y);
    return norm(vec(
      t.x * local.x + bt.x * local.y + n.x * local.z,
      t.y * local.x + bt.y * local.y + n.y * local.z,
      t.z * local.x + bt.z * local.y + n.z * local.z,
    ));
  }

  intersect(o, d, tMax = Infinity) {
    const best = this.bvh.intersect(o.x, o.y, o.z, d.x, d.y, d.z, tMax);
    let nearest = best ? best.t : tMax;
    let sphereHit = -1;
    for (let i = 0; i < this.spheres.length; i++) {
      const th = sphereT(this.spheres[i], o.x, o.y, o.z, d.x, d.y, d.z);
      if (th < nearest) { nearest = th; sphereHit = i; }
    }

    if (sphereHit >= 0) {
      const s = this.spheres[sphereHit];
      const p = add(o, scale(d, nearest));
      const n = norm(sub(p, s.center));
      return { p, n, ng: n, mat: s.mat, emit: s.emit, t: nearest };
    }
    if (!best) return null;

    const p = add(o, scale(d, best.t));
    const ng = this.bvh.triNormal(best.tri);
    const hit = { p, n: ng, ng, mat: this.triMat[best.tri], emit: this.triEmit[best.tri], t: best.t, tri: best.tri };
    if (this.triUV) {
      const a = best.tri * 6, bu = best.u, bv = best.v, bw = 1 - bu - bv;
      hit.uvu = bw * this.triUV[a] + bu * this.triUV[a + 2] + bv * this.triUV[a + 4];
      hit.uvv = bw * this.triUV[a + 1] + bu * this.triUV[a + 3] + bv * this.triUV[a + 5];
    }
    return hit;
  }

  albedoAt(mat, hit) {
    const tx = mat.texture;
    if (!tx) return mat.color;
    let u = hit.uvu || 0, v = hit.uvv || 0;
    if (tx.type === 'checker') {
      const sx = tx.uvScale ? tx.uvScale.x : 2, sy = tx.uvScale ? tx.uvScale.y : 2;
      const cu = Math.floor(u * sx) & 1, cv = Math.floor(v * sy) & 1;
      return (cu ^ cv) ? tx.c1 : tx.c0;
    }
    const img = this.textures[tx.id];
    if (!img) return mat.color;
    u = u - Math.floor(u); v = v - Math.floor(v);
    const x = Math.min(img.width - 1, (u * img.width) | 0);
    const y = Math.min(img.height - 1, ((1 - v) * img.height) | 0);
    const i = (y * img.width + x) * 3;
    return { x: img.data[i], y: img.data[i + 1], z: img.data[i + 2] };
  }

  visible(pa, pb) {
    const d = sub(pb, pa);
    const dist = Math.sqrt(dot(d, d));
    const dir = scale(d, 1 / dist);
    const hit = this.bvh.intersect(pa.x + dir.x * 1e-4, pa.y + dir.y * 1e-4, pa.z + dir.z * 1e-4,
                                   dir.x, dir.y, dir.z, dist - 2e-4);
    if (hit) return false;
    for (let i = 0; i < this.spheres.length; i++) {
      if (sphereT(this.spheres[i], pa.x, pa.y, pa.z, dir.x, dir.y, dir.z) < dist - 2e-4) return false;
    }
    return true;
  }

  emitterRadiance(emitIndex) { return this.emitters[emitIndex].radiance; }
}
