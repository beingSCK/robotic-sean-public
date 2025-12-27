/**
 * Calendar Service - Google Calendar API integration
 * Uses launchWebAuthFlow for OAuth (more flexible than getAuthToken)
 */

import type { CalendarEvent, TransitEvent } from './types.ts';
import {
  OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET,
  OAUTH_SCOPES,
} from './config.ts';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

interface TokenData {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // Unix timestamp in ms
}

/**
 * Get stored tokens from chrome.storage.
 */
async function getStoredTokens(): Promise<TokenData | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['oauth_tokens'], (result) => {
      resolve(result.oauth_tokens || null);
    });
  });
}

/**
 * Store tokens in chrome.storage.
 */
async function storeTokens(tokens: TokenData): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ oauth_tokens: tokens }, resolve);
  });
}

/**
 * Clear stored tokens (for logout).
 */
export async function clearTokens(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(['oauth_tokens'], resolve);
  });
}

/**
 * Get the redirect URL for this extension.
 * Uses Chrome's built-in redirect URL which is auto-allowlisted.
 */
function getRedirectUrl(): string {
  return chrome.identity.getRedirectURL();
}

/**
 * Launch OAuth flow using launchWebAuthFlow.
 * Opens a popup window for user to authenticate.
 */
async function launchOAuthFlow(): Promise<{ code: string; redirectUrl: string }> {
  const redirectUrl = getRedirectUrl();

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', OAUTH_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUrl);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', OAUTH_SCOPES.join(' '));
  authUrl.searchParams.set('access_type', 'offline'); // Get refresh token
  authUrl.searchParams.set('prompt', 'consent'); // Always show consent to get refresh token

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      {
        url: authUrl.toString(),
        interactive: true,
      },
      (responseUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!responseUrl) {
          reject(new Error('No redirect URL returned'));
          return;
        }

        // Parse the authorization code from the redirect URL
        const url = new URL(responseUrl);
        const code = url.searchParams.get('code');
        if (!code) {
          const error = url.searchParams.get('error');
          reject(new Error(error || 'No authorization code in redirect'));
          return;
        }

        resolve({ code, redirectUrl });
      }
    );
  });
}

/**
 * Exchange authorization code for tokens.
 */
async function exchangeCodeForTokens(code: string, redirectUrl: string): Promise<TokenData> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
      redirect_uri: redirectUrl,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = await response.json();

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000, // Subtract 60s buffer
  };
}

/**
 * Refresh the access token using the refresh token.
 */
async function refreshAccessToken(refreshToken: string): Promise<TokenData> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const data = await response.json();

  return {
    access_token: data.access_token,
    refresh_token: refreshToken, // Keep the original refresh token
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  };
}

/**
 * Get a valid access token, refreshing or re-authenticating as needed.
 */
export async function getAuthToken(): Promise<string> {
  let tokens = await getStoredTokens();

  // If no tokens, start OAuth flow
  if (!tokens) {
    const { code, redirectUrl } = await launchOAuthFlow();
    tokens = await exchangeCodeForTokens(code, redirectUrl);
    await storeTokens(tokens);
    return tokens.access_token;
  }

  // If token is expired, try to refresh
  if (Date.now() >= tokens.expires_at) {
    if (tokens.refresh_token) {
      try {
        tokens = await refreshAccessToken(tokens.refresh_token);
        await storeTokens(tokens);
        return tokens.access_token;
      } catch (error) {
        console.error('Token refresh failed, re-authenticating:', error);
        // Refresh failed, start fresh OAuth flow
        const { code, redirectUrl } = await launchOAuthFlow();
        tokens = await exchangeCodeForTokens(code, redirectUrl);
        await storeTokens(tokens);
        return tokens.access_token;
      }
    } else {
      // No refresh token, start fresh OAuth flow
      const { code, redirectUrl } = await launchOAuthFlow();
      tokens = await exchangeCodeForTokens(code, redirectUrl);
      await storeTokens(tokens);
      return tokens.access_token;
    }
  }

  return tokens.access_token;
}

/**
 * Fetch upcoming events from the primary calendar.
 */
export async function fetchEvents(daysForward: number): Promise<CalendarEvent[]> {
  const token = await getAuthToken();

  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + daysForward * 24 * 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '100',
  });

  const response = await fetch(
    `${CALENDAR_API_BASE}/calendars/primary/events?${params}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Calendar API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  return (data.items || []) as CalendarEvent[];
}

/**
 * Insert a transit event into the calendar.
 */
export async function insertTransitEvent(event: TransitEvent): Promise<CalendarEvent> {
  const token = await getAuthToken();

  const response = await fetch(
    `${CALENDAR_API_BASE}/calendars/primary/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to insert event (${response.status}): ${error}`);
  }

  return await response.json() as CalendarEvent;
}

/**
 * Insert multiple transit events.
 * Returns the count of successfully created events.
 */
export async function insertTransitEvents(events: TransitEvent[]): Promise<number> {
  let successCount = 0;

  for (const event of events) {
    try {
      await insertTransitEvent(event);
      successCount++;
    } catch (error) {
      console.error('Failed to insert event:', event.summary, error);
    }
  }

  return successCount;
}
