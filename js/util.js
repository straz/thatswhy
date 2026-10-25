'use strict';
// Math, randomness, point-list geometry and canvas drawing primitives.
// Nothing here depends on page state.

const TAU = Math.PI * 2;

// ---------- math ----------
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${clamp(l, 0, 100)}%,${a})`;

// ---------- randomness ----------
// small seeded PRNG: returns a function yielding floats in [0, 1)
function mulberry32(a) {
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// in-place Fisher–Yates shuffle
function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- events ----------
// The simulation announces what happens to marbles; the displays (slips, statuses) listen.
//   tagPassed (marble, element)  a marble went through a tagged element
//   exitReached (sink, marble)   a marble arrived at an exit hole
//   swallowed (marble)           the exit hole has swallowed it
//   fused (gone, survivor)       two marbles became one
const listeners = {};
function on(event, fn) { (listeners[event] ??= []).push(fn); }
function emit(event, ...args) { for (const fn of listeners[event] ?? []) fn(...args); }

// ---------- point lists ----------
function linePts(a, b, n = 8) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push([lerp(a[0], b[0], i / n), lerp(a[1], b[1], i / n)]);
  return out;
}
// cubic bezier from p0 (leaving along d0) to p3 (arriving along d3)
function bezPts(p0, d0, p3, d3, k0, k3, n = 28) {
  const p1 = [p0[0] + d0[0] * k0, p0[1] + d0[1] * k0], p2 = [p3[0] - d3[0] * k3, p3[1] - d3[1] * k3];
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, mt = 1 - t, a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
    out.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
  }
  return out;
}
// the polyline shifted sideways by d (positive d is to the right of travel)
function offsetPts(pts, d) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [p[0] - dy / l * d, p[1] + dx / l * d];
  });
}

// ---------- canvas ----------
// split text into lines no wider than maxW in the context's current font
function wrapText(g, text, maxW) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? line + ' ' + word : word;
    if (line && g.measureText(next).width > maxW) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
function roundRect(g, x, y, w, h, rad) {
  rad = Math.min(rad, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rad, y);
  g.arcTo(x + w, y, x + w, y + h, rad);
  g.arcTo(x + w, y + h, x, y + h, rad);
  g.arcTo(x, y + h, x, y, rad);
  g.arcTo(x, y, x + w, y, rad);
  g.closePath();
}
function circle(g, x, y, rad) { g.beginPath(); g.arc(x, y, rad, 0, TAU); }

// fill helpers leave the shape as the current path, so a stroke() can follow
function fillRoundRect(g, style, x, y, w, h, rad) {
  g.fillStyle = style;
  roundRect(g, x, y, w, h, rad);
  g.fill();
}
function fillCircle(g, style, x, y, rad) {
  g.fillStyle = style;
  circle(g, x, y, rad);
  g.fill();
}
// x doesn't change the gradient, but anchoring it at the shape keeps rounding identical
function verticalGradient(g, y0, y1, top, bottom, x = 0) {
  const gr = g.createLinearGradient(x, y0, x, y1);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bottom);
  return gr;
}
