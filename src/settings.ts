import { App, PluginSettingTab, Setting } from 'obsidian';
import type CooPlugin from './main';
import type { CooSettings } from './types';

export const DEFAULT_SETTINGS: CooSettings = {
	apiKey: '',
	model: 'gpt-5.2',
	reasoningEffort: 'none',
	webSearchEnabled: false,
	responseLanguage: 'en',
	translateLanguage: 'Chinese',
};

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
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- "OpenAI API" is a proper noun
			.setName('OpenAI API key')
			.setDesc('Required. Your key is stored locally and never shared.')
			.addText(text => {
				text.inputEl.type = 'password';
				text
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- placeholder format
					.setPlaceholder('sk-...')
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings = { ...this.plugin.settings, apiKey: value };
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('Model')
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- "OpenAI" is a proper noun
			.setDesc('Which OpenAI model to use for responses.')
			.addDropdown(dropdown =>
				dropdown
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- product names
					.addOption('gpt-5.2', 'GPT-5.2')
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- product names
					.addOption('gpt-5-mini', 'GPT-5 Mini')
					.setValue(this.plugin.settings.model)
					.onChange(async (value) => {
						this.plugin.settings = {
							...this.plugin.settings,
							model: value as CooSettings['model'],
						};
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Reasoning effort')
			.setDesc('How much reasoning the model should use. Higher = slower but more thorough.')
			.addDropdown(dropdown =>
				dropdown
					.addOption('none', 'None')
					.addOption('low', 'Low')
					.addOption('medium', 'Medium')
					.addOption('high', 'High')
					.setValue(this.plugin.settings.reasoningEffort)
					.onChange(async (value) => {
						this.plugin.settings = {
							...this.plugin.settings,
							reasoningEffort: value as CooSettings['reasoningEffort'],
						};
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Web search')
			.setDesc('Allow the model to search the web for up-to-date information.')
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.webSearchEnabled)
					.onChange(async (value) => {
						this.plugin.settings = { ...this.plugin.settings, webSearchEnabled: value };
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Response language')
			.setDesc('Primary language for AI responses.')
			.addDropdown(dropdown =>
				dropdown
					.addOption('en', 'English')
					.addOption('zh', 'Chinese (简体中文)')
					.setValue(this.plugin.settings.responseLanguage)
					.onChange(async (value) => {
						this.plugin.settings = {
							...this.plugin.settings,
							responseLanguage: value as CooSettings['responseLanguage'],
						};
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Translation language')
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- "Translate" is a feature name
			.setDesc('Target language for the Translate action.')
			.addDropdown(dropdown =>
				dropdown
					.addOption('English', 'English')
					.addOption('Chinese', 'Chinese')
					.addOption('Spanish', 'Spanish')
					.addOption('French', 'French')
					.setValue(this.plugin.settings.translateLanguage)
					.onChange(async (value) => {
						this.plugin.settings = {
							...this.plugin.settings,
							translateLanguage: value as CooSettings['translateLanguage'],
						};
						await this.plugin.saveSettings();
					}),
			);
	}
}
