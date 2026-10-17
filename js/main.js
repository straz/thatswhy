'use strict';
// Entry point: build the machine, run the animation loop, and rebuild on resize or a
// light/dark switch.

let last = performance.now();

function step(dt) {
  for (const q of sources) q.update();
  for (const e of elements) e.update(dt);
  for (const k of sinks) k.update();
  stepMarbles(dt);
  stepParticles(dt);
  stepNotes();
  stepMeter(dt);
  stepLid(dt);
}
function frame(ts) {
  const dt = clamp((ts - last) / 1000, 0, 0.05);
  last = ts; now += dt;
  step(dt);
  draw();
  requestAnimationFrame(frame);
}

let resizeTimer = 0;
function rebuildSoon() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(build, 150);
}

addEventListener('resize', rebuildSoon);
darkQuery.addEventListener('change', build);
bindLidInput();
build();
requestAnimationFrame(frame);
