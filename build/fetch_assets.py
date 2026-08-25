#!/usr/bin/env python3
"""Re-download the product imagery the page inlines.

The two .glb scans are supplied by hand (Hi3D exports); everything else here
comes from the live Shopify store, so the page can always be rebuilt from
scratch without keeping ~30 MB of source images in the repository.

  ./venv/bin/python fetch_assets.py
"""
import json, os, urllib.request

HANDLE = 'belgrave-wooden-dining-table'
RECS = ['noami-grey-upholstered-dining-chair', 'keaton-cream-upholstered-dining-chair',
        'noami-cream-upholstered-dining-chair', 'arbor-green-upholstered-dining-chair',
        'arbor-cream-upholstered-dining-chair', 'keaton-green-upholstered-dining-chair',
        'alder-cream-upholstered-dining-chair', 'rowan-cream-upholstered-dining-chair']
EXTRA = {
    'logo.png': 'https://fableroom.com/cdn/shop/files/Fableroom_logo_black_1.png?v=1742541696&width=600',
    'trustpilot.png': 'https://fableroom.com/cdn/shop/files/trustpilot-5-stars-9b53_31e8ce9b-fc61-466d-8f06-5788468072dd.png?v=1771510209&width=400',
    'makers_raw.png': 'https://fableroom.com/cdn/shop/files/1_03d43117-fd00-46ec-a83c-0622ee4e31a8.png?v=1764583357&width=1200',
}

os.makedirs('img', exist_ok=True)

def grab(url, path):
    if os.path.exists(path):
        return
    urllib.request.urlretrieve(url, path)
    print('  ', path, os.path.getsize(path))

print('product JSON')
urllib.request.urlretrieve(f'https://fableroom.com/products/{HANDLE}.js', 'product.json')
p = json.load(open('product.json'))

print('gallery')
for n, u in enumerate(p['images']):
    grab('https:' + u + '&width=1400', f'img/p{n:02d}.png')

print('recommendations')
recs = {}
for h in RECS:
    urllib.request.urlretrieve(f'https://fableroom.com/products/{h}.js', f'img/{h}.json')
    d = json.load(open(f'img/{h}.json'))
    recs[h] = {'title': d['title'], 'price': d['price'],
               'cap': d['compare_at_price'] or d['price']}
    grab('https:' + d['images'][0] + '&width=600', f'img/{h}.png')
json.dump(recs, open('recprods.json', 'w'), indent=1)

print('other')
for name, url in EXTRA.items():
    grab(url, 'img/' + name)

print('\nNow run:  ./venv/bin/python build.py')
