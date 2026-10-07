// Fetch an Unsplash room photo and build its room-view images.
//   node make_room.js <photo-id e.g. photo-1606654810659-8d4282752758> <scene-id e.g. living2>
// -> src/rooms/<scene-id>.jpg (2000 px source, git-ignored), assets/room-<scene-id>.webp (1800 px),
//    assets/room-<scene-id>-thumb.webp (240x160). Prints the source size (use it as the scene's `ref`).
const sharp = require('../node_modules/sharp');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const [,, photo, id] = process.argv;
if (!photo || !id) { console.error('usage: node make_room.js <photo-id> <scene-id>'); process.exit(1); }
const src = path.join(__dirname, 'src/rooms', id + '.jpg');
fs.mkdirSync(path.dirname(src), { recursive: true });
if (!fs.existsSync(src)) execFileSync('curl', ['-sL', `https://images.unsplash.com/${photo}?w=2000&q=82&fm=jpg`, '-o', src]);
(async () => {
  const m = await sharp(src).metadata();
  await sharp(src).resize(1800).webp({ quality: 76, effort: 6 }).toFile(path.join(__dirname, 'assets', `room-${id}.webp`));
  await sharp(src).resize(240, 160, { fit: 'cover' }).webp({ quality: 70 }).toFile(path.join(__dirname, 'assets', `room-${id}-thumb.webp`));
  const kb = f => (fs.statSync(path.join(__dirname, 'assets', f)).size / 1024).toFixed(0) + ' KB';
  console.log(JSON.stringify({ id, photo, ref: [m.width, m.height], src, webp: kb(`room-${id}.webp`), thumb: kb(`room-${id}-thumb.webp`) }));
})();
