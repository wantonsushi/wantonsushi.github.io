import { vec, dot } from './vec.js';

export class Frame {
  constructor(n) {
    this.n = n;
    const sign = n.z >= 0 ? 1 : -1;
    const a = -1 / (sign + n.z);
    const b = n.x * n.y * a;
    this.t = vec(1 + sign * n.x * n.x * a, sign * b, -sign * n.x);
    this.b = vec(b, sign + n.y * n.y * a, -n.y);
  }

  toLocal(w) {
    return vec(dot(w, this.t), dot(w, this.b), dot(w, this.n));
  }

  toWorld(w) {
    return vec(
      this.t.x * w.x + this.b.x * w.y + this.n.x * w.z,
      this.t.y * w.x + this.b.y * w.y + this.n.y * w.z,
      this.t.z * w.x + this.b.z * w.y + this.n.z * w.z,
    );
  }
}
