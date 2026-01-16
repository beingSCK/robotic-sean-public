/**
 * Cleanup test events from Google Calendar
 *
 * Safety guardrails:
 * - Only deletes events with "[TEST EVENT" in description (by default)
 * - Only deletes events within the next 14 days
 * - Requires 3-second confirmation delay before deleting
 * - Shows what will be deleted before confirming
 *
 * Flags:
 *   --include-transit  Also delete transit events derived from test events
 *                      (identified by time proximity, not location matching)
 *
 * Run with:
 *   bun run src/cli/test-helpers/cleanupTestEvents.ts
 *   bun run src/cli/test-helpers/cleanupTestEvents.ts --include-transit
 */

import { parseArgs } from "node:util";
import { getAccessToken } from "../cliAuth.ts";

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

// Safety: Only delete events within this many days from now
const MAX_DAYS_FORWARD = 14;

// Pattern to match test events
const TEST_EVENT_PATTERN = "[TEST EVENT";

// Time proximity threshold for matching derived transit events (ms)
const TIME_PROXIMITY_MS = 60 * 1000; // 1 minute

interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  colorId?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

// Parse command line arguments
const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    "include-transit": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
  strict: true,
  allowPositionals: false,
});

if (values.help) {
  console.log(`
Calendar Test Event Cleanup

Usage:
  bun run src/cli/test-helpers/cleanupTestEvents.ts [options]

Options:
  --include-transit  Also delete transit events derived from test events
                     (matched by time proximity: ±1 min of test event start/end)
  -h, --help         Show this help message

Safety guardrails:
  - Only deletes events within next ${MAX_DAYS_FORWARD} days
  - 3-second confirmation delay before deleting
  - Shows what will be deleted before confirming

Examples:
  bun run src/cli/test-helpers/cleanupTestEvents.ts
      Delete only events with "[TEST EVENT" in description

  bun run src/cli/test-helpers/cleanupTestEvents.ts --include-transit
      Delete test events AND their derived transit events
`);
  process.exit(0);
}

interface CleanupOptions {
  includeTransit: boolean;
}

function getOptions(): CleanupOptions {
  return {
    includeTransit: values["include-transit"] ?? false,
  };
}

async function fetchEvents(accessToken: string): Promise<CalendarEvent[]> {
  const now = new Date();
  const maxDate = new Date();
  maxDate.setDate(now.getDate() + MAX_DAYS_FORWARD);

  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: maxDate.toISOString(),
    maxResults: "250",
    singleEvents: "true",
    orderBy: "startTime",
  });

  const response = await fetch(
    `${CALENDAR_API_BASE}/calendars/primary/events?${params}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${await response.text()}`);
  }

  const data = await response.json();
  return data.items || [];
}

async function deleteEvent(eventId: string, accessToken: string): Promise<void> {
  const response = await fetch(
    `${CALENDAR_API_BASE}/calendars/primary/events/${eventId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete event: ${await response.text()}`);
  }
}

/**
 * Check if an event is a test event (has [TEST EVENT in description)
 */
function isTestEvent(event: CalendarEvent): boolean {
  return event.description?.includes(TEST_EVENT_PATTERN) ?? false;
}

/**
 * Check if a transit event is derived from a test event
 * by checking time proximity: transit ends when you arrive (at event start)
 * or transit starts when you leave (at event end)
 */
function isDerivedTransitEvent(
  event: CalendarEvent,
  testEvents: CalendarEvent[]
): boolean {
  // Must be a transit event (TRANSIT: or DRIVE: prefix)
  if (!event.summary?.startsWith("TRANSIT:") && !event.summary?.startsWith("DRIVE:")) {
    return false;
  }

  const eventStart = event.start.dateTime ? new Date(event.start.dateTime).getTime() : null;
  const eventEnd = event.end.dateTime ? new Date(event.end.dateTime).getTime() : null;

  if (!eventStart || !eventEnd) return false;

  for (const testEvent of testEvents) {
    const testStart = testEvent.start.dateTime ? new Date(testEvent.start.dateTime).getTime() : null;
    const testEnd = testEvent.end.dateTime ? new Date(testEvent.end.dateTime).getTime() : null;

    if (!testStart || !testEnd) continue;

    // Transit TO an event: transit ends at event start
    // (transit event end ≈ test event start)
    if (Math.abs(eventEnd - testStart) <= TIME_PROXIMITY_MS) {
      return true;
    }

    // Transit FROM an event (return home): transit starts at event end
    // (transit event start ≈ test event end)
    if (Math.abs(eventStart - testEnd) <= TIME_PROXIMITY_MS) {
      return true;
    }
  }

  return false;
}

async function main() {
  const options = getOptions();

  console.log("Calendar Test Event Cleanup");
  console.log("═══════════════════════════════════════════════════════════════\n");
  console.log(`Safety: Only checking events within next ${MAX_DAYS_FORWARD} days`);
  console.log(`Mode: ${options.includeTransit ? "Test events + derived transit events" : "Test events only"}`);
  console.log(`Pattern: Events with "${TEST_EVENT_PATTERN}" in description\n`);

  const accessToken = await getAccessToken();

  console.log("Fetching events...");
  const allEvents = await fetchEvents(accessToken);

  // First pass: find all test events
  const testEvents = allEvents.filter(isTestEvent);

  // Build list of events to delete
  let eventsToDelete: CalendarEvent[] = [...testEvents];

  // Second pass: if --include-transit, find derived transit events
  if (options.includeTransit && testEvents.length > 0) {
    const derivedTransit = allEvents.filter(
      (event) => !isTestEvent(event) && isDerivedTransitEvent(event, testEvents)
    );
    eventsToDelete = [...eventsToDelete, ...derivedTransit];
  }

  if (eventsToDelete.length === 0) {
    console.log("\n✓ No test events found. Calendar is clean!");
    return;
  }

  // Sort by start time for display
  eventsToDelete.sort((a, b) => {
    const aTime = a.start.dateTime || a.start.date || "";
    const bTime = b.start.dateTime || b.start.date || "";
    return aTime.localeCompare(bTime);
  });

  console.log(`\nFound ${eventsToDelete.length} events to delete:\n`);

  // Group by date for readability
  const byDate: Record<string, { event: CalendarEvent; type: string }[]> = {};
  for (const event of eventsToDelete) {
    const dateStr = event.start.dateTime?.split("T")[0] || event.start.date || "unknown";
    if (!byDate[dateStr]) byDate[dateStr] = [];
    const type = isTestEvent(event) ? "test" : "transit";
    byDate[dateStr].push({ event, type });
  }

  for (const [date, items] of Object.entries(byDate).sort()) {
    console.log(`  ${date}:`);
    for (const { event, type } of items) {
      const label = type === "transit" ? " (derived)" : "";
      console.log(`    - ${event.summary}${label}`);
    }
  }

  // Summary
  const testCount = eventsToDelete.filter(isTestEvent).length;
  const transitCount = eventsToDelete.length - testCount;
  console.log(`\n  Summary: ${testCount} test events, ${transitCount} derived transit events`);

  // Prompt for confirmation
  console.log(`\n⚠️  About to delete ${eventsToDelete.length} events.`);
  console.log("Press Ctrl+C to cancel, or wait 3 seconds to proceed...\n");

  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log("Deleting events...");
  let deleted = 0;
  let failed = 0;

  for (const event of eventsToDelete) {
    try {
      await deleteEvent(event.id, accessToken);
      console.log(`  ✓ Deleted: ${event.summary}`);
      deleted++;
    } catch (error) {
      console.error(`  ✗ Failed: ${event.summary} - ${error}`);
      failed++;
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`Deleted ${deleted} events (${failed} failed)`);
  console.log(`═══════════════════════════════════════════════════════════════`);
}

main().catch(console.error);
