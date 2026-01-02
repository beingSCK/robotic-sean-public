# Calendar Automaton

Chrome extension for intelligent calendar management. Currently creates transit events automatically; designed to expand to prep time, buffer events, and other derived calendar entries. Uses Bun for building and testing.

## First-Time Setup

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Create config file with your credentials:**
   ```bash
   cp src/config.example.ts src/config.ts
   ```
   Then edit `src/config.ts` and fill in:
   - `ROUTES_API_KEY` - From Google Cloud Console (enable Routes API)
   - `OAUTH_CLIENT_ID` - From OAuth client (see below)
   - `OAUTH_CLIENT_SECRET` - From OAuth client

3. **Build the extension:**
   ```bash
   bun run build
   ```

4. **Load in Chrome:**
   - Go to `chrome://extensions`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `dist/` folder
   - Note the extension ID shown

5. **Configure OAuth redirect URI:**
   - Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
   - Create OAuth client with type **"Web application"** (not Chrome app!)
   - Under "Authorized redirect URIs", add:
     ```
     https://<your-extension-id>.chromiumapp.org/
     ```
   - Save and copy the Client ID and Secret to your `config.ts`
   - Rebuild: `bun run build`

## Development Commands

```bash
bun install              # Install dependencies
bun run build            # Build extension to dist/
bun run clean            # Clean dist folder

# CLI Test Runner (no Chrome reload needed!)
bun run test             # Dry run with console table
bun run test --json      # JSON output
bun run test --execute   # Actually create events
bun run test --days 14   # Scan 2 weeks ahead
```

The CLI test runner uses the same OAuth tokens as the archived Python CLI (reads from `../archive/calendar-cli-python/token.json`).

## Architecture

- `src/background.ts` - Service worker handling OAuth (persists when popup closes)
- `src/calendarService.ts` - Google Calendar API integration
- `src/transitCalculator.ts` - Google Routes API for travel times
- `src/eventProcessor.ts` - Core logic (filtering, transit calculation)
- `popup/` - Extension popup UI

## Files

- `src/config.ts` - Your credentials (gitignored, copy from config.example.ts)
- `src/config.example.ts` - Template for credentials
- `dist/` - Built extension (load this in Chrome)
- `manifest.json` - Extension configuration
