export const MAX_PATH_LENGTH = 12;
export const MIN_PATH_LENGTH = 1;
export const NUM_RNGS_PER_EVENT = 2;

const MAX_EVENTS = MAX_PATH_LENGTH + 1;
export const NUM_STATES_SUBPATH = (MAX_EVENTS + 2) * NUM_RNGS_PER_EVENT;
export const NUM_STATES = NUM_STATES_SUBPATH * 2 + 1;
export const TECHNIQUE_STATE = NUM_STATES - 1;

export const DEFAULTS = Object.freeze({
  largeStepProbability: 0.3,
  sigma: 0.01,
  nChains: 1024,
  nBootstrap: 1500,
  resolution: 256,
});

const MAX_CHAINS = 1024;

export const CHAIN_STEPS = (() => {
  const steps = [];
  for (let n = 1; n <= MAX_CHAINS; n *= 2) steps.push(n);
  return steps;
})();

export const OVERLAY_MAX_CHAINS = 16;

const VIZ_PER_STREAM = 11;
export const VIZ_REGIONS = [
  { label: 'eye subpath', from: 0, count: VIZ_PER_STREAM },
  { label: 'light subpath', from: NUM_STATES_SUBPATH, count: VIZ_PER_STREAM },
  { label: '(s,t)', from: TECHNIQUE_STATE, count: 1 },
];
export const VIZ_INDICES = VIZ_REGIONS.flatMap((r) =>
  Array.from({ length: r.count }, (_, i) => r.from + i));
export const VIZ_DIMS = VIZ_INDICES.length;
