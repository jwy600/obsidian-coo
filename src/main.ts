import { Editor, Notice, Plugin } from "obsidian";
import type { CooSettings } from "./types";
import { DEFAULT_SETTINGS, CooSettingTab } from "./settings";
import { QueryModal } from "./query-modal";
import { CooComposer } from "./composer-modal";
import { chatCompletion } from "./ai-client";
import { getBlockActionPrompt, buildActionPrompt } from "./prompts";
import {
	getSelectedTextWithContext,
	findParagraphBoundsNear,
	getParagraphText,
	extractMarkdownPrefix,
	findAnnotationLine,
	parseAnnotations,
	replaceParagraphAndRemoveAnnotations,
} from "./editor-ops";

export default class CooPlugin extends Plugin {
	settings: CooSettings;

	async onload(): Promise<void> {
		await this.loadSettings();

		// --- Flow A: Ask ---
		this.addCommand({
			id: "coo-ask",
			name: "ask",
			callback: () => {
				if (!this.requireApiKey()) return;
				new QueryModal(this.app, this.settings).open();
			},
		});

		// --- Flow B: Discuss ---
		this.addCommand({
			id: "coo-discuss",
			name: "discuss",
			editorCallback: (editor: Editor) => {
				if (!this.requireApiKey()) return;

				const ctx = getSelectedTextWithContext(editor);
				if (!ctx) {
					new Notice("Select some text first.");
					return;
				}

				new CooComposer(
					this.app,
					this.settings,
					ctx.selectedText,
					editor,
					ctx.from,
				).open();
			},
		});

		// --- Flow C: Rewrite ---
		this.addCommand({
			id: "coo-rewrite",
			name: "rewrite",
			editorCallback: async (editor: Editor) => {
				if (!this.requireApiKey()) return;

				const cursor = editor.getCursor();
				const bounds = findParagraphBoundsNear(editor, cursor.line);
				if (!bounds) {
					new Notice("Place your cursor in a paragraph.");
					return;
				}

				const annotationLineNum = findAnnotationLine(
					editor,
					bounds.endLine,
				);
				if (annotationLineNum === null) {
					new Notice(
						"No annotations found. Use coo discuss to add annotations first.",
					);
					return;
				}

				const paragraphText = getParagraphText(
					editor,
					bounds.startLine,
					bounds.endLine,
				);
				const annotationLine = editor.getLine(annotationLineNum);
				const annotations = parseAnnotations(annotationLine);

				if (annotations.length === 0) {
					new Notice("Annotation line is empty.");
					return;
				}

				// Strip markdown prefix (e.g. "- ", "## ") so the AI
				// rewrites only the content, then re-add it after.
				const { prefix, content } =
					extractMarkdownPrefix(paragraphText);

				new Notice("Rewriting...");

				try {
					const userPrompt = buildActionPrompt(
						"rewrite",
						content,
						annotations.join(", "),
					);

					const rewritten = await chatCompletion({
						settings: this.settings,
						systemPrompt: getBlockActionPrompt(
							this.settings.responseLanguage,
						),
						userPrompt,
					});

					replaceParagraphAndRemoveAnnotations(
						editor,
						bounds.startLine,
						bounds.endLine,
						annotationLineNum,
						prefix + rewritten,
					);

					new Notice("Rewritten.");
				} catch (err) {
					const message =
						err instanceof Error ? err.message : "Rewrite failed.";
					new Notice(message, 5000);
				}
			},
		});

		// --- Context menu ---
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor) => {
				// Discuss: show when text is selected
				if (editor.somethingSelected()) {
					menu.addItem((item) => {
						item.setTitle("coo discuss")
							.setIcon("messages-square")
							.onClick(() => {
								if (!this.requireApiKey()) return;

								const ctx = getSelectedTextWithContext(editor);
								if (!ctx) return;

								new CooComposer(
									this.app,
									this.settings,
									ctx.selectedText,
									editor,
									ctx.from,
								).open();
							});
					});
				}

				// Rewrite: show when paragraph has annotations
				const cursor = editor.getCursor();
				const bounds = findParagraphBoundsNear(editor, cursor.line);
				if (!bounds) return;

				const annotationLineNum = findAnnotationLine(
					editor,
					bounds.endLine,
				);
				if (annotationLineNum === null) return;

				const annotationLine = editor.getLine(annotationLineNum);
				const annotations = parseAnnotations(annotationLine);
				if (annotations.length === 0) return;

				menu.addItem((item) => {
					item.setTitle("coo rewrite")
						.setIcon("pencil")
						.onClick(async () => {
							if (!this.requireApiKey()) return;

							const paragraphText = getParagraphText(
								editor,
								bounds.startLine,
								bounds.endLine,
							);
							const { prefix, content } =
								extractMarkdownPrefix(paragraphText);

							new Notice("Rewriting...");

							try {
								const userPrompt = buildActionPrompt(
									"rewrite",
									content,
									annotations.join(", "),
								);

								const rewritten = await chatCompletion({
									settings: this.settings,
									systemPrompt: getBlockActionPrompt(
										this.settings.responseLanguage,
									),
									userPrompt,
								});

								replaceParagraphAndRemoveAnnotations(
									editor,
									bounds.startLine,
									bounds.endLine,
									annotationLineNum,
									prefix + rewritten,
								);

								new Notice("Rewritten.");
							} catch (err) {
								const message =
									err instanceof Error
										? err.message
										: "Rewrite failed.";
								new Notice(message, 5000);
							}
						});
				});
			}),
		);

		// Settings tab
		this.addSettingTab(new CooSettingTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		this.settings = {
			...DEFAULT_SETTINGS,
			...((await this.loadData()) as Partial<CooSettings> | null),
		};
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
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
