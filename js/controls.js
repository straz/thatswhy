'use strict';
// Front-panel controls: a reset button, and three mode buttons of which exactly one is lit.
// (Called "scenario" in code, since `mode` already means the machine's orientation.)

// the mode marked pressed in index.html is the one selected at startup
let scenario = controls.querySelector('.mode[aria-pressed="true"]').dataset.scenario;

// a new machine, as if the page had been reloaded: new layout (unless ?seed= pins it), lid closed
function resetMachine() {
  seed = pinnedSeed || newSeed();
  lidState.open = false;
  build();
}
// switching modes starts a fresh machine; pressing the mode that's already lit does nothing
function selectScenario(name) {
  if (name === scenario) return;
  scenario = name;
  resetMachine();
  for (const b of controls.querySelectorAll('.mode')) b.setAttribute('aria-pressed', String(b.dataset.scenario === name));
}
function onControlClick(ev) {
  const button = ev.target.closest('button');
  if (!button) return;
  if (button.classList.contains('reset')) resetMachine();
  else selectScenario(button.dataset.scenario);
}
function bindControls() {
  controls.addEventListener('click', onControlClick);
}
