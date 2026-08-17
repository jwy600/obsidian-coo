# Edit adapts to fragments vs prose and reads inline %%…%% notes

## Context

Amends [0001 — Edit constructs passages from fragments](./0001-edit-constructs-from-fragments.md) and [0002 — Edit grounds and fact-checks](./0002-edit-grounds-and-fact-checks.md). Two frictions surfaced in use:

1. The prompt framed Edit as a single mode — "construct a coherent passage from rough fragments" — and told the model to "connect, structure, and elaborate as much as is needed." That is right for fragments but wrong when the materials are already finished prose with a small critique (e.g. `%%this bit seems unnatural%%`): the model would rebuild the whole paragraph, rewording sentences the author was happy with. "Preserve all substance" saved the *content*, not the *wording*.
2. `%%…%%` editing notes were only read from the line(s) **below** the paragraph (`gatherEditContext`). Notes the author dropped *inside* the paragraph — inline next to the text they concern, or trailing at the end — rode along as plain text inside `<materials>`, neither stripped nor treated as instructions.

## Decision

The Edit system prompt (`EDIT_PROMPT` in `src/prompts.ts`) and the Edit data flow are broadened, **prompt + a small extraction helper** (no change to chaining, registration, or the `[!coo-edit]` callout format):

- **Adaptive effort.** The prompt now tells the model to match its effort to the state of the text: *construct* fully when the materials are rough fragments; *revise lightly* when they are already coherent prose (change only what the guidelines point at, keep the rest verbatim). The framing shifts from "construct from fragments" to "carry out the author's editing intent."
- **Inline + trailing `%%…%%` notes.** `extractInlineGuidelines(text)` (new, in `editor-ops.ts`) pulls `%%…%%` embedded in the paragraph out of the prose and returns the cleaned text plus the notes:
  - **Inline** (mid-paragraph) → replaced in the text by a positional marker `[§N]` carried on the note, so the model knows exactly where it applies.
  - **Trailing** (the last `%%…%%`, only whitespace after) → removed, treated as whole-passage (no marker).
  - Whole-line `%%…%%` are unchanged: still paragraph boundaries, still read below the paragraph by `gatherEditContext` as whole-passage direction.
- **Unified guidelines.** `buildEditInput` now takes `notes: EditNote[]` (inline notes tagged `[§N]`, whole-passage notes plain) and emits them as `<guidelines>` bullets; `<materials>` carries the `[§N]` markers. `performEdit` merges inline notes with the below-paragraph notes.
- **Strip from output.** The prompt instructs the model to strip every `[§N]` marker and any `%%…%%` from its output — they are scaffolding. The revision title is built from the joined note texts (or `"Edit"` when there are none).

Grounding, fact-checking, and the optional Checks section from 0002 are unchanged and apply in both modes.

## Why

The author often writes a near-finished paragraph and wants a small, targeted change, not a reconstruction — and they think in terms of "this bit here," dropping a note right next to the offending text. Positional inline notes capture that intent far better than a single below-paragraph directive, and adaptive effort stops the model from over-rewriting prose. The two changes are really one shift: Edit becomes a flexible "carry out my editing intent" tool — construct when there's only fragments, revise when there's prose — instead of a fragments-only constructor.

This also subsumes an earlier-considered "selection-as-focus" feature: to rework one sentence, drop `%%fix this%%` right after it. Selection scope is unchanged (a selection still expands to the paragraph); no separate focus mechanism was added.

## Considered alternatives

- **Selection-as-focus** (mirror Ask's highlight so selecting a sentence tells the model what to rework). Rejected: inline `%%…%%` notes cover the same need more directly and work without a selection, so the extra mechanism was not worth it.
- **Prompt-only inline notes** (leave `%%…%%` in `<materials>` verbatim and instruct the model to interpret and strip them). Rejected: less robust than programmatic extraction — the model might treat notes as content, fail to strip them, or get them confused with the "preserve all substance" rule. Extracting keeps the roles clean: `<materials>` is prose, `<guidelines>` is direction.
- **Anchor snippets instead of `[§N]` markers** (list each note as "after '…': …" with no in-text marker). Rejected: cleaner materials, but fuzzier when a snippet repeats, and the model locates a precise marker more reliably. Markers use `§` to avoid colliding with prose citations like `[1]`.
- **Rename `materials` / the `<materials>` tag** to something mode-neutral. Rejected: it is an internal label; the lever is the instructions around it, not the name, and renaming would churn code, tests, and docs for no behavioral gain.
