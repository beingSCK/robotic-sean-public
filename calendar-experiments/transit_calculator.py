"""
Transit Calculator
==================
Calculates travel time between two addresses using Google Maps Routes API.

Usage:
    # Standalone test with real API
    python transit_calculator.py --test "Ferry Building, SF" "Caltrain Station, SF"
"""

import argparse
import json
from pathlib import Path

import requests


ROUTES_API_ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes"


def load_config():
    """Load configuration from config.json."""
    config_path = Path(__file__).parent / 'config.json'
    if not config_path.exists():
        raise FileNotFoundError(
            f"Config file not found at {config_path}. "
            "Copy config.json.example to config.json and fill in your API key."
        )
    with open(config_path) as f:
        return json.load(f)


def _call_routes_api(origin: str, destination: str, travel_mode: str, api_key: str,
                     departure_time: str = None, traffic_model: str = None) -> dict:
    """
    Call Google Routes API to get travel time.

    Args:
        origin: Starting address
        destination: Ending address
        travel_mode: "TRANSIT" or "DRIVE"
        api_key: Google Maps API key
        departure_time: RFC 3339 timestamp for traffic-aware routing (e.g., "2025-12-17T16:30:00Z")
        traffic_model: "BEST_GUESS", "PESSIMISTIC", or "OPTIMISTIC" (only for DRIVE mode)

    Returns:
        dict with duration_seconds and distance_meters, or None if no route found
    """
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
    }

    body = {
        "origin": {"address": origin},
        "destination": {"address": destination},
        "travelMode": travel_mode,
    }

    # Add traffic-aware fields for driving
    if travel_mode == "DRIVE" and departure_time:
        body["departureTime"] = departure_time
        body["routingPreference"] = "TRAFFIC_AWARE_OPTIMAL"
        if traffic_model:
            body["trafficModel"] = traffic_model

    response = requests.post(ROUTES_API_ENDPOINT, headers=headers, json=body)

    if response.status_code != 200:
        error_detail = response.json().get("error", {}).get("message", response.text)
        raise RuntimeError(f"Routes API error ({response.status_code}): {error_detail}")

    data = response.json()

    if not data.get("routes"):
        return None

    route = data["routes"][0]
    duration_str = route.get("duration", "0s")
    duration_seconds = int(duration_str.rstrip("s"))

    return {
        "duration_seconds": duration_seconds,
        "distance_meters": route.get("distanceMeters", 0),
    }


def _get_blended_driving_time(origin: str, destination: str, api_key: str,
                               departure_time: str) -> dict:
    """
    Get traffic-aware driving time by blending BEST_GUESS and PESSIMISTIC estimates.

    Returns dict with duration_minutes and blending metadata.
    """
    # Query BEST_GUESS
    best_result = _call_routes_api(origin, destination, "DRIVE", api_key,
                                   departure_time=departure_time, traffic_model="BEST_GUESS")
    if not best_result:
        return None

    best_minutes = best_result["duration_seconds"] // 60

    # Query PESSIMISTIC
    pessimistic_result = _call_routes_api(origin, destination, "DRIVE", api_key,
                                          departure_time=departure_time, traffic_model="PESSIMISTIC")
    if not pessimistic_result:
        # Fall back to just BEST_GUESS if PESSIMISTIC fails
        return {
            "duration_minutes": best_minutes,
            "best_guess_minutes": best_minutes,
            "pessimistic_minutes": None,
            "is_blended": False,
        }

    pessimistic_minutes = pessimistic_result["duration_seconds"] // 60

    # Check if difference is "large" (>25%)
    if best_minutes > 0:
        difference_pct = (pessimistic_minutes - best_minutes) / best_minutes
    else:
        difference_pct = 0

    if difference_pct > 0.25:
        # Blend: 75% weight to pessimistic
        blended_minutes = int(best_minutes + 0.75 * (pessimistic_minutes - best_minutes))
        return {
            "duration_minutes": blended_minutes,
            "best_guess_minutes": best_minutes,
            "pessimistic_minutes": pessimistic_minutes,
            "is_blended": True,
        }
    else:
        # Difference is small, just use BEST_GUESS
        return {
            "duration_minutes": best_minutes,
            "best_guess_minutes": best_minutes,
            "pessimistic_minutes": pessimistic_minutes,
            "is_blended": False,
        }


def get_transit_time(origin: str, destination: str, use_stub: bool = True,
                     departure_time: str = None) -> dict:
    """
    Get travel time between two addresses.

    Args:
        origin: Starting address
        destination: Ending address
        use_stub: If True, return hardcoded 30 minutes (for testing).
                  If False, call Google Maps Routes API.
        departure_time: RFC 3339 timestamp for traffic-aware routing (optional).
                       When provided for driving routes, queries both BEST_GUESS
                       and PESSIMISTIC traffic models and blends if difference > 25%.

    Returns:
        dict with keys:
            - duration_minutes: int, travel time in minutes
            - mode: str, "transit" or "driving"
            - is_stub: bool, True if using stub data
            - best_guess_minutes: int (only for driving with departure_time)
            - pessimistic_minutes: int (only for driving with departure_time)
            - is_blended: bool (only for driving with departure_time)
    """
    if use_stub:
        # Stub mode: return hardcoded 30 minutes (for testing without API calls)
        return {
            "duration_minutes": 30,
            "mode": "transit",
            "is_stub": True,
            "origin": origin,
            "destination": destination
        }

    # Real Routes API implementation
    config = load_config()
    api_key = config.get('maps_api_key')

    if not api_key or api_key == "YOUR_API_KEY_HERE":
        raise ValueError(
            "Please set your Google Maps API key in config.json. "
            "Or use use_stub=True for testing."
        )

    # Try TRANSIT first
    result = _call_routes_api(origin, destination, "TRANSIT", api_key)

    if result:
        duration_minutes = result["duration_seconds"] // 60

        # Fallback to DRIVE if transit takes > 80 minutes
        if duration_minutes > 80 and departure_time:
            # Use traffic-aware driving with blending
            drive_result = _get_blended_driving_time(origin, destination, api_key, departure_time)
            if drive_result and drive_result["duration_minutes"] < duration_minutes:
                return {
                    "duration_minutes": drive_result["duration_minutes"],
                    "mode": "driving",
                    "is_stub": False,
                    "origin": origin,
                    "destination": destination,
                    "best_guess_minutes": drive_result.get("best_guess_minutes"),
                    "pessimistic_minutes": drive_result.get("pessimistic_minutes"),
                    "is_blended": drive_result.get("is_blended", False),
                }
        elif duration_minutes > 80:
            # No departure_time, use simple driving query
            drive_result = _call_routes_api(origin, destination, "DRIVE", api_key)
            if drive_result and drive_result["duration_seconds"] // 60 < duration_minutes:
                return {
                    "duration_minutes": drive_result["duration_seconds"] // 60,
                    "mode": "driving",
                    "is_stub": False,
                    "origin": origin,
                    "destination": destination,
                }

        return {
            "duration_minutes": duration_minutes,
            "mode": "transit",
            "is_stub": False,
            "origin": origin,
            "destination": destination,
        }

    # No transit route found, try driving
    if departure_time:
        # Use traffic-aware driving with blending
        drive_result = _get_blended_driving_time(origin, destination, api_key, departure_time)
        if drive_result:
            return {
                "duration_minutes": drive_result["duration_minutes"],
                "mode": "driving",
                "is_stub": False,
                "origin": origin,
                "destination": destination,
                "best_guess_minutes": drive_result.get("best_guess_minutes"),
                "pessimistic_minutes": drive_result.get("pessimistic_minutes"),
                "is_blended": drive_result.get("is_blended", False),
            }
    else:
        # No departure_time, use simple driving query
        drive_result = _call_routes_api(origin, destination, "DRIVE", api_key)
        if drive_result:
            return {
                "duration_minutes": drive_result["duration_seconds"] // 60,
                "mode": "driving",
                "is_stub": False,
                "origin": origin,
                "destination": destination,
            }

    # No route found at all
    raise RuntimeError(f"No route found between '{origin}' and '{destination}'")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Calculate transit time between addresses")
    parser.add_argument("--test", nargs=2, metavar=("ORIGIN", "DESTINATION"),
                        help="Test with real API: --test 'Origin Address' 'Destination Address'")
    parser.add_argument("--stub", action="store_true",
                        help="Use stub data instead of real API (for testing)")

    args = parser.parse_args()

    if args.test:
        origin, destination = args.test
        use_stub = args.stub

        print(f"Origin:      {origin}")
        print(f"Destination: {destination}")
        print(f"Using stub:  {use_stub}")
        print("-" * 40)

        try:
            result = get_transit_time(origin, destination, use_stub=use_stub)
            print(f"Duration:    {result['duration_minutes']} minutes")
            print(f"Mode:        {result['mode']}")
            print(f"Is stub:     {result['is_stub']}")
        except Exception as e:
            print(f"Error: {e}")
    else:
        # Default: quick stub test
        result = get_transit_time(
            origin="1000 Union St, Brooklyn, NY",
            destination="315 Park Avenue South, New York, NY",
            use_stub=True
        )
        print(f"Transit time: {result['duration_minutes']} minutes")
        print(f"Mode: {result['mode']}")
        print(f"Is stub: {result['is_stub']}")
