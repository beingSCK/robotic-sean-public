# Auth Refactor Summary

## Problem
Authentication code was scattered across 3 files with unclear ownership:
- `background.ts` - OAuth flow, initial token storage
- `calendarService.ts` - token retrieval, refresh, re-auth
- `popup/popup.ts` - auth state checking, flag management

Issues included:
- `TokenData` interface duplicated in 2 files
- Dead code: `exchangeCodeForTokens()` defined but never called
- Dead code: `pendingScan` flag set but never read
- 7+ storage helper functions scattered across files
- Magic string keys (`"oauth_tokens"`, `"oauthJustCompleted"`) with no constants

## Solution
Created a centralized `authManager.ts` module that owns all token state.

### New Architecture

```
background.ts          → Runs OAuth flow (must be in service worker)
        ↓
authManager.ts         → Owns all token state (storage, refresh, retrieval)
        ↓
calendarService.ts     → Just makes API calls, gets tokens from authManager
        ↓
popup.ts               → UI, imports auth helpers from authManager
```

## Files Changed

### New: `src/authManager.ts`
Exports:
- `getAccessToken()` - get valid token, refreshing/re-authing as needed
- `hasTokens()` - check if authenticated
- `clearAuth()` - logout
- `onAuthComplete()` - check if OAuth just completed
- `clearAuthCompleteFlag()` - clear the completion flag

### Modified: `src/types.ts`
Added:
```typescript
export const STORAGE_KEYS = {
  OAUTH_TOKENS: 'oauth_tokens',
  OAUTH_JUST_COMPLETED: 'oauthJustCompleted',
} as const;

export interface TokenData {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
}
```

### Modified: `src/background.ts`
- Removed duplicate `TokenData` interface (now imports from types.ts)
- Removed `storeTokens()` helper (inlined with storage constants)
- Removed dead `pendingScan` flag
- Uses `STORAGE_KEYS` constants instead of magic strings

### Modified: `src/calendarService.ts`
- Removed ~160 lines of auth code
- Now just imports `getAccessToken` from authManager
- Only contains API functions: `fetchEvents`, `insertTransitEvent`, `insertTransitEvents`

### Modified: `popup/popup.ts`
- Imports `hasTokens`, `onAuthComplete`, `clearAuthCompleteFlag`, `clearAuth` from authManager
- Removed 5 local auth helper functions
- Added `handleDisconnect()` for logout button

### Modified: `popup/popup.html`
- Added disconnect button in settings section

### Modified: `popup/popup.css`
- Added `.btn.danger` style for disconnect button

## Code Deleted
- `TokenData` interface in `background.ts` (duplicate)
- `TokenData` interface in `calendarService.ts` (duplicate)
- `exchangeCodeForTokens()` in `calendarService.ts` (dead code, never called)
- `pendingScan` flag in `background.ts` (dead code, never read)
- `storeTokens()` in `background.ts` (duplicate of calendarService version)
- `getRedirectUrl()` in `calendarService.ts` (duplicate, only needed in background)
- `getStoredTokens()`, `storeTokens()`, `refreshAccessToken()`, `requestOAuthFromBackground()`, `getAuthToken()`, `clearTokens()` in `calendarService.ts` (moved to authManager)
- `checkOAuthJustCompleted()`, `clearOAuthJustCompleted()`, `hasStoredTokens()` in `popup.ts` (moved to authManager)

## New Feature
**Disconnect button** - Allows user to log out of Google Calendar. Visible in Settings when authenticated.
