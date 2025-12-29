#!/usr/bin/env bun
/**
 * CLI Test Runner for Calendar Transit Extension
 *
 * Allows testing the extension's event processing logic without Chrome.
 * Uses the same auth tokens as the Python CLI tool.
 *
 * Usage:
 *   bun run test              # Console table output (default)
 *   bun run test --json       # JSON output
 *   bun run test --execute    # Actually create events
 *   bun run test --days 14    # Scan 14 days forward
 */

import { parseArgs } from 'util';
import { getAccessToken } from './cliAuth.ts';
import { fetchEvents, insertTransitEvents } from '../calendarService.ts';
import { calculateTransitEvents } from '../eventProcessor.ts';
import type { UserSettings, TransitEvent, CalendarEvent } from '../types.ts';
import { DEFAULT_SETTINGS } from '../config.ts';

// Parse command line arguments
const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    json: { type: 'boolean', default: false },
    execute: { type: 'boolean', default: false },
    days: { type: 'string', default: '7' },
    home: { type: 'string' },
    'detect-trips': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
  strict: true,
  allowPositionals: false,
});

if (values.help) {
  console.log(`
Calendar Transit Extension - CLI Test Runner

Usage:
  bun run test [options]

Options:
  --json          Output results as JSON (matches Python CLI format)
  --execute       Actually create transit events in calendar
  --days N        Number of days forward to scan (default: 7)
  --home ADDR     Override home address
  --detect-trips  Enable trip date detection (flights + stays)
  -h, --help      Show this help message

Examples:
  bun run test                    # Dry run with console table
  bun run test --json             # Dry run with JSON output
  bun run test --execute          # Create events
  bun run test --days 14          # Scan 2 weeks ahead
  bun run test --detect-trips     # Skip days with detected trips
`);
  process.exit(0);
}

// Load settings (from Python CLI's config or use defaults)
async function loadSettings(): Promise<UserSettings> {
  const settings: UserSettings = { ...DEFAULT_SETTINGS };

  // Try to load settings from Python CLI config
  try {
    const configPath = new URL('../../../calendar-cli-tools/config.json', import.meta.url);
    const configText = await Bun.file(configPath).text();
    const config = JSON.parse(configText);

    // Home address
    if (config.user?.home_address) {
      settings.homeAddress = config.user.home_address;
    } else if (config.home_address) {
      settings.homeAddress = config.home_address;
    }

    // Car-only locations
    if (config.user?.car_only_locations && Array.isArray(config.user.car_only_locations)) {
      settings.carOnlyLocations = config.user.car_only_locations;
    }

    // Home airports (for trip detection)
    if (config.user?.home_airports && Array.isArray(config.user.home_airports)) {
      settings.homeAirports = config.user.home_airports;
    }
  } catch {
    // Config file not found or invalid - use defaults
  }

  // Command line overrides
  if (values.home) {
    settings.homeAddress = values.home;
  }

  settings.daysForward = parseInt(values.days || '7', 10);

  // Enable trip detection if --detect-trips flag is passed
  if (values['detect-trips']) {
    settings.detectTrips = true;
  }

  return settings;
}

// Format transit event for console table
function formatEventForTable(event: TransitEvent): {
  date: string;
  time: string;
  route: string;
  mode: string;
  duration: string;
} {
  const startTime = new Date(event.start.dateTime);
  const endTime = new Date(event.end.dateTime);
  const durationMs = endTime.getTime() - startTime.getTime();
  const durationMin = Math.round(durationMs / 60000);

  // Extract route from summary (e.g., "TRANSIT: Home → Destination")
  const routeMatch = event.summary.match(/^(TRANSIT|DRIVE): (.+)$/);
  const route = routeMatch ? routeMatch[2] : event.summary;
  const mode = routeMatch ? routeMatch[1].toLowerCase() : 'unknown';

  return {
    date: startTime.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }),
    time: startTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }),
    route,
    mode,
    duration: `${durationMin} min`,
  };
}

// Print console table
function printTable(events: TransitEvent[]) {
  if (events.length === 0) {
    console.log('\nNo transit events to create.\n');
    return;
  }

  console.log('\n' + '='.repeat(80));
  console.log('TRANSIT EVENTS TO CREATE');
  console.log('='.repeat(80));

  const rows = events.map(formatEventForTable);

  // Calculate column widths
  const cols = {
    date: Math.max(10, ...rows.map((r) => r.date.length)),
    time: Math.max(8, ...rows.map((r) => r.time.length)),
    mode: Math.max(7, ...rows.map((r) => r.mode.length)),
    duration: Math.max(10, ...rows.map((r) => r.duration.length)),
    route: Math.max(30, ...rows.map((r) => r.route.length)),
  };

  // Header
  const header = [
    'Date'.padEnd(cols.date),
    'Time'.padEnd(cols.time),
    'Mode'.padEnd(cols.mode),
    'Duration'.padEnd(cols.duration),
    'Route',
  ].join('  ');
  console.log('\n' + header);
  console.log('-'.repeat(header.length + 20));

  // Rows
  for (const row of rows) {
    console.log(
      [
        row.date.padEnd(cols.date),
        row.time.padEnd(cols.time),
        row.mode.padEnd(cols.mode),
        row.duration.padEnd(cols.duration),
        row.route,
      ].join('  ')
    );
  }

  console.log('\n' + `Total: ${events.length} transit event(s)\n`);
}

// Print JSON output (matching Python CLI format)
function printJson(events: TransitEvent[], settings: UserSettings) {
  const output = {
    generated_at: new Date().toISOString(),
    settings: {
      home_address: settings.homeAddress,
      days_forward: settings.daysForward,
      transit_color_id: settings.transitColorId,
    },
    transit_events_count: events.length,
    transit_events: events.map((e) => ({
      summary: e.summary,
      location: e.location,
      colorId: e.colorId,
      start: e.start,
      end: e.end,
      description: e.description,
    })),
  };

  console.log(JSON.stringify(output, null, 2));
}

// Main
async function main() {
  const settings = await loadSettings();

  if (!settings.homeAddress) {
    console.error('Error: Home address not configured.');
    console.error('Set it in calendar-cli-tools/config.json or use --home flag.');
    process.exit(1);
  }

  if (!values.json) {
    console.log('Calendar Transit Extension - Test Runner');
    console.log('-'.repeat(40));
    console.log(`Home address: ${settings.homeAddress}`);
    console.log(`Days forward: ${settings.daysForward}`);
    if (settings.carOnlyLocations && settings.carOnlyLocations.length > 0) {
      console.log(`Car-only locations: ${settings.carOnlyLocations.join(', ')}`);
    }
    if (settings.detectTrips) {
      console.log(`Trip detection: enabled`);
    }
    console.log(`Mode: ${values.execute ? 'EXECUTE (will create events)' : 'DRY RUN'}`);
    console.log('');
  }

  // Fetch events
  if (!values.json) {
    console.log('Fetching calendar events...');
  }

  let events: CalendarEvent[];
  try {
    events = await fetchEvents(settings.daysForward, getAccessToken);
  } catch (error) {
    console.error('Error fetching events:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  if (!values.json) {
    console.log(`Found ${events.length} events`);
  }

  // Calculate transit events
  if (!values.json) {
    console.log('Calculating transit times...');
  }

  let transitEvents: TransitEvent[];
  try {
    transitEvents = await calculateTransitEvents(events, settings, (msg) => {
      if (!values.json) {
        console.log(`  ${msg}`);
      }
    });
  } catch (error) {
    console.error('Error calculating transit:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // Output results
  if (values.json) {
    printJson(transitEvents, settings);
  } else {
    printTable(transitEvents);
  }

  // Execute if requested
  if (values.execute && transitEvents.length > 0) {
    console.log('Creating transit events...');
    try {
      const count = await insertTransitEvents(transitEvents, getAccessToken);
      console.log(`Created ${count} transit events.`);
    } catch (error) {
      console.error('Error creating events:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
