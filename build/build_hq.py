"""Build the high-quality table: the scan's own mesh and its own 8192 base
colour, untouched. Only the container changes - JPEG to WebP, and meshopt for
transfer. No resampling of the base colour, no colour grading."""
import struct, json, os, sys
from PIL import Image
Image.MAX_IMAGE_PIXELS = None

def read_glb(p):
    d=open(p,'rb').read(); off=12; ch=[]
    while off < len(d):
        cl,ct=struct.unpack('<II',d[off:off+8]); ch.append((ct,off+8,cl)); off+=8+cl
    return json.loads(d[ch[0][1]:ch[0][1]+ch[0][2]]), bytearray(d[ch[1][1]:ch[1][1]+ch[1][2]])

def write_glb(p,j,b):
    js=json.dumps(j,separators=(',',':')).encode(); js+=b' '*((4-len(js)%4)%4)
    bn=bytes(b)+b'\x00'*((4-len(b)%4)%4)
    with open(p,'wb') as f:
        f.write(struct.pack('<III',0x46546C67,2,12+8+len(js)+8+len(bn)))
        f.write(struct.pack('<II',len(js),0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II',len(bn),0x004E4942)); f.write(bn)

def repack(j,BIN,imgs):
    img_bvs={im['bufferView'] for im in j['images'] if 'bufferView' in im}
    keep=bytearray(); nbv=[]; remap={}
    for i,bv in enumerate(j['bufferViews']):
        if i in img_bvs: continue
        o,ln=bv.get('byteOffset',0),bv['byteLength']
        while len(keep)%4: keep.append(0)
        n=dict(bv); n['byteOffset']=len(keep); keep+=BIN[o:o+ln]
        remap[i]=len(nbv); nbv.append(n)
    for a in j['accessors']:
        if 'bufferView' in a: a['bufferView']=remap[a['bufferView']]
    j['images']=[]
    for data in imgs:
        while len(keep)%4: keep.append(0)
        nbv.append({'buffer':0,'byteOffset':len(keep),'byteLength':len(data)}); keep+=data
        j['images'].append({'bufferView':len(nbv)-1,'mimeType':'image/webp'})
    j['bufferViews']=nbv; j['buffers']=[{'byteLength':len(keep)}]
    j['textures']=[{'sampler':0,'extensions':{'EXT_texture_webp':{'source':i}}} for i in range(len(imgs))]
    j['samplers']=[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}]
    j['extensionsUsed']=['EXT_texture_webp']; j['extensionsRequired']=['EXT_texture_webp']
    return keep

BASE_PX = int(sys.argv[1]) if len(sys.argv)>1 else 8192
MR_PX   = int(sys.argv[2]) if len(sys.argv)>2 else 4096
OUT     = sys.argv[3] if len(sys.argv)>3 else 'pre_hq.glb'

base = Image.open('tex1.jpg').convert('RGB')
mr   = Image.open('tex0.jpg').convert('RGB')
print('source base', base.size, ' mr', mr.size)

def webp(im, size, q, name):
    p=f'{name}_{size}.webp'
    if im.size[0] != size: im = im.resize((size,size), Image.LANCZOS)
    im.save(p,'WEBP',quality=q,method=5)
    print(' ', p, os.path.getsize(p))
    return open(p,'rb').read()

b = webp(base, BASE_PX, 92, 'hqbase')     # native 8192 -> no resample at all
m = webp(mr,   MR_PX,   92, 'hqmr')

j,B = read_glb('w.glb')
keep = repack(j,B,[m,b])
j['materials']=[{'name':'product','doubleSided':True,'pbrMetallicRoughness':{
    'baseColorTexture':{'index':1,'texCoord':0},
    'metallicRoughnessTexture':{'index':0,'texCoord':0},
    'metallicFactor':1.0,'roughnessFactor':1.0}}]   # exactly as the scan shipped
for mesh in j['meshes']:
    for p in mesh['primitives']: p['material']=0
write_glb(OUT,j,keep)
print(OUT, os.path.getsize(OUT))
