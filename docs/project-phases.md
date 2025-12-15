# Project Phases: Detailed Task Lists

Detailed implementation plans for each project. See `ROADMAP.md` for the overall philosophy and status.

---

## LP1: Finish the Calendar Tool

### Why This First
You're one step away from a working tool. The psychological reward of seeing transit events appear in your actual calendar is the fuel for everything else.

### Step 1: Real API Integration ✓

**Tasks:**
- [x] Add Routes API key to `config.json`
- [x] Implement real HTTP call in `transit_calculator.py` (replace stub)
- [x] Test with real travel times
- [x] Handle edge cases (API errors, missing routes)
- [x] Add `--test` CLI for standalone testing
- [x] Add `'stay:'` to trip detection keywords

**Conceptual learning:**
- REST API integration patterns
- Error handling and graceful degradation
- The difference between "it works in stub mode" and "it works for real"

**Definition of Done:** `python add_transit.py` shows accurate travel times from Google Routes API. ✓ DONE

### Step 1.5: Transit Event Logic Refinements ✓

**Tasks:**
- [x] Skip creating transit events if duration < 10 minutes
- [x] Skip creating transit events if they would overlap with existing transit events
- [x] Flip trip detection default (process all days; add `--detect-trips` to enable skipping)

**Definition of Done:** Running `--execute` doesn't create redundant or trivially short transit events. ✓ DONE

### Step 1.6: Dynamic "Home" Based on Stay Events ✓

**Goal:** On travel days, use the location from "Stay" events as the home location instead of the fixed config address. This makes transit work correctly when traveling.

**Tasks:**
- [x] Extend existing stay detection (reuse `STAY_KEYWORDS`) to also extract the location
- [x] On-demand lookup: `get_stay_location_for_night()` finds Stay event covering a given night
- [x] `get_home_for_transit()` returns prior night's stay (morning) or tonight's stay (evening)
- [x] For transit TO first event: use prior night's Stay location as origin
- [x] For transit HOME after last event: use that night's Stay location as destination
- [x] If no Stay event exists for a date, fall back to config home address
- [x] Add error handling (try/except around Routes API calls)
- [x] Add sanity check: skip transits > 3 hours

**Conceptual learning:**
- State management across days (tracking where you "are" vs where you're "going")
- Graceful fallback patterns
- Error handling for external API failures

**Definition of Done:** Running on a travel week correctly uses hotel/stay locations as the "home" for each day's transit calculations. ✓ DONE

### Step 1.7: AI-Assisted Location for Stay Events (Future)

**Goal:** Use an AI service to guess the location for Stay events that don't have a location field set.

**Tasks:**
- [ ] Detect Stay events with no location field
- [ ] Use event summary/description to infer location (e.g., "STAY: with Yinne" → look up Yinne's address)
- [ ] Optionally prompt user to confirm/correct inferred location

**Note:** Low priority. For now, ensure Stay events have location fields set manually.

### Step 1.8: Traffic-Aware Routing ✓

**Goal:** Use departure time and traffic models for more accurate travel time estimates.

**Tasks:**
- [x] Pass `departureTime` to Routes API for traffic predictions
- [x] Query both BEST_GUESS and PESSIMISTIC traffic models for driving routes
- [x] Blend results (75% pessimistic weight) when difference > 25%
- [x] Add traffic note to event description when blended
- [x] Include blending metadata in output

**Conceptual learning:**
- Traffic-aware routing with the Routes API
- Handling API parameters for predictive estimates
- Conservative estimation strategies (blending pessimistic/optimistic)

**Definition of Done:** Transit events use traffic-aware estimates and show when duration was extended due to traffic. ✓ DONE

### Step 2: Execute Mode ✓

**Tasks:**
- [x] Change OAuth scope from `calendar.readonly` to `calendar`
- [x] Delete `token.json`, re-authenticate
- [x] Implement `insert_transit_events()` function
- [x] Add safeguards (`--force` flag for confirmation prompt)

**Definition of Done:** `python add_transit.py --execute` creates real transit events in your Google Calendar. ✓ DONE

### Public Output: GitHub + LinkedIn

**GitHub:**
- Clean up repo, ensure README explains usage
- Remove any hardcoded personal details
- Add MIT license (already done)
- Push to public repo

**LinkedIn post (~200 words):**
```
Theme: "I built a tool that solves a real problem I had"
- The pain point (manually adding transit time to calendar)
- What I built (Python script using Google Calendar + Routes APIs)
- What I learned (OAuth flows, API integration, phased development)
- Link to repo
```

This breaks the seal on "showing work in public" with low stakes—it's a small tool, not a startup pitch.

---

## LP4: Calendar Tool → Chrome Extension

*This phase comes after LP3 (Chatbot basics). By then you'll have more TypeScript/JS exposure.*

### Why This Phase
The Calendar Transit Tool is useful—but only you can use it. Shipping it as a Chrome extension builds the "ship a product" muscle and teaches cloud deployment.

### Architecture Decision (to be made at LP4 start)

| Option | Pros | Cons | Skills Learned |
|--------|------|------|----------------|
| **TypeScript rewrite** | Pure client-side, no hosting | More rewrite work | TS, browser APIs |
| **Python API backend** | Reuses existing code | Needs hosting | **Cloud VMs, Docker, deployment** |

**Leaning:** TypeScript, BUT the Python backend path teaches cloud deployment—a skill worth having. Could do Python backend first (learn deployment), then optionally rewrite to TypeScript later for a serverless version.

### Step 1: Extract Transit Engine Library

**Tasks:**
- [ ] Refactor `transit_calculator.py` into clean, documented module
- [ ] Define clear API surface
- [ ] Make architecture decision (TS vs Python backend)

### Step 2: Backend or Rewrite

**If Python backend:**
- [ ] Wrap in FastAPI
- [ ] Dockerize
- [ ] Deploy to cloud VM (DigitalOcean, Fly.io, Railway, etc.)
- [ ] Set up domain/HTTPS

**If TypeScript:**
- [ ] Port core logic to TypeScript
- [ ] Package as ES module

**Conceptual learning:**
- Cloud deployment (VMs, Docker, HTTPS)
- API design for external consumers
- TypeScript fundamentals (if that path)

### Step 3: Chrome Extension

**Tasks:**
- [ ] Extension manifest v3 setup
- [ ] OAuth flow for Google Calendar in extension context
- [ ] UI: Popup with "Process my calendar" button (simplest MVP)
- [ ] Connect to backend or use client-side library

**Conceptual learning:**
- Chrome extension architecture (manifest v3, service workers)
- OAuth in browser extensions
- Product thinking: What's the simplest UX that works?

### Step 4: Publish

**Tasks:**
- [ ] Chrome Web Store developer account ($5)
- [ ] Store listing, screenshots, privacy policy
- [ ] Submit for review

**Definition of Done:** Extension live on Chrome Web Store, at least 1 external user.

### Public Output
- Chrome Web Store listing
- LinkedIn post: "I shipped my first Chrome extension"
- (Optional) Blog post on the journey from script → product

---

## LP2: Investment Email Processing (formerly Phase 2)

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

## LP3: Agent Wrapper (Chatbot Rebuild)

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
| **Claude Code CLI** | Scripts, single-file tools, quick iterations | LP1-LP3 (current phase) |
| **Cursor / AI IDE** | Multi-file projects, TypeScript, debugging | LP4+ (Chrome extension, larger apps) |

**Don't upgrade prematurely**—the current tools work fine for LP1-LP3. But LP4 (Chrome extension with TypeScript) may be the right time to try Cursor or a similar AI-assisted IDE.

The goal isn't to use the fanciest tools. It's to use the simplest tools that get the job done, and upgrade when the complexity genuinely warrants it.
