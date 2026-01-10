/**
 * Event Processor - Core logic for calculating transit events
 * Ported from add_transit.py (simplified for MVP)
 */

import {
  DEFAULT_HOME_AIRPORTS,
  DEFAULT_TIMEZONE,
  FLIGHT_KEYWORDS,
  MAX_TRANSIT_MINUTES,
  MAX_WALKABLE_MINUTES,
  MILLISECONDS_PER_MINUTE,
  MIN_TRIP_MINUTES,
  SHORT_TRIP_THRESHOLD_MINUTES,
  STAY_KEYWORDS,
  VIDEO_CALL_KEYWORDS,
} from "./config.ts";
import { getTransitTime, getWalkingTime } from "./transitCalculator.ts";
import type {
  CalendarEvent,
  EventsByDay,
  RouteResult,
  SkipResult,
  TransitEvent,
  UserSettings,
} from "./types.ts";
import { RoutesApiError, SkipReason } from "./types.ts";
import {
  extractDateString,
  formatDateTime,
  getHourFromDateTime,
  getLocationName,
  isSameLocation,
  parseDateTime,
} from "./utils.ts";

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

  // Skip "hold" events (colorId 8 = graphite) - tentative/conditional events not yet confirmed
  if (event.colorId === "8") {
    return { shouldSkip: true, reason: SkipReason.HOLD_EVENT };
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

  return { shouldSkip: false, reason: "" };
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
 *
 * @param transitResult - Route result from Routes API
 * @param previousLocation - Starting address
 * @param previousLocationName - Display name for origin
 * @param destination - Destination address
 * @param eventStart - When the destination event starts
 * @param timeZone - Timezone for the event
 * @param colorId - Google Calendar color ID
 * @param modeOverride - Optional: override the travel mode (for WALK events)
 * @param durationOverride - Optional: override the duration in minutes (for WALK events)
 */
function createTransitEvent(
  transitResult: RouteResult,
  previousLocation: string,
  previousLocationName: string,
  destination: string,
  eventStart: Date,
  timeZone: string,
  colorId: string,
  modeOverride?: "drive" | "transit" | "walk",
  durationOverride?: number,
): TransitEvent {
  // Use overrides if provided, otherwise derive from transitResult
  const effectiveMode = modeOverride || transitResult.mode;
  const effectiveDuration = durationOverride ?? transitResult.durationMinutes;

  // Determine display prefix based on mode
  let modePrefix: string;
  let modeDescription: string;
  if (effectiveMode === "walk") {
    modePrefix = "WALK";
    modeDescription = "walking";
  } else if (effectiveMode === "driving" || effectiveMode === "drive") {
    modePrefix = "DRIVE";
    modeDescription = "driving";
  } else {
    modePrefix = "TRANSIT";
    modeDescription = "transit";
  }

  const destinationName = getLocationName(destination);
  const transitStartTime = new Date(
    eventStart.getTime() - effectiveDuration * MILLISECONDS_PER_MINUTE,
  );

  return createDerivedEvent({
    summary: `${modePrefix}: ${previousLocationName} → ${destinationName}`,
    location: previousLocation,
    startTime: transitStartTime,
    endTime: eventStart,
    timeZone,
    colorId,
    description: `Arriving at: ${destination}\nTravel by ${modeDescription} (${effectiveDuration} min)`,
  });
}

/**
 * Create a return-home transit event.
 *
 * @param transitResult - Route result from Routes API
 * @param previousLocation - Starting address
 * @param previousLocationName - Display name for origin
 * @param homeAddress - Home address
 * @param lastEventEnd - When the last event ends (start of return trip)
 * @param timeZone - Timezone for the event
 * @param colorId - Google Calendar color ID
 * @param modeOverride - Optional: override the travel mode (for WALK events)
 * @param durationOverride - Optional: override the duration in minutes (for WALK events)
 */
function createReturnHomeEvent(
  transitResult: RouteResult,
  previousLocation: string,
  previousLocationName: string,
  homeAddress: string,
  lastEventEnd: Date,
  timeZone: string,
  colorId: string,
  modeOverride?: "drive" | "transit" | "walk",
  durationOverride?: number,
): TransitEvent {
  // Use overrides if provided, otherwise derive from transitResult
  const effectiveMode = modeOverride || transitResult.mode;
  const effectiveDuration = durationOverride ?? transitResult.durationMinutes;

  // Determine display prefix based on mode
  let modePrefix: string;
  let modeDescription: string;
  if (effectiveMode === "walk") {
    modePrefix = "WALK";
    modeDescription = "walking";
  } else if (effectiveMode === "driving" || effectiveMode === "drive") {
    modePrefix = "DRIVE";
    modeDescription = "driving";
  } else {
    modePrefix = "TRANSIT";
    modeDescription = "transit";
  }

  const returnEndTime = new Date(
    lastEventEnd.getTime() + effectiveDuration * MILLISECONDS_PER_MINUTE,
  );

  return createDerivedEvent({
    summary: `${modePrefix}: ${previousLocationName} → Home`,
    location: previousLocation,
    startTime: lastEventEnd,
    endTime: returnEndTime,
    timeZone,
    colorId,
    description: `Returning home: ${homeAddress}\nTravel by ${modeDescription} (${effectiveDuration} min)`,
  });
}

// ============================================================================
// Trip Duration Validation
// ============================================================================

/**
 * Result of trip duration validation.
 * - Invalid: { valid: false, reason: string }
 * - Valid (drive): { valid: true, mode: 'drive' } or { valid: true } (mode defaults to drive)
 * - Valid (walk): { valid: true, mode: 'walk', walkMinutes: number }
 */
type TripValidationResult =
  | { valid: false; reason: string }
  | { valid: true; mode?: "drive" | "walk"; walkMinutes?: number };

/**
 * Check if a trip duration is valid, considering walkability.
 *
 * Decision tree:
 * - Below MIN_TRIP_MINUTES: Invalid (trivially short)
 * - Above SHORT_TRIP_THRESHOLD_MINUTES: Valid (standard trip)
 * - Above MAX_TRANSIT_MINUTES: Invalid (sanity cap)
 * - In between ("short trip zone"): Valid if low-transit OR not walkable
 */
async function isValidTripDuration(
  driveDurationMin: number,
  origin: string,
  destination: string,
  lowTransitLocations: string[] = [],
): Promise<TripValidationResult> {
  // Sanity cap - skip unreasonably long trips
  if (driveDurationMin > MAX_TRANSIT_MINUTES) {
    return { valid: false, reason: `too long (${driveDurationMin} min)` };
  }

  // Above standard threshold - always valid
  if (driveDurationMin >= SHORT_TRIP_THRESHOLD_MINUTES) {
    return { valid: true };
  }

  // Below absolute minimum - always invalid
  if (driveDurationMin < MIN_TRIP_MINUTES) {
    return { valid: false, reason: `too short (${driveDurationMin} min)` };
  }

  // In the "short trip zone" (MIN_TRIP_MINUTES to SHORT_TRIP_THRESHOLD_MINUTES)
  // Apply smart checks

  // If low-transit location, include drive event (can't walk there anyway)
  if (
    isLowTransitLocation(origin, lowTransitLocations) ||
    isLowTransitLocation(destination, lowTransitLocations)
  ) {
    return { valid: true, mode: "drive" };
  }

  // Otherwise, check if it's walkable
  try {
    const walkTime = await getWalkingTime(origin, destination);

    if (walkTime === null) {
      // No walk route available → keep drive event
      return { valid: true, mode: "drive" };
    }

    if (walkTime > MAX_WALKABLE_MINUTES) {
      // Too far to walk → keep drive event
      return { valid: true, mode: "drive" };
    }

    if (walkTime >= MIN_TRIP_MINUTES) {
      // Walkable and worth tracking → create WALK event
      return { valid: true, mode: "walk", walkMinutes: walkTime };
    }

    // Walk is too short to track
    return { valid: false, reason: `too short to track (${walkTime} min walk)` };
  } catch {
    // API error getting walk time - fall back to drive event
    return { valid: true, mode: "drive" };
  }
}

// ============================================================================
// Trip Date Detection
// ============================================================================

/**
 * Detect trip date ranges from calendar events.
 * Returns a Set of date strings (YYYY-MM-DD) that are "trip days" where transit should be skipped.
 *
 * Detection methods:
 * 1. Outbound flights (departing from home airports)
 * 2. Stay events (hotel, airbnb - all-day events with date ranges)
 */
function detectTripDates(
  events: CalendarEvent[],
  homeAirports: string[] = DEFAULT_HOME_AIRPORTS,
): Set<string> {
  const tripDates = new Set<string>();

  for (const event of events) {
    const summary = (event.summary || "").toLowerCase();
    const location = (event.location || "").toLowerCase();

    // Method 1: Detect flights departing from home airports
    const isFlight = FLIGHT_KEYWORDS.some((kw) => summary.includes(kw));

    if (isFlight) {
      // Check if departing from home area
      const isOutbound = homeAirports.some((airport) => location.includes(airport.toLowerCase()));

      if (isOutbound) {
        // Get flight date
        const flightDate = extractDateString(event.start.dateTime || event.start.date || "");
        if (flightDate) {
          tripDates.add(flightDate);
        }
      }
    }

    // Method 2: Detect stay events (hotel, airbnb)
    const isStay = STAY_KEYWORDS.some((kw) => summary.includes(kw));

    if (isStay) {
      // Stay events are typically all-day events with 'date' field
      const startDate = event.start.date;
      const endDate = event.end?.date;

      if (startDate && endDate) {
        // Add all dates in the stay range
        let current = new Date(startDate);
        const end = new Date(endDate);

        while (current < end) {
          tripDates.add(current.toISOString().slice(0, 10));
          current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
        }
      }
    }
  }

  return tripDates;
}

// ============================================================================
// Low-Transit Location Detection
// ============================================================================

/**
 * Check if an address matches any low-transit location patterns.
 * Returns true if the address is in an area with limited transit options (force driving).
 */
function isLowTransitLocation(address: string, lowTransitLocations: string[] = []): boolean {
  const addressLower = address.toLowerCase();
  for (const pattern of lowTransitLocations) {
    if (addressLower.includes(pattern.toLowerCase())) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// Overlap Detection
// ============================================================================

/**
 * Check if a proposed transit event would overlap with any existing transit event.
 * Two events overlap if one starts before the other ends.
 */
function overlapsExistingTransit(
  start: Date,
  end: Date,
  events: CalendarEvent[],
  transitColorId: string,
): boolean {
  for (const event of events) {
    // Only check existing transit events
    if (event.colorId !== transitColorId) {
      continue;
    }

    // Get event times
    const eventStartStr = event.start.dateTime;
    const eventEndStr = event.end?.dateTime;

    if (!eventStartStr || !eventEndStr) {
      continue;
    }

    const eventStart = parseDateTime(eventStartStr);
    const eventEnd = parseDateTime(eventEndStr);

    // Check for overlap: events overlap if one starts before the other ends
    if (start < eventEnd && end > eventStart) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// Logging Helpers
// ============================================================================

type ProgressCallback = ((message: string) => void) | undefined;

/** Log a skip event with consistent formatting */
function logSkip(onProgress: ProgressCallback, eventName: string, reason: string): void {
  onProgress?.(`  Skip "${eventName}": ${reason}`);
}

/** Log a transit event creation */
function logCreate(onProgress: ProgressCallback, summary: string, durationMin?: number): void {
  const suffix = durationMin !== undefined ? ` (${durationMin} min)` : "";
  onProgress?.(`  Create: ${summary}${suffix}`);
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
  onProgress?: (message: string) => void,
): Promise<TransitEvent[]> {
  const transitEvents: TransitEvent[] = [];
  const byDay = groupEventsByDay(events);
  const sortedDates = Object.keys(byDay).sort();

  // Detect trip dates if enabled
  let tripDates: Set<string>;
  if (settings.detectTrips) {
    tripDates = detectTripDates(events, settings.homeAirports || DEFAULT_HOME_AIRPORTS);
    if (tripDates.size > 0) {
      onProgress?.(`Detected trip dates: ${Array.from(tripDates).sort().join(", ")}`);
    }
  } else {
    tripDates = new Set();
  }

  // Get today's date string for skipping past dates
  // (Past events are still fetched for context like stay detection, but we don't create transit for them)
  const todayStr = new Date().toISOString().slice(0, 10);

  for (const dateStr of sortedDates) {
    const dayEvents = byDay[dateStr];
    if (!dayEvents || dayEvents.length === 0) continue;

    // Skip creating transit for past dates
    // (Past events are still used for context - e.g., stay detection for dynamic home)
    if (dateStr < todayStr) {
      continue; // Silent skip - past dates aren't actionable
    }

    // Skip entire day if it's a trip day
    if (tripDates.has(dateStr)) {
      onProgress?.(`Skipping ${dateStr} (trip day)`);
      continue;
    }

    onProgress?.(`Processing ${dateStr}...`);

    let previousLocation = settings.homeAddress;
    let previousLocationName = "Home";
    let previousEventEnd: Date | null = null; // Track when previous event ends for departure time

    // Process each event in order
    for (const event of dayEvents) {
      const eventName = event.summary || "(untitled)";
      const skipResult = shouldSkipEvent(event, settings);
      if (skipResult.shouldSkip) {
        logSkip(onProgress, eventName, skipResult.reason);
        continue; // No location to update for truly skipped events
      }

      // Validate required fields (shouldSkipEvent ensures location exists, but be explicit)
      if (!event.location || !event.start.dateTime) {
        continue;
      }

      const location = event.location;
      const eventStart = event.start.dateTime;
      const timeZone = event.start.timeZone || DEFAULT_TIMEZONE;

      // Pre-compute event start for departure time calculation
      const eventStartDate = parseDateTime(eventStart);

      if (isSameLocation(location, previousLocation)) {
        logSkip(onProgress, eventName, `same location as ${previousLocationName}`);
      } else {
        try {
          // Check if origin or destination is a low-transit location
          const forceDrive =
            isLowTransitLocation(previousLocation, settings.lowTransitLocations) ||
            isLowTransitLocation(location, settings.lowTransitLocations);

          // Compute departure time for traffic-aware routing
          // If we have a previous event end time, use that; otherwise estimate from event start
          const departureTime = previousEventEnd
            ? previousEventEnd
            : new Date(eventStartDate.getTime() - 60 * MILLISECONDS_PER_MINUTE);

          const transitResult = await getTransitTime(
            previousLocation,
            location,
            forceDrive,
            departureTime,
          );

          if (!transitResult) {
            logSkip(onProgress, eventName, "no route found");
          } else {
            // Validate duration with smart walkability checks
            const durationCheck = await isValidTripDuration(
              transitResult.durationMinutes,
              previousLocation,
              location,
              settings.lowTransitLocations,
            );

            if (!durationCheck.valid) {
              logSkip(onProgress, eventName, `duration ${durationCheck.reason}`);
            } else {
              // Determine effective mode and duration (WALK events use walk time)
              const effectiveMode = durationCheck.mode;
              const effectiveDuration = durationCheck.walkMinutes ?? transitResult.durationMinutes;

              // eventStartDate already computed above for departure time
              const transitStartTime = new Date(
                eventStartDate.getTime() - effectiveDuration * MILLISECONDS_PER_MINUTE,
              );

              // Check for overlap with existing transit events
              if (
                overlapsExistingTransit(
                  transitStartTime,
                  eventStartDate,
                  events,
                  settings.transitColorId,
                )
              ) {
                logSkip(onProgress, eventName, "overlaps existing transit");
              } else {
                const transitEvent = createTransitEvent(
                  transitResult,
                  previousLocation,
                  previousLocationName,
                  location,
                  eventStartDate,
                  timeZone,
                  settings.transitColorId,
                  effectiveMode,
                  durationCheck.walkMinutes, // Only pass if it's a WALK event
                );
                transitEvents.push(transitEvent);
                logCreate(onProgress, transitEvent.summary, effectiveDuration);
              }
            }
          }
        } catch (error) {
          if (error instanceof RoutesApiError) {
            logSkip(onProgress, eventName, `API error: ${error.message}`);
          }
        }
      }

      // SINGLE state update at end of loop
      previousLocation = location;
      previousLocationName = getLocationName(location);
      // Track when this event ends for next iteration's departure time
      if (event.end?.dateTime) {
        previousEventEnd = parseDateTime(event.end.dateTime);
      }
    }

    // Add return-home transit after last event (if not already home)
    if (!isSameLocation(previousLocation, settings.homeAddress)) {
      const lastEvent = dayEvents.findLast(
        (e) => e.start.dateTime && !shouldSkipEvent(e, settings).shouldSkip,
      );

      if (lastEvent?.end?.dateTime) {
        const returnLabel = "Return home";
        const lastEventEnd = parseDateTime(lastEvent.end.dateTime);
        let returnTransit: RouteResult | null;
        try {
          // Check if origin or destination is a low-transit location
          const forceDrive =
            isLowTransitLocation(previousLocation, settings.lowTransitLocations) ||
            isLowTransitLocation(settings.homeAddress, settings.lowTransitLocations);

          // Use last event end as departure time for traffic-aware routing
          returnTransit = await getTransitTime(
            previousLocation,
            settings.homeAddress,
            forceDrive,
            lastEventEnd,
          );
        } catch (error) {
          if (error instanceof RoutesApiError) {
            logSkip(onProgress, returnLabel, `API error: ${error.message}`);
          }
          continue; // Continue to next day (we're in the outer date loop here)
        }

        if (!returnTransit) {
          logSkip(onProgress, returnLabel, "no route found");
        } else {
          // Validate duration with smart walkability checks
          const durationCheck = await isValidTripDuration(
            returnTransit.durationMinutes,
            previousLocation,
            settings.homeAddress,
            settings.lowTransitLocations,
          );

          if (!durationCheck.valid) {
            logSkip(onProgress, returnLabel, `duration ${durationCheck.reason}`);
          } else {
            // Determine effective mode and duration (WALK events use walk time)
            const effectiveMode = durationCheck.mode;
            const effectiveDuration = durationCheck.walkMinutes ?? returnTransit.durationMinutes;

            // lastEventEnd already computed above for departure time
            const returnEndTime = new Date(
              lastEventEnd.getTime() + effectiveDuration * MILLISECONDS_PER_MINUTE,
            );

            // Check for overlap with existing transit events
            if (
              overlapsExistingTransit(lastEventEnd, returnEndTime, events, settings.transitColorId)
            ) {
              logSkip(onProgress, returnLabel, "overlaps existing transit");
            } else {
              const timeZone = lastEvent.end.timeZone || DEFAULT_TIMEZONE;

              const returnEvent = createReturnHomeEvent(
                returnTransit,
                previousLocation,
                previousLocationName,
                settings.homeAddress,
                lastEventEnd,
                timeZone,
                settings.transitColorId,
                effectiveMode,
                durationCheck.walkMinutes, // Only pass if it's a WALK event
              );

              transitEvents.push(returnEvent);
              logCreate(onProgress, returnEvent.summary, effectiveDuration);
            }
          }
        }
      }
    }
  }

  return transitEvents;
}
