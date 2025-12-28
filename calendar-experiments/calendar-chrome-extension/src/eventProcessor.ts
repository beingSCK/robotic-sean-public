/**
 * Event Processor - Core logic for calculating transit events
 * Ported from add_transit.py (simplified for MVP)
 */

import type {
  CalendarEvent,
  TransitEvent,
  UserSettings,
  SkipResult,
  EventsByDay,
} from './types.ts';
import {
  VIDEO_CALL_KEYWORDS,
  MIN_TRANSIT_MINUTES,
  MAX_TRANSIT_MINUTES,
  DEFAULT_TIMEZONE,
} from './config.ts';
import {
  parseDateTime,
  formatDateTime,
  getLocationName,
  getDateString,
  getHourFromDateTime,
  isSameLocation,
} from './utils.ts';
import { getTransitTime } from './transitCalculator.ts';

/**
 * Determine if an event should be skipped for transit calculation.
 */
export function shouldSkipEvent(event: CalendarEvent, settings: UserSettings): SkipResult {
  const summary = event.summary || '(no title)';

  // Skip if no location
  if (!event.location) {
    return { shouldSkip: true, reason: 'no location' };
  }

  // Skip if already a transit event (by colorId)
  if (event.colorId === settings.transitColorId) {
    return { shouldSkip: true, reason: 'already a transit event' };
  }

  // Skip video calls (has conferenceData)
  if (event.conferenceData) {
    return { shouldSkip: true, reason: 'video call (has conferenceData)' };
  }

  // Check for video call URLs in location
  const location = event.location.toLowerCase();
  for (const keyword of VIDEO_CALL_KEYWORDS) {
    if (location.includes(keyword)) {
      return { shouldSkip: true, reason: `video call (${keyword} in location)` };
    }
  }

  // Skip overnight events (between 12am-6am)
  const start = event.start.dateTime;
  if (start) {
    const hour = getHourFromDateTime(start);
    if (hour !== null && hour >= 0 && hour < 6) {
      return { shouldSkip: true, reason: 'overnight event (12am-6am)' };
    }
  }

  // Skip all-day events (they have 'date' not 'dateTime')
  if (event.start.date && !event.start.dateTime) {
    return { shouldSkip: true, reason: 'all-day event' };
  }

  return { shouldSkip: false, reason: '' };
}

/**
 * Group events by their start date.
 */
export function groupEventsByDay(events: CalendarEvent[]): EventsByDay {
  const byDay: EventsByDay = {};

  for (const event of events) {
    const start = event.start.dateTime || event.start.date;
    if (!start) continue;

    // Extract just the date part (YYYY-MM-DD)
    const dateStr = start.substring(0, 10);

    if (!byDay[dateStr]) {
      byDay[dateStr] = [];
    }
    byDay[dateStr].push(event);
  }

  return byDay;
}

/**
 * Calculate transit events for a list of calendar events.
 * This is the main processing function.
 */
export async function calculateTransitEvents(
  events: CalendarEvent[],
  settings: UserSettings,
  onProgress?: (message: string) => void
): Promise<TransitEvent[]> {
  const transitEvents: TransitEvent[] = [];
  const byDay = groupEventsByDay(events);
  const sortedDates = Object.keys(byDay).sort();

  for (const dateStr of sortedDates) {
    const dayEvents = byDay[dateStr];
    if (!dayEvents || dayEvents.length === 0) continue;

    onProgress?.(`Processing ${dateStr}...`);

    let previousLocation = settings.homeAddress;
    let previousLocationName = 'Home';

    // Process each event in order
    for (const event of dayEvents) {
      const skipResult = shouldSkipEvent(event, settings);
      if (skipResult.shouldSkip) {
        onProgress?.(`  Skipping "${event.summary}": ${skipResult.reason}`);
        continue;
      }

      const location = event.location!;
      const eventStart = event.start.dateTime!;
      const timeZone = event.start.timeZone || DEFAULT_TIMEZONE;

      // Skip if same location as previous
      if (isSameLocation(location, previousLocation)) {
        onProgress?.(`  Skipping "${event.summary}": same location`);
        previousLocation = location;
        previousLocationName = getLocationName(location);
        continue;
      }

      // Calculate transit time
      onProgress?.(`  Calculating transit to "${event.summary}"...`);
      const transitResult = await getTransitTime(previousLocation, location);

      if (!transitResult) {
        onProgress?.(`  No route found to "${event.summary}"`);
        previousLocation = location;
        previousLocationName = getLocationName(location);
        continue;
      }

      // Skip very short or very long transits
      if (transitResult.durationMinutes < MIN_TRANSIT_MINUTES) {
        onProgress?.(`  Transit too short (${transitResult.durationMinutes} min)`);
        previousLocation = location;
        previousLocationName = getLocationName(location);
        continue;
      }

      if (transitResult.durationMinutes > MAX_TRANSIT_MINUTES) {
        onProgress?.(`  Transit too long (${transitResult.durationMinutes} min)`);
        previousLocation = location;
        previousLocationName = getLocationName(location);
        continue;
      }

      // Calculate transit event times
      const eventStartDate = parseDateTime(eventStart);
      const transitStartDate = new Date(
        eventStartDate.getTime() - transitResult.durationMinutes * 60 * 1000
      );

      // Build the transit event
      const modePrefix = transitResult.mode === 'driving' ? 'DRIVE' : 'TRANSIT';
      const destinationName = getLocationName(location);

      const transitEvent: TransitEvent = {
        summary: `${modePrefix}: ${previousLocationName} → ${destinationName}`,
        location: previousLocation,
        colorId: settings.transitColorId,
        start: {
          dateTime: formatDateTime(transitStartDate),
          timeZone,
        },
        end: {
          dateTime: formatDateTime(eventStartDate),
          timeZone,
        },
        description: `Arriving at: ${location}\nTravel by ${transitResult.mode} (${transitResult.durationMinutes} min)`,
      };

      transitEvents.push(transitEvent);
      onProgress?.(
        `  Created: ${transitEvent.summary} (${transitResult.durationMinutes} min)`
      );

      // Update previous location for next iteration
      previousLocation = location;
      previousLocationName = destinationName;
    }

    // Add return-home transit after last event (if not already home)
    if (!isSameLocation(previousLocation, settings.homeAddress) && dayEvents.length > 0) {
      // Find the last non-skipped event with a dateTime
      const lastEvent = [...dayEvents].reverse().find(
        (e) => e.start.dateTime && !shouldSkipEvent(e, settings).shouldSkip
      );

      if (lastEvent && lastEvent.end?.dateTime) {
        onProgress?.(`  Calculating return home transit...`);
        const returnTransit = await getTransitTime(previousLocation, settings.homeAddress);

        if (returnTransit && returnTransit.durationMinutes >= MIN_TRANSIT_MINUTES) {
          const lastEventEnd = parseDateTime(lastEvent.end.dateTime);
          const returnEndDate = new Date(
            lastEventEnd.getTime() + returnTransit.durationMinutes * 60 * 1000
          );
          const timeZone = lastEvent.end.timeZone || DEFAULT_TIMEZONE;

          const modePrefix = returnTransit.mode === 'driving' ? 'DRIVE' : 'TRANSIT';

          transitEvents.push({
            summary: `${modePrefix}: ${previousLocationName} → Home`,
            location: previousLocation,
            colorId: settings.transitColorId,
            start: {
              dateTime: formatDateTime(lastEventEnd),
              timeZone,
            },
            end: {
              dateTime: formatDateTime(returnEndDate),
              timeZone,
            },
            description: `Returning home: ${settings.homeAddress}\nTravel by ${returnTransit.mode} (${returnTransit.durationMinutes} min)`,
          });

          onProgress?.(
            `  Created return: ${modePrefix}: ${previousLocationName} → Home (${returnTransit.durationMinutes} min)`
          );
        }
      }
    }
  }

  return transitEvents;
}
