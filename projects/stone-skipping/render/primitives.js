export function buildDisk(segments = 28) {
  const position = [], normal = [], index = [];
  const push = (p, n) => { position.push(...p); normal.push(...n); return position.length / 3 - 1; };
  const topCap = push([0, 1, 0], [0, 1, 0]);
  const botCap = push([0, -1, 0], [0, -1, 0]);
  const capTop = [], capBot = [], rimTop = [], rimBot = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const x = Math.cos(a), z = Math.sin(a);
    capTop.push(push([x, 1, z], [0, 1, 0]));
    capBot.push(push([x, -1, z], [0, -1, 0]));
    rimTop.push(push([x, 1, z], [x, 0, z]));
    rimBot.push(push([x, -1, z], [x, 0, z]));
  }
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    index.push(topCap, capTop[i], capTop[j]);
    index.push(botCap, capBot[j], capBot[i]);
    index.push(rimTop[i], rimBot[i], rimTop[j], rimTop[j], rimBot[i], rimBot[j]);
  }
  return {
    position: new Float32Array(position),
    normal: new Float32Array(normal),
    index: new Uint16Array(index),
  };
}

export function buildArrow() {
  const position = [], normal = [], index = [];
  const push = (p, n) => { position.push(...p); normal.push(...n); return position.length / 3 - 1; };
  const quad = (a, b, c, d) => index.push(a, b, c, a, c, d);
  const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };

  const shaft = 0.055, neck = 0.74, headHalf = 0.14, tip = 1.0;
  const ring = (x, r) => [[x, r, r], [x, -r, r], [x, -r, -r], [x, r, -r]];
  const base = ring(0, shaft), mid = ring(neck, shaft);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const n = norm([0, (base[i][1] + base[j][1]) * 0.5, (base[i][2] + base[j][2]) * 0.5]);
    quad(push(base[i], n), push(base[j], n), push(mid[j], n), push(mid[i], n));
  }
  const head = ring(neck, headHalf);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const n = norm([0.5, (head[i][1] + head[j][1]) * 0.5, (head[i][2] + head[j][2]) * 0.5]);
    index.push(push(head[i], n), push(head[j], n), push([tip, 0, 0], n));
  }
  return {
    position: new Float32Array(position),
    normal: new Float32Array(normal),
    index: new Uint16Array(index),
  };
}
