# coo for Obsidian

coo makes AI contextual in Obsidian. Instead of treating LLMs as a separate place you “go to” (a chat window), coo works inside the exact paragraph you’re reading or writing. Built on Obsidian’s strengths as a powerful editor and personal knowledge system, coo reimagines how people use LLMs for research and study—so the interaction **happens where understanding is actually formed**.

## Features

### Discuss

Select text in a paragraph and open the **Discuss** composer (command palette or right-click → *coo discuss*). A small composer opens over your note with the paragraph as context.

- **Ask** — type a question about the paragraph (your highlighted phrase is the focal point). The answer is saved as an invisible `%%note%%` below the paragraph. Follow-up questions **chain**: coo remembers the whole Q&A for the note, so each question builds on the last.
- **Rewrite** — fold the gathered notes back into the paragraph. coo rewrites the paragraph incorporating the notes, then removes them. Fully undoable with Ctrl/Cmd+Z.

Answers and rewrites write straight into your note — the composer is just the command bar. Notes are `%%…%%` Obsidian comments: visible while you edit, invisible in reading mode.

### Translate

Select a word or phrase and run **coo: Translate** (command palette or right-click → *coo translate*). The translation is inserted inline, in parentheses, right after the original — so you keep the original text and see its translation next to it.

```
The phenomenon of entanglement (量子もつれ) is counterintuitive.
```

One editor operation — Ctrl/Cmd+Z reverts it.

### Re-register note

Because coo chains questions against a snapshot of your note, heavily editing a note can leave that snapshot stale. Run **coo: Re-register note** to refresh the snapshot and start a fresh chain.

## Installation

### From release

1. Go to the [latest release](https://github.com/jwy600/obsidian-coo/releases/latest)
2. Download `main.js`, `manifest.json`, and `styles.css`
3. Create a folder at `<Your Vault>/.obsidian/plugins/obsidian-coo/`
4. Move the three downloaded files into that folder
5. Reload Obsidian (Cmd+R or Ctrl+R) → Settings → Community Plugins → enable **coo**

### From source

```bash
git clone https://github.com/jwy600/obsidian-coo.git
cd obsidian-coo
npm install
npm run build
```

Copy the output files into your vault's plugin folder:

```bash
cp main.js manifest.json styles.css "<Your Vault>/.obsidian/plugins/obsidian-coo/"
```

Reload Obsidian (Cmd+R or Ctrl+R) → Settings → Community Plugins → enable **coo**.

### Requirements

- Obsidian 1.12.1
- An OpenAI API key

## Setup

1. Enable the plugin in **Settings → Community Plugins**
2. Go to **Settings → coo** and enter your OpenAI API key
3. Configure your preferred model, language, and other options

## Settings

| Setting              | Options                                          | Default                  | Description                                                                                                      |
| -------------------- | ------------------------------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| OpenAI API key       | —                                                | (empty)                  | Required. Your API key, stored locally                                                                           |
| Model                | `gpt-5.2`, `gpt-5-mini`, `gpt-5.5`              | `gpt-5.2`               | Which OpenAI model to use                                                                                        |
| Reasoning effort     | `none`, `low`, `medium`, `high`                  | `none`                   | Depth of reasoning (applies to Rewrite; Ask skips it for speed)                                                  |
| Web search           | on / off                                         | off                      | Let the model search the web during Ask                                                                          |
| Response language    | English, Español, Français, 中文, 日本語         | Auto-detected from Obsidian locale | Language for AI responses. Applied as a runtime directive to all prompts                                |
| Translation language | English, Español, Français, 中文, 日本語         | Chinese                  | Target language for the Translate action. Cannot match response language                                          |

## How chaining works

When you first Ask about a note, coo registers the whole note with OpenAI (`store: true`) as the conversation root, and stores the returned response id for that note. Each subsequent Ask chains from the previous one, so the model remembers your full Q&A history for the note. Only Ask chains — Translate and Rewrite are standalone. If OpenAI evicts the stored conversation (after some weeks), coo automatically re-registers and continues.

## Web app deployment

The design also has a web app deployment. Visit [here](https://github.com/jwy600/coo-app-next) to learn more.
