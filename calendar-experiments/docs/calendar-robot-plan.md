# Calendar Transit Robot — Project Plan

## Goal
A Python script that automatically creates "transit" calendar events before and after meetings, using real travel time estimates from Google Maps Routes API.

**Definition of Done:** Run the script → transit events appear in Google Calendar with correct times and tomato color labels (colorId "11").

**Why This Matters:** This exceeds what Gemini could do (it couldn't set event colors). It's a real tool you'll actually use.

---

## Status (Updated 2025-12-16)

**ALL PHASES COMPLETE.** Core functionality working end-to-end.

- [x] Phase 1: Stub mode + dry-run
- [x] Phase 2: Routes API integration (real travel times)
- [x] Phase 3: Execute mode (creates events in Google Calendar)
- [x] Phase 4: Enhancements (traffic-aware, car-only flag, dynamic home)

**Key decisions:**
- Transit colorId = "11" (tomato)
- Hold events (colorId "8", graphite) are skipped
- Travel/trip events use colorId "3" (grape)
- Using Routes API (not legacy Directions API)
- Config stored in `config.json` (gitignored)

**Enhancements added:**
- Traffic-aware routing: blends BEST_GUESS + PESSIMISTIC estimates
- `--car-only` flag: forces driving mode (skips transit)
- Dynamic home: uses "Stay" events to detect temporary home on travel days

---

## What We're Building

### Input
- Your Google Calendar events for the next N days
- Your home address: 1000 Union St, Crown Heights, Brooklyn

### Output
- New "transit" events inserted into your calendar
- Tomato color (colorId "11" — transit label)
- Names like "TRANSIT: Home → Gym" or "TRANSIT: Gym → Dinner"

---

## Architecture (3 Files)

```
calendar-experiments/
├── credentials.json      # OAuth app identity (DO NOT COMMIT)
├── token.json            # User auth token (DO NOT COMMIT)
├── config.json           # API key & settings (DO NOT COMMIT)
├── .gitignore            # Excludes credentials
├── calendar_explore.py   # Exploration script (read-only)
├── transit_calculator.py # Routes API wrapper (COMPLETE)
├── add_transit.py        # Main script / orchestrator (COMPLETE)
├── events_dump.json      # Debug output (gitignored)
└── dry_run_output.json   # Transit events preview (gitignored)
```

### transit_calculator.py
- Single responsibility: given two addresses, return travel time and mode
- Uses Google Maps Routes API (successor to Directions API)
- Returns real travel times with traffic-aware estimates
- Returns: `{ "duration_minutes": 35, "mode": "transit" }`

### add_transit.py
- Fetches calendar events
- Walks through events chronologically
- Applies filtering rules
- Calls transit_calculator for each needed trip
- Inserts transit events via Calendar API

---

## Filtering Rules

**Skip transit events for an event if:**
- [x] Event is between 12am–6am
- [x] Event has no location
- [x] Event is already a transit event (colorId = "11")
- [x] Event is a "hold" event (colorId = "8" — graphite, tentative)
- [x] Event has video call (check `conferenceData` or URL patterns)
- [x] Location matches previous event (or home, for first event)
- [x] All-day events (no specific time)
- [x] Day is a "trip day" (detected via flights/stays)

**Transit event logic:**
- First event of day: add transit FROM home TO event
- Middle events: add transit FROM previous event TO this event
- Last event of day: add transit FROM event TO home
- Already a transit event: add 0 transit events

---

## Setup Steps

### 1. Enable Google Maps Routes API
- [x] Go to Google Cloud Console
- [x] Navigate to APIs & Services → Library
- [x] Search "Routes API" → Enable (Note: Directions API is now Legacy)
- [x] Go to APIs & Services → Credentials
- [x] Create API Key (not OAuth — Routes uses simple API key)
- [ ] Restrict the key to Routes API only (good security practice)
- [x] Store key in `config.json` (gitignored)

### 2. Update Calendar OAuth Scope
- [x] In your code, change scope from `calendar.readonly` to `calendar`
- [x] Delete `token.json` to force re-authentication
- [x] Re-run to get new token with write permission

### 3. Build transit_calculator.py
- [x] Create function: `get_transit_time(origin, destination) -> dict`
- [x] Stub mode working (returns 30 min)
- [x] Implement real Routes API call
- [x] Implement transit vs driving fallback logic

### 4. Build add_transit.py
- [x] Fetch events for next 7 days (configurable via `--days`)
- [x] Group events by day
- [x] For each day, walk through events in order
- [x] Apply filtering rules
- [x] Calculate transit times
- [x] Build transit event objects with correct colorId ("11" = tomato)
- [x] Dry-run mode: outputs to `dry_run_output.json`
- [x] Trip detection: skips entire days when traveling
- [x] Execute mode: insert events via `service.events().insert()`

### 5. Test
- [x] Run dry-run on upcoming events
- [x] Verify `dry_run_output.json` looks correct
- [x] Verify transit events appear in Google Calendar
- [x] Verify colors are correct
- [x] Verify times make sense with real API data

### 6. Git Workflow — COMPLETE

All phases merged to main. Feature branch work complete.

---

## API Reference

### Routes API Request (replaces Directions API)
```python
# POST https://routes.googleapis.com/directions/v2:computeRoutes
# See transit_calculator.py for implementation
# Docs: https://developers.google.com/maps/documentation/routes
```

### Calendar Event Insert
```python
event = {
    'summary': 'TRANSIT: Home → Meeting',
    'location': '1000 Union St, Brooklyn, NY',
    'colorId': '11',  # tomato = transit
    'start': {'dateTime': '2025-01-15T09:00:00-05:00', 'timeZone': 'America/New_York'},
    'end': {'dateTime': '2025-01-15T09:35:00-05:00', 'timeZone': 'America/New_York'},
}
service.events().insert(calendarId='primary', body=event).execute()
```

---

## Decisions Made

1. **Transit colorId:** "11" (tomato) — updated from "8" (grey)
2. **Hold colorId:** "8" (graphite) — tentative events, skipped for transit
3. **Travel colorId:** "3" (grape) — stays, hotels, trip markers
4. **Days forward to process:** 7 (configurable via `--days`)
5. **Buffer time:** Not yet implemented (v1 uses raw estimates)
6. **Overlapping events:** Let them overlap for v1, user adjusts manually
7. **Trip days:** Skip entire day when flights/stays detected

---

## Out of Scope (Future Work)

- Tests
- Handling all-day events (currently skipped)
- Recurring events
- Events on other calendars (just 'primary' for now)
- UI / interface beyond command line
- Claude Skill wrapper
- Blog post

---

## Future Vision

Once this tool is working and battle-tested for personal use:

1. **Open-source the code** — Clean up, add documentation, publish repo
2. **Chrome Extension** — Package as a browser extension for broader use
3. **Fork this repo** to start the extension project (keeps this repo as the "reference implementation")

The goal: ship something useful that others can use too!

---

## Commands Reference

```bash
# Run the exploration script
python3 calendar_explore.py

# Run the transit script (dry-run by default)
python3 add_transit.py              # Outputs to dry_run_output.json
python3 add_transit.py --days 14    # Look 14 days ahead
python3 add_transit.py --execute    # Actually create calendar events
python3 add_transit.py --car-only   # Force driving mode (skip transit)

# If you need to re-authenticate (after scope change)
rm token.json
python3 add_transit.py      # Will prompt for auth
```
