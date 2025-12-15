# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Calendar Transit Robot** — A tool to automatically create "transit" calendar events before and after meetings, using real travel time estimates from Google Maps Routes API.

The project started as a Calendar API exploration tool and is evolving into a transit automation script.

## Project Status

- `calendar_explore.py` — Working exploration script (read-only)
- `transit_calculator.py` — Routes API wrapper (stub mode working)
- `add_transit.py` — Main orchestrator (dry-run mode working)

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
- Current scope: `calendar.readonly` — will need upgrade to `calendar` for write access

To re-authenticate (required after scope changes), delete `token.json` and run again.

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
