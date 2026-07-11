import { App, Editor, Modal, Notice } from "obsidian";
import type { CooSettings } from "./types";
import { chatCompletion } from "./ai-client";
import { askChained } from "./chain";
import {
	getBlockActionSystemPrompt,
	getRewriteSystemPrompt,
	buildAskInput,
	buildRewriteInput,
} from "./prompts";
import {
	getParagraphText,
	extractMarkdownPrefix,
	getCalloutQaPairs,
	findCalloutBlocks,
	appendCallout,
	appendCalloutAfter,
	getCalloutBody,
	replaceParagraphAndRemoveCallouts,
	type CalloutBlock,
} from "./editor-ops";

interface ParagraphBounds {
	startLine: number;
	endLine: number;
}

/**
 * "Coo: Discuss" — a composer modal over a selected paragraph.
 *
 * The modal is the command bar; the note is the canvas. Ask answers and
 * rewrites write straight into the note (not into this modal):
 *   - Ask   → answer appended as a %%...%% note under the paragraph (chains)
 *   - Rewrite → paragraph rewritten in place, notes removed (one-shot)
 * Undo everywhere is native Ctrl+Z.
 */
export class CooComposer extends Modal {
	private settings: CooSettings;
	private editor: Editor;
	private pluginDir: string;
	private notePath: string;
	private selectedText: string;
	private bounds: ParagraphBounds;
	private wholeDoc: boolean;
	private drillTarget: CalloutBlock | null;

	private inputEl: HTMLTextAreaElement;
	private askBtn: HTMLButtonElement;
	private rewriteBtn: HTMLButtonElement;
	private toolbar: HTMLDivElement;

	constructor(
		app: App,
		settings: CooSettings,
		editor: Editor,
		pluginDir: string,
		notePath: string,
		selectedText: string,
		bounds: ParagraphBounds,
		wholeDoc: boolean,
		drillTarget: CalloutBlock | null,
	) {
		super(app);
		this.settings = settings;
		this.editor = editor;
		this.pluginDir = pluginDir;
		this.notePath = notePath;
		this.selectedText = selectedText;
		this.bounds = bounds;
		this.wholeDoc = wholeDoc;
		this.drillTarget = drillTarget;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("coo-composer-modal");
		if (this.wholeDoc) contentEl.addClass("is-whole-doc");

		// eslint-disable-next-line obsidianmd/ui/sentence-case -- brand label
		contentEl.createEl("h3", { text: "coo discuss" });

		// Whole-document mode: signal it clearly so the truncated preview below
		// isn't mistaken for a single paragraph.
		if (this.wholeDoc) {
			contentEl.createDiv({
				cls: "coo-whole-doc-hint",
				text: "Asking about the whole document",
			});
		}

		// Drill-down mode: the selection sits inside an existing answer callout,
		// so the preview below is that answer, not a paragraph.
		if (this.drillTarget) {
			contentEl.createDiv({
				cls: "coo-whole-doc-hint",
				text: "Asking about this answer",
			});
		}

		// Passage preview: the answer body when drilling, else the paragraph (or
		// the whole note in whole-doc mode, where bounds span the document).
		const preview = contentEl.createDiv({ cls: "coo-selection-preview" });
		const passage = this.drillTarget
			? getCalloutBody(this.editor, this.drillTarget)
			: getParagraphText(this.editor, this.bounds.startLine, this.bounds.endLine);
		preview.setText(
			passage.length > 300 ? passage.slice(0, 300) + "..." : passage,
		);

		// Question input
		this.inputEl = contentEl.createEl("textarea", {
			attr: {
				placeholder: this.wholeDoc
					? "Ask a question about this document..."
					: this.drillTarget
						? "Ask a question about this answer..."
						: "Ask a question about this paragraph...",
				rows: "2",
			},
		});
		this.inputEl.addClass("coo-composer-input");

		this.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
			// Ignore Enter while an IME is composing (e.g. CJK input methods use
			// Enter to confirm the candidate selection, not to submit).
			if (e.isComposing) return;
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				void this.handleAsk();
			}
		});

		// Toolbar: Rewrite (left) + Ask (right)
		this.toolbar = contentEl.createDiv({ cls: "coo-input-toolbar" });

		this.rewriteBtn = this.toolbar.createEl("button", { text: "Rewrite" });
		this.rewriteBtn.addClass("coo-rewrite-btn");
		this.rewriteBtn.addEventListener("click", () => {
			void this.handleRewrite();
		});
		// Rewrite folds a single paragraph — not meaningful (and destructive) for
		// the whole document, and not applicable when drilling into an answer.
		if (this.wholeDoc || this.drillTarget) this.rewriteBtn.hide();

		this.askBtn = this.toolbar.createEl("button", { text: "Ask" });
		this.askBtn.addClass("coo-ask-btn");
		this.askBtn.addEventListener("click", () => {
			void this.handleAsk();
		});

		setTimeout(() => this.inputEl.focus(), 50);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private setLoading(loading: boolean, busy?: "ask" | "rewrite"): void {
		this.inputEl.disabled = loading;
		this.askBtn.disabled = loading;
		this.rewriteBtn.disabled = loading;
		if (loading) {
			if (busy === "rewrite") {
				this.rewriteBtn.setText("Thinking...");
			} else {
				this.askBtn.setText("Thinking...");
			}
		} else {
			this.askBtn.setText("Ask");
			this.rewriteBtn.setText("Rewrite");
		}
	}

	private async handleAsk(): Promise<void> {
		const question = this.inputEl.value.trim();
		if (!question) {
			new Notice("Please enter a question.");
			return;
		}

		this.setLoading(true, "ask");

		try {
			const passage = this.drillTarget
				? getCalloutBody(this.editor, this.drillTarget)
				: getParagraphText(
						this.editor,
						this.bounds.startLine,
						this.bounds.endLine,
					);
			const userPrompt = buildAskInput(passage, this.selectedText, question);
			const systemPrompt = getBlockActionSystemPrompt(
				this.settings.responseLanguage,
			);

			const result = await askChained({
				app: this.app,
				pluginDir: this.pluginDir,
				notePath: this.notePath,
				noteText: this.editor.getValue(),
				settings: this.settings,
				systemPrompt,
				userPrompt,
			});

			// Answer writes straight into the note as a collapsed callout
			// (question as title, answer as body — markdown renders). When
			// drilling, the new answer stacks right under the answer it's about.
			if (this.drillTarget) {
				appendCalloutAfter(
					this.editor,
					this.drillTarget.endLine,
					question,
					result.text,
				);
			} else {
				appendCallout(this.editor, this.bounds.endLine, question, result.text);
			}

			this.close();
			new Notice("Added note.", 2000);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "An unexpected error occurred.";
			new Notice(message, 5000);
		} finally {
			this.setLoading(false);
		}
	}

	private async handleRewrite(): Promise<void> {
		// Defensive — the button is hidden in whole-doc mode and drill mode.
		if (this.wholeDoc || this.drillTarget) return;

		const notes = getCalloutQaPairs(this.editor, this.bounds.endLine);
		if (notes.length === 0) {
			new Notice("No notes yet. Ask a question first.");
			return;
		}

		this.setLoading(true, "rewrite");

		try {
			const paragraphText = getParagraphText(
				this.editor,
				this.bounds.startLine,
				this.bounds.endLine,
			);
			const { prefix, content } = extractMarkdownPrefix(paragraphText);

			const userPrompt = buildRewriteInput(content, notes);
			const systemPrompt = getRewriteSystemPrompt(
				this.settings.responseLanguage,
			);

			// Rewrite is one-shot: no chaining, no web search, reasoning per setting.
			const result = await chatCompletion({
				settings: this.settings,
				systemPrompt,
				userPrompt,
				store: false,
				webSearchEnabled: false,
			});

			const calloutBlocks = findCalloutBlocks(
				this.editor,
				this.bounds.endLine,
			);
			replaceParagraphAndRemoveCallouts(
				this.editor,
				this.bounds.startLine,
				this.bounds.endLine,
				calloutBlocks,
				prefix + result.text,
			);

			new Notice("Rewritten.");
			this.close();
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "An unexpected error occurred.";
			new Notice(message, 5000);
		} finally {
			this.setLoading(false);
		}
	}
}
