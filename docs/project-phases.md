# Project Phases: Detailed Task Lists

Detailed implementation plans for each project. See `ROADMAP.md` for the overall philosophy and status.

---

## Phase 1: Finish the Calendar Tool

### Why This First
You're one step away from a working tool. The psychological reward of seeing transit events appear in your actual calendar is the fuel for everything else.

### Step 1: Real API Integration

**Tasks:**
- Add Routes API key to `config.json`
- Implement real HTTP call in `transit_calculator.py` (replace stub)
- Test with real travel times
- Handle edge cases (API errors, missing routes)

**Conceptual learning:**
- REST API integration patterns
- Error handling and graceful degradation
- The difference between "it works in stub mode" and "it works for real"

**Definition of Done:** `python add_transit.py` shows accurate travel times from Google Routes API.

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

## Phase 2: Investment Email Processing

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

## Phase 3: Agent Wrapper (Chatbot Rebuild)

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
