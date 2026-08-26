"""Compare a render against the product photo on the wood itself.

Masks out the flat backdrop in both, then reports mean Lab plus luminance
spread, so 'is it the right brown' and 'does it have the right contrast' are
separate numbers instead of one impression.
"""
import sys, numpy as np
from PIL import Image

def srgb_to_lab(a):
    a = a.astype(np.float32)/255.0
    m = a > 0.04045
    lin = np.where(m, ((a+0.055)/1.055)**2.4, a/12.92)
    M = np.array([[0.4124,0.3576,0.1805],[0.2126,0.7152,0.0722],[0.0193,0.1192,0.9505]],np.float32)
    xyz = lin @ M.T
    wp = np.array([0.95047,1.0,1.08883],np.float32)
    t = xyz/wp
    d = 6/29
    f = np.where(t > d**3, np.cbrt(t), t/(3*d*d)+4/29)
    L = 116*f[...,1]-16; A = 500*(f[...,0]-f[...,1]); B = 200*(f[...,1]-f[...,2])
    return np.stack([L,A,B],-1)

def stats(path, crop=None):
    im = Image.open(path).convert('RGB')
    if crop: im = im.crop(crop)
    a = np.asarray(im)
    # backdrop = median of the four corner patches; both images are flat-backed
    k = 14
    corners = np.concatenate([a[:k,:k].reshape(-1,3), a[:k,-k:].reshape(-1,3),
                              a[-k:,:k].reshape(-1,3), a[-k:,-k:].reshape(-1,3)])
    bg = np.median(corners,0)
    d = np.abs(a.astype(np.int16)-bg.astype(np.int16)).sum(-1)
    mask = d > 60
    if mask.sum() < 500: return None
    lab = srgb_to_lab(a[mask])
    L = lab[...,0]
    return dict(n=int(mask.sum()), L=float(L.mean()), a=float(lab[...,1].mean()),
                b=float(lab[...,2].mean()), p10=float(np.percentile(L,10)),
                p50=float(np.percentile(L,50)), p90=float(np.percentile(L,90)),
                spread=float(np.percentile(L,90)-np.percentile(L,10)),
                bg=[int(x) for x in bg])

REF = stats('img/p01.png', (140,120,1260,900))
print('REFERENCE      L=%.1f a=%.1f b=%.1f  spread=%.1f (p10 %.1f / p90 %.1f)  bg=%s'
      % (REF['L'],REF['a'],REF['b'],REF['spread'],REF['p10'],REF['p90'],REF['bg']))
print()
rows=[]
for name in sys.argv[1:]:
    s = stats('shots/L_%s.png'%name, (100,150,600,560))
    if not s: print(name,'no wood found'); continue
    dE = ((s['L']-REF['L'])**2 + (s['a']-REF['a'])**2 + (s['b']-REF['b'])**2)**0.5
    dS = s['spread']-REF['spread']
    rows.append((dE,abs(dS),name,s))
    print('%-16s L=%5.1f a=%5.1f b=%5.1f  spread=%5.1f | dE=%5.1f  dSpread=%+5.1f'
          % (name,s['L'],s['a'],s['b'],s['spread'],dE,dS))
if rows:
    rows.sort(key=lambda r:(r[0]+r[1]*0.6))
    print('\nclosest overall:', ', '.join(r[2] for r in rows[:3]))
