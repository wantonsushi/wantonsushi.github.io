import { getGL, makeSceneTarget } from './gl.js';
import { mul, invert4, MIRROR_Y } from './mat.js';
import { Camera } from './camera.js';
import { Pond } from './scene/pond.js';
import { Water } from './water/water.js';
import { Sky } from './render/sky.js';
import { Terrain } from './render/terrain.js';
import { Props } from './render/props.js';
import { Caustics } from './render/caustics.js';
import { WaterRender, SCATTER_COLOR } from './render/waterRender.js';
import { StoneRender } from './render/stoneRender.js';
import { GhostRender } from './render/ghostRender.js';
import { Mist } from './render/mist.js';
import { makeStone, stepStone } from './physics/stone.js';

const SIM_DT = 0.001;
const MAX_STEPS = 40;
const WATER_DT = 1 / 60;
const MAX_WATER_STEPS = 4;
const SUN_DIR = [-0.21, 0.20, -0.96];
const START_X = -78;
const MAX_STONES = 24;
const WORLD_SIZE = [76, 168];

const NO_CLIP = { y: 0, sign: 0 };
const BELOW_WATER = { y: 0, sign: -1 };
const ABOVE_WATER = { y: 0, sign: 1 };

export class App {
  static async create({ canvas }) {
    const gl = getGL(canvas);
    const base = new URL('./assets/', import.meta.url);
    const pond = await Pond.load(new URL('pond.json', base));
    const props = await Props.load(gl, pond, new URL('props', base));
    return new App(gl, canvas, pond, props);
  }

  constructor(gl, canvas, pond, props) {
    this.gl = gl;
    this.canvas = canvas;
    gl.enable(gl.DEPTH_TEST);

    this.camera = new Camera(canvas);
    this.water = new Water(gl, pond, { worldSize: WORLD_SIZE });
    this.sky = new Sky(gl);
    this.terrain = new Terrain(gl, pond);
    this.props = props;
    this.waterRender = new WaterRender(gl, this.water);
    this.stoneRender = new StoneRender(gl);
    this.ghostRender = new GhostRender(gl);
    this.mist = new Mist(gl);
    this.caustics = new Caustics(gl, this.water);
    this.refraction = makeSceneTarget(gl);
    this.reflection = makeSceneTarget(gl);
    this.water.onSplash = (wx, wy, dp) => this.mist.spawn(wx, 0.05, wy, dp / 1.5);

    this.stones = [];
    this.options = { trails: false, gyro: true, timeScale: 1 };
    this.ghost = null;
    this.stats = null;

    this._acc = 0;
    this._waterAcc = 0;
    this._last = 0;
    this._fps = 60;
    this._statTimer = 0;
    this._elapsed = 0;
    this._raf = 0;
    this._running = false;
    this._loop = this._loop.bind(this);
    this._onResize = () => this._resize();

    this._resize();
    window.addEventListener('resize', this._onResize);
  }

  _resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
  }

  launchStone(ic) {
    this.stones.push(makeStone({ ...ic, startX: START_X }));
    if (this.stones.length > MAX_STONES) this.stones.shift();
  }

  updateGhost(ic) { this.ghost = { ...ic, startX: START_X }; }

  clearStones() { this.stones = []; }

  start() {
    if (this._running) return;
    this._running = true;
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._loop);
  }

  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    window.removeEventListener('resize', this._onResize);
    this.camera.dispose();
    const ext = this.gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
  }

  _loop(now) {
    if (!this._running) return;
    const dt = Math.min(0.05, (now - this._last) / 1000) || 0;
    this._last = now;
    this._fps = this._fps * 0.9 + (dt > 0 ? 1 / dt : 60) * 0.1;
    this.advance(dt);
    this._raf = requestAnimationFrame(this._loop);
  }

  advance(dt) {
    this._elapsed += dt;
    this.camera.update(dt);

    const scaled = dt * (this.options.timeScale ?? 1);
    this._acc += scaled;
    let steps = 0;
    while (this._acc >= SIM_DT && steps < MAX_STEPS) {
      for (const st of this.stones) stepStone(st, SIM_DT, this.water, this.options);
      this._acc -= SIM_DT;
      steps++;
    }
    if (steps === MAX_STEPS) this._acc = 0;

    this._waterAcc += scaled;
    let waterSteps = 0;
    while (this._waterAcc >= WATER_DT && waterSteps < MAX_WATER_STEPS) {
      this.water.step(2);
      this._waterAcc -= WATER_DT;
      waterSteps++;
    }
    if (waterSteps === MAX_WATER_STEPS) this._waterAcc = 0;

    this.mist.update(dt);
    this._render();

    this._statTimer += dt;
    if (this._statTimer > 0.1 && this.stats) {
      this.stats.update(this.stones, this._fps);
      this._statTimer = 0;
    }
  }

  _render() {
    const gl = this.gl;
    const { width, height } = this.canvas;
    const view = this.camera.view();
    const vp = mul(this.camera.proj(width / height), view);

    this.caustics.update(SUN_DIR, this._elapsed, this.waterRender.wind);
    this.refraction.resize(width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.refraction.fbo);
    gl.viewport(0, 0, width, height);
    gl.clearColor(SCATTER_COLOR[0], SCATTER_COLOR[1], SCATTER_COLOR[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.terrain.draw(vp, SUN_DIR, BELOW_WATER, this.caustics);
    this.props.draw(vp, SUN_DIR, this._elapsed, BELOW_WATER, this.caustics);

    const mirrorVP = mul(vp, MIRROR_Y);
    this.reflection.resize(width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.reflection.fbo);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.terrain.draw(mirrorVP, SUN_DIR, ABOVE_WATER, this.caustics);
    this.props.draw(mirrorVP, SUN_DIR, this._elapsed, ABOVE_WATER, this.caustics);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.sky.draw(invert4(vp), SUN_DIR, this._elapsed);
    this.terrain.draw(vp, SUN_DIR, NO_CLIP, this.caustics);
    this.props.draw(vp, SUN_DIR, this._elapsed, NO_CLIP, this.caustics);
    this.waterRender.draw(vp, this.camera.pos, SUN_DIR, this._elapsed, this.refraction.tex, this.reflection.tex);
    this.stoneRender.draw(vp, this.camera.pos, SUN_DIR, this.stones, this.options.trails);
    this.mist.draw(vp, height);
    this.ghostRender.draw(vp, SUN_DIR, this.ghost);
  }
}
