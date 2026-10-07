/* Option C: real FableRoom pieces at true scale around the Alan coffee table.
   Everything is modelled in real metres inside `M` (scaled by U(1)); the
   engine's contact shadows live in the outer group in engine units.

   Pieces (all true size, metres):
     Natalie Handloom Banana Silk Rug - Grey   1.20 x 1.80, ~7 mm pile edge
     Ryan Acacia Wood Armchair  (FRAC00001A)   W 0.615 x D 0.65 x H 0.74
     Solace Travertine Side Table (FRET00083A) dia 0.45 x H 0.48
   The chair and side table are primitive stand-ins; drop real-ryan.glb /
   real-solace.glb into assets/ (metres, +Y up, front facing +Z, origin at the
   centre of the footprint on the floor) and they replace them automatically.

   Layout (metres, table centre at the origin): rug centred, long side on X;
   Ryan at (-0.964, -0.441) facing 30 deg off the rug axis toward the table,
   front edge 0.337 m from the table edge, front posts on the rug, back posts
   off it; Solace at (-1.082, 0.164) on the sitter's right. Content reaches
   1.44 m from the table centre at any azimuth. */
import {
  Group, Mesh, BoxGeometry, PlaneGeometry, CylinderGeometry, LatheGeometry, BufferGeometry,
  Float32BufferAttribute, MeshStandardMaterial, MeshBasicMaterial, CanvasTexture,
  TextureLoader, SRGBColorSpace, RepeatWrapping, DoubleSide, Vector2, Box3, Vector3
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const PI = Math.PI;
// Look tuning, measured at desktop home: rug lit ~rgb(201,203,194) like the
// photo; Solace top ~luma 155, under the mango top (~161) and far less saturated.
const LIFT = [0.91, 0.99, 0.99], EDGE = 0x9a9b93, STONE = 0xcac7c4, STONE_BASE = '#b4a698';
const rng = (s) => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
const std = (o) => new MeshStandardMaterial(Object.assign({ metalness: 0 }, o));
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const ctex = (c) => { const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t; };
function put(parent, geo, mat, x, y, z, ro) {
  const m = new Mesh(geo, mat); m.position.set(x, y, z); if (ro) m.renderOrder = ro; parent.add(m); return m;
}
function geom(pos, uv, idx, col) {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  if (uv) g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  if (col) g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
// grid index for (nu+1) x (nv+1) vertices, row-major in u
function grid(nu, nv, flip) {
  const idx = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    flip ? idx.push(a, b, c, b, d, c) : idx.push(a, c, b, b, c, d);
  }
  return idx;
}
// Catmull-Rom through [z, y] points, t in 0..1
function cr(p, t) {
  const n = p.length - 1, f = Math.min(t * n, n - 1e-6), i = f | 0, s = f - i;
  const a = p[Math.max(i - 1, 0)], b = p[i], c = p[i + 1], d = p[Math.min(i + 2, n)];
  return [0, 1].map((k) => 0.5 * (2 * b[k] + (c[k] - a[k]) * s + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * s * s + (3 * b[k] - a[k] - 3 * c[k] + d[k]) * s * s * s));
}

/* ------------------------------- the rug ---------------------------------- */
// 1.80 m along X, 1.20 m along Z. Top at 1 mm, a 7 mm bound edge that shows on
// the near side, edge darkening baked into vertex colours, and a soft halo
// OUTSIDE the rug so it sits on the stage rather than floating as a decal.
// All three layers are transparent so they sort by renderOrder inside one pass
// (halo -3.6 < edge -3.3 < rug -3); the halo's interior is also cut out, so it
// can never veil the rug whatever order the engine draws them in.
async function rug(M, ctx) {
  const L = 1.8, Wd = 1.2, e = 0.014, y = 0.001;
  const xs = [-L / 2, -L / 2 + e, L / 2 - e, L / 2], zs = [-Wd / 2, -Wd / 2 + e, Wd / 2 - e, Wd / 2];
  const pos = [], uv = [], col = [];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    pos.push(xs[i], y, zs[j]); uv.push(xs[i] / L + 0.5, 0.5 - zs[j] / Wd);
    const k = (i % 3 && j % 3) ? 1 : 0.8; col.push(k, k, k);
  }
  let map = null;
  try {
    map = await new TextureLoader().loadAsync(ctx.assetBase + 'real-rug.webp');
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = Math.min(8, ctx.viewer.renderer.capabilities.getMaxAnisotropy());
  } catch (err) { /* flat grey fallback */ }
  const flat = { transparent: true, depthWrite: false };
  const mat = std(Object.assign({ map, color: 0xc9cbc3, roughness: 1, vertexColors: true }, flat));
  if (map) mat.color.setRGB(LIFT[0], LIFT[1], LIFT[2]);   // photo -> lit silvery grey ~rgb(200,203,195)
  put(M, geom(pos, uv, grid(3, 3), col), mat, 0, 0, 0, -3);
  // bound edge: a 7 mm vertical band hanging below the top, lit like the rug
  // so it follows the time-of-day moods; from above the rug covers it
  const h = 0.007, ring = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]], ep = [];
  for (const [sx, sz] of ring) ep.push(sx * L / 2, y, sz * Wd / 2, sx * L / 2, y - h, sz * Wd / 2);
  const eidx = []; for (let i = 0; i < 4; i++) { const a = i * 2; eidx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  put(M, geom(ep, null, eidx), std(Object.assign({ color: EDGE, roughness: 1, side: DoubleSide }, flat)), 0, 0, 0, -3.3);
  // halo: a 9 cm soft fringe around the rug only (interior cleared)
  const S = 0.09, [c, g] = canvas(256, 176);
  const sx = 256 / (L + 2 * S), sz = 176 / (Wd + 2 * S), r = [S * sx, S * sz, L * sx, Wd * sz];
  g.shadowColor = 'rgba(60,48,36,0.42)'; g.shadowBlur = 8; g.fillStyle = '#3c3024';
  g.fillRect(...r); g.shadowColor = 'transparent'; g.clearRect(...r);
  put(M, new PlaneGeometry(L + 2 * S, Wd + 2 * S), new MeshBasicMaterial(Object.assign({ map: ctex(c) }, flat)), 0, 0.0002, 0, -3.6).rotation.x = -PI / 2;
}

/* ------------------------------ Ryan armchair ----------------------------- */
// FRAC00001A: W 61.5 x D 65 x H 74 cm. Round acacia posts (4.2 cm), front posts
// 60 cm, back posts 74 cm; flat bowed armrests at 57 cm; flat side rails at
// ~39 cm wrapped in leather sleeves; a leather sling hung from a top rail
// behind the cushion, sagging across the side rails (seat low point ~34 cm);
// a loose cognac cushion over the top rail; a low front stretcher.
function ryan() {
  const g = new Group();
  const wood = std({ color: 0x6b4934, roughness: 0.62 });
  const hide = std({ color: 0x7d5a40, roughness: 0.5, side: DoubleSide });
  const W = 0.615, D = 0.65, H = 0.74, r = 0.021, px = W / 2 - r, pz = D / 2 - r;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const h = sz > 0 ? 0.6 : H;
    put(g, new CylinderGeometry(r, r, h, 18), wood, sx * px, h / 2, sz * pz);
    // armrest: 5.6 x 2.4 cm board, bowed 1.2 cm, between the posts
    if (sz > 0) {
      const a = new BoxGeometry(0.056, 0.024, 2 * pz + 0.02, 1, 1, 12), p = a.attributes.position;
      for (let i = 0; i < p.count; i++) { const t = p.getZ(i) / (pz + 0.01); p.setY(i, p.getY(i) - 0.012 * (1 - t * t)); }
      a.computeVertexNormals();
      put(g, a, wood, sx * (W / 2 - 0.028), 0.565, 0);   // flush with the post's outer face: 61.5 cm overall
      put(g, new BoxGeometry(0.024, 0.07, 2 * pz), wood, sx * px, 0.385, 0);                         // side rail
      put(g, new RoundedBoxGeometry(0.04, 0.056, 0.5, 2, 0.014), hide, sx * (px - 0.002), 0.405, 0); // leather sleeve
    }
  }
  put(g, new BoxGeometry(2 * px, 0.05, 0.022), wood, 0, 0.29, pz);       // front stretcher
  put(g, new BoxGeometry(2 * px, 0.06, 0.024), wood, 0, 0.43, -pz);      // back rail
  put(g, new CylinderGeometry(0.014, 0.014, 2 * px, 10), wood, 0, 0.69, -pz).rotation.z = PI / 2; // top rail
  // sling: centre and edge profiles [z, y], blended across the width by (1-u^2)
  const C = [[-pz, 0.70], [-0.27, 0.56], [-0.2, 0.40], [-0.07, 0.335], [0.1, 0.345], [0.24, 0.375]];
  const E = [[-pz, 0.70], [-0.285, 0.57], [-0.24, 0.425], [-0.07, 0.415], [0.1, 0.415], [0.225, 0.415]];
  const nu = 14, nv = 30, hw = 0.276, pos = [], uv = [];
  for (let j = 0; j <= nv; j++) {
    const t = j / nv, c = cr(C, t), e = cr(E, t);
    for (let i = 0; i <= nu; i++) {
      const u = i / nu * 2 - 1, k = 1 - u * u;
      pos.push(u * hw, e[1] + (c[1] - e[1]) * k, e[0] + (c[0] - e[0]) * k); uv.push(i / nu, t);
    }
  }
  put(g, geom(pos, uv, grid(nu, nv)), hide, 0, 0, 0);
  // loose cushion 48 x 16 x 8 cm over the top rail, leaning back
  const cu = put(g, new RoundedBoxGeometry(0.5, 0.165, 0.085, 4, 0.038), hide, 0, 0.65, -pz + 0.042);
  cu.rotation.x = -0.2;
  // the folded-over flap across the cushion face
  put(cu, new RoundedBoxGeometry(0.49, 0.07, 0.014, 2, 0.006), hide, 0, 0.035, 0.045).rotation.x = 0.12;
  return g;
}

/* --------------------------- Solace side table ---------------------------- */
// FRET00083A: dia 45 x H 48 cm. 4.5 cm travertine slab with a full bullnose
// edge on a fluted drum, dia 30 cm, 24 reeds.
function travertine() {
  // vein-cut travertine as in FRET00083A: broad, very soft tonal bands running
  // along u (round the drum, across the slab), a few faint hairline veins, and
  // open pores stretched 3-4x along the bands. Tile-safe in u.
  const [c, g] = canvas(256, 256), r = rng(11);
  g.fillStyle = STONE_BASE; g.fillRect(0, 0, 256, 256);
  const band = (n, w0, w1, a0, a1, light, dark) => {
    for (let i = 0; i < n; i++) {
      const y0 = r() * 256, amp = 1 + r() * 4, ph = r() * 6.3, k = 1 + (r() * 2 | 0), lt = r() < 0.5;
      g.strokeStyle = `rgba(${lt ? light : dark},${a0 + r() * a1})`; g.lineWidth = w0 + r() * w1;
      for (const o of [-256, 0, 256]) {
        g.beginPath();
        for (let x = 0; x <= 256; x += 16) g.lineTo(x, y0 + o + amp * Math.sin(x / 256 * 2 * PI * k + ph));
        g.stroke();
      }
    }
  };
  band(14, 8, 18, 0.04, 0.05, '232,224,212', '150,132,112');   // tonal bands
  band(10, 0.6, 0.8, 0.05, 0.06, '236,228,218', '128,110,92'); // hairlines
  for (let i = 0; i < 300; i++) {
    const w = 0.35 + r() * 0.8, x = r() * 256, y = r() * 256;
    g.fillStyle = `rgba(108,92,76,${0.1 + r() * 0.18})`;
    for (const o of [-256, 0, 256]) { g.beginPath(); g.ellipse(x + o, y, w * (3 + r()), w, 0, 0, 2 * PI); g.fill(); }
  }
  const t = ctex(c); t.wrapS = t.wrapT = RepeatWrapping; return t;
}
function solace() {
  const g = new Group(), tex = travertine();
  const stone = std({ color: STONE, map: tex, bumpMap: tex, bumpScale: 1.2, roughness: 0.82, vertexColors: true });
  // fluted drum
  const R = 0.15, dep = 0.009, N = 24, k = 6, h = 0.435, seg = N * k, pos = [], uv = [], col = [];
  for (let i = 0; i <= seg; i++) {
    const a = i / seg * 2 * PI, s = (i % k) / k * 2 - 1, q = Math.sqrt(1 - s * s), rr = R - dep + dep * q, sh = 0.7 + 0.3 * Math.sqrt(q);
    for (const y of [0, h]) { pos.push(Math.sin(a) * rr, y, Math.cos(a) * rr); uv.push(i / seg * 2, y / h); col.push(sh, sh, sh); }
  }
  const idx = []; for (let i = 0; i < seg; i++) { const a = 2 * i; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  put(g, geom(pos, uv, idx, col), stone, 0, 0, 0);
  // slab: lathe profile with a 2.25 cm bullnose
  const pr = [new Vector2(0, h), new Vector2(0.2, h)];
  for (let i = 0; i <= 10; i++) { const a = -PI / 2 + i / 10 * PI; pr.push(new Vector2(0.2025 + 0.0225 * Math.cos(a), h + 0.0225 + 0.0225 * Math.sin(a))); }
  pr.push(new Vector2(0, h + 0.045));
  const top = new LatheGeometry(pr, 72), tp = top.attributes.position, tu = top.attributes.uv;
  const tc = [];
  for (let i = 0; i < tp.count; i++) { tu.setXY(i, tp.getX(i) * 2 + 0.5, tp.getZ(i) * 2 + 0.5); tc.push(1, 1, 1); }
  top.setAttribute('color', new Float32BufferAttribute(tc, 3));
  put(g, top, stone, 0, 0, 0);
  return g;
}

/* --------------------------------- builder -------------------------------- */
const tri = (o) => { let n = 0; o.traverse((m) => { if (m.isMesh) { const g = m.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return Math.round(n); };
const drop = (o) => o.traverse((m) => {
  if (!m.isMesh) return;
  m.geometry.dispose(); const t = m.material;
  if (t.map) t.map.dispose(); if (t.bumpMap) t.bumpMap.dispose(); t.dispose();
});

export async function build(ctx) {
  const U = ctx.U, G = new Group(), M = new Group();
  M.scale.setScalar(U(1)); G.add(M);
  await rug(M, ctx);

  // Layout in metres, table centred at the origin (radius 0.40).
  // Ryan: faces 30 deg off the rug's long axis (yaw 60 deg), aimed at the table
  // (its centre line passes 10 cm off the table centre), front edge 0.337 m
  // from the table edge. Both front posts stand >= 5.6 cm inside the rug
  // (post faces >= 3.5 cm in); both back posts are >= 24 cm off it.
  // Solace: the sitter's right, 5 cm off the armrest, 20 cm forward of the
  // chair centre; its 30 cm drum stands 3.2 cm clear of the rug's short edge.
  const al = 30 * PI / 180, fx = Math.cos(al), fz = Math.sin(al), dC = 0.4 + 0.33 + 0.325;
  const cx = -fx * dC - fz * 0.1, cz = -fz * dC + fx * 0.1, lat = 0.3075 + 0.05 + 0.225;
  const spots = [
    ['real-ryan.glb', ryan(), cx, cz, Math.atan2(fx, fz), 0.74, 0.33],
    ['real-solace.glb', solace(), cx - fz * lat + fx * 0.2, cz + fx * lat + fz * 0.2, 0, 0.48, 0.21]
  ];
  // one shared soft-shadow texture (radius 1 m), cloned and scaled per prop
  const blob = ctx.shadow(1);
  const shade = (r, x, z) => { const b = blob.clone(); b.scale.set(r, r, 1); b.position.set(U(x), 0.002, U(z)); G.add(b); };
  const info = { label: 'Real FableRoom pieces', tris: 0, filesKB: 53.5, notes: '' };
  for (const [file, standIn, x, z, ry, H, sr] of spots) {
    const holder = new Group(); holder.add(standIn);
    holder.position.set(x, 0, z); holder.rotation.y = ry; M.add(holder);
    shade(sr, x, z);
    // tight contact darkening where the piece meets the floor (the Blender
    // models share the real footprint: 4 posts at +-28.65 / +-30.4 cm, or the drum)
    const c = Math.cos(ry), s = Math.sin(ry);
    for (const [lx, lz] of H > 0.6 ? [[-0.2865, -0.304], [0.2865, -0.304], [-0.2865, 0.304], [0.2865, 0.304]] : [[0, 0]])
      shade(H > 0.6 ? 0.04 : 0.14, x + lx * c + lz * s, z - lx * s + lz * c);
    // Swap in the Blender model when the page lists it as available
    // (ctx.realModels, e.g. ['real-ryan.glb']) — no blind request, no 404.
    if (!(ctx.realModels && ctx.realModels.indexOf(file) > -1)) continue;
    ctx.loadGLB(ctx.assetBase + file).then((m) => {
      const b = new Box3().setFromObject(m), sz = b.getSize(new Vector3());
      if (Math.abs(sz.y - H) / H > 0.15) m.scale.multiplyScalar(H / sz.y);   // cm/mm exports
      b.setFromObject(m); const ce = b.getCenter(new Vector3());
      m.position.set(m.position.x - ce.x, m.position.y - b.min.y, m.position.z - ce.z);
      info.tris += tri(m) - tri(standIn);
      holder.remove(standIn); drop(standIn); holder.add(m);
    }).catch(() => {});
  }

  info.tris = tri(G);
  info.notes = 'Natalie Banana Silk Rug (Grey) 120 x 180 cm from the real product photo (real-rug.webp). ' +
    'Ryan Acacia Armchair (61.5 x 65 x 74 cm) and Solace Travertine Side Table (45 x 45 x 48 cm) are true-size ' +
    'STAND-INS built from primitives, awaiting the Blender models: assets/real-ryan.glb and assets/real-solace.glb ' +
    '(metres, +Y up, front +Z, origin at footprint centre) replace them automatically when present.';
  return {
    group: G,
    // Every azimuth: content reaches 1.44 m from the table centre; 1.38 m keeps
    // it inside both stages and the Solace 12 px clear of the phone rail at home.
    frame: { hRad: U(1.38), vHalf: U(0.9), ty: U(0.24), phi: 64 },
    info
  };
}
