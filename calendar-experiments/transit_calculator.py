"""
Transit Calculator
==================
Calculates travel time between two addresses using Google Maps Routes API.

Currently uses stub data for testing. See TODO(routes-api) comments for
what needs to be implemented when ready for real API calls.
"""

import json
from pathlib import Path


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
        # TODO(routes-api): Replace this stub with real Routes API call
        # When implementing:
        # 1. Load API key from config
        # 2. POST to https://routes.googleapis.com/directions/v2:computeRoutes
        # 3. Parse response for duration
        # 4. Implement fallback: if transit > 80 min, try driving
        return {
            "duration_minutes": 30,
            "mode": "transit",
            "is_stub": True,
            "origin": origin,
            "destination": destination
        }

    # TODO(routes-api): Implement real API call below
    config = load_config()
    api_key = config.get('maps_api_key')

    if api_key == "YOUR_API_KEY_HERE":
        raise ValueError(
            "Please set your Google Maps API key in config.json. "
            "Or use use_stub=True for testing."
        )

    # Placeholder for real implementation
    raise NotImplementedError(
        "Real Routes API integration not yet implemented. "
        "Use use_stub=True for now."
    )


if __name__ == "__main__":
    # Quick test
    result = get_transit_time(
        origin="1000 Union St, Brooklyn, NY",
        destination="315 Park Avenue South, New York, NY",
        use_stub=True
    )
    print(f"Transit time: {result['duration_minutes']} minutes")
    print(f"Mode: {result['mode']}")
    print(f"Is stub: {result['is_stub']}")
