# Edit constructs passages from fragments as chained, numbered callouts

## Context

Adding a writing-mode action (`coo:Edit`) to turn rough fragments of a thought into coherent prose. The obvious design — an in-place overwrite "polisher" living inside the Discuss modal — was considered and rejected (see below).

## Decision

`coo:Edit` is a standalone, no-modal command (like `coo:Translate`). It reads **materials** (the paragraph at the cursor) and **guidelines** (a `%%…%%` comment on the line directly below), constructs a passage, and writes it as a **non-destructive `[!coo-edit]` callout** beneath the input — the original materials and guidelines are never overwritten. Revisions are **numbered globally per note and chained**, sharing Ask's per-note `response_id` chain, so later guidelines can reference a prior revision by number. Acceptance is **manual** — the author lifts what they want into the note and deletes the callout; there is deliberately no "apply" action.

Construction follows rules baked into the prompt: **faithful** (elaborate to complete the thought, but never invent claims/examples/facts the fragments don't support), **complete** (preserve all of the materials' substance — reorganize as prose, never summarize away or omit a detail), **voiced** to match the surrounding note, and **tight** (fully express the thought, no padding). The first edit of a paragraph also sends its neighboring before/after paragraphs as `<context>` for local flow and voice; later edits omit it, since the chain already carries it.

## Why

The author works by dumping fragments of a thought they can't yet articulate — not by polishing finished prose — so the action *constructs* rather than proofreads, and defers the change into a callout so the fragments and guidelines survive as a record until the author curates them. Numbered chaining enables iterative construction ("refine revision #2") and cross-revision composition without a destructive overwrite or a separate per-paragraph chain head.

## Considered alternatives

- **In-place overwrite** — rejected: destroys the fragments/guidelines the author may still want, and can't stack alternative revisions.
- **A structured "Apply" action** — rejected: the author curates manually and prefers to keep control; an apply step adds machinery for no gain.
- **Edit inside the Discuss modal with a guidance box** — rejected: guidance belongs in the note as `%%…%%` (matching "the note is the canvas"), and Edit needs no modal since all its input is in-note.
- **Per-paragraph chain head** — rejected: the per-paragraph draft is already tracked physically (the `[!coo-edit]` callouts below the paragraph), so a server-side per-paragraph head would bloat `chain-data.json` for nothing.
