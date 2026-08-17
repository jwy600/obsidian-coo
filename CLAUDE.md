# Obsidian Coo

## What is this?

An Obsidian plugin that brings AI-powered discussion, translation, and writing into your notes, grounded in the note you're editing. Inspired by **Coo** (a personalized wiki built on chat), this plugin lets you discuss a selected paragraph with an LLM (answers become notes you can fold back in via Rewrite), translate a word or phrase inline, construct a coherent passage from the rough fragments of a thought (Edit), and chain follow-up questions using OpenAI's stored `previous_response_id`.

### Reference app: `~/coo-app-next`

The original Coo web app (Next.js + React + Zustand + OpenAI). This plugin ports a subset of its focus-mode + document-registration features, adapted to Obsidian's editor model.

> **Cross-repo sync log**: `SYNC.md` (gitignored) tracks recent changes in either repo and whether they've been mirrored. Run `/coo-sync` after a merge to refresh it. When porting a change, read `~/coo-app-next/CLAUDE.md` and its `git log` for the source of truth.

**Session-start sync check (do this early each session):** compare the newest date under `SYNC.md` → "Recent changes" against the newest commit in `git log`. If commits exist newer than the last logged entry — meaning a merge landed but `/coo-sync` hasn't been run — surface it to the user first: _"Heads up: there are unlogged commits in this repo. Run `/coo-sync` to update SYNC.md?"_ Then proceed with their request.

**What was ported:**

| Feature | Reference source | Plugin file |
|---------|-----------------|-------------|
| Block-action prompts (`<scope>` / `<transformations>` / `<ask>` split) | `lib/config/promptTemplates.ts` | `src/prompts.ts` |
| Translate prompt (`<translationlanguage>` tag) | `lib/config/promptTemplates.ts` | `src/prompts.ts` |
| Rewrite prompt | `lib/config/promptTemplates.ts` | `src/prompts.ts` |
| Document registration (`store: true` priming call) | `lib/api/registerDocument.ts` | `src/chain.ts` (`registerNote`) |
| Conversation chaining (`previous_response_id`) | `lib/api/openAiClient.ts` | `src/chain.ts` (`askChained`) |
| OpenAI Responses API (non-streaming) | `lib/api/openAiClient.ts` | `src/ai-client.ts` (`requestUrl`) |
| Settings (model, reasoning, web search, language) | `lib/store/settings-slice.ts` | `src/settings.ts` |

**What was NOT ported (Obsidian handles natively or not applicable):**

- In-place focus editor (CodeMirror widgets) — replaced by a composer modal; the note itself is the canvas
- Block parsing — Obsidian's editor is already markdown
- Chat threads / message history — one chain per note (a stored `response_id`), no message list
- Streaming — non-streaming only

**What is Obsidian-specific:**

- **Composer modal over the note** — the modal is a command bar (question input + Ask + Rewrite); all AI output writes straight into the note, not into the modal
- **Collapsed callout notes** — Ask answers stored as `[!coo]` Obsidian callouts below the paragraph (question as title, answer as body; markdown renders when expanded), consumed by Rewrite
- **Inline Translate** — bracketed translation inserted right after the selection, per word/phrase
- **Edit revisions** — constructed/revised passages stored as `[!coo-edit]` callouts below the materials (numbered, chained, manually curated); editing notes stashed as `%%…%%` — inline next to the text, trailing at the end, or on the line beneath — with positional inline notes carried as `[§N]` markers
- **Per-note chain storage** — the chain head (`response_id`) stored in a plugin-side JSON file keyed by note path

## Tech stack

- **Language**: TypeScript (strict mode)
- **Bundler**: esbuild → `main.js`
- **Package manager**: npm
- **Runtime**: Obsidian Plugin API (`obsidian` package)
- **AI API**: OpenAI Responses API (`/v1/responses`) via Obsidian's `requestUrl`
- **Target**: ES6 + ES2018, mobile-compatible

## Commands

```bash
npm install          # install dependencies
npm run dev          # watch mode (recompiles on save)
npm run build        # type-check + production bundle
npm run lint         # eslint (includes obsidian-specific rules)
npm test             # vitest
```

## Project structure

```
src/
  main.ts            # Plugin lifecycle + 4 commands + context menu + chain-state pruning on delete/rename + legacy cleanup
  settings.ts        # CooSettingTab (6 settings), DEFAULT_SETTINGS, re-exports utils
  settings-utils.ts  # Pure functions: locale detection, language conflict checks
  types.ts           # Shared types + LANGUAGE_MAP, *_MAP
  prompts.ts         # Ported prompts (block-action/translate/rewrite/register) + Edit prompt + language tags + input builders
  ai-client.ts       # Responses API: chatCompletion (text+responseId), registerNote, parseResponse, CooApiError
  chain.ts           # Per-note chaining: askChained (Ask + Edit), reRegisterNote, chain-head storage in chain-data.json
  translate.ts       # Standalone Translate action (inline bracketed insertion)
  edit.ts            # Standalone Edit action (carries out editing intent on materials + %%…%% notes → [!coo-edit] revision)
  composer-modal.ts  # Discuss modal: Ask (selection-aware/drill-down, chained, auto-closes) + Rewrite
  editor-ops.ts      # Paragraph/callout detection + CRUD, drill-down targeting, Edit guidelines/inline-note extraction/numbering, translate insertion, selection highlight, math-delimiter normalization
```

Output: `main.js` + `manifest.json` + `styles.css` at repo root (loaded by Obsidian).

## Key files

| File | Purpose |
|------|---------|
| `src/main.ts` | `CooPlugin`: `onload` registers 4 commands (`discuss`, `translate`, `edit`, `re-register`) + editor context menu + prunes/remaps chain state on note delete/rename + legacy prompt cleanup. Helpers `openDiscuss()`, `runEdit()`, `reRegister()` |
| `src/settings.ts` | `DEFAULT_SETTINGS`, `CooSettingTab` with 6 settings, re-exports from `settings-utils` |
| `src/settings-utils.ts` | `mapLocaleToResponseLanguage()`, `detectObsidianLocale()`, `isLanguageConflict()`, `getDefaultTranslateLanguage()` |
| `src/ai-client.ts` | `chatCompletion()` (returns `{ text, responseId }`), `registerNote()` (priming call → root id), `parseResponse()`, `CooApiError`. Supports `previousResponseId`, `store`, per-call `reasoningEffort`/`webSearchEnabled` overrides |
| `src/prompts.ts` | Ported `BLOCK_ACTION_PROMPT` (`<scope>`/`<transformations>`/`<ask>`), `BLOCK_ACTION_TRANSLATE_PROMPT`, `REWRITE_PROMPT`, `REGISTER_DOC_PROMPT`, plus the Obsidian-native `EDIT_PROMPT`. `replaceLanguageTag()` / `replaceTranslationLanguageTag()`. Input builders `buildAskInput()`, `buildRewriteInput()`, `buildTranslateInput()`, `buildEditInput()` |
| `src/chain.ts` | Per-note chaining: `askChained()` (registers on first Ask/Edit, chains, retries on expired id; optional `reasoningEffort`/`webSearchEnabled` overrides — Edit pins both off), `reRegisterNote()`, `getChainHead`/`setChainHead`/`clearChain`/`renameChainEntry` (persisted in `chain-data.json`) |
| `src/translate.ts` | `performTranslate()` — captures selection, calls Translate, inserts `(translation)` after the selection |
| `src/edit.ts` | `performEdit()` — selection-or-cursor materials + `%%…%%` notes (inline/trailing/below) → constructs or lightly revises, appends a numbered `[!coo-edit]` revision callout (chains) |
| `src/composer-modal.ts` | Discuss modal: passage preview + question input + Ask + Rewrite. Ask writes `[!coo]` callouts to the note (chained, closes after each Ask); drill-down mode targets a selection inside an answer callout; Rewrite folds callouts into the paragraph (one-shot) |
| `src/editor-ops.ts` | `findParagraphBounds()`, `findSelectionSpan()`, `resolveEditBounds()`, `getParagraphText()`, `extractMarkdownPrefix()`, callout CRUD + drill-down (`findCalloutBlocks`, `findCalloutContaining`, `getCalloutQaPairs`, `getCalloutBody`, `appendCallout`, `appendCalloutAfter` (with `CalloutType` for `[!coo]`/`[!coo-edit]`), `replaceParagraphAndRemoveCallouts`), Edit helpers (`extractInlineGuidelines`, `gatherEditContext`, `getSurroundingParagraphs`, `nextRevisionNumber`), `normalizeMathDelimiters()`, `insertTranslationAfter()`, `highlightSelection()` |
| `manifest.json` | Plugin metadata (`coo`) |
| `styles.css` | Composer modal, Ask/Rewrite buttons, passage preview, `[!coo]` / `[!coo-edit]` callout accents |

## Three features + chaining

### Discuss
Select text in a paragraph → command palette or right-click → composer modal (passage preview + question input + Ask + Rewrite). **The modal is the command bar; the note is the canvas** — AI output writes into the note, not the modal. With **nothing selected**, the whole document becomes the scope instead (whole-document mode).

- **Ask** (selection-aware): the highlighted phrase is the focal point of the question. The answer is appended to the note as a collapsed `[!coo]` callout below the paragraph (question as title, answer as body — markdown renders when expanded). Asks **chain** via `previous_response_id` (the note is registered as the conversation root on the first Ask). The modal **closes after each Ask** so you can read the answer and, if needed, drill into it (see below). The question input is pre-filled with a localized default (`DEFAULT_ASK_QUESTION` in `types.ts`, e.g. "What does this mean?" for `en`) shown as its placeholder; submitting empty falls back to it, so a single Ask/Enter asks the default. The focal selection is also wrapped in a persistent `==...==` highlight in the note (`highlightSelection` on open — single-line selections only), so the word in focus stays recorded; the callout title is the question, not the word.
- **Drill-down** (select inside an answer): select a phrase *inside an existing answer callout's body* and Ask again — the callout's body becomes the passage, the selection is the focal phrase, and the new answer stacks as a fresh `[!coo]` callout **immediately after the one it's about** (mid-stack or last, blank-line separated). It chains like any Ask (the prior answer is already in context via the chain, and is also sent fresh as the passage). There is no first-vs-follow-up distinction — every Ask is grounded in the current selection.
- **Whole-document mode** (no selection): the entire note is the scope. Ask answers append as collapsed `[!coo]` callouts at the **bottom of the note** and chain like any other Ask. Rewrite is hidden in this mode (a full-document rewrite is destructive). An empty note shows "The document is empty."
- **Rewrite**: folds the `[!coo]` note callouts (including stacked drill-down answers) into the paragraph and removes them. One-shot — does not chain. Hidden in whole-document and drill-down modes.
- Undo everywhere is native Ctrl+Z (each action is one editor op).

### Translate
Select a word or phrase → command palette or right-click → the translation is inserted inline, bracketed `( )`, immediately after the selection. The original text is preserved. One editor op (Ctrl+Z reverts). Does not chain.

### Edit
Place the cursor in the **materials** — rough fragments of a thought, or finished prose you want revised — and run `coo:Edit` (command palette or right-click; no modal). To work on a multi-paragraph block (a whole list, several paragraphs), **select** it instead. Drop editing **notes** as `%%…%%` wherever you like: inline next to the text they concern (a `[§N]` marker records the spot), trailing at the end of the paragraph (whole-passage), or on the line directly below (whole-passage) — all count. Edit **carries out the intent** adaptively: it **constructs** when the materials are rough fragments (connect, elaborate, fully express the thought) and **revises lightly** when they're already coherent prose (touch only what the notes point at, keep the rest verbatim). It is grounded in the full note — already in the model's context via the per-note registration — and faithful: never invents substance, preserves every point rather than summarizing it away, and calibrates any claim that is wrong, exaggerated, or understated toward the truth; matches the surrounding note's voice. The result appends as a collapsed `[!coo-edit]` **revision** callout beneath the input. When a guideline is mistaken, contradicts the note or materials, or can't be followed as written, the revision **begins** with a short **Guidelines** section flagging it (what was wrong and what was done instead); when a material claim is corrected, dropped, or doubted, the revision **ends** with a short **Checks** section flagging it; a clean passage (neither section) is the default.

- The materials and guidelines are **never overwritten** — the revision lands in a callout, so you curate by hand (lift what you want, delete the callout). There is no "apply" action.
- Revisions are **numbered** globally per note (`#1`, `#2`, …, never reused) and **chain** (sharing the note's Ask conversation root), so later guidelines can reference a prior revision by number (e.g. `%%refine revision #2 to be shorter%%`).
- The immediate **before/after paragraphs** are sent as `<context>` (`getSurroundingParagraphs`) **only on the first edit of a paragraph** (`hasRevisions` from `gatherEditContext`); later revisions inherit them via the chain. They cover *local* flow. The model works only from the materials, never the context.
- The **full note** is also in the model's context — registered as the per-note chain root on the first Ask/Edit — so the prompt grounds each construction in the whole document: matching its terminology/framing/stance, staying consistent with claims the note already makes, and fact-checking the materials' claims against it. That snapshot can drift if the note is heavily edited; Re-register note refreshes it.
- **Editing notes** (`%%…%%`) work in three places, all of which count: **inline** next to the text they concern (`extractInlineGuidelines` leaves a `[§N]` marker at the spot so the model applies the note there), **trailing** at the end of the paragraph (whole-passage), or on the **line below** (whole-passage, read by `gatherEditContext`). Inline → positional; the other two → whole-passage. Every `%%…%%` and `[§N]` marker is stripped from the output.
- A cursor or selection on a `%%…%%` line (or a blank/heading/callout line) yields no materials — `resolveEditBounds` returns null — so you can't "edit a guideline" by mistake.
- Edit pins reasoning and web search off (construction needs neither). One editor op (Ctrl+Z reverts).

### Re-register note
Refreshes the chaining snapshot: re-registers the whole note (new root id) and resets the chain. Use after heavily editing the note — otherwise the registered context drifts stale.

## Chaining

Each note has a conversation root. On the first Ask or Edit, the whole note is sent to OpenAI with `store: true` and the `REGISTER_DOC_PROMPT`; the returned `response_id` (R0) is stored in `chain-data.json` keyed by note path. Each Ask/Edit passes `previous_response_id: <last>` and advances the stored head, so follow-up turns accumulate context server-side.

- **Ask** and **Edit** chain. Rewrite and Translate are one-shot.
- If a chained call is rejected (HTTP 400 — typically an expired `response_id` after OpenAI evicts the stored response), the chain resets and the call retries once from a fresh registration.
- **Re-register note** captures a fresh snapshot and resets the chain (prior Q&A context drops).
- **Delete/rename** prunes a deleted note's chain entry and remaps a renamed one, so `chain-data.json` doesn't accumulate stale `response_id`s.
- The registered snapshot is a point-in-time copy of the note. The passage you Ask about is always sent fresh; the broad note context can drift if you edit heavily (that's what re-register is for).

## Note format

Each Ask answer is stored as a collapsed Obsidian callout — below the paragraph, or at the **bottom of the note** in whole-document mode — the question is the callout title (visible collapsed as `▶ What is X?`), the answer is the body (markdown renders when expanded):

```markdown
Some paragraph text that the user discussed with AI.

> [!coo]- What is X?
> The answer, with **markdown** that renders.

> [!coo]- Why Y?
> Another answer.
```

- `appendCallout()` adds a new `[!coo]` callout below the paragraph (blank-line separated; question as title, answer as body with markdown intact).
- `appendCalloutAfter()` adds a new `[!coo]` callout immediately after a given line — used by drill-down to stack an answer right under the one it's about (mid-stack or last).
- `getCalloutQaPairs()` reads the question (title) + answer (body) of each callout below a paragraph, as Q&A pairs — used by Rewrite so the model sees what each answer addresses.
- `getCalloutBody()` reads the body of a single callout block — used by drill-down to read the answer a selection sits inside.
- `findCalloutContaining()` finds the `[!coo]` callout whose body contains a position (or null) — used by `openDiscuss` to detect drill-down.
- `replaceParagraphAndRemoveCallouts()` consumes them during Rewrite (removes the callout blocks).
- Drill-down answers stack as sibling callouts (not nested); Rewrite folds the whole stack into the paragraph.
- TeX math delimiters in an answer are normalized to Obsidian's before a callout is written (`normalizeMathDelimiters()` in `editor-ops.ts`, called from `formatCalloutBlock`): inline `\(...\)` → `$…$`, display `\[...\]` → `$$…$$` — the display conversion is guarded so escaped prose brackets like `\[W\]` stay put. The Ask and Rewrite prompts also tell the model to emit `$`/`$$` directly.
- A skippable-concept Ask answer is flagged: the model begins it with `**Minor** —`, and `parseMinorTag()` lifts that to a `[Minor]` prefix on the callout title (visible when collapsed) while keeping the body clean.
- Styled via `.callout[data-callout="coo"]` in `styles.css`.
- Legacy `%%…%%` annotations (older plugin versions) are treated as paragraph boundaries but are no longer read by Rewrite — re-ask to regenerate them as callouts.

### Edit revisions (`[!coo-edit]`)

Each Edit result (a construction from fragments, or a light revision of prose) is stored as a collapsed `[!coo-edit]` callout beneath the materials (+ notes), distinct from `[!coo]` Ask notes:

```markdown
fragments of a thought the user couldn't yet articulate

%%keep it under three sentences, formal%%

> [!coo-edit]- #1 keep it under three sentences, formal
> The constructed passage, with **markdown** that renders.
```

- `appendCalloutAfter(..., "coo-edit")` writes a revision callout — the `calloutType` param selects `[!coo]` vs `[!coo-edit]`.
- When the model corrects, drops, or doubts a material claim, the revision body ends with a short **Checks** section (a `**Checks**` label, then one bullet per affected claim); when a guideline is mistaken, contradicts the document or materials, or can't be followed as written, the body begins with a short **Guidelines** section (a `**Guidelines**` label, then one bullet per flagged guideline — what's wrong and what was done instead). A clean passage with neither section is the default. The passage itself stays liftable — both sections are the alert, trimmed away during curation.
- `gatherEditContext()` reads the `%%…%%` guidelines directly below the materials, finds where the new revision should insert (after the guidelines, then after any existing `[!coo-edit]` revisions so they stack in order), and reports whether revisions already exist (`hasRevisions`).
- `nextRevisionNumber()` returns one higher than the highest `#N` among existing `[!coo-edit]` titles — global per note, never reused.
- `getSurroundingParagraphs()` returns the prose paragraphs immediately before/after the materials (skipping `%%…%%` guidelines and `[!coo-edit]` revisions), sent as `<context>` on the paragraph's first edit so the model matches local flow and voice.
- `[!coo-edit]` is invisible to Rewrite and drill-down: `isCalloutStart` matches only the literal `[!coo]`, so a revision callout is never read as a Q&A note or treated as a drillable answer.
- `%%…%%` doubles as Edit's editing-notes vehicle — **inline** within a paragraph (`extractInlineGuidelines` pulls them out as positional `[§N]`-tagged guidelines, or whole-passage if trailing) or as a **whole-line** comment (`isAnnotationLine`, a paragraph boundary, read below the paragraph by `gatherEditContext`). All forms are stripped from the output.
- Styled via `.callout[data-callout="coo-edit"]` in `styles.css` (teal accent, distinct from the purple `[!coo]`).

## Settings

| Setting | Type | Default | Notes |
|---------|------|---------|-------|
| OpenAI API key | password input | `''` | Required. Stored locally via `saveData()` |
| Model | dropdown | `gpt-5.6-terra` | `gpt-5.6-sol` / `gpt-5.6-terra` / `gpt-5.6-luna` |
| Reasoning effort | dropdown | `low` | `none` / `low` / `medium` / `high` — applies to Ask only (Edit pins it off) |
| Web search | toggle | `true` | Scopes to Ask only (Edit pins it off). Sends `tools: [{ type: 'web_search' }]` |
| Response language | dropdown | `en` | `en` / `es` / `fr` / `zh` / `ja` — auto-detected from Obsidian locale on first use. Fills the `<language>` tag at runtime |
| Translation language | dropdown | `Chinese` | Target for Translate. Cannot be the same as response language (auto-adjusted on conflict) |

## Prompt system

Prompts are ported from coo-app-next and stored language-neutral as inline strings in `src/prompts.ts` (no `prompts/` folder — the legacy prompt-loader was removed with Flow A).

### Language injection

- **`<language></language>` tag** (block-action, rewrite prompts): `replaceLanguageTag()` fills it with "Always respond in {language}." for non-English, or removes it for English.
- **`<translationlanguage></translationlanguage>` tag** (translate prompt): `replaceTranslationLanguageTag()` fills it with "Translate into {language}." or removes it for English.
- **No language tag** (Edit prompt): `getEditSystemPrompt()` returns the prompt verbatim — Edit constructs in the materials' own language (editing is not translation).
- Translate uses the translation target language, independent of response language.

### Input builders

- `buildAskInput(passage, selection, question)` → `Answer this question about the passage.` preamble + `Question:` first, then `<passage>`, then the highlighted selection (matches coo-app-next's ordering; the highlight is appended after the passage). The passage is a paragraph normally, or an answer body when drilling down.
- `buildRewriteInput(passage, notes)` → `<passage>` + `<notes>` as Q&A pairs (`Q: …` / `A: …`), so the model knows what each answer addresses.
- `buildTranslateInput(passage)` → `<passage>` (the selected text).
- `buildEditInput(materials, notes, revisionNumber, context?)` → `<materials>` (with `[§N]` markers at inline notes) + optional `<guidelines>` (inline notes tagged `[§N]`, whole-passage notes plain) + optional `<context>` (the before/after paragraphs) + `This is revision #N` (the number labels the chained turn so later notes can reference it).

## API client details

- **Endpoint**: `POST https://api.openai.com/v1/responses` (Responses API)
- **Non-streaming only**: `chatCompletion()` calls `requestUrl` (via `apiFetch`), parses `id` (responseId) + `output_text` (falls back to `output[].content[].text`)
- **Chaining**: `previous_response_id` + `store: true` (set per call — Ask/Edit/register store; Rewrite/Translate don't)
- **Per-call overrides**: `reasoningEffort` and `webSearchEnabled` can override settings (Ask → reasoning per setting + follows the web-search toggle; Edit → no reasoning, no web search, via `askChained` overrides; Rewrite/Translate/Register → no reasoning, no web search)
- **Errors**: `CooApiError` carries the HTTP status so callers can react (e.g. expired-id retry on 400). HTTP codes mapped to user-friendly notices.
- Uses Obsidian's `requestUrl` with `throw: false` so 4xx/5xx responses come back (status + body) instead of throwing — letting `callApi` read the error body and map HTTP codes to notices. (`fetch` is blocked by the `no-restricted-globals` lint rule.)

## Architecture guidelines

- **Keep `main.ts` minimal**: Only plugin lifecycle and command registration. Delegate logic to modules.
- **Immutability**: Always create new objects, never mutate existing ones (e.g., `{ ...this.settings, key: value }`).
- **Small files**: 200-400 lines typical, 800 max.
- **Obsidian patterns**: Use `this.register*` helpers for cleanup. Persist via `loadData()`/`saveData()` (settings) or plugin-dir JSON files (chain state).
- **No hidden network calls**: All API calls are user-initiated.
- **Error handling**: Catch at every level. Show `new Notice(message, duration)` for user feedback.
- **CSS**: Use Obsidian CSS variables for theme compatibility. Use `.addClass`/`.removeClass` / `setCssProps` instead of direct `style.*` assignments per linter rules.
- **Linting**: `eslint-plugin-obsidianmd` enforces sentence case for UI text, `requestUrl` over `fetch`, `.setHeading()` for settings headings, and no direct style assignments. Brand/format strings the rule would mangle (`coo`, `sk-`, `GPT-5.6`, `OpenAI`, `Translate`) are exempted via `ignoreRegex` in `eslint.config.mts` — not via inline `eslint-disable`, which the submission checker forbids for these rules.

## Testing

```bash
npm test             # run vitest
npm run build        # tsc -noEmit (includes tests) + esbuild bundle
npm run lint         # eslint
```

Tests (`tests/`): `editor-ops` (paragraph/callout/Edit-guidelines/numbering), `ai-client` (`parseResponse`, `CooApiError`), `prompts` (language tags, input builders incl. Edit), `chain` (chain-head storage), `settings` (locale + conflict utils). `editor-ops` tests use a mock Editor that faithfully implements `replaceRange` (and `getValue`). The `obsidian` package is aliased to `tests/stubs/obsidian.ts` (`vitest.config.ts`) so modules importing `requestUrl` as a runtime value load under vitest.

### Manual deployment
```bash
npm run build
cp main.js manifest.json styles.css "<Vault>/.obsidian/plugins/coo/"
```
Reload Obsidian (`Cmd+R`) → Settings → Community plugins → enable Coo.

### Test vault
`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Purpose and Function/`
