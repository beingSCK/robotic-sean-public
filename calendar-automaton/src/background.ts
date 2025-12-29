/**
 * Background Service Worker for Calendar Transit Robot
 * Handles OAuth flow so it persists even when popup closes.
 */

import type { TokenData } from './types.ts';
import { STORAGE_KEYS } from './types.ts';
import {
  OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET,
  OAUTH_SCOPES,
} from './config.ts';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

interface OAuthMessage {
  type: 'START_OAUTH';
}

interface OAuthResponse {
  success: boolean;
  error?: string;
}

/**
 * Get the redirect URL for this extension.
 */
function getRedirectUrl(): string {
  return chrome.identity.getRedirectURL();
}

/**
 * Launch OAuth flow and store tokens.
 * This runs in the service worker so it persists even if popup closes.
 */
async function handleOAuth(): Promise<OAuthResponse> {
  const redirectUrl = getRedirectUrl();

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', OAUTH_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUrl);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', OAUTH_SCOPES.join(' '));
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  return new Promise((resolve) => {
    chrome.identity.launchWebAuthFlow(
      {
        url: authUrl.toString(),
        interactive: true,
      },
      async (responseUrl) => {
        if (chrome.runtime.lastError) {
          console.error('OAuth error:', chrome.runtime.lastError.message);
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }

        if (!responseUrl) {
          resolve({ success: false, error: 'No redirect URL returned' });
          return;
        }

        try {
          // Parse the authorization code
          const url = new URL(responseUrl);
          const code = url.searchParams.get('code');
          if (!code) {
            const error = url.searchParams.get('error');
            resolve({ success: false, error: error || 'No authorization code' });
            return;
          }

          // Exchange code for tokens
          console.log('Background: Exchanging code for tokens...');
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
            resolve({ success: false, error: `Token exchange failed: ${error}` });
            return;
          }

          const data = await response.json();
          const tokens: TokenData = {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: Date.now() + (data.expires_in - 60) * 1000,
          };

          // Store tokens
          await chrome.storage.local.set({ [STORAGE_KEYS.OAUTH_TOKENS]: tokens });
          console.log('Background: Tokens stored successfully');

          // Set flag so popup knows OAuth just completed
          await chrome.storage.local.set({ [STORAGE_KEYS.OAUTH_JUST_COMPLETED]: true });

          resolve({ success: true });
        } catch (err) {
          console.error('Background: OAuth error:', err);
          resolve({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
        }
      }
    );
  });
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message: OAuthMessage, _sender, sendResponse) => {
  if (message.type === 'START_OAUTH') {
    console.log('Background: Received START_OAUTH message');
    handleOAuth().then(sendResponse);
    return true; // Keep channel open for async response
  }
});

console.log('Background service worker loaded');
