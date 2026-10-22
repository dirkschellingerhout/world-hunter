# World Hunter Content Pack 001 — Sorrento Peninsula

Version: 1.0.0  
Created: 2026-10-21  
Scope: Sorrento Peninsula and nearby archaeological sites  
Language: English

## Included files

- `cards.json` — 15 structured cards, each with a stable ID, source-linked claims, visit challenge, status and coordinate status.
- `quizzes.json` — scored multiple-choice questions linked to approved fact IDs only.
- `sources.json` — source register with publisher, URL, source type and access date.
- `review_queue.json` — unresolved claims and publication blockers.
- `coordinate_audit.json` — per-card coordinate and safe-arrival-point review, with source links and publication status.
- `source_register.csv` — compact source register for spreadsheet review.
- `VALIDATION.txt` — results from automated structural checks.

## Review and publication rules

1. `approved` facts are supported by the source(s) linked to the individual claim. `approved` is a content review status, not a claim that the source is infallible.
2. Folklore is explicitly labelled. A source supporting that a legend is told does not establish that the legend happened.
3. A quiz must reference an `approved_facts[].id` from its card. Cards with no supported quiz fact have no scored quiz.
4. `approved_with_limits` cards may be used for the specific supported, low-risk observation only. Do not invent deeper history or geology for them.
5. Only cards marked `verified_target` may carry published coordinates or trigger collection. See `coordinate_audit.json`; site-centre coordinates are not automatically safe arrival points.
6. Visitor access and opening hours are volatile and should be checked against official site information at runtime or before a trip.
7. A fact should be retired or sent back to review if sources conflict, the source URL becomes unavailable, or a better primary source changes the interpretation.

## Important limitations

This is a first researched content pack, not a full archaeological catalogue. Most facts have one direct authoritative source; some are corroborated by a second institutional source. Items needing more specialist support are in `review_queue.json`. The content should not be marketed as independently peer-reviewed. It has been checked for source traceability and internal quiz-to-fact consistency, with unresolved questions kept out of scored quizzes.

## Integration suggestion

Import `cards.json` as content records, `quizzes.json` as separate question records and `sources.json` as a source lookup table. Do not hard-code source text into quiz logic. Use `coordinate_status` to prevent cards with unverified coordinates from triggering location-based collection. Never treat broad areas or inaccessible internal features as a single collectible point. The app should show the source link and the claim's wording in each card's details view.
