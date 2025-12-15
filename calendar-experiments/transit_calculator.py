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


def _call_routes_api(origin: str, destination: str, travel_mode: str, api_key: str) -> dict:
    """
    Call Google Routes API to get travel time.

    Args:
        origin: Starting address
        destination: Ending address
        travel_mode: "TRANSIT" or "DRIVE"
        api_key: Google Maps API key

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


def get_transit_time(origin: str, destination: str, use_stub: bool = True) -> dict:
    """
    Get travel time between two addresses.

    Args:
        origin: Starting address
        destination: Ending address
        use_stub: If True, return hardcoded 30 minutes (for testing).
                  If False, call Google Maps Routes API.

    Returns:
        dict with keys:
            - duration_minutes: int, travel time in minutes
            - mode: str, "transit" or "driving"
            - is_stub: bool, True if using stub data
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
        if duration_minutes > 80:
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
