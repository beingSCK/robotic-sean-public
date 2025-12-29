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
  RouteResult,
} from './types.ts';
import { SkipReason, RoutesApiError } from './types.ts';
import {
  VIDEO_CALL_KEYWORDS,
  MIN_TRANSIT_MINUTES,
  MAX_TRANSIT_MINUTES,
  DEFAULT_TIMEZONE,
  MILLISECONDS_PER_MINUTE,
} from './config.ts';
import {
  parseDateTime,
  formatDateTime,
  getLocationName,
  getHourFromDateTime,
  isSameLocation,
  extractDateString,
} from './utils.ts';
import { getTransitTime } from './transitCalculator.ts';

// ============================================================================
// Event Filtering
// ============================================================================

/**
 * Determine if an event should be skipped for transit calculation.
 */
export function shouldSkipEvent(event: CalendarEvent, settings: UserSettings): SkipResult {
  // Skip if no location
  if (!event.location) {
    return { shouldSkip: true, reason: SkipReason.NO_LOCATION };
  }

  // Skip if already a transit event (by colorId)
  if (event.colorId === settings.transitColorId) {
    return { shouldSkip: true, reason: SkipReason.ALREADY_TRANSIT_EVENT };
  }

  // Skip video calls (has conferenceData)
  if (event.conferenceData) {
    return { shouldSkip: true, reason: SkipReason.VIDEO_CALL_CONFERENCE };
  }

  // Check for video call URLs in location
  const location = event.location.toLowerCase();
  for (const keyword of VIDEO_CALL_KEYWORDS) {
    if (location.includes(keyword)) {
      return { shouldSkip: true, reason: SkipReason.VIDEO_CALL_KEYWORD };
    }
  }

  // Skip overnight events (between 12am-6am)
  const start = event.start.dateTime;
  if (start) {
    const hour = getHourFromDateTime(start);
    if (hour !== null && hour >= 0 && hour < 6) {
      return { shouldSkip: true, reason: SkipReason.OVERNIGHT_EVENT };
    }
  }

  // Skip all-day events (they have 'date' not 'dateTime')
  if (event.start.date && !event.start.dateTime) {
    return { shouldSkip: true, reason: SkipReason.ALL_DAY_EVENT };
  }

  return { shouldSkip: false, reason: '' };
}

// ============================================================================
// Event Grouping
// ============================================================================

/**
 * Group events by their start date.
 */
export function groupEventsByDay(events: CalendarEvent[]): EventsByDay {
  const byDay: EventsByDay = {};

  for (const event of events) {
    const start = event.start.dateTime || event.start.date;
    if (!start) continue;

    const dateStr = extractDateString(start);

    if (!byDay[dateStr]) {
      byDay[dateStr] = [];
    }
    byDay[dateStr].push(event);
  }

  return byDay;
}

// ============================================================================
// Derived Event Creation
// ============================================================================

/**
 * Parameters for creating a derived calendar event.
 * "Derived" = programmatically created based on analysis of other events.
 */
interface DerivedEventParams {
  summary: string;
  location: string;
  startTime: Date;
  endTime: Date;
  timeZone: string;
  colorId: string;
  description: string;
}

/**
 * Create a derived calendar event from params.
 * Foundation for transit events and future event types (prep time, buffer, etc).
 */
function createDerivedEvent(params: DerivedEventParams): TransitEvent {
  return {
    summary: params.summary,
    location: params.location,
    colorId: params.colorId,
    start: {
      dateTime: formatDateTime(params.startTime),
      timeZone: params.timeZone,
    },
    end: {
      dateTime: formatDateTime(params.endTime),
      timeZone: params.timeZone,
    },
    description: params.description,
  };
}

/**
 * Create a transit event for traveling to a destination.
 */
function createTransitEvent(
  transitResult: RouteResult,
  previousLocation: string,
  previousLocationName: string,
  destination: string,
  eventStart: Date,
  timeZone: string,
  colorId: string
): TransitEvent {
  const modePrefix = transitResult.mode === 'driving' ? 'DRIVE' : 'TRANSIT';
  const destinationName = getLocationName(destination);
  const transitStartTime = new Date(
    eventStart.getTime() - transitResult.durationMinutes * MILLISECONDS_PER_MINUTE
  );

  return createDerivedEvent({
    summary: `${modePrefix}: ${previousLocationName} → ${destinationName}`,
    location: previousLocation,
    startTime: transitStartTime,
    endTime: eventStart,
    timeZone,
    colorId,
    description: `Arriving at: ${destination}\nTravel by ${transitResult.mode} (${transitResult.durationMinutes} min)`,
  });
}

/**
 * Create a return-home transit event.
 */
function createReturnHomeEvent(
  transitResult: RouteResult,
  previousLocation: string,
  previousLocationName: string,
  homeAddress: string,
  lastEventEnd: Date,
  timeZone: string,
  colorId: string
): TransitEvent {
  const modePrefix = transitResult.mode === 'driving' ? 'DRIVE' : 'TRANSIT';
  const returnEndTime = new Date(
    lastEventEnd.getTime() + transitResult.durationMinutes * MILLISECONDS_PER_MINUTE
  );

  return createDerivedEvent({
    summary: `${modePrefix}: ${previousLocationName} → Home`,
    location: previousLocation,
    startTime: lastEventEnd,
    endTime: returnEndTime,
    timeZone,
    colorId,
    description: `Returning home: ${homeAddress}\nTravel by ${transitResult.mode} (${transitResult.durationMinutes} min)`,
  });
}

// ============================================================================
// Transit Duration Validation
// ============================================================================

/**
 * Check if a transit duration is valid (within min/max bounds).
 */
function isValidTransitDuration(durationMinutes: number): { valid: boolean; reason?: string } {
  if (durationMinutes < MIN_TRANSIT_MINUTES) {
    return { valid: false, reason: `too short (${durationMinutes} min)` };
  }
  if (durationMinutes > MAX_TRANSIT_MINUTES) {
    return { valid: false, reason: `too long (${durationMinutes} min)` };
  }
  return { valid: true };
}

// ============================================================================
// Main Processing
// ============================================================================

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
        continue; // No location to update for truly skipped events
      }

      // Validate required fields (shouldSkipEvent ensures location exists, but be explicit)
      if (!event.location || !event.start.dateTime) {
        continue;
      }

      const location = event.location;
      const eventStart = event.start.dateTime;
      const timeZone = event.start.timeZone || DEFAULT_TIMEZONE;

      // Determine if we should create a transit event
      let transitEvent: TransitEvent | null = null;

      if (!isSameLocation(location, previousLocation)) {
        try {
          const transitResult = await getTransitTime(previousLocation, location);

          if (transitResult && isValidTransitDuration(transitResult.durationMinutes).valid) {
            const eventStartDate = parseDateTime(eventStart);
            transitEvent = createTransitEvent(
              transitResult,
              previousLocation,
              previousLocationName,
              location,
              eventStartDate,
              timeZone,
              settings.transitColorId
            );
          }
        } catch (error) {
          if (error instanceof RoutesApiError) {
            onProgress?.(`  API error for "${event.summary}": ${error.message}`);
          }
        }
      }

      // Add transit event if created
      if (transitEvent) {
        transitEvents.push(transitEvent);
        onProgress?.(`  Created: ${transitEvent.summary}`);
      }

      // SINGLE state update at end of loop
      previousLocation = location;
      previousLocationName = getLocationName(location);
    }

    // Add return-home transit after last event (if not already home)
    if (!isSameLocation(previousLocation, settings.homeAddress) && dayEvents.length > 0) {
      const lastEvent = dayEvents.findLast(
        (e) => e.start.dateTime && !shouldSkipEvent(e, settings).shouldSkip
      );

      if (lastEvent?.end?.dateTime) {
        let returnTransit: RouteResult | null;
        try {
          returnTransit = await getTransitTime(previousLocation, settings.homeAddress);
        } catch (error) {
          if (error instanceof RoutesApiError) {
            onProgress?.(`  API error for return home: ${error.message}`);
          }
          continue; // Continue to next day (we're in the outer date loop here)
        }

        if (returnTransit && returnTransit.durationMinutes >= MIN_TRANSIT_MINUTES) {
          const lastEventEnd = parseDateTime(lastEvent.end.dateTime);
          const timeZone = lastEvent.end.timeZone || DEFAULT_TIMEZONE;

          const returnEvent = createReturnHomeEvent(
            returnTransit,
            previousLocation,
            previousLocationName,
            settings.homeAddress,
            lastEventEnd,
            timeZone,
            settings.transitColorId
          );

          transitEvents.push(returnEvent);
          onProgress?.(`  Created return: ${returnEvent.summary} (${returnTransit.durationMinutes} min)`);
        }
      }
    }
  }

  return transitEvents;
}
