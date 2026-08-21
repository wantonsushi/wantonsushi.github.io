const DEFAULTS = {
  speed: 12,
  beta: 3,
  theta: 15,
  spinHz: 18,
  mass: 0.1,
  radius: 0.05,
  startHeight: 0.2,
  timeScale: 1,
  trails: false,
  gyro: true,
};

export function buildControls(root, app) {
  root.innerHTML = `
    <h3 class="ss-ctrl-section">Throw</h3>
    <div class="ss-ctrl-group">
      <label for="ss-speed">Speed</label>
      <input id="ss-speed" type="range" min="10" max="60" step="0.1">
      <output id="ss-o-speed"></output>
    </div>
    <div class="ss-ctrl-group">
      <label for="ss-beta">Approach &beta;</label>
      <input id="ss-beta" type="range" min="0" max="45" step="0.5">
      <output id="ss-o-beta"></output>
      <small>Angle the stone is thrown at.</small>
    </div>
    <div class="ss-ctrl-group">
      <label for="ss-theta">Tilt &theta;</label>
      <input id="ss-theta" type="range" min="0" max="45" step="0.5">
      <output id="ss-o-theta"></output>
      <small>Inclination of the stone face.</small>
    </div>
    <div class="ss-ctrl-group">
      <label for="ss-spin">Spin</label>
      <input id="ss-spin" type="range" min="0" max="30" step="0.5">
      <output id="ss-o-spin"></output>
    </div>
    <div class="ss-ctrl-group">
      <label for="ss-start">Release height</label>
      <input id="ss-start" type="range" min="0.02" max="2.5" step="0.02">
      <output id="ss-o-start"></output>
    </div>

    <h3 class="ss-ctrl-section">Stone</h3>
    <div class="ss-ctrl-group">
      <label for="ss-mass">Mass</label>
      <input id="ss-mass" type="range" min="0.02" max="2.0" step="0.01">
      <output id="ss-o-mass"></output>
    </div>
    <div class="ss-ctrl-group">
      <label for="ss-radius">Radius</label>
      <input id="ss-radius" type="range" min="0.02" max="0.10" step="0.002">
      <output id="ss-o-radius"></output>
    </div>

    <div class="ss-buttons">
      <button id="ss-launch" class="ss-primary">Launch stone</button>
      <button id="ss-clear">Clear</button>
    </div>

    <h3 class="ss-ctrl-section">Playback</h3>
    <div class="ss-ctrl-group">
      <label for="ss-time">Sim speed</label>
      <input id="ss-time" type="range" min="0.05" max="1" step="0.05">
      <output id="ss-o-time"></output>
    </div>

    <h3 class="ss-ctrl-section">Options</h3>
    <div class="ss-toggles">
      <label><input id="ss-trails" type="checkbox"> Bounce trails</label>
      <label><input id="ss-gyro" type="checkbox" checked> Gyroscopic stability model</label>
      <small>When off, tilt is held fixed regardless of spin.</small>
    </div>`;

  const $ = (id) => root.querySelector(id);
  const speed = $('#ss-speed'), beta = $('#ss-beta'), theta = $('#ss-theta'), spin = $('#ss-spin');
  const start = $('#ss-start'), time = $('#ss-time');
  const mass = $('#ss-mass'), radius = $('#ss-radius');
  const trails = $('#ss-trails'), gyro = $('#ss-gyro');

  speed.value = DEFAULTS.speed; beta.value = DEFAULTS.beta; theta.value = DEFAULTS.theta;
  spin.value = DEFAULTS.spinHz; mass.value = DEFAULTS.mass; radius.value = DEFAULTS.radius;
  start.value = DEFAULTS.startHeight; time.value = DEFAULTS.timeScale;
  trails.checked = DEFAULTS.trails; gyro.checked = DEFAULTS.gyro;

  const sync = () => {
    $('#ss-o-speed').textContent = (+speed.value).toFixed(1) + ' m/s';
    $('#ss-o-beta').textContent = (+beta.value).toFixed(0) + '°';
    $('#ss-o-theta').textContent = (+theta.value).toFixed(0) + '°';
    $('#ss-o-spin').textContent = (+spin.value).toFixed(1) + ' rev/s';
    $('#ss-o-start').textContent = (+start.value).toFixed(2) + ' m';
    $('#ss-o-time').textContent = (+time.value === 1) ? 'real time' : (+time.value).toFixed(2) + '×';
    $('#ss-o-mass').textContent = (+mass.value).toFixed(3) + ' kg';
    $('#ss-o-radius').textContent = ((+radius.value) * 100).toFixed(1) + ' cm';
  };
  sync();

  const DEG = Math.PI / 180;
  const currentIC = () => ({
    speed: +speed.value,
    beta: +beta.value * DEG,
    theta: +theta.value * DEG,
    spinHz: +spin.value,
    mass: +mass.value,
    radius: +radius.value,
    startHeight: +start.value,
  });

  const refreshGhost = () => app.updateGhost(currentIC());
  [speed, beta, theta, start, radius].forEach((el) => (el.oninput = () => { sync(); refreshGhost(); }));
  [spin, mass].forEach((el) => (el.oninput = sync));
  time.oninput = () => { sync(); app.options.timeScale = +time.value; };

  $('#ss-launch').onclick = () => app.launchStone(currentIC());
  $('#ss-clear').onclick = () => app.clearStones();

  const onSpace = (e) => {
    if (e.code !== 'Space' && e.key !== ' ') return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'BUTTON')) return;
    e.preventDefault();
    app.launchStone(currentIC());
  };
  window.addEventListener('keydown', onSpace);
  trails.onchange = () => (app.options.trails = trails.checked);
  gyro.onchange = () => (app.options.gyro = gyro.checked);

  app.options.trails = trails.checked;
  app.options.gyro = gyro.checked;
  app.options.timeScale = +time.value;
  refreshGhost();

  return () => window.removeEventListener('keydown', onSpace);
}
