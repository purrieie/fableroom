// Poly Haven asset cache (CC0). Everything lands in render/assets/polyhaven/<id>/<res>/ and is
// reused on later runs; nothing is re-downloaded once present.
import fs from 'node:fs';
import path from 'node:path';

const API = 'https://api.polyhaven.com';
export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PH = path.join(ROOT, 'assets', 'polyhaven');

async function getJSON(url, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status + ' ' + url);
      return await r.json();
    } catch (e) { if (i >= tries) throw e; await new Promise(r => setTimeout(r, 800 * (i + 1))); }
  }
}
async function download(url, dest, tries = 4) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status + ' ' + url);
      const buf = Buffer.from(await r.arrayBuffer());
      fs.writeFileSync(dest + '.part', buf); fs.renameSync(dest + '.part', dest);
      return true;
    } catch (e) { if (i >= tries) throw e; await new Promise(r => setTimeout(r, 800 * (i + 1))); }
  }
}
function pickRes(avail, want) {
  const order = ['1k', '2k', '4k', '8k'];
  if (avail[want]) return want;
  const i = order.indexOf(want);
  for (let d = 1; d < 4; d++) for (const j of [i - d, i + d]) if (order[j] && avail[order[j]]) return order[j];
  return Object.keys(avail)[0];
}
async function info(id) {
  const f = path.join(PH, id, 'info.json');
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  const j = await getJSON(`${API}/info/${id}`);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(j, null, 1));
  return j;
}

/** glTF model -> { url (server path), dims (mm, from Poly Haven) } */
export async function model(id, res = '1k') {
  const files = await getJSON(`${API}/files/${id}`);
  const r = pickRes(files.gltf, res);
  const g = files.gltf[r].gltf;
  const dir = path.join(PH, id, r);
  const main = path.join(dir, path.basename(new URL(g.url).pathname));
  let n = 0;
  n += await download(g.url, main);
  for (const [rel, f] of Object.entries(g.include || {})) n += await download(f.url, path.join(dir, rel));
  if (n) console.log(`  polyhaven model ${id} @${r}: ${n} file(s) downloaded`);
  const inf = await info(id);
  return { url: '/r/' + path.relative(ROOT, main), dims: inf.dimensions || null };
}

/** PBR texture set -> { maps: {diff, nor, rough, arm, ...}: server paths, dims: [w_mm, h_mm] } */
export async function texture(id, res = '2k', want = ['Diffuse', 'nor_gl', 'Rough', 'AO']) {
  const files = await getJSON(`${API}/files/${id}`);
  const out = {};
  let n = 0;
  for (const k of want) {
    if (!files[k]) continue;
    const r = pickRes(files[k], res);
    const f = files[k][r].jpg || files[k][r].png;
    const dest = path.join(PH, id, r, path.basename(new URL(f.url).pathname));
    n += await download(f.url, dest);
    out[k] = '/r/' + path.relative(ROOT, dest);
  }
  if (n) console.log(`  polyhaven texture ${id} @${res}: ${n} file(s) downloaded`);
  const inf = await info(id);
  return { maps: out, dims: inf.dimensions || [1000, 1000] };
}

/** HDRI (.hdr) -> server path */
export async function hdri(id, res = '2k') {
  const files = await getJSON(`${API}/files/${id}`);
  const r = pickRes(files.hdri, res);
  const f = files.hdri[r].hdr;
  const dest = path.join(PH, id, r, path.basename(new URL(f.url).pathname));
  if (await download(f.url, dest)) console.log(`  polyhaven hdri ${id} @${r} downloaded`);
  return '/r/' + path.relative(ROOT, dest);
}

/** Walk a room description and resolve every external asset into a manifest the page can load. */
export async function resolveRoom(room) {
  const m = { textures: {}, models: {}, hdri: null };
  const texRefs = new Map();
  const addTex = (mat) => {
    if (!mat || !mat.texture) return;
    const key = mat.texture + '@' + (mat.res || '2k');
    texRefs.set(key, { id: mat.texture, res: mat.res || '2k' });
  };
  addTex(room.room?.floorMaterial);
  addTex(room.room?.wallMaterial);
  addTex(room.room?.exterior?.material);
  for (const it of room.furniture || []) {
    if (it.source === 'polyhaven') {
      const key = it.id + '@' + (it.res || '1k');
      if (!m.models[key]) m.models[key] = await model(it.id, it.res || '1k');
    }
    if (it.source === 'procedural') for (const v of Object.values(it.materials || {})) addTex(v);
    if (it.material) addTex(it.material);
  }
  for (const [key, t] of texRefs) m.textures[key] = await texture(t.id, t.res);
  if (room.lighting?.hdri) m.hdri = await hdri(room.lighting.hdri, room.lighting.hdriRes || '2k');
  return m;
}
