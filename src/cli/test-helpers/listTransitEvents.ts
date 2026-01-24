/**
 * List (and optionally delete) transit events in calendar
 *
 * Use case: Clean up orphaned transit events when you forgot --include-transit
 * on the cleanup tool after the original test events were already deleted.
 *
 * Usage:
 *   bun run src/cli/test-helpers/listTransitEvents.ts           # List only
 *   bun run src/cli/test-helpers/listTransitEvents.ts --delete  # List and delete
 */

import { parseArgs } from "node:util";
import { getAccessToken } from "../cliAuth.ts";

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";
const MAX_DAYS_FORWARD = 14;

// Parse command line arguments
const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    delete: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
  strict: true,
  allowPositionals: false,
});

if (values.help) {
  console.log(`
List Transit Events

Usage:
  bun run src/cli/test-helpers/listTransitEvents.ts [options]

Options:
  --delete       Delete all listed transit events (with 3-second confirmation)
  -h, --help     Show this help message

Description:
  Lists all transit events (TRANSIT: and DRIVE: prefixes) in the next ${MAX_DAYS_FORWARD} days.

  Use case: Clean up orphaned transit events when you forgot --include-transit
  on the cleanup tool after the original test events were already deleted.

Examples:
  bun run src/cli/test-helpers/listTransitEvents.ts
      List all transit events

  bun run src/cli/test-helpers/listTransitEvents.ts --delete
      List and delete all transit events after 3-second confirmation
`);
  process.exit(0);
}

interface CalendarEvent {
  id: string;
  summary?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

async function deleteEvent(eventId: string, accessToken: string): Promise<void> {
  const response = await fetch(
    `${CALENDAR_API_BASE}/calendars/primary/events/${eventId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete event: ${await response.text()}`);
  }
}

async function main() {
  const deleteMode = values.delete;
  console.log(`${deleteMode ? "Finding and deleting" : "Listing"} transit events in next ${MAX_DAYS_FORWARD} days...\n`);

  const accessToken = await getAccessToken();

  const now = new Date();
  const maxDate = new Date();
  maxDate.setDate(now.getDate() + MAX_DAYS_FORWARD);

  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: maxDate.toISOString(),
    maxResults: "100",
    singleEvents: "true",
    orderBy: "startTime",
  });

  const response = await fetch(
    `${CALENDAR_API_BASE}/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${await response.text()}`);
  }

  const data = await response.json();
  const transitEvents = (data.items || []).filter((e: CalendarEvent) =>
    e.summary?.startsWith("TRANSIT:") || e.summary?.startsWith("DRIVE:")
  );

  if (transitEvents.length === 0) {
    console.log("✓ No transit events found in the next 14 days!");
    return;
  }

  console.log(`Found ${transitEvents.length} transit event(s):\n`);

  // Group by date
  const byDate: Record<string, CalendarEvent[]> = {};
  for (const event of transitEvents) {
    const dateStr = event.start.dateTime?.split("T")[0] || event.start.date || "unknown";
    if (!byDate[dateStr]) byDate[dateStr] = [];
    byDate[dateStr].push(event);
  }

  for (const [date, events] of Object.entries(byDate).sort()) {
    console.log(`  ${date}:`);
    for (const event of events) {
      const time = event.start.dateTime?.split("T")[1]?.slice(0, 5) || "";
      console.log(`    ${time} ${event.summary}`);
    }
  }

  if (!deleteMode) {
    console.log("\nTo delete these events, run with --delete flag");
    return;
  }

  // Delete mode
  console.log(`\n⚠️  About to delete ${transitEvents.length} transit events.`);
  console.log("Press Ctrl+C to cancel, or wait 3 seconds to proceed...\n");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log("Deleting events...");
  let deleted = 0;
  let failed = 0;

  for (const event of transitEvents) {
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
  console.log(`Deleted ${deleted} transit events (${failed} failed)`);
  console.log(`═══════════════════════════════════════════════════════════════`);
}

main().catch(console.error);
