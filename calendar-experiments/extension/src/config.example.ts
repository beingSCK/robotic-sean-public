/**
 * Configuration for Calendar Transit Extension
 *
 * SETUP: Copy this file to config.ts and fill in your credentials.
 *
 * 1. Routes API Key: Get from Google Cloud Console → APIs & Services → Credentials
 *    Enable "Routes API" in your project first.
 *
 * 2. OAuth Client: Create a "Web application" OAuth client in Cloud Console
 *    Add your extension's redirect URI: https://<extension-id>.chromiumapp.org/
 *    (Get extension ID from chrome://extensions after loading unpacked)
 */

import type { UserSettings } from './types.ts';

// Routes API key - get from Google Cloud Console
// DO NOT commit the real key to git!
export const ROUTES_API_KEY = 'YOUR_ROUTES_API_KEY_HERE';

// OAuth credentials - Web application type for Chrome extension
// DO NOT commit these to git!
export const OAUTH_CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
export const OAUTH_CLIENT_SECRET = 'YOUR_CLIENT_SECRET';
export const OAUTH_SCOPES = ['https://www.googleapis.com/auth/calendar'];
// Redirect URL will be set dynamically using chrome.identity.getRedirectURL()

// Default settings
export const DEFAULT_SETTINGS: UserSettings = {
  homeAddress: '',
  daysForward: 7,
  transitColorId: '11',  // Tomato - matches our CLI tool
};

// Video call URL patterns to skip
export const VIDEO_CALL_KEYWORDS = [
  'zoom.us',
  'meet.google',
  'teams.microsoft',
  'webex',
];

// Transit thresholds
export const MIN_TRANSIT_MINUTES = 10;   // Skip very short transits
export const MAX_TRANSIT_MINUTES = 180;  // Skip unreasonably long transits
export const TRANSIT_FALLBACK_THRESHOLD = 80;  // Fall back to driving if transit > 80 min

// Timezone (default, can be overridden by calendar events)
export const DEFAULT_TIMEZONE = 'America/New_York';
