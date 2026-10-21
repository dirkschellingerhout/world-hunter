# World Hunter MVP — v0.1

An Android-friendly installable PWA prototype for location-based discovery cards, a local explorer's journal, and simple family-friendly missions.

## Included in this first build

- Responsive Explore / Journal / Missions screens.
- OpenStreetMap-based map via Leaflet.
- Foreground GPS and configurable 50/100/150/250 metre discovery radius.
- Nearby public places from OpenStreetMap Overpass and nearby Wikipedia articles.
- Wikipedia summary/source links where available; source labels and distinction between documented information and folklore.
- Automatic collection for discoveries within the selected radius (can be disabled).
- Persistent local collection, badge progress, mission checkbox, JSON export.
- Service worker caching for the app shell and saved local progress.
- No account, advertising, analytics, or location-tracking backend.

## Run locally

For geolocation, service workers and installability, serve over HTTPS or localhost. Opening `index.html` directly as a `file://` URL will not enable all browser features.

Quick local test (Python installed):
```bash
python -m http.server 8080
```
Then open `http://localhost:8080` on the same device.

## Deploy to GitHub Pages

1. Create a repository, e.g. `world-hunter`.
2. Upload the contents of this folder to the repository root.
3. In GitHub, open **Settings → Pages** and deploy from the `main` branch / root.
4. Open the HTTPS Pages URL in Chrome on Android.
5. Use Chrome's menu → **Install app** or **Add to Home screen**.

Netlify or another HTTPS static host also works.

## Data, privacy and limitations

- Location is requested only after the user taps “Find discoveries nearby”. The browser provides foreground location while the page is open.
- When a nearby search runs, approximate coordinates are sent to public OpenStreetMap Overpass and Wikimedia APIs to retrieve nearby place/article data. This MVP has no user account or app-owned location server.
- Location and collection data are stored locally; browser storage can be cleared by device settings. Export the journal periodically if you want a backup.
- Overpass and Wikipedia API availability/rate limits are outside this app's control. The app falls back to a small clearly-labelled sample collection.
- Map tiles are served by OpenStreetMap. Follow the tile usage policy and do not bulk download tiles for offline use.
- Offline caching covers the app shell, not an offline map database or all unseen discoveries. The map and fresh facts need internet.
- Wikipedia summaries are useful starting points, not a guarantee that every nearby location has a dedicated article or that every claim is definitive. The app links to the original article and reminds users to inspect references; Wikipedia content is available under CC BY-SA and reuse must retain appropriate attribution and comply with the licence. For a production release, review each card, add authoritative heritage sources, image licences/attribution, and richer curated local collections.
- This is an MVP, not a navigation/safety system. GPS accuracy can vary; collection should never require entering private or restricted areas, crossing roads unsafely, or approaching strangers.

## Next stages

1. **Stabilise discovery data:** curated source review, deduplication, better categories, source confidence and attribution.
2. **Make quests delightful:** location trails, age-adjustable riddles, observation tasks, collection sets and celebratory animations.
3. **Travel-ready mode:** pre-load a town's cards and journal, with explicit online/offline indicators.
4. **Family profiles and backup:** optional local profiles and user-controlled export/import; no public child profiles.
5. **Release hardening:** privacy review, accessible controls, testing on real Android devices, API rate-limit handling, and proper icon assets.
