import { perspective, lookAt, forwardFromYawPitch } from './mat.js';

const SPEED = 9;
const LOOK = 0.0035;
const PITCH_LIMIT = Math.PI / 2 - 0.02;
const MOVE_KEYS = 'wasdqe';

export class Camera {
  constructor(canvas) {
    this.pos = [6, 3.0, 84];
    this.yaw = -0.16;
    this.pitch = -0.14;
    this.keys = new Set();
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.dragging = true;
      this.lastX = e.clientX; this.lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointerup', (e) => {
      this.dragging = false;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.yaw += (e.clientX - this.lastX) * LOOK;
      this.pitch -= (e.clientY - this.lastY) * LOOK;
      this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
      this.lastX = e.clientX; this.lastY = e.clientY;
    });

    this._onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      const k = e.key.toLowerCase();
      if (!MOVE_KEYS.includes(k)) return;
      if (e.type === 'keydown') this.keys.add(k); else this.keys.delete(k);
      e.preventDefault();
    };
    window.addEventListener('keydown', this._onKey);
    window.addEventListener('keyup', this._onKey);
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey);
    window.removeEventListener('keyup', this._onKey);
  }

  forward() { return forwardFromYawPitch(this.yaw, this.pitch); }

  update(dt) {
    const flat = [Math.sin(this.yaw), 0, -Math.cos(this.yaw)];
    const right = [-flat[2], 0, flat[0]];
    const step = SPEED * dt;
    const move = (v, s) => {
      this.pos[0] += v[0] * s; this.pos[1] += v[1] * s; this.pos[2] += v[2] * s;
    };
    if (this.keys.has('w')) move(flat, step);
    if (this.keys.has('s')) move(flat, -step);
    if (this.keys.has('d')) move(right, step);
    if (this.keys.has('a')) move(right, -step);
    if (this.keys.has('e')) this.pos[1] += step;
    if (this.keys.has('q')) this.pos[1] -= step;
  }

  view() {
    const f = this.forward();
    return lookAt(this.pos, [this.pos[0] + f[0], this.pos[1] + f[1], this.pos[2] + f[2]], [0, 1, 0]);
  }

  proj(aspect) { return perspective((60 * Math.PI) / 180, aspect, 0.05, 500); }
}
