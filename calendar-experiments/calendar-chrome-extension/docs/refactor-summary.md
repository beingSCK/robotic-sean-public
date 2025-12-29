# Code Quality Refactor Summary

**Date:** 2025-12-28
**Scope:** `eventProcessor.ts` and `transitCalculator.ts` (plus supporting files)
**Goal:** Elevate from "junior dev" MVP code to "senior dev" quality

---

## Problem Statement

The original code was functional but showed typical junior patterns:
- Copy-paste duplication (DRY violations)
- Magic numbers scattered throughout
- Long functions with multiple responsibilities
- Silent failures (null returns without error context)
- String literals instead of type-safe enums
- Tightly coupled concerns (progress reporting mixed with business logic)

---

## Files Modified

| File | Lines Before | Lines After | Summary |
|------|-------------|-------------|---------|
| `src/types.ts` | 76 | 100 | Added `SkipReason` enum, `RoutesApiError` class |
| `src/config.ts` | 37 | 45 | Added time conversion constants, API timeout |
| `src/utils.ts` | 77 | 119 | Added 4 utility functions |
| `src/transitCalculator.ts` | 132 | 223 | Full refactor |
| `src/eventProcessor.ts` | 244 | 355 | Full refactor |

---

## Changes by Category

### 1. Type Safety

**Before:** String-based skip reasons
```typescript
return { shouldSkip: true, reason: 'video call (has conferenceData)' };
```

**After:** Type-safe enum
```typescript
export enum SkipReason {
  NO_LOCATION = 'no_location',
  ALREADY_TRANSIT_EVENT = 'already_transit_event',
  VIDEO_CALL_CONFERENCE = 'video_call_conference',
  VIDEO_CALL_KEYWORD = 'video_call_keyword',
  OVERNIGHT_EVENT = 'overnight_event',
  ALL_DAY_EVENT = 'all_day_event',
  SAME_LOCATION = 'same_location',
}

return { shouldSkip: true, reason: SkipReason.VIDEO_CALL_CONFERENCE };
```

**Before:** Silent null returns on API failure
```typescript
if (!response.ok) {
  console.error(`Routes API error (${response.status}):`, data.error?.message);
  return null;  // Caller can't distinguish from "no route"
}
```

**After:** Typed errors with context
```typescript
export class RoutesApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public isTransient: boolean,
    public context?: { origin?: string; destination?: string; travelMode?: string }
  ) {
    super(message);
    this.name = 'RoutesApiError';
  }
}

// Usage:
throw new RoutesApiError(
  `Routes API error (${response.status}): ${data.error?.message}`,
  response.status,
  response.status >= 500,  // 5xx = transient
  { origin, destination, travelMode }
);
```

### 2. DRY Violations Fixed

**Before:** 4x repeated RouteResult construction in transitCalculator.ts
```typescript
return {
  durationMinutes: Math.ceil(transitResult.durationSeconds / 60),
  distanceMeters: transitResult.distanceMeters,
  mode: 'transit',
};
// ...repeated 3 more times with slight variations
```

**After:** Single factory function
```typescript
function createRouteResult(
  durationSeconds: number,
  distanceMeters: number,
  mode: 'transit' | 'driving'
): RouteResult {
  return {
    durationMinutes: toMinutes(durationSeconds),
    distanceMeters,
    mode,
  };
}
```

**Before:** Transit event creation inline in main loop
```typescript
const transitEvent: TransitEvent = {
  summary: `${modePrefix}: ${previousLocationName} → ${destinationName}`,
  location: previousLocation,
  colorId: settings.transitColorId,
  start: { dateTime: formatDateTime(transitStartDate), timeZone },
  end: { dateTime: formatDateTime(eventStartDate), timeZone },
  description: `Arriving at: ${location}\nTravel by ${transitResult.mode}...`,
};
```

**After:** Generic foundation + transit-specific wrapper
```typescript
// Generic foundation (extensible for future event types)
function createDerivedEvent(params: DerivedEventParams): TransitEvent { ... }

// Transit-specific wrapper
function createTransitEvent(
  transitResult, previousLocation, previousLocationName,
  destination, eventStart, timeZone, colorId
): TransitEvent {
  return createDerivedEvent({
    summary: `${modePrefix}: ${previousLocationName} → ${destinationName}`,
    ...
  });
}

// Return-home variant
function createReturnHomeEvent(...): TransitEvent {
  return createDerivedEvent({ ... });
}
```

### 3. Magic Numbers Extracted

**Before:**
```typescript
const durationSeconds = parseInt(durationStr.replace('s', ''), 10);
const transitMinutes = Math.ceil(transitResult.durationSeconds / 60);
const transitStartDate = new Date(eventStartDate.getTime() - transitResult.durationMinutes * 60 * 1000);
const dateStr = start.substring(0, 10);
```

**After:**
```typescript
// config.ts
export const SECONDS_PER_MINUTE = 60;
export const MILLISECONDS_PER_MINUTE = 60 * 1000;
export const ROUTES_API_TIMEOUT_MS = 10000;

// utils.ts
export function parseDurationSeconds(durationStr: string): number { ... }
export function toMinutes(seconds: number): number { ... }
export function extractDateString(dateTimeStr: string): string { ... }
```

### 4. Error Handling

**Before:** Caller can't distinguish "no route" from "API failed"
```typescript
const transitResult = await getTransitTime(previousLocation, location);
if (!transitResult) {
  // Is this "no route exists" or "API is down"? Unknown.
  continue;
}
```

**After:** Clear distinction
```typescript
let transitResult: RouteResult | null;
try {
  transitResult = await getTransitTime(previousLocation, location);
} catch (error) {
  if (error instanceof RoutesApiError) {
    onProgress?.(`  API error for "${event.summary}": ${error.message}`);
    // Could add retry logic for transient errors (error.isTransient)
  }
  continue;
}

if (!transitResult) {
  // This is definitively "no route exists", not an error
  continue;
}
```

### 5. Robustness Improvements

**Input validation:**
```typescript
export function validateAddress(address: string, fieldName: string): string {
  const trimmed = address.trim();
  if (!trimmed) throw new Error(`${fieldName} address cannot be empty`);
  return trimmed;
}
```

**API timeout:**
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), ROUTES_API_TIMEOUT_MS);

const response = await fetch(ROUTES_API_ENDPOINT, {
  ...
  signal: controller.signal,
});
```

**Robust duration parsing:**
```typescript
export function parseDurationSeconds(durationStr: string): number {
  const match = durationStr.match(/^(\d+)s$/);
  if (!match) throw new Error(`Invalid duration format: ${durationStr}`);
  return parseInt(match[1], 10);
}
```

### 6. Code Organization

**Before:** All logic in one long function (143 lines)

**After:** Clear sections with single-responsibility functions
```
// ============================================================================
// Event Filtering
// ============================================================================
shouldSkipEvent()

// ============================================================================
// Event Grouping
// ============================================================================
groupEventsByDay()

// ============================================================================
// Derived Event Creation
// ============================================================================
createDerivedEvent()
createTransitEvent()
createReturnHomeEvent()

// ============================================================================
// Transit Duration Validation
// ============================================================================
isValidTransitDuration()

// ============================================================================
// Main Processing
// ============================================================================
calculateTransitEvents()
```

### 7. Efficiency Fix

**Before:**
```typescript
const lastEvent = [...dayEvents].reverse().find(
  (e) => e.start.dateTime && !shouldSkipEvent(e, settings).shouldSkip
);
```

**After:**
```typescript
const lastEvent = dayEvents.findLast(
  (e) => e.start.dateTime && !shouldSkipEvent(e, settings).shouldSkip
);
```

---

## Extensibility: createDerivedEvent Pattern

The refactor introduces a foundation for future event types:

```typescript
interface DerivedEventParams {
  summary: string;
  location: string;
  startTime: Date;
  endTime: Date;
  timeZone: string;
  colorId: string;
  description: string;
}

function createDerivedEvent(params: DerivedEventParams): TransitEvent { ... }
```

Future event types (prep time, buffer, reminders) can use this same foundation:
```typescript
// Future example:
function createPrepTimeEvent(meeting, prepMinutes, settings): TransitEvent {
  return createDerivedEvent({
    summary: `PREP: ${meeting.summary}`,
    ...
  });
}
```

---

## What Was NOT Changed

Per the plan, these were explicitly out of scope:
- Adding unit tests
- Caching route calculations
- Retry logic with exponential backoff
- JSDoc documentation
- Implementing other event types (just laid foundation)

---

## Build Verification

```bash
$ bun run build
Bundled 8 modules in 3ms
  popup.js  13.33 KB  (entry point)
Bundled 3 modules in 2ms
  background.js  2.13 KB  (entry point)
```

Build passes with no errors.

---

## Success Criteria Checklist

- [x] No function longer than ~50 lines
- [x] No repeated code blocks (DRY)
- [x] All magic numbers extracted to named constants
- [x] Type-safe enums instead of string literals
- [x] Clear error handling with typed errors
- [x] Progress callbacks consolidated
- [x] Each function has single responsibility
- [x] Event creation abstracted via `createDerivedEvent()` for future extensibility
