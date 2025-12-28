/**
 * Calendar Service - Google Calendar API integration
 *
 * Auth is handled by authManager.ts. This module only makes API calls.
 */

import type { CalendarEvent, TransitEvent } from './types.ts';
import { getAccessToken } from './authManager.ts';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

/**
 * Fetch upcoming events from the primary calendar.
 */
export async function fetchEvents(daysForward: number): Promise<CalendarEvent[]> {
  const token = await getAccessToken();

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
  const token = await getAccessToken();

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
