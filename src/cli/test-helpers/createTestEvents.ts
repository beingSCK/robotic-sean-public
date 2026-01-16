/**
 * Create test events for Calendar Automaton manual testing
 *
 * Events are anchored to "next Monday" so traffic patterns are consistent
 * when re-running tests on different weeks.
 *
 * Run with: bun run src/cli/test-helpers/createTestEvents.ts
 */

import { parseArgs } from "node:util";
import { getAccessToken } from "../cliAuth.ts";

// Parse command line arguments
const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    help: { type: "boolean", short: "h", default: false },
  },
  strict: true,
  allowPositionals: false,
});

if (values.help) {
  console.log(`
Create Test Events for Calendar Automaton

Usage:
  bun run src/cli/test-helpers/createTestEvents.ts [options]

Options:
  -h, --help    Show this help message

Description:
  Creates 13 test events on your Google Calendar starting "next Monday"
  (or today if today is Monday). The events are designed to test various
  Calendar Automaton behaviors:

  PROCESSED (9 events with locations):
    Mon: Coffee with Alex, Lunch Meeting
    Tue: Dentist, Client Meeting, Dinner
    Thu: Birthday Party in CT (tests driving fallback)
    Fri: Morning Meeting, Follow-up Coffee, Afternoon Workshop

  SKIPPED (4 events):
    Wed: Team Standup (Zoom URL), Product Review (conferenceData)
    Thu: Maybe: Book Club (graphite/hold color)
    Sun: Call Mom (no location)

  Expected transit events created: 13
    (each processed event gets transit TO it, plus return-home at end of day)

Assumptions:
  - Home: 1000 Union Street, Brooklyn, NY 11225 (from config.ts)
  - Transit preference: "default" (smart mode)

Related commands:
  bun run test --execute --days 10
      Run Calendar Automaton to create transit events

  bun run src/cli/test-helpers/cleanupTestEvents.ts --include-transit
      Delete test events and their derived transit events
`);
  process.exit(0);
}

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

interface TestEvent {
  summary: string;
  location?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  colorId?: string;
  description?: string;
  conferenceData?: object;
}

async function createEvent(event: TestEvent, accessToken: string): Promise<void> {
  const response = await fetch(
    `${CALENDAR_API_BASE}/calendars/primary/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create event: ${error}`);
  }

  console.log(`✓ Created: ${event.summary}`);
}

/**
 * Get next Monday from today (or today if it's Monday)
 */
function getNextMonday(): Date {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ...
  const daysUntilMonday = dayOfWeek === 1 ? 0 : (8 - dayOfWeek) % 7 || 7;
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + daysUntilMonday);
  nextMonday.setHours(0, 0, 0, 0);
  return nextMonday;
}

/**
 * Create ISO datetime for a specific day offset from anchor Monday
 */
function makeDateTime(anchorMonday: Date, dayOffset: number, hour: number, minute: number = 0): string {
  const date = new Date(anchorMonday);
  date.setDate(anchorMonday.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

async function main() {
  const anchorMonday = getNextMonday();
  const mondayStr = anchorMonday.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  console.log(`Creating test events starting ${mondayStr}...\n`);

  const accessToken = await getAccessToken();
  const tz = "America/New_York";

  // Day names for clarity
  // Day 0 = Monday, 1 = Tuesday, 2 = Wednesday, 3 = Thursday, 4 = Friday, 5 = Saturday, 6 = Sunday

  const testEvents: TestEvent[] = [
    // ═══════════════════════════════════════════════════════════════════════════
    // MONDAY (Day 0): 2 events - morning meeting + evening dinner
    // Expected transit events: Home→Coffee, Coffee→Lunch, Lunch→Home
    // ═══════════════════════════════════════════════════════════════════════════
    {
      summary: "Coffee with Alex",
      location: "Blue Bottle Coffee, 450 W 15th St, New York, NY 10011",
      start: { dateTime: makeDateTime(anchorMonday, 0, 9, 30), timeZone: tz },
      end: { dateTime: makeDateTime(anchorMonday, 0, 10, 30), timeZone: tz },
      description: `[TEST EVENT - Monday]
SHOULD PROCESS: Has physical location in Chelsea.
EXPECTED TRANSIT: Home → Blue Bottle (~15-25 min depending on home location)`,
    },
    {
      summary: "Lunch Meeting",
      location: "Eataly NYC Flatiron, 200 5th Ave, New York, NY 10010",
      start: { dateTime: makeDateTime(anchorMonday, 0, 12, 0), timeZone: tz },
      end: { dateTime: makeDateTime(anchorMonday, 0, 13, 30), timeZone: tz },
      description: `[TEST EVENT - Monday]
SHOULD PROCESS: Has physical location in Flatiron.
EXPECTED TRANSIT: Blue Bottle → Eataly (~10-15 min, short walk/transit)
EXPECTED TRANSIT: Eataly → Home (after this, return home commute)`,
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // TUESDAY (Day 1): 3 events - busy day testing sequential transit
    // Expected transit events: Home→Dentist, Dentist→Client, Client→Dinner, Dinner→Home
    // ═══════════════════════════════════════════════════════════════════════════
    {
      summary: "Dentist Appointment",
      location: "30 E 40th St, New York, NY 10016",
      start: { dateTime: makeDateTime(anchorMonday, 1, 8, 0), timeZone: tz },
      end: { dateTime: makeDateTime(anchorMonday, 1, 9, 0), timeZone: tz },
      description: `[TEST EVENT - Tuesday]
SHOULD PROCESS: Has physical location in Midtown East.
EXPECTED TRANSIT: Home → Dentist (early morning commute, check traffic)`,
    },
    {
      summary: "Client Meeting",
      location: "One World Trade Center, New York, NY 10007",
      start: { dateTime: makeDateTime(anchorMonday, 1, 11, 0), timeZone: tz },
      end: { dateTime: makeDateTime(anchorMonday, 1, 12, 30), timeZone: tz },
      description: `[TEST EVENT - Tuesday]
SHOULD PROCESS: Has physical location Downtown.
EXPECTED TRANSIT: Dentist → WTC (~20-30 min via subway)`,
    },
    {
      summary: "Dinner with Family",
      location: "Carbone, 181 Thompson St, New York, NY 10012",
      start: { dateTime: makeDateTime(anchorMonday, 1, 19, 0), timeZone: tz },
      end: { dateTime: makeDateTime(anchorMonday, 1, 21, 0), timeZone: tz },
      description: `[TEST EVENT - Tuesday]
SHOULD PROCESS: Has physical location in SoHo.
EXPECTED TRANSIT: WTC → Carbone (chains from prior event even with 6.5hr gap)
EXPECTED TRANSIT: Carbone → Home (end of day, return commute)`,
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // WEDNESDAY (Day 2): SKIP tests - Zoom and conferenceData
    // Expected: Both events should be SKIPPED
    // ═══════════════════════════════════════════════════════════════════════════
    {
      summary: "Team Standup (Zoom)",
      location: "https://zoom.us/j/123456789",
      start: { dateTime: makeDateTime(anchorMonday, 2, 10, 0), timeZone: tz },
      end: { dateTime: makeDateTime(anchorMonday, 2, 10, 30), timeZone: tz },
      description: `[TEST EVENT - Wednesday]
SHOULD SKIP: Location is a Zoom URL.
SKIP REASON: VIDEO_CALL_KEYWORD`,
    },
    {
      summary: "Product Review (Google Meet)",
      location: "Conference Room A",
      start: { dateTime: makeDateTime(anchorMonday, 2, 14, 0), timeZone: tz },
      end: { dateTime: makeDateTime(anchorMonday, 2, 15, 0), timeZone: tz },
      description: `[TEST EVENT - Wednesday]
SHOULD SKIP: Has conferenceData attached.
SKIP REASON: VIDEO_CALL_CONFERENCE`,
      conferenceData: { entryPoints: [{ entryPointType: "video" }] },
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // THURSDAY (Day 3): Long-distance trip + hold event
    // Expected: Birthday Party processed (may trigger driving), Book Club skipped
    // ═══════════════════════════════════════════════════════════════════════════
    {
      summary: "Birthday Party in CT",
      location: "123 Main St, Greenwich, CT 06830",
      start: { dateTime: makeDateTime(anchorMonday, 3, 14, 0), timeZone: tz },
      end: { dateTime: makeDateTime(anchorMonday, 3, 18, 0), timeZone: tz },
      description: `[TEST EVENT - Thursday]
SHOULD PROCESS: Has physical location (suburban CT).
EXPECTED TRANSIT: Home → Greenwich CT
NOTE: Transit likely >80 min, so should trigger DRIVING mode per smart fallback.
This tests the transit vs driving comparison logic.
EXPECTED TRANSIT: Greenwich → Home (long return commute)`,
    },
    {
      summary: "Maybe: Book Club",
      location: "McNally Jackson Books, 52 Prince St, New York, NY 10012",
      start: { dateTime: makeDateTime(anchorMonday, 3, 19, 0), timeZone: tz },
      end: { dateTime: makeDateTime(anchorMonday, 3, 21, 0), timeZone: tz },
      colorId: "8", // Graphite = hold/tentative
      description: `[TEST EVENT - Thursday]
SHOULD SKIP: Uses graphite color (colorId 8) indicating tentative/hold.
SKIP REASON: HOLD_EVENT`,
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // FRIDAY (Day 4): Close-together events testing back-to-back transit
    // Expected: 3 transit events, testing tight scheduling
    // ═══════════════════════════════════════════════════════════════════════════
    {
      summary: "Morning Meeting",
      location: "WeWork, 115 W 18th St, New York, NY 10011",
      start: { dateTime: makeDateTime(anchorMonday, 4, 9, 0), timeZone: tz },
      end: { dateTime: makeDateTime(anchorMonday, 4, 10, 0), timeZone: tz },
      description: `[TEST EVENT - Friday]
SHOULD PROCESS: Has physical location in Chelsea.
EXPECTED TRANSIT: Home → WeWork`,
    },
    {
      summary: "Follow-up Coffee",
      location: "Think Coffee, 123 4th Ave, New York, NY 10003",
      start: { dateTime: makeDateTime(anchorMonday, 4, 10, 30), timeZone: tz },
      end: { dateTime: makeDateTime(anchorMonday, 4, 11, 30), timeZone: tz },
      description: `[TEST EVENT - Friday]
SHOULD PROCESS: Has physical location in East Village.
EXPECTED TRANSIT: WeWork → Think Coffee
NOTE: Only 30 min gap - tests tight scheduling. Transit event should fit.`,
    },
    {
      summary: "Afternoon Workshop",
      location: "NYU Stern, 44 W 4th St, New York, NY 10012",
      start: { dateTime: makeDateTime(anchorMonday, 4, 14, 0), timeZone: tz },
      end: { dateTime: makeDateTime(anchorMonday, 4, 17, 0), timeZone: tz },
      description: `[TEST EVENT - Friday]
SHOULD PROCESS: Has physical location in Greenwich Village.
EXPECTED TRANSIT: Think Coffee → NYU (chains from prior event even with 2.5hr gap)
EXPECTED TRANSIT: NYU → Home (end of day return commute)`,
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // SATURDAY (Day 5): No events - rest day
    // Expected: No transit events created
    // ═══════════════════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════════════════
    // SUNDAY (Day 6): Event with no location
    // Expected: Skipped
    // ═══════════════════════════════════════════════════════════════════════════
    {
      summary: "Call Mom",
      // No location - should be skipped
      start: { dateTime: makeDateTime(anchorMonday, 6, 11, 0), timeZone: tz },
      end: { dateTime: makeDateTime(anchorMonday, 6, 11, 30), timeZone: tz },
      description: `[TEST EVENT - Sunday]
SHOULD SKIP: No location field.
SKIP REASON: NO_LOCATION`,
    },
  ];

  // Create all events
  let created = 0;
  let failed = 0;

  for (const event of testEvents) {
    try {
      await createEvent(event, accessToken);
      created++;
    } catch (error) {
      console.error(`✗ Failed: ${event.summary} - ${error}`);
      failed++;
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`Created ${created} test events (${failed} failed)`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  console.log(`\nTest week starts: ${mondayStr}`);

  console.log(`\n┌─────────────────────────────────────────────────────────────┐`);
  console.log(`│ ASSUMPTIONS                                                 │`);
  console.log(`├─────────────────────────────────────────────────────────────┤`);
  console.log(`│ Home: 1000 Union Street, Brooklyn, NY 11225                 │`);
  console.log(`│ Transit preference: "default" (smart mode)                  │`);
  console.log(`│ Events chain within same day regardless of time gap         │`);
  console.log(`└─────────────────────────────────────────────────────────────┘`);

  console.log(`\n┌─────────────────────────────────────────────────────────────┐`);
  console.log(`│ EXPECTED: When Calendar Automaton runs                      │`);
  console.log(`├─────────────────────────────────────────────────────────────┤`);
  console.log(`│                                                             │`);
  console.log(`│ PROCESSED (9 source events):                                │`);
  console.log(`│   Mon: Coffee with Alex, Lunch Meeting                      │`);
  console.log(`│   Tue: Dentist, Client Meeting, Dinner                      │`);
  console.log(`│   Thu: Birthday Party (CT - may use DRIVE mode)             │`);
  console.log(`│   Fri: Morning Meeting, Follow-up Coffee, Afternoon Workshop│`);
  console.log(`│                                                             │`);
  console.log(`│ TRANSIT EVENTS CREATED (13 total):                          │`);
  console.log(`│   Mon (3): Home→Coffee, Coffee→Lunch, Lunch→Home            │`);
  console.log(`│   Tue (4): Home→Dentist, Dentist→WTC, WTC→Carbone,          │`);
  console.log(`│            Carbone→Home                                     │`);
  console.log(`│   Thu (2): Home→Greenwich, Greenwich→Home                   │`);
  console.log(`│   Fri (4): Home→WeWork, WeWork→Coffee, Coffee→NYU,          │`);
  console.log(`│            NYU→Home                                         │`);
  console.log(`│                                                             │`);
  console.log(`│ SKIPPED (4 source events):                                  │`);
  console.log(`│   Wed: Team Standup (VIDEO_CALL_KEYWORD - Zoom URL)         │`);
  console.log(`│   Wed: Product Review (VIDEO_CALL_CONFERENCE - Meet data)   │`);
  console.log(`│   Thu: Maybe: Book Club (HOLD_EVENT - graphite color)       │`);
  console.log(`│   Sun: Call Mom (NO_LOCATION)                               │`);
  console.log(`│                                                             │`);
  console.log(`└─────────────────────────────────────────────────────────────┘`);

  console.log(`\nTo verify: Run 'bun run test --days 10' and check output.`);
}

main().catch(console.error);
