// Make the phone (portrait) version of a room: same furniture, room pushed 1 m further from the
// camera and the camera tilted to keep the rug centred, so a whole 200x290 rug fits a phone screen.
//   node portrait.mjs rooms/<id>.json  ->  rooms/<id>-p.json
import fs from 'node:fs';
const src = process.argv[2], r = JSON.parse(fs.readFileSync(src, 'utf8'));
const dz = -1.0, p = structuredClone(r);
p.id = r.id + '-p';
p.output = { width: 1350, height: 1690 };
p.rug.z += dz;
p.camera = { height: r.camera.height, vfovDeg: 54, pitchDeg: +(Math.atan(r.camera.height / (-p.rug.z - 0.25)) * 180 / Math.PI).toFixed(2) };
p.room.floor.z = [r.room.floor.z[0] + dz, r.room.floor.z[1]];
for (const o of p.room.openings || []) if (o.wall === 'left' || o.wall === 'right') o.center += dz;
for (const f of p.furniture || []) if (f.position) f.position = [f.position[0], +(f.position[1] + dz).toFixed(3)];
fs.writeFileSync(src.replace(/\.json$/, '-p.json'), JSON.stringify(p, null, 1));
console.log(p.id, 'pitch', p.camera.pitchDeg, 'rug z', p.rug.z);
