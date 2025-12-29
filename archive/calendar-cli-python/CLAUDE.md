# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Calendar Transit Robot CLI** — A Python tool to automatically create "transit" calendar events before and after meetings, using real travel time estimates from Google Maps Routes API.

## Project Status

- `add_transit.py` — Main script (dry-run by default, `--execute` to create events)
- `transit_calculator.py` — Routes API wrapper
- `calendar_explore.py` — Exploration/testing script (read-only)

See `docs/calendar-robot-plan.md` for the full implementation plan and checklist.

## Setup & Running

**Important:** Use `python3` (not `python`) to run scripts.

Install dependencies:
```bash
pip install google-api-python-client google-auth-httplib2 google-auth-oauthlib requests
```

Run the exploration script:
```bash
python3 calendar_explore.py
```

First run opens a browser for OAuth consent. Subsequent runs use the saved `token.json`.

## Authentication

- `credentials.json`: OAuth client credentials (from Google Cloud Console)
- `token.json`: Cached OAuth tokens (auto-generated after first auth)
- Scope: `calendar` (read + write)

To re-authenticate (if needed), delete `token.json` and run again.

## Key Configuration

- Home address: 1000 Union St, Crown Heights, Brooklyn
- Timezone: America/New_York

### Calendar ColorId Semantics

| ColorId | Name | Meaning |
|---------|------|---------|
| 8 | Graphite | "Holds" - conditional events, skipped for transit |
| 11 | Tomato | Transit events |
| 3 | Grape | Travel/Trip events (stays, hotels) |

Events with colorId 8 are skipped when calculating transit (they're tentative holds, not confirmed).

## Files

- `events_dump.json` — Debug output from exploration script (gitignored)
- `docs/calendar-robot-plan.md` — Detailed project plan with setup steps and API reference
