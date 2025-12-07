# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This is a learning projects hub for AI-assisted development work. Projects here are works-in-progress that will graduate to their own repos when mature enough.

**Philosophy:** "Complete before expanding" - finish small tools rather than accumulate half-built systems.

See:
- `ROADMAP.md` - Overall goals, project status, and philosophy
- `project-phases.md` - Detailed task lists for each project
- `ai-concepts-reference.md` - Conceptual explanations and resources

## Current Projects

### investment-db-experiments/
Investment portfolio tracker using SQLite. Goal: Parse emails from Google Takeout, build a RAG pipeline for natural language queries about investments.

```bash
# Create the SQLite database with schema
cd investment-db-experiments && python create_investment_db.py
```

Schema includes: entities, investments, documents (staging table for emails/PDFs), transactions.

### n8n-agent-samples/
Reference material from n8n workflow exploration. Key file: `social-manager-agent-unpacked.ts` - an n8n agent workflow translated to traditional TypeScript code, showing how agentic loops, tool definitions, and memory work under the hood.

## Architecture Notes

- **Documents table pattern:** All source materials (emails, PDFs) flow through a staging table with `needs_review` flag before structured data extraction
- **Agent pattern reference:** The unpacked TypeScript file demonstrates the core agentic loop (lines 314-347): call LLM → execute tool calls → append results → repeat until done
