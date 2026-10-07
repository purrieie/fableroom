// Scene-lab bundle: the production engine plus every scene-context option.
// In production only the chosen option would ship, as its own small chunk
// loaded on the shopper's first tap of "Room".
import '../src/viewer.js';
import { buildCard, buildClay } from '../src/context/figure.js';
import { build as buildRoom } from '../src/context/room.js';
import { build as buildReal } from '../src/context/real.js';
window.__fr3dContext = Object.assign(window.__fr3dContext || {}, {
  figure_card: buildCard, figure_clay: buildClay, room_clay: buildRoom, real_set: buildReal
});
