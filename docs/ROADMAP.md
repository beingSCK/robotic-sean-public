# Calendar Projects Roadmap

Current status and next steps for the Calendar Automaton family - intelligent calendar management tools.

**Last updated:** 2026-01-02

---

## Project Overview

| Project | Status | Location |
|---------|--------|----------|
| **Calendar Automaton** | Active - feature parity, then publish | `calendar-automaton/` |
| Calendar Transit CLI | Complete (proof-of-concept) | `archive/calendar-cli-python/` |

**Current focus:** Calendar Automaton (Chrome Extension) to Web Store publish to LinkedIn post.

---

## Calendar Automaton - ACTIVE

Chrome extension for intelligent calendar management. Currently creates transit events automatically; designed to expand to prep time, buffer events, and other derived calendar entries.

### MVP Status: DONE (2025-12-27)

The core functionality works:
- OAuth flow via `chrome.identity.launchWebAuthFlow()`
- Background service worker for OAuth (persists when popup closes)
- Calendar API integration (fetch events, insert transit events)
- Routes API integration (transit times with driving fallback)
- Popup UI with scan to preview to create flow
- Basic filtering (skip video calls, all-day, existing transit)

### Path to Publish

1. **Family testing** - Have family members install and use it
2. **Chrome Web Store** - $5 developer account, store listing, privacy policy, submit for review
3. **LinkedIn post** - "I shipped my first Chrome extension"

**Definition of Done:** Extension live on Chrome Web Store, at least 1 external user.

### Feature Parity with CLI (After Publish)

These items are nice-to-have polish, not blockers for initial publish:

**Completed:**
- [x] Low-transit locations (patterns like "22 Lakeview" always use driving) *(2025-12-29)*
- [x] Smart short trips (4-10 min trips include walkability checks) *(2025-12-29)*
- [x] Hold event skipping (colorId 8) *(2025-12-29)*
- [x] Overlap detection between transit events *(2025-12-29)*
- [x] Trip detection (flights, hotel stays) *(2025-12-29)*

**Remaining:**
- [ ] Stay events + dynamic home location
- [ ] Traffic-aware routing (BEST_GUESS + PESSIMISTIC blending)
- [ ] Blended traffic models

### UX Polish (After Publish)

- [ ] Better button copy ("Scan Calendar to Add Transit Events")
- [ ] Driving preference toggle in settings (always drive vs transit fallback)
- [ ] Configurable low-transit location patterns in settings UI
- [ ] Progress indicators during scan
- [ ] Onboarding flow for first-time users

### Recommended Next Session

**Remaining parity features:**
1. **Stay events + dynamic home** - Port from Python CLI. Uses hotel/airbnb events to determine "home" for that day.
2. **Traffic-aware routing** - Add departure time to Routes API calls for accurate estimates.
3. **Blended traffic models** - BEST_GUESS + PESSIMISTIC with 75% pessimistic weight.

**Path to publish:**
4. **Chrome Web Store** - $5 developer account, store listing, privacy policy.

### Public Output

- Chrome Web Store listing
- LinkedIn post: "I shipped my first Chrome extension"
- (Optional) Blog post on the journey from script to product

---

## Calendar CLI - COMPLETE

Python script that validated the idea of automatically creating transit events. **This was the proof-of-concept; the Chrome Extension is the publishable product.**

### What Was Built

- Real Google Routes API integration
- OAuth flow with `calendar` scope (read + write)
- `--execute` mode creates real events in Google Calendar
- Traffic-aware routing (BEST_GUESS + PESSIMISTIC blending, 75% pessimistic weight)
- Dynamic home location from Stay events

**Published:** [robotic-sean-public](https://github.com/beingSCK/robotic-sean-public)

See `project-phases.md` for detailed implementation notes and remaining feature work.

---

See also:
- `project-phases.md` - Detailed task lists and conceptual learning notes
- `../../_meta/docs/FOUNDATIONS.md` - Overall philosophy and principles
- `../../_meta/docs/incubating.md` - Future projects queue
