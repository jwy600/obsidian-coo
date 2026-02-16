import { Editor, Notice, Plugin } from "obsidian";
import type { CooSettings } from "./types";
import { DEFAULT_SETTINGS, CooSettingTab } from "./settings";
import { QueryModal } from "./query-modal";
import { CooComposer } from "./composer-modal";
import { chatCompletion } from "./ai-client";
import {
	getBlockActionPrompt,
	buildActionPrompt,
	getInspirePrompt,
} from "./prompts";
import {
	ensureDefaultPrompts,
	loadDeveloperPrompt,
	migratePromptFilename,
} from "./prompt-loader";
import {
	getSelectedTextWithContext,
	findParagraphBoundsNear,
	getParagraphText,
	extractMarkdownPrefix,
	findAnnotationLine,
	parseAnnotations,
	replaceParagraphAndRemoveAnnotations,
	extractInstruction,
	gatherSurroundingContext,
	formatInspireResponse,
	replaceParagraphWithInspiration,
	isListItem,
} from "./editor-ops";

export default class CooPlugin extends Plugin {
	settings: CooSettings;
	developerPrompt: string;

	async onload(): Promise<void> {
		await this.loadSettings();
		await ensureDefaultPrompts(this.app, this.manifest.dir ?? "");
		const result = await loadDeveloperPrompt(
			this.app,
			this.manifest.dir ?? "",
			this.settings.responseLanguage,
			this.settings.systemPromptFile,
		);
		this.developerPrompt = result.content;
		if (result.usedFallback) {
			new Notice(
				`System prompt file "${this.settings.systemPromptFile}" not found or empty. Using default prompt.`,
				5000,
			);
		}

		// --- Flow A: Ask ---
		this.addCommand({
			id: "coo-ask",
			name: "ask",
			callback: () => {
				if (!this.requireApiKey()) return;
				new QueryModal(
					this.app,
					this.settings,
					this.developerPrompt,
				).open();
			},
		});

		// --- Flow B: Discuss ---
		this.addCommand({
			id: "coo-discuss",
			name: "discuss",
			editorCallback: (editor: Editor) => {
				this.openDiscuss(editor);
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

				const annotationLine = editor.getLine(annotationLineNum);
				const annotations = parseAnnotations(annotationLine);

				if (annotations.length === 0) {
					new Notice("Annotation line is empty.");
					return;
				}

				await this.performRewrite(
					editor,
					bounds,
					annotationLineNum,
					annotations,
				);
			},
		});

		// --- Flow D: Inspire ---
		this.addCommand({
			id: "coo-inspire",
			name: "inspire",
			editorCallback: async (editor: Editor) => {
				if (!this.requireApiKey()) return;

				const cursor = editor.getCursor();
				const bounds = findParagraphBoundsNear(editor, cursor.line);
				if (!bounds) {
					new Notice("Place your cursor in a paragraph.");
					return;
				}

				const paragraphText = getParagraphText(
					editor,
					bounds.startLine,
					bounds.endLine,
				);

				const extracted = extractInstruction(paragraphText);
				if (!extracted) {
					new Notice("No {instruction} found in this paragraph.");
					return;
				}

				await this.performInspire(editor, bounds, extracted);
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
								this.openDiscuss(editor);
							});
					});
				}

				const cursor = editor.getCursor();
				const bounds = findParagraphBoundsNear(editor, cursor.line);
				if (!bounds) return;

				// Inspire: show when paragraph contains {instruction}
				const paragraphText = getParagraphText(
					editor,
					bounds.startLine,
					bounds.endLine,
				);
				const inspireExtracted = extractInstruction(paragraphText);
				if (inspireExtracted) {
					menu.addItem((item) => {
						item.setTitle("coo inspire")
							.setIcon("lightbulb")
							.onClick(async () => {
								if (!this.requireApiKey()) return;
								await this.performInspire(
									editor,
									bounds,
									inspireExtracted,
								);
							});
					});
				}

				// Rewrite: show when paragraph has annotations
				const annotationLineNum = findAnnotationLine(
					editor,
					bounds.endLine,
				);
				if (annotationLineNum !== null) {
					const annotationLine = editor.getLine(annotationLineNum);
					const annotations = parseAnnotations(annotationLine);
					if (annotations.length > 0) {
						menu.addItem((item) => {
							item.setTitle("coo rewrite")
								.setIcon("pencil")
								.onClick(async () => {
									if (!this.requireApiKey()) return;
									await this.performRewrite(
										editor,
										bounds,
										annotationLineNum,
										annotations,
									);
								});
						});
					}
				}
			}),
		);

		// Settings tab
		this.addSettingTab(new CooSettingTab(this.app, this));
	}

	async reloadDeveloperPrompt(): Promise<void> {
		const result = await loadDeveloperPrompt(
			this.app,
			this.manifest.dir ?? "",
			this.settings.responseLanguage,
			this.settings.systemPromptFile,
		);
		this.developerPrompt = result.content;
		if (result.usedFallback) {
			new Notice(
				`System prompt file "${this.settings.systemPromptFile}" not found or empty. Using default prompt.`,
				5000,
			);
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = {
			...DEFAULT_SETTINGS,
			...((await this.loadData()) as Partial<CooSettings> | null),
		};

		// Migrate old flat-file names (e.g. "developer.en.md") to the
		// new language-folder scheme (just "developer.md").
		const migrated = migratePromptFilename(this.settings.systemPromptFile);
		if (migrated !== this.settings.systemPromptFile) {
			this.settings = { ...this.settings, systemPromptFile: migrated };
			await this.saveSettings();
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private openDiscuss(editor: Editor): void {
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
			this.developerPrompt,
		).open();
	}

	private async performRewrite(
		editor: Editor,
		bounds: { startLine: number; endLine: number },
		annotationLineNum: number,
		annotations: string[],
	): Promise<void> {
		const paragraphText = getParagraphText(
			editor,
			bounds.startLine,
			bounds.endLine,
		);
		const { prefix, content } = extractMarkdownPrefix(paragraphText);

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
	}

	private async performInspire(
		editor: Editor,
		bounds: { startLine: number; endLine: number },
		extracted: { cleanedText: string; instruction: string },
	): Promise<void> {
		const { prefix, content: contentForPrompt } = extractMarkdownPrefix(
			extracted.cleanedText,
		);
		const indentSize = isListItem(extracted.cleanedText)
			? prefix.length
			: 0;

		new Notice("Inspiring...");

		try {
			const context = gatherSurroundingContext(
				editor,
				bounds.startLine,
				bounds.endLine,
			);

			const userPrompt = buildActionPrompt(
				"inspire",
				contentForPrompt,
				extracted.instruction,
				undefined,
				context || undefined,
			);

			const response = await chatCompletion({
				settings: this.settings,
				systemPrompt: getInspirePrompt(this.settings.responseLanguage),
				userPrompt,
			});

			const bulletLines = formatInspireResponse(response, indentSize);

			if (bulletLines.length === 0) {
				new Notice("No response generated.");
				return;
			}

			replaceParagraphWithInspiration(
				editor,
				bounds.startLine,
				bounds.endLine,
				extracted.cleanedText,
				bulletLines,
			);

			new Notice("Inspired.");
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Inspire failed.";
			new Notice(message, 5000);
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
