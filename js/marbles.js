'use strict';
// Paths that marbles roll along, the marbles themselves, and the sparkle particles.

// ---------- paths ----------
// A polyline in flow coordinates, with optional per-path behaviour (see the defaults below).
class Path {
  constructor(pts, o) {
    this.pts = pts;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    this.cum = cum; this.len = cum[cum.length - 1];
    this.p0 = 0; this.p1 = 1;        // overall progress (in columns) at the start and end of this path
    this.elev = [];                  // [from, to] stretches raised above other track
    this.hfn = null;                 // height profile: arc length → lift (0 = on the ground)
    this.hopElev = false;            // count a hop above 0.15 as elevated
    this.events = [];                // { at, fn(marble) } fired as a marble passes `at`
    this.src = null;                 // input lane, for paths drawn only when that lane is live
    this.onEnd = null;               // fn(marble) at the end of the path
    this.scale = null; this.dark = null;   // arc length → marble size / darkening
    this.gap = null;                 // [from, to] stretch with no track (a jump)
    this.style = 'channel';          // 'channel' or 'rails'
    Object.assign(this, o);
  }
  idx(sv) {
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= sv) lo = mid; else hi = mid;
    }
    return lo;
  }
  at(sv) {
    sv = clamp(sv, 0, this.len);
    const i = this.idx(sv), a = this.pts[i], b = this.pts[i + 1] || a;
    const t = (sv - this.cum[i]) / ((this.cum[i + 1] - this.cum[i]) || 1);
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  }
  slice(a, b) {
    const out = [this.at(a)];
    for (let i = 0; i < this.pts.length; i++) if (this.cum[i] > a && this.cum[i] < b) out.push(this.pts[i]);
    out.push(this.at(b));
    return out;
  }
  h(sv) { return this.hfn ? this.hfn(sv) : 0; }
  isElev(sv) {
    for (const [a, b] of this.elev) if (sv >= a && sv <= b) return true;
    return this.hopElev && this.h(sv) > 0.15;
  }
  prog(sv) { return this.p0 + (this.p1 - this.p0) * (this.len ? sv / this.len : 1); }
}

// ---------- marbles ----------
// flecks on stone marbles, as polar offsets that turn as the marble rolls
function makeSpecks() {
  const specks = [];
  for (let i = 0; i < 9; i++) {
    specks.push({ a: Math.random() * TAU, d: Math.sqrt(Math.random()) * 0.8, z: 0.07 + Math.random() * 0.1, k: Math.random() < 0.5 ? -1 : 1 });
  }
  return specks;
}
function makeMarble(u, v, mat) {
  const specks = makeSpecks();
  return {
    id: nextId++, u, v, mat, path: null, s: 0, evi: 0, prog: 0, held: true, visible: true,
    scale: 1, dark: 0, h: 0, elev: false, roll: Math.random() * TAU, clip: null, dead: false, specks, tags: [], dir: [1, 0]
  };
}
// copy the path's height, elevation, size and darkening at arc length sv onto the marble
function syncToPath(m, P, sv) {
  m.elev = P.isElev(sv); m.h = P.h(sv);
  m.scale = P.scale ? P.scale(sv) : 1; m.dark = P.dark ? P.dark(sv) : 0;
}
function setPath(m, P) {
  m.path = P; m.s = 0; m.evi = 0;
  [m.u, m.v] = P.at(0);
  m.prog = P.p0;
  syncToPath(m, P, 0);
}
// pass a marble arriving at lane `lane` of column `col` to the element there
function handoff(m, col, lane) {
  const e = grid[col][lane];
  e.enter(m, lane);
  if (e.tag) { m.tags.push(e.tag); e.lit = now; emit('tagPassed', m, e); }
}
function clearAt(u, v, d) {
  return !marbles.some(m => !m.dead && (m.u - u) ** 2 + (m.v - v) ** 2 < d * d);
}
// is o in front of m, judged by m's direction of travel?
const inFront = (m, o) => m.dir[0] * (o.u - m.u) + m.dir[1] * (o.v - m.v) > 0;
function blocked(m, nu, nv, nel) {
  const lim = (2.05 * r) ** 2;
  const dl = Math.hypot(nu - m.u, nv - m.v) || 1;
  m.dir = [(nu - m.u) / dl, (nv - m.v) / dl];
  for (const o of marbles) {
    if (o === m || o.dead || o.elev !== nel) continue;
    const dn = (o.u - nu) ** 2 + (o.v - nv) ** 2;
    if (dn >= lim || !inFront(m, o)) continue;
    // two marbles converging on a merge: the one further along goes first
    if (!o.held && inFront(o, m) && (m.prog > o.prog || (m.prog === o.prog && m.id < o.id))) continue;
    return true;
  }
  return false;
}
function stepMarbles(dt) {
  marbles.sort((a, b) => b.prog - a.prog || a.id - b.id);
  for (const m of marbles) {
    if (m.dead || m.held || !m.path) continue;
    const P = m.path;
    if (m.s < P.len) {
      const ns = Math.min(P.len, m.s + speed * dt);
      const [nu, nv] = P.at(ns);
      if (!blocked(m, nu, nv, P.isElev(ns))) {
        m.roll += (ns - m.s) / r;
        m.s = ns; m.u = nu; m.v = nv; m.prog = P.prog(ns);
        syncToPath(m, P, ns);
        while (m.evi < P.events.length && P.events[m.evi].at <= m.s) P.events[m.evi++].fn(m);
      }
    }
    if (m.s >= P.len && P.onEnd && m.path === P) P.onEnd(m);
  }
  marbles = marbles.filter(m => !m.dead);
}

// ---------- particles ----------
function burst(u, v, mat, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, sp = s * (0.5 + Math.random() * 1.1);
    particles.push({ u, v, vu: Math.cos(a) * sp, vv: Math.sin(a) * sp, life: 1, h: mat.h + (Math.random() - 0.5) * 60, sat: Math.max(mat.s, 50), l: 68 });
  }
}
function stepParticles(dt) {
  for (const p of particles) {
    p.u += p.vu * dt; p.v += p.vv * dt;
    p.vu *= 1 - 3 * dt; p.vv *= 1 - 3 * dt;
    p.life -= dt * 1.7;
  }
  particles = particles.filter(p => p.life > 0);
}
// four-pointed sparkles, drawn in flow coordinates
function drawParticles(g) {
  for (const p of particles) {
    const z = r * 0.42 * p.life;
    g.fillStyle = hsl(p.h, p.sat, p.l, p.life);
    g.beginPath();
    g.moveTo(p.u, p.v - z); g.quadraticCurveTo(p.u, p.v, p.u + z, p.v);
    g.quadraticCurveTo(p.u, p.v, p.u, p.v + z); g.quadraticCurveTo(p.u, p.v, p.u - z, p.v);
    g.quadraticCurveTo(p.u, p.v, p.u, p.v - z);
    g.fill();
  }
}

// ---------- marble drawing (screen space) ----------
function drawMetal(g, x, y, R, { h, s: sa, l }) {
  let gr = g.createRadialGradient(x - 0.3 * R, y - 0.35 * R, 0.05 * R, x, y, R);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.2, hsl(h, sa, l + 20)); gr.addColorStop(0.5, hsl(h, sa, l));
  gr.addColorStop(0.82, hsl(h, sa, l - 28)); gr.addColorStop(1, hsl(h, sa, l - 12));
  fillCircle(g, gr, x, y, R);
  // reflected horizon across the lower half
  g.save(); circle(g, x, y, R); g.clip();
  gr = g.createLinearGradient(x, y - R, x, y + R);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)');
  gr.addColorStop(0.54, hsl(h, sa, l - 45, 0.4)); gr.addColorStop(0.75, hsl(h, sa, l - 30, 0.12)); gr.addColorStop(1, hsl(h, sa, l + 15, 0.4));
  g.fillStyle = gr; g.fillRect(x - R, y - R, 2 * R, 2 * R);
  g.restore();
}
function drawGlass(g, x, y, R, { h, s: sa, l }, roll) {
  let gr = g.createRadialGradient(x - 0.25 * R, y - 0.3 * R, 0.1 * R, x, y, R);
  gr.addColorStop(0, hsl(h, sa, l + 28, 0.95)); gr.addColorStop(0.55, hsl(h, sa, l, 0.92)); gr.addColorStop(1, hsl(h, sa, l - 20, 0.97));
  fillCircle(g, gr, x, y, R);
  g.save(); circle(g, x, y, R); g.clip();
  // three swirls that turn as it rolls
  g.translate(x, y); g.rotate(roll);
  g.strokeStyle = hsl(h + 35, sa, l + 32, 0.6); g.lineWidth = 0.17 * R; g.lineCap = 'round';
  for (let j = 0; j < 3; j++) {
    g.rotate(TAU / 3);
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(0.6 * R, -0.25 * R, 0.5 * R, 0.5 * R); g.stroke();
  }
  setScreen(g);
  // light caught at the bottom
  gr = g.createRadialGradient(x + 0.3 * R, y + 0.45 * R, 0, x + 0.3 * R, y + 0.45 * R, 0.55 * R);
  gr.addColorStop(0, hsl(h, sa, l + 38, 0.6)); gr.addColorStop(1, hsl(h, sa, l + 38, 0));
  g.fillStyle = gr; g.fillRect(x - R, y - R, 2 * R, 2 * R);
  g.restore();
}
function drawStone(g, x, y, R, { h, s: sa, l }, roll, specks) {
  const gr = g.createRadialGradient(x - 0.3 * R, y - 0.35 * R, 0.1 * R, x, y, R);
  gr.addColorStop(0, hsl(h, sa, l + 12)); gr.addColorStop(1, hsl(h, sa, l - 15));
  fillCircle(g, gr, x, y, R);
  g.save(); circle(g, x, y, R); g.clip();
  for (const p of specks) {
    const a = p.a + roll;
    fillCircle(g, hsl(h, sa, l + p.k * 22, 0.55), x + Math.cos(a) * p.d * R, y + Math.sin(a) * p.d * R, p.z * R);
  }
  g.restore();
}
function drawMarble(g, x, y, R, mat, roll, specks) {
  const { kind, h, s: sa, l } = mat;
  if (kind === 'metal') drawMetal(g, x, y, R, mat);
  else if (kind === 'glass') drawGlass(g, x, y, R, mat, roll);
  else drawStone(g, x, y, R, mat, roll, specks);
  // specular highlight and rim
  const stone = kind === 'stone';
  const sp = g.createRadialGradient(x - 0.38 * R, y - 0.42 * R, 0, x - 0.38 * R, y - 0.42 * R, (stone ? 0.5 : 0.32) * R);
  sp.addColorStop(0, `rgba(255,255,255,${stone ? 0.35 : 0.95})`); sp.addColorStop(1, 'rgba(255,255,255,0)');
  fillCircle(g, sp, x, y, R);
  g.strokeStyle = hsl(h, sa, l - 38, 0.45); g.lineWidth = Math.max(0.6, 0.05 * R);
  circle(g, x, y, R); g.stroke();
}
// a marble with its shadow, clipping (inside a shutter) and darkening (sinking into a hole)
function drawMarbleObj(g, m) {
  if (!m.visible || m.dead) return;
  const R = r * m.scale * (1 + 0.35 * m.h), [x, y] = toScreen(m.u, m.v);
  g.save();
  if (m.clip) {
    const [cx, cy] = toScreen(m.clip[0], m.clip[1]);
    circle(g, cx, cy, Math.max(0.01, m.clip[2])); g.clip();
  } else {
    // the higher it rides, the further and fainter its shadow
    const ox = R * (0.18 + 0.6 * m.h), oy = R * (0.32 + 0.9 * m.h), a = theme.shA * (1 - 0.5 * m.h);
    const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, R * 1.15);
    gr.addColorStop(0, `rgba(${theme.shRGB},${a})`); gr.addColorStop(1, `rgba(${theme.shRGB},0)`);
    fillCircle(g, gr, x + ox, y + oy, R * 1.15);
  }
  drawMarble(g, x, y, R, m.mat, m.roll, m.specks);
  if (m.dark > 0) fillCircle(g, `rgba(0,0,0,${m.dark * 0.85})`, x, y, R);
  g.restore();
}
