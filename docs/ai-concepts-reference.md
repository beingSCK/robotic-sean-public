# AI Concepts Reference

Mental models and resources for building AI agents. Refer back to this while working through the projects.

---

## What "Function Calling" Actually Is

The LLM outputs JSON saying "call this function with these args." You execute it, return results, and the LLM continues. (See `chatbot-rebuild/social-manager-agent-unpacked.ts`, lines 248-293.)

---

## What "RAG" Actually Is

```
User Question
     │
     ▼
┌─────────────┐
│  Embed the  │
│  question   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│Search vector│
│  database   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────┐
│ Stuff docs into LLM prompt  │
│ "Given this context: {docs} │
│  Answer: {question}"        │
└──────┬──────────────────────┘
       │
       ▼
   LLM Response
```

---

## What "Agents" Actually Are

Just loops that keep calling tools until the LLM decides it's done. The magic is in tool design and prompt engineering, not framework complexity.

---

## When to Use Frameworks (LangChain, etc.)

| Situation | Recommendation |
|-----------|----------------|
| Learning how things work | Write it yourself |
| Building something custom | Write it yourself |
| Need many pre-built integrations | Consider LangChain |
| Team needs shared abstractions | Consider LangChain |
| Prototyping quickly | Consider LangChain |

For your current projects, writing it yourself teaches more.

---

## Resources

### APIs You're Using
- Google Calendar API: https://developers.google.com/calendar/api
- Google Routes API: https://developers.google.com/maps/documentation/routes
- OpenAI Embeddings: https://platform.openai.com/docs/guides/embeddings
- Anthropic Claude: https://docs.anthropic.com/

### Vector Databases (for RAG)
- Chroma (local, simple): https://www.trychroma.com/
- Pinecone (managed): https://www.pinecone.io/

### Reference Code
- `chatbot-rebuild/social-manager-agent-unpacked.ts` — What n8n agents look like as traditional code
- `calendar-automaton/src/eventProcessor.ts` — Event processing logic (TypeScript, active development)
- `archive/calendar-cli-python/add_transit.py` — Original Python proof-of-concept (reference for traffic-aware routing)
