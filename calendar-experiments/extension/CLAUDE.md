# Calendar Transit Extension

Chrome extension for the Calendar Transit Robot. Uses Bun for building.

## Development

```bash
bun install      # Install dependencies
bun run build    # Build extension to dist/
bun run clean    # Clean dist folder
```

## Loading in Chrome

1. Go to `chrome://extensions`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `dist/` folder
5. Note the extension ID shown

## OAuth Setup (Required)

Before the extension can access Google Calendar:

1. Load the extension first (see above) to get your extension ID
2. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
3. Edit the existing OAuth client (or create one for "Desktop app")
4. Under "Authorized redirect URIs", add:
   ```
   https://<your-extension-id>.chromiumapp.org/
   ```
5. Save the OAuth client

For family testing, each person's extension will have a unique ID.
Add all their redirect URIs to the same OAuth client.

## Files

- `src/` - TypeScript source files
- `popup/` - Popup UI (HTML, CSS, TS)
- `dist/` - Built extension (load this in Chrome)
- `manifest.json` - Extension configuration

## Security Note

The API keys and OAuth credentials are hardcoded in `src/config.ts`.
This is fine for private family testing but don't publish this publicly.
