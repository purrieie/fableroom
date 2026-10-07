/* ---------------------------------------------------------------------------
   Option B: a clay living room around the Alan coffee table.

   An architect's-model vignette built entirely in code: a three-seat sofa,
   a rug, a pedestal side table with a lamp, on a floor that fades into the
   stage. Every prop shares a few warm greige clay tones, so the mango wood
   and black legs are the only colour in the frame.

   Everything is modelled in real metres inside `room`, which is scaled by
   U(1) into engine units. The table sits at the origin: Ø 80 cm, 35 cm high.
   Zero files: the only texture is a small rug canvas drawn at runtime.
--------------------------------------------------------------------------- */
import {
  Group, Mesh, BoxGeometry, CylinderGeometry, LatheGeometry, RingGeometry, PlaneGeometry,
  BufferGeometry, Float32BufferAttribute, MeshStandardMaterial, MeshBasicMaterial,
  CanvasTexture, SRGBColorSpace, DoubleSide, BackSide, Vector2, Vector3
} from 'three';

/* Rounded box with an optional crown, in metres. Built from a 10x10 box
   grid: the outer 3 rows on each side wrap the corner radius, the middle 4
   stay flat so a cushion can bulge and baked shade has vertices to land on.
   A crown (bx/by/bz) > 0 domes only the + face (a seat's top, a back
   cushion's front); < 0 domes both faces (a loose throw cushion). `pin`
   pinches the z thickness toward the edges, like a seamed scatter cushion
   whose corners go thin. */
function rbox(w, h, d, r, bx = 0, by = 0, bz = 0, pin = 0) {
  const g = new BoxGeometry(2, 2, 2, 10, 10, 10), P = g.attributes.position;
  const T = 0.4, H = [w / 2 - r, h / 2 - r, d / 2 - r], B = [bx, by, bz];
  const q = [0, 0, 0], f = [0, 0, 0], a = [0, 0, 0], o = [0, 0, 0];
  for (let i = 0; i < P.count; i++) {
    q[0] = P.getX(i); q[1] = P.getY(i); q[2] = P.getZ(i);
    for (let k = 0; k < 3; k++) {
      const s = Math.sign(q[k]), m = Math.abs(q[k]);
      f[k] = s * Math.min(m, T) / T;
      a[k] = s * Math.max(0, m - T) / (1 - T);
    }
    const l = Math.hypot(a[0], a[1], a[2]);
    for (let k = 0; k < 3; k++) {
      const u = f[(k + 1) % 3], v = f[(k + 2) % 3];
      const c = B[k] < 0 || a[k] > 0 ? Math.abs(B[k]) : 0;
      o[k] = H[k] * f[k] + (r + c * (1 - u * u) ** 2 * (1 - v * v) ** 2) * a[k] / l;
    }
    if (pin) {
      // Thin seams and corners, and the outline's sides drawn in a touch
      // (5%) so the corners stand proud, the way a filled cushion sits.
      const X = o[0] * 2 / w, Y = o[1] * 2 / h;
      o[2] *= 1 - pin * (1 - (1 - X * X) * (1 - Y * Y));
      o[0] *= 1 - 0.05 * (1 - Y * Y); o[1] *= 1 - 0.05 * (1 - X * X);
    }
    P.setXYZ(i, o[0], o[1], o[2]);
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  // The box's six faces don't share vertices. Where they meet, weld them to
  // one exact position and one averaged normal, so the rounded edges are
  // watertight and shade as a single surface.
  const p = P.array, n = g.attributes.normal.array, seen = new Map();
  for (let i = 0; i < p.length; i += 3) {
    const k = Math.round(p[i] * 1e5) + ',' + Math.round(p[i + 1] * 1e5) + ',' + Math.round(p[i + 2] * 1e5);
    (seen.get(k) || seen.set(k, []).get(k)).push(i);
  }
  for (const s of seen.values()) {
    if (s.length < 2) continue;
    let x = 0, y = 0, z = 0;
    for (const i of s) { x += n[i]; y += n[i + 1]; z += n[i + 2]; }
    const l = Math.hypot(x, y, z) || 1;
    for (const i of s) {
      n[i] = x / l; n[i + 1] = y / l; n[i + 2] = z / l;
      p[i] = p[s[0]]; p[i + 1] = p[s[0] + 1]; p[i + 2] = p[s[0] + 2];
    }
  }
  return g;
}

/* Signed distances (metres) for the baked shade. sqrt, not Math.hypot:
   this runs ~1M times per build and hypot is several times slower. */
const sdBox = (x, y, z, b, r) => {
  const qx = Math.abs(x) - b[0] + r, qy = Math.abs(y) - b[1] + r, qz = Math.abs(z) - b[2] + r;
  const mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0, mz = qz > 0 ? qz : 0;
  return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0) - r;
};
const sdCyl = (x, y, z, R, h) => {
  const dx = Math.sqrt(x * x + z * z) - R, dy = Math.abs(y) - h;
  const mx = dx > 0 ? dx : 0, my = dy > 0 ? dy : 0;
  return Math.sqrt(mx * mx + my * my) + Math.min(Math.max(dx, dy), 0);
};

/* Bake soft ambient occlusion into vertex colours (Quilez's SDF method):
   the floor line, the seat/back crease and the gaps between cushions go
   gently darker and warmer, the way a clay render's GI would shade them. */
function bake(meshes, prims) {
  const sdf = (x, y, z) => {
    let d = y;
    for (const p of prims) {
      const e = p.e;
      const lx = e[0] * x + e[4] * y + e[8] * z + e[12];
      const ly = e[1] * x + e[5] * y + e[9] * z + e[13];
      const lz = e[2] * x + e[6] * y + e[10] * z + e[14];
      d = Math.min(d, p.c ? sdCyl(lx, ly, lz, p.b[0], p.b[1]) : sdBox(lx, ly, lz, p.b, p.r));
    }
    return d;
  };
  for (const m of meshes) {
    const g = m.geometry, P = g.attributes.position, N = g.attributes.normal, e = m.matrixWorld.elements;
    const col = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
      const px = P.getX(i), py = P.getY(i), pz = P.getZ(i), nx0 = N.getX(i), ny0 = N.getY(i), nz0 = N.getZ(i);
      const x = e[0] * px + e[4] * py + e[8] * pz + e[12];
      const y = e[1] * px + e[5] * py + e[9] * pz + e[13];
      const z = e[2] * px + e[6] * py + e[10] * pz + e[14];
      let nx = e[0] * nx0 + e[4] * ny0 + e[8] * nz0, ny = e[1] * nx0 + e[5] * ny0 + e[9] * nz0, nz = e[2] * nx0 + e[6] * ny0 + e[10] * nz0;
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      let occ = 0, sc = 1;
      for (let k = 0; k < 5; k++) {
        const h = 0.02 + 0.045 * k;
        occ += (h - sdf(x + nx * h, y + ny * h, z + nz * h)) * sc;
        sc *= 0.85;
      }
      const ao = Math.min(1, Math.max(0, 1 - 2.6 * occ));
      const s = 0.52 + 0.48 * ao;                      // warm, never black
      col[i * 3] = s; col[i * 3 + 1] = s ** 1.12; col[i * 3 + 2] = s ** 1.3;
    }
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
  }
}

/* After the bake, fold every clay mesh that shares a material into one
   geometry in the room's metre frame: 21 meshes become 6 draw calls. All
   transforms here are rotation + translation, so normals just rotate. */
function mergeByMaterial(meshes) {
  const by = new Map(), out = [], v = new Vector3();
  for (const m of meshes) (by.get(m.material) || by.set(m.material, []).get(m.material)).push(m);
  for (const [mat, list] of by) {
    const pos = [], nor = [], col = [], idx = [];
    for (const m of list) {
      const g = m.geometry, P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color.array;
      const I = g.index.array, o = pos.length / 3, e = m.matrixWorld;
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(e); pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(N, i).transformDirection(e); nor.push(v.x, v.y, v.z);
      }
      for (let i = 0; i < C.length; i++) col.push(C[i]);
      for (let i = 0; i < I.length; i++) idx.push(I[i] + o);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    out.push(new Mesh(g, mat));
  }
  return out;
}

/* A rounded-rectangle contact shadow (metres), w x d footprint, corner r,
   fading out over `sp` beyond the edge. Vertex alpha, no texture; all of
   them share one material. */
function softShadow(mat, w, d, r, sp, peak) {
  const K = [-0.6, -0.3, 0, 0.25, 0.55, 1], A = [1, 0.92, 0.7, 0.36, 0.11, 0];
  const pos = [0, 0, 0], col = [0.23, 0.18, 0.13, peak], idx = [], n = 5, R = 4 * (n + 1);
  const ax = w / 2 - r, az = d / 2 - r;
  for (let k = 0; k < K.length; k++) {
    const rr = Math.max(0, r + K[k] * sp);
    for (let c = 0; c < 4; c++) {
      const sx = c === 0 || c === 3 ? 1 : -1, sz = c < 2 ? 1 : -1;
      for (let j = 0; j <= n; j++) {
        const t = (c + j / n) * Math.PI / 2;
        pos.push(sx * ax + rr * Math.cos(t), 0, sz * az + rr * Math.sin(t));
        col.push(0.23, 0.18, 0.13, peak * A[k]);
      }
    }
  }
  for (let i = 0; i < R; i++) idx.push(0, 1 + i, 1 + (i + 1) % R);
  for (let k = 0; k < K.length - 1; k++) {
    for (let i = 0; i < R; i++) {
      const a = 1 + k * R + i, b = 1 + k * R + (i + 1) % R;
      idx.push(a, a + R, b, b, a + R, b + R);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  const m = new Mesh(g, mat);
  m.position.y = 0.0016;      // 0.002 engine units
  m.renderOrder = -2;
  return m;
}

/* Rug texture: undyed wool with a fine grain, a tonal border band 9 cm in,
   and a darker bound edge that reads as the rug's thickness. 512 x 356 px
   for 2.30 x 1.60 m, drawn once with a fixed seed. Warm oatmeal base so it
   sits in the clay family rather than reading as grey paper. */
function rugTexture(renderer) {
  const W = 512, H = 356, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  x.fillStyle = '#F2E4CE'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 16000; i++) {
    x.fillStyle = rnd() < 0.5 ? 'rgba(124,96,64,.06)' : 'rgba(255,248,236,.10)';
    x.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2.5, 1 + rnd());
  }
  x.strokeStyle = 'rgba(150,124,92,.08)'; x.lineWidth = 4; x.strokeRect(20, 20, W - 40, H - 40);
  x.strokeStyle = 'rgba(124,96,64,.26)'; x.lineWidth = 3; x.strokeRect(1.5, 1.5, W - 3, H - 3);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  if (renderer) t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}

export async function build(ctx) {
  const { U } = ctx;
  // Let the tapped button paint before the ~50 ms of geometry and bake work
  // (setTimeout too, in case rAF is throttled in a background tab).
  await new Promise((r) => { if (typeof requestAnimationFrame === 'function') requestAnimationFrame(r); setTimeout(r, 50); });

  const group = new Group();
  const room = new Group();          // real metres, table centre at origin
  const meshes = [], prims = [];

  // Clay tones: three close, warm greiges. Matte, picks up the stage light.
  const clay = (hex, o) => new MeshStandardMaterial({ color: hex, roughness: 0.95, metalness: 0, vertexColors: true, envMapIntensity: 0.6, ...o });
  const BODY = clay(0xDDD4C6), CUSH = clay(0xE3DBCE), ACC = clay(0xD4C9B8), FOOT = clay(0xBFB29F);

  const add = (parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    parent.add(m); meshes.push(m);
    return m;
  };
  // A rounded box that also registers itself as an occluder for the bake.
  const box = (parent, mat, w, h, d, r, x, y, z, rx, ry, rz, bulge) => {
    const m = add(parent, rbox(w, h, d, r, ...(bulge || [])), mat, x, y, z, rx, ry, rz);
    prims.push({ m, b: [w / 2, h / 2, d / 2 + (bulge ? Math.abs(bulge[2]) * 0.6 : 0)], r });
    return m;
  };

  /* ---- Sofa: three-seater, 210 W x 92 D x 81 H cm, seat 42-43 cm, seat
     depth ~51 cm ---------------------------------------------------------
     Centred behind the table and facing it; its front is 42 cm from the
     table's edge (standard 40-45 cm), so its centre sits at z = -1.28 m. */
  const sofa = new Group();
  sofa.position.set(0, 0, -1.28);
  room.add(sofa);
  const LEG = 0.07;                                   // 7 cm turned feet
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(sofa, new CylinderGeometry(0.02, 0.015, LEG, 12), FOOT, sx * 0.97, LEG / 2, sz * 0.38);
  }
  // Arms: 18 W x 55 H x 92 D cm, tops at 62 cm, generous 7 cm radius.
  for (const sx of [-1, 1]) box(sofa, BODY, 0.18, 0.55, 0.92, 0.07, sx * 0.96, LEG + 0.275, 0);
  // Back frame: 180 W x 62 H x 17 D cm, top at 69 cm; finished all round so
  // the sofa still looks deliberate when the camera orbits behind it.
  box(sofa, BODY, 1.80, 0.62, 0.17, 0.06, 0, LEG + 0.31, -0.375);
  // Seat deck: 178 W x 22 H x 77 D cm, tucked 2 cm into the back frame.
  box(sofa, BODY, 1.78, 0.22, 0.77, 0.05, 0, LEG + 0.11, 0.075);
  for (const sx of [-1, 0, 1]) {
    // Seat cushions: 57.5 W x 14 H x 72 D cm with a 1.2 cm crown, sunk
    // 1.5 cm into the deck, 2.5 cm back from its nose. A deep, steep
    // intersection reads as a clean crease; a hairline gap or a shallow
    // overlap breaks into a dotted line at phone scale. Seat 42 cm at the
    // edge, 43 cm crowned.
    box(sofa, CUSH, 0.575, 0.14, 0.72, 0.05, sx * 0.578, 0.345, 0.075, 0, 0, 0, [0, 0.012, 0]);
    // Back cushions: 57.5 W x 40 H x 18 D cm, 2.5 cm crown, leaning back
    // 10 deg against the frame; tops at ~81 cm. Seat depth, cushion nose to
    // back cushion face, ~51 cm (was 46).
    box(sofa, CUSH, 0.575, 0.40, 0.18, 0.06, sx * 0.578, 0.61, -0.19, -0.17, 0, 0, [0, 0, 0.025]);
  }
  // Two scatter cushions, 40 x 40 cm: 18 cm plump at the centre, pinched to
  // ~3.5 cm at the seams and corners, resting on the seat against the back
  // cushions with their tops just under the 81 cm back line.
  for (const sx of [-1, 1]) {
    box(sofa, ACC, 0.40, 0.40, 0.09, 0.045, sx * 0.60, 0.60, 0.035, -0.28, -sx * 0.22, sx * 0.03, [0, 0, -0.045, 0.62]);
  }

  /* ---- Side table: pedestal, Ø 36 cm x 50 cm high, beside the rear half of
     the sofa's left arm, 3.5 cm clear of it. A ceramic lamp on it: 27 cm
     gourd base, linen drum shade Ø 30/24 x 20 cm; lamp top at 91 cm. ---- */
  const SX = -1.265, SZ = -1.45;
  const side = new Group();
  side.position.set(SX, 0, SZ);
  room.add(side);
  const V = (pts) => pts.map(([r, y]) => new Vector2(r, y));
  add(side, new LatheGeometry(V([[0, 0], [0.135, 0], [0.14, 0.008], [0.135, 0.02], [0.055, 0.045], [0.028, 0.10],
    [0.024, 0.26], [0.03, 0.40], [0.072, 0.455], [0.162, 0.474], [0.178, 0.479], [0.18, 0.49], [0.175, 0.5], [0, 0.5]]), 48), ACC, 0, 0, 0);
  prims.push({ m: side, c: 1 });
  add(side, new LatheGeometry(V([[0, 0], [0.055, 0], [0.072, 0.012], [0.088, 0.06], [0.086, 0.115], [0.06, 0.17],
    [0.03, 0.2], [0.021, 0.235], [0.018, 0.27], [0, 0.27]]), 40), CUSH, 0.03, 0.5, -0.03);
  // Shade: open linen drum, outside lit with a faint glow; inside a shade
  // darker (it is in its own shadow); a 1 cm bound rim on top so the opening
  // reads as a drum, not a flat-topped solid, when the camera looks down.
  const SHADE = clay(0xF2EDE4, { emissive: 0x1c1610 });
  const SHADE_IN = clay(0xC4B6A2, { side: BackSide });
  const drum = new CylinderGeometry(0.12, 0.15, 0.20, 48, 1, true);
  add(side, drum, SHADE, 0.03, 0.81, -0.03);
  add(side, drum.clone(), SHADE_IN, 0.03, 0.81, -0.03);
  add(side, new RingGeometry(0.11, 0.122, 48), SHADE, 0.03, 0.9095, -0.03, -Math.PI / 2);

  /* ---- Bake the shade, merge, then ground everything --------------------- */
  room.updateMatrixWorld(true);
  for (const p of prims) {
    if (p.c) {
      // Side-table top as a disc occluder (so the lamp foot and arm darken).
      const e = p.m.matrixWorld.clone(); e.elements[13] += 0.49; p.e = e.invert().elements; p.b = [0.18, 0.012];
    } else p.e = p.m.matrixWorld.clone().invert().elements;
  }
  bake(meshes, prims);
  room.clear();
  for (const m of mergeByMaterial(meshes)) room.add(m);

  // Contact shadows (vertex-alpha, no textures, one shared material): under
  // the sofa, the side table's foot, and the lamp on the table top.
  const SH = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide });
  const sh = softShadow(SH, 2.10, 0.92, 0.12, 0.2, 0.42);
  sh.position.set(0, sh.position.y, -1.28); room.add(sh);
  const st = softShadow(SH, 0.28, 0.28, 0.14, 0.12, 0.34);
  st.position.set(SX, st.position.y, SZ); room.add(st);
  const lamp = softShadow(SH, 0.12, 0.12, 0.06, 0.10, 0.28);
  lamp.position.set(SX + 0.03, 0.501, SZ - 0.03); room.add(lamp);

  /* ---- Rug: 230 x 160 cm flatweave, centred 25 cm behind the table so it
     runs from z = -1.05 to +0.55 m: 15 cm proud of the table's front edge,
     and 13-17 cm under the sofa's front feet (at z -0.92 to -0.88). ----- */
  const RZ = -0.25;
  const rug = new Mesh(new PlaneGeometry(2.30, 1.60), new MeshStandardMaterial({
    map: rugTexture(ctx.viewer && ctx.viewer.renderer), roughness: 1, transparent: true, depthWrite: false,
    envMapIntensity: 0.6 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.0008, RZ);                   // 0.001 engine units
  rug.renderOrder = -3;
  room.add(rug);
  // A 2 cm fringe of shade around the rug so it reads as having thickness.
  const rugEdge = softShadow(SH, 2.30, 1.60, 0.01, 0.035, 0.16);
  rugEdge.position.set(0, 0.0006, RZ); rugEdge.renderOrder = -3.5;
  room.add(rugEdge);

  /* ---- Floor: a soft elliptical pool, 6.4 x 5.2 m, fading to nothing. ---- */
  const fg = new RingGeometry(0, 1, 72, 18), FP = fg.attributes.position, fa = [];
  for (let i = 0; i < FP.count; i++) {
    const r = Math.hypot(FP.getX(i), FP.getY(i)), t = Math.min(1, Math.max(0, (r - 0.3) / 0.7));
    fa.push(1, 1, 1, 0.75 * (1 - t * t * (3 - 2 * t)) ** 1.4);
  }
  fg.setAttribute('color', new Float32BufferAttribute(fa, 4));
  // Tinted once from the stage's own backdrop so it melts into the gradient.
  const L = ctx.viewer && ctx.viewer.lightingPreset && ctx.viewer.lightingPreset();
  const floorMat = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false });
  floorMat.color.set(L && L.bg ? L.bg[3] : '#E7DCCC').multiplyScalar(0.9);
  const floor = new Mesh(fg, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.scale.set(3.2, 2.6, 1);
  floor.position.set(-0.15, 0.0004, -0.55);
  floor.renderOrder = -4;
  room.add(floor);

  // Turn the room 19 deg so the home camera (azimuth 28 deg) meets the sofa
  // in a gentle three-quarter view, balanced so neither the side table nor
  // the far arm runs under the stage controls on a phone.
  room.rotation.y = 19 * Math.PI / 180;
  room.scale.setScalar(U(1));
  group.add(room);

  let tris = 0;
  group.traverse((o) => { if (o.isMesh) { const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });

  return {
    group,
    frame: { hRad: U(1.13), vHalf: U(1.0), ty: U(0.38), phi: 64 },
    info: {
      label: 'Clay living room',
      tris: Math.round(tris),
      filesKB: 0,
      notes: 'Sofa 210x92x81 cm (seat 42-43, depth 51), 42 cm from the table; rug 230x160; side table Ø36x50 with a 41 cm lamp. All procedural with baked AO; no files, one runtime rug canvas.'
    }
  };
}
