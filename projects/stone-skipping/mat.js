const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

const cross3 = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export function norm3(a) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

export function mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

export function invert4(a) {
  const inv = new Float32Array(16);
  inv[0] = a[5]*a[10]*a[15]-a[5]*a[11]*a[14]-a[9]*a[6]*a[15]+a[9]*a[7]*a[14]+a[13]*a[6]*a[11]-a[13]*a[7]*a[10];
  inv[4] = -a[4]*a[10]*a[15]+a[4]*a[11]*a[14]+a[8]*a[6]*a[15]-a[8]*a[7]*a[14]-a[12]*a[6]*a[11]+a[12]*a[7]*a[10];
  inv[8] = a[4]*a[9]*a[15]-a[4]*a[11]*a[13]-a[8]*a[5]*a[15]+a[8]*a[7]*a[13]+a[12]*a[5]*a[11]-a[12]*a[7]*a[9];
  inv[12] = -a[4]*a[9]*a[14]+a[4]*a[10]*a[13]+a[8]*a[5]*a[14]-a[8]*a[6]*a[13]-a[12]*a[5]*a[10]+a[12]*a[6]*a[9];
  inv[1] = -a[1]*a[10]*a[15]+a[1]*a[11]*a[14]+a[9]*a[2]*a[15]-a[9]*a[3]*a[14]-a[13]*a[2]*a[11]+a[13]*a[3]*a[10];
  inv[5] = a[0]*a[10]*a[15]-a[0]*a[11]*a[14]-a[8]*a[2]*a[15]+a[8]*a[3]*a[14]+a[12]*a[2]*a[11]-a[12]*a[3]*a[10];
  inv[9] = -a[0]*a[9]*a[15]+a[0]*a[11]*a[13]+a[8]*a[1]*a[15]-a[8]*a[3]*a[13]-a[12]*a[1]*a[11]+a[12]*a[3]*a[9];
  inv[13] = a[0]*a[9]*a[14]-a[0]*a[10]*a[13]-a[8]*a[1]*a[14]+a[8]*a[2]*a[13]+a[12]*a[1]*a[10]-a[12]*a[2]*a[9];
  inv[2] = a[1]*a[6]*a[15]-a[1]*a[7]*a[14]-a[5]*a[2]*a[15]+a[5]*a[3]*a[14]+a[13]*a[2]*a[7]-a[13]*a[3]*a[6];
  inv[6] = -a[0]*a[6]*a[15]+a[0]*a[7]*a[14]+a[4]*a[2]*a[15]-a[4]*a[3]*a[14]-a[12]*a[2]*a[7]+a[12]*a[3]*a[6];
  inv[10] = a[0]*a[5]*a[15]-a[0]*a[7]*a[13]-a[4]*a[1]*a[15]+a[4]*a[3]*a[13]+a[12]*a[1]*a[7]-a[12]*a[3]*a[5];
  inv[14] = -a[0]*a[5]*a[14]+a[0]*a[6]*a[13]+a[4]*a[1]*a[14]-a[4]*a[2]*a[13]-a[12]*a[1]*a[6]+a[12]*a[2]*a[5];
  inv[3] = -a[1]*a[6]*a[11]+a[1]*a[7]*a[10]+a[5]*a[2]*a[11]-a[5]*a[3]*a[10]-a[9]*a[2]*a[7]+a[9]*a[3]*a[6];
  inv[7] = a[0]*a[6]*a[11]-a[0]*a[7]*a[10]-a[4]*a[2]*a[11]+a[4]*a[3]*a[10]+a[8]*a[2]*a[7]-a[8]*a[3]*a[6];
  inv[11] = -a[0]*a[5]*a[11]+a[0]*a[7]*a[9]+a[4]*a[1]*a[11]-a[4]*a[3]*a[9]-a[8]*a[1]*a[7]+a[8]*a[3]*a[5];
  inv[15] = a[0]*a[5]*a[10]-a[0]*a[6]*a[9]-a[4]*a[1]*a[10]+a[4]*a[2]*a[9]+a[8]*a[1]*a[6]-a[8]*a[2]*a[5];
  let det = a[0]*inv[0]+a[1]*inv[4]+a[2]*inv[8]+a[3]*inv[12];
  det = det ? 1 / det : 0;
  for (let i = 0; i < 16; i++) inv[i] *= det;
  return inv;
}

export function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  const o = new Float32Array(16);
  o[0] = f / aspect;
  o[5] = f;
  o[10] = (far + near) * nf;
  o[11] = -1;
  o[14] = 2 * far * near * nf;
  return o;
}

export function lookAt(eye, center, up) {
  const z = norm3(sub3(eye, center));
  const x = norm3(cross3(up, z));
  const y = cross3(z, x);
  const o = new Float32Array(16);
  o[0] = x[0]; o[4] = x[1]; o[8] = x[2]; o[12] = -dot3(x, eye);
  o[1] = y[0]; o[5] = y[1]; o[9] = y[2]; o[13] = -dot3(y, eye);
  o[2] = z[0]; o[6] = z[1]; o[10] = z[2]; o[14] = -dot3(z, eye);
  o[15] = 1;
  return o;
}

export const forwardFromYawPitch = (yaw, pitch) => {
  const cp = Math.cos(pitch);
  return [Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
};

export const MIRROR_Y = new Float32Array([1,0,0,0, 0,-1,0,0, 0,0,1,0, 0,0,0,1]);

function basisMatrix(pos, col0, col1, col2) {
  const o = new Float32Array(16);
  o[0] = col0[0]; o[1] = col0[1]; o[2] = col0[2];
  o[4] = col1[0]; o[5] = col1[1]; o[6] = col1[2];
  o[8] = col2[0]; o[9] = col2[1]; o[10] = col2[2];
  o[12] = pos[0]; o[13] = pos[1]; o[14] = pos[2]; o[15] = 1;
  return o;
}

export function stoneModel(pos, normal, heading, radius, halfThick) {
  const up = norm3(normal);
  let fwd = sub3(heading, scale3(up, dot3(heading, up)));
  if (Math.hypot(fwd[0], fwd[1], fwd[2]) < 1e-5) fwd = [1, 0, 0];
  fwd = norm3(fwd);
  return basisMatrix(pos, scale3(cross3(fwd, up), radius), scale3(up, halfThick), scale3(fwd, radius));
}

export function directionMatrix(pos, dir, length, width) {
  const f = norm3(dir);
  const up = Math.abs(f[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const right = norm3(cross3(up, f));
  return basisMatrix(pos, scale3(f, length), scale3(cross3(f, right), width), scale3(right, width));
}

export function normalMat3(m) {
  const a = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  const det =
    a[0] * (a[4] * a[8] - a[5] * a[7]) -
    a[1] * (a[3] * a[8] - a[5] * a[6]) +
    a[2] * (a[3] * a[7] - a[4] * a[6]);
  const id = det ? 1 / det : 0;
  return new Float32Array([
    (a[4] * a[8] - a[5] * a[7]) * id, (a[5] * a[6] - a[3] * a[8]) * id, (a[3] * a[7] - a[4] * a[6]) * id,
    (a[2] * a[7] - a[1] * a[8]) * id, (a[0] * a[8] - a[2] * a[6]) * id, (a[1] * a[6] - a[0] * a[7]) * id,
    (a[1] * a[5] - a[2] * a[4]) * id, (a[2] * a[3] - a[0] * a[5]) * id, (a[0] * a[4] - a[1] * a[3]) * id,
  ]);
}
