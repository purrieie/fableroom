import '../src/viewer.js';
import { buildCard, buildClay } from '../src/context/figure.js';
window.__fr3dContext = Object.assign(window.__fr3dContext || {}, { figure_card: buildCard, figure_clay: buildClay });
