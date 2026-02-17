# Obsidian Coo

## What is this?

An Obsidian plugin that brings AI-powered block-level annotation and rewriting into your notes. Inspired by **Coo** (a personalized wiki built on chat), this plugin lets users discuss selected text with an LLM, pick key phrases from the response, and rewrite paragraphs incorporating those annotations.

### Reference app: `~/coo-app-next`

The original Coo web app (Next.js + React + Zustand + Supabase + OpenAI). This plugin ports a subset of its features adapted to Obsidian's editor model.

**What was ported:**

| Feature | Reference source | Plugin file |
|---------|-----------------|-------------|
| System prompts (EN/ZH developer + block-action) | `prompts/*.md` | `src/prompts.ts` + `src/prompt-loader.ts` |
| Block actions (translate, example, expand, eli5, ask, rewrite, inspire) | `app/api/block-action/route.ts` | `src/prompts.ts` (`buildActionPrompt`) |
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
- **Inspire from `{instruction}`** — user writes `{instruction}` inline, triggers "coo inspire" to get AI-generated bullet points appended directly into the document, with automatic nesting for list items

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
  main.ts            # Plugin lifecycle + 4 commands + context menu (~384 lines)
  settings.ts        # CooSettings defaults, settings tab with 7 dropdowns/toggles (~180 lines)
  types.ts           # Shared types: ModelType, BlockAction, CooSettings (~27 lines)
  prompts.ts         # Block-action + inspire system prompts + buildActionPrompt() + developer prompt fallbacks (~166 lines)
  prompt-loader.ts   # External .md prompt loading: ensure defaults, list files, load/migrate (~140 lines)
  ai-client.ts       # OpenAI Responses API: chatCompletion (non-streaming only) (~130 lines)
  query-modal.ts     # Flow A modal: text input → AI → create note (~100 lines)
  composer-modal.ts  # Flow B modal: ChatGPT-style composer with contenteditable area (~252 lines)
  editor-ops.ts      # Paragraph detection, %%annotation%% parsing/editing, inspire helpers (~310 lines)
```

Output: `main.js` + `manifest.json` + `styles.css` at repo root (loaded by Obsidian).

## Key files

| File | Purpose |
|------|---------|
| `src/main.ts` | `CooPlugin` class: `onload` registers 4 commands (`coo-ask`, `coo-discuss`, `coo-rewrite`, `coo-inspire`) + editor context menu. Private helpers `openDiscuss()`, `performRewrite()`, and `performInspire()` shared by command + context menu |
| `src/settings.ts` | `DEFAULT_SETTINGS`, `CooSettingTab` with 7 settings (async `display()` loads prompt file list) |
| `src/ai-client.ts` | `chatCompletion()` (non-streaming only) via raw fetch to Responses API |
| `src/prompts.ts` | Block-action + inspire system prompts, `buildActionPrompt()` for all 7 actions, `getInspirePrompt()`, developer prompt fallback constants |
| `src/prompt-loader.ts` | External `.md` prompt file management: `ensureDefaultPrompts()`, `listPromptFiles()`, `loadDeveloperPrompt()`, `migratePromptFilename()` |
| `src/query-modal.ts` | Flow A: "Coo: Ask" — question input → creates new note with response |
| `src/composer-modal.ts` | Flow B: "Coo: Discuss" — ChatGPT-style composer with contenteditable area, quick actions, phrase picking. All actions include surrounding document context |
| `src/editor-ops.ts` | Paragraph bounds detection, `%%...%%` annotation CRUD, paragraph replacement, `extractInstruction()` / `formatInspireResponse()` / `replaceParagraphWithInspiration()` for inspire |
| `manifest.json` | Plugin metadata (`obsidian-coo`) |
| `styles.css` | Composer box, pill buttons, animations (rise-in, shimmer), `.coo-picked` highlight |

## Four user flows

### Flow A — "Coo: Ask" (`coo-ask`)
Command palette (works from anywhere) → modal with textarea → Submit → AI generates structured response → new `.md` note created and opened. Filename derived from the query.

### Flow B — "Coo: Discuss" (`coo-discuss`)
Select text in editor → command palette → ChatGPT-style composer modal with:
- **Single contenteditable area** — serves as both input and response display. User types a question or clicks a quick action; AI response fills the same area. User can edit the response text directly.
- **Toolbar row** (always visible) — quick action pill buttons (Translate / Example / Expand / ELI5) on the left, Ask button on the right.
- **Quick actions**: non-streaming, block-action prompt. **Ask**: non-streaming, block-action prompt. Both include surrounding document context (nearest heading + up to 10 lines before and 5 lines after) via `gatherSurroundingContext()`.
- After response, **phrase picking** activates: drag-select text → highlighted with `.coo-picked` → immediately appended as `%%phrase1, phrase2%%` annotation below the source paragraph. Each pick is a separate editor operation (undoable). Duplicates are skipped.

### Flow C — "Coo: Rewrite" (`coo-rewrite`)
Cursor in a paragraph that has a `%%...%%` annotation line below it → command palette (or right-click context menu) → AI rewrites the paragraph incorporating the annotations → paragraph replaced, annotation line removed. Ctrl+Z undoes.

### Flow D — "Coo: Inspire" (`coo-inspire`)
Cursor in a paragraph that contains a `{instruction}` → command palette (or right-click context menu) → AI generates bullet points based on the instruction and paragraph context → bullet points appended after the paragraph, `{instruction}` removed from text. If the paragraph is a list item, bullets are nested (indented) under it. Ctrl+Z undoes. Uses a dedicated inspire system prompt that outputs 2-5 concise bullet points. Note: instructions cannot contain nested braces (e.g., `{explain {concept}}` won't work); use parentheses instead.

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
| Response language | dropdown | `en` | `en` / `zh` — selects block-action system prompt variant and `prompts/{lang}/` folder for developer prompt |
| Translation language | dropdown | `Chinese` | Target for Translate action |
| System prompt | dropdown | `developer.md` | File from `prompts/{lang}/` folder in plugin dir; user can add custom `.md` files per language |

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
