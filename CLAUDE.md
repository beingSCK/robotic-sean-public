# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This is a learning projects hub for AI-assisted development work. Projects here are works-in-progress that will graduate to their own repos when mature enough.

**Philosophy:** "Complete before expanding" - finish small tools rather than accumulate half-built systems.

See:
- `docs/ROADMAP.md` - Overall goals, project status, and philosophy
- `docs/project-phases.md` - Detailed task lists for each project
- `docs/ai-concepts-reference.md` - Conceptual explanations and resources

## Current Status (2025-12-27)

| Project | Status | Branch |
|---------|--------|--------|
| Calendar Transit CLI | ✓ Complete | `main` |
| Calendar Transit Extension | **Active** - MVP done, publishing next | `feature/chrome-extension` |
| Investment Email Processing | Next | — |
| Agent/Chatbot | Later | — |

## Current Projects

### calendar-experiments/
Calendar Transit Robot — automatically creates "transit" events before/after meetings using Google Maps Routes API.

**CLI (complete):**
```bash
cd calendar-experiments && python add_transit.py           # dry-run mode
cd calendar-experiments && python add_transit.py --execute # create events
```
Published: [robotic-sean-public](https://github.com/beingSCK/robotic-sean-public)

**Chrome Extension (in progress):**
```bash
cd calendar-experiments/extension
bun install
bun run build && bun run build:background
# Load unpacked extension from dist/ in Chrome
```
Setup: See `calendar-experiments/extension/CLAUDE.md`
Branch: `feature/chrome-extension`

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

**Work journal:** At the end of each session, update `work-journal/YYYY-MM-DD.md` with completed tasks, decisions made, things learned, and next steps. This folder is gitignored.

## Architecture Notes

- **Documents table pattern:** All source materials (emails, PDFs) flow through a staging table with `needs_review` flag before structured data extraction
- **Agent pattern reference:** `chatbot-rebuild/social-manager-agent-unpacked.ts` demonstrates the core agentic loop (lines 314-347): call LLM → execute tool calls → append results → repeat until done
