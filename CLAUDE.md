# Obsidian Coo

## What is this?

An Obsidian plugin that brings AI-powered discussion and translation into your notes, grounded in the note you're editing. Inspired by **Coo** (a personalized wiki built on chat), this plugin lets you discuss a selected paragraph with an LLM (answers become notes you can fold back in via Rewrite), translate a word or phrase inline, and chain follow-up questions using OpenAI's stored `previous_response_id`.

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
| OpenAI Responses API (non-streaming) | `lib/api/openAiClient.ts` | `src/ai-client.ts` (raw `fetch`) |
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
- **Per-note chain storage** — the chain head (`response_id`) stored in a plugin-side JSON file keyed by note path

## Tech stack

- **Language**: TypeScript (strict mode)
- **Bundler**: esbuild → `main.js`
- **Package manager**: npm
- **Runtime**: Obsidian Plugin API (`obsidian` package)
- **AI API**: OpenAI Responses API (`/v1/responses`) via raw `fetch`
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
  main.ts            # Plugin lifecycle + 3 commands + context menu + legacy cleanup
  settings.ts        # CooSettingTab (6 settings), DEFAULT_SETTINGS, re-exports utils
  settings-utils.ts  # Pure functions: locale detection, language conflict checks
  types.ts           # Shared types + LANGUAGE_MAP, *_MAP
  prompts.ts         # Ported prompts (block-action/translate/rewrite/register) + language tags + input builders
  ai-client.ts       # Responses API: chatCompletion (text+responseId), registerNote, parseResponse, CooApiError
  chain.ts           # Per-note chaining: askChained, reRegisterNote, chain-head storage in chain-data.json
  translate.ts       # Standalone Translate action (inline bracketed insertion)
  composer-modal.ts  # Discuss modal: Ask (selection-aware/drill-down, chained, auto-closes) + Rewrite
  editor-ops.ts      # Paragraph/callout detection + CRUD, drill-down targeting, translate insertion
```

Output: `main.js` + `manifest.json` + `styles.css` at repo root (loaded by Obsidian).

## Key files

| File | Purpose |
|------|---------|
| `src/main.ts` | `CooPlugin`: `onload` registers 3 commands (`coo-discuss`, `coo-translate`, `coo-re-register`) + editor context menu + legacy prompt cleanup. Helpers `openDiscuss()`, `reRegister()` |
| `src/settings.ts` | `DEFAULT_SETTINGS`, `CooSettingTab` with 6 settings, re-exports from `settings-utils` |
| `src/settings-utils.ts` | `mapLocaleToResponseLanguage()`, `detectObsidianLocale()`, `isLanguageConflict()`, `getDefaultTranslateLanguage()` |
| `src/ai-client.ts` | `chatCompletion()` (returns `{ text, responseId }`), `registerNote()` (priming call → root id), `parseResponse()`, `CooApiError`. Supports `previousResponseId`, `store`, per-call `reasoningEffort`/`webSearchEnabled` overrides |
| `src/prompts.ts` | Ported `BLOCK_ACTION_PROMPT` (`<scope>`/`<transformations>`/`<ask>`), `BLOCK_ACTION_TRANSLATE_PROMPT`, `REWRITE_PROMPT`, `REGISTER_DOC_PROMPT`. `replaceLanguageTag()` / `replaceTranslationLanguageTag()`. Input builders `buildAskInput()`, `buildRewriteInput()`, `buildTranslateInput()` |
| `src/chain.ts` | Per-note chaining: `askChained()` (registers on first Ask, chains, retries on expired id), `reRegisterNote()`, `getChainHead`/`setChainHead`/`clearChain` (persisted in `chain-data.json`) |
| `src/translate.ts` | `performTranslate()` — captures selection, calls Translate, inserts `(translation)` after the selection |
| `src/composer-modal.ts` | Discuss modal: passage preview + question input + Ask + Rewrite. Ask writes `[!coo]` callouts to the note (chained, closes after each Ask); drill-down mode targets a selection inside an answer callout; Rewrite folds callouts into the paragraph (one-shot) |
| `src/editor-ops.ts` | `findParagraphBounds()`, `findSelectionSpan()`, `getParagraphText()`, `extractMarkdownPrefix()`, callout CRUD + drill-down (`findCalloutBlocks`, `findCalloutContaining`, `getCalloutQaPairs`, `getCalloutBody`, `appendCallout`, `appendCalloutAfter`, `replaceParagraphAndRemoveCallouts`), `insertTranslationAfter()` |
| `manifest.json` | Plugin metadata (`obsidian-coo`) |
| `styles.css` | Composer modal, Ask/Rewrite buttons, passage preview |

## Two features + chaining

### Discuss (`coo-discuss`)
Select text in a paragraph → command palette or right-click → composer modal (passage preview + question input + Ask + Rewrite). **The modal is the command bar; the note is the canvas** — AI output writes into the note, not the modal. With **nothing selected**, the whole document becomes the scope instead (whole-document mode).

- **Ask** (selection-aware): the highlighted phrase is the focal point of the question. The answer is appended to the note as a collapsed `[!coo]` callout below the paragraph (question as title, answer as body — markdown renders when expanded). Asks **chain** via `previous_response_id` (the note is registered as the conversation root on the first Ask). The modal **closes after each Ask** so you can read the answer and, if needed, drill into it (see below).
- **Drill-down** (select inside an answer): select a phrase *inside an existing answer callout's body* and Ask again — the callout's body becomes the passage, the selection is the focal phrase, and the new answer stacks as a fresh `[!coo]` callout **immediately after the one it's about** (mid-stack or last, blank-line separated). It chains like any Ask (the prior answer is already in context via the chain, and is also sent fresh as the passage). There is no first-vs-follow-up distinction — every Ask is grounded in the current selection.
- **Whole-document mode** (no selection): the entire note is the scope. Ask answers append as collapsed `[!coo]` callouts at the **bottom of the note** and chain like any other Ask. Rewrite is hidden in this mode (a full-document rewrite is destructive). An empty note shows "The document is empty."
- **Rewrite**: folds the `[!coo]` note callouts (including stacked drill-down answers) into the paragraph and removes them. One-shot — does not chain. Hidden in whole-document and drill-down modes.
- Undo everywhere is native Ctrl+Z (each action is one editor op).

### Translate (`coo-translate`)
Select a word or phrase → command palette or right-click → the translation is inserted inline, bracketed `( )`, immediately after the selection. The original text is preserved. One editor op (Ctrl+Z reverts). Does not chain.

### Re-register note (`coo-re-register`)
Refreshes the chaining snapshot: re-registers the whole note (new root id) and resets the chain. Use after heavily editing the note — otherwise the registered context drifts stale.

## Chaining

Each note has a conversation root. On the first Ask, the whole note is sent to OpenAI with `store: true` and the `REGISTER_DOC_PROMPT`; the returned `response_id` (R0) is stored in `chain-data.json` keyed by note path. Each Ask passes `previous_response_id: <last>` and advances the stored head, so follow-up questions accumulate context server-side.

- Only **Ask** chains. Rewrite and Translate are one-shot.
- If a chained call is rejected (HTTP 400 — typically an expired `response_id` after OpenAI evicts the stored response), the chain resets and the Ask retries once from a fresh registration.
- **Re-register note** captures a fresh snapshot and resets the chain (prior Q&A context drops).
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
- A skippable-concept Ask answer is flagged: the model begins it with `**Minor** —`, and `parseMinorTag()` lifts that to a `[Minor]` prefix on the callout title (visible when collapsed) while keeping the body clean.
- Styled via `.callout[data-callout="coo"]` in `styles.css`.
- Legacy `%%…%%` annotations (older plugin versions) are treated as paragraph boundaries but are no longer read by Rewrite — re-ask to regenerate them as callouts.

## Settings

| Setting | Type | Default | Notes |
|---------|------|---------|-------|
| OpenAI API key | password input | `''` | Required. Stored locally via `saveData()` |
| Model | dropdown | `gpt-5.2` | `gpt-5.2` / `gpt-5-mini` / `gpt-5.5` |
| Reasoning effort | dropdown | `none` | `none` / `low` / `medium` / `high` — applies to Ask and Rewrite |
| Web search | toggle | `false` | Scopes to Ask only. Sends `tools: [{ type: 'web_search' }]` |
| Response language | dropdown | `en` | `en` / `es` / `fr` / `zh` / `ja` — auto-detected from Obsidian locale on first use. Fills the `<language>` tag at runtime |
| Translation language | dropdown | `Chinese` | Target for Translate. Cannot be the same as response language (auto-adjusted on conflict) |

## Prompt system

Prompts are ported from coo-app-next and stored language-neutral as inline strings in `src/prompts.ts` (no `prompts/` folder — the legacy prompt-loader was removed with Flow A).

### Language injection

- **`<language></language>` tag** (block-action, rewrite prompts): `replaceLanguageTag()` fills it with "Always respond in {language}." for non-English, or removes it for English.
- **`<translationlanguage></translationlanguage>` tag** (translate prompt): `replaceTranslationLanguageTag()` fills it with "Translate into {language}." or removes it for English.
- Translate uses the translation target language, independent of response language.

### Input builders

- `buildAskInput(passage, selection, question)` → `Answer this question about the passage.` preamble + `Question:` first, then `<passage>`, then the highlighted selection (matches coo-app-next's ordering; the highlight is appended after the passage). The passage is a paragraph normally, or an answer body when drilling down.
- `buildRewriteInput(passage, notes)` → `<passage>` + `<notes>` as Q&A pairs (`Q: …` / `A: …`), so the model knows what each answer addresses.
- `buildTranslateInput(passage)` → `<passage>` (the selected text).

## API client details

- **Endpoint**: `POST https://api.openai.com/v1/responses` (Responses API)
- **Non-streaming only**: `chatCompletion()` uses `fetch`, parses `id` (responseId) + `output_text` (falls back to `output[].content[].text`)
- **Chaining**: `previous_response_id` + `store: true` (set per call — Ask/register store; Rewrite/Translate don't)
- **Per-call overrides**: `reasoningEffort` and `webSearchEnabled` can override settings (Ask and Rewrite → reasoning per setting; Ask also follows the web-search toggle; Translate/Register → no reasoning, no web search)
- **Errors**: `CooApiError` carries the HTTP status so callers can react (e.g. expired-id retry on 400). HTTP codes mapped to user-friendly notices.
- Uses `fetch` instead of Obsidian's `requestUrl` because `requestUrl` doesn't support the Responses API reliably

## Architecture guidelines

- **Keep `main.ts` minimal**: Only plugin lifecycle and command registration. Delegate logic to modules.
- **Immutability**: Always create new objects, never mutate existing ones (e.g., `{ ...this.settings, key: value }`).
- **Small files**: 200-400 lines typical, 800 max.
- **Obsidian patterns**: Use `this.register*` helpers for cleanup. Persist via `loadData()`/`saveData()` (settings) or plugin-dir JSON files (chain state).
- **No hidden network calls**: All API calls are user-initiated.
- **Error handling**: Catch at every level. Show `new Notice(message, duration)` for user feedback.
- **CSS**: Use Obsidian CSS variables for theme compatibility. Use `.addClass`/`.removeClass` / `setCssProps` instead of direct `style.*` assignments per linter rules.
- **Linting**: `eslint-plugin-obsidianmd` enforces sentence case for UI text, `requestUrl` over `fetch` (Responses API exempted), `.setHeading()` for settings headings, and no direct style assignments.

## Testing

```bash
npm test             # run vitest
npm run build        # tsc -noEmit (includes tests) + esbuild bundle
npm run lint         # eslint
```

Tests (`tests/`): `editor-ops`, `ai-client` (`parseResponse`, `CooApiError`), `prompts` (language tags, input builders), `chain` (chain-head storage), `settings` (locale + conflict utils). `editor-ops` tests use a mock Editor that faithfully implements `replaceRange`.

### Manual deployment
```bash
npm run build
cp main.js manifest.json styles.css "<Vault>/.obsidian/plugins/obsidian-coo/"
```
Reload Obsidian (`Cmd+R`) → Settings → Community plugins → enable Coo.

### Test vault
`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Purpose and Function/`
