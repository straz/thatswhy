'use strict';
// "That's why:" notes. Each pops up by the exit a marble went into, listing the tags of the
// elements it passed. After a moment it glides to the front wall above the slot, passes
// through the wall, and slides out of the slot in the front face and off the bottom of the page.

const NOTE_POP = 0.35;                    // pop-in time
const NOTE_WAIT = 2.2;                    // time on show by the exit
const NOTE_GLIDE = 1.2;                   // glide over to the slot
const NOTE_EXIT = NOTE_WAIT + NOTE_GLIDE; // from here it is sliding out
const NOTE_PAD = 10, NOTE_TITLE_SIZE = 15, NOTE_BODY_SIZE = 12;
const NOTE_TITLE = "That's why:";

let notes;

// ---------- making notes ----------
function makeNote(sink, tags) {
  const g = ctx, pad = NOTE_PAD, fsH = NOTE_TITLE_SIZE, fsB = NOTE_BODY_SIZE;
  const lines = wrapTags(g, tags, box.slot.w - 16 - 2 * pad);   // narrow enough to fit the slot
  g.font = `600 ${fsB}px ${MONO}`;
  let tw = Math.max(...lines.map(l => g.measureText(l).width));
  g.font = `700 ${fsH}px ${HAND}`;
  tw = Math.max(tw, g.measureText(NOTE_TITLE).width);
  const w = tw + 2 * pad, h = pad + fsH * 1.4 + lines.length * fsB * 1.55 + pad * 0.6;
  const [x0, y0] = notePlacement(sink, w, h);
  const jag = n => Array.from({ length: n + 1 }, () => Math.random() * 3);   // torn top and bottom edges
  const n = Math.ceil(w / 7);
  return { sink, lines, w, h, fsH, fsB, pad, x0, y0, rot0: (Math.random() - 0.5) * 0.2, t0: now, jagT: jag(n), jagB: jag(n) };
}
// "A → B → C" across as few lines as fit maxW, keeping only the last few lines
function wrapTags(g, tags, maxW) {
  g.font = `600 ${NOTE_BODY_SIZE}px ${MONO}`;
  let lines = [];
  if (!tags.length) lines = ['just because'];
  for (const tag of tags) {
    const cur = lines.length ? lines[lines.length - 1] + ' → ' + tag : tag;
    if (lines.length && g.measureText(cur).width <= maxW) lines[lines.length - 1] = cur;
    else lines.push(lines.length ? '→ ' + tag : tag);
  }
  if (lines.length > 4) lines = ['…'].concat(lines.slice(-3));
  return lines;
}
// beside the exit (before it along the flow), kept inside the box
function notePlacement(sink, w, h) {
  const [sx, sy] = toScreen(sink.u, sink.v), I = box.inner;
  const x0 = mode === 'lr' ? sx - 2.4 * r - w / 2 : sx, y0 = mode === 'lr' ? sy : sy - 2.6 * r - h / 2;
  return [
    clamp(x0, I.x + w / 2 + 6, I.x + I.w - w / 2 - 6),
    clamp(y0, I.y + h / 2 + 6, I.y + I.h - h / 2 - 6)
  ];
}

// ---------- motion ----------
// centre, rotation, scale and opacity of the note now
function notePos(q) {
  const t = now - q.t0;
  let x = q.x0, y = q.y0, rot = q.rot0, sc = 1, a = 1;
  if (t < NOTE_POP) {
    const e = easeOut(t / NOTE_POP);
    sc = 0.6 + 0.4 * e; a = e; rot = q.rot0 * (2 - e);
  } else if (t >= NOTE_WAIT) {
    // glide to the front wall above the slot, then slide out through it
    const e = easeInOut(clamp((t - NOTE_WAIT) / NOTE_GLIDE, 0, 1)), restY = box.inner.y + box.inner.h - q.h / 2;
    x = lerp(q.x0, box.slot.x, e); y = lerp(q.y0, restY, e); rot = q.rot0 * (1 - e);
    if (t > NOTE_EXIT) {
      const d = t - NOTE_EXIT;
      y = restY + q.h * d + 120 * d * d;
    }
  }
  return { x, y, rot, sc, a };
}
const exiting = q => now - q.t0 > NOTE_EXIT;
// is the note passing through the slot right now?
function inSlot(q) {
  const y = notePos(q).y, sy = box.slot.y;
  return exiting(q) && y + q.h / 2 > sy && y - q.h / 2 < sy;
}
// forget notes once they are off the bottom of the page
function stepNotes() {
  notes = notes.filter(q => notePos(q).y - q.h / 2 < H);
}

// ---------- drawing ----------
function notePath(g, q) {
  const n = q.jagT.length - 1, x = -q.w / 2, y = -q.h / 2;
  g.beginPath();
  g.moveTo(x, y + q.jagT[0]);
  for (let i = 1; i <= n; i++) g.lineTo(x + q.w * i / n, y + q.jagT[i]);
  for (let i = n; i >= 0; i--) g.lineTo(x + q.w * i / n, y + q.h - q.jagB[i]);
  g.closePath();
}
function drawNote(g, q) {
  const { x, y, rot, sc, a } = notePos(q);
  g.globalAlpha = a;
  g.translate(x, y); g.rotate(rot); g.scale(sc, sc);
  g.fillStyle = theme.shadow; g.translate(2, 3); notePath(g, q); g.fill(); g.translate(-2, -3);
  g.fillStyle = theme.paper; notePath(g, q); g.fill();
  // ruled lines
  g.save(); notePath(g, q); g.clip();
  g.strokeStyle = theme.paperLine; g.lineWidth = 1;
  const top = -q.h / 2 + q.pad + q.fsH * 1.4;
  for (let ly = top; ly < q.h / 2; ly += q.fsB * 1.55) {
    g.beginPath(); g.moveTo(-q.w / 2, ly); g.lineTo(q.w / 2, ly); g.stroke();
  }
  g.restore();
  g.fillStyle = theme.paperInk; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.font = `700 ${q.fsH}px ${HAND}`;
  g.fillText(NOTE_TITLE, -q.w / 2 + q.pad, top - q.fsH * 0.3);
  g.font = `600 ${q.fsB}px ${MONO}`;
  q.lines.forEach((l, i) => g.fillText(l, -q.w / 2 + q.pad, top + (i + 1) * q.fsB * 1.55 - q.fsB * 0.35));
}
// inside: the part of each note still in the box (drawn under the lid);
// outside: the part that has come out of the slot (drawn over the front face)
function drawNotes(g, inside) {
  const I = box.inner, sl = box.slot;
  for (const q of notes) {
    if (!inside && !exiting(q)) continue;
    g.save();
    g.beginPath();
    if (inside) g.rect(I.x, I.y, I.w, I.h); else g.rect(0, sl.y, W, H - sl.y);
    g.clip();
    drawNote(g, q);
    g.restore();
  }
}
