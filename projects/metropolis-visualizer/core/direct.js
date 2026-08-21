import { dot, norm, sub } from './vec.js';

const SS = 4;

export function computeDirectEmitterImage(scene) {
  const W = scene.width, H = scene.height;
  const img = new Float32Array(W * H * 3);
  const inv = 1 / (SS * SS);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let rx = 0, ry = 0, rz = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const r = scene.sampleCameraRay((x + (sx + 0.5) / SS) / W, (y + (sy + 0.5) / SS) / H);
          const hit = scene.intersect(r.o, r.d);
          if (!hit || hit.emit < 0) continue;
          const toEye = norm(sub(r.o, hit.p));
          if (dot(toEye, hit.ng) <= 0) continue;
          const rad = scene.emitterRadiance(hit.emit);
          rx += rad.x; ry += rad.y; rz += rad.z;
        }
      }
      const i = (y * W + x) * 3;
      img[i] = rx * inv; img[i + 1] = ry * inv; img[i + 2] = rz * inv;
    }
  }
  return img;
}
