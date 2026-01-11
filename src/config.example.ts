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

import type { UserSettings } from "./types.ts";

// Routes API key - get from Google Cloud Console
// DO NOT commit the real key to git!
export const ROUTES_API_KEY = "YOUR_ROUTES_API_KEY_HERE";

// OAuth credentials - Web application type for Chrome extension
// DO NOT commit these to git!
export const OAUTH_CLIENT_ID = "YOUR_CLIENT_ID.apps.googleusercontent.com";
export const OAUTH_CLIENT_SECRET = "YOUR_CLIENT_SECRET";
export const OAUTH_SCOPES = ["https://www.googleapis.com/auth/calendar"];
// Redirect URL will be set dynamically using chrome.identity.getRedirectURL()

// Default settings
export const DEFAULT_SETTINGS: UserSettings = {
  homeAddress: "",
  daysForward: 7,
  transitColorId: "11", // Tomato - matches our CLI tool
};

// Video call URL patterns to skip
export const VIDEO_CALL_KEYWORDS = ["zoom.us", "meet.google", "teams.microsoft", "webex"];

// Flight detection keywords (for trip date detection)
export const FLIGHT_KEYWORDS = [
  "flight to",
  "flight from",
  "ua ",
  "aa ",
  "dl ",
  "b6 ",
  "united",
  "american",
  "delta",
  "jetblue",
  "southwest",
];

// Stay event keywords (for trip date detection)
export const STAY_KEYWORDS = ["stay:", "stay at", "hotel", "airbnb", "vrbo", "accommodation"];

// Default home airports (for detecting outbound flights)
export const DEFAULT_HOME_AIRPORTS = ["ewr", "jfk", "lga", "newark", "kennedy", "laguardia"];

// Trip duration thresholds (in minutes)
export const MIN_TRIP_MINUTES = 4; // Absolute floor - below this, never create event
export const SHORT_TRIP_THRESHOLD_MINUTES = 10; // Above this, always create event; below triggers walkability check
export const MAX_TRANSIT_MINUTES = 180; // Sanity cap - skip unreasonably long transits
export const MAX_WALKABLE_MINUTES = 15; // If walk time exceeds this, include drive event instead
export const TRANSIT_FALLBACK_THRESHOLD = 80; // Fall back to driving if transit > 80 min

// Time conversion constants
export const SECONDS_PER_MINUTE = 60;
export const MILLISECONDS_PER_MINUTE = 60 * 1000;

// API configuration
export const ROUTES_API_TIMEOUT_MS = 10000; // 10 second timeout for Routes API calls

// Timezone (default, can be overridden by calendar events)
export const DEFAULT_TIMEZONE = "America/New_York";
