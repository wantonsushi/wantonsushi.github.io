export class Inspector {
  constructor() {
    this.chains = new Map();
    this.trails = new Map();
    this.trailLen = 24;
  }

  update(snapshots, now = performance.now()) {
    for (const s of snapshots) {
      s.tUpdate = now;
      this.chains.set(s.id, s);
      let tr = this.trails.get(s.id);
      if (!tr) { tr = []; this.trails.set(s.id, tr); }
      tr.push(s.accepted ? [s.px, s.py] : [s.x, s.y]);
      if (tr.length > this.trailLen) tr.shift();
    }
  }

  reset() {
    this.chains.clear();
    this.trails.clear();
  }
}
