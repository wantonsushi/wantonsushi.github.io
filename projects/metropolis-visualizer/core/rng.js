const PCG_MULT_HI = 0x5851f42d;
const PCG_MULT_LO = 0x4c957f2d;
const PCG_INC_HI = 0x14057b7e;
const PCG_INC_LO = 0xf767814f;

function splitmix64(hi, lo) {
  lo = (lo + 0x7f4a7c15) >>> 0;
  hi = (hi + 0x9e3779b9 + (lo < 0x7f4a7c15 ? 1 : 0)) >>> 0;
  [hi, lo] = mul64(hi ^ (hi >>> 30) ^ (lo << 2), lo ^ (lo >>> 30), 0x1ce4e5b9, 0xbf584767 >>> 0);
  [hi, lo] = mul64(hi, lo, 0x94d049bb, 0x133111eb);
  hi = (hi ^ (hi >>> 31)) >>> 0;
  return [hi >>> 0, lo >>> 0];
}

function mul64(aHi, aLo, bHi, bLo) {
  const a0 = aLo & 0xffff, a1 = aLo >>> 16, a2 = aHi & 0xffff, a3 = aHi >>> 16;
  const b0 = bLo & 0xffff, b1 = bLo >>> 16, b2 = bHi & 0xffff, b3 = bHi >>> 16;

  let c0 = a0 * b0;
  let c1 = (c0 >>> 16) + a1 * b0 + a0 * b1;
  let c2 = (c1 >>> 16) + a2 * b0 + a1 * b1 + a0 * b2;
  let c3 = (c2 >>> 16) + a3 * b0 + a2 * b1 + a1 * b2 + a0 * b3;

  const lo = ((c1 & 0xffff) << 16 | (c0 & 0xffff)) >>> 0;
  const hi = ((c3 & 0xffff) << 16 | (c2 & 0xffff)) >>> 0;
  return [hi, lo];
}

function add64(aHi, aLo, bHi, bLo) {
  const lo = (aLo + bLo) >>> 0;
  const carry = lo < aLo ? 1 : 0;
  const hi = (aHi + bHi + carry) >>> 0;
  return [hi, lo];
}

export class RNG {
  constructor(seed = 123456789) {
    const [shi, slo] = splitmix64(0, seed >>> 0);
    this.stateHi = 0;
    this.stateLo = 0;
    this._step();
    [this.stateHi, this.stateLo] = add64(this.stateHi, this.stateLo, shi, slo);
    this._step();
  }

  _step() {
    const [mHi, mLo] = mul64(this.stateHi, this.stateLo, PCG_MULT_HI, PCG_MULT_LO);
    [this.stateHi, this.stateLo] = add64(mHi, mLo, PCG_INC_HI, PCG_INC_LO);
  }

  nextUint32() {
    const oldHi = this.stateHi, oldLo = this.stateLo;
    this._step();

    const xsHi = oldHi >>> 18;
    const xsLo = ((oldHi << 14) | (oldLo >>> 18)) >>> 0;
    const xoredLo = (xsLo ^ oldLo) >>> 0;
    const xoredHi = (xsHi ^ oldHi) >>> 0;
    const xorshifted = (((xoredHi << 5) | (xoredLo >>> 27)) >>> 0);
    const rot = oldHi >>> 27;
    return ((xorshifted >>> rot) | (xorshifted << ((-rot) & 31))) >>> 0;
  }

  next() {
    return this.nextUint32() * (1.0 / 4294967296.0);
  }
}
