I wanted to prepare a detailed and most reliable weather forecast web page for Mani, Peloponnese, Greece. Weather apps and widgets on phones don't get it right and here it is. I'll make it use different forecast models when necessary, in time. 


## Install on Android
Open https://olivo-olivo.github.io/mani-weather/ in Chrome. Tap **Install app** when offered, or choose **Install app / Add to Home screen** from Chrome's menu. Launch **Mani Weather** from its icon.

After one successful online visit, the app shell and last downloaded forecast are available offline. Saved forecasts show their download date and age; live hazard guidance is withheld until a fresh forecast is retrieved. Radar requires a connection. Reconnecting triggers a refresh.

The service worker caches only this app's static assets. Forecast API responses bypass it; the application stores its last successful forecast separately. For future asset releases, update their URL versions in `index.html` and `sw.js`, and bump the service worker cache version. Existing installations check for updates when reopened.


## Scrolling checks
Run `node --test tests/*.test.cjs` for the Node regression suite. Reduced-motion scrolling uses `auto`, paired with the existing `prefers-reduced-motion` CSS override; normal scrolling remains `smooth`.

For native scrolling checks, install Playwright (`npm install --no-save playwright` and `npx playwright install chromium firefox webkit`), then run `node tests/browser/scroll.cjs`. This checks mobile and desktop widths in all three engines, immediate arrival with reduced motion, normal animation, closing without scrolling, and keyboard activation. It also rejects `instant` in the browser binding to exercise the compatibility path. Set `BROWSERS=chromium` and `CHROMIUM_PATH=/usr/bin/chromium` to use a system Chromium.

The browser checks have not yet passed in the editing environment: system Chromium was blocked from creating its process socket, and Playwright browser downloads failed. Native Firefox/WebKit and physical Android/iOS validation remain outstanding.
