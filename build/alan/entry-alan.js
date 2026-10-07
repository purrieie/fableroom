// Alan's engine: the product viewer plus the two scene options chosen for the
// Room button — FableRoom's own 160 cm figure (A1) and the real FableRoom
// pieces (C: Natalie rug, Ryan armchair, Solace side table). Their builders
// run, and their images download, only when the shopper taps Room.
import '../src/viewer.js';
import { buildCard } from '../src/context/figure.js';
import { build as buildReal } from '../src/context/real.js';
window.__fr3dContext = Object.assign(window.__fr3dContext || {}, { figure_card: buildCard, real_set: buildReal });
