import { compile, makeVAO, uniforms } from '../gl.js';
import { PROP_VS, PROP_FS } from './shaders.js';
import { loadOBJ } from '../scene/obj.js';
import { poissonDisk, clusteredDisk, mulberry32 } from '../scene/scatter.js';

const INSTANCE_STRIDE = 8;
const SEED = 0x5723a1;

const hashName = (name) => {
  let h = SEED;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193);
  return h >>> 0;
};

function placements(pond, spec) {
  const [lo, hi] = spec.band;
  const b = pond.bounds, m = hi + 4;
  const bounds = { minX: b.minX - m, maxX: b.maxX + m, minZ: b.minZ - m, maxZ: b.maxZ + m };
  const rand = mulberry32(hashName(spec.mesh));
  const inBand = (x, z) => {
    const d = pond.distance(x, z);
    return d >= lo && d <= hi;
  };
  const pts = spec.cluster
    ? clusteredDisk(bounds, spec.cluster, inBand, rand)
    : poissonDisk(bounds, spec.spacing, inBand, rand);

  const data = new Float32Array(pts.count * INSTANCE_STRIDE);
  const [s0, s1] = spec.scale;
  const [q0, q1] = spec.squash ?? [1, 1];
  for (let i = 0; i < pts.count; i++) {
    const x = pts.x[i], z = pts.z[i];
    const o = i * INSTANCE_STRIDE;
    data[o] = x;
    data[o + 1] = pond.groundY(x, z);
    data[o + 2] = z;
    data[o + 3] = q0 + rand() * (q1 - q0);
    data[o + 4] = rand() * Math.PI * 2;
    data[o + 5] = s0 + rand() * (s1 - s0);
    data[o + 6] = spec.sway;
    data[o + 7] = rand() * Math.PI * 2;
  }
  return { data, count: pts.count };
}

export class Props {
  static async load(gl, pond, baseUrl) {
    const meshes = await Promise.all(pond.props.map((p) => loadOBJ(`${baseUrl}/${p.mesh}.obj`)));
    return new Props(gl, pond, meshes);
  }

  constructor(gl, pond, meshes) {
    this.gl = gl;
    this.prog = compile(gl, PROP_VS, PROP_FS);
    this.u = uniforms(gl, this.prog, ['uViewProj', 'uSunDir', 'uTime', 'uClipY', 'uClipSign',
      'uCaustics', 'uSunDirWater', 'uCausticMin', 'uCausticSize', 'uCausticStrength']);
    this.batches = pond.props.map((spec, i) => {
      const mesh = meshes[i];
      const { data, count } = placements(pond, spec);
      const geo = makeVAO(gl, [
        { loc: 0, size: 3, data: mesh.position },
        { loc: 1, size: 3, data: mesh.normal },
        { loc: 2, size: 3, data: mesh.color },
        { loc: 3, size: 1, data: mesh.sway },
        { loc: 4, size: 4, data, stride: INSTANCE_STRIDE, offset: 0, divisor: 1 },
        { loc: 5, size: 4, data, stride: INSTANCE_STRIDE, offset: 4, divisor: 1 },
      ], mesh.index);
      return { ...geo, instances: count };
    });
    this.instanceCount = this.batches.reduce((s, b) => s + b.instances, 0);
  }

  draw(viewProj, sunDir, time, clip, caustics) {
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.u.uViewProj, false, viewProj);
    gl.uniform3fv(this.u.uSunDir, sunDir);
    gl.uniform1f(this.u.uTime, time);
    gl.uniform1f(this.u.uClipY, clip.y);
    gl.uniform1f(this.u.uClipSign, clip.sign);
    caustics.bind(this.u, 0);
    gl.disable(gl.CULL_FACE);
    for (const b of this.batches) {
      gl.bindVertexArray(b.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, b.count, b.type, 0, b.instances);
    }
    gl.bindVertexArray(null);
  }
}
