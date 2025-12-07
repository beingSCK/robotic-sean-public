"""
Google Calendar Explorer
========================
A script to help you understand the Event resource structure in Google Calendar API.

Usage:
    pip install google-api-python-client google-auth-httplib2 google-auth-oauthlib
    python calendar_explorer.py

First run will open browser for OAuth consent. Subsequent runs use saved token.
"""

import os
import json
import datetime
from pathlib import Path

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

# If modifying scopes, delete token.json to re-authenticate
SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']

# Paths - adjust these to match your setup
CREDENTIALS_FILE = 'credentials.json'
TOKEN_FILE = 'token.json'


def get_credentials():
    """
    Handle the OAuth flow with token caching.

    This pattern is what you'll use in most Google API scripts:
    1. Check if we have a saved token
    2. If token exists but is expired, refresh it
    3. If no token, run the OAuth flow
    4. Save the token for next time
    """
    creds = None

    # Check for existing token
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)

    # If no valid credentials, get new ones
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            # Token expired but we have a refresh token - use it
            print("Refreshing expired token...")
            creds.refresh(Request())
        else:
            # No token at all - need to do the OAuth dance
            print("Opening browser for authentication...")
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
            creds = flow.run_local_server(port=0)

        # Save credentials for next run
        with open(TOKEN_FILE, 'w') as token:
            token.write(creds.to_json())
            print(f"Token saved to {TOKEN_FILE}")

    return creds


def explore_colors(service):
    """
    Fetch the color definitions from Google Calendar.

    Colors in Google Calendar are predefined - you can't create custom colors.
    Events use 'colorId' which is a string like "1", "2", etc.
    """
    print("\n" + "="*60)
    print("CALENDAR COLOR DEFINITIONS")
    print("="*60)

    colors = service.colors().get().execute()

    print("\nEvent colors (what you can assign to individual events):")
    print("-" * 40)
    for color_id, color_info in colors.get('event', {}).items():
        print(f"  colorId '{color_id}': background={color_info['background']}, foreground={color_info['foreground']}")

    print("\nCalendar colors (for entire calendars):")
    print("-" * 40)
    for color_id, color_info in colors.get('calendar', {}).items():
        print(f"  colorId '{color_id}': background={color_info['background']}")

    return colors


def list_calendars(service):
    """
    List all calendars accessible to this account.
    Useful if you have multiple calendars (work, personal, shared, etc.)
    """
    print("\n" + "="*60)
    print("YOUR CALENDARS")
    print("="*60)

    calendars = service.calendarList().list().execute()

    for cal in calendars.get('items', []):
        primary_marker = " (PRIMARY)" if cal.get('primary') else ""
        print(f"\n  ID: {cal['id']}{primary_marker}")
        print(f"  Summary: {cal.get('summary', 'No name')}")
        print(f"  Background Color: {cal.get('backgroundColor', 'default')}")

    return calendars


def fetch_events(service, calendar_id='primary', days_back=7, days_forward=7, max_results=20):
    """
    Fetch events and return the raw API response.
    """
    now = datetime.datetime.utcnow()
    time_min = (now - datetime.timedelta(days=days_back)).isoformat() + 'Z'
    time_max = (now + datetime.timedelta(days=days_forward)).isoformat() + 'Z'

    print(f"\nFetching events from {time_min[:10]} to {time_max[:10]}...")

    events_result = service.events().list(
        calendarId=calendar_id,
        timeMin=time_min,
        timeMax=time_max,
        maxResults=max_results,
        singleEvents=True,  # Expand recurring events into individual instances
        orderBy='startTime'
    ).execute()

    return events_result


def explore_events(events_result):
    """
    Print detailed info about events, especially focusing on color-related fields.
    """
    events = events_result.get('items', [])

    print("\n" + "="*60)
    print(f"EVENTS ({len(events)} found)")
    print("="*60)

    if not events:
        print("No events found in this time range.")
        return

    for i, event in enumerate(events, 1):
        start = event['start'].get('dateTime', event['start'].get('date'))

        print(f"\n--- Event {i} ---")
        print(f"  Summary: {event.get('summary', '(no title)')}")
        print(f"  Start: {start}")
        print(f"  Event ID: {event.get('id', 'N/A')[:30]}...")

        # COLOR FIELDS - this is what you're looking for!
        color_id = event.get('colorId')
        if color_id:
            print(f"  ★ colorId: '{color_id}'  <-- This is the color/label!")
        else:
            print(f"  ★ colorId: None (using calendar default)")

        # Other potentially interesting fields
        if event.get('description'):
            desc = event['description'][:50] + "..." if len(event.get('description', '')) > 50 else event.get('description')
            print(f"  Description: {desc}")

        if event.get('location'):
            print(f"  Location: {event['location']}")

        # Show attendees count if any
        attendees = event.get('attendees', [])
        if attendees:
            print(f"  Attendees: {len(attendees)}")


def dump_raw_event(events_result, index=0):
    """
    Dump the complete raw JSON of an event so you can see ALL fields.
    """
    events = events_result.get('items', [])

    if not events:
        print("No events to dump.")
        return

    if index >= len(events):
        index = 0

    event = events[index]

    print("\n" + "="*60)
    print(f"RAW EVENT JSON (event {index + 1}: {event.get('summary', 'untitled')})")
    print("="*60)
    print(json.dumps(event, indent=2, default=str))


def save_events_to_file(events_result, filename='events_dump.json'):
    """
    Save all fetched events to a JSON file for offline analysis.
    """
    with open(filename, 'w') as f:
        json.dumps(events_result, f, indent=2, default=str)
    print(f"\nEvents saved to {filename}")


def main():
    # Step 1: Get authenticated
    creds = get_credentials()

    # Step 2: Build the service object
    # The 'build' function fetches a discovery document and dynamically creates
    # methods for all API endpoints. Pretty magical!
    service = build('calendar', 'v3', credentials=creds)

    # Step 3: Explore!

    # See what colors are available
    colors = explore_colors(service)

    # See what calendars you have access to
    calendars = list_calendars(service)

    # Fetch recent/upcoming events
    events_result = fetch_events(
        service,
        calendar_id='primary',
        days_back=7,
        days_forward=14,
        max_results=25
    )

    # Show summary of events with color info
    explore_events(events_result)

    # Dump the first event's complete structure
    dump_raw_event(events_result, index=0)

    # Save to file for manual inspection
    output_path = 'events_dump.json'
    with open(output_path, 'w') as f:
        json.dump(events_result, f, indent=2, default=str)
    print(f"\n✓ Full event data saved to {output_path}")
    print("  Open this file to see the complete Event resource structure!")


if __name__ == '__main__':
    main()
