import { RNG } from './rng.js';
import { PSSampler, selectTechnique, TECHNIQUE_STATE } from './sampler.js';
import { combinePaths, generateCameraSubpath, generateLightSubpath } from './bdpt.js';
import { scale } from './vec.js';
import { MAX_PATH_LENGTH, VIZ_DIMS, VIZ_INDICES } from './constants.js';

function evalContribution(scene, sampler, k) {
  const { s, t } = selectTechnique(sampler.at(TECHNIQUE_STATE), k);
  const camera = generateCameraSubpath(scene, sampler, t);
  const light = generateLightSubpath(scene, sampler, s);
  const pc = combinePaths(scene, camera, light, sampler, t, s);
  const nStrategies = k === 0 ? 1 : k + 2;
  pc.sc *= nStrategies;
  for (const c of pc.contribs) c.c = scale(c.c, nStrategies);
  pc.t = t; pc.s = s; pc.depth = k + 2;
  return pc;
}

function evalContributionFull(scene, sampler) {
  const camera = generateCameraSubpath(scene, sampler, MAX_PATH_LENGTH + 1);
  const light = generateLightSubpath(scene, sampler, MAX_PATH_LENGTH + 1);
  const pc = combinePaths(scene, camera, light, sampler);
  let best = -1, bestC = -1;
  for (let i = 0; i < pc.contribs.length; i++) {
    const c = pc.contribs[i].c, m = Math.max(c.x, c.y, c.z);
    if (m > bestC) { bestC = m; best = i; }
  }
  if (best >= 0) { pc.s = pc.contribs[best].s; pc.t = pc.contribs[best].t; pc.depth = pc.contribs[best].depth; }
  return pc;
}

class Distribution1D {
  constructor(f) {
    this.n = f.length;
    this.cdf = new Float64Array(this.n + 1);
    for (let i = 0; i < this.n; i++) this.cdf[i + 1] = this.cdf[i] + f[i];
    this.funcInt = this.cdf[this.n];
    if (this.funcInt > 0) for (let i = 1; i <= this.n; i++) this.cdf[i] /= this.funcInt;
    else for (let i = 1; i <= this.n; i++) this.cdf[i] = i / this.n;
  }
  sampleDiscrete(u) {
    let lo = 0, hi = this.n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.cdf[m + 1] <= u) lo = m + 1; else hi = m; }
    return Math.min(lo, this.n - 1);
  }
}

const BOOTSTRAP_SEED = 9798;
const BOOTSTRAP_SIGMA = 0.01;
const ALWAYS_LARGE_STEP = 1;

const bootSeed = (i, k) => ((i * (MAX_PATH_LENGTH + 1) + k) * 2654435761) >>> 0;

export function bootstrap(scene, nBootstrap) {
  const b = new Float64Array(MAX_PATH_LENGTH);
  const weights = new Float64Array(nBootstrap * MAX_PATH_LENGTH);
  for (let k = 0; k < MAX_PATH_LENGTH; k++) {
    let acc = 0;
    for (let i = 0; i < nBootstrap; i++) {
      const w = evalContribution(scene, new PSSampler(new RNG(bootSeed(i, k)), BOOTSTRAP_SIGMA, ALWAYS_LARGE_STEP), k).sc;
      weights[i * MAX_PATH_LENGTH + k] = w;
      acc += w;
    }
    b[k] = acc / nBootstrap;
  }
  const dist = new Distribution1D(weights);
  const cdf = new Float64Array(MAX_PATH_LENGTH);
  cdf[0] = b[0];
  for (let k = 1; k < MAX_PATH_LENGTH; k++) cdf[k] = cdf[k - 1] + b[k];
  const totalB = cdf[MAX_PATH_LENGTH - 1] || 1;
  const pdfB = new Float64Array(MAX_PATH_LENGTH);
  for (let k = 0; k < MAX_PATH_LENGTH; k++) { pdfB[k] = b[k] / totalB; cdf[k] /= totalB; }
  return { mode: 'mmlt', b, pdfB, cdfB: cdf, totalB, dist, nBootstrap };
}

function bootstrapPSS(scene, nBootstrap) {
  const sampler = new PSSampler(new RNG(BOOTSTRAP_SEED), BOOTSTRAP_SIGMA, ALWAYS_LARGE_STEP);
  let acc = 0;
  for (let i = 0; i < nBootstrap; i++) {
    sampler.startIteration();
    acc += evalContributionFull(scene, sampler).sc;
    sampler.accept();
  }
  return { mode: 'pssmlt', b: acc / nBootstrap };
}

export function bootstrapFor(mode, scene, nBootstrap) {
  return mode === 'pssmlt' ? bootstrapPSS(scene, nBootstrap) : bootstrap(scene, nBootstrap);
}

export class MMLT {
  constructor(scene, boot, params, seed) {
    this.scene = scene;
    this.mode = boot.mode || 'mmlt';
    this.params = params;
    this.rng = new RNG(seed);

    if (this.mode === 'pssmlt') {
      this.b = boot.b;
      this.sampler = new PSSampler(new RNG(seed * 2654435761 + 1), params.sigma, params.largeStepProbability);
      this.cur = evalContributionFull(scene, this.sampler);
    } else {
      this.b = boot.b; this.pdfB = boot.pdfB;
      const idx = boot.dist.sampleDiscrete(this.rng.next());
      const bi = Math.floor(idx / MAX_PATH_LENGTH);
      this.k = idx % MAX_PATH_LENGTH;
      this.sampler = new PSSampler(new RNG(bootSeed(bi, this.k)), params.sigma, params.largeStepProbability);
      this.cur = evalContribution(scene, this.sampler, this.k);
    }

    this.stats = { mutations: 0, acceptedSmall: 0, totalSmall: 0, acceptedLarge: 0, totalLarge: 0 };
    this.last = {
      x: 0, y: 0, px: 0, py: 0, hasPos: false, accepted: false, isLarge: false, s: 0, t: 0, depth: 0, k: 0,
      curState: new Float64Array(VIZ_DIMS), propState: new Float64Array(VIZ_DIMS),
    };
    this.splatBuffer = [];
  }

  _snapshotState(out) {
    const X = this.sampler.X;
    for (let i = 0; i < VIZ_INDICES.length; i++) out[i] = X[VIZ_INDICES[i]];
  }

  _firstRaster(pc) {
    const cs = pc.contribs;
    if (!cs.length) return null;
    let best = null, bestC = -1, bestAny = null, bestAnyC = -1;
    for (const c of cs) {
      const m = Math.max(c.c.x, c.c.y, c.c.z);
      if (m > bestAnyC) { bestAnyC = m; bestAny = c; }
      if (c.t > 1 && m > bestC) { bestC = m; best = c; }
    }
    return best || bestAny;
  }

  step() { this.mode === 'pssmlt' ? this._stepPSS() : this._stepMMLT(); }

  _syncSampler() {
    this.sampler.sigma = this.params.sigma;
    this.sampler.largeStepProbability = this.params.largeStepProbability;
  }

  _stepMMLT() {
    const k = this.k;
    const cur = this.cur;
    this._syncSampler();
    this._snapshotState(this.last.curState);
    this.sampler.startIteration();
    const isLarge = this.sampler.largeStep;
    const largeStepProbability = this.params.largeStepProbability;

    const prop = evalContribution(this.scene, this.sampler, k);
    this._snapshotState(this.last.propState);

    let a = 1.0;
    if (cur.sc > 0) a = Math.max(Math.min(1.0, prop.sc / cur.sc), 0.0);

    const bK = this.b[k] || 1;
    const pdfK = this.pdfB[k] || 1;
    const isLargeF = isLarge ? 1.0 : 0.0;
    if (prop.sc > 0) this._splat(prop, (k + 2) / pdfK * (a + isLargeF) / (prop.sc / bK + largeStepProbability));
    if (cur.sc > 0) this._splat(cur, (k + 2) / pdfK * (1.0 - a) / (cur.sc / bK + largeStepProbability));

    const accepted = this.rng.next() <= a;
    if (accepted) { this.sampler.accept(); this.cur = prop; }
    else this.sampler.reject();
    this._record(isLarge, accepted, cur, prop, k);
  }

  _stepPSS() {
    const cur = this.cur;
    this._syncSampler();
    this._snapshotState(this.last.curState);
    this.sampler.startIteration();
    const isLarge = this.sampler.largeStep;
    const largeStepProbability = this.params.largeStepProbability;
    const prop = evalContributionFull(this.scene, this.sampler);
    this._snapshotState(this.last.propState);

    let a = 1.0;
    if (this.cur.sc > 0) a = Math.max(Math.min(1.0, prop.sc / this.cur.sc), 0.0);

    const bK = this.b || 1;
    const isLargeF = isLarge ? 1.0 : 0.0;
    if (prop.sc > 0) this._splat(prop, (a + isLargeF) / (prop.sc / bK + largeStepProbability));
    if (this.cur.sc > 0) this._splat(this.cur, (1.0 - a) / (this.cur.sc / bK + largeStepProbability));

    const accepted = this.rng.next() <= a;
    if (accepted) { this.sampler.accept(); this.cur = prop; }
    else this.sampler.reject();
    this._record(isLarge, accepted, cur, prop, prop.depth - 2);
  }

  _record(isLarge, accepted, prevPc, propPc, k) {
    this.stats.mutations++;
    if (isLarge) { this.stats.totalLarge++; if (accepted) this.stats.acceptedLarge++; }
    else { this.stats.totalSmall++; if (accepted) this.stats.acceptedSmall++; }
    const prevR = this._firstRaster(prevPc);
    const propR = this._firstRaster(propPc);
    const L = this.last;
    const from = prevR || propR;
    const to = propR || prevR;
    if (from) { L.x = from.x; L.y = from.y; }
    if (to) { L.px = to.x; L.py = to.y; }
    L.hasPos = !!(prevR || propR);
    L.accepted = accepted; L.isLarge = isLarge;
    L.s = propPc.s; L.t = propPc.t; L.depth = propPc.depth; L.k = k;
  }

  _splat(pc, mScaling) {
    if (pc.sc === 0) return;
    for (const c of pc.contribs) {
      this.splatBuffer.push(c.x, c.y, c.c.x * mScaling, c.c.y * mScaling, c.c.z * mScaling);
    }
  }

  drainSplats() {
    const out = this.splatBuffer;
    this.splatBuffer = [];
    return out;
  }
}
