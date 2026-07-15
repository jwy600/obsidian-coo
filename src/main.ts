import { Editor, Notice, Plugin } from "obsidian";
import type { CooSettings } from "./types";
import { DEFAULT_SETTINGS, CooSettingTab } from "./settings";
import { detectObsidianLocale } from "./settings-utils";
import { CooComposer } from "./composer-modal";
import { performTranslate } from "./translate";
import { reRegisterNote } from "./chain";
import {
	getSelectedTextWithContext,
	findSelectionSpan,
	findCalloutContaining,
} from "./editor-ops";

export default class CooPlugin extends Plugin {
	settings: CooSettings;

	async onload(): Promise<void> {
		await this.loadSettings();
		await this.cleanupLegacyPrompts();

		// --- Discuss: select a paragraph → composer (Ask + Rewrite) ---
		this.addCommand({
			id: "discuss",
			name: "Discuss",
			editorCallback: (editor: Editor) => {
				this.openDiscuss(editor);
			},
		});

		// --- Translate: select a word/phrase → inline bracketed translation ---
		this.addCommand({
			id: "translate",
			name: "Translate",
			editorCallback: (editor: Editor) => {
				void performTranslate(editor, this.settings);
			},
		});

		// --- Re-register note: refresh the chaining snapshot ---
		this.addCommand({
			id: "re-register",
			name: "Re-register note",
			editorCallback: async (editor: Editor) => {
				await this.reRegister(editor);
			},
		});

		// --- Context menu ---
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor) => {
				if (!editor.somethingSelected()) return;
				menu.addItem((item) => {
					item.setTitle("coo discuss")
						.setIcon("messages-square")
						.onClick(() => {
							this.openDiscuss(editor);
						});
				});
				menu.addItem((item) => {
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
				null,
				null,
			).open();
			return;
		}

		// Selection inside an existing answer callout → drill-down: the answer
		// body is the passage, and the new answer stacks right under it. Checked
		// before findSelectionSpan so callout-body selections never hit the
		// paragraph path.
		const drillTarget = findCalloutContaining(editor, ctx.from);
		if (drillTarget) {
			new CooComposer(
				this.app,
				this.settings,
				editor,
				this.manifest.dir ?? "",
				file.path,
				ctx.selectedText,
				{ startLine: drillTarget.startLine, endLine: drillTarget.endLine },
				false,
				drillTarget,
				{ from: ctx.from, to: ctx.to },
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
			null,
			{ from: ctx.from, to: ctx.to },
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
			new Notice("Please set your OpenAI API key in coo settings.");
			return false;
		}
		return true;
	}
}
