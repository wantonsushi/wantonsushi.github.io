const COUNT = 8;
const BASE_WAVELENGTH = 2.6;
const WAVELENGTH_RATIO = 0.74;
const SLOPE_RATIO = 0.86;
const TOTAL_SLOPE = 0.045;
const MEAN_DIRECTION = 0.9;
const SPREAD = 1.05;
const GOLDEN = 0.6180339887;

function build() {
  const data = new Float32Array(COUNT * 4);
  let norm = 0;
  for (let i = 0; i < COUNT; i++) norm += Math.pow(SLOPE_RATIO, i);
  for (let i = 0; i < COUNT; i++) {
    const wavelength = BASE_WAVELENGTH * Math.pow(WAVELENGTH_RATIO, i);
    const angle = MEAN_DIRECTION + SPREAD * (2 * ((i * GOLDEN) % 1) - 1);
    const o = i * 4;
    data[o] = Math.cos(angle);
    data[o + 1] = Math.sin(angle);
    data[o + 2] = (2 * Math.PI) / wavelength;
    data[o + 3] = (TOTAL_SLOPE * Math.pow(SLOPE_RATIO, i)) / norm;
  }
  return data;
}

export const WIND_WAVE_COUNT = COUNT;
export const WIND_WAVES = build();
