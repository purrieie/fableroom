// Option A — a woman for scale beside the Alan coffee table (80 cm across, 35 cm high).
//   figure_card : FableRoom's own line-drawn woman from their size diagram, as a camera-facing card
//   figure_clay : an artist's-mannequin woman built from lofted primitives, matte clay
// Both stand exactly 1.60 m tall (the diagram labels her 160 cm), on the floor, to the right of the
// table at the default view, with a slim 160 cm marker like the diagram's.
import {
  Group, Mesh, PlaneGeometry, BufferGeometry, Float32BufferAttribute, LineSegments, LineBasicMaterial,
  MeshBasicMaterial, MeshStandardMaterial, CanvasTexture, TextureLoader, SRGBColorSpace,
  Vector2, Vector3, Matrix4, Quaternion, Euler
} from 'three';

const HEIGHT = 1.60;           // m — her full height, crown to sole (FableRoom's diagram: 160 CM)
const AZ = 28 * Math.PI / 180; // engine's default camera azimuth, from +Z toward +X
const GAP = 0.40;              // m — sideways from the table edge to her axis; with BACK she stands
                               //     0.82 m from the table centre = 0.42 m off its edge (≈ sofa legroom);
                               //     her nearer hand hangs ~15 cm (on screen) clear of the table top
const BACK = 0.2;              // m — half a step behind the table's plane, so she isn't lined up on it
const MARK = 0.23;             // m — marker line, 4 cm clear of her (she reaches 0.19 m to screen-right)
const TICK = 0.028;            // m — end ticks reach ±2.8 cm either side of the line, like the Size overlay's
const deg = Math.PI / 180;

const _v = new Vector3(), _s = new Vector2();

// Where she stands: GAP beyond the table's edge, to the right of it on screen at the default view,
// BACK a little further from the camera. Returns [x, z] in metres.
function spot(ctx) {
  const side = ctx.product.w / 2 + GAP, c = Math.cos(AZ), s = Math.sin(AZ);
  return [side * c - BACK * s, -side * s - BACK * c];
}

// "160 cm" pill, styled like the page's own .dimlabel (white 92 %, hairline border, 10px/700/0.06em).
const FONT = '700 10px "Hanken Grotesk",-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
// wait (at most 1.5 s) for the page's webfont, so the canvas never bakes in a fallback face
const fontReady = () => Promise.race([
  (document.fonts && document.fonts.load('700 10px "Hanken Grotesk"')) || 0,
  new Promise(r => setTimeout(r, 1500))
]).catch(() => 0);
function pill(text) {
  const S = 4, c = document.createElement('canvas');
  let g = c.getContext('2d');
  const font = FONT;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width + 19), h = 19;
  c.width = w * S; c.height = h * S;
  g = c.getContext('2d'); g.scale(S, S);
  const r = h / 2 - 0.5;
  g.beginPath(); g.arc(r + 0.5, h / 2, r, Math.PI / 2, Math.PI * 1.5); g.arc(w - r - 0.5, h / 2, r, -Math.PI / 2, Math.PI / 2);
  g.closePath(); g.fillStyle = 'rgba(255,255,255,.92)'; g.fill();
  g.lineWidth = 1; g.strokeStyle = 'rgba(44,44,44,.14)'; g.stroke();
  g.font = font; g.fillStyle = '#2c2c2c'; g.textAlign = 'center'; g.textBaseline = 'middle';
  if ('letterSpacing' in g) g.letterSpacing = '0.6px';
  g.fillText(text, w / 2 + 0.3, h / 2 + 0.5);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace;
  return { t, w, h };
}

// A billboard pivot at her feet: turns about Y to face the camera and carries the marker line and
// the pill. The pill faces the screen squarely and keeps a constant on-screen size, like the Size
// overlay's HTML labels. When an orbit brings her between the camera and the table, everything in
// `fades` dims so the table stays the hero. All of it runs in the line's onBeforeRender — the line
// is the first of her objects to draw, so the card, body and pill see this frame's matrices.
// No allocations per frame.
const _m = new Matrix4(), _q = new Quaternion(), _q2 = new Quaternion();
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
function pivotWithMarker(ctx, g, at, fades, floor, pre) {
  const U = ctx.U, h = U(HEIGHT), x = U(MARK), t = U(TICK) / 2, lo = U(0.42), hi = U(0.72);
  const pivot = new Group(); pivot.position.set(U(at[0]), 0, U(at[1])); g.add(pivot);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute([x, 0, 0, x, h, 0, x - t, 0, 0, x + t, 0, 0, x - t, h, 0, x + t, h, 0], 3));
  const lm = new LineBasicMaterial({ color: 0x2c2c2c, transparent: true, opacity: 0.55, depthWrite: false });  // = engine's Size lines
  const line = new LineSegments(geo, lm);
  line.frustumCulled = false; line.renderOrder = 1;
  const P = pill('160 cm');
  const label = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({
    map: P.t, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
  label.renderOrder = 3; label.frustumCulled = false;
  pivot.add(line, label);
  fades.push(lm, 0.55, label.material, 1);
  line.onBeforeRender = (r, s, cam) => {
    const par = pivot.parent; if (!par) return;
    _v.setFromMatrixPosition(cam.matrixWorld); par.worldToLocal(_v);
    const px = pivot.position.x, pz = pivot.position.z, dx = _v.x - px, dz = _v.z - pz, dy = _v.y - h;
    pivot.rotation.y = Math.atan2(dx, dz);
    // in front of the table and overlapping it on screen -> dim
    const cl = Math.sqrt(_v.x * _v.x + _v.z * _v.z) || 1, cx = _v.x / cl, cz = _v.z / cl;
    const o = cx * px + cz * pz > 0 ? floor + (1 - floor) * smooth(lo, hi, Math.abs(cx * pz - cz * px)) : 1;
    for (let i = 0; i < fades.length; i += 2) fades[i].opacity = fades[i + 1] * o;
    if (pre) pre.visible = o < 0.999;  // depth pre-pass only while dimmed (takes effect next frame)
    r.getSize(_s);
    const k = 2 * Math.sqrt(dx * dx + dy * dy + dz * dz) * Math.tan((cam.fov || 34) * deg / 2) / Math.max(_s.y, 1);
    label.scale.set(P.w * k, P.h * k, 1);
    label.position.set(x - (P.w / 2 - 12) * k, h + (P.h / 2 + 6) * k, 0);
    pivot.updateMatrixWorld(true);
    _q.setFromRotationMatrix(_m.extractRotation(pivot.matrixWorld)).invert();
    label.quaternion.multiplyQuaternions(_q, _q2.setFromRotationMatrix(_m.extractRotation(cam.matrixWorld)));
    label.updateMatrixWorld();
  };
  return pivot;
}

function frame(ctx) {
  const U = ctx.U;
  return { hRad: U(ctx.product.w / 2 + GAP + MARK + 0.03), vHalf: U(0.9), ty: U(0.78), phi: 74 };
}

/* ------------------------------------------------------------------ A1: card */
export async function buildCard(ctx) {
  const U = ctx.U, g = new Group(), at = spot(ctx);
  const tex = await new TextureLoader().loadAsync(ctx.assetBase + 'figure-woman.webp');
  tex.colorSpace = SRGBColorSpace; tex.anisotropy = 4;
  // figure-woman.webp is 235x754: 736 px = 160 cm, her standing axis 132 px from the left edge,
  // soles 9 px above the bottom edge.
  await fontReady();
  const s = U(HEIGHT) / 736;
  const geo = new PlaneGeometry(235 * s, 754 * s); geo.translate((117.5 - 132) * s, (377 - 9) * s, 0);
  const card = new Mesh(geo, new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  card.renderOrder = 2;
  const sh = ctx.shadow(0.16); sh.position.set(U(at[0]), 0.002, U(at[1])); sh.scale.set(1.1, 0.8, 1); g.add(sh);
  // a line drawing ghosts more than a solid body, so the card dims further (12 %) than the clay (22 %)
  pivotWithMarker(ctx, g, at, [card.material, 1, sh.material, 0.85], 0.12).add(card);
  return {
    group: g, frame: frame(ctx),
    info: { label: 'Woman for scale — FableRoom\'s own drawing', tris: 6, filesKB: 13.2,
      notes: 'Their 160 cm size-diagram woman as a camera-facing card, 1.60 m tall, 0.42 m off the table edge, with a 160 cm marker; dims when an orbit puts her in front of the table.' }
  };
}

/* ------------------------------------------------------------------ A2: clay */
// Lofts rings into one indexed geometry. Ring row: [y, a, b, cz, cx, roll, e, F] in a part's frame —
// a half-width along local X, b half-depth along local Z, e the superellipse power (2 = ellipse,
// 3 = squarer), F an optional (u, w) -> [u, w] reshaper; a = 0 makes a single pole vertex.
// ip(): a row column interpolated at height y (d = value when a row leaves the column out).
const ip = (R, y, j, d = 0) => {
  let k = 0; while (k < R.length - 2 && R[k + 1][0] < y) k++;
  const r = R[k], q = R[k + 1], f = Math.min(1, Math.max(0, (y - r[0]) / (q[0] - r[0])));
  return (r[j] ?? d) + ((q[j] ?? d) - (r[j] ?? d)) * f;
};
function bodyGeometry() {
  const P = [], I = [], v = new Vector3();
  function loft(rows, m, seg) {
    let prev = -1, pn = 0;
    const part = { R: rows, inv: m.clone().invert(), s: P.length / 3 };
    for (const [y, a, b, cz = 0, cx = 0, t = 0, e = 2, F] of rows) {
      const st = P.length / 3, n = a > 1e-5 ? seg : 1, c = Math.cos(t), sn = Math.sin(t), pw = (q, x) => q * Math.sign(x) * Math.abs(x) ** (2 / e);
      for (let k = 0; k < n; k++) {
        const f = k / n * Math.PI * 2;
        let u = pw(a, Math.cos(f)), w = pw(b, Math.sin(f));
        if (F) [u, w] = F(u, w);
        v.set(cx + u * c, y + u * sn, cz + w).applyMatrix4(m); P.push(v.x, v.y, v.z);
      }
      if (prev >= 0) for (let k = 0; k < Math.max(n, pn); k++) {
        if (pn === 1) I.push(prev, st + k, st + (k + 1) % n);
        else if (n === 1) I.push(prev + k, st, prev + (k + 1) % pn);
        else { const q = (k + 1) % n; I.push(prev + k, st + q, prev + q, prev + k, st + k, st + q); }
      }
      prev = st; pn = n;
    }
    part.e = P.length / 3;
    return part;
  }
  const V = (x, y, z) => new Vector3(x, y, z), FWD = V(0, 0, 1), UP = V(0, 1, 0);
  // a part along the bone A->B; profile rows [t (0 at A, 1 at B), a, b, cz]
  function bone(A, B, prof, seg, ref) {
    const d = B.clone().sub(A), len = d.length(); d.divideScalar(len);
    const z = (ref || FWD).clone(); z.addScaledVector(d, -z.dot(d)).normalize();
    const m = new Matrix4().makeBasis(new Vector3().crossVectors(d, z), d, z).setPosition(A);
    return loft(prof.map(([t, a, b, cz]) => [t * len, a, b, cz]), m, seg);
  }
  // ellipsoid, optionally inside another part's frame
  function ball(c, r, sx = 1, sy = 1, sz = 1, frame) {
    const rows = []; for (let i = 0; i <= 8; i++) { const th = (i / 8 - 0.5) * Math.PI, q = r * Math.cos(th); rows.push([r * Math.sin(th), q, q]); }
    const m = new Matrix4().makeScale(sx, sy, sz).setPosition(c);
    loft(rows, frame ? frame.clone().multiply(m) : m, 16);
  }
  const along = (A, dir, len) => A.clone().addScaledVector(dir.normalize(), len);
  // pivot (px, py) rolled by t, offset (dx, dy) -> point
  const rz = (px, py, t, dx, dy, z) => V(px + dx * Math.cos(t) - dy * Math.sin(t), py + dx * Math.sin(t) + dy * Math.cos(t), z);
  function knee(Hp, A, l1, l2, pole) {
    const d = A.clone().sub(Hp), L = Math.min(d.length(), l1 + l2 - 1e-4); d.normalize();
    const a = (l1 * l1 - l2 * l2 + L * L) / (2 * L), p = pole.clone().addScaledVector(d, -pole.dot(d)).normalize();
    return Hp.clone().addScaledVector(d, a).addScaledVector(p, Math.sqrt(Math.max(0, l1 * l1 - a * a)));
  }

  // ---- pose: relaxed contrapposto, weight on her right leg (-X): right hip up, right shoulder
  // down, head over the standing foot. She faces +Z. Female proportions for 1.60 m: head 0.213
  // (1/7.5), shoulders 0.40 across the deltoids (joints 0.16 off the chest axis, 1.23–1.25 high),
  // waist 1.00, hips 0.34 across at the joints (0.85), knees 0.46, elbows ~0.95, fingertips
  // 0.56–0.60 (mid-thigh), neck 10 cm thick.
  const SHX = 0.16, SHY = 0.241, UA = 0.28;
  const PT = -7 * deg, CT = 5 * deg, PX = -0.022, PY = 0.885, CX = -0.012, CY = 1.0;

  // legs: standing right, relaxed left (knee eased forward and in, foot forward and turned out)
  const hipR = rz(PX, PY, PT, -0.082, -0.035, 0), hipL = rz(PX, PY, PT, 0.082, -0.035, 0);
  const ankR = V(-0.075, 0.068, -0.01), ankL = V(0.145, 0.068, 0.095);
  const leg = hipR.distanceTo(ankR) / 0.998, TH = leg * 0.507, SH = leg - TH;
  const kneeR = knee(hipR, ankR, TH, SH, V(0.05, 0, 1)), kneeL = knee(hipL, ankL, TH, SH, V(-0.35, 0, 1));
  const THIGH = [[-0.22, 0, 0], [-0.17, 0.06, 0.058], [-0.09, 0.084, 0.082], [0, 0.088, 0.086], [0.2, 0.074, 0.077],
    [0.5, 0.063, 0.065], [0.78, 0.053, 0.054], [0.95, 0.048, 0.05, 0.004], [1.04, 0.044, 0.046, 0.004], [1.1, 0.03, 0.03], [1.13, 0, 0]];
  // the thighs as seen in the pelvis's own (rolled) frame: hip x, y, z and unit direction
  const cP = Math.cos(PT), sP = Math.sin(PT), thighs = [[hipR, kneeR], [hipL, kneeL]].map(([H, K]) => {
    const d = K.clone().sub(H).normalize(), x = H.x - PX, y = H.y - PY;
    return [x * cP + y * sP, y * cP - x * sP, H.z, d.x * cP + d.y * sP, d.y * cP - d.x * sP, d.z];
  });
  // Ring reshaper for the pelvis below the hip joints: each ring point slides (by k) from the
  // pelvis's own oval onto the outline of the two (tilted) thigh sections at that height, 4 mm
  // inside them. So the thighs grow out of the pelvis tangentially — no cut line round the hip or
  // across the front. Between the thighs it keeps half its own oval, a small filler whose edges
  // make the only visible seam: a short Λ at the crotch. Behind, the hand-over runs lower (kb),
  // so the seat rounds off into a soft gluteal fold at ~0.77 m instead of a ledge.
  const hug = (y, cz, k, kb) => {
    const el = thighs.map(([hx, hy, hz, dx, dy, dz]) => {
      const s = (y - PY - hy) / dy, t = s / TH, A = ip(THIGH, t, 1), B = ip(THIGH, t, 2);
      // horizontal slice of the tilted thigh: X²(1-dx²)/A² + Z²(1-dz²)/B² - 2XZ·dx·dz/AB = 1
      return [hx + dx * s, hz + dz * s, (1 - dx * dx) / A / A, (1 - dz * dz) / B / B, -dx * dz / A / B];
    });
    return (u, w) => {
      const r0 = Math.hypot(u, w), ux = u / r0, uz = w / r0; let r = r0 / 2;
      for (const [ex, ez, al, be, ga] of el) {   // far hit of the ray from the ring centre
        const X = -ex, Z = cz - ez, qa = al * ux * ux + be * uz * uz + 2 * ga * ux * uz,
          qb = al * ux * X + be * uz * Z + ga * (ux * Z + uz * X), D = qb * qb - qa * (al * X * X + be * Z * Z + 2 * ga * X * Z - 1);
        if (D > 0) r = Math.max(r, (Math.sqrt(D) - qb) / qa - 0.004);
      }
      r = r0 + (r - r0) * (uz < 0 ? k - (k - kb) * uz * uz : k); return [ux * r, uz * r];
    };
  };

  // torso, crotch to neck: [y, half-width, half-depth, cz, e]
  // Hips 0.34 m across; below the hip joints (0.85 m) the pelvis hands over to the thighs (hug).
  // Shoulders: an 18° slope from the neck that meets each arm's round deltoid cap tangentially.
  const tor = loft([
    [0.75, 0, 0, 0], [0.756, 0.03, 0.03, 0], [0.765, 0.06, 0.06, 0], [0.78, 0.1, 0.08, 0.003], [0.795, 0.13, 0.08, 0.004, 2.6],
    [0.81, 0.15, 0.084, 0.004, 3], [0.825, 0.162, 0.092, 0, 2.8], [0.84, 0.168, 0.1, -0.008, 2.6], [0.855, 0.17, 0.104, -0.013, 2.5],
    [0.875, 0.169, 0.106, -0.016, 2.4], [0.905, 0.161, 0.1, -0.014, 2.2], [0.945, 0.141, 0.088, -0.008],
    [0.99, 0.116, 0.079, -0.002], [1.03, 0.115, 0.081, 0.003], [1.075, 0.122, 0.088, 0.008], [1.12, 0.131, 0.096, 0.013],
    [1.16, 0.138, 0.104, 0.018], [1.18, 0.142, 0.103, 0.017], [1.215, 0.15, 0.096, 0.012], [1.245, 0.162, 0.086, 0.004],
    [1.27, 0.17, 0.074, -0.002], [1.285, 0.174, 0.066, -0.006], [1.295, 0.143, 0.06, -0.008], [1.303, 0.118, 0.056, -0.01],
    [1.311, 0.094, 0.05, -0.012], [1.317, 0.075, 0.045, -0.013], [1.321, 0.063, 0.042, -0.013], [1.324, 0, 0, -0.013]
  ].map(([y, a, b, cz, e]) => {
    const s = smooth(0.93, 1.13, y);
    const cx = (PX - (y - PY) * Math.sin(PT)) * (1 - s) + (CX - (y - CY) * Math.sin(CT)) * s;
    return [y, a, b, cz, cx, PT * (1 - s) + CT * s, e, y < 0.86 && a && hug(y, cz, 1 - smooth(0.8, 0.86, y), 1 - smooth(0.765, 0.86, y))];
  }), new Matrix4(), 28);

  const SHIN = [[-0.11, 0, 0], [-0.08, 0.03, 0.03], [-0.03, 0.044, 0.046, 0.004], [0.06, 0.046, 0.048], [0.18, 0.05, 0.054, -0.008],
    [0.32, 0.05, 0.054, -0.012], [0.5, 0.043, 0.045, -0.008], [0.75, 0.032, 0.033], [0.95, 0.027, 0.028], [1.06, 0.02, 0.02], [1.1, 0, 0]];
  const seams = [], legs = [];
  for (const [h, k, a] of [[hipR, kneeR, ankR], [hipL, kneeL, ankL]]) { legs.push(bone(h, k, THIGH, 22)); bone(k, a, SHIN, 20); ball(a, 0.027); }
  // feet, 0.225 m heel to toe, flat on the floor (each ring's underside at y = 0)
  const FOOT = [[0, 0, 0.028], [0.02, 0.021, 0.026], [0.07, 0.028, 0.032], [0.2, 0.029, 0.037], [0.4, 0.033, 0.032],
    [0.6, 0.039, 0.024], [0.78, 0.04, 0.018], [0.9, 0.036, 0.014], [0.97, 0.023, 0.01], [1, 0, 0.008]];
  for (const [a, yaw] of [[ankR, -12 * deg], [ankL, 25 * deg]]) {
    const dir = V(Math.sin(yaw), 0, Math.cos(yaw)), heel = V(a.x, 0.035, a.z).addScaledVector(dir, -0.055);
    bone(heel, heel.clone().addScaledVector(dir, 0.225), FOOT.map(([t, w, b]) => [t, w, w > 0 ? b : 0, b - 0.035]), 16, UP);
  }

  // arms: shoulder → elbow 0.28, elbow → wrist 0.235, hand 0.17. They hang as close as the hips
  // allow — forearms 5 mm clear of the hip, left hand 2 cm off the thigh (the right hand 5 cm, as
  // the weight-bearing hip juts out) — elbows and wrists soft, palms to the thighs
  const shR = rz(CX, CY, CT, -SHX, SHY, -0.015), shL = rz(CX, CY, CT, SHX, SHY, -0.015);
  const UPPER = [[-0.164, 0, 0], [-0.15, 0.019, 0.019], [-0.12, 0.032, 0.032], [-0.08, 0.041, 0.041], [-0.035, 0.046, 0.046],
    [0.05, 0.046, 0.046], [0.2, 0.041, 0.042], [0.42, 0.035, 0.036],
    [0.75, 0.031, 0.031], [0.95, 0.028, 0.028], [1.07, 0.02, 0.02], [1.11, 0, 0]];
  const FORE = [[-0.09, 0, 0], [-0.06, 0.02, 0.02], [-0.01, 0.028, 0.028], [0.15, 0.032, 0.03], [0.45, 0.027, 0.024],
    [0.85, 0.02, 0.016], [1, 0.019, 0.015], [1.06, 0.012, 0.01], [1.09, 0, 0]];
  const HAND = [[-0.08, 0, 0], [-0.04, 0.012, 0.016], [0.05, 0.014, 0.028], [0.3, 0.015, 0.038], [0.55, 0.013, 0.038],
    [0.78, 0.01, 0.03], [0.93, 0.007, 0.02], [1, 0, 0]];
  for (const [sh, d1, d2, d3] of [[shR, V(-0.11, -1, 0), V(-0.06, -1, 0.35), V(0.26, -1, 0.15)],
                                  [shL, V(0.14, -1, -0.1), V(0.15, -1, 0.3), V(-0.3, -1, 0.22)]]) {
    const el = along(sh, d1, UA), wr = along(el, d2, 0.235), tip = along(wr, d3, 0.17);
    seams.push(bone(sh, el, UPPER, 18), 0.03); bone(el, wr, FORE, 16); bone(wr, tip, HAND, 14); ball(el, 0.027);
  }

  // neck, and an egg head (faceless) turned a touch toward her right and tipped down; low bun
  const nk0 = rz(CX, CY, CT, 0, 0.3, -0.015), nk1 = V(nk0.x + 0.008, 1.445, 0.01);
  seams.push(bone(nk0, nk1, [[-0.12, 0, 0], [-0.08, 0.04, 0.038], [0, 0.056, 0.052], [0.25, 0.052, 0.05], [0.6, 0.05, 0.048], [1, 0.049, 0.047],
    [1.15, 0.038, 0.037], [1.25, 0, 0]], 16), 0.02);
  const head = new Matrix4().makeRotationFromEuler(new Euler(5 * deg, -14 * deg, -3 * deg, 'YXZ'))
    .setPosition(nk1.x + 0.004, HEIGHT - 0.2135, 0.014);
  loft([[0, 0, 0, 0.044], [0.008, 0.02, 0.018, 0.046], [0.03, 0.044, 0.042, 0.036], [0.06, 0.058, 0.066, 0.022],
    [0.095, 0.067, 0.084, 0.01], [0.13, 0.072, 0.093, 0], [0.16, 0.071, 0.092, -0.006], [0.185, 0.062, 0.08, -0.01],
    [0.202, 0.044, 0.056, -0.012], [0.211, 0.022, 0.028, -0.012], [0.2135, 0, 0, -0.012]], head, 24);
  ball(V(0, 0.14, -0.106), 0.04, 1, 0.92, 0.85, head);

  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(P, 3)); geo.setIndex(I); geo.computeVertexNormals();
  const N = geo.attributes.normal.array, C = new Float32Array(P.length);
  // Smooth-union shading. The body is a union of convex lofts, so where an arm or the neck leaves
  // the torso there is a crease. Within w metres of the other part's surface, a vertex's normal is
  // bent halfway toward that surface's normal; both sides meet at the same average, so the seam
  // stops reading as a cut (no sleeve line at the shoulders).
  // sd(): approximate signed distance (m) from a part's surface, from its own ring rows.
  function sd(p, x, y, z) {
    v.set(x, y, z).applyMatrix4(p.inv);
    const R = p.R, n = R.length; let ly = v.y, a, b, cz, cx, t, e;
    for (let it = 0; it < 2; it++) {
      if (ly < R[0][0] || ly > R[n - 1][0]) return 1;
      a = ip(R, ly, 1); b = ip(R, ly, 2); cz = ip(R, ly, 3); cx = ip(R, ly, 4); t = ip(R, ly, 5); e = ip(R, ly, 6, 2);
      ly = v.y - (v.x - cx) * Math.tan(t);   // undo the ring's roll
    }
    return a < 1e-4 ? 1 : ((Math.abs((v.x - cx) / Math.cos(t) / a) ** e + Math.abs((v.z - cz) / b) ** e) ** (1 / e) - 1) * Math.min(a, b);
  }
  const h = 0.002, g = new Vector3(), nn = new Vector3();
  function seam(A, B, w, s = 0.5) {
    for (let i = A.s; i < A.e; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], d = sd(B, x, y, z);
      if (d < -0.004 || d > w) continue;
      g.set(sd(B, x + h, y, z) - sd(B, x - h, y, z), sd(B, x, y + h, z) - sd(B, x, y - h, z), sd(B, x, y, z + h) - sd(B, x, y, z - h)).normalize();
      const k = s * (1 - smooth(0, w, d));
      nn.fromArray(N, i * 3).multiplyScalar(1 - k).addScaledVector(g, k).normalize().toArray(N, i * 3);
    }
  }
  for (let j = 0; j < seams.length; j += 2) { seam(tor, seams[j], seams[j + 1]); seam(seams[j], tor, seams[j + 1]); }
  // where the pelvis hugs a thigh it takes the thigh's own shading, so the hand-over can't show
  for (const L of legs) seam(tor, L, 0.02, 1);
  // baked occlusion: undersides and the last few centimetres above the floor go a shade darker
  for (let i = 0; i < P.length; i += 3) {
    C[i] = C[i + 1] = C[i + 2] = (1 - 0.2 * Math.max(0, -N[i + 1])) * (0.8 + 0.2 * smooth(0, 0.22, P[i + 1]));
  }
  geo.setAttribute('color', new Float32BufferAttribute(C, 3));
  return geo;
}

export async function buildClay(ctx) {
  const U = ctx.U, g = new Group(), at = spot(ctx), yaw = -4 * deg;  // turned ~30° from the default camera toward the table
  const geo = bodyGeometry(); geo.scale(U(1), U(1), U(1));
  // Transparent only so it can dim when an orbit puts her in front of the table; a depth-only
  // pre-pass keeps the dimmed body a single clean layer.
  const mat = new MeshStandardMaterial({ color: 0xddd3c5, roughness: 0.8, metalness: 0, vertexColors: true, transparent: true });
  const body = new Mesh(geo, mat); body.renderOrder = 2;
  const pre = new Mesh(geo, new MeshBasicMaterial({ colorWrite: false, transparent: true })); pre.renderOrder = 1.5;
  body.add(pre);
  body.position.set(U(at[0]), 0, U(at[1])); body.rotation.y = yaw;
  g.add(body);
  const fades = [mat, 1];
  pre.visible = false;
  await fontReady();
  pivotWithMarker(ctx, g, at, fades, 0.22, pre);
  const c = Math.cos(yaw), s = Math.sin(yaw), fx = 0.035, fz = 0.05;  // between her feet
  const sh = ctx.shadow(0.17); sh.position.set(U(at[0] + fx * c + fz * s), 0.002, U(at[1] - fx * s + fz * c));
  sh.scale.set(1.15, 0.9, 1); g.add(sh); fades.push(sh.material, 0.9);
  return {
    group: g, frame: frame(ctx),
    // drawn triangles: body + pill + shadow (the body's depth pre-pass draws it once more, only
    // while she is dimmed in front of the table)
    info: { label: 'Woman for scale — clay mannequin', tris: geo.index.count / 3 + 4, filesKB: 0,
      notes: 'Artist\'s-mannequin woman, 1.60 m, head 1/7.5, relaxed contrapposto, seamless hips and shoulders, built in code (no files), with a 160 cm marker; dims when in front of the table.' }
  };
}
