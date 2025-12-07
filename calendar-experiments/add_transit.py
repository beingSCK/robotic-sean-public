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


# Calendar API scope - need write access to create events
# TODO(scope): Change to 'calendar' (without .readonly) when ready to create events
SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']

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
    transit_color = config.get('transit_color_id', '8')
    if event.get('colorId') == transit_color:
        return True, "already a transit event"

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


def calculate_transit_events(events, config):
    """
    Walk through events and calculate what transit events should be created.

    Returns list of transit event dicts (not yet inserted into calendar).
    """
    transit_events = []
    home_address = config.get('home_address', '1000 Union St, Brooklyn, NY')
    transit_color = config.get('transit_color_id', '8')

    by_day = group_events_by_day(events)

    for date_str, day_events in sorted(by_day.items()):
        print(f"\n=== {date_str} ({len(day_events)} events) ===")

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
                use_stub=True  # TODO(routes-api): Change to False when API ready
            )

            event_start = parse_datetime(event['start']['dateTime'])
            transit_start = event_start - datetime.timedelta(minutes=transit_time['duration_minutes'])

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
                    use_stub=True  # TODO(routes-api): Change to False when API ready
                )

                event_end = parse_datetime(last_event['end']['dateTime'])
                transit_end = event_end + datetime.timedelta(minutes=transit_time['duration_minutes'])

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
    # TODO(scope): This requires calendar write scope
    # When implementing:
    # 1. Change SCOPES to ['https://www.googleapis.com/auth/calendar']
    # 2. Delete token.json to re-authenticate
    # 3. Uncomment and implement the insertion code below

    print("\n" + "="*60)
    print("EXECUTE MODE - Creating calendar events")
    print("="*60)

    raise NotImplementedError(
        "Execute mode not yet implemented. "
        "Need to change scope to 'calendar' (write access) and re-authenticate. "
        "Use dry-run mode for now."
    )

    # Placeholder for actual implementation:
    # for event in transit_events:
    #     # Remove _metadata before inserting (not a Calendar API field)
    #     event_body = {k: v for k, v in event.items() if not k.startswith('_')}
    #     created = service.events().insert(calendarId='primary', body=event_body).execute()
    #     print(f"Created: {created.get('summary')} - {created.get('htmlLink')}")


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
        '--days',
        type=int,
        default=7,
        help='Number of days forward to process (default: 7)'
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
    transit_events = calculate_transit_events(events, config)

    print(f"\n{'='*60}")
    print(f"SUMMARY: {len(transit_events)} transit events to create")
    print(f"{'='*60}")

    if not transit_events:
        print("No transit events needed.")
        return

    if args.execute:
        insert_transit_events(service, transit_events)
    else:
        write_dry_run_output(transit_events)


if __name__ == '__main__':
    main()
