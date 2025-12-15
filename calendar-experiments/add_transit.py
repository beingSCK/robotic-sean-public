"""
Add Transit Events
==================
Main script that creates transit calendar events before and after meetings.

Usage:
    python add_transit.py              # Dry-run: outputs to dry_run_output.json
    python add_transit.py --execute    # Actually creates calendar events

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
        stay_keywords = ['stay:', 'stay at', 'hotel', 'airbnb', 'vrbo', 'accommodation']
        is_stay = any(kw in summary for kw in stay_keywords)

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


def calculate_transit_events(events, config, ignore_trips=False):
    """
    Walk through events and calculate what transit events should be created.

    Returns list of transit event dicts (not yet inserted into calendar).
    """
    transit_events = []
    home_address = config.get('home_address', '1000 Union St, Brooklyn, NY')
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

        previous_location = home_address
        previous_location_name = "Home"

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

            # Calculate transit TO this event
            transit_time = get_transit_time(
                origin=previous_location,
                destination=location,
                use_stub=False
            )

            # Skip short transits (< 10 minutes)
            if transit_time['duration_minutes'] < 10:
                print(f"         (skipping transit: only {transit_time['duration_minutes']} min)")
                previous_location = location
                previous_location_name = get_location_name(location)
                continue

            event_start = parse_datetime(event['start']['dateTime'])
            transit_start = event_start - datetime.timedelta(minutes=transit_time['duration_minutes'])

            # Skip if overlaps existing transit event
            if overlaps_existing_transit(transit_start, event_start, events, transit_color):
                print(f"         (skipping: overlaps existing transit)")
                previous_location = location
                previous_location_name = get_location_name(location)
                continue

            destination_name = get_location_name(location)
            transit_summary = f"TRANSIT: {previous_location_name} → {destination_name}"

            transit_event = {
                'summary': transit_summary,
                'location': previous_location,
                'colorId': transit_color,
                'start': format_datetime(transit_start),
                'end': format_datetime(event_start),
                'description': f"Travel from {previous_location} to {location}",
                '_metadata': {
                    'duration_minutes': transit_time['duration_minutes'],
                    'mode': transit_time['mode'],
                    'is_stub': transit_time['is_stub'],
                    'for_event': summary
                }
            }

            transit_events.append(transit_event)
            print(f"         + TRANSIT: {transit_time['duration_minutes']} min from {previous_location_name}")

            # Update previous location for next iteration
            previous_location = location
            previous_location_name = destination_name

        # After last event of day, add transit home
        if previous_location != home_address and day_events:
            # Find the last non-skipped event
            last_event = None
            for event in reversed(day_events):
                skip, _ = should_skip_event(event, config)
                if not skip:
                    last_event = event
                    break

            if last_event and last_event.get('location'):
                transit_time = get_transit_time(
                    origin=previous_location,
                    destination=home_address,
                    use_stub=False
                )

                # Skip short transits (< 10 minutes)
                if transit_time['duration_minutes'] < 10:
                    print(f"         (skipping transit home: only {transit_time['duration_minutes']} min)")
                    continue

                event_end = parse_datetime(last_event['end']['dateTime'])
                transit_end = event_end + datetime.timedelta(minutes=transit_time['duration_minutes'])

                # Skip if overlaps existing transit event
                if overlaps_existing_transit(event_end, transit_end, events, transit_color):
                    print(f"         (skipping transit home: overlaps existing transit)")
                    continue

                transit_event = {
                    'summary': f"TRANSIT: {previous_location_name} → Home",
                    'location': previous_location,
                    'colorId': transit_color,
                    'start': format_datetime(event_end),
                    'end': format_datetime(transit_end),
                    'description': f"Travel from {previous_location} to {home_address}",
                    '_metadata': {
                        'duration_minutes': transit_time['duration_minutes'],
                        'mode': transit_time['mode'],
                        'is_stub': transit_time['is_stub'],
                        'for_event': 'return home'
                    }
                }

                transit_events.append(transit_event)
                print(f"         + TRANSIT HOME: {transit_time['duration_minutes']} min")

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
    args = parser.parse_args()

    # Load config
    config = load_config()
    print(f"Home address: {config.get('home_address')}")
    print(f"Transit color ID: {config.get('transit_color_id')}")

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
    transit_events = calculate_transit_events(events, config, ignore_trips=not args.detect_trips)

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
