/**
 * Unit tests for transitCalculator
 *
 * Tests the route selection and API integration logic for travel time calculations.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { selectBestRoute } from "./transitCalculator.ts";

// Constants for testing (matching config values)
// Threshold is 80 minutes = 4800 seconds
const UNDER_THRESHOLD_SECONDS = 60 * 60; // 60 min = 3600s (under 80 min)
const OVER_THRESHOLD_SECONDS = 90 * 60; // 90 min = 5400s (over 80 min)
const MUCH_OVER_THRESHOLD_SECONDS = 120 * 60; // 120 min = 7200s

describe("selectBestRoute", () => {
  test("returns null when both routes are null", () => {
    const result = selectBestRoute(null, null);
    expect(result).toBeNull();
  });

  test("returns driving when transit is null", () => {
    const driveResult = { durationSeconds: 1800, distanceMeters: 5000 };
    const result = selectBestRoute(null, driveResult);

    expect(result).not.toBeNull();
    expect(result?.mode).toBe("driving");
    expect(result?.durationMinutes).toBe(30); // 1800s = 30 min
    expect(result?.distanceMeters).toBe(5000);
  });

  test("returns transit when driving is null", () => {
    const transitResult = { durationSeconds: 2400, distanceMeters: 8000 };
    const result = selectBestRoute(transitResult, null);

    expect(result).not.toBeNull();
    expect(result?.mode).toBe("transit");
    expect(result?.durationMinutes).toBe(40); // 2400s = 40 min
    expect(result?.distanceMeters).toBe(8000);
  });

  test("returns transit when under TRANSIT_FALLBACK_THRESHOLD", () => {
    // Transit at 60 min (under 80 min threshold)
    const transitResult = { durationSeconds: UNDER_THRESHOLD_SECONDS, distanceMeters: 10000 };
    // Driving at 45 min (faster, but we still prefer transit when under threshold)
    const driveResult = { durationSeconds: 45 * 60, distanceMeters: 12000 };

    const result = selectBestRoute(transitResult, driveResult);

    expect(result).not.toBeNull();
    expect(result?.mode).toBe("transit");
    expect(result?.durationMinutes).toBe(60);
  });

  test("returns driving when transit exceeds threshold and driving is faster", () => {
    // Transit at 90 min (over 80 min threshold)
    const transitResult = { durationSeconds: OVER_THRESHOLD_SECONDS, distanceMeters: 15000 };
    // Driving at 60 min (faster)
    const driveResult = { durationSeconds: 60 * 60, distanceMeters: 20000 };

    const result = selectBestRoute(transitResult, driveResult);

    expect(result).not.toBeNull();
    expect(result?.mode).toBe("driving");
    expect(result?.durationMinutes).toBe(60);
  });

  test("returns transit when both exceed threshold but transit is faster", () => {
    // Transit at 90 min (over threshold)
    const transitResult = { durationSeconds: OVER_THRESHOLD_SECONDS, distanceMeters: 15000 };
    // Driving at 120 min (slower than transit)
    const driveResult = { durationSeconds: MUCH_OVER_THRESHOLD_SECONDS, distanceMeters: 25000 };

    const result = selectBestRoute(transitResult, driveResult);

    expect(result).not.toBeNull();
    expect(result?.mode).toBe("transit");
    expect(result?.durationMinutes).toBe(90);
  });
});

describe("getTransitTime", () => {
  // TODO(test-coverage): These tests require fetch mocking.
  // The mock setup is non-trivial because:
  // 1. We need to mock global.fetch
  // 2. We need to reset mocks between tests
  // 3. We need to handle the AbortController timeout logic
  //
  // For now, keeping these as .todo() - implement when adding more API tests.

  test.todo("forceDrive=true: only calls DRIVE API, not TRANSIT", () => {
    expect(true).toBe(true);
  });

  test.todo("forceDrive=false: tries TRANSIT first", () => {
    expect(true).toBe(true);
  });

  test.todo("returns null when API returns no routes", () => {
    expect(true).toBe(true);
  });

  test.todo("throws RoutesApiError on 500 response", () => {
    expect(true).toBe(true);
  });

  test.todo("includes departureTime in API call when provided", () => {
    expect(true).toBe(true);
  });

  test.todo("enables TRAFFIC_AWARE_OPTIMAL for DRIVE mode with departureTime", () => {
    expect(true).toBe(true);
  });
});

describe("getTransitTime - transit-mode feature", () => {
  // TODO(transit-mode): Add tests after implementing TransitMode enum
  // These tests will verify the new mode parameter:
  // - 'always_driving': skip transit, only call DRIVE API
  // - 'always_transit': skip driving, only call TRANSIT API
  // - 'default': current smart fallback logic

  test.todo("mode='always_driving': only calls DRIVE API", () => {
    expect(true).toBe(true);
  });

  test.todo("mode='always_transit': only calls TRANSIT API", () => {
    expect(true).toBe(true);
  });

  test.todo("mode='default': uses smart fallback logic", () => {
    expect(true).toBe(true);
  });
});

describe("blended traffic models", () => {
  // TODO(blended-traffic): Add tests after implementing blended traffic
  // These tests will verify the blending logic:
  // - Query both BEST_GUESS and PESSIMISTIC
  // - Blend with 75% pessimistic weight when difference > 25%
  // - Return unblended BEST_GUESS when difference <= 25%

  test.todo("queries both BEST_GUESS and PESSIMISTIC for driving", () => {
    expect(true).toBe(true);
  });

  test.todo("blends with 75% pessimistic weight when difference > 25%", () => {
    expect(true).toBe(true);
  });

  test.todo("returns unblended result when difference <= 25%", () => {
    expect(true).toBe(true);
  });
});
