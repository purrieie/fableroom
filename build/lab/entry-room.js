import '../src/viewer.js';
import { build } from '../src/context/room.js';
window.__fr3dContext = Object.assign(window.__fr3dContext || {}, { room_clay: build });
