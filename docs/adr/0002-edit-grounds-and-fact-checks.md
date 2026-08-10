# Edit grounds in the full document and fact-checks the fragments' claims

## Context

Amends [0001 — Edit constructs passages from fragments](./0001-edit-constructs-from-fragments.md). The construction rules in 0001 are *faithful* (never invent substance) and *complete* (preserve every point, never summarize away), but they treat the materials as a closed world: whatever the author wrote is to be expressed, not questioned. Two gaps surfaced in use:

1. Edit only ever saw the **immediate before/after paragraph** (`getSurroundingParagraphs`, sent as `<context>` on the paragraph's first edit). It did not deliberately use the **rest of the note**, even though that note is already in the model's context — registered once as the per-note chain root (`registerNote`) and reachable on every chained turn via `previous_response_id`.
2. Edit had no notion of **accuracy**. A fragment that was wrong, exaggerated, or understated would be faithfully laundered into polished prose, which is the opposite of what a writing assistant should do with a shaky claim.

## Decision

The Edit system prompt (`EDIT_PROMPT` in `src/prompts.ts`) is revised, **prompt-only** — no change to the data flow:

- **Whole-document grounding.** A new `<scope>` bullet tells the model the full document is in its context (registered at the start of the conversation) and is the authority on what the note already says: match its terminology, framing, and stance, and stay consistent with claims the note already makes. The existing `<context>` neighbors continue to cover *local* flow; the full document covers *global* consistency and fact-checking. This relies on the registration already performed by `askChained`; the staleness caveat of that snapshot still applies (Re-register note refreshes it).
- **Fact-check / calibrate.** A new `<rules>` bullet has the model judge each material claim against the full document and its own knowledge, and calibrate anything wrong, exaggerated, or understated toward the truth — correcting in place, or dropping a claim that cannot be salvaged.
- **Reconciled with "preserve all substance."** The completeness rule now carves an explicit exception: a claim that is wrong or miscalibrated is corrected, not laundered through. Every *legitimate* point still survives.
- **Optional trailing Checks section.** The output rule, which previously demanded the passage and nothing else, now allows one addition: when a material claim was corrected, dropped, or doubted, the revision ends with a short `**Checks**` section (one bullet per affected claim). When every claim holds up, the output is a clean passage with no Checks note — the common case. The passage itself stays clean and liftable; the Checks section is the alert.

Web search stays **off** for Edit (as before): fact-checking here means calibration against the document and the model's own knowledge, not live lookup. Construction still needs neither search nor deep reasoning, so `reasoningEffort: "none"` and `webSearchEnabled: false` are unchanged.

## Why

A writing-mode assistant that polishes an author's fragments should treat the rest of the note as ground truth (the author already committed to those claims and that voice) and should not silently amplify a shaky claim into confident prose. Grounding + calibration make the revision something the author can trust to lift verbatim, while the trailing Checks section keeps them in charge — they see what was questioned and can disagree by editing.

## Considered alternatives

- **Send the full note fresh on every Edit** (replacing `<context>` with a `<document>` block). Rejected: the note is already registered and reachable via the chain, so resending it duplicates that and adds tokens on every edit, scaling with note size. Chosen approach (use the registered note) is prompt-only and free, at the cost of relying on a snapshot that can drift — acceptable because Re-register exists, and because the materials and immediate `<context>` are always sent fresh.
- **Inline annotations** for questionable claims (e.g. `[check: …]` inline in the passage). Rejected: mixes critique into the prose the author would lift, adding cleanup. The trailing Checks section keeps the passage clean.
- **Calibrate silently, surface nothing.** Rejected: the author wouldn't know which claims were doubted, defeating the point of fact-checking.
- **Turn web search on for fact-checking.** Rejected for now: it changes Edit's character (a fast, no-search construction tool) and the calibration we want is mostly against the document and general knowledge. Revisit if claims needing current/external facts become common.
