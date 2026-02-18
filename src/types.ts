export type ModelType = "gpt-5.2" | "gpt-5-mini";

export type ReasoningEffort = "none" | "low" | "medium" | "high";

export type ResponseLanguage = "en" | "es" | "fr" | "zh" | "ja";

export type TranslateLanguage =
	| "English"
	| "Spanish"
	| "French"
	| "Chinese"
	| "Japanese";

export type BlockAction =
	| "translate"
	| "example"
	| "expand"
	| "eli5"
	| "ask"
	| "rewrite"
	| "inspire";

export interface CooSettings {
	apiKey: string;
	model: ModelType;
	reasoningEffort: ReasoningEffort;
	webSearchEnabled: boolean;
	responseLanguage: ResponseLanguage;
	translateLanguage: TranslateLanguage;
	systemPromptFile: string;
}

/** Maps ResponseLanguage codes to full language names for prompt injection. */
export const LANGUAGE_MAP: Record<ResponseLanguage, string> = {
	en: "English",
	es: "Spanish",
	fr: "French",
	zh: "Simplified Chinese",
	ja: "Japanese",
};

/** Maps TranslateLanguage to its corresponding ResponseLanguage code. */
export const TRANSLATE_TO_RESPONSE_MAP: Record<
	TranslateLanguage,
	ResponseLanguage
> = {
	English: "en",
	Spanish: "es",
	French: "fr",
	Chinese: "zh",
	Japanese: "ja",
};

/** Maps ResponseLanguage to its corresponding TranslateLanguage name. */
export const RESPONSE_TO_TRANSLATE_MAP: Record<
	ResponseLanguage,
	TranslateLanguage
> = {
	en: "English",
	es: "Spanish",
	fr: "French",
	zh: "Chinese",
	ja: "Japanese",
};
