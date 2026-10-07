// Procedural furniture, built in metres. Every builder returns a Group whose front faces +Z,
// width runs along X, and whose footprint is centred on the origin with its base at y = 0.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Box-projected UVs in metres, so a texture's repeat = 1 / tile size works on any part.
export function metricUV(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (ay >= ax && ay >= az) { uv[i * 2] = x; uv[i * 2 + 1] = z; }
    else if (ax >= az) { uv[i * 2] = z; uv[i * 2 + 1] = y; }
    else { uv[i * 2] = x; uv[i * 2 + 1] = y; }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

function rbox(w, h, d, r, seg = 4) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  return metricUV(new RoundedBoxGeometry(w, h, d, seg, r));
}

// A stuffed cushion: a subdivided box whose thickness swells toward the middle and pinches at the seams.
export function pillowGeometry(w, h, t, { puff = 1, seam = 0.14, ears = 0.05 } = {}) {
  let g = new THREE.BoxGeometry(w, h, t, 24, 24, 4);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const nx = p.getX(i) / (w / 2), ny = p.getY(i) / (h / 2), nz = p.getZ(i) / (t / 2);
    const f = Math.sqrt(Math.max(0, 1 - nx * nx)) * Math.sqrt(Math.max(0, 1 - ny * ny));
    const th = seam + (1 - seam) * Math.pow(f, 0.6 / puff);
    p.setXYZ(i,
      p.getX(i) * (1 + ears * (1 - ny * ny) * 0.6),
      p.getY(i) * (1 + ears * (1 - nx * nx) * 0.6),
      p.getZ(i) * th);
  }
  g.computeVertexNormals();
  return metricUV(g);
}

function leg(h, r0, r1, mat) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, 20), mat);
  m.position.y = h / 2;
  return m;
}

function M(mats, key, fallback) { return mats[key] || mats.default || fallback; }

/* ---------------------------------------------------------------- sofa */
export function sofa(p, mats) {
  const P = Object.assign({
    width: 2.1, depth: 0.92, seatHeight: 0.44, backHeight: 0.80, armHeight: 0.60, armWidth: 0.17,
    legHeight: 0.10, seats: 3, backCushions: true, pillows: 2, armStyle: 'track', baseHeight: 0.30,
  }, p || {});
  const g = new THREE.Group();
  const fab = M(mats, 'fabric'), legM = M(mats, 'legs'), pil = M(mats, 'pillow', fab), pil2 = M(mats, 'pillow2', pil);
  const W = P.width, D = P.depth, aw = P.armWidth, lh = P.legHeight, bh = P.baseHeight;
  const backT = 0.17;               // back frame thickness
  const inner = W - 2 * aw;
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m;
  };
  // plinth / seat deck
  add(rbox(inner + 0.02, bh - lh, D - backT + 0.02, 0.02), fab, 0, lh + (bh - lh) / 2, (backT - 0.02) / 2);
  // arms
  for (const s of [-1, 1]) add(rbox(aw, P.armHeight - lh, D, P.armStyle === 'round' ? 0.07 : 0.035, 5), fab, s * (W / 2 - aw / 2), lh + (P.armHeight - lh) / 2, 0);
  // back frame
  const bfH = P.backHeight - 0.06 - lh;
  add(rbox(inner + 0.02, bfH, backT, 0.035, 5), fab, 0, lh + bfH / 2, -D / 2 + backT / 2);
  // seat cushions
  const n = Math.max(1, P.seats | 0), gap = 0.008, cw = inner / n - gap, cd = D - backT - 0.01;
  const yc = bh + 0.02, T = 2 * (P.seatHeight + 0.01 - yc);   // centre of the cushion sits 2 cm above the deck
  for (let i = 0; i < n; i++) {
    const x = -inner / 2 + (i + 0.5) * (inner / n);
    const geo = pillowGeometry(cw, cd, T, { seam: 0.75, puff: 1.6, ears: 0.0 });
    add(geo, fab, x, yc, -D / 2 + backT + cd / 2 + 0.005, -Math.PI / 2);
  }
  // back cushions, leaning back ~10 degrees
  if (P.backCushions) {
    const bch = P.backHeight - P.seatHeight + 0.03, bct = 0.17;
    for (let i = 0; i < n; i++) {
      const x = -inner / 2 + (i + 0.5) * (inner / n);
      const geo = pillowGeometry(cw, bch, bct, { seam: 0.45, puff: 1.4, ears: 0.02 });
      const m = add(geo, fab, x, P.seatHeight - 0.01 + bch / 2, -D / 2 + backT + bct / 2 - 0.02, -0.17);
      m.position.z -= 0.0;
    }
  }
  // throw pillows at the ends
  const pw = 0.46;
  for (let i = 0; i < (P.pillows | 0); i++) {
    const s = i % 2 ? 1 : -1;
    const geo = pillowGeometry(pw, pw, 0.15, { seam: 0.12, puff: 1, ears: 0.06 });
    const m = add(geo, i % 2 ? pil2 : pil, s * (inner / 2 - pw / 2 - 0.04), P.seatHeight + pw / 2 - 0.05, -D / 2 + backT + 0.2, -0.32, -s * 0.28, s * 0.06);
  }
  // legs
  if (lh > 0.005) {
    const ix = W / 2 - 0.07, iz = D / 2 - 0.07;
    for (const [x, z] of [[-ix, -iz], [ix, -iz], [-ix, iz], [ix, iz]]) { const l = leg(lh, 0.012, 0.018, legM); l.position.x = x; l.position.z = z; g.add(l); }
  }
  return g;
}

/* ---------------------------------------------------------------- bed */
export function bed(p, mats) {
  const P = Object.assign({
    width: 1.6, length: 2.05, baseHeight: 0.32, legHeight: 0.08, mattress: 0.22, headboard: 1.05,
    headboardThickness: 0.09, style: 'upholstered', duvetCover: 0.72, pillows: 2, throwPillows: 2, throwBlanket: true,
  }, p || {});
  const g = new THREE.Group();
  const frame = M(mats, 'frame'), legM = M(mats, 'legs', frame), mat = M(mats, 'mattress'), duv = M(mats, 'duvet'),
    pil = M(mats, 'pillow', duv), thr = M(mats, 'throw', duv), tp = M(mats, 'throwPillow', thr);
  const W = P.width, L = P.length, ht = P.headboardThickness;
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
  const zHead = -L / 2 + ht;          // inner face of the headboard
  const fw = W + 0.08, fl = L - ht + 0.04;
  // base
  const bh = P.baseHeight - P.legHeight;
  add(rbox(fw, bh, fl, P.style === 'upholstered' ? 0.03 : 0.012), frame, 0, P.legHeight + bh / 2, zHead + fl / 2 - 0.02);
  // headboard
  add(rbox(fw + 0.02, P.headboard - P.legHeight, ht, P.style === 'upholstered' ? 0.04 : 0.01, 5), frame, 0, P.legHeight + (P.headboard - P.legHeight) / 2, -L / 2 + ht / 2);
  // legs
  if (P.legHeight > 0.005) for (const [x, z] of [[-fw / 2 + 0.06, -L / 2 + 0.06], [fw / 2 - 0.06, -L / 2 + 0.06], [-fw / 2 + 0.06, L / 2 - 0.08], [fw / 2 - 0.06, L / 2 - 0.08]]) {
    const l = leg(P.legHeight, 0.02, 0.024, legM); l.position.x = x; l.position.z = z; g.add(l);
  }
  // mattress
  const mt = P.baseHeight + P.mattress, mL = L - ht - 0.03;
  add(rbox(W, P.mattress, mL, 0.05, 5), mat, 0, P.baseHeight + P.mattress / 2, zHead + 0.015 + mL / 2);
  // duvet: a draped sheet — flat on top, rolling over the sides and foot
  const cover = mL * P.duvetCover, drop = P.mattress + P.baseHeight - P.legHeight - 0.12, th = 0.035;
  const duvetGeo = drapeGeometry(W, cover, drop, th);
  add(duvetGeo, duv, 0, mt + 0.005, zHead + mL - cover + 0.03);
  // folded-back band at the duvet's head end
  add(pillowGeometry(W + 0.04, 0.32, 0.07, { seam: 0.5, puff: 1.5, ears: 0 }), duv, 0, mt + 0.045, zHead + mL - cover + 0.17, -Math.PI / 2);
  // sleeping pillows against the headboard
  const pw = Math.min(0.7, (W - 0.12) / Math.max(1, P.pillows));
  for (let i = 0; i < P.pillows; i++) {
    const x = -W / 2 + 0.06 + pw * (i + 0.5) + (W - 0.12 - pw * P.pillows) / 2;
    add(pillowGeometry(pw - 0.04, 0.48, 0.17, { seam: 0.15 }), pil, x, mt + 0.17, zHead + 0.13, -1.05);
  }
  // throw pillows in front of them
  for (let i = 0; i < P.throwPillows; i++) {
    const s = P.throwPillows === 1 ? 0 : (i ? 1 : -1);
    add(pillowGeometry(0.45, 0.45, 0.14, { seam: 0.12, ears: 0.06 }), tp, s * 0.26, mt + 0.2, zHead + 0.33, -0.95, 0, s * 0.05);
  }
  // throw blanket across the foot
  if (P.throwBlanket) add(drapeGeometry(W + 0.02, 0.5, drop * 0.85, 0.02), thr, 0, mt + 0.045, zHead + mL - 0.62, 0, 0, 0);
  return g;
}

// A sheet lying on a (w x l) top that rolls over three sides (left, right, +Z foot) and hangs `drop` down.
export function drapeGeometry(w, l, drop, th) {
  const r = 0.06;                                   // roll radius over the mattress edge
  const segU = 64, segV = 48;
  // cross-section along x: hanging side -> roll -> top -> roll -> hanging side
  const half = w / 2, arc = Math.PI / 2 * r;
  const lenX = 2 * (drop + arc) + (w - 2 * r);
  const lenZ = (drop + arc) + (l - r);
  function prof(s, halfW, isZ) {
    // s in [0, total]; returns [horizontal offset, y]
    const top = isZ ? (l - r) : (w - 2 * r);
    if (!isZ) {
      if (s < drop) return [-halfW - 0.012, -drop + s];
      s -= drop;
      if (s < arc) { const a = s / r; return [-halfW + r - r * Math.cos(a) - 0.012 * (1 - a / (Math.PI / 2)), -r + r * Math.sin(a) ]; }
      s -= arc;
      if (s < top) return [-halfW + r + s, 0];
      s -= top;
      if (s < arc) { const a = s / r; return [halfW - r + r * Math.sin(a) , -r + r * Math.cos(a)]; }
      s -= arc;
      return [halfW + 0.012, -r - s];
    } else {
      if (s < top) return [s, 0];
      s -= top;
      if (s < arc) { const a = s / r; return [top + r * Math.sin(a), -r + r * Math.cos(a)]; }
      s -= arc;
      return [top + r + 0.012, -r - s];
    }
  }
  const pos = [], idx = [];
  for (let j = 0; j <= segV; j++) {
    const sz = j / segV * lenZ;
    const [zz, yz] = prof(sz, 0, true);
    for (let i = 0; i <= segU; i++) {
      const sx = i / segU * lenX;
      const [xx, yx] = prof(sx, half, false);
      // combine: corners take the lower of the two drops so the foot corners fold down
      const y = Math.min(yx, yz) + 0.006 * Math.sin(i * 0.9) * Math.sin(j * 0.7);
      const x = xx * (yz < -r ? 1 + 0.02 : 1);
      pos.push(x, y + r, zz);
    }
  }
  for (let j = 0; j < segV; j++) for (let i = 0; i < segU; i++) {
    const a = j * (segU + 1) + i, b = a + 1, c = a + segU + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.translate(0, -r, 0);
  metricUV(geo);
  geo.userData.doubleSided = true;
  return geo;
}

/* ---------------------------------------------------------------- simple parts */
export function box(p, mats) {
  const P = Object.assign({ width: 0.5, depth: 0.5, height: 0.5, radius: 0.01 }, p || {});
  const m = new THREE.Mesh(rbox(P.width, P.height, P.depth, P.radius), M(mats, 'default'));
  m.position.y = P.height / 2;
  const g = new THREE.Group(); g.add(m); return g;
}
export function pillow(p, mats) {
  const P = Object.assign({ width: 0.45, height: 0.45, thickness: 0.15 }, p || {});
  const m = new THREE.Mesh(pillowGeometry(P.width, P.height, P.thickness), M(mats, 'default'));
  const g = new THREE.Group(); g.add(m); return g;
}
// Round side/plant pedestal or planter: a tapered cylinder, optionally with soil top.
export function planter(p, mats) {
  const P = Object.assign({ radiusTop: 0.2, radiusBottom: 0.16, height: 0.42 }, p || {});
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(P.radiusTop, P.radiusBottom, P.height, 48, 1, true), M(mats, 'default'));
  m.position.y = P.height / 2; g.add(m);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(P.radiusBottom, 48), M(mats, 'default'));
  bottom.rotation.x = -Math.PI / 2; bottom.position.y = 0.002; g.add(bottom);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(P.radiusTop - 0.006, 0.008, 12, 64), M(mats, 'default'));
  rim.rotation.x = Math.PI / 2; rim.position.y = P.height; g.add(rim);
  const soil = new THREE.Mesh(new THREE.CircleGeometry(P.radiusTop - 0.01, 48), M(mats, 'soil', M(mats, 'default')));
  soil.rotation.x = -Math.PI / 2; soil.position.y = P.height - 0.04; g.add(soil);
  return g;
}

export const BUILDERS = { sofa, bed, box, pillow, planter };
