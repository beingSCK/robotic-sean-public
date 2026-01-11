/**
 * Auth Manager - Centralized OAuth token management
 *
 * This module owns all token state: storage, retrieval, refresh, and OAuth coordination.
 * The actual OAuth flow runs in background.ts (must be in service worker to persist).
 */

import { OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET } from "./config.ts";
import type { TokenData } from "./types.ts";
import { STORAGE_KEYS } from "./types.ts";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/**
 * Get stored tokens from chrome.storage.local.
 */
async function getStoredTokens(): Promise<TokenData | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.OAUTH_TOKENS], (result) => {
      resolve(result[STORAGE_KEYS.OAUTH_TOKENS] || null);
    });
  });
}

/**
 * Store tokens in chrome.storage.local.
 */
async function storeTokens(tokens: TokenData): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.OAUTH_TOKENS]: tokens }, resolve);
  });
}

/**
 * Check if we have stored OAuth tokens.
 */
export async function hasTokens(): Promise<boolean> {
  const tokens = await getStoredTokens();
  return tokens != null;
}

/**
 * Clear stored tokens (logout).
 */
export async function clearAuth(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove([STORAGE_KEYS.OAUTH_TOKENS], resolve);
  });
}

/**
 * Check if OAuth just completed (background worker sets this flag).
 */
export async function onAuthComplete(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.OAUTH_JUST_COMPLETED], (result) => {
      resolve(result[STORAGE_KEYS.OAUTH_JUST_COMPLETED] === true);
    });
  });
}

/**
 * Clear the OAuth just completed flag.
 */
export async function clearAuthCompleteFlag(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove([STORAGE_KEYS.OAUTH_JUST_COMPLETED], resolve);
  });
}

/**
 * Request OAuth flow from background service worker.
 * The background worker persists even when popup closes.
 */
async function requestOAuthFromBackground(): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "START_OAUTH" }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response?.success) {
        resolve();
      } else {
        reject(new Error(response?.error || "OAuth failed"));
      }
    });
  });
}

/**
 * Refresh the access token using the refresh token.
 */
async function refreshAccessToken(refreshToken: string): Promise<TokenData> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
      grant_type: "refresh_token",
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
 * If no tokens exist, delegates to background worker for OAuth.
 */
export async function getAccessToken(): Promise<string> {
  console.log("getAccessToken called");
  let tokens = await getStoredTokens();
  console.log("Stored tokens:", tokens ? "found" : "none");

  // If no tokens, request OAuth from background worker
  if (!tokens) {
    console.log("No tokens, requesting OAuth from background...");
    await requestOAuthFromBackground();
    console.log("OAuth completed, fetching tokens...");
    tokens = await getStoredTokens();
    if (!tokens) {
      throw new Error("OAuth completed but no tokens found");
    }
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
        console.error("Token refresh failed, re-authenticating:", error);
        // Refresh failed, request fresh OAuth from background
        await requestOAuthFromBackground();
        tokens = await getStoredTokens();
        if (!tokens) {
          throw new Error("OAuth completed but no tokens found");
        }
        return tokens.access_token;
      }
    } else {
      // No refresh token, request fresh OAuth from background
      await requestOAuthFromBackground();
      tokens = await getStoredTokens();
      if (!tokens) {
        throw new Error("OAuth completed but no tokens found");
      }
      return tokens.access_token;
    }
  }

  return tokens.access_token;
}
