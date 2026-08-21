import { vec } from './vec.js';
import { lambertian, smoothConductor, roughConductor, smoothDielectric } from './bsdf.js';

const DIFFUSE = 0;
const CONDUCTOR = 1;
const DIELECTRIC = 2;

const SMOOTH_ALPHA = 0.02;

export function makeMaterial(def) {
  if (def.kind === CONDUCTOR) {
    const eta = def.eta, k = def.k, spec = def.spec || vec(1, 1, 1), alpha = def.alpha;
    const make = (s) => (alpha <= SMOOTH_ALPHA ? smoothConductor(eta, k, s) : roughConductor(eta, k, s, alpha));
    const bsdf = make(spec);
    return {
      kind: CONDUCTOR, specular: bsdf.specular, bsdf, texture: def.texture || null, color: spec,
      withAlbedo: (s) => make(s),
    };
  }
  if (def.kind === DIELECTRIC) {
    const bsdf = smoothDielectric(1.0, def.ior || 1.5);
    return { kind: DIELECTRIC, specular: true, bsdf, texture: null };
  }
  const color = def.color || vec(0.5, 0.5, 0.5);
  const base = lambertian(color);
  return {
    kind: DIFFUSE, specular: false, bsdf: base, texture: def.texture || null, color,
    withAlbedo: (albedo) => lambertian(albedo),
  };
}
