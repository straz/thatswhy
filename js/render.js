'use strict';
// Drawing the machine: static track layers (rendered once per build), then each frame the
// moving parts, the element tags, the notes and the box on top.

// layerA: background and ground-level track; layerB: elevated track (bridges, loop tops)
let layerA, layerB;

// ---------- static layers ----------
// pieces of a path to draw: ground layer 'A' skips any gap, elevated layer 'B' is just the raised stretches
function segsFor(p, layer) {
  if (layer === 'B') return p.elev.map(([a, b]) => p.slice(a, b));
  const ranges = p.gap ? [[0, p.gap[0]], [p.gap[1], p.len]] : [[0, p.len]];
  return ranges.map(([a, b]) => p.slice(a, b));
}
function strokeSegs(g, segs, width, color, off = [0, 0]) {
  if (!segs.length) return;
  g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = width; g.strokeStyle = color;
  g.beginPath();
  for (const pts of segs) {
    g.moveTo(pts[0][0] + off[0], pts[0][1] + off[1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] + off[0], pts[i][1] + off[1]);
  }
  g.stroke();
}
// a grooved channel: a shadow, then each [width (in marble radii), colour] band on top
function strokeChannel(g, segs, shadow, bands) {
  strokeSegs(g, segs, shadow.width * r, theme.shadow, shadow.offset);
  for (const [width, color] of bands) strokeSegs(g, segs, width * r, color);
}
function drawRails(g, segs, elevated) {
  const gauge = 0.95 * r, so = localVec(elevated ? 3 : 1.5, elevated ? 7 : 3);
  for (const pts of segs) {
    const A = offsetPts(pts, gauge), B = offsetPts(pts, -gauge);
    strokeSegs(g, [A, B], 0.4 * r, theme.shadow, so);
    // cross ties
    g.strokeStyle = theme.tie; g.lineWidth = 0.35 * r; g.lineCap = 'round';
    let acc = 0;
    g.beginPath();
    for (let i = 1; i < pts.length; i++) {
      acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (acc >= 0.85 * r) { acc = 0; g.moveTo(A[i][0], A[i][1]); g.lineTo(B[i][0], B[i][1]); }
    }
    g.stroke();
    strokeSegs(g, [A, B], 0.38 * r, theme.rail);
  }
}
function makeLayer() {
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  return c;
}
// every path a marble can actually take (paths from dead input lanes are left out)
function livePaths() {
  return sources.map(q => q.path).concat(elements.flatMap(e => e.paths.filter(p => p.src == null || e.live.has(p.src))));
}
function renderStatic() {
  layerA = makeLayer(); layerB = makeLayer();
  const all = livePaths();
  const channels = all.filter(p => p.style === 'channel'), rails = all.filter(p => p.style === 'rails');
  const segs = (paths, layer) => paths.flatMap(p => segsFor(p, layer));

  let g = layerA.getContext('2d');
  setScreen(g);
  drawBackground(g);
  setLocal(g);
  strokeChannel(g, segs(channels, 'A'), { width: 2.7, offset: localVec(1.5, 3) },
    [[2.7, theme.rim], [1.9, theme.groove], [1.2, theme.grooveIn]]);
  drawRails(g, segs(rails, 'A'), false);
  for (const e of elements) e.drawBase(g);

  g = layerB.getContext('2d');
  setLocal(g);
  strokeChannel(g, segs(channels, 'B'), { width: 2.8, offset: localVec(3, 7) },
    [[3.0, theme.edge], [2.7, theme.rimHi], [1.9, theme.groove], [1.2, theme.grooveIn]]);
  drawRails(g, segs(rails, 'B'), true);
}
// plain page colour with a faint dot grid
function drawBackground(g) {
  g.fillStyle = theme.bg; g.fillRect(0, 0, W, H);
  g.fillStyle = theme.dot;
  for (let x = 11; x < W; x += 22) for (let y = 11; y < H; y += 22) g.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
}

// ---------- each frame ----------
// copy a full-canvas layer, pixel for pixel
function blit(g, layer) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(layer, 0, 0);
}
function draw() {
  drawMachine(ctx);
  drawTags(ctx);
  drawNotes(ctx, true);
  drawTop(ctx);
  drawFront(baseCtx);
  flyCtx.setTransform(1, 0, 0, 1, 0, 0);
  flyCtx.clearRect(0, 0, flyCanvas.width, flyCanvas.height);
  setScreen(flyCtx);
  drawNotes(flyCtx, false);
}
// leaves the context in screen coordinates
function drawMachine(g) {
  blit(g, layerA);
  setLocal(g);
  for (const e of elements) e.drawUnder(g);
  setScreen(g);
  for (const q of sources.concat(sinks)) q.draw(g);
  for (const m of marbles) if (!m.elev) drawMarbleObj(g, m);
  // elevated track passes over ground-level marbles, under elevated ones
  blit(g, layerB);
  setScreen(g);
  for (const m of marbles) if (m.elev) drawMarbleObj(g, m);
  setLocal(g);
  for (const e of elements) e.drawOver(g);
  drawParticles(g);
  setScreen(g);
}

// ---------- tags ----------
const tagSize = () => clamp(r * 0.8, 8, 11);
const tagFont = () => `600 ${Math.round(tagSize())}px ${MONO}`;
// call fn(e, x, y, lit) for each tagged element, at its tag's screen position
function forEachTag(fn) {
  for (const e of elements) {
    if (!e.tag) continue;
    const [x, y] = toScreen(...e.tagPos());
    fn(e, x, y, e.litLevel());
  }
}
// rounded label centred on (x, y), kept on screen
function pill(g, text, x, y, fg, alpha) {
  const fs = tagSize(), tw = g.measureText(text).width, ph = fs * 1.6, pw = tw + fs;
  const x0 = clamp(x - pw / 2, 4, W - pw - 4);
  const y0 = clamp(y - ph / 2, 4, H - ph - 4);
  g.globalAlpha = alpha;
  fillRoundRect(g, theme.tagBg, x0, y0, pw, ph, ph / 2);
  g.fillStyle = fg; g.fillText(text, x0 + fs / 2, y0 + ph / 2);
  g.globalAlpha = 1;
}
function drawTags(g) {
  g.font = tagFont(); g.textBaseline = 'middle'; g.textAlign = 'left';
  forEachTag((e, x, y, k) => pill(g, e.tag, x, y, k > 0 ? theme.tagLit : theme.ink, 0.45 + 0.55 * k));
}
