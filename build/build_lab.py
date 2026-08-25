import base64, json, os, re, html
from PIL import Image
import numpy as np

W = os.path.dirname(os.path.abspath(__file__))
def P(*a): return os.path.join(W, *a)

def data_uri(path, mime=None):
    ext = os.path.splitext(path)[1].lower()
    mime = mime or {'.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'}[ext]
    return 'data:%s;base64,%s' % (mime, base64.b64encode(open(path,'rb').read()).decode())

# ---------------------------------------------------------------- cutout
def make_cutout(src, out, width, quality=82):
    im = Image.open(src).convert('RGB')
    a = np.asarray(im).astype(np.int16)
    # background = modal colour sampled from the corners
    corners = np.concatenate([a[:40,:40].reshape(-1,3), a[:40,-40:].reshape(-1,3),
                              a[-40:,:40].reshape(-1,3), a[-40:,-40:].reshape(-1,3)])
    bg = np.median(corners, axis=0)
    dist = np.linalg.norm(a - bg, axis=-1)
    alpha = np.clip((dist - 10) / 22.0, 0, 1)          # soft edge
    rgba = np.dstack([np.asarray(im), (alpha*255).astype(np.uint8)])
    out_im = Image.fromarray(rgba, 'RGBA')
    # trim to content
    bbox = out_im.getchannel('A').point(lambda v: 255 if v > 12 else 0).getbbox()
    if bbox: out_im = out_im.crop(bbox)
    h = int(out_im.height * width / out_im.width)
    out_im = out_im.resize((width, h), Image.LANCZOS)
    out_im.save(out, 'WEBP', quality=quality, method=6)
    return out, out_im.size

cut, cut_size = make_cutout(P('img','p01.png'), P('img','hero_cut.webp'), 760, 84)
print('hero cutout', cut_size, os.path.getsize(cut))

# ---------------------------------------------------------------- gallery
GAL_ALT = [
 'Belgrave Wooden Dining Table styled in a bright dining room',
 'Belgrave Wooden Dining Table, front view',
 'Belgrave Wooden Dining Table, three-quarter view',
 'Close-up of the walnut tabletop edge and fluted base',
 'Close-up of the tabletop and the top tier of the fluted pedestal',
 'Detail of the three-tier fluted pedestal base',
 'Close-up of the mango wood grain on the tabletop',
 'Top-down view of the round tabletop',
 'Dimensions: 120 cm diameter, 76 cm high',
 'Scale reference against a 170 cm figure',
]
slides = []
for i in range(10):
    uri = data_uri(P('img', 'p%02d.webp' % i))
    badge = '<span class="gal__badge serif">Summer Sale</span>' if i == 0 else ''
    lazy = '' if i < 2 else ' loading="lazy"'
    slides.append(
      '<div class="gal__slide">%s<img src="%s" alt="%s" width="1100" height="1466"%s></div>'
      % (badge, uri, html.escape(GAL_ALT[i]), lazy))
GALLERY = ''.join(slides)


# ---------------------------------------------------------------- recs
recs = json.load(open(P('recprods.json')))
ORDER = ['noami-grey-upholstered-dining-chair','keaton-cream-upholstered-dining-chair',
         'noami-cream-upholstered-dining-chair','arbor-green-upholstered-dining-chair',
         'arbor-cream-upholstered-dining-chair','keaton-green-upholstered-dining-chair',
         'alder-cream-upholstered-dining-chair','rowan-cream-upholstered-dining-chair']
def money(p): return '£%s' % ('{:,.2f}'.format(p/100))
cards = []
for h_ in ORDER:
    r = recs[h_]
    off = round((1 - r['price']/r['cap'])*100) if r['cap'] else 0
    cards.append(
      '<a class="card" href="#"><img src="%s" alt="%s" width="460" height="613" loading="lazy">'
      '<div class="card__nm">%s</div>'
      '<div class="card__pr"><b>%s</b><s>%s</s></div>'
      '%s</a>'
      % (data_uri(P('img', h_ + '.webp')), html.escape(r['title']), html.escape(r['title']),
         money(r['price']), money(r['cap']),
         ('<span class="card__off">%d%% Off</span>' % off) if off else ''))
RECS = ''.join(cards)

# ---------------------------------------------------------------- faqs
FAQ = [
 ("Is the Belgrave dining table good for small dining spaces?",
  "Yes, its round 120 cm design is ideal for compact dining areas and intimate meals."),
 ("What makes the Belgrave table’s base distinctive?",
  "Its fluted pedestal base adds an elegant architectural detail to the dining room."),
 ("Can four people sit comfortably at the Belgrave table?",
  "Yes, the round tabletop is designed to comfortably seat up to four people."),
 ("What dining styles suit the Belgrave table?",
  "Its walnut finish works beautifully with contemporary, coastal, French, and tropical interiors."),
 ("How should the Belgrave mango wood table be cared for?",
  "Use a soft cloth and protect the surface with coasters, placemats, and trivets."),
 ("Why are pedestal dining tables becoming popular?",
  "A pedestal base creates a clean, open look and gives diners more legroom around the table."),
 ("Does a round dining table make a room feel more inviting?",
  "Yes, its curved shape creates a relaxed atmosphere and makes it easier for everyone to interact."),
 ("Is walnut furniture easy to style?",
  "Yes, walnut tones pair beautifully with cream, beige, white, black, and natural textures."),
 ("What lighting works best above a round dining table?",
  "A pendant or rounded light fixture centred above the table can create a balanced and welcoming focal point."),
 ("Can a round dining table be used for more than meals?",
  "Absolutely. It can provide a practical space for coffee, games, conversations, or casual gatherings."),
]
FAQS = ''.join(
  '<details class="faq"><summary>%s<span class="plus"></span></summary><p>%s</p></details>'
  % (html.escape(q), html.escape(a)) for q, a in FAQ)

FAQ_LD = json.dumps({
  "@context":"https://schema.org","@type":"FAQPage",
  "mainEntity":[{"@type":"Question","name":q,
                 "acceptedAnswer":{"@type":"Answer","text":a}} for q,a in FAQ]
}, ensure_ascii=False)

STAR = ('<i><svg viewBox="0 0 24 24"><path d="m12 3.6 2.6 5.6 6 .7-4.4 4.1 1.2 6-5.4-3-5.4 3 1.2-6L3.4 9.9l6-.7L12 3.6Z"/></svg></i>')
STARS = STAR * 5

SOCIALS = ''.join(
  '<img src="%s" alt="FableRoom on social" width="600" height="600" loading="lazy">' % data_uri(P('img', f))
  for f in ['p00.webp', 'makers.webp', 'p05.webp'])

# ---------------------------------------------------------------- assemble
import subprocess, datetime
try:
    BUILD = subprocess.run(['git', 'rev-parse', '--short', 'HEAD'],
                           cwd='/Users/jaanya/Desktop/Troopod/fableroom-site',
                           capture_output=True, text=True).stdout.strip() or 'local'
except Exception:
    BUILD = 'local'
BUILD = '%s-%s' % (datetime.datetime.now().strftime('%d%b').lower(), BUILD)

tpl = open(P('template-lab.html'), encoding='utf-8').read()

repl = {
  '__LOGO__'            : data_uri(P('img','logo.png')),
  '__IMG_PLACEHOLDER__' : data_uri(P('img','hero_cut.webp')),
  '__BUILD_ID__'        : BUILD,
  '__GALLERY_SLIDES__'  : GALLERY,
  '__IMG_FBT_TABLE__'   : data_uri(P('img','p01.webp')),
  '__IMG_FBT_NOAMI__'   : data_uri(P('img','noami-grey-upholstered-dining-chair.webp')),
  '__IMG_FBT_KEATON__'  : data_uri(P('img','keaton-cream-upholstered-dining-chair.webp')),
  '__IMG_TRUSTPILOT__'  : data_uri(P('img','trustpilot.png')),
  '__REC_CARDS__'       : RECS,
  '__IMG_MAKERS__'      : data_uri(P('img','makers.webp')),
  '__STARS__'           : STARS,
  '__FAQS__'            : FAQS,
  '__SOCIALS__'         : SOCIALS,
  '__VIEWER_JS__'       : open(P('dist','viewer.min.js'), encoding='utf-8').read(),
}
big = ('__VIEWER_JS__',)
for k, v in repl.items():
    if k not in tpl: raise SystemExit('missing placeholder: ' + k)
    if k in big: continue
    tpl = tpl.replace(k, v)

leftover = set(re.findall(r'__[A-Z0-9_]+__', tpl)) - set(big)
if leftover: raise SystemExit('unreplaced: %s' % leftover)

for k in big:
    tpl = tpl.replace(k, repl[k])

PRODUCT_LD = json.dumps({
  "@context":"https://schema.org","@type":"Product",
  "name":"Belgrave Wooden Dining Table","sku":"TRDT00003A","brand":{"@type":"Brand","name":"FABLEROOM"},
  "description":"A round mango wood dining table with a fluted pedestal base and a refined walnut finish. Seats 4. 120 cm diameter, 76 cm high.",
  "material":"Mango Wood","color":"Warm Wood","width":{"@type":"QuantitativeValue","value":120,"unitCode":"CMT"},
  "height":{"@type":"QuantitativeValue","value":76,"unitCode":"CMT"},
  "weight":{"@type":"QuantitativeValue","value":42.5,"unitCode":"KGM"},
  "offers":{"@type":"Offer","price":"438.00","priceCurrency":"GBP","availability":"https://schema.org/InStock"}
}, ensure_ascii=False)

tpl = tpl.replace('</head>',
  '<script type="application/ld+json">%s</script>\n'
  '<script type="application/ld+json">%s</script>\n</head>' % (PRODUCT_LD, FAQ_LD))

out = P('belgrave-lab.html')
open(out, 'w', encoding='utf-8').write(tpl)
print('WROTE %s  %.2f MB' % (out, os.path.getsize(out)/1e6))
