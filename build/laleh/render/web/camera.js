// Camera model shared by the renderer (browser) and render.mjs (node). Pure math, no three.js.
// World: X right, Y up, Z toward the viewer, floor Y = 0. The camera sits at (0, h, 0), looks
// down -Z, pitched DOWN by `pitch`, no roll, principal point at the image centre — exactly the
// pinhole model in ../../src/room-view.js (camFor / proj / unproj).
export const DEG = Math.PI / 180;

export function sceneConfig(room) {
  const W = room.output.width, H = room.output.height;
  const { height: h, pitchDeg, vfovDeg } = room.camera;
  const fpx = (H / 2) / Math.tan(vfovDeg * DEG / 2);
  const horizonPx = H / 2 - fpx * Math.tan(pitchDeg * DEG);
  return {
    id: room.id,
    f: fpx / W,
    hz: horizonPx / H,
    h,
    ref: [W, H],
    rugWorld: { x: room.rug.x, z: room.rug.z, yawDeg: room.rug.yawDeg || 0 },
  };
}

// Corners of a w x l (cm) rug centred at (x, z) and turned by yawDeg, using the tool's convention:
// local x -> (cos, -sin), local z -> (sin, cos); width along local x, length along local z.
export function rugCorners(rug, wCm = 200, lCm = 290) {
  const c = Math.cos((rug.yawDeg || 0) * DEG), s = Math.sin((rug.yawDeg || 0) * DEG);
  const hw = wCm / 200, hl = lCm / 200;
  return [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]].map(([a, b]) => [rug.x + a * c + b * s, rug.z - a * s + b * c]);
}
