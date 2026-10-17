'use strict';
// Page-wide state and layout: the wooden box, and the machine fitted inside it.
//
// The machine is laid out in flow coordinates: u runs along the flow from start points
// to end points, v runs across it. Mode 'lr' maps (u, v) to screen (x, y); mode 'td'
// (top-down) maps it to (y, x).

const params = new URLSearchParams(location.search);
// the box's top surface (machine, frame, lid) is drawn on `canvas`, tilted in 3D by CSS;
// the page, the box's front face and slips leaving it are drawn on `baseCanvas` behind it
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const baseCanvas = document.getElementById('base');
const baseCtx = baseCanvas.getContext('2d');
// slips falling out of the box, over the text below it
const flyCanvas = document.getElementById('fly');
const flyCtx = flyCanvas.getContext('2d');
const plaque = document.querySelector('.plaque');
const about = document.querySelector('.about');
const seed = parseInt(params.get('seed'), 10) || Math.floor(Math.random() * 1e9);

// ---------- state ----------
// viewport: size, pixel ratio, orientation, and its extent along (F) and across (C) the flow
let W, H, dpr, mode, F, C;
// machine geometry: L lanes s apart, marble radius r, shutter radius Rs, K element columns
// w wide starting at U1, lane 0 at V0, start/end points at uSrc/uSink, marble speed, marble cap
let L, s, r, Rs, w, K, V0, U1, uSrc, uSink, speed, cap;
// machine contents, rebuilt by build()
let srcLanes, sinkLanes, grid, elements, sources, sinks, sinkAt, marbles, particles, rng, theme;
// box geometry (see layoutBox)
let box;
let nextId = 1, now = 0;

// ---------- coordinates ----------
const laneV = i => V0 + s * (i + 0.5);
const colU = col => U1 + (col - 1) * w;
const toScreen = (u, v) => mode === 'lr' ? [u, v] : [v, u];
const localVec = (x, y) => mode === 'lr' ? [x, y] : [y, x];
// draw in screen pixels
function setScreen(g) { g.setTransform(dpr, 0, 0, dpr, 0, 0); }
// draw in flow coordinates
function setLocal(g) {
  if (mode === 'lr') setScreen(g);
  else g.setTransform(0, dpr, dpr, 0, 0, 0);
}
// n lanes spaced evenly over total
function spread(n, total) {
  return Array.from({ length: n }, (_, k) => Math.min(total - 1, Math.floor((k + 0.5) * total / n)));
}
function nearestSink(i) {
  let best = sinkLanes[0];
  for (const j of sinkLanes) if (Math.abs(j - i) < Math.abs(best - i)) best = j;
  return best;
}

// ---------- layout ----------
const SLOT_PLATE_PAD = 24;   // the brass plate is this much wider than its slit

function layout() {
  W = innerWidth; H = innerHeight; dpr = Math.min(devicePixelRatio || 1, 2);
  // phones (touch screen, small short side) always run top-down, even in landscape
  const mobile = matchMedia('(pointer: coarse)').matches && Math.min(W, H) < 600;
  mode = chooseMode(mobile);
  F = mode === 'lr' ? W : H; C = mode === 'lr' ? H : W;
  // the box runs from near the top of the page down to the text below it
  const x = clamp(W * 0.02, 10, 28);
  about.style.left = about.style.right = `${x}px`;
  box = layoutBox(x, clamp(H * 0.02, 10, 20), about.getBoundingClientRect().top - 12);
  placePlaque(box.plaque);
  layoutMachine(machineArea(), mobile);
}

function chooseMode(mobile) {
  const pm = params.get('mode');
  if (pm === 'lr' || pm === 'td') return pm;
  return mobile || W < H * 1.05 ? 'td' : 'lr';
}

// The wooden box, seen from above and in front: the top surface (walls around the machine),
// and the front face below it holding, left to right, the name plaque, the meter and the slot.
function layoutBox(x, top, bottom) {
  const wall = clamp(Math.min(W, H) * 0.02, 9, 16);
  const bw = W - 2 * x, bh = bottom - top;
  const meterW = clamp(bw * 0.13, 62, 100), meterH = meterW * 0.62, frontH = meterH + 1.2 * wall;
  // the plaque may be as wide as leaves the slot its minimum width
  const plaqueSize = sizePlaque(Math.max(32, meterH * 0.8), bw - meterW - 4 * wall - 56 - SLOT_PLATE_PAD - 100);
  const plaqueW = plaqueSize.w, plaqueH = plaqueSize.h;
  const topH = bh - frontH, frontY = top + topH;
  const inner = { x: x + wall, y: top + wall, w: bw - 2 * wall, h: topH - 2 * wall };
  const lip = wall * 0.4;   // the lid overlaps the walls by this much
  // slot at the right of the front face, the meter and then the plaque to its left
  const slotW = clamp(bw - plaqueW - meterW - 4 * wall - 32 - SLOT_PLATE_PAD, 100, 200), plateW = slotW + SLOT_PLATE_PAD;
  const slotX = x + bw - wall - 8 - plateW / 2;
  const meterX = slotX - plateW / 2 - 1.5 * wall - meterW;
  return {
    x, y: top, w: bw, h: bh, inner,
    front: { y: frontY, h: frontH },
    persp: tiltFor(x + bw / 2, frontY, topH),
    pullW: clamp(inner.w * 0.012, 10, 16),   // width of the finger pull in the lid
    lidPeek: clamp(bw * 0.07, 56, 120),      // how much of the open lid stays in view
    lid: { x: inner.x - lip, y: inner.y - lip, w: inner.w + 2 * lip, h: inner.h + 2 * lip },
    meter: { x: meterX, y: frontY + (frontH - meterH) / 2, w: meterW, h: meterH },
    // plaque centred between the box's left edge and the meter
    plaque: { x: (x + meterX - plaqueW) / 2, y: frontY + (frontH - plaqueH) / 2, w: plaqueW, h: plaqueH },
    slot: { x: slotX, y: frontY + frontH * 0.42, w: slotW }
  };
}

// the box interior, less the strip on the left covered by the open lid
function machineArea() {
  const I = box.inner, covered = Math.max(0, box.x + box.lidPeek + 8 - I.x);
  return { x: I.x + covered, y: I.y, w: I.w - covered, h: I.h };
}
// size the plaque's lettering for height h; if it would be wider than room, wrap the motto
// and, failing that, shrink the lettering to fit. Returns the size it takes up.
function sizePlaque(h, room) {
  plaque.style.minHeight = `${h}px`;
  for (let fs = Math.round(clamp(h * 0.3, 11, 16)); ; fs -= 0.5) {
    plaque.style.fontSize = `${fs}px`;
    plaque.classList.remove('narrow');
    if (plaque.offsetWidth > room) plaque.classList.add('narrow');
    if (plaque.offsetWidth <= room || fs <= 8) break;
  }
  return { w: plaque.offsetWidth, h: plaque.offsetHeight };
}
function placePlaque({ x, y }) {
  plaque.style.left = `${x}px`;
  plaque.style.top = `${y}px`;
}

// ---------- perspective ----------
// The top surface tilts away about its front edge, so its back edge looks BACK_RATIO as wide
// as the front. It is pre-stretched vertically (s) so on screen the tilted surface still spans
// its full laid-out height. Points are relative to the origin (ox, oy) at the middle of the
// front edge; d is the CSS perspective distance.
const TILT = 20 * Math.PI / 180, BACK_RATIO = 0.9;
function tiltFor(ox, oy, depth) {
  const A = Math.cos(TILT), B = Math.sin(TILT);
  return { ox, oy, A, B, s: 1 / (A * BACK_RATIO), d: depth * B / (A * (1 - BACK_RATIO)) };
}
// top-surface canvas coordinates → screen
function project(x, y) {
  const { ox, oy, A, B, s, d } = box.persp, Y = (y - oy) * s, f = d / (d - Y * B);
  return [ox + (x - ox) * f, oy + Y * A * f];
}
// screen → top-surface canvas coordinates
function unproject(x, y) {
  const { ox, oy, A, B, s, d } = box.persp, Ys = y - oy, Y = Ys * d / (d * A + Ys * B);
  return [ox + (x - ox) * (d - Y * B) / d, oy + Y / s];
}
// tilt the top-surface canvas, showing only the top surface
function applyTilt() {
  const { ox, oy, s, d } = box.persp;
  canvas.style.transformOrigin = `${ox}px ${oy}px`;
  canvas.style.transform = `perspective(${d}px) rotateX(${TILT}rad) scaleY(${s})`;
  canvas.style.clipPath = `inset(${box.y}px ${W - box.x - box.w}px ${H - box.front.y}px ${box.x}px round 8px 8px 0 0)`;
}

// Size lanes and columns so the machine fits inside the given area of the box.
function layoutMachine(area, mobile) {
  const [f0, f1, c0, c1] = mode === 'lr'
    ? [area.x, area.x + area.w, area.y, area.y + area.h]
    : [area.y, area.y + area.h, area.x, area.x + area.w];
  const padC = Math.max(8, (c1 - c0) * 0.04), padF = Math.max(14, (f1 - f0) * 0.03);
  // margins from the screen edges to the machine, at the start and end of each axis
  const crossStart = c0 + padC, crossEnd = C - c1 + padC, flowStart = f0 + padF, flowEnd = F - f1 + padF;
  const crossAvail = C - crossEnd - crossStart;
  L = clamp(Math.floor(crossAvail / clamp(C / 6, 62, 100)), 3, mobile ? 5 : 8);
  s = Math.min(crossAvail / L, 115);
  const N = clamp(parseInt(params.get('n'), 10) || (mobile ? 2 : 3), 1, L);
  const M = clamp(parseInt(params.get('m'), 10) || 2, 1, L);
  srcLanes = spread(N, L); sinkLanes = spread(M, L);
  let jump = 0;   // furthest any lane must shift sideways to reach its end point
  for (let i = 0; i < L; i++) jump = Math.max(jump, Math.abs(i - nearestSink(i)));
  // on short flows (e.g. a phone held sideways), shrink lanes until two element columns fit
  for (let tries = 0; ; tries++) {
    r = clamp(s * 0.155, 4, 14);
    Rs = r * 1.25;
    uSrc = flowStart + Rs * 1.2;
    U1 = uSrc + Math.max(3 * r, 0.45 * s);
    uSink = F - flowEnd - Rs * 1.2;
    const ucol = uSink - Math.max(1.1 * s, jump * s * 0.85 + 0.6 * s);
    if (ucol - U1 >= 3 * s || tries >= 20) {
      K = Math.max(1, Math.floor((ucol - U1) / (1.5 * s)));
      w = (ucol - U1) / K;
      break;
    }
    s *= 0.9;
  }
  V0 = crossStart + (crossAvail - L * s) / 2;
  speed = s * 1.7;
  cap = clamp(L + 5, 8, 13);
}
