export type ModelType = "gpt-5.2" | "gpt-5-mini";

export type ReasoningEffort = "none" | "low" | "medium" | "high";

export type ResponseLanguage = "en" | "zh";

export type TranslateLanguage = "English" | "Chinese" | "Spanish" | "French";

export type BlockAction =
	| "translate"
	| "example"
	| "expand"
	| "eli5"
	| "ask"
	| "rewrite";

export interface CooSettings {
	apiKey: string;
	model: ModelType;
	reasoningEffort: ReasoningEffort;
	webSearchEnabled: boolean;
	responseLanguage: ResponseLanguage;
	translateLanguage: TranslateLanguage;
	systemPromptFile: string;
}
