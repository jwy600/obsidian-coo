import { App, PluginSettingTab, Setting } from "obsidian";
import type CooPlugin from "./main";
import type {
	CooSettings,
	TranslateLanguage,
} from "./types";
import { TRANSLATE_TO_RESPONSE_MAP } from "./types";
import {
	isLanguageConflict,
	getDefaultTranslateLanguage,
} from "./settings-utils";

export { mapLocaleToResponseLanguage, detectObsidianLocale, isLanguageConflict, getDefaultTranslateLanguage } from "./settings-utils";

export const DEFAULT_SETTINGS: CooSettings = {
	apiKey: "",
	model: "gpt-5.6-terra",
	reasoningEffort: "low",
	webSearchEnabled: true,
	responseLanguage: "en",
	translateLanguage: "Chinese",
};

/** All available translate language options. */
const ALL_TRANSLATE_OPTIONS: ReadonlyArray<{
	value: TranslateLanguage;
	label: string;
}> = [
	{ value: "English", label: "English" },
	{ value: "Spanish", label: "Español" },
	{ value: "French", label: "Français" },
	{ value: "Chinese", label: "中文" },
	{ value: "Japanese", label: "日本語" },
];

export class CooSettingTab extends PluginSettingTab {
	plugin: CooPlugin;

	constructor(app: App, plugin: CooPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("OpenAI API key")
			.setDesc("Required. Your key is stored locally and never shared.")
			.addText((text) => {
				text.inputEl.type = "password";
				text
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
			.setDesc("Which OpenAI model to use for responses.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("gpt-5.6-sol", "GPT-5.6 Sol")
					.addOption("gpt-5.6-terra", "GPT-5.6 Terra")
					.addOption("gpt-5.6-luna", "GPT-5.6 Luna")
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
				"How much reasoning the model uses. Higher is slower but more thorough. Applies to ask only (rewrite and translate always run without it).",
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
				"Let the model search the web when asking, for up-to-date information.",
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
					.addOption("es", "Español")
					.addOption("fr", "Français")
					.addOption("zh", "中文")
					.addOption("ja", "日本語")
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
						// Re-render to update translate dropdown options
						void this.display();
					}),
			);

		new Setting(containerEl)
			.setName("Translation language")
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
	}
}
