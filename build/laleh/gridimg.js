// Overlay a labelled pixel grid on a room photo, for reading off source coordinates.
const sharp = require('../node_modules/sharp');
const [,, src, out, l, t, w, hgt] = process.argv;
(async () => {
  const m = await sharp(src).metadata(), W = m.width, H = m.height;
  let svg = `<svg width="${W}" height="${H}">`;
  for (let x = 0; x <= W; x += 100) svg += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="red" opacity=".55"/><text x="${x + 3}" y="${+t + 24}" font-size="20" fill="red">${x}</text>`;
  for (let y = 0; y <= H; y += 50) svg += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="blue" opacity=".45"/><text x="${+l + 3}" y="${y - 3}" font-size="18" fill="blue">${y}</text>`;
  svg += '</svg>';
  const full = await sharp(src).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
  await sharp(full).extract({ left: +l, top: +t, width: Math.min(+w, W - l), height: Math.min(+hgt, H - t) }).toFile(out);
  console.log(W, H);
})();
