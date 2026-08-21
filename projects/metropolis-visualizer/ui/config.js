import { SCENES } from '../scenes/catalog.js';
import { DEFAULTS } from '../core/constants.js';
import { DEFAULT_SPEED_LEVEL } from './app.js';

const defaultLaunchOptions = () => ({
  mode: 'pssmlt',
  nChains: 1,
  speedLevel: DEFAULT_SPEED_LEVEL,
  resolution: DEFAULTS.resolution,
  largeStepProbability: DEFAULTS.largeStepProbability,
  sigma: DEFAULTS.sigma,
});

export function buildConfig(root, { onLaunch, webglOK }) {
  root.innerHTML = `
    <div class="mv-config">
      <h1 class="pa-title">Metropolis Light Transport Visualizer</h1>

      <div class="pa-body">
        <p>A visualizer for the Metropolis algorithms used in rendering. It allows you to
          watch the Markov chains mutate and render the scene in real-time. I wanted it to be easily accessible, so
          I decided to build it in WebGL, something I was not especially comfortable in, making it a fun challenge.</p>
        <p> This demo was partly inspired by <a href="https://chi-feng.github.io/mcmc-demo/" target="_blank" rel="noopener">this</a> excellent MCMC visualizer. </p>
      </div>

      ${webglOK ? '' : '<p class="mv-warn">WebGL2 is unavailable in this browser. Try a recent Chrome, Edge, or Safari.</p>'}
      <p class="mv-desktop-rec">For the best experience, please try this demo on a computer.</p>
      <p class="mv-sub mv-pick">Pick a scene, then press Start.</p>
      <div class="mv-scene-cards" id="mv-cards"></div>
      <button id="mv-start" class="mv-launch" ${webglOK ? '' : 'disabled'}>Start</button>

      <footer class="pa-refs">
        <h2>References</h2>
        <ol>
          <li>Bitterli, B. Rendering Resources. 2016.
            <a href="https://benedikt-bitterli.me/resources/" target="_blank" rel="noopener">link</a></li>
          <li>Hachisuka, T., Kaplanyan, A. S., and Dachsbacher, C. Multiplexed Metropolis light transport.
            <i>ACM Trans. Graph.</i> 33, 4 (2014), 100:1–100:10.
            <a href="https://doi.org/10.1145/2601097.2601138" target="_blank" rel="noopener">doi</a></li>
          <li>Kelemen, C., Szirmay-Kalos, L., Antal, G., and Csonka, F. A simple and robust mutation strategy for
            the Metropolis light transport algorithm. <i>Computer Graphics Forum</i> 21, 3 (2002), 531–540.
            <a href="https://doi.org/10.1111/1467-8659.t01-1-00703" target="_blank" rel="noopener">doi</a></li>
          <li>Pharr, M., Jakob, W. &amp; Humphreys, G. <i>Physically Based Rendering</i> (pbrt-v3). 2016.
            <a href="https://pbrt.org/" target="_blank" rel="noopener">link</a></li>
        </ol>
      </footer>
    </div>`;

  const cardsEl = root.querySelector('#mv-cards');
  let selected = SCENES[0].id;
  for (const s of SCENES) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'mv-card' + (s.id === selected ? ' mv-card-sel' : '') + (s.tier === 'experimental' ? ' mv-card-exp' : '');
    card.dataset.id = s.id;
    const thumb = s.thumb
      ? `<img class="mv-card-thumb" src="${new URL('../' + s.thumb, import.meta.url)}" alt="${s.name} preview" loading="lazy">`
      : `<div class="mv-card-thumb mv-card-noimg"></div>`;
    card.innerHTML = `${thumb}<div class="mv-card-name">${s.name}${s.tier === 'experimental' ? ' <span class="mv-tag">heavy</span>' : ''}</div>`;
    card.onclick = () => {
      selected = s.id;
      cardsEl.querySelectorAll('.mv-card').forEach((c) => c.classList.toggle('mv-card-sel', c.dataset.id === selected));
    };
    cardsEl.appendChild(card);
  }

  root.querySelector('#mv-start').onclick = () => onLaunch({ sceneId: selected, ...defaultLaunchOptions() });
}
