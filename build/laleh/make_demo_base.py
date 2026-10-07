"""Turn the saved live Laleh PDP (live/page.html) into a demo base that renders
off-site: <base> to fableroom.com, and every tracker / third-party widget
stripped so the demo never fires FableRoom's analytics, consent banner or chat."""
import re, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(HERE, 'live/page.html')).read()
n0 = len(s)

# 1. resolve relative /cdn/... and /products/... against the real shop
s = s.replace('<head>', '<head>\n<base href="https://fableroom.com/">', 1)

# 2. external third-party scripts out
DROP_SRC = ('personalizer.io', 'shop.app', 'paypal.com', 'klaviyo.com', 'nector.io', 'tawk.to',
            'googletagmanager', 'clarity.ms', 'pandectes', 'trekkie', 'web-pixels', 'shopifycloud/shop-js',
            'shopifycloud/perf-kit', 'judge.me', 'judgeme', 'trustpilot')
def drop_src(m):
    tag = m.group(0)
    return '' if any(d in tag for d in DROP_SRC) else tag
s = re.sub(r'<script[^>]*\bsrc="[^"]*"[^>]*>\s*</script>', drop_src, s)

# 3. inline trackers out (match on content)
DROP_INLINE = ('googletagmanager', "'gtm.start'", 'PANDECTES', 'PandectesSettings', 'klaviyo',
               'wpmLoader', 'ShopifyAnalytics', 'sendBeacon', 'clarity', 'fbq(', 'tawk', 'trekkie',
               'monorail', 'shop_events_listener', 'web-pixels', 'Shopify.analytics')
def drop_inline(m):
    body = m.group(1)
    if 'application/ld+json' in m.group(0)[:80]:
        return m.group(0)
    return '' if any(k in body for k in DROP_INLINE) else m.group(0)
s = re.sub(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', drop_inline, s, flags=re.S)

# 4. GTM noscript iframe, preconnects to trackers
s = re.sub(r'<noscript><iframe[^>]*googletagmanager[^<]*</iframe></noscript>', '', s)

# 5. the theme rewrites the URL on a size change; off-site that throws, so switch it off
s = s.replace('data-update-url="true"', 'data-update-url="false"')

open(os.path.join(HERE, 'demo-base.html'), 'w').write(s)
print('demo-base.html', n0, '->', len(s))
