import { Editor, Notice, Plugin } from "obsidian";
import type { CooSettings } from "./types";
import { DEFAULT_SETTINGS, CooSettingTab } from "./settings";
import { detectObsidianLocale } from "./settings-utils";
import { CooComposer } from "./composer-modal";
import { performTranslate } from "./translate";
import { reRegisterNote } from "./chain";
import { getSelectedTextWithContext, findSelectionSpan } from "./editor-ops";

export default class CooPlugin extends Plugin {
	settings: CooSettings;

	async onload(): Promise<void> {
		await this.loadSettings();
		await this.cleanupLegacyPrompts();

		// --- Discuss: select a paragraph → composer (Ask + Rewrite) ---
		this.addCommand({
			id: "coo-discuss",
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- command name
			name: "discuss",
			editorCallback: (editor: Editor) => {
				this.openDiscuss(editor);
			},
		});

		// --- Translate: select a word/phrase → inline bracketed translation ---
		this.addCommand({
			id: "coo-translate",
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- command name
			name: "translate",
			editorCallback: (editor: Editor) => {
				void performTranslate(editor, this.settings);
			},
		});

		// --- Re-register note: refresh the chaining snapshot ---
		this.addCommand({
			id: "coo-re-register",
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- command name
			name: "re-register note",
			editorCallback: async (editor: Editor) => {
				await this.reRegister(editor);
			},
		});

		// --- Context menu ---
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor) => {
				if (!editor.somethingSelected()) return;
				menu.addItem((item) => {
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- brand label
					item.setTitle("coo discuss")
						.setIcon("messages-square")
						.onClick(() => {
							this.openDiscuss(editor);
						});
				});
				menu.addItem((item) => {
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- brand label
					item.setTitle("coo translate")
						.setIcon("languages")
						.onClick(() => {
							void performTranslate(editor, this.settings);
						});
				});
			}),
		);

		// Settings tab
		this.addSettingTab(new CooSettingTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		const saved = (await this.loadData()) as Partial<CooSettings> | null;
		const isFirstUse = saved === null;

		this.settings = {
			...DEFAULT_SETTINGS,
			...saved,
		};

		// Auto-detect locale on first use (no saved settings)
		if (isFirstUse) {
			this.settings = {
				...this.settings,
				responseLanguage: detectObsidianLocale(),
			};
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private openDiscuss(editor: Editor): void {
		if (!this.requireApiKey()) return;

		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("Open a note first.");
			return;
		}

		const ctx = getSelectedTextWithContext(editor);

		// No selection → discuss the whole document; the answer lands at the
		// bottom. (Selection path stays as-is below.)
		if (!ctx) {
			if (!editor.getValue().trim()) {
				new Notice("The document is empty.");
				return;
			}
			new CooComposer(
				this.app,
				this.settings,
				editor,
				this.manifest.dir ?? "",
				file.path,
				"",
				{ startLine: 0, endLine: Math.max(0, editor.lineCount() - 1) },
				true,
			).open();
			return;
		}

		const bounds = findSelectionSpan(editor, ctx.from, ctx.to);
		if (!bounds) {
			new Notice("Select text in a paragraph.");
			return;
		}

		new CooComposer(
			this.app,
			this.settings,
			editor,
			this.manifest.dir ?? "",
			file.path,
			ctx.selectedText,
			bounds,
			false,
		).open();
	}

	private async reRegister(editor: Editor): Promise<void> {
		if (!this.requireApiKey()) return;

		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("Open a note first.");
			return;
		}

		new Notice("Re-registering note...");

		try {
			await reRegisterNote(
				this.app,
				this.manifest.dir ?? "",
				file.path,
				editor.getValue(),
				this.settings,
			);
			new Notice("Note re-registered.");
		} catch (err) {
			const message =
				err instanceof Error
					? err.message
					: "Re-registration failed.";
			new Notice(message, 5000);
		}
	}

	/**
	 * Remove the default prompt files left by the legacy prompt-loader (Flow A
	 * is gone). User-added custom files in prompts/ are left untouched.
	 */
	private async cleanupLegacyPrompts(): Promise<void> {
		const dir = this.manifest.dir ?? "";
		if (!dir) return;
		const adapter = this.app.vault.adapter;
		for (const name of ["knowledgeassistant.md", "atomic.md"]) {
			const path = `${dir}/prompts/${name}`;
			if (await adapter.exists(path)) {
				try {
					await adapter.remove(path);
				} catch {
					// best-effort; ignore
				}
			}
		}
	}

	private requireApiKey(): boolean {
		if (!this.settings.apiKey) {
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- "OpenAI API" is a proper noun
			new Notice("Please set your OpenAI API key in coo settings.");
			return false;
		}
		return true;
	}
}
