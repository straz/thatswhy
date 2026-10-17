'use strict';
// Start points (sources) and end points (sinks), each an iris shutter that opens to let a
// marble out or swallow one.

// ---------- shutters ----------
class Shutter {
  constructor(u, lane) {
    this.u = u; this.v = laneV(lane); this.rot = rng() * TAU; this.open = 0; this.alpha = 0;
  }
  close() { this.open = 0; this.alpha = 0; }
  // a marble passing through is clipped to the opening
  aperture() { return [this.u, this.v, this.open * Rs * 0.95]; }
  draw(g) {
    const [x, y] = toScreen(this.u, this.v);
    drawShutter(g, x, y, Rs, this.open, this.alpha, this.rot);
  }
}

class Source extends Shutter {
  constructor(lane) {
    super(uSrc, lane);
    this.seq = null;   // the current release: { t0, m, close }
    this.path = new Path(linePts([uSrc, this.v], [U1, this.v], 10), { p0: 0, p1: 1, onEnd: m => handoff(m, 1, lane) });
    this.next = now + 0.4 + Math.random() * 2.5;
  }
  update() {
    const q = this.seq;
    if (!q) {
      this.close();
      if (now >= this.next && marbles.length < cap && clearAt(this.u, this.v, 2.6 * r)) this.seq = { t0: now, m: null, close: 0 };
      return;
    }
    if (!q.close) this.release(q);
    else this.shut(q);
  }
  // fade in, open, grow a new marble in the opening, and let it roll off
  release(q) {
    const t = now - q.t0;
    this.alpha = clamp(t / 0.3, 0, 1);
    this.open = easeInOut(clamp((t - 0.3) / 0.45, 0, 1));
    if (t >= 0.75 && !q.m) { q.m = makeMarble(this.u, this.v, MATS[0]); marbles.push(q.m); }
    if (!q.m) return;
    const k = clamp((t - 0.75) / 0.6, 0, 1), e = easeOut(k);
    if (k < 1) { q.m.scale = 0.3 + 0.7 * e; q.m.dark = 1 - e; q.m.clip = this.aperture(); }
    else if (q.m.held) { q.m.clip = null; q.m.held = false; setPath(q.m, this.path); }
    else if (q.m.dead || Math.hypot(q.m.u - this.u, q.m.v - this.v) > 2.4 * r) q.close = now;
  }
  // close and fade out, then wait a while before the next marble
  shut(q) {
    const c = now - q.close;
    this.open = 1 - easeInOut(clamp(c / 0.45, 0, 1));
    this.alpha = 1 - clamp((c - 0.45) / 0.3, 0, 1);
    if (c > 0.75) { this.seq = null; this.next = now + 1.2 + Math.random() * 3.5; }
  }
}

class Sink extends Shutter {
  constructor(lane) {
    super(uSink, lane);
    this.m = null;   // the marble being swallowed
  }
  arrive(m) {
    if (this.m) return;
    this.m = m; m.held = true; this.t0 = now;
    // an earlier note still waiting by this exit heads for the slot now
    for (const q of notes) if (q.sink === this && now - q.t0 < NOTE_WAIT) q.t0 = now - NOTE_WAIT;
    notes.push(makeNote(this, m.tags));
  }
  update() {
    const m = this.m;
    if (!m) { this.close(); return; }
    const t = now - this.t0;
    this.alpha = clamp((t - 0.15) / 0.2, 0, 1) * (1 - clamp((t - 1.3) / 0.2, 0, 1));
    this.open = easeInOut(clamp((t - 0.35) / 0.3, 0, 1)) * (1 - easeInOut(clamp((t - 1.0) / 0.3, 0, 1)));
    if (t >= 0.6 && t < 1.0) {
      const e = easeInOut((t - 0.6) / 0.4);
      m.clip = this.aperture(); m.scale = 1 - 0.75 * e; m.dark = e;
    }
    if (t >= 1.0) m.visible = false;
    if (t >= 1.5) { m.dead = true; this.m = null; }
  }
}

// ---------- iris drawing ----------
function drawShutter(g, x, y, R, open, alpha, rot0) {
  if (alpha <= 0.005) return;
  g.save();
  g.globalAlpha = alpha;
  // metal ring
  const Ro = R * 1.2;
  let gr = g.createRadialGradient(x - Ro * 0.35, y - Ro * 0.4, Ro * 0.1, x, y, Ro);
  gr.addColorStop(0, theme.ringHi); gr.addColorStop(1, theme.ringLo);
  fillCircle(g, gr, x, y, Ro);
  // dark hole
  circle(g, x, y, R); g.clip();
  gr = g.createRadialGradient(x, y, 0, x, y, R);
  gr.addColorStop(0, '#000'); gr.addColorStop(1, theme.hole);
  g.fillStyle = gr; g.fillRect(x - R, y - R, 2 * R, 2 * R);
  if (open < 0.999) drawIrisBlades(g, x, y, R, open, rot0);
  g.restore();
}
// seven blades around a heptagonal opening that widens and turns as the iris opens
function drawIrisBlades(g, x, y, R, open, rot0) {
  const N = 7, rot = rot0 + (1 - open) * 1.4, a = open * R * 0.95 / Math.cos(Math.PI / N), U = [], V = [];
  for (let k = 0; k < N; k++) {
    const t = rot + k * TAU / N;
    U.push([Math.cos(t), Math.sin(t)]); V.push([x + a * Math.cos(t), y + a * Math.sin(t)]);
  }
  g.beginPath(); g.arc(x, y, R + 1, 0, TAU);
  g.moveTo(V[0][0], V[0][1]);
  for (let k = 1; k < N; k++) g.lineTo(V[k][0], V[k][1]);
  g.closePath();
  const gr = g.createLinearGradient(x - R, y - R, x + R, y + R);
  gr.addColorStop(0, theme.blade1); gr.addColorStop(1, theme.blade0);
  g.fillStyle = gr; g.fill('evenodd');
  // curved seams from each corner of the opening out to the ring
  g.strokeStyle = theme.seam; g.lineWidth = Math.max(0.8, R * 0.06);
  for (let k = 0; k < N; k++) {
    const pu = U[(k + N - 1) % N], qu = U[k];
    let dx = qu[0] - pu[0], dy = qu[1] - pu[1];
    const l = Math.hypot(dx, dy); dx /= l; dy /= l;
    const px = V[k][0] - x, py = V[k][1] - y, b = px * dx + py * dy;
    const t = -b + Math.sqrt(Math.max(0, b * b - (px * px + py * py - 1.44 * R * R)));
    const ex = V[k][0] + dx * t, ey = V[k][1] + dy * t;
    const mx = (V[k][0] + ex) / 2 - dy * t * 0.18, my = (V[k][1] + ey) / 2 + dx * t * 0.18;
    g.beginPath(); g.moveTo(V[k][0], V[k][1]); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
  }
}
