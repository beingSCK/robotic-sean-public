# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This repository contains the Calendar Automaton family - tools for intelligent calendar management, starting with automatic transit event creation and designed to grow into prep time, buffers, and other derived events.

**Philosophy:** "Complete before expanding" - see `../_meta/docs/FOUNDATIONS.md` for full principles and conventions.

See:
- `docs/ROADMAP.md` - Calendar project status and next steps
- `docs/project-phases.md` - Detailed implementation notes
- `../_meta/docs/FOUNDATIONS.md` - Overall philosophy, principles, and conventions
- `../_meta/docs/incubating.md` - Future projects queue

## Current Status (2026-01-02)

| Project | Status | Location |
|---------|--------|----------|
| Calendar Automaton | **Active** - feature parity, then publish | `calendar-automaton/` |
| Calendar CLI | Complete (proof-of-concept) | `archive/calendar-cli-python/` |

## Projects

### calendar-automaton/
Calendar Automaton - Chrome extension for intelligent calendar management. Currently creates transit events automatically; designed to expand to prep time, buffer events, and more.

```bash
cd calendar-automaton
bun install
bun run build      # Build extension
bun run test       # Test event processing (CLI mode)
bun run test --execute  # Actually create events
# Load unpacked extension from dist/ in Chrome
```
Setup: See `calendar-automaton/CLAUDE.md`

### archive/calendar-cli-python/
The original Python CLI proof-of-concept. Kept as reference for porting remaining features (traffic-aware routing, blended traffic models).

Published: [robotic-sean-public](https://github.com/beingSCK/robotic-sean-public)
