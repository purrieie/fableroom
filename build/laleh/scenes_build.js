// Turn rendered rooms into room-view scenes.
//   node scenes_build.js            -> reads render/rooms.order.json, writes assets/room-<id>{,-thumb,-mask,-shade}.* and scenes/rendered.json
// rooms.order.json: [{ "id": "living", "label": "Living room", "kind": "living" }, ...] (render outputs in render/out/<id>/)
const sharp = require('../node_modules/sharp');
const fs = require('fs'), path = require('path');
const H = __dirname, OUT = path.join(H, 'assets');
const order = JSON.parse(fs.readFileSync(path.join(H, 'render/rooms.order.json'), 'utf8'));
(async () => {
  const scenes = [];
  async function variant(id, withThumb) {
    const dir = path.join(H, 'render/out', id), sc = JSON.parse(fs.readFileSync(path.join(dir, 'scene.json'), 'utf8'));
    const W = Math.min(1800, sc.ref[0]);
    await sharp(path.join(dir, 'beauty.png')).resize(W).webp({ quality: 80, effort: 6 }).toFile(path.join(OUT, `room-${id}.webp`));
    if (withThumb) await sharp(path.join(dir, 'beauty.png')).resize(240, 160, { fit: 'cover' }).webp({ quality: 72 }).toFile(path.join(OUT, `room-${id}-thumb.webp`));
    // mask/shade only need to be smooth, not sharp: 1024 wide keeps them small
    await sharp(path.join(dir, 'mask.png')).resize(1024).greyscale().png({ compressionLevel: 9, palette: true, colours: 32 }).toFile(path.join(OUT, `room-${id}-mask.png`));
    // the shade pass carries path-tracing grain; it only has to be smooth light and shadow
    await sharp(path.join(dir, 'shade.png')).resize(1024).greyscale().blur(1.6).webp({ quality: 85 }).toFile(path.join(OUT, `room-${id}-shade.webp`));
    const kb = f => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0);
    console.log(id.padEnd(12), `img ${kb(`room-${id}.webp`)}KB  mask ${kb(`room-${id}-mask.png`)}KB  shade ${kb(`room-${id}-shade.webp`)}KB`);
    return { img: `room-${id}.webp`, maskImg: `room-${id}-mask.png`, shadeImg: `room-${id}-shade.webp`,
      f: +sc.f.toFixed(5), hz: +sc.hz.toFixed(5), h: +sc.h.toFixed(4), ref: sc.ref, rugWorld: sc.rugWorld };
  }
  const prev = fs.existsSync(path.join(H, 'scenes/rendered.json')) ? JSON.parse(fs.readFileSync(path.join(H, 'scenes/rendered.json'), 'utf8')) : [];
  for (const r of order) {
    // --keep <id>: reuse the assets already built for that room (its raw render was overwritten)
    const keep = process.argv.includes('--keep') && process.argv.slice(process.argv.indexOf('--keep') + 1)[0].split(',').includes(r.id);
    if (keep) { scenes.push(prev.find(p => p.id === r.id)); console.log(r.id.padEnd(12), 'kept'); continue; }
    const land = await variant(r.id, true);
    const scene = Object.assign({ id: r.id, label: r.label, kind: r.kind, thumb: `room-${r.id}-thumb.webp`, size: r.size == null ? 2 : r.size, mzoom: 1 }, land);
    if (fs.existsSync(path.join(H, 'render/out', r.id + '-p', 'beauty.png'))) scene.portrait = await variant(r.id + '-p', false);
    scenes.push(scene);
  }
  fs.mkdirSync(path.join(H, 'scenes'), { recursive: true });
  fs.writeFileSync(path.join(H, 'scenes/rendered.json'), JSON.stringify(scenes, null, 1));
  console.log(scenes.length, 'scenes -> scenes/rendered.json');
})();
