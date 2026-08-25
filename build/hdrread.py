"""Minimal Radiance .hdr (RGBE) reader — enough for Poly Haven's files."""
import numpy as np

def read_hdr(path):
    with open(path, 'rb') as f:
        data = f.read()
    # header ends at a blank line, then a resolution line
    pos = 0
    while True:
        nl = data.index(b'\n', pos)
        line = data[pos:nl]
        pos = nl + 1
        if line.strip() == b'':
            break
    nl = data.index(b'\n', pos)
    res = data[pos:nl].split()
    pos = nl + 1
    assert res[0] == b'-Y' and res[2] == b'+X', res
    H, W = int(res[1]), int(res[3])

    out = np.zeros((H, W, 4), dtype=np.uint8)
    buf = memoryview(data)
    for y in range(H):
        if buf[pos] == 2 and buf[pos + 1] == 2 and (buf[pos + 2] << 8 | buf[pos + 3]) == W:
            pos += 4                                   # new-style RLE scanline
            for c in range(4):
                x = 0
                while x < W:
                    n = buf[pos]; pos += 1
                    if n > 128:                        # a run
                        out[y, x:x + n - 128, c] = buf[pos]; pos += 1
                        x += n - 128
                    else:                              # a literal span
                        out[y, x:x + n, c] = np.frombuffer(data, np.uint8, n, pos)
                        pos += n
                        x += n
        else:                                          # flat scanline
            out[y] = np.frombuffer(data, np.uint8, W * 4, pos).reshape(W, 4)
            pos += W * 4

    e = out[..., 3].astype(np.int32)
    scale = np.where(e == 0, 0.0, np.ldexp(1.0, e - 136)).astype(np.float32)
    rgb = out[..., :3].astype(np.float32) * scale[..., None]
    return rgb
