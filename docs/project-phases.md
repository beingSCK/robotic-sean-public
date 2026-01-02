# Calendar Project Phases: Detailed Implementation Notes

Detailed implementation notes for the Calendar Automaton family. See `ROADMAP.md` for status and next steps.

**Last updated:** 2026-01-02

---

## Calendar CLI (Python) - COMPLETE (Proof-of-Concept)

Python script that validated the idea of automatically creating transit events. **This was the proof-of-concept; the Chrome Extension is the publishable product.**

### What Was Built

- [x] Real Google Routes API integration (replaced stubs)
- [x] Handle edge cases (API errors, missing routes)
- [x] OAuth flow with `calendar` scope (read + write)
- [x] `--execute` mode creates real events in Google Calendar
- [x] Skip creating transit events if duration < 10 minutes
- [x] Skip creating transit events if they would overlap with existing transit events
- [x] Dynamic home location from Stay events (for travel days)
- [x] Traffic-aware routing (BEST_GUESS + PESSIMISTIC blending, 75% pessimistic weight)
- [x] Traffic notes added to event descriptions when duration extended
- [x] Sanity check: skip transits > 3 hours

**Conceptual learning:**
- REST API integration patterns
- Error handling and graceful degradation
- The difference between "it works in stub mode" and "it works for real"
- State management across days (tracking where you "are" vs where you're "going")
- Traffic-aware routing with the Routes API
- Conservative estimation strategies (blending pessimistic/optimistic)

**Definition of Done:** Met
- `python add_transit.py` shows accurate travel times from Google Routes API
- `python add_transit.py --execute` creates real transit events in Google Calendar
- Code published to GitHub: [robotic-sean-public](https://github.com/beingSCK/robotic-sean-public)

### Files (Archived)

The Python CLI code is preserved in `archive/calendar-cli-python/` as reference for porting remaining features (traffic-aware routing, blended traffic models) to the TypeScript Extension.

---

## Calendar Automaton (Chrome Extension) - ACTIVE

Browser extension that automatically creates transit events before/after meetings. This is the publishable product.

### Why This Phase

The CLI was a proof-of-concept - but only you can use it. The Chrome Extension makes the tool accessible to anyone. Shipping it builds the "ship a product" muscle and teaches browser extension development.

### Architecture

Pure TypeScript/client-side. No backend needed. OAuth handled via `chrome.identity.launchWebAuthFlow()`.

**Key insight:** The CLI test runner (`bun run test`) enables fast iteration without Chrome reload cycles. This makes the TypeScript codebase fully testable and maintainable.

### MVP Status: DONE (2025-12-27)

**What was built:**
- [x] Extension manifest v3 setup with Bun bundler
- [x] OAuth flow via `chrome.identity.launchWebAuthFlow()`
- [x] Background service worker for OAuth (persists when popup closes)
- [x] Calendar API integration (fetch events, insert transit events)
- [x] Routes API integration (transit times with driving fallback)
- [x] Popup UI with scan to preview to create flow
- [x] Basic filtering (skip video calls, all-day, existing transit)
- [x] Credential rotation and git history rewrite for security

**Conceptual learning:**
- Chrome extension architecture (manifest v3, service workers)
- OAuth in browser extensions (popup closes during auth, need background worker)
- Product thinking: What's the simplest UX that works?
- Git history rewriting (`git filter-branch`) for removing secrets

**Key technical decision:** OAuth in browser extensions is tricky because the popup closes when user clicks the OAuth window. Solution: background service worker handles OAuth, stores tokens, sets a flag. When popup reopens, it checks for `oauthJustCompleted` and auto-scans.

### Feature Parity with CLI (After Publish)

These items are nice-to-have polish, not blockers for initial publish:

**Tasks to match `add_transit.py` functionality:**
- [x] Low-transit locations (patterns like "22 Lakeview" always use driving) *(2025-12-29)*
- [x] Smart short trips (4-10 min trips include walkability checks) *(2025-12-29)*
- [x] Hold event skipping (colorId 8) *(2025-12-29)*
- [x] Overlap detection between transit events *(2025-12-29)*
- [x] Trip detection (flights, hotel stays) *(2025-12-29)*
- [ ] Stay events + dynamic home location
- [ ] Traffic-aware routing (BEST_GUESS + PESSIMISTIC blending)
- [ ] Blended traffic models

### Files
- `calendar-automaton/` - Extension source code
- `calendar-automaton/CLAUDE.md` - Setup instructions

---

## Historical Note

The original planning used "LP1/LP2/LP3/LP4" numbering which became confusing when execution order diverged from plan order. This document was restructured on 2025-12-27 to match actual execution sequence: CLI to Extension.

For future projects (Investment DB, Chatbot), see `../../_meta/docs/incubating.md`.
