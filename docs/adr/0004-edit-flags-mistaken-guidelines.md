# Edit flags mistaken guidelines before the revision

## Context

Amends [0002 — Edit grounds and fact-checks](./0002-edit-grounds-and-fact-checks.md). The Checks section (0002) flags material *claims* that were corrected, dropped, or doubted. But the *guidelines* themselves — the `%%…%%` editing notes — could also be wrong (cite the 2019 study when the note dates it to 2021, ask for a formal tone when the surrounding note is casual, contradict the materials), and the model had no way to say so: it either followed a bad instruction silently or quietly deviated, and the author saw only the finished revision, with no feedback about the guideline itself.

## Decision

The Edit output rule (`EDIT_PROMPT` in `src/prompts.ts`) now allows a second optional section, mirroring Checks: when a guideline is mistaken, contradicts the document or the materials, or cannot be followed as written, the output begins with a `**Guidelines**` section — one tight bullet per flagged guideline (the guideline in italics, then what is wrong with it and what the model did instead). The passage follows after a blank line. When every guideline is sound, the section is omitted — a clean passage is the common case and the default.

No code change beyond the prompt: `performEdit` writes `result.text` to the callout body verbatim, so a leading Guidelines section lands above the passage with no parsing or stripping.

## Why

The author can trust a revision only if they can see where their direction was pushed back on. A mistaken guideline silently followed is worse than an inaccurate claim silently kept — the author asked for the error — so the feedback belongs in the callout, before the passage, where it is read first. The "only when something is off" trigger mirrors Checks: always-on acknowledgement bullets would add noise and tokens to the majority of edits where the guidelines are fine.

## Considered alternatives

- **Always acknowledge every guideline** (one bullet per guideline, followed-or-flagged). Rejected: explicit but noisy — most edits carry sound guidelines, and the constant section would train the eye to skip it.
- **A separate API call to review the guidelines before editing.** Rejected: doubles latency and cost per Edit, and the review is only meaningful together with the revision it shaped.
- **Fold guideline feedback into the trailing Checks section.** Rejected: Checks is about the *materials'* claims; guidelines are the author's direction. Different subjects, different placement — the feedback reads first, the alert after the passage.
