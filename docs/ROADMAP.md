# AI Agent Development: Learning Roadmap

A completion-focused progression anchored to real projects, building towards public visibility.

**Last updated:** 2025-12-29

---

## Philosophy: Complete Before Expanding

The temptation with technical learning is to start many projects and finish none. Each "Phase 1" feels like progress, but a graveyard of 40%-complete projects teaches less than one shipped tool you actually use.

**Core principle:** Every project should have a clear "Definition of Done" and a public output milestone.

**The progression:**
1. **Ship to yourself** — A tool that works on your machine
2. **Ship to GitHub** — Code others could run
3. **Ship to LinkedIn** — A post explaining what you built and learned
4. **Ship to blog** — A deeper writeup with context and lessons

You don't need to hit all four for every project. But having the ladder in mind prevents the "perpetual private tinkering" trap.

---

## Learning Curriculum

This isn't a linear "finish one project, start another" roadmap. It's a curriculum that **interleaves projects** to build skills progressively and avoid burnout.

| Project | Focus | Key Skills | Status |
|---------|-------|------------|--------|
| Calendar Transit CLI | API integration | OAuth, REST APIs, shipping to GitHub | ✓ Complete (proof-of-concept) |
| **Calendar Automaton** | Product shipping | TypeScript, browser extensions, Chrome Web Store | **Active** |
| Investment Email Processing | Data pipelines | Text extraction, SQLite, document staging | Next |
| Agent/Chatbot | Agentic patterns | Tool use, RAG, prompt engineering | Later |

**Current focus:** Calendar Automaton (Chrome Extension) → Web Store publish → LinkedIn post

The Python CLI served as a proof-of-concept that validated the idea. The TypeScript Chrome Extension is the publishable product. The CLI test runner (`bun run test`) enables fast iteration without Chrome reload cycles.

Recent work (2025-12-29): Smart short trips with walkability checks, directory reorganization to reflect focus on Extension.

See `project-phases.md` for detailed task lists, conceptual learning notes, and "Definition of Done" for each project.

---

## The Public Visibility Ladder

| Level | What | When |
|-------|------|------|
| 0. Private | Works on your machine | Always first |
| 1. GitHub | Public repo, clean README | After "Definition of Done" |
| 2. LinkedIn | Short post (200-400 words) | After GitHub, for networking value |
| **2.5. Ship Product** | **Working product others can use** | **When project warrants it (optional)** |
| 3. Blog | Longer writeup (1000+ words) | For substantial projects |
| 4. Talk/Video | Conference talk, YouTube | When you have a compelling story |

> **Level 2.5 (Ship Product)** is optional but recommended when the project naturally becomes something others would use. Examples:
> - Calendar Transit Tool → Chrome extension on Web Store
> - Investment DB → Probably not (too personal/niche)
> - Chatbot Rebuild → Could become a template/starter kit
>
> Shipping a real product builds different muscles than shipping code. It requires thinking about UX, onboarding, and real users—valuable even if only 10 people use it.

---

## Key Takeaways

1. **Complete before expanding** — A finished small tool beats three half-built systems
2. **Real data, real use cases** — Your calendar and investment emails are better than toy datasets
3. **Progressive publicity** — GitHub → LinkedIn → Blog builds the "shipping" muscle
4. **Understand before abstracting** — Write the loop yourself before reaching for LangChain
5. **Definition of Done** — Every phase needs clear completion criteria

The goal isn't to learn "AI agents" in the abstract. It's to build tools you actually use, understand how they work, and develop the habit of shipping publicly.

---

## Future: Curriculum for Others

This roadmap is being developed with an eye toward helping others learn these skills. The combination of:
- Real projects with real data (not toy examples)
- Progressive complexity (CLI → Extension → RAG → Agents)
- Clear "Definition of Done" milestones
- Public shipping practice (GitHub → LinkedIn → Blog)

...creates a replicable pattern for anyone wanting to learn AI-assisted development through building.

---

See also:
- `project-phases.md` — Detailed task lists for each project
- `ai-concepts-reference.md` — Conceptual explanations and resources
