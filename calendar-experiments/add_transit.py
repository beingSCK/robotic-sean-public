"""
Add Transit Events
==================
Main script that creates transit calendar events before and after meetings.

Usage:
    python add_transit.py              # Dry-run: outputs to dry_run_output.json
    python add_transit.py --execute    # Actually creates calendar events
    python add_transit.py --car-only   # Force driving mode (skip public transit)

Currently uses stub transit times. See transit_calculator.py for details.
"""

import argparse
import json
import os
import datetime
from pathlib import Path
from collections import defaultdict

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

from transit_calculator import get_transit_time, load_config


# Calendar API scope - write access to create events
SCOPES = ['https://www.googleapis.com/auth/calendar']

CREDENTIALS_FILE = 'credentials.json'
TOKEN_FILE = 'token.json'

# Stay keywords used for detecting overnight stays
STAY_KEYWORDS = ['stay:', 'stay at', 'hotel', 'airbnb', 'vrbo', 'accommodation']


def get_credentials():
    """Handle OAuth flow with token caching."""
    creds = None

    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            print("Refreshing expired token...")
            creds.refresh(Request())
        else:
            print("Opening browser for authentication...")
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
            creds = flow.run_local_server(port=0)

        with open(TOKEN_FILE, 'w') as token:
            token.write(creds.to_json())
            print(f"Token saved to {TOKEN_FILE}")

    return creds


def fetch_events(service, days_forward=7):
    """Fetch upcoming events from primary calendar."""
    now = datetime.datetime.utcnow()
    time_min = now.isoformat() + 'Z'
    time_max = (now + datetime.timedelta(days=days_forward)).isoformat() + 'Z'

    print(f"Fetching events from now to {time_max[:10]}...")

    events_result = service.events().list(
        calendarId='primary',
        timeMin=time_min,
        timeMax=time_max,
        maxResults=100,
        singleEvents=True,
        orderBy='startTime'
    ).execute()

    return events_result.get('items', [])


def should_skip_event(event, config):
    """
    Determine if an event should be skipped for transit calculation.

    Returns (skip: bool, reason: str)
    """
    summary = event.get('summary', '(no title)')

    # Skip if no location
    if not event.get('location'):
        return True, "no location"

    # Skip if already a transit event (by colorId)
    transit_color = config.get('transit_color_id', '11')
    if event.get('colorId') == transit_color:
        return True, "already a transit event"

    # Skip "hold" events (colorId 8 = graphite) - conditional events not yet confirmed
    if event.get('colorId') == '8':
        return True, "hold event (graphite)"

    # Skip video calls
    if event.get('conferenceData'):
        return True, "video call (has conferenceData)"

    # Check for video call URLs in location
    location = event.get('location', '').lower()
    video_keywords = ['zoom.us', 'meet.google', 'teams.microsoft', 'webex']
    for keyword in video_keywords:
        if keyword in location:
            return True, f"video call ({keyword} in location)"

    # Skip overnight events (between 12am-6am)
    start = event['start'].get('dateTime')
    if start:
        # Parse the hour from the datetime string
        # Format: 2025-01-15T09:00:00-05:00
        try:
            hour = int(start[11:13])
            if 0 <= hour < 6:
                return True, "overnight event (12am-6am)"
        except (ValueError, IndexError):
            pass

    # Skip all-day events (they have 'date' not 'dateTime')
    if 'date' in event['start'] and 'dateTime' not in event['start']:
        return True, "all-day event"

    return False, ""


def group_events_by_day(events):
    """Group events by their start date."""
    by_day = defaultdict(list)

    for event in events:
        start = event['start'].get('dateTime', event['start'].get('date'))
        # Extract just the date part (YYYY-MM-DD)
        date_str = start[:10]
        by_day[date_str].append(event)

    return dict(by_day)


def detect_trip_dates(events, home_airports=None):
    """
    Scan events to detect trip date ranges.

    Returns a set of date strings (YYYY-MM-DD) that are "trip days"
    where transit events should be skipped.

    Detection methods:
    1. Outbound flights (departing from home airports)
    2. Stay events (hotel, airbnb - all-day events)
    """
    if home_airports is None:
        home_airports = {'ewr', 'jfk', 'lga', 'newark', 'kennedy', 'laguardia'}

    trip_dates = set()

    for event in events:
        summary = event.get('summary', '').lower()
        location = event.get('location', '').lower()

        # Method 1: Detect flights departing from home airports
        flight_keywords = ['flight to', 'flight from', 'ua ', 'aa ', 'dl ', 'b6 ',
                          'united', 'american', 'delta', 'jetblue', 'southwest']
        is_flight = any(kw in summary for kw in flight_keywords)

        if is_flight:
            # Check if departing from home area
            is_outbound = any(airport in location for airport in home_airports)
            if is_outbound:
                # Get flight date
                flight_date = event['start'].get('dateTime', event['start'].get('date'))[:10]
                trip_dates.add(flight_date)

        # Method 2: Detect stay events (hotel, airbnb)
        is_stay = any(kw in summary for kw in STAY_KEYWORDS)

        if is_stay:
            # Stay events are typically all-day events with 'date' field
            start_date = event['start'].get('date')
            end_date = event['end'].get('date')

            if start_date and end_date:
                # Add all dates in the stay range
                current = datetime.datetime.strptime(start_date, '%Y-%m-%d')
                end = datetime.datetime.strptime(end_date, '%Y-%m-%d')

                while current < end:
                    trip_dates.add(current.strftime('%Y-%m-%d'))
                    current += datetime.timedelta(days=1)

    return trip_dates


def parse_datetime(dt_str):
    """Parse a datetime string from Google Calendar API."""
    # Format: 2025-01-15T09:00:00-05:00
    # Python's fromisoformat handles this in 3.11+, but let's be safe
    if dt_str.endswith('Z'):
        dt_str = dt_str[:-1] + '+00:00'
    return datetime.datetime.fromisoformat(dt_str)


def format_datetime(dt, timezone='America/New_York'):
    """Format a datetime for Google Calendar API."""
    return {
        'dateTime': dt.isoformat(),
        'timeZone': timezone
    }


def get_location_name(location):
    """Extract a short name from a full address for the transit event summary."""
    if not location:
        return "Unknown"
    # Take first part before comma, or first 30 chars
    parts = location.split(',')
    name = parts[0].strip()
    if len(name) > 30:
        name = name[:27] + "..."
    return name


def check_car_only_location(address: str, config: dict) -> tuple:
    """
    Check if address matches any car-only location patterns.

    Returns: (is_car_only, matched_pattern) for debugging/logging.
    """
    car_only = config.get('user', {}).get('car_only_locations', [])
    address_lower = address.lower()
    for pattern in car_only:
        if pattern.lower() in address_lower:
            return True, pattern
    return False, None


def format_departure_time_for_api(dt):
    """Format datetime as RFC 3339 UTC for Routes API."""
    # Convert to UTC if timezone-aware, otherwise assume already appropriate
    if dt.tzinfo:
        utc_dt = dt.astimezone(datetime.timezone.utc)
    else:
        utc_dt = dt
    return utc_dt.strftime('%Y-%m-%dT%H:%M:%SZ')


def overlaps_existing_transit(start, end, events, transit_color):
    """
    Check if a proposed transit event would overlap with any existing transit event.

    Args:
        start: datetime of proposed transit start
        end: datetime of proposed transit end
        events: list of all calendar events
        transit_color: colorId for transit events (e.g., '11')

    Returns:
        True if there's an overlap, False otherwise
    """
    for event in events:
        # Only check existing transit events
        if event.get('colorId') != transit_color:
            continue

        # Get event times
        event_start_str = event['start'].get('dateTime')
        event_end_str = event['end'].get('dateTime')

        if not event_start_str or not event_end_str:
            continue

        event_start = parse_datetime(event_start_str)
        event_end = parse_datetime(event_end_str)

        # Check for overlap: events overlap if one starts before the other ends
        if start < event_end and end > event_start:
            return True

    return False


def get_stay_location_for_night(date_str, events):
    """
    Find the Stay event location for a given night.

    Args:
        date_str: The date of the night (YYYY-MM-DD) - "where am I sleeping tonight?"

    Returns:
        The location string if a Stay event covers this night, else None.

    Note on single-day vs multi-day stays:
        - Single-day stay (Dec 15): covers the night of Dec 15
        - Multi-day stay (Dec 12-15): covers nights of Dec 12, 13, 14 only
          (the last day is checkout day - you leave in the morning, don't sleep there)
    """
    target_date = datetime.datetime.strptime(date_str, '%Y-%m-%d').date()

    for event in events:
        summary = event.get('summary', '').lower()

        # Check if this is a Stay event
        if not any(kw in summary for kw in STAY_KEYWORDS):
            continue

        # Stay events are all-day events with 'date' fields
        start_date_str = event['start'].get('date')
        end_date_str = event['end'].get('date')

        if not start_date_str or not end_date_str:
            continue  # Not an all-day event

        start_date = datetime.datetime.strptime(start_date_str, '%Y-%m-%d').date()
        end_date = datetime.datetime.strptime(end_date_str, '%Y-%m-%d').date()

        # Calculate duration to distinguish single-day from multi-day stays
        # For all-day events: end_date is exclusive, so a 1-day event has end = start + 1
        duration_days = (end_date - start_date).days

        if duration_days == 1:
            # Single-day stay: covers the night of that day
            if target_date == start_date:
                location = event.get('location')
                if location:
                    return location
                else:
                    return None
        else:
            # Multi-day stay: covers nights of start through (end - 2 days)
            # The last day is checkout day, no night there
            last_night = end_date - datetime.timedelta(days=2)
            if start_date <= target_date <= last_night:
                location = event.get('location')
                if location:
                    return location
                else:
                    return None

    return None


def get_home_for_transit(date_str, direction, events, config):
    """
    Get the "home" location for transit on a given date.

    Args:
        date_str: The date (YYYY-MM-DD)
        direction: "morning" (leaving from where I slept) or "evening" (returning to where I'll sleep)
        events: List of calendar events
        config: Config dict with home_address

    Returns:
        (location, display_name) tuple
    """
    target_date = datetime.datetime.strptime(date_str, '%Y-%m-%d').date()

    if direction == "morning":
        # Look up prior night's stay (where did I sleep last night?)
        prior_night = (target_date - datetime.timedelta(days=1)).strftime('%Y-%m-%d')
        stay_location = get_stay_location_for_night(prior_night, events)
    else:  # evening
        # Look up tonight's stay (where am I sleeping tonight?)
        stay_location = get_stay_location_for_night(date_str, events)

    if stay_location:
        return stay_location, get_location_name(stay_location)
    else:
        # Fall back to config home address (check user section first, then root level)
        home = config.get('user', {}).get('home_address') or config.get('home_address', '1000 Union St, Brooklyn, NY')
        return home, "Home"


def calculate_transit_events(events, config, ignore_trips=False, force_drive=False):
    """
    Walk through events and calculate what transit events should be created.

    Args:
        events: List of calendar events
        config: Config dict
        ignore_trips: If True, skip trip date detection
        force_drive: If True, use car/driving mode for all transit calculations

    Returns list of transit event dicts (not yet inserted into calendar).
    """
    transit_events = []
    transit_color = config.get('transit_color_id', '11')

    # Detect trip dates upfront
    if ignore_trips:
        trip_dates = set()
        print("\n(Trip detection disabled)")
    else:
        trip_dates = detect_trip_dates(events)
        if trip_dates:
            print(f"\nDetected trip dates: {sorted(trip_dates)}")

    by_day = group_events_by_day(events)

    for date_str, day_events in sorted(by_day.items()):
        print(f"\n=== {date_str} ({len(day_events)} events) ===")

        # Skip entire day if it's a trip day
        if date_str in trip_dates:
            print(f"  (Trip day - skipping transit events)")
            continue

        # Get dynamic "home" for this day based on Stay events
        morning_home, morning_home_name = get_home_for_transit(date_str, "morning", events, config)
        evening_home, evening_home_name = get_home_for_transit(date_str, "evening", events, config)

        previous_location = morning_home
        previous_location_name = morning_home_name
        previous_event_end = None  # Track when the last event ended (for traffic-aware routing)

        for i, event in enumerate(day_events):
            summary = event.get('summary', '(no title)')
            location = event.get('location', '')

            skip, reason = should_skip_event(event, config)
            if skip:
                print(f"  SKIP: {summary} ({reason})")
                continue

            # Check if location is same as previous
            if location.lower() == previous_location.lower():
                print(f"  SKIP: {summary} (same location as previous)")
                continue

            print(f"  EVENT: {summary}")
            print(f"         Location: {location}")

            # Calculate departure time for traffic-aware routing
            event_start = parse_datetime(event['start']['dateTime'])
            if previous_event_end:
                departure_time_str = format_departure_time_for_api(previous_event_end)
            else:
                # First event of day: estimate departure as event_start - 60 min
                estimated_departure = event_start - datetime.timedelta(minutes=60)
                departure_time_str = format_departure_time_for_api(estimated_departure)

            # Check if origin or destination is a car-only location
            origin_car_only, origin_match = check_car_only_location(previous_location, config)
            dest_car_only, dest_match = check_car_only_location(location, config)
            location_force_drive = origin_car_only or dest_car_only
            final_force_drive = force_drive or location_force_drive

            # Build car-only reason for logging/metadata
            car_only_reason = None
            if origin_car_only:
                car_only_reason = f"origin matched '{origin_match}'"
            elif dest_car_only:
                car_only_reason = f"destination matched '{dest_match}'"

            # Calculate transit TO this event
            try:
                transit_time = get_transit_time(
                    origin=previous_location,
                    destination=location,
                    use_stub=False,
                    departure_time=departure_time_str,
                    force_drive=final_force_drive
                )
            except RuntimeError as e:
                print(f"         (skipping transit: {e})")
                previous_location = location
                previous_location_name = get_location_name(location)
                continue

            # Skip short transits (< 10 minutes)
            if transit_time['duration_minutes'] < 10:
                print(f"         (skipping transit: only {transit_time['duration_minutes']} min)")
                previous_location = location
                previous_location_name = get_location_name(location)
                previous_event_end = parse_datetime(event['end']['dateTime'])
                continue

            # Skip unreasonably long transits (> 3 hours)
            if transit_time['duration_minutes'] > 180:
                print(f"         (skipping transit: {transit_time['duration_minutes']} min is unreasonably long)")
                previous_location = location
                previous_location_name = get_location_name(location)
                previous_event_end = parse_datetime(event['end']['dateTime'])
                continue

            # event_start was already parsed above for departure_time calculation
            transit_start = event_start - datetime.timedelta(minutes=transit_time['duration_minutes'])

            # Skip if overlaps existing transit event
            if overlaps_existing_transit(transit_start, event_start, events, transit_color):
                print(f"         (skipping: overlaps existing transit)")
                previous_location = location
                previous_location_name = get_location_name(location)
                previous_event_end = parse_datetime(event['end']['dateTime'])
                continue

            destination_name = get_location_name(location)
            prefix = "DRIVE" if transit_time['mode'] == 'driving' else "TRANSIT"
            transit_summary = f"{prefix}: {previous_location_name} → {destination_name}"

            # Build metadata with optional blending info
            metadata = {
                'duration_minutes': transit_time['duration_minutes'],
                'mode': transit_time['mode'],
                'is_stub': transit_time['is_stub'],
                'for_event': summary
            }
            if car_only_reason:
                metadata['car_only_reason'] = car_only_reason
            if transit_time.get('best_guess_minutes') is not None:
                metadata['best_guess_minutes'] = transit_time['best_guess_minutes']
            if transit_time.get('pessimistic_minutes') is not None:
                metadata['pessimistic_minutes'] = transit_time['pessimistic_minutes']
            if transit_time.get('is_blended'):
                metadata['is_blended'] = True

            # Build description with optional traffic note
            mode_label = 'car' if transit_time['mode'] == 'driving' else 'transit'
            description = f"Arriving at: {location}. Travel by {mode_label}."
            if transit_time.get('is_blended'):
                description += " (Transit duration is longer than usual at this time due to traffic.)"

            transit_event = {
                'summary': transit_summary,
                'location': previous_location,
                'colorId': transit_color,
                'start': format_datetime(transit_start),
                'end': format_datetime(event_start),
                'description': description,
                '_metadata': metadata
            }

            transit_events.append(transit_event)

            # Console output with blending info and car-only reason
            mode_str = 'car' if transit_time['mode'] == 'driving' else 'transit'
            mode_suffix = ""
            if car_only_reason:
                mode_suffix = f" (car-only: {car_only_reason})"
            elif transit_time.get('is_blended'):
                mode_suffix = f" (blended: {transit_time['best_guess_minutes']} best / {transit_time['pessimistic_minutes']} pessimistic)"
            print(f"         + TRANSIT from {previous_location_name} to {destination_name}: {transit_time['duration_minutes']} min by {mode_str}{mode_suffix}")

            # Update previous location and event end for next iteration
            previous_location = location
            previous_location_name = destination_name
            previous_event_end = parse_datetime(event['end']['dateTime'])

        # After last event of day, add transit home (to evening's "home" - may be a Stay location)
        if previous_location.lower() != evening_home.lower() and day_events:
            # Find the last non-skipped event
            last_event = None
            for event in reversed(day_events):
                skip, _ = should_skip_event(event, config)
                if not skip:
                    last_event = event
                    break

            if last_event and last_event.get('location'):
                # Calculate departure time for traffic-aware routing (leaving when last event ends)
                event_end = parse_datetime(last_event['end']['dateTime'])
                departure_time_str = format_departure_time_for_api(event_end)

                # Check if origin or destination is a car-only location
                origin_car_only, origin_match = check_car_only_location(previous_location, config)
                dest_car_only, dest_match = check_car_only_location(evening_home, config)
                location_force_drive = origin_car_only or dest_car_only
                final_force_drive = force_drive or location_force_drive

                # Build car-only reason for logging/metadata
                car_only_reason = None
                if origin_car_only:
                    car_only_reason = f"origin matched '{origin_match}'"
                elif dest_car_only:
                    car_only_reason = f"destination matched '{dest_match}'"

                try:
                    transit_time = get_transit_time(
                        origin=previous_location,
                        destination=evening_home,
                        use_stub=False,
                        departure_time=departure_time_str,
                        force_drive=final_force_drive
                    )
                except RuntimeError as e:
                    print(f"         (skipping transit home: {e})")
                    continue

                # Skip short transits (< 10 minutes)
                if transit_time['duration_minutes'] < 10:
                    print(f"         (skipping transit home: only {transit_time['duration_minutes']} min)")
                    continue

                # Skip unreasonably long transits (> 3 hours)
                if transit_time['duration_minutes'] > 180:
                    print(f"         (skipping transit home: {transit_time['duration_minutes']} min is unreasonably long)")
                    continue

                transit_end = event_end + datetime.timedelta(minutes=transit_time['duration_minutes'])

                # Skip if overlaps existing transit event
                if overlaps_existing_transit(event_end, transit_end, events, transit_color):
                    print(f"         (skipping transit home: overlaps existing transit)")
                    continue

                # Build metadata with optional blending info
                metadata = {
                    'duration_minutes': transit_time['duration_minutes'],
                    'mode': transit_time['mode'],
                    'is_stub': transit_time['is_stub'],
                    'for_event': 'return home'
                }
                if car_only_reason:
                    metadata['car_only_reason'] = car_only_reason
                if transit_time.get('best_guess_minutes') is not None:
                    metadata['best_guess_minutes'] = transit_time['best_guess_minutes']
                if transit_time.get('pessimistic_minutes') is not None:
                    metadata['pessimistic_minutes'] = transit_time['pessimistic_minutes']
                if transit_time.get('is_blended'):
                    metadata['is_blended'] = True

                # Build description with optional traffic note
                mode_label = 'car' if transit_time['mode'] == 'driving' else 'transit'
                description = f"Arriving at: {evening_home}. Travel by {mode_label}."
                if transit_time.get('is_blended'):
                    description += " (Transit duration is longer than usual at this time due to traffic.)"

                prefix = "DRIVE" if transit_time['mode'] == 'driving' else "TRANSIT"
                transit_event = {
                    'summary': f"{prefix}: {previous_location_name} → {evening_home_name}",
                    'location': previous_location,
                    'colorId': transit_color,
                    'start': format_datetime(event_end),
                    'end': format_datetime(transit_end),
                    'description': description,
                    '_metadata': metadata
                }

                transit_events.append(transit_event)

                # Console output with blending info and car-only reason
                mode_str = 'car' if transit_time['mode'] == 'driving' else 'transit'
                mode_suffix = ""
                if car_only_reason:
                    mode_suffix = f" (car-only: {car_only_reason})"
                elif transit_time.get('is_blended'):
                    mode_suffix = f" (blended: {transit_time['best_guess_minutes']} best / {transit_time['pessimistic_minutes']} pessimistic)"
                print(f"         + TRANSIT from {previous_location_name} to {evening_home_name}: {transit_time['duration_minutes']} min by {mode_str}{mode_suffix}")

    return transit_events


def write_dry_run_output(transit_events, filename='dry_run_output.json'):
    """Write planned transit events to a JSON file for review."""
    output = {
        'generated_at': datetime.datetime.now().isoformat(),
        'note': 'This is a dry run. No events were created in Google Calendar.',
        'transit_events_count': len(transit_events),
        'transit_events': transit_events
    }

    with open(filename, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\nDry run output saved to {filename}")
    print(f"Review the file, then run with --execute to create events.")


def insert_transit_events(service, transit_events):
    """Actually insert transit events into Google Calendar."""
    print("\n" + "="*60)
    print("EXECUTE MODE - Creating calendar events")
    print("="*60)

    created_count = 0
    for event in transit_events:
        # Remove _metadata before inserting (not a Calendar API field)
        event_body = {k: v for k, v in event.items() if not k.startswith('_')}

        created = service.events().insert(
            calendarId='primary',
            body=event_body
        ).execute()

        print(f"Created: {created.get('summary')}")
        created_count += 1

    print(f"\n{created_count} transit events created!")


def main():
    parser = argparse.ArgumentParser(
        description='Add transit events to Google Calendar'
    )
    parser.add_argument(
        '--execute',
        action='store_true',
        help='Actually create events (default is dry-run)'
    )
    parser.add_argument(
        '--force',
        action='store_true',
        help='Skip confirmation prompt (use with --execute)'
    )
    parser.add_argument(
        '--days',
        type=int,
        default=7,
        help='Number of days forward to process (default: 7)'
    )
    parser.add_argument(
        '--detect-trips',
        action='store_true',
        help='Enable trip detection to skip travel days (default: process all days)'
    )
    parser.add_argument(
        '--car-only',
        action='store_true',
        help='Force car/driving mode for all transit calculations (skip public transit)'
    )
    args = parser.parse_args()

    # Load config
    config = load_config()
    home_address = config.get('user', {}).get('home_address') or config.get('home_address')
    car_only_locations = config.get('user', {}).get('car_only_locations', [])
    print(f"Home address: {home_address}")
    print(f"Transit color ID: {config.get('transit_color_id')}")
    if car_only_locations:
        print(f"Car-only locations: {car_only_locations}")
    if args.car_only:
        print("Mode: CAR ONLY (skipping public transit)")

    # Authenticate and build service
    creds = get_credentials()
    service = build('calendar', 'v3', credentials=creds)

    # Fetch events
    events = fetch_events(service, days_forward=args.days)
    print(f"Found {len(events)} events")

    if not events:
        print("No events found. Nothing to do.")
        return

    # Calculate transit events
    transit_events = calculate_transit_events(
        events, config,
        ignore_trips=not args.detect_trips,
        force_drive=args.car_only
    )

    print(f"\n{'='*60}")
    print(f"SUMMARY: {len(transit_events)} transit events to create")
    print(f"{'='*60}")

    if not transit_events:
        print("No transit events needed.")
        return

    if args.execute:
        if not args.force:
            print(f"\nAbout to create {len(transit_events)} transit events in Google Calendar.")
            confirm = input("Proceed? [y/N] ")
            if confirm.lower() != 'y':
                print("Aborted.")
                return
        insert_transit_events(service, transit_events)
    else:
        write_dry_run_output(transit_events)


if __name__ == '__main__':
    main()
