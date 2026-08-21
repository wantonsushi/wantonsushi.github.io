import { predictedNc } from './physics/stone.js';

const BEST_KEY = 'ss-best-bounces';

const NC_CAP = 40;
function formatNc(nc) {
  return nc > NC_CAP ? `>${NC_CAP}` : String(Math.round(nc));
}

function loadBest() {
  try {
    const n = parseInt(localStorage.getItem(BEST_KEY) ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch { return 0; }
}

function saveBest(n) {
  try { localStorage.setItem(BEST_KEY, String(n)); } catch {}
}

export class Stats {
  constructor(root, overlay) {
    root.innerHTML = `
      <h3 class="ss-ctrl-section">Telemetry</h3>
      <div class="ss-diag-grid">
        <div class="ss-stat"><span>Bounces</span><b id="ss-d-bounce">0</b></div>
        <div class="ss-stat"><span>Personal best</span><b id="ss-d-best">0</b></div>
        <div class="ss-stat"><span>Speed</span><b id="ss-d-speed">-</b></div>
        <div class="ss-stat"><span>Predicted N<sub>c</sub></span><b id="ss-d-nc">-</b></div>
        <div class="ss-stat"><span>Distance</span><b id="ss-d-dist">-</b></div>
        <div class="ss-stat"><span>FPS</span><b id="ss-d-fps">-</b></div>
      </div>`;
    this.el = {
      bounce: root.querySelector('#ss-d-bounce'),
      best: root.querySelector('#ss-d-best'),
      speed: root.querySelector('#ss-d-speed'),
      nc: root.querySelector('#ss-d-nc'),
      dist: root.querySelector('#ss-d-dist'),
      fps: root.querySelector('#ss-d-fps'),
    };
    this.overlay = overlay;
    this.best = loadBest();
    this.el.best.textContent = this.best;
    this._leadStone = null;
    this._shownBounces = 0;
    this._announcedSettle = false;
  }

  update(stones, fps) {
    const alive = [...stones].reverse().find((s) => s.alive);
    const lead = alive || stones[stones.length - 1];

    if (lead) {
      this.el.bounce.textContent = lead.bounces;
      this.el.speed.textContent = Math.hypot(lead.vx, lead.vz).toFixed(1) + ' m/s';
      this.el.nc.textContent = formatNc(predictedNc(lead));
      this.el.dist.textContent = lead.dist.toFixed(1) + ' m';
      this._narrate(lead);
    }
    this.el.fps.textContent = Math.round(fps);
  }

  _narrate(lead) {
    if (lead !== this._leadStone) {
      this._leadStone = lead;
      this._shownBounces = 0;
      this._announcedSettle = false;
    }

    if (lead.alive && lead.bounces > this._shownBounces) {
      this._shownBounces = lead.bounces;
      this._flashCount(lead.bounces);
    }

    if (!lead.alive && !this._announcedSettle) {
      this._announcedSettle = true;
      this._shownBounces = lead.bounces;
      const n = lead.bounces;
      if (n > this.best) {
        this.best = n;
        this.el.best.textContent = n;
        saveBest(n);
        this._celebrate(n);
      } else {
        this._summary(n);
      }
    }
  }

  _flashCount(n) {
    if (!this.overlay) return;
    this.overlay.innerHTML =
      `<div class="ss-skip-count">${n}<small>${n === 1 ? 'skip' : 'skips'}</small></div>`;
  }

  _summary(n) {
    if (!this.overlay) return;
    const msg = n === 0 ? 'Plonk - straight in!'
      : n === 1 ? 'One skip. Nice!'
      : `${n} skips before it sank.`;
    this.overlay.innerHTML = `<div class="ss-settle">${msg}</div>`;
    this._autoClear(2600);
  }

  _celebrate(n) {
    if (!this.overlay) return;
    this.overlay.innerHTML = `
      <div class="ss-record">
        <div class="ss-record-text">New best!<b>${n} ${n === 1 ? 'skip' : 'skips'}</b></div>
      </div>`;
    this._autoClear(3200);
  }

  _autoClear(ms) {
    clearTimeout(this._clearTimer);
    this._clearTimer = setTimeout(() => {
      if (this.overlay) this.overlay.innerHTML = '';
    }, ms);
  }
}
