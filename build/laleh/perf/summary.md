Lighthouse, mobile preset (simulated 4G, 4× CPU), median of 3 runs each, on the same saved copy of the live PDP served locally (third-party theme assets still load from fableroom.com, so run-to-run noise is large):

| Metric | Without | With snippet |
|---|---:|---:|
| Score | 55 | 54 |
| FCP | 8.23 s | 8.27 s |
| LCP | 16.10 s | 13.97 s |
| TBT | 125 ms | 140 ms |
| CLS | 0.062 | 0.062 |
| Speed Index | 8.72 s | 8.27 s |
| Page weight | 8230 KB | 7967 KB |
| Requests | 482 | 472 |
| Room-view requests during load | 0 | 0 |

The snippet adds ~1.8 KB of HTML and no requests; any difference above is noise from the theme's own third-party assets.
