# CLAUDE.md - Calendar Automaton

Chrome extension for intelligent calendar management. Currently creates transit events automatically; designed to expand to prep time, buffer events, and other derived calendar entries.

**Philosophy:** "Complete before expanding" - see `../_meta/docs/FOUNDATIONS.md` for full principles.

## Quick Start

```bash
bun install              # Install dependencies
bun run build            # Build extension to dist/
bun test                 # Run unit tests
bun run test             # CLI integration test (dry run)
bun run test --execute   # Actually create events
bun run check            # Lint + typecheck
```

**Load in Chrome:** Go to `chrome://extensions`, enable Developer mode, click "Load unpacked", select `dist/`.

## First-Time Setup

1. **Install dependencies:** `bun install`

2. **Create config file:**
   ```bash
   cp src/config.example.ts src/config.ts
   ```
   Fill in:
   - `ROUTES_API_KEY` - From Google Cloud Console (enable Routes API)
   - `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET` - OAuth client (Web application type)
   - `DEFAULT_SETTINGS.homeAddress` - Your home address

3. **Build and load:**
   ```bash
   bun run build
   # Load dist/ in Chrome as unpacked extension
   # Note the extension ID shown in chrome://extensions
   ```

4. **Configure OAuth redirect:**
   - Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
   - Edit your OAuth client → Authorized redirect URIs → Add:
     ```
     https://<your-extension-id>.chromiumapp.org/
     ```

## CLI Test Runner

The CLI test runner lets you test the event processing logic without reloading Chrome.

**First-time setup:**
```bash
# Copy OAuth tokens from an existing session
cp ../_past-projects/2025-calendar-cli/token.json cli-tokens.json
```

**Usage:**
```bash
bun run test                    # Dry run with console table
bun run test --json             # JSON output
bun run test --execute          # Actually create events
bun run test --days 14          # Scan 2 weeks ahead
bun run test --home "123 Main"  # Override home address
```

## Architecture

```
src/
├── background.ts         # Service worker (OAuth persistence)
├── calendarService.ts    # Google Calendar API
├── transitCalculator.ts  # Google Routes API (travel times)
├── eventProcessor.ts     # Core logic (filtering, transit calculation)
├── eventProcessor.test.ts # Unit tests
├── types.ts              # Type definitions
├── utils.ts              # Utility functions
├── config.ts             # Your credentials (gitignored)
└── cli/
    ├── testRunner.ts     # CLI integration test
    └── cliAuth.ts        # OAuth for CLI (reads cli-tokens.json)

popup/                    # Extension popup UI
icons/                    # Extension icons
```

## Testing

Two test modes:

| Command | What it tests | Needs |
|---------|---------------|-------|
| `bun test` | Unit tests (pure functions) | Nothing |
| `bun run test` | Full integration (real API calls) | `cli-tokens.json` |

## Linting Philosophy

Biome is configured pragmatically for active solo development:

- `noConsoleLog: off` - Useful for debugging during development
- `noForEach: off` - forEach is readable; perf isn't critical here
- `noUnusedParameters: false` - API signatures may require unused params

**When to tighten:** After Chrome Web Store publish, consider enabling:
- `noUnusedLocals: true`
- `noUnusedParameters: true`

## Key Files

- `src/config.ts` - Your credentials (gitignored, copy from config.example.ts)
- `cli-tokens.json` - OAuth tokens for CLI test runner (gitignored)
- `dist/` - Built extension (load this in Chrome)

## References

- `docs/ROADMAP.md` - Project status and next steps
- `docs/project-phases.md` - Detailed implementation notes
- `../_meta/docs/FOUNDATIONS.md` - Philosophy and conventions
- `../_past-projects/2025-calendar-cli/` - Original Python CLI (reference)

## GitHub

Published: [robotic-sean-public](https://github.com/beingSCK/robotic-sean-public)
