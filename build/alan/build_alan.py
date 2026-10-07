"""Assemble fableroom-repo/alan/index.html from the Belgrave page.

Belgrave's <head> + stylesheet and its glue script are reused; Alan swaps in
its own body markup (alan-body.html), extra CSS (alan.css), the engine bundle
from shopify/ and its own hotspots / realSize / model bytes.
"""
import json, os, re, html

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))   # this file lives in build/alan/
bg = open(os.path.join(REPO, 'belgrave/index.html')).read()

# --- split Belgrave: head(+css) | body markup | bundle | glue ---
b0 = bg.index('<script>\n(()=>{')
b1 = bg.index('</script>', b0) + len('</script>')
head_and_body, glue = bg[:b0], bg[b1:]
head = head_and_body[:head_and_body.index('</style>')]

head = head.replace(
    '<title>Belgrave Wooden Dining Table | Timeless Modern Dining Style – FABLEROOM</title>',
    '<title>Alan Mango Wood Coffee Table | Handcrafted Modern Elegance – FABLEROOM</title>')
head = re.sub(r'<meta name="description" content="[^"]*">',
    '<meta name="description" content="Elevate your living room with the Alan mango wood coffee table, '
    'handcrafted from solid wood with timeless craftsmanship, durability and modern natural style.">', head)
head = head.replace('FABLEROOM — Belgrave Wooden Dining Table', 'FABLEROOM — Alan Mango Wood Coffee Table')
assert 'Alan Mango Wood Coffee Table | Handcrafted' in head

css = open(os.path.join(HERE, 'alan.css')).read()

# --- body, with the 20 "You May Also Like" cards from the live capture ---
cards = json.load(open(os.path.join(HERE, 'cards.json')))['cards']
rows = []
for c in cards:
    img = c['img']
    img = ('https:' + img) if img.startswith('//') else img
    img = re.sub(r'_(360x|204x103)\.', '_460x.', img)
    parts = [p.strip() for p in c['text'].split('|')]
    name = parts[0]
    prices = [p for p in parts if p.startswith('£')]
    off = [p for p in parts if p.endswith('Off')]
    new = any(p.startswith('New Arrivals') for p in parts)
    price = '<b>%s</b>' % html.escape(prices[0])
    if len(prices) > 1:
        price += '<s>%s</s>' % html.escape(prices[1])
    badges = ''.join('<span class="card__off">%s</span>' % html.escape(o) for o in off)
    if new:
        badges += '<span class="card__off">New Arrivals</span>'
    rows.append(
        '        <article class="card"><div class="card__img"><img src="%s" alt="%s" width="460" height="460" loading="lazy"></div>'
        '<div class="card__t">%s</div><div class="card__p">%s</div>%s</article>'
        % (html.escape(img), html.escape(name), html.escape(name), price,
           ('<div class="card__badges">%s</div>' % badges) if badges else ''))
body = open(os.path.join(HERE, 'alan-body.html')).read().replace('%%YMAL%%', '\n'.join(rows))
assert body.count('class="card"') == 20

# --- engine: the committed Shopify bundle (built from build/src/viewer.js) ---
# FR3D_LAB=1 builds the scene-lab variant instead (alan-scenes/index.html): a
# bundle with the scene-context modules, plus the lab panel and controller.
LAB = os.environ.get('FR3D_LAB') == '1'
LABDIR = os.path.join(REPO, 'build', 'alan-scenes')
bundle_path = os.path.join(LABDIR, 'lab.bundle.js') if LAB else os.path.join(REPO, 'shopify/belgrave-hero.bundle.js')
bundle = open(bundle_path).read().strip()
if LAB:
    css += open(os.path.join(LABDIR, 'lab.css')).read()
    _crumb_end = body.index('</nav>', body.index('class="crumb"')) + len('</nav>')
    body = body[:_crumb_end] + '\n' + open(os.path.join(LABDIR, 'lab-panel.html')).read() + body[_crumb_end:]
    _c = '<canvas id="glc"></canvas>'
    assert body.count(_c) == 1
    body = body.replace(_c, '<div class="bdrop" id="bdrop" aria-hidden="true"></div>\n        ' + _c)
    _d = '<button class="act" id="dimBtn">'
    assert body.count(_d) == 1
    body = body.replace(_d, '<button class="act" id="roomBtn" aria-pressed="false"><svg viewBox="0 0 24 24"><path d="M4 11V8.5A2.5 2.5 0 0 1 6.5 6h11A2.5 2.5 0 0 1 20 8.5V11"/><path d="M3 11.5a1.5 1.5 0 0 1 3 0V14h12v-2.5a1.5 1.5 0 0 1 3 0V17H3Z"/><path d="M5 17v2M19 17v2"/></svg><span>Room</span></button>\n            ' + _d)

# --- glue: Belgrave's, with Alan's model, size and hotspots ---
model_bytes = os.path.getsize(os.path.join(REPO, 'alan/model.glb'))
glue = glue.replace(
    "modelUrl:'model.glb', modelBytes:912332,\n    realSize:[1.20, 0.76, 1.20]        // the Belgrave's real metres: 120cm dia, 76cm high",
    "modelUrl:'model.glb', modelBytes:%d,\n    realSize:[0.80, 0.35, 0.80]        // the Alan's real metres: 80cm across, 35cm high" % model_bytes)
assert "realSize:[0.80, 0.35, 0.80]" in glue

# Wide, low table: at the engine's default framing the drum runs into the hour
# rail and the zoom column. framePad pulls the home camera out; hotspot close-ups
# are relative to the home distance, so they are divided by the same factor.
FRAME_PAD = 1.3
glue = glue.replace("realSize:[0.80, 0.35, 0.80]", "framePad:%s, realSize:[0.80, 0.35, 0.80]" % FRAME_PAD)
glue = glue.replace('[belgrave]', '[alan]')
# No HD file for Alan: the supplied model is the best source there is, so a
# "Load HD" button would reload the same file. Remove it when data-hd-url is absent.
_h = "hdDone = false;"
assert glue.count(_h) == 1
glue = glue.replace(_h, _h + "\n  if (!hdUrl) hdBtn.parentNode.removeChild(hdBtn);")
# Size overlay: the Alan is wide and low, so its height line lands on the zoom
# column at every width. Hide the column while Size is on (HANDOFF section 5);
# visibility:hidden as well as opacity, or the buttons stay keyboard-focusable.
_d = "viewer.setDimensions(on); dimBtn.classList.toggle('on', on);"
assert glue.count(_d) == 1
glue = glue.replace(_d, _d + " stage.classList.toggle('is-dims', on);")

hs_start = glue.index('  /* ---- hotspots')
hs_end = glue.index('  var hsLayer=')
_hs = open(os.path.join(HERE, 'alan-hotspots.js')).read()
_hs = re.sub(r'dist:([0-9.]+)', lambda m: 'dist:%.2f' % (float(m.group(1)) / FRAME_PAD), _hs)
glue = glue[:hs_start] + _hs + glue[hs_end:]

# tab switcher for "Priced with honesty" (the live page has two tabs)
tabs_js = """
<script>
(function(){
  var t1=document.getElementById('tCompare'), t2=document.getElementById('tPriced'),
      p1=document.getElementById('tabCompare'), p2=document.getElementById('tabPriced');
  function sel(a){ t1.setAttribute('aria-selected',String(a)); t2.setAttribute('aria-selected',String(!a));
    p1.hidden=!a; p2.hidden=a; }
  t1.addEventListener('click',function(){sel(true);}); t2.addEventListener('click',function(){sel(false);});
})();
</script>
"""
glue = glue.replace('</body>', tabs_js + '</body>')

if LAB:
    # Hotspot close-ups keep their framing while a scene widens the camera.
    _f = "viewer.flyTo(h.view, REDUCED?10:900);"
    assert glue.count(_f) == 1, 'flyTo anchor'
    glue = glue.replace(_f, "viewer.flyTo(Object.assign({}, h.view, {dist: h.view.dist * viewer.productDistRatio()}), REDUCED?10:900);")
    glue = glue.replace('</body>', '<script>\n' + open(os.path.join(LABDIR, 'lab.js')).read() + '\n</script>\n</body>')
    head = head.replace('<title>Alan Mango Wood Coffee Table | Handcrafted Modern Elegance – FABLEROOM</title>',
                        '<title>Scene lab — Alan Mango Wood Coffee Table</title>')

out = head + css + '</style>\n</head>\n' + body + '\n<script>\n' + bundle + '\n</script>' + glue
dst = os.path.join(REPO, 'alan-scenes/index.html' if LAB else 'alan/index.html')
open(dst, 'w').write(out)
print('wrote', dst, len(out), 'bytes; model', model_bytes)
