"""Build the Laleh room view: the Shopify drop-in (shopify/laleh/) and the live demo
(laleh/index.html = the saved live PDP with the drop-in installed exactly as a dev would).

  python3 build_laleh.py [demo-asset-base]

demo-asset-base defaults to the GitHub Pages URL; pass http://localhost:8811/... to test
locally. It must be absolute: the demo page carries <base href="https://fableroom.com/">.
"""
import json, os, re, shutil, subprocess, sys, gzip

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
ESBUILD = os.path.join(HERE, '..', 'node_modules', '.bin', 'esbuild')
BASE = sys.argv[1] if len(sys.argv) > 1 else 'https://purrieie.github.io/fableroom/laleh/rv/'
SHOP = os.path.join(REPO, 'shopify', 'laleh')
DEMO = os.path.join(REPO, 'laleh')


def shipped():
    # the rug textures plus every file the default scenes reference
    names = {'laleh-rug-sm.webp', 'laleh-rug-md.webp', 'laleh-rug-hd.webp'}
    r = os.path.join(HERE, 'scenes', 'rendered.json')
    for sc in (json.load(open(r)) if os.path.exists(r) else []):
        for v in (sc, sc.get('portrait') or {}):
            for k in ('img', 'thumb', 'maskImg', 'shadeImg'):
                if v.get(k): names.add(v[k])
    return sorted(names)
ASSETS = shipped()

def esb(src):
    return subprocess.run([ESBUILD, src, '--minify', '--target=es2017', '--legal-comments=none'],
                          check=True, capture_output=True, text=True).stdout.strip()

def br_kb(b):
    try:
        import brotli
        return len(brotli.compress(b, quality=11)) / 1024
    except ImportError:
        return len(gzip.compress(b, 9)) / 1024

# default scenes: the rendered top-view rooms (scenes/rendered.json), injected between /*SCENES*/ and /*END*/
src = open(os.path.join(HERE, 'src', 'room-view.js')).read()
rendered = os.path.join(HERE, 'scenes', 'rendered.json')
if os.path.exists(rendered):
    sc_json = open(rendered).read()
    src = re.sub(r'/\*SCENES\*/.*?/\*END\*/', lambda m: sc_json, src, flags=re.S)
    tmp = os.path.join(HERE, 'src', '.room-view.build.js'); open(tmp, 'w').write(src)
    app = esb(tmp); os.remove(tmp)
else:
    app = esb(os.path.join(HERE, 'src', 'room-view.js'))
loader = esb(os.path.join(HERE, 'src', 'loader.js'))
app_kb = br_kb(app.encode())
snippet = open(os.path.join(HERE, 'src', 'snippet.liquid')).read()
snippet = snippet.replace('%%LOADER%%', loader).replace('%%APP_KB%%', '%.0f' % app_kb).replace('%%ASSET_LIST%%', ','.join(ASSETS))

# ---- Shopify package
os.makedirs(SHOP, exist_ok=True)
for f in os.listdir(SHOP):
    if f.endswith(('.webp', '.png')) and f not in ASSETS: os.remove(os.path.join(SHOP, f))
open(os.path.join(SHOP, 'fableroom-room-view.js'), 'w').write(app + '\n')
open(os.path.join(SHOP, 'fableroom-room-view.liquid'), 'w').write(snippet)
for f in ASSETS:
    shutil.copy(os.path.join(HERE, 'assets', f), os.path.join(SHOP, f))

# ---- Demo: render the snippet's Liquid with the product's real values
prod = json.load(open(os.path.join(HERE, 'live', 'product.json')))
variants = [{'id': v['id'], 'title': v['title'], 'price': v['price'], 'compare_at_price': v['compare_at_price'] or 0,
             'available': v['available']} for v in prod['variants']]
cfg = {
    'appSrc': BASE + 'fableroom-room-view.js',
    'sku': prod['variants'][0]['sku'],
    'gallerySelector': '.media-gallery__viewer',
    'analytics': 'none', 'demo': True,
    'badges': {'200x290 cm': 'Most Popular'},
    'spec': {'name': 'Laleh Rug', 'thicknessMm': 12},
    'product': {'variants': variants},
    'assets': {f: BASE + f for f in ASSETS},
}
static = re.sub(r'\{%-? comment -?%\}.*?\{%-? endcomment -?%\}\n?', '', snippet, flags=re.S)
static = re.sub(r'window\.FRRV_CONFIG = \{.*?\n\};', 'window.FRRV_CONFIG = ' + json.dumps(cfg, separators=(',', ':')) + ';', static, flags=re.S)
assert '{{' not in static and '{%' not in static, 'unrendered liquid left in the demo snippet'

page = open(os.path.join(HERE, 'demo-base.html')).read()
anchor = '</variant-picker>'
assert page.count(anchor) >= 1
page = page.replace(anchor, anchor + '\n<!-- fableroom-room-view snippet -->\n' + static + '\n<!-- /fableroom-room-view -->', 1)
page = page.replace('<title>', '<title>[Demo] ', 1)
os.makedirs(os.path.join(DEMO, 'rv'), exist_ok=True)
for f in os.listdir(os.path.join(DEMO, 'rv')):
    if f.endswith(('.webp', '.png')) and f not in ASSETS: os.remove(os.path.join(DEMO, 'rv', f))
open(os.path.join(DEMO, 'index.html'), 'w').write(page)
open(os.path.join(DEMO, 'rv', 'fableroom-room-view.js'), 'w').write(app + '\n')
for f in ASSETS:
    shutil.copy(os.path.join(HERE, 'assets', f), os.path.join(DEMO, 'rv', f))

# ---- docs: README/TICKET with this build's numbers
perf_md = os.path.join(HERE, 'perf', 'summary.md')
perf = open(perf_md).read() if os.path.exists(perf_md) else '_Not measured for this build._'
for doc in ('README.md', 'TICKET.md'):
    t = open(os.path.join(HERE, 'docs', doc)).read()
    t = t.replace('%%APP_KB%%', '%.0f' % app_kb).replace('%%APP_RAW%%', '%.0f' % (len(app) / 1024)).replace('%%PERF%%', perf)
    open(os.path.join(SHOP, doc), 'w').write(t)

inline = re.search(r'<style>.*?</script>', static, flags=re.S).group(0)
print('app        %6.1f KB raw  %5.1f KB compressed' % (len(app) / 1024, app_kb))
print('loader     %6.1f KB raw (inline)' % (len(loader) / 1024))
print('snippet    %6.1f KB raw  %5.1f KB compressed (all the page pays up front)' % (len(inline) / 1024, br_kb(inline.encode())))
print('assets     ' + ', '.join('%s %.0fKB' % (f, os.path.getsize(os.path.join(HERE, 'assets', f)) / 1024) for f in ASSETS))
print('demo ->', os.path.relpath(os.path.join(DEMO, 'index.html'), REPO), 'base', BASE)
