/**
 * Unit tests for shouldSkipEvent
 *
 * Tests the event filtering logic that determines whether a calendar event
 * should be skipped when calculating transit times.
 */

import { describe, expect, test } from "bun:test";
import { shouldSkipEvent } from "./eventProcessor";
import type { CalendarEvent, UserSettings } from "./types";
import { SkipReason } from "./types";

// Minimal settings for testing - only transitColorId matters for shouldSkipEvent
const testSettings: UserSettings = {
  homeAddress: "123 Home St, New York, NY",
  daysForward: 7,
  transitColorId: "11", // Tomato color
};

// Helper to create a minimal valid event (one that should NOT be skipped)
function createValidEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "test-event-1",
    summary: "Meeting at Office",
    location: "456 Office Ave, New York, NY",
    start: {
      dateTime: "2026-01-15T10:00:00-05:00", // 10am - normal business hours
      timeZone: "America/New_York",
    },
    end: {
      dateTime: "2026-01-15T11:00:00-05:00",
      timeZone: "America/New_York",
    },
    ...overrides,
  };
}

describe("shouldSkipEvent", () => {
  test("should NOT skip: valid event with location and normal time", () => {
    const event = createValidEvent();
    const result = shouldSkipEvent(event, testSettings);

    expect(result.shouldSkip).toBe(false);
    expect(result.reason).toBe("");
  });

  test("should skip: NO_LOCATION - event has no location", () => {
    const event = createValidEvent({ location: undefined });
    const result = shouldSkipEvent(event, testSettings);

    expect(result.shouldSkip).toBe(true);
    expect(result.reason).toBe(SkipReason.NO_LOCATION);
  });

  test("should skip: ALREADY_TRANSIT_EVENT - colorId matches transit color", () => {
    const event = createValidEvent({ colorId: "11" }); // Same as testSettings.transitColorId
    const result = shouldSkipEvent(event, testSettings);

    expect(result.shouldSkip).toBe(true);
    expect(result.reason).toBe(SkipReason.ALREADY_TRANSIT_EVENT);
  });

  test("should skip: HOLD_EVENT - colorId is 8 (graphite)", () => {
    const event = createValidEvent({ colorId: "8" });
    const result = shouldSkipEvent(event, testSettings);

    expect(result.shouldSkip).toBe(true);
    expect(result.reason).toBe(SkipReason.HOLD_EVENT);
  });

  test("should skip: VIDEO_CALL_CONFERENCE - has conferenceData", () => {
    const event = createValidEvent({ conferenceData: { entryPoints: [] } });
    const result = shouldSkipEvent(event, testSettings);

    expect(result.shouldSkip).toBe(true);
    expect(result.reason).toBe(SkipReason.VIDEO_CALL_CONFERENCE);
  });

  test("should skip: VIDEO_CALL_KEYWORD - location contains zoom.us", () => {
    const event = createValidEvent({ location: "https://zoom.us/j/123456" });
    const result = shouldSkipEvent(event, testSettings);

    expect(result.shouldSkip).toBe(true);
    expect(result.reason).toBe(SkipReason.VIDEO_CALL_KEYWORD);
  });

  test("should skip: OVERNIGHT_EVENT - starts at 3am", () => {
    const event = createValidEvent({
      start: {
        dateTime: "2026-01-15T03:00:00-05:00", // 3am
        timeZone: "America/New_York",
      },
    });
    const result = shouldSkipEvent(event, testSettings);

    expect(result.shouldSkip).toBe(true);
    expect(result.reason).toBe(SkipReason.OVERNIGHT_EVENT);
  });

  test("should skip: ALL_DAY_EVENT - has date but no dateTime", () => {
    const event = createValidEvent({
      start: {
        date: "2026-01-15", // All-day format
        // No dateTime
      },
      end: {
        date: "2026-01-16",
      },
    });
    const result = shouldSkipEvent(event, testSettings);

    expect(result.shouldSkip).toBe(true);
    expect(result.reason).toBe(SkipReason.ALL_DAY_EVENT);
  });
});
