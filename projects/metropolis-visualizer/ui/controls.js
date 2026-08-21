import { CHAIN_STEPS, OVERLAY_MAX_CHAINS } from '../core/constants.js';

const chainsFromIndex = (i) => CHAIN_STEPS[Math.max(0, Math.min(CHAIN_STEPS.length - 1, i))];
const indexFromChains = (n) => {
  let best = 0;
  for (let i = 1; i < CHAIN_STEPS.length; i++) {
    if (Math.abs(CHAIN_STEPS[i] - n) < Math.abs(CHAIN_STEPS[best] - n)) best = i;
  }
  return best;
};

export function buildControls(root, app, { initial, onBackToConfig }) {
  root.innerHTML = `
    <h3 class="mv-ctrl-section">Setup</h3>
    <div class="mv-ctrl-group">
      <label for="mv-mode">Algorithm</label>
      <select id="mv-mode">
        <option value="mmlt">Multiplexed MLT</option>
        <option value="pssmlt">PSSMLT</option>
      </select>
      <small>Multiplexed MLT chains have a fixed path length.</small>
    </div>
    <div class="mv-ctrl-group">
      <label for="mv-res">Resolution</label>
      <select id="mv-res">
        <option value="256">256</option>
        <option value="512">512</option>
      </select>
    </div>
    <div class="mv-ctrl-group">
      <label for="mv-chains">Chains</label>
      <input id="mv-chains" type="range" min="0" max="${CHAIN_STEPS.length - 1}" step="1">
      <output id="mv-out-chains"></output>
    </div>

    <h3 class="mv-ctrl-section">Mutation</h3>
    <div class="mv-ctrl-group">
      <label for="mv-large">Large steps</label>
      <input id="mv-large" type="range" min="0" max="1" step="0.01">
      <output id="mv-out-large"></output>
      <small>Fraction of mutations that fully resample the path.</small>
    </div>
    <div class="mv-ctrl-group">
      <label for="mv-sigma">Step size &sigma;</label>
      <input id="mv-sigma" type="range" min="0.001" max="0.1" step="0.001">
      <output id="mv-out-sigma"></output>
    </div>
    <div class="mv-ctrl-group">
      <label for="mv-speed">Speed</label>
      <input id="mv-speed" type="range" min="0" max="100" step="1">
      <output id="mv-out-speed"></output>
    </div>

    <h3 class="mv-ctrl-section">View</h3>
    <div class="mv-ctrl-group">
      <label for="mv-exp">Exposure</label>
      <input id="mv-exp" type="range" min="-4" max="4" step="0.1">
      <output id="mv-out-exp"></output>
    </div>
    <div id="mv-toggles" class="mv-toggles">
      <label><input id="mv-t-prop" type="checkbox" checked> Proposals (accept/reject)</label>
      <label><input id="mv-t-trail" type="checkbox"> Trails</label>
      <small class="mv-overlay-note">Turned off above ${OVERLAY_MAX_CHAINS} chains for performance.</small>
    </div>

    <div class="mv-buttons">
      <button id="mv-pause">Pause</button>
      <button id="mv-reset">Reset</button>
      <button id="mv-back">Change scene</button>
    </div>`;

  const $ = (id) => root.querySelector(id);
  const mode = $('#mv-mode'), res = $('#mv-res');
  const large = $('#mv-large'), sigma = $('#mv-sigma'), chains = $('#mv-chains'), exp = $('#mv-exp'), speed = $('#mv-speed');
  const outLarge = $('#mv-out-large'), outSigma = $('#mv-out-sigma'), outChains = $('#mv-out-chains'), outExp = $('#mv-out-exp'), outSpeed = $('#mv-out-speed');

  const prop = $('#mv-t-prop'), trail = $('#mv-t-trail');
  mode.value = initial.mode || 'mmlt';
  res.value = String(initial.resolution);
  large.value = initial.largeStepProbability;
  sigma.value = initial.sigma;
  chains.value = indexFromChains(initial.nChains);
  exp.value = Math.log2(initial.exposure);
  speed.value = initial.speedLevel ?? 0;
  if (initial.showProposals === false) prop.checked = false;
  if (initial.showTrails) trail.checked = true;
  app.setSpeed(parseFloat(speed.value));
  app.setOverlayOptions({ showProposals: prop.checked, showTrails: trail.checked });

  const currentSettings = () => ({
    mode: mode.value,
    resolution: parseInt(res.value, 10),
    nChains: chainsFromIndex(parseInt(chains.value, 10)),
    largeStepProbability: parseFloat(large.value),
    sigma: parseFloat(sigma.value),
    exposure: Math.pow(2, parseFloat(exp.value)),
    speedLevel: parseFloat(speed.value),
    showProposals: prop.checked,
    showTrails: trail.checked,
  });

  const fmtExp = () => (Math.pow(2, parseFloat(exp.value))).toFixed(2) + '×';
  const sync = () => {
    outLarge.textContent = parseFloat(large.value).toFixed(2);
    outSigma.textContent = parseFloat(sigma.value).toFixed(3);
    outChains.textContent = chainsFromIndex(parseInt(chains.value, 10));
    outExp.textContent = fmtExp();
    outSpeed.textContent = app.speedLabel;
  };
  sync();

  large.oninput = () => { sync(); app.setParams({ largeStepProbability: parseFloat(large.value) }); };
  sigma.oninput = () => { sync(); app.setParams({ sigma: parseFloat(sigma.value) }); };
  exp.oninput = () => { sync(); app.setExposure(Math.pow(2, parseFloat(exp.value))); };
  speed.oninput = () => { app.setSpeed(parseFloat(speed.value)); sync(); };

  const overlaysToggleEl = $('#mv-toggles');
  const applyOverlayPolicy = () => {
    const many = chainsFromIndex(parseInt(chains.value, 10)) > OVERLAY_MAX_CHAINS;
    prop.disabled = trail.disabled = many;
    overlaysToggleEl.classList.toggle('mv-disabled', many);
    if (many) { prop.checked = false; trail.checked = false; }
    app.setOverlayOptions({ showProposals: prop.checked, showTrails: trail.checked });
  };
  applyOverlayPolicy();

  let onRestart = () => {};
  mode.onchange = () => onRestart(currentSettings());
  res.onchange = () => onRestart(currentSettings());
  chains.onchange = () => { sync(); applyOverlayPolicy(); onRestart(currentSettings()); };
  chains.oninput = sync;

  prop.onchange = (e) => app.setOverlayOptions({ showProposals: e.target.checked });
  trail.onchange = (e) => app.setOverlayOptions({ showTrails: e.target.checked });

  const pauseBtn = $('#mv-pause');
  pauseBtn.onclick = () => {
    if (app.running) { app.pause(); pauseBtn.textContent = 'Resume'; }
    else { app.resume(); pauseBtn.textContent = 'Pause'; }
  };
  $('#mv-reset').onclick = () => app.reset();
  $('#mv-back').onclick = () => onBackToConfig();

  return {
    setExposure: (e) => { exp.value = Math.log2(e); sync(); },
    onRestart: (fn) => { onRestart = fn; },
    setPaused: (p) => { pauseBtn.textContent = p ? 'Resume' : 'Pause'; },
  };
}
