export function chainColorCSS(id, alpha = 1) {
  const hue = (id * 137.508) % 360;
  return `hsla(${hue.toFixed(1)}, 70%, 62%, ${alpha})`;
}
