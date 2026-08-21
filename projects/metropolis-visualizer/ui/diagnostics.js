import { chainColorCSS } from '../viz/palette.js';

export class Diagnostics {
  constructor(root, onSelectChain = () => {}) {
    this.root = root;
    this.onSelectChain = onSelectChain;
    this.selected = null;
    this.totals = { mutations: 0, accSmall: 0, totSmall: 0, accLarge: 0, totLarge: 0 };
    this.bEstimate = 0;
    this.fps = 0;
    this.mutPerSec = 0;
    this.nPixels = 1;
    this.perChainDepth = true;
    this._build();
  }

  _build() {
    this.root.innerHTML = `
      <h3 class="mv-ctrl-section">Statistics</h3>
      <div class="mv-diag-grid">
        <div class="mv-stat"><span>Overall accept</span><b id="mv-acc-all">–</b></div>
        <div class="mv-stat"><span>Small-step accept</span><b id="mv-acc-small">–</b></div>
        <div class="mv-stat"><span>Large-step accept</span><b id="mv-acc-large">–</b></div>
        <div class="mv-stat"><span>Mutations / pixel</span><b id="mv-mpp">–</b></div>
        <div class="mv-stat"><span>Elapsed mutations</span><b id="mv-mut">–</b></div>
        <div class="mv-stat"><span>Estimated b</span><b id="mv-b">–</b></div>
        <div class="mv-stat"><span>FPS</span><b id="mv-fps">–</b></div>
        <div class="mv-stat"><span>Mutations / sec</span><b id="mv-mps">–</b></div>
      </div>
      <div class="mv-perchain-title" id="mv-perchain-title">Per chain: accept rate, path depth, technique</div>
      <div class="mv-perchain" id="mv-perchain"></div>`;
    this.el = {
      accAll: this.root.querySelector('#mv-acc-all'),
      accSmall: this.root.querySelector('#mv-acc-small'),
      accLarge: this.root.querySelector('#mv-acc-large'),
      mpp: this.root.querySelector('#mv-mpp'),
      mut: this.root.querySelector('#mv-mut'),
      b: this.root.querySelector('#mv-b'),
      fps: this.root.querySelector('#mv-fps'),
      mps: this.root.querySelector('#mv-mps'),
      perchain: this.root.querySelector('#mv-perchain'),
      perchainTitle: this.root.querySelector('#mv-perchain-title'),
    };
    this.chainAccept = new Map();
    this.chipEls = new Map();

    this.el.perchain.addEventListener('pointerdown', (e) => {
      const chip = e.target.closest('.mv-chip');
      if (!chip) return;
      const id = parseInt(chip.dataset.id, 10);
      this.selected = this.selected === id ? null : id;
      this.onSelectChain(this.selected);
      this._renderChips();
    });
  }

  setScene(nPixels, bArray, mode = 'mmlt') {
    this.nPixels = Math.max(1, nPixels);
    this.bEstimate = bArray.reduce((a, x) => a + x, 0);
    this.perChainDepth = mode !== 'pssmlt';
    this.el.perchainTitle.textContent = this.perChainDepth
      ? 'Per-chain (color · accept · depth · technique s,t)'
      : 'Per-chain (color · accept)';
    this.reset();
  }

  reset() {
    this.totals = { mutations: 0, accSmall: 0, totSmall: 0, accLarge: 0, totLarge: 0 };
    this.chainAccept.clear();
    this.chipEls.clear();
    this.el.perchain.replaceChildren();
  }

  clearSelection() {
    if (this.selected === null) return;
    this.selected = null;
    this.onSelectChain(null);
  }

  addStats(s) {
    this.totals.mutations += s.mutations;
    this.totals.accSmall += s.accSmall; this.totals.totSmall += s.totSmall;
    this.totals.accLarge += s.accLarge; this.totals.totLarge += s.totLarge;
  }

  addChainSnapshots(snapshots) {
    for (const s of snapshots) {
      let a = this.chainAccept.get(s.id);
      if (!a) { a = { acc: 0, tot: 0, depth: s.depth, s: s.s, t: s.t }; this.chainAccept.set(s.id, a); }
      a.acc = s.acc; a.tot = s.tot;
      a.depth = s.depth; a.s = s.s; a.t = s.t;
    }
  }

  setTiming(fps, mutPerSec) { this.fps = fps; this.mutPerSec = mutPerSec; }

  render() {
    const t = this.totals;
    const totAll = t.totSmall + t.totLarge;
    const accAll = t.accSmall + t.accLarge;
    const pct = (a, n) => (n > 0 ? `${((a / n) * 100).toFixed(1)}%` : '–');
    this.el.accAll.textContent = pct(accAll, totAll);
    this.el.accSmall.textContent = pct(t.accSmall, t.totSmall);
    this.el.accLarge.textContent = pct(t.accLarge, t.totLarge);
    this.el.mpp.textContent = (t.mutations / this.nPixels).toFixed(1);
    this.el.mut.textContent = formatCount(t.mutations);
    this.el.b.textContent = this.bEstimate.toExponential(2);
    this.el.fps.textContent = this.fps.toFixed(0);
    this.el.mps.textContent = formatCount(Math.round(this.mutPerSec));

    this._renderChips();
  }

  _renderChips() {
    const ids = [...this.chainAccept.keys()].sort((a, b) => a - b).slice(0, 48);
    for (const id of ids) {
      const a = this.chainAccept.get(id);
      const rate = a.tot > 0 ? ((a.acc / a.tot) * 100).toFixed(0) : '0';
      let c = this.chipEls.get(id);
      if (!c) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'mv-chip';
        el.dataset.id = id;
        el.title = `chain ${id} - click to focus`;
        const swatch = document.createElement('span');
        swatch.className = 'mv-swatch';
        swatch.style.background = chainColorCSS(id, 1);
        const accEl = document.createElement('span');
        accEl.className = 'mv-chip-acc';
        const dEl = document.createElement('span');
        dEl.className = 'mv-chip-d';
        const stEl = document.createElement('span');
        stEl.className = 'mv-chip-st';
        el.append(swatch, accEl, dEl, stEl);
        this.el.perchain.appendChild(el);
        c = { el, accEl, dEl, stEl };
        this.chipEls.set(id, c);
      }
      c.accEl.textContent = `${rate}%`;
      if (this.perChainDepth) { c.dEl.textContent = `d${a.depth}`; c.stEl.textContent = `(${a.s},${a.t})`; }
      else { c.dEl.textContent = ''; c.stEl.textContent = ''; }
      c.el.classList.toggle('mv-chip-sel', this.selected === id);
      c.el.classList.toggle('mv-chip-dim', this.selected !== null && this.selected !== id);
    }
  }
}

function formatCount(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}
