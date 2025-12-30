# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This is a learning projects hub for AI-assisted development work. Projects here are works-in-progress that will graduate to their own repos when mature enough.

**Philosophy:** "Complete before expanding" - finish small tools rather than accumulate half-built systems.

See:
- `docs/ROADMAP.md` - Overall goals, project status, and philosophy
- `docs/project-phases.md` - Detailed task lists for each project
- `docs/ai-concepts-reference.md` - Conceptual explanations and resources

## Current Status (2025-12-29)

| Project | Status | Location |
|---------|--------|----------|
| Calendar Automaton | **Active** - feature parity, then publish | `calendar-automaton/` |
| Calendar Transit CLI | ✓ Complete (proof-of-concept) | `archive/calendar-cli-python/` |
| Investment Email Processing | Next | `investment-db-experiments/` |
| Agent/Chatbot | Later | `chatbot-rebuild/` |

## Current Projects

### calendar-automaton/
Calendar Automaton — Chrome extension that automatically creates transit events before/after meetings using Google Calendar + Routes APIs.

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

### investment-db-experiments/
Investment portfolio tracker using SQLite. Goal: Parse emails from Google Takeout, build a RAG pipeline for natural language queries about investments.

```bash
cd investment-db-experiments && python create_investment_db.py
```

Schema includes: entities, investments, documents (staging table for emails/PDFs), transactions.

### chatbot-rebuild/
Learning project to understand agent patterns by rebuilding a chatbot from scratch. Contains reference material (`social-manager-agent-unpacked.ts`) showing the agentic loop pattern. Goal: recreate this functionality ourselves to deeply understand how agents work.

## Conventions

**Commit messages:** Short subject line (~50 chars), optional body for context when helpful. Do NOT include "Co-Authored-By" or other AI attribution in commit messages.

**Writing style:** Avoid em dashes (—). They signal "AI slop" to readers. Use hyphens (-), semicolons, or restructure sentences instead.

**TODO/DRAFT markers:** Use consistently across code and prose files:
- `TODO:` - Something that needs to be done
- `FIXME:` - Something broken that needs fixing
- `DRAFT:` - AI-generated content needing human review

In code files, use standard comments (`// TODO:`). In markdown files, use a visible blockquote at the top:
```markdown
> **DRAFT:** Claude wrote this. Sean hasn't validated the premises here.
```
This keeps drafts visible to readers now; we can convert to HTML comments later via script when finalized.

**Work journal:** At the end of each session, update `work-journal/YYYY-MM-DD.md` with completed tasks, decisions made, things learned, and next steps. This folder is gitignored.

## Architecture Notes

- **Documents table pattern:** All source materials (emails, PDFs) flow through a staging table with `needs_review` flag before structured data extraction
- **Agent pattern reference:** `chatbot-rebuild/social-manager-agent-unpacked.ts` demonstrates the core agentic loop (lines 314-347): call LLM → execute tool calls → append results → repeat until done
