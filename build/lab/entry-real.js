import '../src/viewer.js';
import { build } from '../src/context/real.js';
window.__fr3dContext = Object.assign(window.__fr3dContext || {}, { real_set: build });
