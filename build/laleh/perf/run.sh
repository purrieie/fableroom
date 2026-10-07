#!/bin/zsh
# Lighthouse (mobile preset, simulated throttling) on the live PDP copy, without and with the snippet.
LH=../node_modules/.bin/lighthouse
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for i in 1 2 3; do
  for v in without with; do
    [[ $v == without ]] && URL=http://localhost:8811/demo-base.html || URL=http://localhost:8812/laleh/index.html
    $LH "$URL" --quiet --chrome-path="$CH" --chrome-flags="--headless=new --no-sandbox" --only-categories=performance \
      --output=json --output-path=perf/$v-$i.json >/dev/null 2>&1
    echo "$v $i done"
  done
done
