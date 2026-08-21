import { chainColorCSS } from './palette.js';
import { VIZ_REGIONS } from '../core/constants.js';

const PROPOSE_FRAC = 0.5;
const ease = (t) => t * t * (3 - 2 * t);

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
function withAlpha(color, a) {
  if (color[0] === '#') {
    const n = parseInt(color.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  return color;
}

export class Hypercube {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._resize();
  }

  _resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(120, Math.round(r.width)), h = Math.max(90, Math.round(r.height) || 200);
    if (w === this.w && h === this.h) return;
    const dpr = window.devicePixelRatio || 1;
    this.w = w; this.h = h;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(inspector, stepMs = 0, showProposals = true, focusId = null) {
    this._resize();
    const ctx = this.ctx;
    const W = this.w, H = this.h;
    ctx.clearRect(0, 0, W, H);

    const chains = [...inspector.chains.values()]
      .filter((c) => c.curState && c.curState.length && (focusId === null || c.id === focusId));
    if (!chains.length) return;
    const dims = chains[0].curState.length;
    this.stepMs = stepMs; this.now = performance.now();

    const padL = 6, padR = 6, padT = 16, padB = 14;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const axisX = (d) => padL + (dims === 1 ? 0 : (d / (dims - 1)) * plotW);
    const valY = (v) => padT + (1 - Math.min(1, Math.max(0, v))) * plotH;
    const muted = cssVar('--muted-color', '#888');

    ctx.strokeStyle = withAlpha(muted, 0.22);
    ctx.lineWidth = 1;
    for (let d = 0; d < dims; d++) {
      const x = axisX(d);
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
    }
    ctx.font = '9px -apple-system, sans-serif';
    ctx.textBaseline = 'alphabetic';
    let start = 0;
    for (let r = 0; r < VIZ_REGIONS.length; r++) {
      const reg = VIZ_REGIONS[r], end = start + reg.count;
      if (r > 0) {
        const x = (axisX(start - 1) + axisX(start)) / 2;
        ctx.strokeStyle = withAlpha(muted, 0.5);
        ctx.beginPath(); ctx.moveTo(x, padT - 2); ctx.lineTo(x, padT + plotH); ctx.stroke();
      }
      ctx.fillStyle = muted;
      const lx = axisX(start) - 1;
      const lw = ctx.measureText(reg.label).width;
      ctx.textAlign = lx + lw > W - padR ? 'right' : 'left';
      ctx.fillText(reg.label, ctx.textAlign === 'right' ? Math.min(W - 1, axisX(end - 1) + 2) : lx, padT - 5);
      start = end;
    }
    ctx.textAlign = 'left';

    const annotate = chains.length <= 8;
    if (showProposals) for (const c of chains) this._proposal(c, axisX, valY, annotate);
    for (const c of chains) this._current(c, axisX, valY, annotate);
  }

  _phase(c) {
    return this.stepMs > 0 ? Math.min(1, (this.now - (c.tUpdate || 0)) / this.stepMs) : 1;
  }

  _polyline(state, axisX, valY) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let d = 0; d < state.length; d++) {
      const x = axisX(d), y = valY(state[d]);
      d === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  _proposal(c, axisX, valY, annotate) {
    const ctx = this.ctx;
    if (c.propState.every((v, d) => v === c.curState[d])) return;
    const ph = this._phase(c);
    const proposing = ph < PROPOSE_FRAC;
    const decideT = ease(Math.max(0, (ph - PROPOSE_FRAC) / (1 - PROPOSE_FRAC)));
    const alpha = proposing ? 0.5 + 0.45 * ease(ph / PROPOSE_FRAC)
                            : (c.accepted ? 0.95 - 0.3 * decideT : 0.5 * (1 - 0.5 * decideT));

    ctx.setLineDash(c.isLarge ? [5, 4] : [3, 3]);
    ctx.strokeStyle = `rgba(0,0,0,${0.5 * alpha})`; ctx.lineWidth = 3;
    this._polyline(c.propState, axisX, valY);
    ctx.strokeStyle = chainColorCSS(c.id, alpha); ctx.lineWidth = 1.4;
    this._polyline(c.propState, axisX, valY);
    ctx.setLineDash([]);

    if (annotate) {
      const r = proposing ? 3 * (1 + 0.3 * Math.sin(ph * Math.PI * 6)) : 3;
      ctx.strokeStyle = chainColorCSS(c.id, Math.min(1, alpha + 0.15)); ctx.lineWidth = 1.4;
      for (let d = 0; d < c.propState.length; d++) {
        if (c.propState[d] === c.curState[d]) continue;
        ctx.beginPath(); ctx.arc(axisX(d), valY(c.propState[d]), r, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }

  _current(c, axisX, valY, annotate) {
    const ctx = this.ctx;
    const ph = this._phase(c);
    const t = (ph >= PROPOSE_FRAC && c.accepted)
      ? ease((ph - PROPOSE_FRAC) / (1 - PROPOSE_FRAC)) : 0;
    const at = (d) => c.curState[d] + (c.propState[d] - c.curState[d]) * t;
    ctx.strokeStyle = chainColorCSS(c.id, 0.95);
    ctx.lineWidth = 1.6;
    ctx.setLineDash([]);
    ctx.beginPath();
    for (let d = 0; d < c.curState.length; d++) {
      const x = axisX(d), y = valY(at(d));
      d === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    if (annotate) {
      ctx.fillStyle = chainColorCSS(c.id, 1);
      for (let d = 0; d < c.curState.length; d++) {
        ctx.beginPath(); ctx.arc(axisX(d), valY(at(d)), 1.8, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
}
