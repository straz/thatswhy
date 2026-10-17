'use strict';
// Machine elements. Each occupies n adjacent lanes (from lane a) of one column, owns the
// paths marbles take through it, and hands marbles on to the next column when they leave.

const LIT_FADE = 0.7;   // seconds an element's tag stays lit after a marble passes

// ---------- base ----------
class Elem {
  constructor(col, a, n) {
    this.col = col; this.a = a; this.n = n;
    this.u0 = colU(col); this.u1 = colU(col + 1); this.uc = (this.u0 + this.u1) / 2; this.wd = this.u1 - this.u0;
    this.vmid = laneV(a + (n - 1) / 2); this.paths = []; this.tag = null; this.lit = -9;
  }
  tagPos() { return [this.uc, laneV(this.a) - 0.4 * s]; }
  // 1 just after a marble passed, fading to 0
  litLevel() { return clamp(1 - (now - this.lit) / LIT_FADE, 0, 1); }
  P(pts, o) { const p = new Path(pts, o); this.paths.push(p); return p; }
  out(lane) { return m => handoff(m, this.col + 1, lane); }
  lv(k) { return laneV(this.a + k); }
  // which lanes can carry marbles out, given the live input lanes
  outs(live) { return [...live]; }
  lanes() { return Array.from({ length: this.n }, (_, k) => this.a + k); }
  // single-lane elements have one path, this.p; multi-lane ones one entry path per lane, this.inP
  enter(m, lane) { setPath(m, this.inP ? this.inP[lane - this.a] : this.p); }
  update() {} drawBase() {} drawUnder() {} drawOver() {}

  // path across the whole column on this element's single lane
  through(pts, o) {
    return this.P(pts, { p0: this.col, p1: this.col + 1, onEnd: this.out(this.a), ...o });
  }
  // not busy any more once a leaving marble is dist along its exit path p
  freeAfter(p, dist) { p.events = [{ at: Math.min(p.len, dist), fn: () => { this.busy = false; } }]; }
  // curve from lane k's entry into the point `to`
  inbound(k, to, p1, onEnd) {
    const d = (to[0] - this.u0) * 0.5;
    return this.P(bezPts([this.u0, this.lv(k)], [1, 0], to, [1, 0], d, d, 24), { p0: this.col, p1, src: this.a + k, onEnd });
  }
  // curve from the point `from` out to lane k's exit
  outbound(from, k, p0, n, o) {
    const d = (this.u1 - from[0]) * 0.5;
    return this.P(bezPts(from, [1, 0], [this.u1, this.lv(k)], [1, 0], d, d, n), { p0, p1: this.col + 1, onEnd: this.out(this.a + k), ...o });
  }
}

// An element that takes one marble at a time onto a wheel of radius rho centred at C:
// each lane has an approach curve to the rim and a short feed onto the wheel.
class Wheel extends Elem {
  constructor(col, a, n) {
    super(col, a, n);
    this.inP = []; this.feed = []; this.busy = false;
  }
  addFeed(k, angle) {
    const [cx, cy] = this.C, wr = this.rho + 2.2 * r, ci = [Math.cos(angle), Math.sin(angle)];
    const rim = [cx + wr * ci[0], cy + wr * ci[1]], onWheel = [cx + this.rho * ci[0], cy + this.rho * ci[1]];
    const d0 = Math.hypot(rim[0] - this.u0, rim[1] - this.lv(k)) * 0.45;
    this.inP.push(this.P(bezPts([this.u0, this.lv(k)], [1, 0], rim, [-ci[0], -ci[1]], d0, d0, 24),
      { p0: this.col, p1: this.col + 0.3, src: this.a + k, onEnd: m => this.arrive(m, k) }));
    this.feed.push(this.P(linePts(rim, onWheel, 6),
      { p0: this.col + 0.3, p1: this.col + 0.4, src: this.a + k, onEnd: m => this.capture(m, k) }));
  }
  arrive(m, k) {
    if (this.busy) return;
    this.busy = true;
    setPath(m, this.feed[k]);
  }
}

// ---------- single-lane elements ----------
// straight or wiggly track
class Track extends Elem {
  constructor(col, a, wiggle) {
    super(col, a, 1);
    const v = this.lv(0), A = wiggle ? 0.2 * s * (rng() < 0.5 ? -1 : 1) : 0, pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      pts.push([lerp(this.u0, this.u1, t), v + A * Math.sin(TAU * t) * Math.sin(Math.PI * t)]);
    }
    this.p = this.through(pts);
  }
}

// loop-the-loop on wire rails
class Loop extends Elem {
  constructor(col, a) {
    super(col, a, 1);
    const v = this.lv(0), span = this.wd * 0.7, lead = (this.wd - span) / 2;
    const A = span / TAU, B = 2.6 * A, c = 0.44 * s * (rng() < 0.5 ? -1 : 1);
    // half-angle d where the loop crosses itself (A·d = B·sin d)
    let lo = 0.01, hi = Math.PI;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (A * mid < B * Math.sin(mid)) lo = mid; else hi = mid;
    }
    const d = lo, n = 120, pts = [[this.u0, v]], th = [0];
    for (let i = 0; i <= n; i++) {
      const t = TAU * i / n;
      pts.push([this.u0 + lead + A * t + B * Math.sin(t), v + c * (1 - Math.cos(t)) / 2]);
      th.push(t);
    }
    pts.push([this.u1, v]); th.push(TAU);
    const p = this.through(pts, { style: 'rails' });
    const sAt = t => p.cum[th.findIndex(x => x >= t)];
    p.elev = [[sAt(Math.PI + d - 0.5), sAt(Math.PI + d + 0.5)]];
    const h0 = sAt(Math.PI - d - 0.6), h1 = sAt(Math.PI + d + 0.6);
    p.hfn = sv => sv <= h0 || sv >= h1 ? 0 : Math.sin(Math.PI * (sv - h0) / (h1 - h0)) * 0.45;
    this.p = p;
  }
}

// trampoline hop over a gap
class Bounce extends Elem {
  constructor(col, a) {
    super(col, a, 1);
    const v = this.lv(0);
    const p = this.through(linePts([this.u0, v], [this.u1, v], 30), { hopElev: true });
    const A = p.len * 0.22, B = p.len * 0.8;
    p.hfn = sv => sv <= A || sv >= B ? 0 : Math.sin(Math.PI * (sv - A) / (B - A)) * 0.9;
    p.gap = [A + 0.5 * r, B - 0.5 * r];
    p.events = [{ at: A, fn: () => { this.hit[0] = now; } }, { at: B, fn: () => { this.hit[1] = now; } }];
    this.pads = [this.u0 + A, this.u0 + B]; this.v = v; this.hit = [-9, -9]; this.p = p;
  }
  drawUnder(g) {
    const so = localVec(1.5, 3);
    for (let k = 0; k < 2; k++) {
      // a pad squashes and wobbles when hit
      const dt = now - this.hit[k], sq = dt < 0.7 ? Math.exp(-dt * 6) * Math.cos(dt * 28) : 0;
      const pw = 1.0 * r * (1 - 0.4 * sq), ph = 3.0 * r * (1 + 0.12 * sq), x = this.pads[k];
      fillRoundRect(g, theme.shadow, x - pw / 2 + so[0], this.v - ph / 2 + so[1], pw, ph, pw * 0.45);
      fillRoundRect(g, theme.coral, x - pw / 2, this.v - ph / 2, pw, ph, pw * 0.45);
      g.strokeStyle = theme.coralDk; g.lineWidth = 0.12 * r; g.stroke();
      g.beginPath(); g.moveTo(x, this.v - ph * 0.32); g.lineTo(x, this.v + ph * 0.32); g.stroke();
    }
  }
}

// changer: rainbow prism that transmutes the marble
class Changer extends Elem {
  constructor(col, a) {
    super(col, a, 1);
    this.v = this.lv(0); this.flash = -9;
    const p = this.through(linePts([this.u0, this.v], [this.u1, this.v], 30));
    p.events = [{ at: p.len / 2, fn: m => this.transmute(m) }];
    this.p = p;
  }
  transmute(m) {
    m.mat = pickMat(m.mat);
    burst(m.u, m.v, m.mat, 14);
    this.flash = now;
  }
  drawOver(g) {
    const x = this.uc, y = this.v, pw = 0.9 * r, ph = 3.5 * r, dt = now - this.flash;
    if (dt < 0.5) {
      g.strokeStyle = `rgba(255,255,255,${0.8 * (1 - dt * 2)})`; g.lineWidth = 0.2 * r;
      circle(g, x, y, r * (1.3 + 4 * dt)); g.stroke();
    }
    const gr = g.createLinearGradient(x, y - ph / 2, x, y + ph / 2);
    for (let i = 0; i <= 6; i++) gr.addColorStop(i / 6, hsl(i * 55, 85, 68, 0.78));
    fillRoundRect(g, gr, x - pw / 2, y - ph / 2, pw, ph, pw * 0.4);
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 0.12 * r; g.stroke();
  }
}

// ---------- two- and three-lane elements ----------
// crossover: two gated lanes swap, one over a bridge
class Cross extends Elem {
  constructor(col, a) {
    super(col, a, 2);
    const ug = this.u0 + 0.22 * this.wd, ue = this.u1 - 0.1 * this.wd;   // gate and end of the swap
    this.ug = ug; this.wait = [null, null]; this.since = [0, 0]; this.openT = [-9, -9];
    this.inP = [0, 1].map(k => this.P(linePts([this.u0, this.lv(k)], [ug, this.lv(k)], 8),
      { p0: col, p1: col + 0.3, src: this.a + k, onEnd: m => this.arrive(m, k) }));
    this.xP = [0, 1].map(k => {
      const v0 = this.lv(k), v1 = this.lv(1 - k), d = (ue - ug) * 0.5;
      const pts = bezPts([ug, v0], [1, 0], [ue, v1], [1, 0], d, d, 40).concat(linePts([ue, v1], [this.u1, v1], 6).slice(1));
      const p = this.P(pts, { p0: col + 0.3, p1: col + 1, src: this.a + k, onEnd: this.out(this.a + 1 - k) });
      if (k === 1) {
        const ea = p.len * 0.2, eb = p.len * 0.68;
        p.elev = [[ea, eb]];
        p.hfn = sv => sv <= ea || sv >= eb ? 0 : 0.25 * Math.sin(Math.PI * (sv - ea) / (eb - ea));
      }
      return p;
    });
  }
  outs(live) { return [...live].map(l => 2 * this.a + 1 - l); }
  arrive(m, k) {
    if (this.wait[k]) return;
    this.wait[k] = m; m.held = true; this.since[k] = now;
  }
  release(k) {
    const m = this.wait[k];
    this.wait[k] = null; m.held = false;
    setPath(m, this.xP[k]);
    this.openT[k] = now;
  }
  // both gates open together when both lanes are waiting; a lone marble goes after a while
  update() {
    if (this.wait[0] && this.wait[1]) { this.release(0); this.release(1); return; }
    for (let k = 0; k < 2; k++) if (this.wait[k] && now - this.since[k] > 1.4) this.release(k);
  }
  drawUnder(g) {
    for (let k = 0; k < 2; k++) {
      const dt = now - this.openT[k];
      const o = dt < 0.12 ? dt / 0.12 : dt < 0.7 ? 1 : Math.max(0, 1 - (dt - 0.7) / 0.25);
      const x = this.ug + 1.4 * r, y = this.lv(k) + (k ? 1 : -1) * easeInOut(o) * 2.4 * r;
      fillRoundRect(g, theme.lavDk, x - 0.28 * r, y - 1.35 * r, 0.56 * r, 2.7 * r, 0.28 * r);
    }
  }
}

// clone box: one in, two out
class Clone extends Elem {
  constructor(col, a) {
    super(col, a, 2);
    this.hw = 0.27 * this.wd; this.hh = 0.48 * s;
    this.I = [this.uc - 0.1 * this.wd, this.vmid];
    this.O = [0, 1].map(k => [this.uc + 0.1 * this.wd, lerp(this.vmid, this.lv(k), 0.62)]);
    this.inP = [0, 1].map(k => this.inbound(k, this.I, col + 0.4, m => this.arrive(m)));
    this.outP = [0, 1].map(k => this.outbound(this.O[k], k, col + 0.6, 24));
    this.busy = null; this.t0 = -9; this.done = -9;
  }
  outs() { return this.lanes(); }
  arrive(m) {
    if (this.busy) return;
    this.busy = m; m.held = true; this.t0 = now;
  }
  // after a pause, send the marble out one side and (room permitting) a copy out the other
  update() {
    const m = this.busy;
    if (!m || now - this.t0 < 0.9) return;
    if (!this.O.every(o => clearAt(o[0], o[1], 2.1 * r))) return;
    const k = Math.random() < 0.5 ? 0 : 1;
    m.held = false; setPath(m, this.outP[k]);
    if (marbles.length < cap) {
      const c = makeMarble(this.O[1 - k][0], this.O[1 - k][1], m.mat);
      c.held = false; c.tags = m.tags.slice(); setPath(c, this.outP[1 - k]); marbles.push(c);
    }
    burst(this.uc + this.hw, this.vmid, m.mat, 8);
    this.busy = null; this.done = now;
  }
  drawOver(g) {
    const busy = !!this.busy, so = localVec(2, 4);
    const pulse = now - this.done < 0.3 ? 1 + 0.08 * Math.sin((now - this.done) / 0.3 * Math.PI) : 1;
    const jit = busy ? Math.sin(now * 55) * 0.08 * r : 0;
    const hw = this.hw * pulse, hh = this.hh * pulse, x = this.uc + jit, y = this.vmid;
    fillRoundRect(g, theme.shadow, x - hw + so[0], y - hh + so[1], 2 * hw, 2 * hh, 0.5 * r);
    fillRoundRect(g, theme.mint, x - hw, y - hh, 2 * hw, 2 * hh, 0.5 * r);
    g.strokeStyle = theme.mintDk; g.lineWidth = 0.14 * r; g.stroke();
    fillCircle(g, theme.mintDk, x + 0.15 * hw, y - 0.45 * r, 0.32 * r);
    fillCircle(g, theme.mintDk, x + 0.15 * hw, y + 0.45 * r, 0.32 * r);
    // busy light
    fillCircle(g, busy && Math.sin(now * 20) > 0 ? theme.butter : theme.mintDk, x - 0.55 * hw, y, 0.22 * r);
  }
}

// spinner: wheel spins and flings the marble to a random lane
class Spinner extends Wheel {
  constructor(col, a) {
    super(col, a, 3);
    this.rho = Math.min(0.32 * s, 0.2 * this.wd); this.C = [this.uc, this.vmid];
    const [cx, cy] = this.C;
    this.fin = []; this.fout = []; this.outP = [];   // entry and exit angles per lane
    for (let k = 0; k < 3; k++) {
      const dv = k - 1, fi = Math.PI - dv * 0.85, fo = dv * 0.8;
      const co = [Math.cos(fo), Math.sin(fo)], Q = [cx + this.rho * co[0], cy + this.rho * co[1]];
      const d1 = Math.hypot(this.u1 - Q[0], this.lv(k) - Q[1]) * 0.45;
      this.fin.push(fi); this.fout.push(fo);
      this.addFeed(k, fi);
      const op = this.P(bezPts(Q, co, [this.u1, this.lv(k)], [1, 0], d1, d1, 28), { p0: col + 0.6, p1: col + 1, onEnd: this.out(this.a + k) });
      this.freeAfter(op, 2.4 * r);
      this.outP.push(op);
    }
    this.spin = null; this.ang = rng() * TAU;
  }
  outs() { return this.lanes(); }
  capture(m, k) {
    if (this.spin) return;
    m.held = true;
    const out = Math.floor(Math.random() * 3);
    // turn from entry to exit angle, plus one or two extra full turns
    const d = ((this.fout[out] - this.fin[k]) % TAU + TAU) % TAU + TAU * (Math.random() < 0.4 ? 2 : 1);
    this.spin = { m, f0: this.fin[k], d, t0: now, dur: 0.7 + 0.35 * d / TAU, out, a0: this.ang, last: 0 };
  }
  update() {
    const sp = this.spin;
    if (!sp) return;
    const t = clamp((now - sp.t0) / sp.dur, 0, 1), e = easeOut(t), m = sp.m, f = sp.f0 + sp.d * e;
    this.ang = sp.a0 + sp.d * e;
    m.u = this.C[0] + this.rho * Math.cos(f); m.v = this.C[1] + this.rho * Math.sin(f);
    m.roll += (e - sp.last) * sp.d * this.rho / r; sp.last = e;
    if (now - sp.t0 > sp.dur + 0.15) { m.held = false; setPath(m, this.outP[sp.out]); this.spin = null; }
  }
  drawUnder(g) {
    const [cx, cy] = this.C, R0 = this.rho + 1.3 * r, so = localVec(2, 4);
    fillCircle(g, theme.shadow, cx + so[0], cy + so[1], R0);
    for (let j = 0; j < 6; j++) {
      g.fillStyle = j % 2 ? theme.butter : theme.butterLt;
      g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R0, this.ang + j * TAU / 6, this.ang + (j + 1) * TAU / 6); g.closePath(); g.fill();
    }
    g.strokeStyle = theme.butterDk; g.lineWidth = 0.14 * r; circle(g, cx, cy, R0); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = 2.1 * r; circle(g, cx, cy, this.rho); g.stroke();
    fillCircle(g, theme.butterDk, cx, cy, 0.45 * r);
  }
}

// flip-flop: alternates marbles between two lanes
class Flip extends Elem {
  constructor(col, a) {
    super(col, a, 2);
    const J = [this.uc - 0.1 * this.wd, this.vmid];   // junction where the arm sits
    this.J = J;
    this.inP = [0, 1].map(k => this.inbound(k, J, col + 0.5, m => this.pass(m)));
    this.outP = [0, 1].map(k => this.outbound(J, k, col + 0.5, 28));
    this.state = rng() < 0.5 ? 0 : 1; this.shown = this.state; this.flipAt = 0;
    this.ang = this.target();
  }
  outs() { return this.lanes(); }
  target() { return this.shown === 0 ? 0.5 : -0.5; }
  // the arm swings over just after the marble has gone past
  pass(m) {
    setPath(m, this.outP[this.state]);
    this.state ^= 1;
    this.flipAt = now + 0.3;
  }
  update(dt) {
    if (now >= this.flipAt) this.shown = this.state;
    this.ang += (this.target() - this.ang) * Math.min(1, dt * 14);
  }
  drawUnder(g) {
    const px = this.J[0] + 2.0 * r, py = this.J[1], len = 0.3 * this.wd;
    g.save(); g.translate(px, py); g.rotate(this.ang);
    fillRoundRect(g, theme.coral, -0.32 * r, -0.32 * r, len, 0.64 * r, 0.32 * r);
    g.restore();
    fillCircle(g, theme.coralDk, px, py, 0.42 * r);
  }
}

// funnel: marble spirals down and pops out the bottom
class Funnel extends Wheel {
  constructor(col, a) {
    super(col, a, 2);
    this.rho = Math.min(0.36 * s, 0.22 * this.wd); this.C = [this.uc, this.vmid];
    const rho = this.rho;
    this.fin = [Math.PI + 0.6, Math.PI - 0.6]; this.dir = [1, -1];   // entry angle and spin direction per lane
    for (let k = 0; k < 2; k++) this.addFeed(k, this.fin[k]);
    this.outK = rng() < 0.5 ? 0 : 1;
    // the marble comes up out of the hole small and dark, then grows back
    const op = this.outbound(this.C, this.outK, col + 0.6, 28, {
      scale: sv => sv < rho ? 0.55 + 0.45 * sv / rho : 1,
      dark: sv => sv < rho ? 0.5 * (1 - sv / rho) : 0
    });
    this.freeAfter(op, rho + 2.2 * r);
    this.outP = op; this.sp = null;
  }
  outs() { return [this.a + this.outK]; }
  capture(m, k) {
    if (this.sp) return;
    m.held = true;
    this.sp = { m, k, t0: now, lastF: this.fin[k] };
  }
  update() {
    const sp = this.sp;
    if (!sp) return;
    const t = clamp((now - sp.t0) / 1.7, 0, 1), m = sp.m;
    const rad = this.rho * Math.pow(1 - t, 0.9), f = this.fin[sp.k] + this.dir[sp.k] * 3.5 * Math.PI * Math.pow(t, 1.7);
    m.u = this.C[0] + rad * Math.cos(f); m.v = this.C[1] + rad * Math.sin(f);
    m.roll += Math.abs(f - sp.lastF) * rad / r; sp.lastF = f;
    m.scale = 1 - 0.45 * t; m.dark = 0.5 * t;
    if (t >= 1) { m.held = false; setPath(m, this.outP); this.sp = null; }
  }
  drawBase(g) {
    const [cx, cy] = this.C, R0 = this.rho + 1.15 * r, so = localVec(2, 4);
    fillCircle(g, theme.shadow, cx + so[0], cy + so[1], R0);
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R0);
    gr.addColorStop(0, theme.lavDk); gr.addColorStop(1, theme.lav);
    fillCircle(g, gr, cx, cy, R0);
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 0.1 * r;
    for (const f of [0.35, 0.62, 0.85]) { circle(g, cx, cy, R0 * f); g.stroke(); }
    g.strokeStyle = theme.lavDk; g.lineWidth = 0.14 * r; circle(g, cx, cy, R0); g.stroke();
    fillCircle(g, 'rgba(0,0,0,0.55)', cx, cy, 0.5 * r);
  }
}

// fuser: two marbles meet in a heart and become one
class Fuser extends Elem {
  constructor(col, a) {
    super(col, a, 2);
    const hk = 0.036 * s;   // heart scale
    this.hk = hk; this.HC = [this.uc - 0.06 * s, this.vmid];
    this.S = [0, 1].map(k => [this.HC[0] - 5 * hk, this.vmid + (k ? 1 : -1) * 7.5 * hk]);   // waiting spots
    this.C = [this.HC[0] + 5 * hk, this.vmid];                                               // meeting point
    this.inP = [0, 1].map(k => this.inbound(k, this.S[k], col + 0.4, m => this.arrive(m, k)));
    this.outK = rng() < 0.5 ? 0 : 1;
    const op = this.outbound(this.C, this.outK, col + 0.6, 28);
    this.freeAfter(op, 2.4 * r);
    this.outP = op; this.slot = [null, null]; this.since = [0, 0]; this.busy = false; this.fuse = null; this.fusedAt = -9;
  }
  outs() { return [this.a + this.outK]; }
  arrive(m, k) {
    if (this.slot[k] || this.busy) return;
    this.slot[k] = m; m.held = true; this.since[k] = now;
  }
  // start merging the marbles in ms (one or two) at the meeting point
  startFuse(ms) {
    this.busy = true;
    this.slot = [null, null];
    this.fuse = { ms, from: ms.map(m => [m.u, m.v]), t0: now };
  }
  stepFuse(f) {
    const t = clamp((now - f.t0) / 0.45, 0, 1), e = easeInOut(t);
    f.ms.forEach((m, i) => { m.u = lerp(f.from[i][0], this.C[0], e); m.v = lerp(f.from[i][1], this.C[1], e); });
    if (t < 1) return;
    const [m, o] = f.ms;
    if (o) { m.mat = blendMat(m.mat, o.mat); o.dead = true; burst(this.C[0], this.C[1], m.mat, 16); this.fusedAt = now; }
    m.held = false; setPath(m, this.outP); this.fuse = null;
  }
  // two waiting marbles fuse at once; a lone one gives up waiting and passes through
  update() {
    if (this.fuse) { this.stepFuse(this.fuse); return; }
    if (this.busy) return;
    const [x, y] = this.slot;
    if (x && y) this.startFuse([x, y]);
    else if (x && now - this.since[0] > 1.6) this.startFuse([x]);
    else if (y && now - this.since[1] > 1.6) this.startFuse([y]);
  }
  // heart curve scaled by k, pointing along the flow
  heart(g, k) {
    const hk = this.hk * k, [hu, hv] = this.HC;
    g.beginPath();
    for (let i = 0; i <= 64; i++) {
      const t = TAU * i / 64, x = 16 * Math.sin(t) ** 3;
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      if (i) g.lineTo(hu - y * hk, hv + x * hk); else g.moveTo(hu - y * hk, hv + x * hk);
    }
    g.closePath();
  }
  drawBase(g) {
    this.heart(g, 1);
    g.fillStyle = theme.pink; g.globalAlpha = 0.3; g.fill(); g.globalAlpha = 1;
    g.strokeStyle = theme.pink; g.lineWidth = 0.25 * r; g.stroke();
  }
  drawOver(g) {
    const dt = now - this.fusedAt;
    if (dt > 0.6) return;
    this.heart(g, 1 + 0.15 * Math.sin(dt / 0.6 * Math.PI));
    g.strokeStyle = theme.pinkDk; g.globalAlpha = 1 - dt / 0.6; g.lineWidth = 0.3 * r; g.stroke(); g.globalAlpha = 1;
  }
}

// ---------- last column ----------
// collector: every lane drains toward its nearest end point
class Collector extends Elem {
  constructor(col) {
    super(col, 0, L);
    this.u1 = uSink; this.p = [];
    for (let i = 0; i < L; i++) {
      const j = nearestSink(i), du = uSink - this.u0;
      this.p[i] = this.P(bezPts([this.u0, laneV(i)], [1, 0], [uSink, laneV(j)], [1, 0], du * 0.5, du * 0.5, 36),
        { p0: col, p1: col + 1, src: i, onEnd: m => sinkAt[j].arrive(m) });
    }
  }
  enter(m, lane) { setPath(m, this.p[lane]); }
}
