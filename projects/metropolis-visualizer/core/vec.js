export const vec = (x = 0, y = 0, z = 0) => ({ x, y, z });

export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const mul = (a, b) => ({ x: a.x * b.x, y: a.y * b.y, z: a.z * b.z });
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const norm = (a) => {
  const l = Math.sqrt(dot(a, a));
  return l > 0 ? scale(a, 1 / l) : a;
};
export const luminance = (a) => 0.2126 * a.x + 0.7152 * a.y + 0.0722 * a.z;

export const matIdentity = () => {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
};

export const xformDir = (m, d) => ({
  x: m[0] * d.x + m[1] * d.y + m[2] * d.z,
  y: m[4] * d.x + m[5] * d.y + m[6] * d.z,
  z: m[8] * d.x + m[9] * d.y + m[10] * d.z,
});
