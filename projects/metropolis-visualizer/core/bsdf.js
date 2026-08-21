import { vec, dot, scale, sub, add, norm, mul } from './vec.js';

const INV_PI = 1 / Math.PI;
const absCos = (w) => Math.abs(w.z);
const sameHemisphere = (a, b) => a.z * b.z > 0;

function frDielectric(cosI, etaI, etaT) {
  cosI = Math.min(Math.max(cosI, -1), 1);
  if (cosI < 0) { const t = etaI; etaI = etaT; etaT = t; cosI = -cosI; }
  const sinT = (etaI / etaT) * Math.sqrt(Math.max(0, 1 - cosI * cosI));
  if (sinT >= 1) return 1;
  const cosT = Math.sqrt(Math.max(0, 1 - sinT * sinT));
  const rPar = (etaT * cosI - etaI * cosT) / (etaT * cosI + etaI * cosT);
  const rPer = (etaI * cosI - etaT * cosT) / (etaI * cosI + etaT * cosT);
  return (rPar * rPar + rPer * rPer) * 0.5;
}

function frConductor(cosI, eta, k) {
  cosI = Math.min(Math.max(cosI, 0), 1);
  const c2 = cosI * cosI, s2 = 1 - c2;
  const ch = (e, kk) => {
    const e2 = e * e, k2 = kk * kk, t0 = e2 - k2 - s2;
    const a2b2 = Math.sqrt(Math.max(0, t0 * t0 + 4 * e2 * k2));
    const t1 = a2b2 + c2;
    const a = Math.sqrt(Math.max(0, (a2b2 + t0) * 0.5));
    const t2 = 2 * a * cosI;
    const Rs = (t1 - t2) / (t1 + t2);
    const t3 = c2 * a2b2 + s2 * s2, t4 = t2 * s2;
    return (Rs + Rs * (t3 - t4) / (t3 + t4)) * 0.5;
  };
  return vec(ch(eta.x, k.x), ch(eta.y, k.y), ch(eta.z, k.z));
}

const ggxD = (wh, a) => {
  const a2 = a * a, c2 = wh.z * wh.z;
  const t = c2 * (a2 - 1) + 1;
  return a2 / (Math.PI * t * t);
};
const ggxLambda = (w, a) => {
  const c2 = w.z * w.z, s2 = Math.max(0, 1 - c2);
  if (c2 >= 1) return 0;
  const tan2 = s2 / c2;
  return (-1 + Math.sqrt(1 + a * a * tan2)) * 0.5;
};
const ggxG = (wo, wi, a) => 1 / (1 + ggxLambda(wo, a) + ggxLambda(wi, a));
const reflectAbout = (w, n) => sub(scale(n, 2 * dot(w, n)), w);

function ggxSampleWh(wo, a, u1, u2) {
  const phi = 2 * Math.PI * u2;
  const tan2 = a * a * u1 / (1 - u1);
  const cosT = 1 / Math.sqrt(1 + tan2);
  const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
  let wh = vec(sinT * Math.cos(phi), sinT * Math.sin(phi), cosT);
  if (!sameHemisphere(wo, wh)) wh = scale(wh, -1);
  return wh;
}

export function lambertian(albedo) {
  const f = (wo, wi) => (sameHemisphere(wo, wi) ? scale(albedo, INV_PI) : vec(0, 0, 0));
  const pdf = (wo, wi) => (sameHemisphere(wo, wi) ? absCos(wi) * INV_PI : 0);
  return {
    specular: false, f, pdf,
    sampleF: (wo, u1, u2) => {
      const r = Math.sqrt(u1), phi = 2 * Math.PI * u2;
      let wi = vec(r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(Math.max(0, 1 - u1)));
      if (wo.z < 0) wi = vec(wi.x, wi.y, -wi.z);
      return { wiL: wi, f: scale(albedo, INV_PI), pdf: absCos(wi) * INV_PI, specular: false };
    },
  };
}

export function smoothConductor(eta, k, spec) {
  return {
    specular: true, f: () => vec(0, 0, 0), pdf: () => 0,
    sampleF: (wo) => {
      const wi = vec(-wo.x, -wo.y, wo.z);
      const F = frConductor(absCos(wi), eta, k);
      return { wiL: wi, f: scale(mul(F, spec), 1 / absCos(wi)), pdf: 1, specular: true };
    },
  };
}

export function smoothDielectric(etaA, etaB) {
  return {
    specular: true, f: () => vec(0, 0, 0), pdf: () => 0,
    sampleF: (wo, u1, _u2, radiance = true) => {
      const F = frDielectric(wo.z, etaA, etaB);
      if (u1 < F) {
        const wi = vec(-wo.x, -wo.y, wo.z);
        const v = F / absCos(wi);
        return { wiL: wi, f: vec(v, v, v), pdf: F, specular: true };
      }
      const entering = wo.z > 0;
      const etaI = entering ? etaA : etaB, etaT = entering ? etaB : etaA;
      const nz = entering ? 1 : -1;
      const wi = refract(wo, nz, etaI / etaT);
      if (!wi) return null;
      let ft = 1 - F;
      if (radiance) ft *= (etaI * etaI) / (etaT * etaT);
      const v = ft / absCos(wi);
      return { wiL: wi, f: vec(v, v, v), pdf: 1 - F, specular: true };
    },
  };
}

function refract(wo, nz, eta) {
  const cosI = wo.z * nz;
  const sin2T = eta * eta * Math.max(0, 1 - cosI * cosI);
  if (sin2T >= 1) return null;
  const cosT = Math.sqrt(1 - sin2T);
  const c = eta * cosI - cosT;
  return vec(-eta * wo.x, -eta * wo.y, -eta * wo.z + c * nz);
}

export function roughConductor(eta, k, spec, alpha) {
  const a = Math.max(alpha, 1e-3);
  const f = (wo, wi) => {
    if (!sameHemisphere(wo, wi)) return vec(0, 0, 0);
    const co = absCos(wo), ci = absCos(wi);
    if (co === 0 || ci === 0) return vec(0, 0, 0);
    let wh = add(wo, wi);
    if (wh.x === 0 && wh.y === 0 && wh.z === 0) return vec(0, 0, 0);
    wh = norm(wh);
    const F = frConductor(Math.abs(dot(wi, wh)), eta, k);
    const s = ggxD(wh.z < 0 ? scale(wh, -1) : wh, a) * ggxG(wo, wi, a) / (4 * co * ci);
    return scale(mul(F, spec), s);
  };
  const pdf = (wo, wi) => {
    if (!sameHemisphere(wo, wi)) return 0;
    let wh = add(wo, wi);
    if (wh.x === 0 && wh.y === 0 && wh.z === 0) return 0;
    wh = norm(wh);
    if (!sameHemisphere(wo, wh)) wh = scale(wh, -1);
    return ggxD(wh, a) * absCos(wh) / (4 * Math.abs(dot(wo, wh)));
  };
  return {
    specular: false, f, pdf,
    sampleF: (wo, u1, u2) => {
      if (wo.z === 0) return null;
      const wh = ggxSampleWh(wo, a, u1, u2);
      const wi = reflectAbout(wo, wh);
      if (!sameHemisphere(wo, wi)) return null;
      return { wiL: wi, f: f(wo, wi), pdf: pdf(wo, wi), specular: false };
    },
  };
}
