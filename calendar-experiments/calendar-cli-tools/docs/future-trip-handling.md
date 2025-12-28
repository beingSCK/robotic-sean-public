# Future: Intelligent Trip Handling

This document captures the design for "smart" trip handling — tracking your location across days during trips to generate correct transit events. Currently, trips are detected and the entire day is skipped. This enhancement would intelligently create transit events even during trips.

---

## Problem

When traveling (e.g., flight to San Francisco), the current simple approach skips all transit events for trip days. A smarter approach would:

1. Know your starting location each day (hotel, last event location)
2. Create correct transit events within that destination city
3. Handle return flights to end the trip

---

## Proposed Implementation

### Phase A: Location Tracking Across Days

**Trip State Structure:**
```python
trip_state = {
    'is_on_trip': False,
    'trip_start_date': None,
    'trip_destination_city': None,
    'arrival_airport': None,        # Fallback trip base
    'trip_base_location': None,     # Hotel if known, else airport
    'last_known_location': home_address,
    'last_known_location_name': "Home",
}
```

**Start-of-day Logic:**
1. If on trip and date in stay_schedule: use hotel as starting location
2. Else if on trip: use last_known_location from previous day
3. Else: use home_address

**End-of-day Logic:**
- Only create "return home" transit if NOT on trip
- Update `last_known_location` with final event location

### Phase B: Stay Event Detection

**Helper Function: `detect_stay_event(event)`**
- Keywords: "stay at", "hotel", "airbnb", "vrbo", "accommodation"
- Stay events are all-day events (`date` not `dateTime`)
- Extract: location, hotel_name, start_date, end_date

**Pre-processing: `extract_stay_schedule(events)`**
- Build dict: `{date_str: {'location': addr, 'name': 'Four Seasons'}}`
- Used to determine trip base for each day

### Phase C: Return Flight Detection

**Extend `detect_flight_event()`:**
- Check if destination is a home-area airport (EWR/JFK/LGA)
- Or if summary mentions NYC/New York/Brooklyn
- When return flight detected: set `is_on_trip = False`

---

## Example Scenarios

### Scenario 1: SF Wedding Trip (Dec 13-15)
- Dec 13: Flight EWR→SFO, Wedding at 78 Virgil St
  - Transit: Home → EWR
  - Transit: (after landing, use SFO as origin) → Wedding venue
  - No "return home" at end of day
- Dec 14: Stay at Four Seasons, Dinner at restaurant
  - Transit: Four Seasons → Restaurant
  - Transit: Restaurant → Four Seasons (or skip if stay)
- Dec 15: Return flight SFO→EWR
  - Transit: Four Seasons → SFO
  - Trip ends

### Scenario 2: Hotel but No Flight Detected
- If stay event exists but no flight found:
  - Still detect as trip day from stay event
  - Use hotel location as base

---

## Data Flow

```
events[]
   │
   ├─► detect_trip_dates() ─► trip_dates set (current implementation)
   │
   └─► extract_stay_schedule() ─► {date: {location, name}}
          │
          └─► calculate_transit_events()
                 │
                 ├─► Day loop: check trip_state + stay_schedule
                 ├─► Flight detection: update trip_state
                 ├─► Normal event processing with correct origin
                 └─► Update last_known_location at day end
```

---

## Key Functions to Add/Modify

| Function | Action |
|----------|--------|
| `detect_stay_event(event)` | New helper |
| `extract_stay_schedule(events)` | New helper |
| `detect_flight_event(event)` | Extend for return flights |
| `calculate_transit_events()` | Add trip_state tracking, stay_schedule lookup |

---

## Estimated Effort

- **Phase A (location tracking):** ~60 lines
- **Phase B (stay detection):** ~45 lines
- **Phase C (return flights):** ~30 lines
- **Total:** ~135 lines of new/modified code

---

## Testing

1. **Trip with hotel:** Verify morning starts from hotel address
2. **Trip without hotel:** Verify morning starts from last event location
3. **Return flight:** Verify trip mode ends correctly
4. **Normal day after trip:** Verify starts from home again

---

## Notes

This is deferred to a future feature branch. Current implementation simply skips trip days, which is correct (no bogus transit events) but misses the opportunity to help with in-trip logistics.
