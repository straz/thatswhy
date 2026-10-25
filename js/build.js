'use strict';
// Building the machine: lay out the page, fill each column with elements, tag them, and add
// the start and end points. Everything random here comes from the seeded rng, so a seed
// always gives the same machine.

// special elements and how many lanes each takes
const SPECIALS = [[Loop, 1], [Bounce, 1], [Changer, 1], [Cross, 2], [Clone, 2], [Flip, 2], [Funnel, 2], [Fuser, 2], [Spinner, 3]];
const SPREADERS = new Set([Clone, Flip, Spinner, Cross]);   // can send marbles into a lane nothing reaches yet
const PAIRED = new Set([Cross, Fuser]);                     // need marbles arriving on every lane

function build() {
  layout();
  theme = currentTheme();
  applyThemeToCss(theme);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  for (const c of [baseCanvas, flyCanvas]) { c.width = canvas.width; c.height = canvas.height; }
  applyTilt();
  rng = mulberry32(seed);
  marbles = []; particles = []; slips = []; statuses = []; elements = []; grid = [];
  const reach = placeElements();
  assignTags();
  placeEndpoints(reach);
  renderStatic();
  renderBox();
  resetLid();
}

// Fill columns 1..K left to right, drawing specials from a shuffled bag so each turns up
// about equally often. Returns the lanes that marbles can reach after the last column.
function placeElements() {
  const bag = shuffle(SPECIALS.slice(), rng);
  // lanes that can actually carry marbles; no track is laid where nothing can arrive
  let reach = new Set(srcLanes);
  for (let col = 1; col <= K; col++) {
    grid[col] = [];
    const next = new Set();
    let i = 0;
    while (i < L) {
      const e = chooseElement(col, i, reach, bag);
      if (!e) { i++; continue; }
      e.live = new Set(e.lanes().filter(l => reach.has(l)));
      for (const l of e.outs(e.live)) next.add(l);
      for (let k = 0; k < e.n; k++) grid[col][i + k] = e;
      elements.push(e);
      i += e.n;
    }
    reach = next;
  }
  return reach;
}

// the element to start at lane i of this column, or null to leave the lane empty
function chooseElement(col, i, reach, bag) {
  const fits = ([type, n]) => {
    if (i + n > L) return false;
    const lanes = Array.from({ length: n }, (_, k) => i + k);
    return PAIRED.has(type) ? lanes.every(l => reach.has(l)) : lanes.some(l => reach.has(l));
  };
  // next to a dead lane, prefer an element that spreads traffic into it
  const mixed = ([type, n]) => fits([type, n]) && SPREADERS.has(type) && Array.from({ length: n }, (_, k) => reach.has(i + k)).includes(false);
  if (rng() < 0.5 || bag.some(mixed)) {
    let idx = rng() < 0.75 ? bag.findIndex(mixed) : -1;
    if (idx < 0) idx = bag.findIndex(fits);
    if (idx >= 0) {
      const [Type] = bag.splice(idx, 1)[0];
      if (!bag.length) bag.push(...shuffle(SPECIALS.slice(), rng));
      return new Type(col, i);
    }
  }
  return reach.has(i) ? new Track(col, i, rng() < 0.3) : null;
}

// every special element gets a unique random three-letter tag
const randomTag = () => Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(rng() * 26))).join('');
function assignTags() {
  const used = new Set();
  for (const e of elements) {
    if (e instanceof Track) continue;
    let tag;
    do { tag = randomTag(); } while (used.has(tag));
    used.add(tag); e.tag = tag;
  }
}

// end points, the collector column that drains every lane into them, and start points
function placeEndpoints(reach) {
  sinkAt = {};
  sinks = sinkLanes.map(l => (sinkAt[l] = new Sink(l)));
  const collector = new Collector(K + 1);
  collector.live = reach;
  elements.push(collector);
  grid[K + 1] = Array(L).fill(collector);
  sources = srcLanes.map(l => new Source(l));
}
