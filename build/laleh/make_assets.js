// Builds every image the room view loads (all fetched only after the shopper taps).
// Rug: the clean top-down product shot (FRRU00175A_3.png), cropped to the rug's
// edges and resampled to power-of-two so WebGL1 can mipmap it.
const sharp = require('../node_modules/sharp');
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'assets');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const CROP = { left: 289, top: 245, width: 1676, height: 2515 }; // measured: edges.js
  const rug = sharp('src/rug-topdown-src.png').removeAlpha().extract(CROP);
  // three levels: sm paints at once, md is the working texture, hd only when the rug fills the screen or on Save
  await rug.clone().resize(256, 512, { fit: 'fill' }).webp({ quality: 80, effort: 6 }).toFile(path.join(OUT, 'laleh-rug-sm.webp'));
  await rug.clone().resize(512, 1024, { fit: 'fill', kernel: 'lanczos3' }).webp({ quality: 80, effort: 6 }).toFile(path.join(OUT, 'laleh-rug-md.webp'));
  await rug.clone().resize(1024, 2048, { fit: 'fill', kernel: 'lanczos3' }).webp({ quality: 75, effort: 6 }).toFile(path.join(OUT, 'laleh-rug-hd.webp'));
  // border colour, for the rug's side faces
  const { data } = await sharp('src/rug-topdown-src.png').removeAlpha().extract({ left: 300, top: 260, width: 40, height: 1200 }).raw().toBuffer({ resolveWithObject: true });
  let s = [0, 0, 0]; for (let i = 0; i < data.length; i += 3) { s[0] += data[i]; s[1] += data[i + 1]; s[2] += data[i + 2]; }
  console.log('edge rgb', s.map(v => Math.round(v / (data.length / 3))).join(','));
  for (const r of ['living', 'lounge', 'bedroom']) {
    await sharp(`src/rooms/${r}.jpg`).resize(1800).webp({ quality: 76, effort: 6 }).toFile(path.join(OUT, `room-${r}.webp`));
    await sharp(`src/rooms/${r}.jpg`).resize(240, 160, { fit: 'cover' }).webp({ quality: 70 }).toFile(path.join(OUT, `room-${r}-thumb.webp`));
  }
  for (const f of fs.readdirSync(OUT)) console.log(f.padEnd(26), (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(1) + ' KB');
})();
