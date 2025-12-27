/**
 * Transit Calculator - Routes API integration
 * Ported from transit_calculator.py (simplified for MVP)
 */

import { ROUTES_API_KEY, TRANSIT_FALLBACK_THRESHOLD } from './config.ts';
import type { RouteResult } from './types.ts';

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
 * Call Google Routes API to get travel time.
 */
async function callRoutesApi(
  origin: string,
  destination: string,
  travelMode: 'TRANSIT' | 'DRIVE'
): Promise<{ durationSeconds: number; distanceMeters: number } | null> {
  const headers = {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': ROUTES_API_KEY,
    'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
  };

  const body = {
    origin: { address: origin },
    destination: { address: destination },
    travelMode: travelMode,
  };

  try {
    const response = await fetch(ROUTES_API_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const data = await response.json() as RoutesApiResponse;
      console.error(`Routes API error (${response.status}):`, data.error?.message);
      return null;
    }

    const data = await response.json() as RoutesApiResponse;

    if (!data.routes || data.routes.length === 0) {
      return null;
    }

    const route = data.routes[0];
    const durationStr = route?.duration || '0s';
    const durationSeconds = parseInt(durationStr.replace('s', ''), 10);

    return {
      durationSeconds,
      distanceMeters: route?.distanceMeters || 0,
    };
  } catch (error) {
    console.error('Routes API fetch error:', error);
    return null;
  }
}

/**
 * Get travel time between two addresses.
 * Tries TRANSIT first, falls back to DRIVE if transit takes too long or isn't available.
 */
export async function getTransitTime(
  origin: string,
  destination: string
): Promise<RouteResult | null> {
  // Try TRANSIT first
  const transitResult = await callRoutesApi(origin, destination, 'TRANSIT');

  if (transitResult) {
    const transitMinutes = Math.ceil(transitResult.durationSeconds / 60);

    // If transit is reasonable (< threshold), use it
    if (transitMinutes <= TRANSIT_FALLBACK_THRESHOLD) {
      return {
        durationMinutes: transitMinutes,
        distanceMeters: transitResult.distanceMeters,
        mode: 'transit',
      };
    }

    // Transit takes too long, try driving
    const driveResult = await callRoutesApi(origin, destination, 'DRIVE');
    if (driveResult) {
      const driveMinutes = Math.ceil(driveResult.durationSeconds / 60);
      // Use whichever is faster
      if (driveMinutes < transitMinutes) {
        return {
          durationMinutes: driveMinutes,
          distanceMeters: driveResult.distanceMeters,
          mode: 'driving',
        };
      }
    }

    // Driving isn't faster, use transit
    return {
      durationMinutes: transitMinutes,
      distanceMeters: transitResult.distanceMeters,
      mode: 'transit',
    };
  }

  // No transit route, try driving
  const driveResult = await callRoutesApi(origin, destination, 'DRIVE');
  if (driveResult) {
    return {
      durationMinutes: Math.ceil(driveResult.durationSeconds / 60),
      distanceMeters: driveResult.distanceMeters,
      mode: 'driving',
    };
  }

  // No route found at all
  return null;
}
