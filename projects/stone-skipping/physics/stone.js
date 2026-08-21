const RHO_W = 1000;
const G = 9.81;
const CL = 1.0;
const CF = 1.0;
const CL_AOA = 3.7;
const CM = 1.0;

const SIN_EPS = 1e-3;
const CONTACT_DT = 1e-5;
const MIN_CONTACT_DT = 1e-7;
const CONTACT_MAX = 0.4;
const ATT_DAMP = 0.04;
const HISTORY = 600;

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

function immersedArea(s, R) {
  if (s <= 0 || s >= 2 * R) return 0;
  const u = 1 - s / R;
  return R * R * (Math.acos(u) - u * Math.sqrt(Math.max(0, 1 - u * u)));
}

function immersedLever(s, R, area) {
  if (area <= 0) return 0;
  const u = 1 - s / R;
  const chord = 2 * R * Math.sqrt(Math.max(0, 1 - u * u));
  return (chord * chord * chord) / (12 * area);
}

export function makeStone(ic) {
  const { speed, beta, theta, spinHz, mass, radius } = ic;
  const startHeight = ic.startHeight ?? 0.6;
  const startX = ic.startX ?? 0;
  const thickness = ic.thickness ?? Math.max(0.004, radius * 0.08);
  return {
    x: startX,
    z: startHeight,
    vx: speed * Math.cos(beta),
    vz: -speed * Math.sin(beta),
    vx0: speed * Math.cos(beta),
    theta,
    theta0: theta,
    thetaDot: 0,
    phi: 0,
    phiDot: spinHz * 2 * Math.PI,
    R: radius,
    M: mass,
    halfThick: thickness * 0.5,
    J1: 0.25 * mass * radius * radius,
    bounces: 0,
    dist: 0,
    alive: true,
    immersed: false,
    immersedTime: 0,
    history: new Float32Array(HISTORY * 2),
    historyCount: 0,
    historyHead: 0,
    pendingDeposit: null,
  };
}

export const HEADING = [0, 0, -1];
export const stoneWorld = (st) => [0, st.z, -st.x];
export const stoneNormal = (st) => [0, Math.cos(st.theta), Math.sin(st.theta)];

const D = { ax: 0, az: 0, thetaAcc: 0, area: 0 };

function deriv(st, z, vx, vz, theta, thetaDot, waterH) {
  const V = Math.hypot(vx, vz);
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);
  const depth = waterH - (z - st.R * sinT);

  let s;
  if (sinT >= SIN_EPS) s = depth / sinT;
  else s = depth > 0 ? 2 * st.R : 0;
  s = clamp(s, 0, 2 * st.R);

  const area = immersedArea(s, st.R);
  const q = 0.5 * RHO_W * V * V * area;
  const ma = CM * RHO_W * area * (2 * st.halfThick);

  let dma_dt = 0;
  if (area > 0 && sinT >= SIN_EPS) {
    const u = 1 - s / st.R;
    const dArea_ds = 2 * st.R * Math.sqrt(Math.max(0, 1 - u * u));
    dma_dt = Math.max(0, CM * RHO_W * (2 * st.halfThick) * dArea_ds * (-vz / sinT));
  }

  const clEff = CL * Math.min(1, CL_AOA * sinT);
  const liftZ = q * (clEff * cosT - CF * sinT);
  const ell = immersedLever(s, st.R, area);
  const Mtheta = area > 0 ? st.M * G * ell : 0;
  const cDamp = area > 0 ? ATT_DAMP * (area / (Math.PI * st.R * st.R)) : 0;
  const omega2 = st.phiDot * st.phiDot;

  D.ax = -(q / st.M) * (clEff * sinT + CF * cosT);
  D.az = (-st.M * G + liftZ - vz * dma_dt) / (st.M + ma);
  D.thetaAcc = -omega2 * (theta - st.theta0) + (Mtheta - cDamp * thetaDot) / st.J1;
  D.area = area;
  return D;
}

const y0 = new Float64Array(6);
const k1 = new Float64Array(6);
const k2 = new Float64Array(6);
const k3 = new Float64Array(6);
const k4 = new Float64Array(6);
const tmp = new Float64Array(6);

function slope(st, y, waterH, out) {
  const d = deriv(st, y[1], y[2], y[3], y[4], y[5], waterH);
  out[0] = y[2]; out[1] = y[3];
  out[2] = d.ax; out[3] = d.az;
  out[4] = y[5]; out[5] = d.thetaAcc;
}

function rk4(st, dt, waterH) {
  y0[0] = st.x; y0[1] = st.z; y0[2] = st.vx; y0[3] = st.vz; y0[4] = st.theta; y0[5] = st.thetaDot;
  slope(st, y0, waterH, k1);
  for (let i = 0; i < 6; i++) tmp[i] = y0[i] + k1[i] * dt * 0.5;
  slope(st, tmp, waterH, k2);
  for (let i = 0; i < 6; i++) tmp[i] = y0[i] + k2[i] * dt * 0.5;
  slope(st, tmp, waterH, k3);
  for (let i = 0; i < 6; i++) tmp[i] = y0[i] + k3[i] * dt;
  slope(st, tmp, waterH, k4);
  for (let i = 0; i < 6; i++) y0[i] += (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  st.x = y0[0]; st.z = y0[1]; st.vx = y0[2]; st.vz = y0[3]; st.theta = y0[4]; st.thetaDot = y0[5];
  st.phi += st.phiDot * dt;
}

const lowerEdgeOf = (st) => st.z - st.R * Math.sin(st.theta);

function recordHistory(st) {
  const i = st.historyHead * 2;
  st.history[i] = st.x;
  st.history[i + 1] = st.z;
  st.historyHead = (st.historyHead + 1) % HISTORY;
  if (st.historyCount < HISTORY) st.historyCount++;
}

export function historyAt(st, i) {
  const k = ((st.historyHead - st.historyCount + i + HISTORY) % HISTORY) * 2;
  return [st.history[k], st.history[k + 1]];
}

export function stepStone(st, dtSim, water, opts) {
  if (!st.alive) return;

  const sample = () => water.sampleHeight(0, -st.x);
  let remaining = dtSim;

  while (remaining > 1e-9) {
    const waterH = sample();

    if (!st.immersed && lowerEdgeOf(st) < waterH) {
      st.immersed = true;
      st.immersedTime = 0;
      st.pendingDeposit = { wx: 0, wy: -st.x, area: 0, vzIn: st.vz };
    }

    let dt = remaining;
    if (st.immersed) {
      dt = Math.min(CONTACT_DT, remaining);
      const d = deriv(st, st.z, st.vx, st.vz, st.theta, st.thetaDot, waterH);
      const accel = Math.hypot(d.ax, d.az);
      if (accel > 0) {
        const dtCFL = (0.02 * Math.max(Math.hypot(st.vx, st.vz), 1)) / accel;
        dt = Math.max(MIN_CONTACT_DT, Math.min(dt, dtCFL));
      }
    } else {
      const edge = lowerEdgeOf(st);
      const vEdge = st.vz - st.R * Math.cos(st.theta) * st.thetaDot;
      if (edge > waterH && vEdge < 0) {
        const tHit = (edge - waterH) / -vEdge;
        if (tHit < dt) dt = Math.max(MIN_CONTACT_DT, tHit);
      }
    }

    if (opts.gyro) {
      const omega = Math.abs(st.phiDot);
      if (omega > 0) dt = Math.min(dt, 2.0 / omega);
      dt = Math.max(dt, MIN_CONTACT_DT);
    } else {
      st.theta = st.theta0;
      st.thetaDot = 0;
    }

    const beforeVx = st.vx, beforeX = st.x, beforeV = Math.hypot(st.vx, st.vz);
    rk4(st, dt, waterH);
    if (!opts.gyro) { st.theta = st.theta0; st.thetaDot = 0; }

    if (st.immersed && beforeVx > 0 && st.vx < 0) st.vx = 0;

    if (st.immersed || lowerEdgeOf(st) < waterH) {
      const after = Math.hypot(st.vx, st.vz);
      if (after > beforeV && after > 1e-6) {
        const k = beforeV / after;
        st.vx *= k; st.vz *= k;
      }
    }

    st.dist += Math.abs(st.x - beforeX);

    if (st.immersed) {
      st.immersedTime += dt;
      const d = deriv(st, st.z, st.vx, st.vz, st.theta, st.thetaDot, waterH);
      if (d.area > st.pendingDeposit.area) st.pendingDeposit.area = d.area;

      if (lowerEdgeOf(st) >= sample()) {
        st.immersed = false;
        st.bounces++;
        const dep = st.pendingDeposit;
        water.deposit(dep.wx, dep.wy, st.R, st.M * (st.vz - dep.vzIn));
        st.pendingDeposit = null;
      }
    }

    const speed = Math.hypot(st.vx, st.vz);
    if (lowerEdgeOf(st) < waterH - 3 * st.R || speed < 0.05 || speed > 120 ||
        !Number.isFinite(st.x) || (st.immersed && st.immersedTime > CONTACT_MAX)) {
      st.alive = false;
      break;
    }
    remaining -= dt;
  }

  recordHistory(st);
}

export function predictedNc(st) {
  const vx0 = st.vx0 ?? st.vx;
  const a = 2 * st.R;
  const sinT = Math.max(SIN_EPS, Math.sin(st.theta0));
  const C = CL * Math.cos(st.theta0) - CF * Math.sin(st.theta0);
  const w0 = Math.sqrt((C * RHO_W * vx0 * a) / (2 * st.M * sinT));
  const l = (2 * Math.PI * vx0) / w0;
  const mu = (CL * Math.sin(st.theta0) + CF * Math.cos(st.theta0)) / Math.max(1e-6, C);
  const Nc = (vx0 * vx0) / (2 * G * mu * l);
  return Number.isFinite(Nc) ? Math.max(0, Nc) : 0;
}
