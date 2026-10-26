'use strict';
// Status conditions shown on the lid. Each time a marble passes a tagged element, a condition
// from the current mode (one not already on the board) appears under that element's LED and
// label, replacing the one shown there before, which fades out. A status also fades out when
// its marble leaves through an exit hole.

const STATUS_FADE_IN = 0.3, STATUS_FADE_OUT = 0.8;
const STATUS_CARD = '#f7eedb';

// { text, elem, owner (marble), t0, fadeAt (null while showing), replacing (covers an older
//   status, so its card shows at once), card (its wrapped lines and width, once drawn) }
let statuses;

on('tagPassed', addStatus);
on('swallowed', releaseStatuses);
on('fused', transferStatuses);

function addStatus(m, e) {
  const shown = new Set(statuses.map(q => q.text));
  const pool = CONDITIONS[scenario].filter(text => !shown.has(text));
  if (!pool.length) return;
  const text = pool[Math.floor(Math.random() * pool.length)];
  // one current status per element: the previous one fades out under the new one
  let replacing = false;
  for (const q of statuses) if (q.elem === e && q.fadeAt === null) { q.fadeAt = now; replacing = true; }
  statuses.push({ text, elem: e, owner: m, t0: now, fadeAt: null, replacing, card: null });
}
// the marble has left through an exit hole: fade out everything it put up
function releaseStatuses(m) {
  for (const q of statuses) if (q.owner === m && q.fadeAt === null) q.fadeAt = now;
}
// two marbles fused into one: the survivor carries both sets of statuses
function transferStatuses(from, to) {
  for (const q of statuses) if (q.owner === from) q.owner = to;
}
function stepStatuses() {
  statuses = statuses.filter(q => q.fadeAt === null || now - q.fadeAt < STATUS_FADE_OUT);
}

// ---------- drawing (on the lid) ----------
const statusSize = () => tagSize() * 1.02;   // a touch larger than the tag, for reading
const statusFont = () => `500 ${Math.round(statusSize() * 2) / 2}px ${MONO}`;
// room for a status under an element: its column's width, or its lanes' width when top-down
const statusWidth = e => (mode === 'lr' ? e.wd : e.n * s) * 0.92;
const fadeOut = q => q.fadeAt === null ? 1 : 1 - clamp((now - q.fadeAt) / STATUS_FADE_OUT, 0, 1);
const fadeIn = q => clamp((now - q.t0) / STATUS_FADE_IN, 0, 1);
// wrap a status to fit under its element, in the context's current (status) font
function layoutCard(g, q, padX) {
  const lines = wrapText(g, q.text, statusWidth(q.elem) - 2 * padX);
  return { lines, w: Math.max(...lines.map(l => g.measureText(l).width)) + 2 * padX };
}
// element e's status as a card hanging from y, centred on x; a replaced one fades out
// beneath the new one
function drawStatuses(g, e, x, y) {
  const fs = statusSize(), lh = fs * 1.25, padX = fs * 0.5, padY = fs * 0.3;
  for (const q of statuses) {
    if (q.elem !== e) continue;
    q.card ??= layoutCard(g, q, padX);
    const { lines, w: cardW } = q.card, cardH = lines.length * lh + 2 * padY;
    // a replacement's card covers the old one at once; only its text fades in
    g.globalAlpha = (q.replacing ? 1 : fadeIn(q)) * fadeOut(q);
    fillRoundRect(g, STATUS_CARD, x - cardW / 2, y, cardW, cardH, 3);
    g.globalAlpha = fadeIn(q) * fadeOut(q);
    g.fillStyle = theme.engrave;
    lines.forEach((l, i) => g.fillText(l, x, y + padY + lh * (i + 0.5)));
    g.globalAlpha = 1;
  }
}
