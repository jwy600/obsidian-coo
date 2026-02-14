import { App, Editor, Modal, Notice } from 'obsidian';
import type { BlockAction, CooSettings } from './types';
import { chatCompletion, streamChatCompletion } from './ai-client';
import { getBlockActionPrompt, getDeveloperPrompt, buildActionPrompt } from './prompts';
import { findParagraphBounds, appendAnnotations } from './editor-ops';

export class CooComposer extends Modal {
	private settings: CooSettings;
	private selectedText: string;
	private editor: Editor;

	// UI elements
	private responseArea: HTMLDivElement;
	private responseText: HTMLDivElement;
	private textareaEl: HTMLTextAreaElement;
	private askBtn: HTMLButtonElement;
	private actionBar: HTMLDivElement;
	private inputArea: HTMLDivElement;

	// State
	private paragraphEndLine: number;
	private inPickingPhase = false;

	constructor(
		app: App,
		settings: CooSettings,
		selectedText: string,
		editor: Editor,
		selectionFrom: { line: number; ch: number },
	) {
		super(app);
		this.settings = settings;
		this.selectedText = selectedText;
		this.editor = editor;

		// Determine paragraph end line for appending annotations
		const bounds = findParagraphBounds(editor, selectionFrom.line);
		this.paragraphEndLine = bounds ? bounds.endLine : selectionFrom.line;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('coo-composer-modal');

		contentEl.createEl('h3', { text: 'Coo: discuss' });

		// Selected text preview
		const preview = contentEl.createDiv({ cls: 'coo-selection-preview' });
		preview.setText(
			this.selectedText.length > 200
				? this.selectedText.slice(0, 200) + '...'
				: this.selectedText,
		);

		// Quick-action bar
		this.actionBar = contentEl.createDiv({ cls: 'coo-action-bar' });
		const actions: Array<{ label: string; action: BlockAction }> = [
			{ label: 'Translate', action: 'translate' },
			{ label: 'Example', action: 'example' },
			{ label: 'Expand', action: 'expand' },
			{ label: 'ELI5', action: 'eli5' },
		];
		for (const { label, action } of actions) {
			const btn = this.actionBar.createEl('button', { text: label });
			btn.addEventListener('click', () => {
				void this.handleQuickAction(action);
			});
		}

		// Input area (textarea + ask button)
		this.inputArea = contentEl.createDiv({ cls: 'coo-input-area' });
		this.textareaEl = this.inputArea.createEl('textarea', {
			attr: { placeholder: 'Ask a question about this text...', rows: '3' },
		});
		this.textareaEl.addClass('coo-query-textarea');

		this.textareaEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				void this.handleAsk();
			}
		});

		// Response area (hidden initially via CSS class)
		this.responseArea = contentEl.createDiv({ cls: 'coo-response-area coo-hidden' });
		this.responseText = this.responseArea.createDiv({ cls: 'coo-response-text' });

		// Bottom bar
		const bottomBar = contentEl.createDiv({ cls: 'coo-bottom-bar' });
		this.askBtn = bottomBar.createEl('button', { text: 'Ask' });
		this.askBtn.addClass('mod-cta');
		this.askBtn.addEventListener('click', () => {
			if (this.inPickingPhase) {
				this.close();
			} else {
				void this.handleAsk();
			}
		});

		setTimeout(() => this.textareaEl.focus(), 50);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private setLoading(loading: boolean): void {
		this.askBtn.disabled = loading;
		this.textareaEl.disabled = loading;
		const buttons = this.actionBar.querySelectorAll<HTMLButtonElement>('button');
		buttons.forEach((btn) => {
			btn.disabled = loading;
		});
		if (loading) {
			this.askBtn.setText('Thinking...');
		}
	}

	private transitionToPickingPhase(): void {
		this.inPickingPhase = true;

		// Hide input elements, show response
		this.actionBar.addClass('coo-hidden');
		this.inputArea.addClass('coo-hidden');
		this.responseArea.removeClass('coo-hidden');

		// Update button
		this.askBtn.disabled = false;
		this.askBtn.setText('Done');

		// Set up phrase picking
		this.setupPhrasePicking();
	}

	private setupPhrasePicking(): void {
		this.responseText.addEventListener('mouseup', () => {
			const selection = window.getSelection();
			if (!selection || selection.isCollapsed) return;

			const selectedText = selection.toString().trim();
			if (!selectedText) return;

			// Check the selection is within our response div
			const range = selection.getRangeAt(0);
			if (!this.responseText.contains(range.commonAncestorContainer)) return;

			// Wrap selected text in a highlight span
			try {
				const span = document.createElement('span');
				span.className = 'coo-picked';
				range.surroundContents(span);
			} catch {
				// surroundContents can fail if selection crosses element boundaries.
				// In that case, still add the annotation but skip visual highlighting.
			}

			selection.removeAllRanges();

			// Immediately append to annotations in the editor
			appendAnnotations(this.editor, this.paragraphEndLine, [selectedText]);
			new Notice(`Added: ${selectedText}`, 2000);
		});
	}

	private async handleQuickAction(action: BlockAction): Promise<void> {
		this.setLoading(true);

		try {
			const userPrompt = buildActionPrompt(
				action,
				this.selectedText,
				undefined,
				this.settings.translateLanguage,
			);

			const response = await chatCompletion({
				settings: this.settings,
				systemPrompt: getBlockActionPrompt(this.settings.responseLanguage),
				userPrompt,
			});

			this.responseText.setText(response);
			this.transitionToPickingPhase();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
			new Notice(message, 5000);
			this.setLoading(false);
		}
	}

	private async handleAsk(): Promise<void> {
		const question = this.textareaEl.value.trim();
		if (!question) {
			new Notice('Please enter a question.');
			return;
		}

		this.setLoading(true);

		// Show response area for streaming, hide input
		this.responseArea.removeClass('coo-hidden');
		this.responseText.setText('');
		this.actionBar.addClass('coo-hidden');
		this.inputArea.addClass('coo-hidden');

		const userPrompt = buildActionPrompt('ask', this.selectedText, question);

		await streamChatCompletion(
			{
				settings: this.settings,
				systemPrompt: getDeveloperPrompt(this.settings.responseLanguage),
				userPrompt,
			},
			{
				onToken: (token) => {
					this.responseText.appendText(token);
					// Auto-scroll to bottom
					this.responseArea.scrollTop = this.responseArea.scrollHeight;
				},
				onComplete: () => {
					this.transitionToPickingPhase();
				},
				onError: (err) => {
					new Notice(err.message, 5000);
					// Revert to input phase
					this.actionBar.removeClass('coo-hidden');
					this.inputArea.removeClass('coo-hidden');
					this.responseArea.addClass('coo-hidden');
					this.setLoading(false);
				},
			},
		);
	}
}
