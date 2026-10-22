# World Hunter — v0.6

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


## Stage 2 updates
- Map framing follows the selected acquisition radius and displays about three times that radius around the user's current location, with an outline for the actual acquisition zone.
- Acquisition range presets now run from 25 m to 1 km, with a custom setting from 10 m to 5 km. Nearby source/map searches adapt to the selected range.
- A separate visit action records a visit only when the user is within 35 m of a real sourced story point. This is separate from discovery eligibility.
- Local quizzes can be launched from a sourced story card or selected from nearby story cards. Questions use details in the card's linked summary (for example, a year mentioned in the text); the linked source remains the place to verify context. These are lightweight source-grounded quizzes, not AI-generated historical claims.
- Service worker cache version is bumped to v3 so deployed clients can pick up the update.

Validation: `node --check app.js` and manifest JSON validation passed. A live browser/GPS/API test has not been run in this environment.


### Location on first launch
On first launch, World Hunter explains why it uses location and asks the user to continue. The browser/Android then owns the actual location permission prompt. After permission is granted, later launches automatically refresh the user's location and nearby results when the browser reports that permission is already granted. If permission is denied or still awaiting a browser decision, the app shows a status and leaves the user in control of retrying.


## Version 0.6 — curated content library

- Loads the Sorrento Peninsula content pack from the single `content/` root folder (`cards.json`, `quizzes.json`, `sources.json`, `review_queue.json`).
- Displays 15 curated cards with linked sources, approved fact claims, and visit-observation prompts. Folklore is labelled as legend.
- Loads source-linked quizzes only when the quiz is approved, its fact ID exists in the associated approved card, and all linked source IDs resolve.
- Cards with unverified coordinates are browse-only and cannot be collected by proximity. The Vallone dei Mulini card is observation-only and excluded from scored quizzes.
- The review queue is loaded as editorial metadata and is not presented as approved player facts.
- Service worker cache is bumped to v6.

### Content folder layout

Keep all content data files directly inside `content/`, regardless of the region. Add new regions as additional records in the shared JSON files using unique IDs and the `location_area` field; do not create per-location subfolders.

```text
world-hunter/
  index.html
  app.js
  styles.css
  sw.js
  manifest.webmanifest
  icon.svg
  assets/
    explorer-avatar.png
  content/
    cards.json
    quizzes.json
    sources.json
    review_queue.json
    coordinate_audit.json
```

Validation performed for this build: JavaScript syntax check, JSON parsing, and structural checks for card/quiz/source linkage. A live browser/GPS/API test has not been run here.


## v0.6 adventure map and coordinate review

- Adds an original illustrated explorer marker for the device's current position, a recenter control, and bold treasure-style markers for reviewed targets.
- The coordinate audit is `content/coordinate_audit.json`. Only cards explicitly marked `verified_target` are published as collectible GPS targets.
- Two public targets are currently mapped: Museo Archeologico Georges Vallet at Villa Fondi (official government record coordinate; ground-check entrance recommended) and the public Vallone dei Mulini viewpoint on Via Fuorimura (not the inaccessible gorge floor).
- The remaining cards are deliberately browse-only until the exact safe arrival point is confirmed. Broad regions and features inside larger archaeological parks are not treated as independent GPS stops.
- Clear site data only as a last resort; updating the service worker should preserve local progress.
