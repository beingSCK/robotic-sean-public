/**
 * Utility functions for Calendar Transit Extension
 */

import { DEFAULT_TIMEZONE, SECONDS_PER_MINUTE } from './config.ts';

/**
 * Parse an ISO 8601 datetime string to a Date object.
 * Handles both full datetime (2025-01-15T09:00:00-05:00) and date-only (2025-01-15).
 */
export function parseDateTime(dateTimeStr: string): Date {
  return new Date(dateTimeStr);
}

/**
 * Format a Date as ISO 8601 datetime string for Google Calendar API.
 * Example: 2025-01-15T09:00:00-05:00
 *
 * TODO: The timeZone parameter is currently ignored. This uses the local
 * machine's timezone offset. For proper timezone support, consider using
 * a library like date-fns-tz or Temporal API when it stabilizes.
 */
export function formatDateTime(date: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  // Get ISO string and handle timezone
  // For simplicity, we'll use the local ISO string format
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  // Get timezone offset
  const offset = date.getTimezoneOffset();
  const offsetHours = String(Math.abs(Math.floor(offset / 60))).padStart(2, '0');
  const offsetMinutes = String(Math.abs(offset % 60)).padStart(2, '0');
  const offsetSign = offset <= 0 ? '+' : '-';

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetSign}${offsetHours}:${offsetMinutes}`;
}

/**
 * Extract a short location name from a full address.
 * "1000 Union St, Brooklyn, NY 11225" -> "1000 Union St"
 */
export function getLocationName(location: string): string {
  // Take everything before the first comma
  const parts = location.split(',');
  return parts[0]?.trim() || location;
}

/**
 * Get the date string (YYYY-MM-DD) from a Date object.
 */
export function getDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get the hour (0-23) from an ISO datetime string.
 * Returns null if the string doesn't contain a time.
 */
export function getHourFromDateTime(dateTimeStr: string): number | null {
  // Format: 2025-01-15T09:00:00-05:00
  const match = dateTimeStr.match(/T(\d{2}):/);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  return null;
}

/**
 * Check if two addresses are the same location (case-insensitive).
 */
export function isSameLocation(loc1: string, loc2: string): boolean {
  return loc1.toLowerCase().trim() === loc2.toLowerCase().trim();
}

/**
 * Parse a duration string from Routes API (e.g., "1800s") to seconds.
 * Throws if the format is invalid.
 */
export function parseDurationSeconds(durationStr: string): number {
  const match = durationStr.match(/^(\d+)s$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${durationStr}`);
  }
  return parseInt(match[1], 10);
}

/**
 * Convert seconds to minutes, rounding up.
 */
export function toMinutes(seconds: number): number {
  return Math.ceil(seconds / SECONDS_PER_MINUTE);
}

/**
 * Extract the date string (YYYY-MM-DD) from an ISO datetime string.
 * More robust than substring(0, 10) - validates the format.
 */
export function extractDateString(dateTimeStr: string): string {
  const match = dateTimeStr.match(/^\d{4}-\d{2}-\d{2}/);
  if (!match) {
    throw new Error(`Invalid date format: ${dateTimeStr}`);
  }
  return match[0];
}

/**
 * Validate and trim an address string.
 * Throws if the address is empty after trimming.
 */
export function validateAddress(address: string, fieldName: string): string {
  const trimmed = address.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} address cannot be empty`);
  }
  return trimmed;
}
