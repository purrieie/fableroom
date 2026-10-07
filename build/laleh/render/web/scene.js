// Room description (JSON) -> three.js scene. Units: metres. See render.mjs for the field reference.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { BUILDERS, metricUV } from './procedural.js';
import { DEG } from './camera.js';

const texLoader = new THREE.TextureLoader();
const texCache = new Map();
function loadTex(url, srgb) {
  const k = url + (srgb ? '#s' : '#l');
  if (!texCache.has(k)) texCache.set(k, texLoader.loadAsync(url).then(t => {
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  }));
  return texCache.get(k);
}

/* ------------------------------------------------------------- materials */
// spec: { color, roughness, metalness, texture (polyhaven id), res, tileMetres, rotationDeg, useDiffuse,
//         normalScale, sheen, sheenColor, sheenRoughness, clearcoat, clearcoatRoughness, transmission, opacity }
export async function makeMaterial(spec, manifest, defaults = {}) {
  spec = Object.assign({}, defaults, spec || {});
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(spec.color ?? '#ffffff'),
    roughness: spec.roughness ?? 0.8,
    metalness: spec.metalness ?? 0,
  });
  if (spec.sheen) { m.sheen = spec.sheen; m.sheenColor = new THREE.Color(spec.sheenColor ?? '#ffffff'); m.sheenRoughness = spec.sheenRoughness ?? 0.6; }
  if (spec.clearcoat) { m.clearcoat = spec.clearcoat; m.clearcoatRoughness = spec.clearcoatRoughness ?? 0.2; }
  if (spec.specularIntensity != null) m.specularIntensity = spec.specularIntensity;
  if (spec.emissive) { m.emissive = new THREE.Color(spec.emissive); m.emissiveIntensity = spec.emissiveIntensity ?? 1; }
  if (spec.texture) {
    const t = manifest.textures[spec.texture + '@' + (spec.res || '2k')];
    const tileW = spec.tileMetres ?? t.dims[0] / 1000, tileH = spec.tileMetres ? spec.tileMetres * t.dims[1] / t.dims[0] : t.dims[1] / 1000;
    const set = (tex) => { tex = tex.clone(); tex.repeat.set(1 / tileW, 1 / tileH); tex.rotation = (spec.rotationDeg || 0) * DEG; tex.needsUpdate = true; return tex; };
    if (t.maps.Diffuse && spec.useDiffuse !== false) m.map = set(await loadTex(t.maps.Diffuse, true));
    if (t.maps.nor_gl && spec.normalScale !== 0) { m.normalMap = set(await loadTex(t.maps.nor_gl, false)); const s = spec.normalScale ?? 1; m.normalScale.set(s, s); }
    if (t.maps.Rough && spec.useRoughnessMap !== false) { m.roughnessMap = set(await loadTex(t.maps.Rough, false)); m.roughness = spec.roughness ?? 1; }
  }
  m.userData.spec = spec;
  return m;
}

/* ------------------------------------------------------------- geometry utils */
// glTF meshopt / KHR_mesh_quantization data arrives as normalized int16/int8 (often interleaved):
// the path tracer's BVH + attribute packing want plain Float32 attributes.
function toFloat32(geo) {
  for (const name of Object.keys(geo.attributes)) {
    const a = geo.attributes[name];
    if (!a.isInterleavedBufferAttribute && a.array instanceof Float32Array && !a.normalized) continue;
    const n = a.count, k = a.itemSize, arr = new Float32Array(n * k);
    for (let i = 0; i < n; i++) {
      arr[i * k] = a.getX(i);
      if (k > 1) arr[i * k + 1] = a.getY(i);
      if (k > 2) arr[i * k + 2] = a.getZ(i);
      if (k > 3) arr[i * k + 3] = a.getW(i);
    }
    geo.setAttribute(name, new THREE.BufferAttribute(arr, k));
  }
  geo.morphAttributes = {};
  if (!geo.attributes.normal) geo.computeVertexNormals();
  return geo;
}
function prep(root) {
  root.traverse(o => {
    if (!o.isMesh) return;
    o.geometry = toFloat32(o.geometry);
    o.castShadow = o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m.map) m.map.anisotropy = 8;
      if (m.transparent && m.alphaTest === 0 && m.map) { m.alphaTest = 0.5; m.transparent = false; } // cut-out foliage
    }
  });
  return root;
}
function box(w, h, d, mat, x, y, z, name) {
  const geo = metricUV(new THREE.BoxGeometry(w, h, d));
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.name = name || ''; m.castShadow = m.receiveShadow = true;
  return m;
}

/* ------------------------------------------------------------- room shell */
// Wall axis: back/front run along X (at z = z0 / z1), left/right run along Z (at x = x0 / x1).
function wallFrame(side, F, t) {
  const [x0, x1] = F.x, [z0, z1] = F.z;
  switch (side) {
    case 'back': return { a: x0 - t, b: x1 + t, place: (u, v, len, hgt) => [u, v, z0 - t / 2], dims: (len, hgt) => [len, hgt, t], inward: [0, 0, 1] };
    case 'front': return { a: x0 - t, b: x1 + t, place: (u, v) => [u, v, z1 + t / 2], dims: (len, hgt) => [len, hgt, t], inward: [0, 0, -1] };
    case 'left': return { a: z0, b: z1, place: (u, v) => [x0 - t / 2, v, u], dims: (len, hgt) => [t, hgt, len], inward: [1, 0, 0] };
    case 'right': return { a: z0, b: z1, place: (u, v) => [x1 + t / 2, v, u], dims: (len, hgt) => [t, hgt, len], inward: [-1, 0, 0] };
  }
  throw new Error('bad wall ' + side);
}

function buildWall(side, R, mats, group, lights) {
  const F = R.floor, t = R.wallThickness ?? 0.12, H = R.wallHeight ?? 2.7;
  const wf = wallFrame(side, F, t);
  const ops = (R.openings || []).filter(o => o.wall === side).map(o => {
    const sill = o.type === 'door' ? 0 : (o.sill ?? 0.5);
    return { ...o, u0: o.center - o.width / 2, u1: o.center + o.width / 2, v0: sill, v1: Math.min(H, sill + o.height) };
  });
  const us = [...new Set([wf.a, wf.b, ...ops.flatMap(o => [o.u0, o.u1])])].filter(u => u >= wf.a && u <= wf.b).sort((p, q) => p - q);
  for (let i = 0; i < us.length - 1; i++) {
    const ua = us[i], ub = us[i + 1];
    if (ub - ua < 1e-4) continue;
    const cov = ops.filter(o => o.u0 <= ua + 1e-6 && o.u1 >= ub - 1e-6).map(o => [o.v0, o.v1]).sort((p, q) => p[0] - q[0]);
    let v = 0;
    const seg = [];
    for (const [c0, c1] of cov) { if (c0 > v) seg.push([v, c0]); v = Math.max(v, c1); }
    if (v < H) seg.push([v, H]);
    for (const [va, vb] of seg) {
      const [x, y, z] = wf.place((ua + ub) / 2, (va + vb) / 2);
      const [dx, dy, dz] = wf.dims(ub - ua, vb - va);
      group.add(box(dx, dy, dz, mats.wall, x, y, z, 'wall-' + side));
    }
  }
  // skirting along the inner face, broken at doors
  const sk = R.skirting;
  if (sk !== false) {
    const sh = sk?.height ?? 0.08, sd = sk?.depth ?? 0.014;
    let cuts = ops.filter(o => o.type === 'door').map(o => [o.u0, o.u1]).sort((p, q) => p[0] - q[0]);
    const lo = side === 'left' || side === 'right' ? F.z[0] : F.x[0], hi = side === 'left' || side === 'right' ? F.z[1] : F.x[1];
    let u = lo; const runs = [];
    for (const [c0, c1] of cuts) { if (c0 > u) runs.push([u, c0]); u = Math.max(u, c1); }
    if (u < hi) runs.push([u, hi]);
    for (const [ua, ub] of runs) {
      const len = ub - ua, mid = (ua + ub) / 2, inw = wf.inward;
      let x, z, dx, dz;
      if (side === 'back' || side === 'front') { x = mid; z = (side === 'back' ? F.z[0] : F.z[1]) + inw[2] * sd / 2; dx = len; dz = sd; }
      else { z = mid; x = (side === 'left' ? F.x[0] : F.x[1]) + inw[0] * sd / 2; dx = sd; dz = len; }
      group.add(box(dx, sh, dz, mats.skirting, x, sh / 2, z, 'skirting'));
    }
  }
  // window/door frames, sills, portal lights
  for (const o of ops) {
    const fw = o.frameWidth ?? 0.05, fd = o.frameDepth ?? t * 0.55, uc = (o.u0 + o.u1) / 2, vc = (o.v0 + o.v1) / 2;
    const fm = mats.frames;
    const along = side === 'back' || side === 'front';
    const put = (u, v, len, hgt, depth, inset, name) => {
      // inset: offset from wall centre toward the room
      const [x, y, z] = wf.place(u, v);
      const off = inset, iw = wf.inward;
      const [dx, dy, dz] = along ? [len, hgt, depth] : [depth, hgt, len];
      group.add(box(dx, dy, dz, fm, x + iw[0] * off, y, z + iw[2] * off, name));
    };
    if (o.type === 'window') {
      put(uc, o.v0 + fw / 2, o.width, fw, fd, 0, 'frame');            // bottom rail
      put(uc, o.v1 - fw / 2, o.width, fw, fd, 0, 'frame');            // head
      put(o.u0 + fw / 2, vc, fw, o.v1 - o.v0, fd, 0, 'frame');        // jambs
      put(o.u1 - fw / 2, vc, fw, o.v1 - o.v0, fd, 0, 'frame');
      const panes = o.panes ?? (o.width > 1.3 ? 2 : 1);
      for (let k = 1; k < panes; k++) put(o.u0 + (o.width * k) / panes, vc, fw * 0.8, o.v1 - o.v0, fd * 0.8, 0, 'frame');
      if (o.transom) put(uc, o.v0 + (o.v1 - o.v0) * o.transom, o.width, fw * 0.8, fd * 0.8, 0, 'frame');
      // interior sill board
      put(uc, o.v0 - 0.015, o.width + 0.08, 0.03, t / 2 + 0.05, t / 4 + 0.025, 'sill');
      if (o.glass) {
        const [x, y, z] = wf.place(uc, vc);
        const g = new THREE.Mesh(new THREE.PlaneGeometry(o.width, o.v1 - o.v0), mats.glass);
        g.position.set(x, y, z); if (!along) g.rotation.y = Math.PI / 2;
        group.add(g);
      }
    } else if (o.type === 'door') {
      const cw = 0.07, cd = 0.015;   // casing on the room side
      put(o.u0 - cw / 2, o.v1 / 2, cw, o.v1, t + 2 * cd, 0, 'casing');
      put(o.u1 + cw / 2, o.v1 / 2, cw, o.v1, t + 2 * cd, 0, 'casing');
      put(uc, o.v1 + cw / 2, o.width + 2 * cw, cw, t + 2 * cd, 0, 'casing');
      if (o.leaf !== false) put(uc, o.v1 / 2, o.width, o.v1, 0.04, -t / 2 + 0.03, 'door');
    }
    if (o.portal) {
      // a rect light just outside the opening, facing in: daylight through the window, sampled directly
      const L = new THREE.RectAreaLight(new THREE.Color(o.portal.color ?? '#ffffff'), o.portal.intensity ?? 3, o.width, o.v1 - o.v0);
      const [x, y, z] = wf.place(uc, vc), iw = wf.inward, back = t / 2 + 0.02;
      L.position.set(x - iw[0] * back, y, z - iw[2] * back);
      L.lookAt(x + iw[0] * 5, y + (o.portal.tiltDeg ? -Math.tan(o.portal.tiltDeg * DEG) * 5 : 0), z + iw[2] * 5);
      lights.push(L);
    }
  }
}

/* ------------------------------------------------------------- furniture */
const gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

async function loadItem(it, manifest) {
  if (it.source === 'polyhaven') {
    const g = await gltf.loadAsync(manifest.models[it.id + '@' + (it.res || '1k')].url);
    return prep(g.scene);
  }
  if (it.source === 'fableroom') return prep((await gltf.loadAsync('/repo/' + it.file)).scene);
  if (it.source === 'gltf') return prep((await gltf.loadAsync('/r/' + it.file)).scene);
  if (it.source === 'procedural') {
    const mats = {};
    for (const [k, v] of Object.entries(it.materials || {})) mats[k] = await makeMaterial(v, manifest);
    if (!mats.default) mats.default = Object.values(mats)[0] || new THREE.MeshPhysicalMaterial({ color: '#ddd', roughness: 0.8 });
    const b = BUILDERS[it.kind];
    if (!b) throw new Error('unknown procedural kind ' + it.kind);
    const g = b(it.params || {}, mats);
    g.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; if (o.geometry.userData.doubleSided) o.material = Object.assign(o.material.clone(), { side: THREE.DoubleSide }); } });
    return g;
  }
  throw new Error('unknown source ' + it.source);
}

async function applyOverrides(root, it, manifest) {
  if (!it.materialOverrides) return;
  const cache = {};
  root.traverse(o => {
    if (!o.isMesh) return;
    const mm = Array.isArray(o.material) ? o.material : [o.material];
    mm.forEach((m, i) => {
      const spec = it.materialOverrides[m.name] || it.materialOverrides['*'];
      if (!spec) return;
      const nm = m.clone();
      if (spec.color) nm.color = new THREE.Color(spec.color);
      if (spec.tint && nm.color) nm.color.multiply(new THREE.Color(spec.tint));
      if (spec.roughness != null) nm.roughness = spec.roughness;
      if (spec.roughnessScale != null) nm.roughness *= spec.roughnessScale;
      if (spec.dropMap) nm.map = null;
      if (spec.metalness != null) nm.metalness = spec.metalness;
      if (Array.isArray(o.material)) o.material[i] = nm; else o.material = nm;
    });
  });
}

function placeItem(model, it, placed) {
  // size/scale in the model's native orientation (w = X, d = Z, h = Y), then rotate, then sit on y.
  const inner = new THREE.Group(); inner.add(model);
  model.updateMatrixWorld(true);
  let bb = new THREE.Box3().setFromObject(model, true);
  const sz = bb.getSize(new THREE.Vector3());
  let s = new THREE.Vector3(1, 1, 1);
  if (it.size) {
    const r = [];
    if (it.size.w) r.push(['x', it.size.w / sz.x]);
    if (it.size.h) r.push(['y', it.size.h / sz.y]);
    if (it.size.d) r.push(['z', it.size.d / sz.z]);
    if (it.stretch) for (const [k, v] of r) s[k] = v;
    else { const u = r.reduce((a, [, v]) => a + v, 0) / (r.length || 1); s.setScalar(u); }
  }
  if (it.scale) s.multiplyScalar(it.scale);
  model.scale.multiply(s);
  model.updateMatrixWorld(true);
  bb = new THREE.Box3().setFromObject(model, true);
  const c = bb.getCenter(new THREE.Vector3());
  model.position.x -= c.x; model.position.z -= c.z; model.position.y -= bb.min.y;
  const wrap = new THREE.Group(); wrap.add(inner); wrap.name = it.name || it.id || it.kind || 'item';
  inner.rotation.y = (it.rotationYDeg || 0) * DEG;
  let y = it.y || 0;
  if (it.on) {
    const base = placed.get(it.on);
    if (!base) throw new Error(`"on": ${it.on} must be listed before ${wrap.name}`);
    y += new THREE.Box3().setFromObject(base, true).max.y;
  }
  const [x, z] = it.position || [0, 0];
  wrap.position.set(x, y, z);
  wrap.updateMatrixWorld(true);
  const fb = new THREE.Box3().setFromObject(wrap, true);
  wrap.userData.bbox = { min: fb.min.toArray().map(v => +v.toFixed(3)), max: fb.max.toArray().map(v => +v.toFixed(3)) };
  return wrap;
}

/* ------------------------------------------------------------- whole scene */
export async function buildScene(room, manifest) {
  const scene = new THREE.Scene();
  const R = room.room, F = R.floor;
  const mats = {
    floor: await makeMaterial(R.floorMaterial, manifest, { roughness: 0.6 }),
    wall: await makeMaterial(R.wallMaterial, manifest, { color: '#f1efeb', roughness: 0.92 }),
    skirting: await makeMaterial(R.skirting?.material, manifest, { color: '#f4f3f0', roughness: 0.45 }),
    frames: await makeMaterial(R.frameMaterial, manifest, { color: '#f4f4f2', roughness: 0.4 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0, transmission: 1, ior: 1.5, thickness: 0.006, transparent: false }),
  };
  // floor: one quad over the floor rect, UVs in world metres (texture repeat handles plank size)
  const fgeo = new THREE.BufferGeometry();
  const [x0, x1] = F.x, [z0, z1] = F.z;
  fgeo.setAttribute('position', new THREE.Float32BufferAttribute([x0, 0, z0, x1, 0, z0, x0, 0, z1, x1, 0, z1], 3));
  fgeo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  fgeo.setAttribute('uv', new THREE.Float32BufferAttribute([x0, -z0, x1, -z0, x0, -z1, x1, -z1], 2));
  fgeo.setIndex([0, 2, 1, 1, 2, 3]);
  const floor = new THREE.Mesh(fgeo, mats.floor);
  floor.name = 'floor'; floor.userData.isFloor = true; floor.receiveShadow = true;
  scene.add(floor);

  const shell = new THREE.Group(); shell.name = 'shell'; scene.add(shell);
  const lights = [];
  for (const side of R.walls || ['back', 'left', 'right']) buildWall(side, R, mats, shell, lights);
  // a slab under the floor so nothing leaks below the walls
  shell.add(box(x1 - x0 + 1, 0.1, z1 - z0 + 1, mats.wall, (x0 + x1) / 2, -0.0501, (z0 + z1) / 2, 'subfloor'));
  if (R.ceiling) {
    const t = R.wallThickness ?? 0.12, H = R.wallHeight ?? 2.7;
    shell.add(box(x1 - x0 + 2 * t, 0.1, z1 - z0 + 2 * t, mats.wall, (x0 + x1) / 2, H + 0.05, (z0 + z1) / 2, 'ceiling'));
  }
  if (R.exterior) {
    const em = await makeMaterial(R.exterior.material, manifest, { color: '#9aa38f', roughness: 0.95 });
    const g = new THREE.Mesh(metricUV(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2)), em);
    g.position.y = R.exterior.y ?? -0.3; g.name = 'exterior'; shell.add(g);
  }

  // furniture
  const placed = new Map(), info = [];
  for (const it of room.furniture || []) {
    if (it.hidden) continue;
    const model = await loadItem(it, manifest);
    await applyOverrides(model, it, manifest);
    const w = placeItem(model, it, placed);
    placed.set(w.name, w);
    scene.add(w);
    info.push({ name: w.name, bbox: w.userData.bbox });
  }

  // lighting
  const L = room.lighting || {};
  if (L.hdri) {
    const tex = await new HDRLoader().loadAsync(manifest.hdri);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = tex;
    scene.environmentIntensity = L.intensity ?? 1;
    scene.environmentRotation.set(0, (L.rotationDeg || 0) * DEG, 0);
    scene.background = L.background === false ? new THREE.Color(L.backgroundColor || '#ffffff') : tex;
    scene.backgroundRotation.copy(scene.environmentRotation);
    scene.backgroundIntensity = L.backgroundIntensity ?? scene.environmentIntensity;
  } else {
    scene.background = new THREE.Color(L.backgroundColor || '#ffffff');
  }
  if (L.sun) {
    const s = L.sun, az = (s.azimuthDeg ?? 120) * DEG, el = (s.elevationDeg ?? 35) * DEG;
    const d = new THREE.DirectionalLight(new THREE.Color(s.color ?? '#fff3e2'), s.intensity ?? 3);
    // azimuth: 0 = light comes from -Z (behind the room's back wall), 90 = from +X (right)
    d.position.set(Math.sin(az) * Math.cos(el) * 30, Math.sin(el) * 30, -Math.cos(az) * Math.cos(el) * 30);
    d.target.position.set(0, 0, -2.5);
    d.castShadow = true; d.shadow.mapSize.set(4096, 4096);
    Object.assign(d.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 80 });
    d.shadow.bias = -0.0004; d.shadow.normalBias = 0.02;
    scene.add(d, d.target);
  }
  for (const a of L.areaLights || []) {
    const l = new THREE.RectAreaLight(new THREE.Color(a.color ?? '#ffffff'), a.intensity ?? 5, a.width ?? 1, a.height ?? 1);
    l.position.fromArray(a.position); l.lookAt(new THREE.Vector3().fromArray(a.lookAt || [0, 0, -2.5]));
    lights.push(l);
  }
  for (const l of lights) scene.add(l);
  scene.updateMatrixWorld(true);
  return { scene, floor, info };
}
