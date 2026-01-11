/**
 * CLI Auth - File-based OAuth token management for CLI testing
 *
 * Reads tokens from cli-tokens.json in the project root, enabling the test runner
 * to use Google Calendar without Chrome extension context.
 *
 * Setup: Copy token.json from a previous OAuth flow (e.g., _past-projects/2025-calendar-cli/)
 * to cli-tokens.json in the project root, or run the extension to authenticate first.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

// Path to CLI tokens file (project root)
const PROJECT_ROOT = join(dirname(import.meta.path), "../..");
const TOKEN_FILE = join(PROJECT_ROOT, "cli-tokens.json");

interface PythonTokenData {
  token: string;
  refresh_token: string;
  token_uri: string;
  client_id: string;
  client_secret: string;
  scopes: string[];
  expiry: string; // ISO date string
}

/**
 * Read token data from Python CLI's token.json
 */
function readTokenFile(): PythonTokenData {
  if (!existsSync(TOKEN_FILE)) {
    throw new Error(
      `Token file not found at ${TOKEN_FILE}\n\nTo set up CLI tokens:\n  1. Copy token.json from a previous OAuth flow to cli-tokens.json\n  2. Or run the Chrome extension first to authenticate`,
    );
  }

  const content = readFileSync(TOKEN_FILE, "utf-8");
  return JSON.parse(content) as PythonTokenData;
}

/**
 * Write updated token data back to token.json
 */
function writeTokenFile(data: PythonTokenData): void {
  writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2));
}

/**
 * Check if the token is expired (with 60 second buffer)
 */
function isTokenExpired(expiryStr: string): boolean {
  const expiry = new Date(expiryStr);
  const now = new Date();
  const bufferMs = 60 * 1000; // 60 second buffer
  return now.getTime() >= expiry.getTime() - bufferMs;
}

/**
 * Refresh the access token using the refresh token
 */
async function refreshAccessToken(tokenData: PythonTokenData): Promise<PythonTokenData> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      refresh_token: tokenData.refresh_token,
      client_id: tokenData.client_id,
      client_secret: tokenData.client_secret,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const data = await response.json();

  // Calculate new expiry time
  const expiresInSeconds = data.expires_in || 3600;
  const newExpiry = new Date(Date.now() + expiresInSeconds * 1000);

  return {
    ...tokenData,
    token: data.access_token,
    expiry: newExpiry.toISOString(),
  };
}

/**
 * Get a valid access token, refreshing if necessary.
 * This function is compatible with calendarService's expected auth interface.
 */
export async function getAccessToken(): Promise<string> {
  let tokenData = readTokenFile();

  // Check if token is expired
  if (isTokenExpired(tokenData.expiry)) {
    console.log("Token expired, refreshing...");
    tokenData = await refreshAccessToken(tokenData);
    writeTokenFile(tokenData);
    console.log("Token refreshed successfully");
  }

  return tokenData.token;
}
