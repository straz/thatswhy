'use strict';
// The walnut box around the machine, seen slightly from above and in front: a sliding
// light-wood lid on top with the element tags and LEDs on it, and on the front face an
// OUTCOMES meter and the brass slot notes leave by.

// ---------- state ----------
// pre-rendered top surface (full canvas, interior cut out), page with front face (full canvas)
// and lid (lid-sized)
let boxLayer, baseLayer, lidLayer;
// the lid's sideways offset (0 = closed, lidOpenOffset() = open) and any drag in progress
const lidState = { offset: 0, open: false, drag: null };
// meter needle position on its 0–1 scale, and where it wanders to when idle
const meter = { value: 0, idle: 0.4, nextIdle: 0 };

const LID_SNAP = 0.15;   // a drag past this fraction of the lid's travel opens (or closes) it
const METER_INK = '#2b2520', METER_RED = '#c8321e';
const LED_OFF = '#4a1f17', LED_ON = '#ff5a36', LED_GLOW = '#ff3b1f';

// open, the lid rests off to the left with a strip of it, finger pull included, still in the box
const lidOpenOffset = () => box.x + box.lidPeek - (box.lid.x + box.lid.w);

// ---------- static rendering ----------
// long wandering grain lines over a soft gradient from hi to lo
function woodGrain(g, x, y, w, h, rnd, lo, hi, grain) {
  const gr = g.createLinearGradient(x, y, x + w * 0.3, y + h);
  gr.addColorStop(0, hi); gr.addColorStop(1, lo);
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  g.lineCap = 'round';
  for (let yy = y - 12; yy < y + h + 12; yy += 1.2 + rnd() * 3.4) {
    const a1 = 0.6 + rnd() * 2.5, f1 = 0.004 + rnd() * 0.01, p1 = rnd() * TAU;
    g.strokeStyle = `rgba(${grain},${0.03 + rnd() * 0.09})`; g.lineWidth = 0.4 + rnd() * 1.1;
    g.beginPath();
    for (let xx = x; xx <= x + w + 10; xx += 10) {
      const yv = yy + a1 * Math.sin(xx * f1 + p1) + 4 * Math.sin(xx * 0.0023 + yy * 0.015);
      if (xx === x) g.moveTo(xx, yv); else g.lineTo(xx, yv);
    }
    g.stroke();
  }
}
function renderBox() {
  const grainRng = mulberry32(seed + 7);   // same grain on every rebuild
  renderTop(grainRng);
  renderFront(grainRng);
  renderLid(grainRng);
}
// the top surface: walnut walls around the machine (drawn on the tilted canvas)
function renderTop(rnd) {
  const { x, y, w, inner: I, front } = box, h = front.y - y;
  boxLayer = makeLayer();
  const g = boxLayer.getContext('2d');
  setScreen(g);
  // square front corners: the tilted canvas is clipped at the front edge
  g.save(); roundRect(g, x, y, w, h + 8, 8); g.clip();
  woodGrain(g, x, y, w, h, rnd, theme.walnut, theme.walnutHi, theme.walnutGrain);
  // the front edge catches the light
  g.fillStyle = 'rgba(255,232,205,0.22)'; g.fillRect(x, front.y - 1.5, w, 1.5);
  g.restore();
  g.lineWidth = 1; g.strokeStyle = theme.woodDk; roundRect(g, x + 0.5, y + 0.5, w - 1, h + 8, 8); g.stroke();
  // cut out the interior
  g.globalCompositeOperation = 'destination-out';
  roundRect(g, I.x, I.y, I.w, I.h, 3); g.fill();
  g.globalCompositeOperation = 'source-over';
  // the walls cast a soft shadow onto the machine
  g.save(); roundRect(g, I.x, I.y, I.w, I.h, 3); g.clip();
  g.shadowColor = 'rgba(40,25,10,0.45)'; g.shadowBlur = 14; g.shadowOffsetY = 3;
  g.strokeStyle = '#000'; g.lineWidth = 20; roundRect(g, I.x - 10, I.y - 10, I.w + 20, I.h + 20, 6); g.stroke();
  g.restore();
  g.lineWidth = 1; g.strokeStyle = theme.woodDk; roundRect(g, I.x - 0.5, I.y - 0.5, I.w + 1, I.h + 1, 3); g.stroke();
}
// the page behind the box, the box's shadow on it, and the front face (drawn flat)
function renderFront(rnd) {
  const { x, y, w, h, front } = box, bottom = y + h;
  baseLayer = makeLayer();
  const g = baseLayer.getContext('2d');
  setScreen(g);
  drawBackground(g);
  drawBoxShadow(g);
  // front face, in shade, with a crease where it meets the top surface
  g.save();
  roundRect(g, x, y, w, h, 8); g.clip();
  g.beginPath(); g.rect(x, front.y, w, front.h); g.clip();
  woodGrain(g, x, front.y, w, front.h, rnd, theme.walnut, theme.walnutHi, theme.walnutGrain);
  g.fillStyle = verticalGradient(g, front.y, bottom, 'rgba(0,0,0,0.16)', 'rgba(0,0,0,0.34)');
  g.fillRect(x, front.y, w, front.h);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, front.y, w, 1);
  g.lineWidth = 1; g.strokeStyle = theme.woodDk; roundRect(g, x + 0.5, y + 0.5, w - 1, h - 1, 8); g.stroke();
  g.restore();
}
// soft shadow of the whole box (tilted top and front face) on the page; the shape itself is
// drawn far off to the left so only its shadow lands on the canvas
function drawBoxShadow(g) {
  const { x, y, w, h } = box, far = 10000, [tl, tr] = [project(x, y), project(x + w, y)];
  g.save();
  g.shadowColor = theme.boxShadow; g.shadowBlur = 24; g.shadowOffsetX = far * dpr; g.shadowOffsetY = 8;
  g.fillStyle = '#000';
  g.beginPath();
  g.moveTo(tl[0] - far, tl[1]); g.lineTo(tr[0] - far, tr[1]);
  g.lineTo(x + w - far, y + h); g.lineTo(x - far, y + h);
  g.closePath(); g.fill();
  g.restore();
}
function renderLid(rnd) {
  const { w, h } = box.lid;
  lidLayer = document.createElement('canvas');
  lidLayer.width = Math.round(w * dpr); lidLayer.height = Math.round(h * dpr);
  const g = lidLayer.getContext('2d');
  setScreen(g);
  g.save(); roundRect(g, 0, 0, w, h, 5); g.clip();
  woodGrain(g, 0, 0, w, h, rnd, theme.wood, theme.woodHi, theme.grain);
  drawFingerPull(g, w, h);
  g.restore();
  // bevelled edge
  g.lineWidth = 1;
  g.strokeStyle = 'rgba(255,248,230,0.4)'; roundRect(g, 1.5, 1.5, w - 3, h - 3, 4); g.stroke();
  g.strokeStyle = theme.woodDk; roundRect(g, 0.5, 0.5, w - 1, h - 1, 5); g.stroke();
}
// a shallow scoop near the lid's right edge, shaded as a recess lit from the left
function drawFingerPull(g, lidW, lidH) {
  const fw = box.pullW, fh = clamp(lidH * 0.2, 44, 120), fx = lidW - fw - 8, fy = (lidH - fh) / 2;
  const gr = g.createLinearGradient(fx, 0, fx + fw, 0);
  gr.addColorStop(0, 'rgba(70,42,15,0.4)'); gr.addColorStop(0.55, 'rgba(70,42,15,0.1)'); gr.addColorStop(1, 'rgba(255,245,220,0.35)');
  fillRoundRect(g, gr, fx, fy, fw, fh, fw / 2);
  g.strokeStyle = 'rgba(70,42,15,0.2)'; g.lineWidth = 0.8; g.stroke();
}

// ---------- each frame ----------
// on the tilted canvas
function drawTop(g) {
  blit(g, boxLayer);
  setScreen(g);
  drawLid(g);
}
// on the flat canvas behind it
function drawFront(g) {
  blit(g, baseLayer);
  setScreen(g);
  drawSlot(g);
  drawMeter(g);
}
// brass plate with a drop shadow, as used by the slot and the meter bezel
function drawBrassPlate(g, x, y, w, h, rad) {
  fillRoundRect(g, theme.shadow, x + 1, y + 2, w, h, rad);
  fillRoundRect(g, verticalGradient(g, y, y + h, theme.brassHi, theme.brassLo), x, y, w, h, rad);
}
function drawSlot(g) {
  const sl = box.slot, pw = sl.w + SLOT_PLATE_PAD, ph = 22, fed = notes.some(inSlot);
  drawBrassPlate(g, sl.x - pw / 2, sl.y - ph / 2, pw, ph, 7);
  // screws
  for (const dx of [-pw / 2 + 7, pw / 2 - 7]) fillCircle(g, 'rgba(0,0,0,0.25)', sl.x + dx, sl.y, 1.6);
  fillRoundRect(g, fed ? '#000' : '#2a2116', sl.x - sl.w / 2, sl.y - 2.5, sl.w, 5, 2.5);
}

// vintage VU-style meter: a cream dial behind glass in a brass bezel
function drawMeter(g) {
  const { x, y, w, h } = box.meter, fx = x + 3, fy = y + 3, fw = w - 6, fh = h - 6;
  drawBrassPlate(g, x, y, w, h, 5);
  fillRoundRect(g, verticalGradient(g, fy, fy + fh, '#f8eac4', '#e9d39c'), fx, fy, fw, fh, 3);
  g.save(); roundRect(g, fx, fy, fw, fh, 3); g.clip();
  // the needle pivots below the face; the scale spans a0..a1, red from ar
  const a0 = -Math.PI / 2 - 0.75, a1 = -Math.PI / 2 + 0.75;
  const dial = { px: fx + fw / 2, py: fy + fh * 1.15, R: fh * 0.95, a0, a1, ar: lerp(a0, a1, 0.7) };
  drawMeterScale(g, dial, fh);
  g.fillStyle = METER_INK; g.font = `600 ${Math.round(Math.min(fh * 0.2, fw / 6.5))}px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('OUTCOMES', dial.px, fy + fh * 0.74);
  drawNeedle(g, dial, lerp(a0, a1, meter.value));
  // glass sheen
  const gr = g.createLinearGradient(0, fy, 0, fy + fh);
  gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(0.45, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(fx, fy, fw, fh);
  g.restore();
}
function drawMeterScale(g, { px, py, R, a0, a1, ar }, fh) {
  g.lineCap = 'butt';
  g.strokeStyle = METER_INK; g.lineWidth = 0.8; g.beginPath(); g.arc(px, py, R * 0.8, a0, ar); g.stroke();
  g.strokeStyle = METER_RED; g.lineWidth = fh * 0.08; g.beginPath(); g.arc(px, py, R * 0.82, ar, a1); g.stroke();
  for (let i = 0; i <= 10; i++) {
    const a = lerp(a0, a1, i / 10), r0 = R * 0.8, r1 = R * (i % 2 ? 0.86 : 0.9);
    g.strokeStyle = a > ar + 0.01 ? METER_RED : METER_INK; g.lineWidth = i % 2 ? 0.6 : 1;
    g.beginPath(); g.moveTo(px + Math.cos(a) * r0, py + Math.sin(a) * r0); g.lineTo(px + Math.cos(a) * r1, py + Math.sin(a) * r1); g.stroke();
  }
}
function drawNeedle(g, { px, py, R }, a) {
  g.strokeStyle = '#1d1a17'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * R * 0.95, py + Math.sin(a) * R * 0.95); g.stroke();
}

// the lid, with each element's tag and LED where the element sits beneath it
function drawLid(g) {
  const B = box.lid, x0 = B.x + lidState.offset, fs = tagSize(), ledR = Math.max(2.2, fs * 0.3);
  fillRoundRect(g, theme.shadow, x0 + 1.5, B.y + 3, B.w, B.h, 5);
  g.drawImage(lidLayer, x0, B.y, B.w, B.h);
  g.save(); roundRect(g, x0, B.y, B.w, B.h, 5); g.clip();
  g.font = tagFont(); g.textBaseline = 'middle'; g.textAlign = 'center';
  forEachTag((e, ex, y, k) => {
    const x = ex + lidState.offset;
    drawLidLabel(g, e.tag, x, y, fs, k);
    drawLed(g, x, y - fs * 1.3, ledR, k);
  });
  g.restore();
}
// engraved label, with light from the element below showing through the wood; glows while lit
function drawLidLabel(g, tag, x, y, fs, k) {
  const gl = g.createRadialGradient(x, y - fs * 0.5, 0, x, y - fs * 0.5, fs * 3.2);
  gl.addColorStop(0, `rgba(255,226,170,${0.12 + 0.4 * k})`); gl.addColorStop(1, 'rgba(255,226,170,0)');
  g.fillStyle = gl; g.fillRect(x - fs * 3.2, y - fs * 3.7, fs * 6.4, fs * 6.4);
  g.fillStyle = 'rgba(255,250,236,0.5)'; g.fillText(tag, x, y + 0.8);
  g.fillStyle = theme.lidInk; g.fillText(tag, x, y);
  if (k > 0) {
    g.save(); g.shadowColor = `rgba(255,150,60,${k})`; g.shadowBlur = 8;
    g.fillStyle = `rgba(196,64,20,${k})`; g.fillText(tag, x, y); g.restore();
  }
}
// LED lamp in a small metal bezel, lit to brightness k
function drawLed(g, x, y, rad, k) {
  fillCircle(g, verticalGradient(g, y - rad - 1, y + rad + 1, theme.ringHi, theme.ringLo, x), x, y, rad + 1.1);
  fillCircle(g, LED_OFF, x, y, rad);
  if (k > 0) {
    g.save(); g.globalAlpha = k; g.shadowColor = LED_GLOW; g.shadowBlur = 10;
    fillCircle(g, LED_ON, x, y, rad); g.restore();
  }
  fillCircle(g, 'rgba(255,255,255,0.55)', x - rad * 0.35, y - rad * 0.35, rad * 0.3);
}

// ---------- motion ----------
// idle, the needle wanders through the middle of the scale (1–3 of 5) to show the machine is
// running; while a note passes through the slot it swings into the red
function stepMeter(dt) {
  const hot = notes.some(inSlot);
  if (now >= meter.nextIdle) {
    meter.idle = 0.2 + 0.4 * Math.random();
    meter.nextIdle = now + 0.3 + Math.random() * 1.2;
  }
  const target = hot
    ? 0.86 + 0.06 * Math.sin(now * 13) + 0.04 * Math.sin(now * 31)
    : meter.idle + 0.015 * Math.sin(now * 23);
  meter.value += (target - meter.value) * Math.min(1, dt * (hot ? 8 : 3));
}
// ease the lid toward open or closed unless it is being dragged
function stepLid(dt) {
  if (lidState.drag) return;
  const target = lidState.open ? lidOpenOffset() : 0;
  lidState.offset += (target - lidState.offset) * Math.min(1, dt * 8);
}
// rebuilds keep the lid open or closed, snapped to its new position
function resetLid() {
  lidState.drag = null;
  lidState.offset = lidState.open ? lidOpenOffset() : 0;
}

// ---------- input: drag the lid left to open, back right to close; a click toggles it ----------
function overLid(x, y) {
  const B = box.lid, left = B.x + lidState.offset;
  return x >= left && x <= left + B.w && y >= B.y && y <= B.y + B.h;
}
// pointer position on the (tilted) top surface
const pointerOnTop = ev => unproject(ev.clientX, ev.clientY);
function onLidPointerDown(ev) {
  const [x, y] = pointerOnTop(ev);
  if (!overLid(x, y)) return;
  lidState.drag = { x0: x, offset0: lidState.offset, open0: lidState.open, moved: false };
  canvas.setPointerCapture(ev.pointerId);
  canvas.style.cursor = 'grabbing';
}
function onLidPointerMove(ev) {
  const drag = lidState.drag;
  const [x, y] = pointerOnTop(ev);
  if (!drag) { canvas.style.cursor = overLid(x, y) ? 'grab' : ''; return; }
  const dx = x - drag.x0;
  if (Math.abs(dx) > 4) drag.moved = true;
  lidState.offset = clamp(drag.offset0 + dx, lidOpenOffset(), 0);
}
function onLidPointerUp() {
  const drag = lidState.drag;
  if (!drag) return;
  if (drag.moved) {
    // open if it ended more than LID_SNAP of the way from closed (or less than that from open)
    const threshold = drag.open0 ? 1 - LID_SNAP : LID_SNAP;
    lidState.open = lidState.offset < threshold * lidOpenOffset();
  } else {
    lidState.open = !lidState.open;
  }
  lidState.drag = null;
  canvas.style.cursor = 'grab';
}
function bindLidInput() {
  canvas.addEventListener('pointerdown', onLidPointerDown);
  canvas.addEventListener('pointermove', onLidPointerMove);
  canvas.addEventListener('pointerup', onLidPointerUp);
  canvas.addEventListener('pointercancel', onLidPointerUp);
}
