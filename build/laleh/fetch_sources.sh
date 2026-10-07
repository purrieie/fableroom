#!/bin/zsh
# Re-download the large source images (kept out of git). Then: node make_assets.js
set -e
cd "$(dirname "$0")"
mkdir -p src/rooms live
curl -sL "https://cdn.shopify.com/s/files/1/0884/2690/5937/files/FRRU00175A_3.png" -o src/rug-topdown-src.png   # top-down product shot
curl -sL "https://images.unsplash.com/photo-1606654810659-8d4282752758?w=2000&q=80&fm=jpg" -o src/rooms/living.jpg   # Unsplash licence
curl -sL "https://images.unsplash.com/photo-1713283391486-b92cda2562e8?w=2000&q=80&fm=jpg" -o src/rooms/lounge.jpg
curl -sL "https://images.unsplash.com/photo-1633944095397-878622ebc01c?w=2000&q=80&fm=jpg" -o src/rooms/bedroom.jpg
# live PDP capture for the demo (then: python3 make_demo_base.py && python3 build_laleh.py)
# curl -sL -A "Mozilla/5.0 (Macintosh)" "https://fableroom.com/products/laleh-hand-tufted-wool-rug" -o live/page.html
# curl -sL "https://fableroom.com/products/laleh-hand-tufted-wool-rug.js" -o live/product.json
