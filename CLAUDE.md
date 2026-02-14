# Obsidian Coo

## What is this?

An Obsidian plugin that brings AI-powered block-level annotation and rewriting into your notes. Inspired by **Coo** (a personalized wiki built on chat), this plugin lets users discuss selected text with an LLM, pick key phrases from the response, and rewrite paragraphs incorporating those annotations.

### Reference app: `~/coo-app-next`

The original Coo web app (Next.js + React + Zustand + Supabase + OpenAI). This plugin ports a subset of its features adapted to Obsidian's editor model.

**What was ported:**

| Feature | Reference source | Plugin file |
|---------|-----------------|-------------|
| System prompts (EN/ZH developer + block-action) | `prompts/*.md` | `src/prompts.ts` |
| Block actions (translate, example, expand, eli5, ask, rewrite) | `app/api/block-action/route.ts` | `src/prompts.ts` (`buildActionPrompt`) |
| OpenAI Responses API (non-streaming) | `lib/api/openAiClient.ts` | `src/ai-client.ts` (raw `fetch`) |
| Settings (model, reasoning, web search, language) | `lib/store/settings-slice.ts` | `src/settings.ts` |

**What was NOT ported (Obsidian handles natively or not applicable):**

- Block parsing — Obsidian's editor is already markdown; no need to parse LLM output into blocks
- Cards / block curation — replaced by Obsidian's native note structure
- Export to markdown — notes are already markdown files
- State management (Zustand store) — plugin uses Obsidian's `loadData`/`saveData`
- Conversation chaining (`previous_response_id`) — each request is independent
- Thread / message history — not implemented; each interaction is standalone

**What was invented for Obsidian (not in reference app):**

- **Phrase picking via drag-select** — user selects text in the AI response modal, phrases are written as `%%...%%` annotations directly into the editor
- **`%%...%%` annotation format** — Obsidian comments store picked phrases below paragraphs, invisible in reading mode
- **Rewrite from annotations** — cursor-in-paragraph command reads `%%...%%`, calls rewrite action, replaces paragraph and removes annotations
- **Editor context menu** — right-click "coo rewrite" / "coo discuss" appears contextually
- **ChatGPT-style composer** — unified contenteditable area with persistent toolbar, pill buttons, shimmer loading, rise-in animation

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
```

## Project structure

```
src/
  main.ts            # Plugin lifecycle + 3 commands + context menu (~200 lines)
  settings.ts        # CooSettings interface, defaults, settings tab (~130 lines)
  types.ts           # Shared types: ModelType, BlockAction, CooSettings (~25 lines)
  prompts.ts         # System prompts (EN/ZH) + buildActionPrompt() (~100 lines)
  ai-client.ts       # OpenAI Responses API: chatCompletion (non-streaming only) (~130 lines)
  query-modal.ts     # Flow A modal: text input → AI → create note (~100 lines)
  composer-modal.ts  # Flow B modal: ChatGPT-style composer with contenteditable area (~250 lines)
  editor-ops.ts      # Paragraph detection, %%annotation%% parsing/editing (~140 lines)
```

Output: `main.js` + `manifest.json` + `styles.css` at repo root (loaded by Obsidian).

## Key files

| File | Purpose |
|------|---------|
| `src/main.ts` | `CooPlugin` class: `onload` registers 3 commands (`coo-ask`, `coo-discuss`, `coo-rewrite`) + editor context menu |
| `src/settings.ts` | `CooSettings` interface, `DEFAULT_SETTINGS`, `CooSettingTab` with 6 settings |
| `src/ai-client.ts` | `chatCompletion()` (non-streaming only) via raw fetch to Responses API |
| `src/prompts.ts` | Developer + block-action system prompts, `buildActionPrompt()` for all 6 actions |
| `src/query-modal.ts` | Flow A: "Coo: Ask" — question input → creates new note with response |
| `src/composer-modal.ts` | Flow B: "Coo: Discuss" — ChatGPT-style composer with contenteditable area, quick actions, phrase picking |
| `src/editor-ops.ts` | Paragraph bounds detection, `%%...%%` annotation CRUD, paragraph replacement |
| `manifest.json` | Plugin metadata (`obsidian-coo`) |
| `styles.css` | Composer box, pill buttons, animations (rise-in, shimmer), `.coo-picked` highlight |

## Three user flows

### Flow A — "Coo: Ask" (`coo-ask`)
Command palette (works from anywhere) → modal with textarea → Submit → AI generates structured response → new `.md` note created and opened. Filename derived from the query.

### Flow B — "Coo: Discuss" (`coo-discuss`)
Select text in editor → command palette → ChatGPT-style composer modal with:
- **Single contenteditable area** — serves as both input and response display. User types a question or clicks a quick action; AI response fills the same area. User can edit the response text directly.
- **Toolbar row** (always visible) — quick action pill buttons (Translate / Example / Expand / ELI5) on the left, Ask button on the right.
- **Quick actions**: non-streaming, block-action prompt. **Ask**: non-streaming, developer prompt.
- After response, **phrase picking** activates: drag-select text → highlighted with `.coo-picked` → immediately appended as `%%phrase1, phrase2%%` annotation below the source paragraph. Each pick is a separate editor operation (undoable). Duplicates are skipped.

### Flow C — "Coo: Rewrite" (`coo-rewrite`)
Cursor in a paragraph that has a `%%...%%` annotation line below it → command palette (or right-click context menu) → AI rewrites the paragraph incorporating the annotations → paragraph replaced, annotation line removed. Ctrl+Z undoes.

## Annotation format

Annotations are stored as Obsidian comments (invisible in reading mode):

```markdown
Some paragraph text that the user discussed with AI.
%%translation of key concept, a concrete example, simplified explanation%%
```

- Parsed by `parseAnnotations()`: `%%a, b, c%%` → `['a', 'b', 'c']`
- Created/appended by `appendAnnotations()` in `editor-ops.ts`
- Consumed and removed by `replaceParagraphAndRemoveAnnotations()` during rewrite

## Settings

| Setting | Type | Default | Notes |
|---------|------|---------|-------|
| OpenAI API key | password input | `''` | Required. Stored locally via `saveData()` |
| Model | dropdown | `gpt-5.2` | `gpt-5.2` or `gpt-5-mini` |
| Reasoning effort | dropdown | `none` | `none` / `low` / `medium` / `high` — sent as `reasoning.effort` |
| Web search | toggle | `false` | Sends `tools: [{ type: 'web_search' }]` |
| Response language | dropdown | `en` | `en` / `zh` — selects system prompt variant |
| Translation language | dropdown | `Chinese` | Target for Translate action |

## API client details

- **Endpoint**: `POST https://api.openai.com/v1/responses` (Responses API, not Chat Completions)
- **Non-streaming only** (`chatCompletion`): uses `fetch`, parses `output_text` or falls back to `output[].content[].text`
- **Error handling**: extracts error message from response body, maps HTTP codes to user-friendly notices
- Uses `fetch` instead of Obsidian's `requestUrl` because `requestUrl` doesn't support the Responses API reliably

## Architecture guidelines

- **Keep `main.ts` minimal**: Only plugin lifecycle and command registration. Delegate logic to modules.
- **Immutability**: Always create new objects, never mutate existing ones (e.g., `{ ...this.settings, key: value }`).
- **Small files**: 200-400 lines typical, 800 max.
- **Obsidian patterns**: Use `this.register*` helpers for cleanup. Persist via `loadData()`/`saveData()`.
- **No hidden network calls**: All API calls are user-initiated (submit button, quick action click, rewrite command).
- **Error handling**: Catch at every level. Show `new Notice(message, duration)` for user feedback.
- **CSS**: Use Obsidian CSS variables (`var(--text-accent)`, etc.) for theme compatibility. Use `.addClass`/`.removeClass` instead of `style.display` per linter rules.
- **Linting**: The `eslint-plugin-obsidianmd` enforces sentence case for UI text, `requestUrl` over `fetch`, `.setHeading()` for settings headings, and no direct style assignments.

## Testing

### Manual deployment
```bash
npm run build
cp main.js manifest.json styles.css "<Vault>/.obsidian/plugins/obsidian-coo/"
```
Reload Obsidian (`Cmd+R`) → Settings → Community plugins → enable Coo.

### Test vault
`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Purpose and Function/`
