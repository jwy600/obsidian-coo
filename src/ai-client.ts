import type { CooSettings } from "./types";

const API_URL = "https://api.openai.com/v1/responses";

export interface ChatCompletionParams {
	settings: CooSettings;
	systemPrompt: string;
	userPrompt: string;
}

function buildRequestBody(
	params: ChatCompletionParams,
): Record<string, unknown> {
	const { settings, systemPrompt, userPrompt } = params;

	const body: Record<string, unknown> = {
		model: settings.model,
		input: userPrompt,
		instructions: systemPrompt,
	};

	if (settings.reasoningEffort !== "none") {
		body.reasoning = { effort: settings.reasoningEffort };
	}

	if (settings.webSearchEnabled) {
		body.tools = [{ type: "web_search" }];
	}

	return body;
}

function extractApiError(body: string): string {
	try {
		const json = JSON.parse(body) as { error?: { message?: string } };
		if (json.error?.message) return json.error.message;
	} catch {
		// not JSON
	}
	return body.slice(0, 200);
}

function mapHttpError(status: number, body: string): string {
	const detail = extractApiError(body);

	switch (status) {
		case 400:
			return `Bad request: ${detail}`;
		case 401:
			return "Invalid API key. Please check your key in Coo settings.";
		case 429:
			return "Rate limited by OpenAI. Please wait a moment and try again.";
		case 500:
		case 502:
		case 503:
			return "OpenAI service error. Please try again later.";
		default:
			return `OpenAI API error (${status}): ${detail}`;
	}
}

function extractResponseText(responseText: string): string {
	const data = JSON.parse(responseText) as {
		output_text?: string;
		output?: Array<{
			type?: string;
			content?: Array<{ type?: string; text?: string }>;
		}>;
	};

	// Try top-level output_text first, then extract from output array
	let text = data.output_text?.trim();
	if (!text && data.output) {
		for (const item of data.output) {
			if (item.type === "message" && item.content) {
				for (const block of item.content) {
					if (block.type === "output_text" && block.text) {
						text = block.text.trim();
						break;
					}
				}
			}
			if (text) break;
		}
	}

	if (!text) {
		throw new Error("The assistant didn't return any text.");
	}

	return text;
}

async function apiFetch(
	apiKey: string,
	body: Record<string, unknown>,
): Promise<Response> {
	// eslint-disable-next-line no-restricted-globals -- requestUrl doesn't support Responses API
	return fetch(API_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify(body),
	});
}

/**
 * Non-streaming response via Responses API.
 */
export async function chatCompletion(
	params: ChatCompletionParams,
): Promise<string> {
	if (!params.settings.apiKey) {
		throw new Error(
			"API key not configured. Please set it in Coo settings.",
		);
	}

	const body = buildRequestBody(params);
	const response = await apiFetch(params.settings.apiKey, body);
	const responseText = await response.text();

	if (!response.ok) {
		throw new Error(mapHttpError(response.status, responseText));
	}

	return extractResponseText(responseText);
}
