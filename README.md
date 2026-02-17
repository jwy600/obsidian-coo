# Coo for Obsidian

Coo makes AI contextual in Obsidian. Instead of treating LLMs as a separate place you “go to” (a chat window), coo works inside the exact paragraph you’re reading or writing. Built on Obsidian’s strengths as a powerful editor and personal knowledge system, coo reimagines how people use LLMs for **research and study**—so the interaction happens where understanding is actually formed.

## Features

### Ask

Open the Ask modal from the command palette. Type any question, and the AI response is saved as a new note in your vault.

![](https://github.com/jwy600/obsidian-coo/blob/d53575c11fe56e302f3c5348a8028cf9e651bb26/asset/ask.png)

### Discuss

Select text in your editor and open the Discuss composer. Quick action buttons let you **Translate**, **Expand**, get **Examples**, or **ELI5** (Explain Like I'm 5) the selected text with one click — or type a custom question. **The AI response appears in the same textarea.**

![](https://github.com/jwy600/obsidian-coo/blob/d53575c11fe56e302f3c5348a8028cf9e651bb26/asset/discuss_ask.png)

![](https://github.com/jwy600/obsidian-coo/blob/d53575c11fe56e302f3c5348a8028cf9e651bb26/asset/discuss_answer.png)

### Annotate

Because the textarea is used for both input and output, its content is intentionally ephemeral. When you find something worth keeping, you can select text in the textarea and save it as a piece of annotation attached to the paragraph. 

![](https://github.com/jwy600/obsidian-coo/blob/d53575c11fe56e302f3c5348a8028cf9e651bb26/asset/discuss_highlight.png)

Each phrase is instantly saved as an invisible `%%annotation%%` comment below the source paragraph in your note. These annotations are invisible in Obsidian's reading mode but available for rewriting.

### Rewrite

Place your cursor in a paragraph that has annotations below it and run **Coo: Rewrite** from either command palette or contextual menu (right click). The AI rewrites the paragraph incorporating your picked phrases — translation of a key term, a concrete example, a simpler explanation — then replaces the original text and removes the annotations. Fully undoable with Ctrl/Cmd+Z.

![](https://github.com/jwy600/obsidian-coo/blob/d53575c11fe56e302f3c5348a8028cf9e651bb26/asset/rewrite.png)

### Inspire

Write an `{instruction}` anywhere in a paragraph — for example, `{give 3 examples}` — and run **Coo: Inspire**. The AI generates 2–5 concise bullet points based on your instruction and appends them directly after the paragraph. If the paragraph is a list item, bullets are automatically nested. The `{instruction}` is removed from the text after expansion.

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

| Setting              | Options                         | Default        | Description                                                          |
| -------------------- | ------------------------------- | -------------- | -------------------------------------------------------------------- |
| OpenAI API key       | —                               | (empty)        | Required. Your API key, stored locally                               |
| Model                | `gpt-5.2`, `gpt-5-mini`         | `gpt-5.2`      | Which OpenAI model to use                                            |
| Reasoning effort     | `none`, `low`, `medium`, `high` | `none`         | Controls depth of reasoning                                          |
| Web search           | on / off                        | off            | Let the model search the web                                         |
| Response language    | English, Chinese                | English        | Language for AI responses and system prompts                         |
| Translation language | Chinese                         | Chinese        | Target language for the Translate action                             |
| System prompt        | `developer.md`, `atomic.md`     | `developer.md` | Custom `.md` prompt file from `prompts/{lang}/` in the plugin folder |