import { getGL } from '../gpu/gl.js';
import { Accumulator } from '../gpu/accumulate.js';
import { Display } from '../gpu/display.js';
import { Inspector } from '../viz/inspector.js';
import { Overlay } from '../viz/overlay.js';
import { Hypercube } from '../viz/hypercube.js';
import { Diagnostics } from './diagnostics.js';

const SLOW_RATE = 0.2, FAST_RATE = 60;
export const DEFAULT_SPEED_LEVEL = 100 * Math.log(1 / SLOW_RATE) / Math.log(FAST_RATE / SLOW_RATE);
const FRAME_BUDGET_MS = 16;

export class App {
  constructor(dom) {
    this.dom = dom;
    this.gl = getGL(dom.glCanvas);
    this.display = new Display(this.gl);
    this.overlay = new Overlay(dom.overlayCanvas);
    this.hypercube = dom.techCanvas ? new Hypercube(dom.techCanvas) : null;
    this.focusChain = null;
    this.diagnostics = new Diagnostics(dom.diagRoot, (id) => { this.focusChain = id; if (!this.running) this._render(); });

    this.workers = [];
    this.accumulator = null;
    this.inspector = new Inspector();
    this.running = false;
    this.params = {};
    this.budgetMs = FRAME_BUDGET_MS;
    this.dispatchIntervalMs = 0;
    this.targetRate = Infinity;
    this._lastDispatch = 0;
    this.readyCount = 0;
    this.bArray = [];
    this.width = 0; this.height = 0;
    this.totalMutations = 0;

    this._fpsTimes = [];
    this._lastMutCount = 0;
    this._lastMutTime = performance.now();
    this._loop = this._loop.bind(this);
  }

  async start(sceneJSON, opts) {
    this.stop();
    const resolution = opts.resolution;
    this.params.largeStepProbability = opts.largeStepProbability;
    this.params.sigma = opts.sigma;
    this.params.mode = opts.mode || 'mmlt';
    if (opts.exposure != null) { this.params.exposure = opts.exposure; this._userExposure = true; }
    else this.params.exposure = sceneJSON.exposure ?? 1.0;
    this.nBootstrap = opts.nBootstrap;
    const nChains = opts.nChains;

    const aspect = sceneJSON.camera.aspect || 1;
    if (aspect >= 1) { this.width = resolution; this.height = Math.round(resolution / aspect); }
    else { this.height = resolution; this.width = Math.round(resolution * aspect); }

    this.dom.glCanvas.width = this.width;
    this.dom.glCanvas.height = this.height;
    this.overlay.resize(this.width, this.height);

    this.accumulator = new Accumulator(this.gl, this.width, this.height);
    this.inspector = new Inspector();
    this.totalMutations = 0;
    this.diagnostics.clearSelection();

    const nWorkers = Math.max(1, Math.min(opts.maxWorkers || (navigator.hardwareConcurrency || 4), nChains));
    const per = Math.ceil(nChains / nWorkers);
    this.readyCount = 0;
    this.bArray = null;
    this.workers = [];
    let base = 0;
    for (let w = 0; w < nWorkers; w++) {
      const count = Math.min(per, nChains - base);
      if (count <= 0) break;
      const worker = new Worker(new URL('../worker/integrator.worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => this._onWorkerMessage(w, e.data);
      worker.postMessage({
        type: 'init', sceneJSON, resolution, params: { ...this.params },
        nChains: count, chainBase: base, nBootstrap: this.nBootstrap, seed: 1,
      });
      this.workers.push({ worker, count, busy: true });
      base += count;
    }
    this.nChains = base;

    this.onProgress?.({ phase: 'bootstrap' });
  }

  _onWorkerMessage(wIndex, msg) {
    const wrap = this.workers[wIndex];
    if (!wrap) return;
    if (msg.type === 'ready') {
      this.bArray = msg.b;
      if (msg.direct) this.display.setDirectImage(msg.direct, this.width, this.height);
      wrap.busy = false;
      this.readyCount++;
      if (this.readyCount === this.workers.length) {
        this.diagnostics.setScene(this.width * this.height, this.bArray, this.params.mode);
        if (!this._userExposure) {
          const TARGET_KEY = 0.05;
          const bTotal = this.bArray.reduce((a, x) => a + x, 0);
          this.params.exposure = bTotal > 0 ? TARGET_KEY / bTotal : 1.0;
          this.onAutoExposure?.(this.params.exposure);
        }
        this.running = true;
        this.onProgress?.({ phase: 'running' });
        this._lastMutTime = performance.now();
        requestAnimationFrame(this._loop);
        this._dispatchAll();
      }
    } else if (msg.type === 'frame') {
      wrap.busy = false;
      this.accumulator.add(msg.splats);
      this.totalMutations += msg.stats.mutations;
      this.diagnostics.addStats(msg.stats);
      this.diagnostics.addChainSnapshots(msg.chains);
      this.inspector.update(msg.chains, performance.now());
    }
  }

  _dispatchAll() {
    if (!this.running) return;
    const now = performance.now();
    if (this.dispatchIntervalMs > 0 && now - this._lastDispatch < this.dispatchIntervalMs) return;
    const run = this.budgetMs > 0 ? { type: 'run', budgetMs: this.budgetMs } : { type: 'run', mutations: 1 };
    let dispatched = false;
    for (const wrap of this.workers) {
      if (!wrap.busy) { wrap.busy = true; wrap.worker.postMessage(run); dispatched = true; }
    }
    if (dispatched) this._lastDispatch = now;
  }

  _render() {
    if (!this.accumulator) return;
    const norm = this.totalMutations > 0 ? (this.width * this.height) / this.totalMutations : 0;
    this.display.draw(this.accumulator.hdrTexture, norm, this.params.exposure,
                      this.dom.glCanvas.width, this.dom.glCanvas.height);

    if (this.overlayEnabled !== false) {
      this.overlay.draw(this.inspector, this.width, this.height, this.stepAnimMs, this.focusChain);
    } else {
      this.overlay.ctx.clearRect(0, 0, this.overlay.canvas.width, this.overlay.canvas.height);
    }

    if (this.hypercube) {
      const showProps = this.overlay.options.showProposals || this.focusChain !== null;
      this.hypercube.draw(this.inspector, this.stepAnimMs, showProps, this.focusChain);
    }
  }

  _loop() {
    if (!this.running) return;

    this._render();

    const now = performance.now();
    this._fpsTimes.push(now);
    while (this._fpsTimes.length > 30) this._fpsTimes.shift();
    const fps = this._fpsTimes.length > 1
      ? (this._fpsTimes.length - 1) * 1000 / (now - this._fpsTimes[0]) : 0;
    if (now - this._lastMutTime > 500) {
      this.mutPerSec = (this.totalMutations - this._lastMutCount) * 1000 / (now - this._lastMutTime);
      this._lastMutCount = this.totalMutations;
      this._lastMutTime = now;
    }
    if (now - (this._lastDiagRender || 0) > 100) {
      this.diagnostics.setTiming(fps, this.mutPerSec || 0);
      this.diagnostics.render();
      this._lastDiagRender = now;
    }

    this._dispatchAll();
    requestAnimationFrame(this._loop);
  }

  setParams(p) {
    Object.assign(this.params, p);
    const msg = { type: 'setParams', params: { largeStepProbability: this.params.largeStepProbability, sigma: this.params.sigma } };
    for (const wrap of this.workers) wrap.worker.postMessage(msg);
  }

  setOverlayOptions(opts) { Object.assign(this.overlay.options, opts); if (!this.running) this._render(); }
  setOverlayEnabled(on) { this.overlayEnabled = on; if (!this.running) this._render(); }
  setExposure(e) { this.params.exposure = e; this._userExposure = true; if (!this.running) this._render(); }

  setSpeed(level) {
    const v = Math.max(0, Math.min(100, level)) / 100;
    if (v >= 1) {
      this.targetRate = Infinity;
      this.budgetMs = FRAME_BUDGET_MS;
      this.dispatchIntervalMs = 0;
    } else {
      this.targetRate = SLOW_RATE * Math.pow(FAST_RATE / SLOW_RATE, v);
      this.budgetMs = 0;
      this.dispatchIntervalMs = 1000 / this.targetRate;
    }
  }

  get stepAnimMs() {
    return this.budgetMs === 0 && this.dispatchIntervalMs >= 120 ? this.dispatchIntervalMs : 0;
  }

  get speedLabel() {
    if (this.targetRate === Infinity) return 'max (device limit)';
    const r = this.targetRate;
    return r < 1 ? `${(1 / r).toFixed(1)} s / step` : `${r.toFixed(r < 10 ? 1 : 0)} steps/s`;
  }

  pause() { this.running = false; }
  resume() {
    if (this.running || this.workers.length === 0) return;
    this.running = true;
    this._lastMutTime = performance.now();
    requestAnimationFrame(this._loop);
    this._dispatchAll();
  }

  reset() {
    if (!this.accumulator) return;
    this.accumulator.clear();
    this.totalMutations = 0;
    this._lastMutCount = 0;
    this.diagnostics.reset();
    this.inspector.reset();
    if (!this.running) this._render();
  }

  stop() {
    this.running = false;
    for (const wrap of this.workers) { wrap.worker.postMessage({ type: 'stop' }); wrap.worker.terminate(); }
    this.workers = [];
  }
}
