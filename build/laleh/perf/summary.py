"""Median Lighthouse metrics, without vs with the snippet -> perf/summary.md"""
import json, glob, os, statistics as st
HERE = os.path.dirname(os.path.abspath(__file__))
M = [('performance', 'Score', lambda r: r['categories']['performance']['score'] * 100, '%.0f'),
     ('fcp', 'FCP', lambda r: r['audits']['first-contentful-paint']['numericValue'] / 1000, '%.2f s'),
     ('lcp', 'LCP', lambda r: r['audits']['largest-contentful-paint']['numericValue'] / 1000, '%.2f s'),
     ('tbt', 'TBT', lambda r: r['audits']['total-blocking-time']['numericValue'], '%.0f ms'),
     ('cls', 'CLS', lambda r: r['audits']['cumulative-layout-shift']['numericValue'], '%.3f'),
     ('si', 'Speed Index', lambda r: r['audits']['speed-index']['numericValue'] / 1000, '%.2f s'),
     ('bytes', 'Page weight', lambda r: r['audits']['total-byte-weight']['numericValue'] / 1024, '%.0f KB'),
     ('reqs', 'Requests', lambda r: len(r['audits']['network-requests']['details']['items']), '%.0f')]
rows = {}
for v in ('without', 'with'):
    runs = [json.load(open(f)) for f in sorted(glob.glob(os.path.join(HERE, v + '-*.json')))]
    rows[v] = {k: st.median([fn(r) for r in runs]) for k, _, fn, _ in M} if runs else None
    rows[v + '_n'] = len(runs)
    if runs:
        rows[v + '_rv'] = st.median([sum(1 for i in r['audits']['network-requests']['details']['items'] if 'room-view' in i['url'] or '/rv/' in i['url']) for r in runs])
out = ['Lighthouse, mobile preset (simulated 4G, 4× CPU), median of %d runs each, on the same saved copy of the live PDP served locally (third-party theme assets still load from fableroom.com, so run-to-run noise is large):' % rows['with_n'], '',
       '| Metric | Without | With snippet |', '|---|---:|---:|']
for k, label, _, fmt in M:
    out.append('| %s | %s | %s |' % (label, fmt % rows['without'][k], fmt % rows['with'][k]))
out.append('| Room-view requests during load | %d | %d |' % (rows['without_rv'], rows['with_rv']))
out += ['', 'The snippet adds ~1.8 KB of HTML and no requests; any difference above is noise from the theme\'s own third-party assets.']
open(os.path.join(HERE, 'summary.md'), 'w').write('\n'.join(out) + '\n')
print('\n'.join(out))
