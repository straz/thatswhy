'use strict';
// Element tags: the three-letter names shown as pills on the machine (render.js) and engraved
// on the lid with an LED and a status card (box.js, statuses.js).

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
