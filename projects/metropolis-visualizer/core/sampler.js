import { NUM_STATES, TECHNIQUE_STATE } from './constants.js';

const SQRT2 = Math.SQRT2;

function erfInv(x) {
  x = Math.min(Math.max(x, -0.99999), 0.99999);
  const w0 = -Math.log((1 - x) * (1 + x));
  let p, w;
  if (w0 < 5) {
    w = w0 - 2.5;
    p = 2.81022636e-08;
    p = 3.43273939e-07 + p * w;
    p = -3.5233877e-06 + p * w;
    p = -4.39150654e-06 + p * w;
    p = 0.00021858087 + p * w;
    p = -0.00125372503 + p * w;
    p = -0.00417768164 + p * w;
    p = 0.246640727 + p * w;
    p = 1.50140941 + p * w;
  } else {
    w = Math.sqrt(w0) - 3;
    p = -0.000200214257;
    p = 0.000100950558 + p * w;
    p = 0.00134934322 + p * w;
    p = -0.00367342844 + p * w;
    p = 0.00573950773 + p * w;
    p = -0.0076224613 + p * w;
    p = 0.00943887047 + p * w;
    p = 1.00167406 + p * w;
    p = 2.83297682 + p * w;
  }
  return p * x;
}

export class PSSampler {
  constructor(rng, sigma, largeStepProbability) {
    this.rng = rng;
    this.sigma = sigma;
    this.largeStepProbability = largeStepProbability;
    this.X = new Float64Array(NUM_STATES);
    this.lastMod = new Int32Array(NUM_STATES);
    this.seeded = new Uint8Array(NUM_STATES);
    this.valueBackup = new Float64Array(NUM_STATES);
    this.modifyBackup = new Int32Array(NUM_STATES);
    this.currentIteration = 0;
    this.lastLargeStepIteration = 0;
    this.largeStep = true;
    this.streamOffset = 0;
    this.sampleIndex = 0;
  }

  startIteration() {
    this.currentIteration++;
    this.largeStep = this.rng.next() < this.largeStepProbability;
  }

  accept() {
    if (this.largeStep) this.lastLargeStepIteration = this.currentIteration;
  }

  reject() {
    for (let i = 0; i < NUM_STATES; i++) {
      if (this.lastMod[i] === this.currentIteration) {
        this.X[i] = this.valueBackup[i];
        this.lastMod[i] = this.modifyBackup[i];
      }
    }
    this.currentIteration--;
  }

  startStream(offset) { this.streamOffset = offset; this.sampleIndex = 0; }
  nextSample() { return this.at(this.streamOffset + this.sampleIndex++); }

  at(index) {
    this._ensureReady(index);
    return this.X[index];
  }

  _ensureReady(index) {
    if (!this.seeded[index]) {
      this.X[index] = this.rng.next();
      this.lastMod[index] = this.currentIteration;
      this.seeded[index] = 1;
    } else if (this.lastMod[index] < this.lastLargeStepIteration) {
      this.X[index] = this.rng.next();
      this.lastMod[index] = this.lastLargeStepIteration;
    }
    this.valueBackup[index] = this.X[index];
    this.modifyBackup[index] = this.lastMod[index];
    if (this.largeStep) {
      this.X[index] = this.rng.next();
    } else {
      const nSmall = this.currentIteration - this.lastMod[index];
      const normalSample = SQRT2 * erfInv(2 * this.rng.next() - 1);
      const effSigma = this.sigma * Math.sqrt(nSmall);
      let v = this.X[index] + normalSample * effSigma;
      v -= Math.floor(v);
      this.X[index] = v;
    }
    this.lastMod[index] = this.currentIteration;
  }
}

export function selectTechnique(uTechnique, k) {
  const t = Math.min(k + 1, Math.floor(uTechnique * (k + 2))) + 1;
  const s = (k + 2) - t;
  return { s, t };
}

export { TECHNIQUE_STATE };
