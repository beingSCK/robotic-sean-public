/**
 * Transit Calculator - Routes API integration
 * Ported from transit_calculator.py (simplified for MVP)
 */

import {
  ROUTES_API_KEY,
  TRANSIT_FALLBACK_THRESHOLD,
  ROUTES_API_TIMEOUT_MS,
} from './config.ts';
import { RoutesApiError } from './types.ts';
import type { RouteResult } from './types.ts';
import { parseDurationSeconds, toMinutes, validateAddress } from './utils.ts';

const ROUTES_API_ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';

interface RoutesApiResponse {
  routes?: Array<{
    duration?: string;  // e.g., "1800s"
    distanceMeters?: number;
  }>;
  error?: {
    message?: string;
  };
}

/**
 * Create a RouteResult object from raw API data.
 * Eliminates repeated object construction.
 */
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

/**
 * Select the best route based on transit vs driving comparison.
 * Returns null only if both routes are null.
 */
function selectBestRoute(
  transitResult: { durationSeconds: number; distanceMeters: number } | null,
  driveResult: { durationSeconds: number; distanceMeters: number } | null
): RouteResult | null {
  // No routes available at all
  if (!transitResult && !driveResult) {
    return null;
  }

  // Only driving available
  if (!transitResult && driveResult) {
    return createRouteResult(driveResult.durationSeconds, driveResult.distanceMeters, 'driving');
  }

  // Only transit available (shouldn't happen if we got here, but for type safety)
  if (transitResult && !driveResult) {
    return createRouteResult(transitResult.durationSeconds, transitResult.distanceMeters, 'transit');
  }

  // Both available - compare
  const transitMinutes = toMinutes(transitResult!.durationSeconds);
  const driveMinutes = toMinutes(driveResult!.durationSeconds);

  // If transit is reasonable, prefer it
  if (transitMinutes <= TRANSIT_FALLBACK_THRESHOLD) {
    return createRouteResult(transitResult!.durationSeconds, transitResult!.distanceMeters, 'transit');
  }

  // Transit is slow - use whichever is faster
  if (driveMinutes < transitMinutes) {
    return createRouteResult(driveResult!.durationSeconds, driveResult!.distanceMeters, 'driving');
  }

  // Transit is still faster or equal, use transit
  return createRouteResult(transitResult!.durationSeconds, transitResult!.distanceMeters, 'transit');
}

/**
 * Call Google Routes API to get travel time.
 * Throws RoutesApiError on API failures.
 * Returns null if no valid route exists (different from API failure).
 *
 * @param departureTime Optional departure time for traffic-aware routing (DRIVE mode)
 */
async function callRoutesApi(
  origin: string,
  destination: string,
  travelMode: 'TRANSIT' | 'DRIVE' | 'WALK',
  departureTime?: Date
): Promise<{ durationSeconds: number; distanceMeters: number } | null> {
  // Validate inputs
  origin = validateAddress(origin, 'Origin');
  destination = validateAddress(destination, 'Destination');

  const headers = {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': ROUTES_API_KEY,
    'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
  };

  // Build request body with optional traffic-aware routing
  const body: Record<string, unknown> = {
    origin: { address: origin },
    destination: { address: destination },
    travelMode: travelMode,
  };

  // Add departure time for traffic-aware routing
  if (departureTime) {
    body.departureTime = departureTime.toISOString();
    // Enable traffic-aware routing for driving
    if (travelMode === 'DRIVE') {
      body.routingPreference = 'TRAFFIC_AWARE_OPTIMAL';
    }
  }

  const context = { origin, destination, travelMode };

  // Set up timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ROUTES_API_TIMEOUT_MS);

  try {
    const response = await fetch(ROUTES_API_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const data = await response.json() as RoutesApiResponse;
      const isTransient = response.status >= 500;
      throw new RoutesApiError(
        `Routes API error (${response.status}): ${data.error?.message || 'Unknown error'}`,
        response.status,
        isTransient,
        context
      );
    }

    const data = await response.json() as RoutesApiResponse;

    // No routes found - this is valid "no route" result, not an error
    if (!data.routes || data.routes.length === 0) {
      return null;
    }

    const route = data.routes[0];
    const durationStr = route?.duration;

    // If duration is missing, treat as no valid route
    if (!durationStr) {
      return null;
    }

    const durationSeconds = parseDurationSeconds(durationStr);

    return {
      durationSeconds,
      distanceMeters: route?.distanceMeters || 0,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    // Re-throw RoutesApiError as-is
    if (error instanceof RoutesApiError) {
      throw error;
    }

    // Handle abort (timeout)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new RoutesApiError(
        `Routes API request timed out after ${ROUTES_API_TIMEOUT_MS}ms`,
        0,
        true, // Timeouts are transient
        context
      );
    }

    // Network errors are transient
    throw new RoutesApiError(
      `Routes API network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      0,
      true,
      context
    );
  }
}

/**
 * Get travel time between two addresses.
 * Tries TRANSIT first, falls back to DRIVE if transit takes too long or isn't available.
 *
 * @param origin Starting address
 * @param destination Ending address
 * @param forceDrive If true, skip transit and only use driving mode
 * @param departureTime Optional departure time for traffic-aware routing
 * @throws RoutesApiError on API failures (can be caught and handled by caller)
 * @returns RouteResult or null if no route exists
 */
export async function getTransitTime(
  origin: string,
  destination: string,
  forceDrive: boolean = false,
  departureTime?: Date
): Promise<RouteResult | null> {
  // If force drive, skip transit entirely
  if (forceDrive) {
    const driveResult = await callRoutesApi(origin, destination, 'DRIVE', departureTime);
    if (driveResult) {
      return createRouteResult(driveResult.durationSeconds, driveResult.distanceMeters, 'driving');
    }
    return null;
  }

  // Try TRANSIT first (departure time helps with schedule-based routing)
  const transitResult = await callRoutesApi(origin, destination, 'TRANSIT', departureTime);

  // If transit is available and reasonable, return it immediately
  if (transitResult) {
    const transitMinutes = toMinutes(transitResult.durationSeconds);

    if (transitMinutes <= TRANSIT_FALLBACK_THRESHOLD) {
      return createRouteResult(transitResult.durationSeconds, transitResult.distanceMeters, 'transit');
    }

    // Transit takes too long, try driving to compare
    const driveResult = await callRoutesApi(origin, destination, 'DRIVE', departureTime);
    return selectBestRoute(transitResult, driveResult);
  }

  // No transit route, try driving
  const driveResult = await callRoutesApi(origin, destination, 'DRIVE', departureTime);

  if (driveResult) {
    return createRouteResult(driveResult.durationSeconds, driveResult.distanceMeters, 'driving');
  }

  // No route found at all
  return null;
}

/**
 * Get walking time between two addresses.
 *
 * @param origin Starting address
 * @param destination Ending address
 * @throws RoutesApiError on API failures
 * @returns Walking duration in minutes, or null if no walking route exists
 */
export async function getWalkingTime(
  origin: string,
  destination: string
): Promise<number | null> {
  const result = await callRoutesApi(origin, destination, 'WALK');

  if (result) {
    return toMinutes(result.durationSeconds);
  }

  return null;
}
