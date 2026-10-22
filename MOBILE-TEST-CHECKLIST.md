# World Hunter v0.6 — mobile acceptance checklist

## Before publishing
- [ ] Confirm the two candidate target points on a live map and on the ground; confirm the museum's visitor entrance and the public Vallone viewpoint pin.
- [ ] Keep all cards without `coordinate_status: "verified_target"` coordinate-null and browse-only.
- [ ] Verify any additional target using an authoritative map/address and a safe public arrival point; update both `cards.json` and `coordinate_audit.json` together.

## Android Chrome / installed PWA
- [ ] Open the hosted HTTPS site in Chrome and grant location permission.
- [ ] Confirm the illustrated explorer marker appears at the current location and moves when GPS updates.
- [ ] Tap “You are here”; confirm the map recentres and opens the location popup.
- [ ] Confirm gold treasure markers appear for reviewed targets, coral indicates in-range, and green indicates collected.
- [ ] Tap each marker and open its card; verify the correct story appears.
- [ ] Confirm unverified cards do not appear as GPS targets and cannot be auto-collected.
- [ ] Test the map at narrow mobile width and at high zoom; controls must not cover important targets.
- [ ] Test denied GPS, unavailable GPS, and re-enabling permission.
- [ ] Install/update the PWA; confirm the v6 service worker installs and the explorer image loads.
- [ ] Confirm journal entries and mission progress survive an app restart/update.
- [ ] Test with poor signal/offline. Map tiles may require connectivity; do not promise offline map tiles unless explicitly cached and licensed appropriately.

## Safety and usability
- [ ] Test GPS drift around buildings and set collection radii conservatively.
- [ ] Never instruct players to enter private property, cross barriers, or take an unsafe route to reach a pin.
- [ ] For large archaeological sites, prefer the official public entrance as the GPS target; use internal features as story content until a safe internal map target is verified.
