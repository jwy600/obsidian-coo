import { App, Editor, Modal, Notice } from "obsidian";
import type { BlockAction, CooSettings } from "./types";
import { chatCompletion } from "./ai-client";
import { getBlockActionPrompt, buildActionPrompt } from "./prompts";
import { findParagraphBounds, appendAnnotations } from "./editor-ops";

export class CooComposer extends Modal {
	private settings: CooSettings;
	private selectedText: string;
	private editor: Editor;
	private developerPrompt: string;

	// UI elements
	private composerBox: HTMLDivElement;
	private contentArea: HTMLDivElement;
	private askBtn: HTMLButtonElement;
	private inputToolbar: HTMLDivElement;

	// State
	private paragraphEndLine: number;
	private pickingActive = false;

	constructor(
		app: App,
		settings: CooSettings,
		selectedText: string,
		editor: Editor,
		selectionFrom: { line: number; ch: number },
		developerPrompt: string,
	) {
		super(app);
		this.settings = settings;
		this.selectedText = selectedText;
		this.editor = editor;
		this.developerPrompt = developerPrompt;

		// Determine paragraph end line for appending annotations
		const bounds = findParagraphBounds(editor, selectionFrom.line);
		this.paragraphEndLine = bounds ? bounds.endLine : selectionFrom.line;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("coo-composer-modal");

		// Position modal centered over the content area (ignoring sidebars)
		this.alignToContentArea();

		contentEl.createEl("h3", { text: "coo discuss" });

		// Selected text preview
		const preview = contentEl.createDiv({ cls: "coo-selection-preview" });
		preview.setText(
			this.selectedText.length > 200
				? this.selectedText.slice(0, 200) + "..."
				: this.selectedText,
		);

		// Composer box: content area + toolbar
		this.composerBox = contentEl.createDiv({ cls: "coo-input-area" });

		// Single contenteditable div for both input and response
		this.contentArea = this.composerBox.createDiv({
			cls: "coo-content-area",
			attr: { contenteditable: "true" },
		});

		this.contentArea.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				void this.handleAsk();
			}
		});

		// Toolbar: quick actions (left) + ask button (right)
		this.inputToolbar = this.composerBox.createDiv({
			cls: "coo-input-toolbar",
		});

		const actionsGroup = this.inputToolbar.createDiv({
			cls: "coo-action-bar",
		});
		const actions: Array<{ label: string; action: BlockAction }> = [
			{ label: "Translate", action: "translate" },
			{ label: "Example", action: "example" },
			{ label: "Expand", action: "expand" },
			{ label: "ELI5", action: "eli5" },
		];
		for (const { label, action } of actions) {
			const btn = actionsGroup.createEl("button", { text: label });
			btn.addEventListener("click", () => {
				void this.handleQuickAction(action);
			});
		}

		this.askBtn = this.inputToolbar.createEl("button", { text: "Ask" });
		this.askBtn.addClass("coo-ask-btn");
		this.askBtn.addEventListener("click", () => {
			void this.handleAsk();
		});

		setTimeout(() => this.contentArea.focus(), 50);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private alignToContentArea(): void {
		const rootSplit = document.querySelector(".workspace-split.mod-root");
		if (!rootSplit) return;

		const rect = rootSplit.getBoundingClientRect();
		const modalEl = this.containerEl.querySelector(
			".modal",
		) as HTMLElement | null;
		if (!modalEl) return;

		// Center the modal within the content area bounds
		const maxWidth = Math.min(700, rect.width - 32);
		const left = rect.left + (rect.width - maxWidth) / 2;

		modalEl.style.position = "fixed";
		modalEl.style.left = `${left}px`;
		modalEl.style.width = `${maxWidth}px`;
		modalEl.style.maxWidth = "none";
	}

	private setLoading(loading: boolean): void {
		this.askBtn.disabled = loading;
		this.contentArea.contentEditable = loading ? "false" : "true";
		const actionButtons =
			this.inputToolbar.querySelectorAll<HTMLButtonElement>(
				".coo-action-bar button",
			);
		actionButtons.forEach((btn) => {
			btn.disabled = loading;
		});
		if (loading) {
			this.askBtn.setText("Thinking...");
		} else {
			this.askBtn.setText("Ask");
		}
	}

	private enablePhrasePicking(): void {
		if (this.pickingActive) return;
		this.pickingActive = true;

		this.contentArea.addEventListener("mouseup", () => {
			const selection = window.getSelection();
			if (!selection || selection.isCollapsed) return;

			const selectedText = selection.toString().trim();
			if (!selectedText) return;

			// Check the selection is within our content area
			const range = selection.getRangeAt(0);
			if (!this.contentArea.contains(range.commonAncestorContainer))
				return;

			// Wrap selected text in a highlight span
			try {
				const span = document.createElement("span");
				span.className = "coo-picked";
				range.surroundContents(span);
			} catch {
				// surroundContents can fail if selection crosses element boundaries.
				// In that case, still add the annotation but skip visual highlighting.
			}

			selection.removeAllRanges();

			// Immediately append to annotations in the editor
			appendAnnotations(this.editor, this.paragraphEndLine, [
				selectedText,
			]);
			new Notice(`Added: ${selectedText}`, 2000);
		});
	}

	private async handleQuickAction(action: BlockAction): Promise<void> {
		this.setLoading(true);
		this.contentArea.setText("");

		try {
			const userPrompt = buildActionPrompt(
				action,
				this.selectedText,
				undefined,
				this.settings.translateLanguage,
			);

			const response = await chatCompletion({
				settings: this.settings,
				systemPrompt: getBlockActionPrompt(
					this.settings.responseLanguage,
				),
				userPrompt,
			});

			this.contentArea.setText(response);
			this.setLoading(false);
			this.enablePhrasePicking();
		} catch (err) {
			const message =
				err instanceof Error
					? err.message
					: "An unexpected error occurred.";
			new Notice(message, 5000);
			this.setLoading(false);
		}
	}

	private async handleAsk(): Promise<void> {
		const question = this.contentArea.getText().trim();
		if (!question) {
			new Notice("Please enter a question.");
			return;
		}

		this.setLoading(true);
		this.contentArea.setText("");

		try {
			const userPrompt = buildActionPrompt(
				"ask",
				this.selectedText,
				question,
			);

			const response = await chatCompletion({
				settings: this.settings,
				systemPrompt: this.developerPrompt,
				userPrompt,
			});

			this.contentArea.setText(response);
			this.setLoading(false);
			this.enablePhrasePicking();
		} catch (err) {
			const message =
				err instanceof Error
					? err.message
					: "An unexpected error occurred.";
			new Notice(message, 5000);
			this.setLoading(false);
		}
	}
}
