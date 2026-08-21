import { vec, add, sub, scale, dot, norm, luminance, mul } from './vec.js';
import { Frame } from './frame.js';
import {
  MAX_PATH_LENGTH, MIN_PATH_LENGTH, TECHNIQUE_STATE,
  NUM_RNGS_PER_EVENT, NUM_STATES_SUBPATH,
} from './constants.js';

const CAMERA = 0, LIGHT = 1, SURFACE = 2;
const CONNECTION_STREAM = TECHNIQUE_STATE - 3;

const onSurface = (v) => v.type === SURFACE || v.type === LIGHT;

function surfaceVertex(scene, hit, beta, prev, pdfFwd) {
  const v = {
    type: SURFACE, p: hit.p, ng: hit.ng, ns: hit.n, frame: new Frame(hit.n),
    beta, pdfFwd: 0, pdfRev: 0, delta: false,
    mat: hit.mat, emit: hit.emit, albedo: scene.albedoAt(scene.materials[hit.mat], hit),
  };
  v.pdfFwd = prev ? convertDensity(prev, pdfFwd, v) : pdfFwd;
  return v;
}

function convertDensity(from, pdf, to) {
  const w = sub(to.p, from.p);
  const d2 = dot(w, w);
  if (d2 === 0) return 0;
  const invD2 = 1 / d2;
  let p = pdf * invD2;
  if (onSurface(to)) p *= Math.abs(dot(to.ng, scale(w, Math.sqrt(invD2))));
  return p;
}

function G(v0, v1) {
  let d = sub(v0.p, v1.p);
  let g = 1 / dot(d, d);
  d = scale(d, Math.sqrt(g));
  if (onSurface(v0)) g *= Math.abs(dot(v0.ns, d));
  if (onSurface(v1)) g *= Math.abs(dot(v1.ns, d));
  return g;
}

function vertexPdf(scene, v, prev, next) {
  if (!v || !next) return 0;
  if (v.type === LIGHT) return pdfLight(v, next);
  const wn = norm(sub(next.p, v.p));
  let sa = 0;
  if (v.type === CAMERA) {
    sa = scene.cameraPdfDir(wn);
  } else {
    if (!prev) return 0;
    const wp = norm(sub(prev.p, v.p));
    const bsdf = v.bsdf || scene.materials[v.mat].bsdf;
    sa = bsdf.pdf(v.frame.toLocal(wp), v.frame.toLocal(wn));
  }
  return convertDensity(v, sa, next);
}

function vertexLe(scene, v, toward) {
  if (v.emit < 0) return vec(0, 0, 0);
  const w = norm(sub(toward.p, v.p));
  if (dot(w, v.ng) <= 0) return vec(0, 0, 0);
  return scene.emitterRadiance(v.emit);
}

function pdfLight(lightV, v) {
  let w = sub(v.p, lightV.p);
  const invD2 = 1 / dot(w, w);
  w = scale(w, Math.sqrt(invD2));
  let pdf = Math.abs(dot(lightV.ng, w)) / Math.PI * invD2;
  if (onSurface(v)) pdf *= Math.abs(dot(v.ng, w));
  return pdf;
}

function pdfLightOrigin(scene, lightV) {
  return lightV.emit >= 0 ? scene.lightOriginPdf(lightV.emit) : 0;
}

function randomWalk(scene, ray, sampler, off, beta, pdfDir, maxDepth, mode, path) {
  if (maxDepth === 0) return 0;
  let bounces = 0;
  let pdfFwd = pdfDir, pdfRev = 0;
  let ro = ray.o, rd = ray.d;
  for (;;) {
    const hit = scene.intersect(ro, rd);
    if (!hit) break;
    const prev = path[path.length - 1];
    const v = surfaceVertex(scene, hit, beta, prev, pdfFwd);
    v.woW = scale(rd, -1);
    path.push(v);
    if (++bounces >= maxDepth) break;

    const mat = scene.materials[hit.mat];
    let bsdf = mat.bsdf;
    if (mat.texture) bsdf = mat.withAlbedo(v.albedo);
    v.bsdf = bsdf;
    const wo = v.frame.toLocal(v.woW);
    const r0 = sampler.at(off + (bounces - 1) * 2 + 0), r1 = sampler.at(off + (bounces - 1) * 2 + 1);
    const s = bsdf.sampleF(wo, r0, r1, mode === 'radiance');
    if (!s || s.pdf === 0 || (s.f.x === 0 && s.f.y === 0 && s.f.z === 0)) break;
    const wiW = v.frame.toWorld(s.wiL);
    pdfFwd = s.pdf;
    beta = scale(mul(beta, s.f), Math.abs(s.wiL.z) / s.pdf);
    pdfRev = s.specular ? 0 : bsdf.pdf(s.wiL, wo);
    if (s.specular) { v.delta = true; pdfFwd = 0; }
    if (prev) prev.pdfRev = convertDensity(v, pdfRev, prev);
    ro = add(v.p, scale(wiW, 1e-4));
    rd = wiW;
  }
  return bounces;
}

export function generateCameraSubpath(scene, sampler, maxDepth) {
  const path = [];
  if (maxDepth === 0) return path;
  const r = scene.sampleCameraRay(sampler.at(0), sampler.at(1));
  const cam = { type: CAMERA, p: scene.camPos, ng: scene.camW, ns: scene.camW,
                beta: vec(1, 1, 1), pdfFwd: 1, pdfRev: 0, delta: false, emit: -1 };
  cam.woW = scale(r.d, -1);
  path.push(cam);
  randomWalk(scene, { o: r.o, d: r.d }, sampler, NUM_RNGS_PER_EVENT, vec(1, 1, 1),
             scene.cameraPdfDir(r.d), maxDepth - 1, 'radiance', path);
  return path;
}

export function generateLightSubpath(scene, sampler, maxDepth) {
  const path = [];
  if (maxDepth === 0) return path;
  const off = NUM_STATES_SUBPATH;
  const ls = scene.sampleLight(sampler.at(off), sampler.at(off + 1), sampler.at(off + 2),
                               sampler.at(off + 3), sampler.at(off + 4));
  if (!ls) return path;
  const lv = { type: LIGHT, p: ls.p, ng: ls.n, ns: ls.n, beta: vec(1, 1, 1),
               pdfFwd: ls.pdfPos, pdfRev: 0, delta: false, emit: ls.emit };
  const rad = scene.emitterRadiance(ls.emit);
  const beta = scale(rad, Math.abs(dot(ls.n, ls.d)) / (ls.pdfPos * ls.pdfDir));
  path.push(lv);
  randomWalk(scene, { o: add(ls.p, scale(ls.d, 1e-4)), d: ls.d }, sampler, off + 2 * NUM_RNGS_PER_EVENT,
             beta, ls.pdfDir, maxDepth - 1, 'importance', path);
  return path;
}

function misWeight(scene, light, camera, sampled, s, t) {
  if (s + t === 2) return 1;
  const remap0 = (f) => (f !== 0 ? f : 1);

  const qs = s > 0 ? light[s - 1] : null;
  const pt = t > 0 ? camera[t - 1] : null;
  const qsMinus = s > 1 ? light[s - 2] : null;
  const ptMinus = t > 1 ? camera[t - 2] : null;

  const saved = [];
  const setField = (obj, key, val) => { if (obj) { saved.push([obj, key, obj[key]]); obj[key] = val; } };

  const swapVertex = (target, src) => {
    if (!target || !src) return;
    for (const key of Object.keys(src)) setField(target, key, src[key]);
  };
  if (s === 1) swapVertex(qs, sampled);
  else if (t === 1) swapVertex(pt, sampled);

  setField(pt, 'delta', false);
  setField(qs, 'delta', false);

  if (pt) setField(pt, 'pdfRev', s > 0 ? vertexPdf(scene, qs, qsMinus, pt)
                                       : pdfLightOrigin(scene, pt));
  if (ptMinus) setField(ptMinus, 'pdfRev', s > 0 ? vertexPdf(scene, pt, qs, ptMinus)
                                                  : pdfLight(pt, ptMinus));
  if (qs) setField(qs, 'pdfRev', vertexPdf(scene, pt, ptMinus, qs));
  if (qsMinus) setField(qsMinus, 'pdfRev', vertexPdf(scene, qs, pt, qsMinus));

  let sumRi = 0, ri = 1;
  for (let i = t - 1; i > 0; i--) {
    ri *= remap0(camera[i].pdfRev) / remap0(camera[i].pdfFwd);
    if (!camera[i].delta && !camera[i - 1].delta) sumRi += ri;
  }
  ri = 1;
  for (let i = s - 1; i >= 0; i--) {
    ri *= remap0(light[i].pdfRev) / remap0(light[i].pdfFwd);
    const deltaLightVertex = i > 0 ? light[i - 1].delta : light[0].isDeltaLight === true;
    if (!light[i].delta && !deltaLightVertex) sumRi += ri;
  }

  for (let i = saved.length - 1; i >= 0; i--) saved[i][0][saved[i][1]] = saved[i][2];
  return 1 / (1 + sumRi);
}

function fAt(scene, a, b) {
  if (a.type === CAMERA || a.type === LIGHT) return vec(1, 1, 1);
  const woW = a.woW, wiW = norm(sub(b.p, a.p));
  const bsdf = a.bsdf || scene.materials[a.mat].bsdf;
  return bsdf.f(a.frame.toLocal(woW), a.frame.toLocal(wiW));
}

function connectBDPT(scene, light, camera, s, t, sampler, connBase) {
  let L = vec(0, 0, 0);
  let raster = { px: 0, py: 0 };
  let sampled = null;

  if (t > 1 && s !== 0 && camera[t - 1].type === LIGHT) return null;

  if (s === 0) {
    const pt = camera[t - 1];
    if (pt.emit >= 0) L = mul(vertexLe(scene, pt, camera[t - 2]), pt.beta);
    if (!scene.cameraRaster(norm(sub(camera[1].p, camera[0].p)), raster)) return null;
  } else if (t === 1) {
    const qs = light[s - 1];
    if (qs.delta) return null;
    const cs = scene.sampleCameraWi(qs.p);
    if (!cs || cs.pdf === 0) return null;
    sampled = { type: CAMERA, p: cs.p, ng: scene.camW, ns: scene.camW, beta: scale(cs.We, 1 / cs.pdf), delta: false, emit: -1 };
    const wiW = norm(sub(sampled.p, qs.p));
    L = mul(mul(qs.beta, fAt(scene, qs, sampled)), sampled.beta);
    if (onSurface(qs)) L = scale(L, Math.abs(dot(wiW, qs.ns)));
    if (luminance(L) <= 0) return null;
    if (!scene.visible(qs.p, sampled.p)) return null;
    raster = cs.raster;
  } else if (s === 1) {
    const pt = camera[t - 1];
    if (pt.delta) return null;
    const ls = scene.sampleLightLi(pt.p, sampler.at(connBase), sampler.at(connBase + 1), sampler.at(connBase + 2));
    if (!ls || ls.pdf === 0) return null;
    sampled = { type: LIGHT, p: ls.p, ng: ls.n, ns: ls.n, beta: scale(ls.radiance, 1 / ls.pdf), delta: false, emit: ls.emit, pdfFwd: 0 };
    sampled.pdfFwd = pdfLightOrigin(scene, sampled);
    const wiW = norm(sub(sampled.p, pt.p));
    L = mul(mul(pt.beta, fAt(scene, pt, sampled)), sampled.beta);
    if (onSurface(pt)) L = scale(L, Math.abs(dot(wiW, pt.ns)));
    if (luminance(L) <= 0) return null;
    if (!scene.visible(pt.p, sampled.p)) return null;
    if (!scene.cameraRaster(norm(sub(camera[1].p, camera[0].p)), raster)) return null;
  } else {
    const qs = light[s - 1], pt = camera[t - 1];
    if (qs.delta || pt.delta) return null;
    L = mul(mul(mul(qs.beta, fAt(scene, qs, pt)), fAt(scene, pt, qs)), pt.beta);
    if (luminance(L) <= 0) return null;
    L = scale(L, G(qs, pt));
    if (luminance(L) <= 0) return null;
    if (!scene.visible(qs.p, pt.p)) return null;
    if (!scene.cameraRaster(norm(sub(camera[1].p, camera[0].p)), raster)) return null;
  }

  if (luminance(L) <= 0) return null;
  const w = misWeight(scene, light, camera, sampled, s, t);
  L = scale(L, w);
  if (luminance(L) <= 0) return null;
  return { L, px: raster.px, py: raster.py };
}

export function combinePaths(scene, cameraPath, lightPath, sampler, specT = -1, specS = -1) {
  const result = { contribs: [], sc: 0, t: 0, s: 0, depth: 0 };
  const specified = specT !== -1 && specS !== -1;

  const tMax = cameraPath.length, sMax = lightPath.length;
  for (let t = 1; t <= tMax; t++) {
    for (let s = 0; s <= sMax; s++) {
      const depth = t + s - 2;
      if (depth < MIN_PATH_LENGTH || depth > MAX_PATH_LENGTH) continue;
      if (s === 1 && t === 1) continue;
      if (specified && (t !== specT || s !== specS)) continue;

      const r = connectBDPT(scene, lightPath, cameraPath, s, t, sampler, CONNECTION_STREAM);
      if (!r) { if (specified) return result; continue; }
      const cmax = Math.max(r.L.x, r.L.y, r.L.z);
      if (cmax <= 0) { if (specified) return result; continue; }
      result.contribs.push({ x: r.px, y: r.py, c: r.L, s, t, depth });
      if (cmax > result.sc) result.sc = cmax;
      if (specified) { result.t = t; result.s = s; result.depth = depth; return result; }
    }
  }
  return result;
}
