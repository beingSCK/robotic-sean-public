# Project Phases: Detailed Task Lists

Detailed implementation plans for each project. See `ROADMAP.md` for philosophy and principles.

**Last updated:** 2025-12-27

---

## Calendar Transit Tool (CLI) — ✓ COMPLETE

Python script that creates transit events before/after meetings using Google Calendar + Routes APIs.

### What Was Built

- [x] Real Google Routes API integration (replaced stubs)
- [x] Handle edge cases (API errors, missing routes)
- [x] OAuth flow with `calendar` scope (read + write)
- [x] `--execute` mode creates real events in Google Calendar
- [x] Skip creating transit events if duration < 10 minutes
- [x] Skip creating transit events if they would overlap with existing transit events
- [x] Dynamic home location from Stay events (for travel days)
- [x] Traffic-aware routing (BEST_GUESS + PESSIMISTIC blending, 75% pessimistic weight)
- [x] Traffic notes added to event descriptions when duration extended
- [x] Sanity check: skip transits > 3 hours

**Conceptual learning:**
- REST API integration patterns
- Error handling and graceful degradation
- The difference between "it works in stub mode" and "it works for real"
- State management across days (tracking where you "are" vs where you're "going")
- Traffic-aware routing with the Routes API
- Conservative estimation strategies (blending pessimistic/optimistic)

**Definition of Done:** ✓ Met
- `python add_transit.py` shows accurate travel times from Google Routes API
- `python add_transit.py --execute` creates real transit events in Google Calendar
- Code published to GitHub: [robotic-sean-public](https://github.com/beingSCK/robotic-sean-public)

### Public Output

**GitHub:**
- [x] Clean up repo, ensure README explains usage
- [x] Remove any hardcoded personal details
- [x] Add MIT license
- [x] Push to public repo

**LinkedIn post (~200 words):**
- [ ] Theme: "I built a tool that solves a real problem I had"
- The pain point (manually adding transit time to calendar)
- What I built (Python script using Google Calendar + Routes APIs)
- What I learned (OAuth flows, API integration, phased development)
- Link to repo

This breaks the seal on "showing work in public" with low stakes—it's a small tool, not a startup pitch.

### Future Enhancement: AI-Assisted Location for Stay Events

**Goal:** Use an AI service to guess the location for Stay events that don't have a location field set.

**Tasks:**
- [ ] Detect Stay events with no location field
- [ ] Use event summary/description to infer location (e.g., "STAY: with Yinne" → look up Yinne's address)
- [ ] Optionally prompt user to confirm/correct inferred location

**Note:** Low priority. For now, ensure Stay events have location fields set manually.

---

## Calendar Transit Tool (Chrome Extension) — IN PROGRESS

Browser extension that does what the CLI does, but accessible to non-technical users.

### Why This Phase

The Calendar Transit Tool is useful—but only you can use it. Shipping it as a Chrome extension builds the "ship a product" muscle and teaches browser extension development.

### Architecture Decision

| Option | Pros | Cons | Skills Learned |
|--------|------|------|----------------|
| **TypeScript rewrite** | Pure client-side, no hosting | More rewrite work | TS, browser APIs |
| **Python API backend** | Reuses existing code | Needs hosting | **Cloud VMs, Docker, deployment** |

**Current path:** TypeScript (pure client-side). The Python backend path remains an option if the current architecture proves unsatisfactory—it would teach cloud deployment skills.

**If Python backend (future option):**
- [ ] Wrap in FastAPI
- [ ] Dockerize
- [ ] Deploy to cloud VM (DigitalOcean, Fly.io, Railway, etc.)
- [ ] Set up domain/HTTPS

### MVP Status: ✓ DONE (2025-12-27)

**What was built:**
- [x] Extension manifest v3 setup with Bun bundler
- [x] OAuth flow via `chrome.identity.launchWebAuthFlow()`
- [x] Background service worker for OAuth (persists when popup closes)
- [x] Calendar API integration (fetch events, insert transit events)
- [x] Routes API integration (transit times with driving fallback)
- [x] Popup UI with scan → preview → create flow
- [x] Basic filtering (skip video calls, all-day, existing transit)
- [x] Credential rotation and git history rewrite for security

**Conceptual learning:**
- Chrome extension architecture (manifest v3, service workers)
- OAuth in browser extensions (popup closes during auth → need background worker)
- Product thinking: What's the simplest UX that works?
- Git history rewriting (`git filter-branch`) for removing secrets

**Key technical decision:** OAuth in browser extensions is tricky because the popup closes when user clicks the OAuth window. Solution: background service worker handles OAuth, stores tokens, sets a flag. When popup reopens, it checks for `oauthJustCompleted` and auto-scans.

### Next Steps (Path to Publish)

1. **Family testing** — Have family members install and use it
2. **Chrome Web Store** — $5 developer account, store listing, privacy policy, submit for review
3. **LinkedIn post** — "I shipped my first Chrome extension"

**Definition of Done:** Extension live on Chrome Web Store, at least 1 external user.

### Feature Parity with CLI (After Publish)

These items are nice-to-have polish, not blockers for initial publish:

**Tasks to match `add_transit.py` functionality:**
- [ ] Car-only locations (patterns like "22 Lakeview" → always use driving)
- [ ] Traffic-aware routing (BEST_GUESS + PESSIMISTIC blending)
- [ ] Trip detection (flights, hotel stays → dynamic home location)
- [ ] Hold event skipping (colorId 8)
- [ ] Overlap detection between transit events

### UX Polish (After Publish)

- [ ] Better button copy ("Scan Calendar to Add Transit Events")
- [ ] Driving preference toggle in settings (always drive vs transit fallback)
- [ ] Configurable car-only location patterns in settings
- [ ] Progress indicators during scan
- [ ] Onboarding flow for first-time users

### Recommended Next Session (After Publish)

**Quick wins (30-60 min each):**
1. **Car-only toggle** — Add a simple checkbox in settings: "Always use driving (no transit)". Easiest feature parity item, immediately useful for your 22 Lakeview case.
2. **Better button copy** — Change "Scan Calendar" → "Add Transit Events". Small UX win, 5 minutes.

**Medium effort (1-2 hours):**
3. **Car-only location patterns** — Add a text field in settings for comma-separated patterns. Port the matching logic from CLI's `config.json`.

**If feeling ambitious:**
4. **Architecture review** — Research if `chrome.tabs` API could replace background worker. The current approach works but feels over-engineered.

### Public Output

- Chrome Web Store listing
- LinkedIn post: "I shipped my first Chrome extension"
- (Optional) Blog post on the journey from script → product

### Files
- `calendar-experiments/calendar-chrome-extension/` — Extension source code
- `calendar-experiments/calendar-chrome-extension/CLAUDE.md` — Setup instructions

---

## Investment Email Processing — NEXT

Parse investment-related emails from Google Takeout and build a queryable database.

### Why This Project

You have 30GB of real data (Google Takeout emails) and a real use case (tax prep, portfolio tracking). This is where the "AI agent" roadmap becomes practical.

### Step 1: Email Extraction Pipeline

**Tasks:**
- Parse mbox format from Google Takeout
- Filter to investment-related emails (sender patterns, subject keywords)
- Extract metadata: date, sender, subject, body text
- Store in SQLite `documents` table (schema already exists)

**Conceptual learning:**
- Working with messy real-world data
- Text extraction and cleaning
- The "staging table" pattern for document processing

**Definition of Done:** Investment-related emails loaded into `documents` table with `needs_review = 1`.

### Step 2: Classification and Chunking

**Tasks:**
- Build classifier for document types (capital call, distribution, K-1, etc.)
- Implement chunking strategy for long emails
- Add entity/investment linking (which entity received this?)

**Conceptual learning:**
- Document classification (rule-based first, then consider LLM-assisted)
- Chunking strategies for RAG (why size matters, overlap considerations)
- The value of human-in-the-loop review

**Definition of Done:** Documents classified and chunked, ready for embedding.

### Step 3: RAG Pipeline

**Tasks:**
- Generate embeddings (OpenAI embeddings API or local alternative)
- Store in vector database (Chroma for local, simple setup)
- Build query interface: "What distributions did I receive from X in 2024?"
- Test retrieval quality

**Conceptual learning:**
- **Embeddings:** Text → numbers that capture meaning
- **Vector search:** Finding similar documents by meaning, not keywords
- **RAG pattern:** Retrieve relevant context → stuff into prompt → generate answer

**Definition of Done:** Natural language queries return relevant documents from your investment emails.

### Public Output: Blog Post

This project is meatier and deserves a longer writeup:
- Problem: Tracking private market investments across entities
- Architecture: Email → SQLite → Vector DB → Query interface
- Lessons: What worked, what was harder than expected
- Code snippets and architecture diagrams

**Where to publish:** Your own blog (if you have one), or a LinkedIn article, or dev.to/Medium.

---

## Agent Wrapper / Chatbot — LATER

Learn agent patterns by rebuilding a chatbot from scratch, then apply to investment queries.

### Why This Phase

Once RAG is working, wrapping it in an "agent" is relatively straightforward. The reference material in `chatbot-rebuild/` shows the pattern—now we build our own to truly understand it.

### Step 1: Basic Agent Loop

**Tasks:**
- Build the agentic while-loop (reference: `chatbot-rebuild/social-manager-agent-unpacked.ts` lines 314-347)
- Define tools: `search_investments(query)`, `get_transactions(investment_id)`, `summarize_document(doc_id)`
- Connect to Claude or GPT-4 via API
- Handle tool calls and responses

**Conceptual learning:**
- The agentic loop pattern (reference material in `chatbot-rebuild/`)
- Tool definition and parameter design
- Prompt engineering for reliable tool use

**Definition of Done:** Ask "What's my total exposure to Fund X?" and get a coherent answer with cited sources.

### Step 2: Memory and Session Management

**Tasks:**
- Add conversation memory (sliding window pattern from reference)
- Session persistence (save/resume conversations)
- Export conversation summaries

**Definition of Done:** Multi-turn conversations work naturally, context persists across questions.

### Public Output: GitHub + Demo Video

- **GitHub:** Investment tracker as open-source tool
- **Demo video (optional):** 2-minute Loom showing natural language queries
- **LinkedIn:** Post about building your first AI agent with real use case

---

## Notes on Tooling Evolution

As projects grow in complexity (Chrome extensions, full-stack apps), consider upgrading development tools:

| Tool | Best For | When to Use |
|------|----------|-------------|
| **Claude Code CLI** | Scripts, single-file tools, quick iterations | Calendar CLI, Investment DB |
| **Cursor / AI IDE** | Multi-file projects, TypeScript, debugging | Chrome extension, larger apps |

**Don't upgrade prematurely**—the current tools work fine for simple projects. But multi-file TypeScript projects may benefit from Cursor or similar AI-assisted IDEs.

The goal isn't to use the fanciest tools. It's to use the simplest tools that get the job done, and upgrade when the complexity genuinely warrants it.

---

## Historical Note

The original planning used "LP1/LP2/LP3/LP4" numbering which became confusing when execution order diverged from plan order. This document was restructured on 2025-12-27 to match actual execution sequence: CLI → Extension → Investment → Chatbot.
