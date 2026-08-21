import { App } from './app.js';
import { buildControls } from './controls.js';
import { Stats } from './stats.js';

const $ = (id) => document.getElementById(id);
const configRoot = $('ss-config-root');
const liveRoot = $('ss-live-root');
const backLink = $('ss-back');

let webglOK = true;
try {
  const test = document.createElement('canvas').getContext('webgl2');
  webglOK = !!test;
} catch { webglOK = false; }

if (!webglOK) {
  $('ss-warn').hidden = false;
  $('ss-start').disabled = true;
}

let app = null;
let disposeControls = null;

function setBackToHome() {
  backLink.textContent = 'Euan Hughes';
  backLink.setAttribute('href', '../../#top');
  backLink.onclick = null;
}
function setBackToConfig() {
  backLink.textContent = 'Exit Demo';
  backLink.setAttribute('href', '#');
  backLink.onclick = (e) => { e.preventDefault(); showConfig(); };
}

function showConfig() {
  if (disposeControls) { disposeControls(); disposeControls = null; }
  if (app) { app.stop(); app = null; }
  liveRoot.hidden = true;
  liveRoot.innerHTML = '';
  configRoot.hidden = false;
  $('ss-start').disabled = false;
  setBackToHome();
  window.scrollTo(0, 0);
}

function buildLiveDOM() {
  liveRoot.innerHTML = `
    <h1 class="pa-title">Stone Skipping Physics Simulation</h1>
    <div class="ss-stage">
      <div class="ss-col-main">
        <div class="ss-canvas-wrap">
          <canvas id="ss-gl" tabindex="0"></canvas>
          <div class="ss-overlay" id="ss-overlay" aria-live="polite"></div>
        </div>
        <div class="ss-hint"><b>Move the camera:</b> <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · <kbd>Q</kbd>/<kbd>E</kbd> down/up · drag to look · <kbd>Space</kbd> (or Launch) to throw a stone</div>
      </div>
      <div class="ss-col-side">
        <div class="ss-panel" id="ss-controls"></div>
        <div class="ss-panel" id="ss-stats"></div>
      </div>
    </div>`;
}

async function startDemo() {
  configRoot.hidden = true;
  liveRoot.hidden = false;
  setBackToConfig();
  buildLiveDOM();
  window.scrollTo(0, 0);

  try {
    app = await App.create({ canvas: $('ss-gl') });
    disposeControls = buildControls($('ss-controls'), app);
    app.stats = new Stats($('ss-stats'), $('ss-overlay'));
    app.start();
  } catch (e) {
    liveRoot.innerHTML = `<div class="ss-fallback">${e.message}</div>`;
    throw e;
  }
}

$('ss-start').onclick = () => { $('ss-start').disabled = true; startDemo(); };
setBackToHome();
