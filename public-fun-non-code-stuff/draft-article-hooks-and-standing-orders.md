# The Spectrum from Soft Instructions to Hard Enforcement

> **DRAFT:** This is provisional; written to capture ideas for possible future publishing.

---

When you work with AI coding assistants, you're constantly giving them "standing orders" about how to behave. But not all standing orders are created equal.

There's a spectrum:

```
SOFT ◄──────────────────────────────────────────────► HARD

CLAUDE.md          Git hooks           CI workflows
"Please avoid       "Block commit       "Reject PR if
em dashes"          if tests fail"      build breaks"

Non-deterministic   Deterministic       Deterministic
AI interprets       Script executes     Script executes
May be ignored      Always enforced     Always enforced
```

## The Soft End: Natural Language Instructions

Files like CLAUDE.md (or Cursor's rules files) are essentially prose instructions to the AI:

```markdown
**Writing style:** Avoid em dashes. Use semicolons instead.
```

This is "lossy" communication. The AI interprets it, weighs it against other context, and might forget or override it. It's a suggestion, not a constraint.

**Advantages:** Flexible, easy to write, handles nuance ("avoid unless it really fits")
**Disadvantages:** No guarantee of compliance, depends on AI's interpretation

## The Hard End: Deterministic Hooks

Hooks are scripts that run automatically at specific trigger points:

```bash
# pre-commit hook: block if em dashes found
grep -r "—" --include="*.md" && echo "Em dashes found!" && exit 1
```

This is "lossless" enforcement. The script runs, checks a condition, and blocks or allows. No interpretation, no flexibility, no forgetting.

**Advantages:** Guaranteed enforcement, catches everything
**Disadvantages:** Brittle, can't handle nuance, requires upfront specification

## The Middle Ground: AI + Hooks Together

The interesting space is combining both:

1. **CLAUDE.md** tells the AI your preferences (soft guidance)
2. **Hooks** catch what slips through (hard enforcement)

For example:
- CLAUDE.md says "avoid em dashes"
- A post-edit hook greps for em dashes and warns you
- The AI learns from the warnings over time

This is defense in depth. The soft layer handles nuance; the hard layer catches failures.

## When to Use Which

| Situation | Soft (CLAUDE.md) | Hard (hooks/CI) |
|-----------|------------------|-----------------|
| Style preferences | ✓ | Maybe (lint rules) |
| Security constraints | ✓ (guidance) | ✓ (enforcement) |
| "Never do X" rules | ✓ | ✓ (if detectable) |
| "Usually do Y" guidance | ✓ | Harder to encode |
| Build must pass | - | ✓ |
| Tests must pass | - | ✓ |

## The Feedback Timing Dimension

There's another axis here: when do you find out something went wrong?

| Mechanism | Feedback delay | Where it runs |
|-----------|----------------|---------------|
| Editor hooks | Immediate | Your machine |
| Git pre-commit | Before commit | Your machine |
| CI on push | Minutes | Remote server |
| Code review | Hours/days | Human reviewer |

Moving checks "left" (earlier in the pipeline) means faster feedback. The ideal is catching problems the moment they're introduced, not days later in code review.

## The "Professionalizing Vibe Coding" Insight

"Vibe coding" with AI assistants is fun and fast, but it can produce sloppy output. The traditional answer is "slow down and be careful." But hooks offer a different answer: **automate the carefulness**.

Instead of manually checking every AI edit, you set up hooks that check for you. The AI moves fast; the hooks catch mistakes; you stay in flow.

This is the same pattern that made CI/CD transformative for teams: instead of relying on humans to remember to run tests, automate the tests so they always run.

---

## Summary

Giving AI "standing orders" exists on a spectrum:

- **Soft instructions** (CLAUDE.md): Flexible, interpreted, may be forgotten
- **Hard enforcement** (hooks, CI): Rigid, deterministic, always checked

The best setups use both: soft guidance for nuance, hard checks for non-negotiables. And the earlier you catch problems (editor hooks vs CI vs code review), the faster your feedback loop.

The shift from "vibe coding" to "professional AI-assisted development" isn't about slowing down. It's about setting up automated quality gates so you can move fast without breaking things.
