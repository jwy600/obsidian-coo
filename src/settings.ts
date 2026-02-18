import { App, PluginSettingTab, Setting } from "obsidian";
import type CooPlugin from "./main";
import type {
	CooSettings,
	TranslateLanguage,
} from "./types";
import { TRANSLATE_TO_RESPONSE_MAP } from "./types";
import { listPromptFiles } from "./prompt-loader";
import {
	isLanguageConflict,
	getDefaultTranslateLanguage,
} from "./settings-utils";

export { mapLocaleToResponseLanguage, detectObsidianLocale, isLanguageConflict, getDefaultTranslateLanguage } from "./settings-utils";

export const DEFAULT_SETTINGS: CooSettings = {
	apiKey: "",
	model: "gpt-5.2",
	reasoningEffort: "none",
	webSearchEnabled: false,
	responseLanguage: "en",
	translateLanguage: "Chinese",
	systemPromptFile: "knowledgeassistant.md",
};

/** All available translate language options. */
const ALL_TRANSLATE_OPTIONS: ReadonlyArray<{
	value: TranslateLanguage;
	label: string;
}> = [
	{ value: "English", label: "English" },
	{ value: "Spanish", label: "Espa\u00f1ol" },
	{ value: "French", label: "Fran\u00e7ais" },
	{ value: "Chinese", label: "\u4e2d\u6587" },
	{ value: "Japanese", label: "\u65e5\u672c\u8a9e" },
];

export class CooSettingTab extends PluginSettingTab {
	plugin: CooPlugin;

	constructor(app: App, plugin: CooPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	async display(): Promise<void> {
		const { containerEl } = this;
		containerEl.empty();

		const promptFiles = await listPromptFiles(
			this.app,
			this.plugin.manifest.dir ?? "",
		);

		new Setting(containerEl)
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- "OpenAI API" is a proper noun
			.setName("OpenAI API key")
			.setDesc("Required. Your key is stored locally and never shared.")
			.addText((text) => {
				text.inputEl.type = "password";
				text
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- placeholder format
					.setPlaceholder("sk-...")
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings = {
							...this.plugin.settings,
							apiKey: value,
						};
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Model")
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- "OpenAI" is a proper noun
			.setDesc("Which OpenAI model to use for responses.")
			.addDropdown((dropdown) =>
				dropdown
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- product names
					.addOption("gpt-5.2", "GPT-5.2")
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- product names
					.addOption("gpt-5-mini", "GPT-5 Mini")
					.setValue(this.plugin.settings.model)
					.onChange(async (value) => {
						this.plugin.settings = {
							...this.plugin.settings,
							model: value as CooSettings["model"],
						};
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Reasoning effort")
			.setDesc(
				"How much reasoning the model should use. Higher = slower but more thorough.",
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("none", "None")
					.addOption("low", "Low")
					.addOption("medium", "Medium")
					.addOption("high", "High")
					.setValue(this.plugin.settings.reasoningEffort)
					.onChange(async (value) => {
						this.plugin.settings = {
							...this.plugin.settings,
							reasoningEffort:
								value as CooSettings["reasoningEffort"],
						};
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Web search")
			.setDesc(
				"Allow the model to search the web for up-to-date information.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.webSearchEnabled)
					.onChange(async (value) => {
						this.plugin.settings = {
							...this.plugin.settings,
							webSearchEnabled: value,
						};
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Response language")
			.setDesc("Primary language for AI responses.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("en", "English")
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- native language name
					.addOption("es", "Espa\u00f1ol")
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- native language name
					.addOption("fr", "Fran\u00e7ais")
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- native language name
					.addOption("zh", "\u4e2d\u6587")
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- native language name
					.addOption("ja", "\u65e5\u672c\u8a9e")
					.setValue(this.plugin.settings.responseLanguage)
					.onChange(async (value) => {
						const newResponseLang =
							value as CooSettings["responseLanguage"];

						// Auto-adjust translate language if it now conflicts
						let newTranslateLang =
							this.plugin.settings.translateLanguage;
						if (
							isLanguageConflict(
								newResponseLang,
								newTranslateLang,
							)
						) {
							newTranslateLang =
								getDefaultTranslateLanguage(newResponseLang);
						}

						this.plugin.settings = {
							...this.plugin.settings,
							responseLanguage: newResponseLang,
							translateLanguage: newTranslateLang,
						};
						await this.plugin.saveSettings();
						await this.plugin.reloadDeveloperPrompt();
						// Re-render to update translate dropdown options
						void this.display();
					}),
			);

		new Setting(containerEl)
			.setName("Translation language")
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- "Translate" is a feature name
			.setDesc("Target language for the Translate action.")
			.addDropdown((dropdown) => {
				const currentResponseLang =
					this.plugin.settings.responseLanguage;

				// Add all options except the one that conflicts with response language
				for (const opt of ALL_TRANSLATE_OPTIONS) {
					if (
						TRANSLATE_TO_RESPONSE_MAP[opt.value] !==
						currentResponseLang
					) {
						dropdown.addOption(opt.value, opt.label);
					}
				}

				dropdown
					.setValue(this.plugin.settings.translateLanguage)
					.onChange(async (value) => {
						this.plugin.settings = {
							...this.plugin.settings,
							translateLanguage:
								value as CooSettings["translateLanguage"],
						};
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("System prompt")
			.setDesc(
				"Choose a system prompt file for chat responses. " +
					"Files are loaded from the prompts/ folder.",
			)
			.addDropdown((dropdown) => {
				for (const file of promptFiles) {
					dropdown.addOption(file, file);
				}
				dropdown
					.setValue(this.plugin.settings.systemPromptFile)
					.onChange(async (value) => {
						this.plugin.settings = {
							...this.plugin.settings,
							systemPromptFile: value,
						};
						await this.plugin.saveSettings();
						await this.plugin.reloadDeveloperPrompt();
					});
			});
	}
}
