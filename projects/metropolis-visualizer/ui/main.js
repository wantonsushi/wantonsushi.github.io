import { App } from './app.js';
import { buildConfig } from './config.js';
import { buildControls } from './controls.js';
import { getScene } from '../scenes/catalog.js';
import { DEFAULTS } from '../core/constants.js';

const $ = (id) => document.getElementById(id);
const configRoot = $('mv-config-root');
const liveRoot = $('mv-live-root');

let app = null;
let controls = null;
let webglOK = true;
try {
  const test = document.createElement('canvas').getContext('webgl2');
  webglOK = !!test && !!test.getExtension('EXT_color_buffer_float');
} catch { webglOK = false; }

const backLink = $('mv-back');
function setBackToConfig() {
  backLink.textContent = 'Scenes';
  backLink.setAttribute('href', '#');
  backLink.onclick = (e) => { e.preventDefault(); showConfig(); };
}
function setBackToHome() {
  backLink.textContent = 'Euan Hughes';
  backLink.setAttribute('href', '../../#top');
  backLink.onclick = null;
}

function showConfig() {
  if (app) app.stop();
  liveRoot.hidden = true;
  configRoot.hidden = false;
  setBackToHome();
  buildConfig(configRoot, { webglOK, onLaunch: launch });
}

async function launch(opts) {
  const meta = getScene(opts.sceneId);
  let sceneJSON;
  try {
    const res = await fetch(new URL('../' + meta.file, import.meta.url));
    if (!res.ok) throw new Error(res.status);
    if (meta.gzip) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        sceneJSON = JSON.parse(await new Response(stream).text());
      } else {
        sceneJSON = JSON.parse(new TextDecoder().decode(bytes));
      }
    } else {
      sceneJSON = await res.json();
    }
  } catch (e) {
    alert(`Couldn’t load “${meta.name}”.\n\n${e}`);
    return;
  }
  startWithSceneJSON(sceneJSON, opts);
}

async function startWithSceneJSON(sceneJSON, opts) {
  configRoot.hidden = true;
  liveRoot.hidden = false;
  setBackToConfig();
  buildLiveDOM();
  $('mv-gl').closest('.mv-canvas-wrap').style.setProperty('--mv-aspect', String(sceneJSON.camera.aspect || 1));

  app = new App({
    glCanvas: $('mv-gl'),
    overlayCanvas: $('mv-overlay'),
    diagRoot: $('mv-diag'),
    techCanvas: $('mv-techspace'),
  });

  const startOpts = {
    resolution: opts.resolution,
    nChains: opts.nChains,
    largeStepProbability: opts.largeStepProbability,
    sigma: opts.sigma,
    mode: opts.mode || 'mmlt',
    exposure: opts.exposure,
    nBootstrap: DEFAULTS.nBootstrap,
  };
  const name = sceneJSON.name;
  app.onProgress = (p) => {
    const banner = $('mv-banner');
    if (!banner) return;
    if (p.phase === 'bootstrap') {
      banner.innerHTML =
        `<div class="mv-spinner"></div>` +
        `<div class="mv-banner-title">Bootstrapping ${name}</div>` +
        `<div class="mv-banner-sub">Estimating normalization constant and seeding Markov chains.</div>`;
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }
  };
  app.onAutoExposure = (e) => controls && controls.setExposure(e);
  await app.start(sceneJSON, startOpts);

  controls = buildControls($('mv-controls'), app, {
    initial: {
      largeStepProbability: opts.largeStepProbability, sigma: opts.sigma,
      nChains: opts.nChains, resolution: opts.resolution,
      exposure: opts.exposure ?? app.params.exposure,
      mode: startOpts.mode, speedLevel: opts.speedLevel,
      showProposals: opts.showProposals, showTrails: opts.showTrails,
    },
    onBackToConfig: showConfig,
  });
  controls.onRestart((settings) => {
    startWithSceneJSON(sceneJSON, { ...opts, ...settings });
  });
}

function buildLiveDOM() {
  liveRoot.innerHTML = `
    <div class="mv-stage">
      <div class="mv-col-main">
        <div class="mv-canvas-wrap">
          <canvas id="mv-gl"></canvas>
          <canvas id="mv-overlay"></canvas>
          <div id="mv-banner" class="mv-banner" hidden></div>
        </div>
        <div class="mv-panel mv-techpanel">
          <div class="mv-perchain-title">Primary sample space &mdash; each chain in [0,1]<sup>&infin;</sup></div>
          <canvas id="mv-techspace" class="mv-techcanvas"></canvas>
        </div>
      </div>
      <div class="mv-col-side">
        <div id="mv-controls" class="mv-panel mv-col-controls"></div>
        <div id="mv-diag" class="mv-panel mv-diag"></div>
      </div>
    </div>`;
}

showConfig();
