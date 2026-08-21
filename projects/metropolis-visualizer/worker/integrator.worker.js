import { Scene } from '../core/scene.js';
import { MMLT, bootstrapFor } from '../core/mmlt.js';
import { computeDirectEmitterImage } from '../core/direct.js';

let scene = null;
let chains = [];
let chainBase = 0;

self.onmessage = (e) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init': {
      scene = new Scene(msg.sceneJSON, msg.resolution);
      const mode = msg.params.mode || 'mmlt';
      const boot = bootstrapFor(mode, scene, msg.nBootstrap);
      chainBase = msg.chainBase;
      chains = [];
      for (let i = 0; i < msg.nChains; i++) {
        chains.push(new MMLT(scene, boot, { ...msg.params }, (chainBase + i) * 9781 + 12347));
      }
      const bOut = Array.isArray(boot.b) || boot.b instanceof Float64Array ? Array.from(boot.b) : [boot.b];
      let direct = null;
      if (chainBase === 0) direct = computeDirectEmitterImage(scene);
      self.postMessage(
        { type: 'ready', b: bOut, width: scene.width, height: scene.height, direct },
        direct ? [direct.buffer] : [],
      );
      break;
    }
    case 'setParams': {
      for (const ch of chains) Object.assign(ch.params, msg.params);
      break;
    }
    case 'run': {
      runBurst(msg.mutations, msg.budgetMs);
      break;
    }
    case 'stop': {
      chains = [];
      scene = null;
      break;
    }
  }
};

function runBurst(stepsPerChain, budgetMs) {
  if (!scene || chains.length === 0) return;
  const n = chains.length;

  const before = aggregateStats();
  const rounds = budgetMs ? Infinity : stepsPerChain;
  const deadline = budgetMs ? performance.now() + budgetMs : Infinity;
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < n; i++) chains[i].step();
    if (performance.now() >= deadline) break;
  }
  const after = aggregateStats();
  const stats = {
    mutations: after.mut - before.mut,
    accSmall: after.accS - before.accS, totSmall: after.totS - before.totS,
    accLarge: after.accL - before.accL, totLarge: after.totL - before.totL,
  };

  const splatArrays = new Array(n);
  const snapshots = new Array(n);
  let splatCount = 0;
  for (let i = 0; i < n; i++) {
    const ch = chains[i], L = ch.last, st = ch.stats;
    splatArrays[i] = ch.drainSplats();
    splatCount += splatArrays[i].length;
    snapshots[i] = {
      id: chainBase + i,
      x: L.x, y: L.y, px: L.px, py: L.py, hasPos: L.hasPos,
      accepted: L.accepted, isLarge: L.isLarge, s: L.s, t: L.t, depth: L.depth, k: L.k,
      acc: st.acceptedSmall + st.acceptedLarge, tot: st.totalSmall + st.totalLarge,
      curState: Array.from(L.curState), propState: Array.from(L.propState),
    };
  }

  const flat = new Float32Array(splatCount);
  for (let i = 0, off = 0; i < n; i++) { flat.set(splatArrays[i], off); off += splatArrays[i].length; }
  self.postMessage({ type: 'frame', splats: flat, chains: snapshots, stats }, [flat.buffer]);
}

function aggregateStats() {
  let mut = 0, accS = 0, totS = 0, accL = 0, totL = 0;
  for (const ch of chains) {
    const s = ch.stats;
    mut += s.mutations; accS += s.acceptedSmall; totS += s.totalSmall;
    accL += s.acceptedLarge; totL += s.totalLarge;
  }
  return { mut, accS, totS, accL, totL };
}
