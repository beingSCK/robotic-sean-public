# Event Processing Refactor: Remaining Fixes

**Date:** 2025-12-28  
**Scope:** `eventProcessor.ts`, `types.ts`  
**Time Budget:** ~15-20 minutes  

---

## Context

The event processing refactor is 90% complete. These are the remaining cleanup items before moving on to new features.

---

## Fix 1: Eliminate Repeated State Update Pattern (DRY)

**File:** `src/eventProcessor.ts`

**Problem:** This pattern appears 4 times in `calculateTransitEvents`:
```typescript
previousLocation = location;
previousLocationName = getLocationName(location);
continue;
```

**Solution:** Restructure the loop so state updates happen once at the end of each iteration, not in multiple `continue` branches.

**Approach:**
- Use a flag or early-return pattern so that `previousLocation` and `previousLocationName` are updated in ONE place at the bottom of the event loop
- Each skip condition should set a flag or use a different control flow, then the state update happens unconditionally at the end

**Example restructure:**
```typescript
for (const event of dayEvents) {
  const skipResult = shouldSkipEvent(event, settings);
  if (skipResult.shouldSkip) {
    continue; // No location to update for truly skipped events
  }

  if (!event.location || !event.start.dateTime) {
    continue;
  }

  const location = event.location;
  const eventStart = event.start.dateTime;
  const timeZone = event.start.timeZone || DEFAULT_TIMEZONE;

  // Process event (may or may not create transit)
  let shouldCreateTransit = true;
  
  if (isSameLocation(location, previousLocation)) {
    shouldCreateTransit = false;
  }
  
  if (shouldCreateTransit) {
    // ... transit calculation and creation logic ...
    // (only create transit if all conditions pass)
  }

  // SINGLE state update at end of loop
  previousLocation = location;
  previousLocationName = getLocationName(location);
}
```

Alternatively, extract the transit creation into a helper that returns whether it succeeded, and always update state after calling it.

---

## Fix 2: Remove Unused SkipReason.SAME_LOCATION

**File:** `src/types.ts`

**Problem:** `SkipReason.SAME_LOCATION` is defined in the enum but never used. The same-location check happens inline in `calculateTransitEvents`, not in `shouldSkipEvent()`.

**Solution:** Remove `SAME_LOCATION` from the enum.

**Why:** Same-location is about *sequence* (comparing to previous event), not *event properties*. It doesn't belong in `shouldSkipEvent()` which only looks at single-event properties.

**Change:**
```typescript
// Remove this line from the SkipReason enum:
SAME_LOCATION = 'same_location',
```

---

## Fix 3: Add TODO Comment for Timezone Handling

**File:** `src/utils.ts`

**Problem:** `formatDateTime` accepts a `timeZone` parameter but ignores it, using the local machine's offset instead.

**Solution:** Add a TODO comment. Don't fix it now—it works for local use and proper timezone handling is a rabbit hole.

**Change:**
```typescript
/**
 * Format a Date as ISO 8601 datetime string for Google Calendar API.
 * Example: 2025-01-15T09:00:00-05:00
 * 
 * TODO: The timeZone parameter is currently ignored. This uses the local
 * machine's timezone offset. For proper timezone support, consider using
 * a library like date-fns-tz or Temporal API when it stabilizes.
 */
export function formatDateTime(date: Date, timeZone: string = DEFAULT_TIMEZONE): string {
```

---

## Fix 4: Clarify Return-Home Error Handling Control Flow

**File:** `src/eventProcessor.ts`

**Problem:** The `continue` in the return-home error catch block continues the *outer* date loop, which is correct but reads confusingly (looks like it might be in the inner event loop).

**Solution:** Add a clarifying comment.

**Change:**
```typescript
} catch (error) {
  if (error instanceof RoutesApiError) {
    onProgress?.(`  API error for return home: ${error.message}`);
  }
  continue; // Continue to next day (we're in the outer date loop here)
}
```

---

## Verification

After making changes:

1. Run `bun run build` — should complete with no errors
2. Verify the extension still works:
   - Settings save/load
   - Calendar scan finds events
   - Transit events are calculated correctly
   - Events are created in calendar

---

## What NOT to Do

- Don't add unit tests (out of scope for this refactor)
- Don't implement retry logic or caching
- Don't refactor anything else
- Don't add JSDoc to every function

The code is good enough. Ship features next.
