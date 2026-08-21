import { chainColorCSS } from './palette.js';

const PROPOSE_FRAC = 0.5;
const ease = (t) => t * t * (3 - 2 * t);

export class Overlay {
  constructor(canvas2d) {
    this.canvas = canvas2d;
    this.ctx = canvas2d.getContext('2d');
    this.options = { showProposals: true, showTrails: false };
  }

  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  draw(inspector, renderW, renderH, stepMs = 0, focusId = null) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const sx = W / renderW, sy = H / renderH;
    ctx.clearRect(0, 0, W, H);
    this.k = Math.max(1, Math.min(W, H) / 256);
    const now = performance.now();
    const focused = focusId !== null;

    if (this.options.showTrails || focused) this._drawTrails(inspector, sx, sy, focusId);
    if (this.options.showProposals || focused) {
      for (const s of inspector.chains.values()) {
        if (focused && s.id !== focusId) continue;
        const phase = stepMs > 0 ? Math.min(1, (now - (s.tUpdate || 0)) / stepMs) : 1;
        this._drawStep(s, sx, sy, phase);
      }
    }
  }

  _drawTrails(ins, sx, sy, focusId = null) {
    const ctx = this.ctx;
    ctx.lineWidth = this.k;
    for (const [id, tr] of ins.trails) {
      if (tr.length < 2 || (focusId !== null && id !== focusId)) continue;
      ctx.strokeStyle = chainColorCSS(id, 0.22);
      ctx.beginPath();
      ctx.moveTo(tr[0][0] * sx, tr[0][1] * sy);
      for (let i = 1; i < tr.length; i++) ctx.lineTo(tr[i][0] * sx, tr[i][1] * sy);
      ctx.stroke();
    }
  }

  _drawStep(s, sx, sy, phase) {
    if (s.hasPos === false) return;
    const ctx = this.ctx, k = this.k;
    const fx = s.x * sx, fy = s.y * sy;
    const tx = s.px * sx, ty = s.py * sy;
    const col = chainColorCSS(s.id, 1);
    const moved = (tx - fx) ** 2 + (ty - fy) ** 2 > (1.5 * k) ** 2;
    const dash = s.isLarge ? [5 * k, 4 * k] : null;

    const proposing = phase < PROPOSE_FRAC;
    const decideT = ease(Math.max(0, (phase - PROPOSE_FRAC) / (1 - PROPOSE_FRAC)));

    if (moved) {
      ctx.setLineDash(dash || []);
      if (proposing) {
        const g = ease(phase / PROPOSE_FRAC);
        ctx.strokeStyle = chainColorCSS(s.id, 0.6); ctx.lineWidth = 1.4 * k;
        this._arrow(fx, fy, fx + (tx - fx) * g, fy + (ty - fy) * g, k);
      } else {
        ctx.lineWidth = 1.6 * k;
        ctx.strokeStyle = chainColorCSS(s.id, s.accepted ? 0.95 : 0.35);
        this._arrow(fx, fy, tx, ty, k);
      }
      ctx.setLineDash([]);
    }

    if (proposing) {
      this._pending(tx, ty, 3 * k, col, phase);
    } else if (s.accepted) {
      this._dot(tx, ty, 3 * k, col, false);
    } else if (moved) {
      this._cross(tx, ty, 2.6 * k, chainColorCSS(s.id, 0.55));
    }

    const t = proposing ? 0 : (s.accepted ? decideT : 0);
    const hx = fx + (tx - fx) * t, hy = fy + (ty - fy) * t;
    this._dot(hx, hy, 2.6 * k, col, false);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = k;
    ctx.beginPath(); ctx.arc(hx, hy, 3.8 * k, 0, Math.PI * 2); ctx.stroke();
  }

  _arrow(x0, y0, x1, y1, k) {
    const ctx = this.ctx;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const a = Math.atan2(y1 - y0, x1 - x0), h = 5 * k;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x1 - h * Math.cos(a - 0.4), y1 - h * Math.sin(a - 0.4));
    ctx.moveTo(x1, y1); ctx.lineTo(x1 - h * Math.cos(a + 0.4), y1 - h * Math.sin(a + 0.4));
    ctx.stroke();
  }

  _dot(x, y, r, color, hollow) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (hollow) { ctx.strokeStyle = color; ctx.lineWidth = this.k; ctx.stroke(); }
    else { ctx.fillStyle = color; ctx.fill(); }
  }

  _pending(x, y, r, color, phase) {
    const ctx = this.ctx;
    const pulse = 1 + 0.25 * Math.sin(phase * Math.PI * 6);
    ctx.strokeStyle = color; ctx.lineWidth = 1.3 * this.k; ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(x, y, r * pulse, 0, Math.PI * 2); ctx.stroke();
  }

  _cross(x, y, r, color) {
    const ctx = this.ctx;
    ctx.strokeStyle = color; ctx.lineWidth = 1.4 * this.k; ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r);
    ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r);
    ctx.stroke();
  }
}
