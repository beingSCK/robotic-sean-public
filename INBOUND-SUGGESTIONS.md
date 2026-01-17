# Inbound Suggestions

Suggestions from outside this project's immediate context. Check during `/orient`.

**Format:** Each suggestion should include origin context (where/why it emerged) to help agents and users reason about prioritization at processing time.

---

## 2026-01-17: UX Flow Improvements

### Origin & Reasoning Chain

**Where this emerged:** Session in `code-directory-top` building copy-url-extension, then testing Advanced Extension Reloader for hot-reload during development.

**The inspiration:** While configuring Advanced Extension Reloader, I noticed its options page had:
- State-dependent behavior (different UI based on whether extensions are configured)
- A configuration flow that captures preferences and saves them
- Dynamic display of current state (which extensions are being watched)

Despite its "homebrew tech" aesthetic, there was thoughtful UX underneath. This made me think about Commute Calendar's current popup, which doesn't differentiate between "first time user who needs setup" and "configured user who wants to scan."

**The leap:** If a utility extension like Advanced Extension Reloader can have smart state-dependent behavior, Commute Calendar - which has more complex state (unconfigured vs. configured vs. mid-scan) - should definitely have this.

### The Suggestion

The extension icon click should have "smart" behavior based on state:

1. **First-run / Unconfigured State: "Welcome Mode"**
   - Friendly onboarding flow
   - Capture user preferences (home address, default travel mode, etc.)
   - Offer to save settings
   - Then transition to configured state

2. **Configured State: "Scan Calendar Mode"**
   - More like current popup behavior
   - Quick action to scan and create transit events
   - Status of last scan, upcoming events

3. **Settings Access**
   - Prettier, more intuitive way to change settings than current UI
   - Not buried, but not in the way

### General UX Principles to Apply

- Visual feedback for all actions (toasts, state changes)
- Error states that help users understand what went wrong
- Progressive disclosure (don't overwhelm on first use)

### Why This Suggestion Might Matter (context for prioritization)

The suggester's reasoning at time of writing - take with appropriate grain of salt:

1. **User experience (maybe):** First-time users currently face a confusing popup - but unclear how many "first-time users" there will actually be
2. **Web Store readiness (maybe):** Polish before public submission could improve reviews - but might also delay shipping
3. **Pattern learning (maybe):** Building this UX in copy-url-extension first could de-risk it - but that's another layer of indirection

---

## 2026-01-17: Chrome Web Store Submission Template

### Origin & Reasoning Chain

**Where this emerged:** Same session - we built the full Chrome Web Store submission workflow for copy-url-extension from scratch.

**What we learned:** The submission requirements aren't obvious until you try to submit. We discovered:
- Specific icon sizes required (not just "an icon")
- Screenshot dimensions and content expectations
- The value of a STORE_LISTING.md to draft description/privacy before the submission form
- PR-based review workflow caught issues before submission

**The leap:** These requirements will be identical for Commute Calendar. The copy-url-extension submission is a worked example to reference.

### The Suggestion

Apply the same submission workflow:
- Icons needed: 16x16, 32x32, 48x48, 128x128 PNG
- STORE_LISTING.md pattern for description, privacy policy, category
- Screenshot requirements: 1280x800, show the extension in action
- PR-based workflow for review before submission

**Reference:** See `_grab-bag/cc-sandbox/copy-url-extension/` for working example.

### Why This Suggestion Might Matter (context for prioritization)

1. **Concrete (probably):** These are actual Chrome Web Store requirements - less subjective than UX suggestions
2. **Reusable (probably):** The template transfers directly, minimal adaptation needed
3. **Blocking (maybe):** Can't submit without these assets - but can be done last-minute if needed

---

_Add new suggestions above this line._
