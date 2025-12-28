/**
 * Type definitions for Calendar Transit Extension
 */

// Storage keys - single source of truth for chrome.storage keys
export const STORAGE_KEYS = {
  OAUTH_TOKENS: 'oauth_tokens',
  OAUTH_JUST_COMPLETED: 'oauthJustCompleted',
} as const;

// OAuth token data stored in chrome.storage.local
export interface TokenData {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // Unix timestamp in ms
}

// Google Calendar API event structure (partial, what we use)
export interface CalendarEvent {
  id: string;
  summary?: string;
  location?: string;
  start: {
    dateTime?: string;  // ISO 8601 format
    date?: string;      // YYYY-MM-DD for all-day events
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  colorId?: string;
  conferenceData?: object;  // Present if it's a video call
  description?: string;
}

// Transit event we create
export interface TransitEvent {
  summary: string;
  location: string;
  colorId: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  description: string;
}

// Result from Routes API
export interface RouteResult {
  durationMinutes: number;
  distanceMeters: number;
  mode: 'transit' | 'driving';
}

// User settings stored in chrome.storage
export interface UserSettings {
  homeAddress: string;
  daysForward: number;
  transitColorId: string;
}

// Skip result for event filtering
export interface SkipResult {
  shouldSkip: boolean;
  reason: string;
}

// Events grouped by date
export type EventsByDay = Record<string, CalendarEvent[]>;
