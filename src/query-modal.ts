import { App, Modal, Notice } from "obsidian";
import type { CooSettings } from "./types";
import { chatCompletion } from "./ai-client";

function sanitizeFilename(text: string): string {
	return text
		.replace(/[\\/:*?"<>|#^[\]]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

async function uniqueFilename(app: App, baseName: string): Promise<string> {
	const path = `${baseName}.md`;
	if (!(await app.vault.adapter.exists(path))) {
		return path;
	}
	return `${baseName} ${Date.now()}.md`;
}

export class QueryModal extends Modal {
	private settings: CooSettings;
	private developerPrompt: string;
	private textareaEl: HTMLTextAreaElement;
	private submitBtn: HTMLButtonElement;

	constructor(app: App, settings: CooSettings, developerPrompt: string) {
		super(app);
		this.settings = settings;
		this.developerPrompt = developerPrompt;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("coo-query-modal");

		contentEl.createEl("h3", { text: "coo ask" });

		this.textareaEl = contentEl.createEl("textarea", {
			attr: { placeholder: "Ask anything...", rows: "4" },
		});
		this.textareaEl.addClass("coo-query-textarea");

		this.textareaEl.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				void this.handleSubmit();
			}
		});

		const btnContainer = contentEl.createDiv({ cls: "coo-bottom-bar" });
		this.submitBtn = btnContainer.createEl("button", { text: "Submit" });
		this.submitBtn.addClass("mod-cta");
		this.submitBtn.addEventListener("click", () => {
			void this.handleSubmit();
		});

		// Auto-focus the textarea
		setTimeout(() => this.textareaEl.focus(), 50);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async handleSubmit(): Promise<void> {
		const query = this.textareaEl.value.trim();
		if (!query) {
			new Notice("Please enter a question.");
			return;
		}

		this.submitBtn.disabled = true;
		this.submitBtn.setText("Thinking...");
		this.textareaEl.disabled = true;

		try {
			const response = await chatCompletion({
				settings: this.settings,
				systemPrompt: this.developerPrompt,
				userPrompt: query,
			});

			const baseName = sanitizeFilename(query) || "Coo response";
			const filePath = await uniqueFilename(this.app, baseName);

			const fileContent = `${response}\n`;
			const file = await this.app.vault.create(filePath, fileContent);

			const leaf = this.app.workspace.getLeaf(true);
			await leaf.openFile(file);

			this.close();
		} catch (err) {
			const message =
				err instanceof Error
					? err.message
					: "An unexpected error occurred.";
			new Notice(message, 5000);
			this.submitBtn.disabled = false;
			this.submitBtn.setText("Submit");
			this.textareaEl.disabled = false;
		}
	}
}
