import type { CooSettings, StreamCallbacks } from './types';

const API_URL = 'https://api.openai.com/v1/responses';

export interface ChatCompletionParams {
	settings: CooSettings;
	systemPrompt: string;
	userPrompt: string;
}

function buildRequestBody(params: ChatCompletionParams, stream: boolean): Record<string, unknown> {
	const { settings, systemPrompt, userPrompt } = params;

	const body: Record<string, unknown> = {
		model: settings.model,
		input: userPrompt,
		instructions: systemPrompt,
		stream,
	};

	if (settings.reasoningEffort !== 'none') {
		body.reasoning = { effort: settings.reasoningEffort };
	}

	if (settings.webSearchEnabled) {
		body.tools = [{ type: 'web_search' }];
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
			return 'Invalid API key. Please check your key in Coo settings.';
		case 429:
			return 'Rate limited by OpenAI. Please wait a moment and try again.';
		case 500:
		case 502:
		case 503:
			return 'OpenAI service error. Please try again later.';
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
			if (item.type === 'message' && item.content) {
				for (const block of item.content) {
					if (block.type === 'output_text' && block.text) {
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

async function apiFetch(apiKey: string, body: Record<string, unknown>): Promise<Response> {
	// eslint-disable-next-line no-restricted-globals -- requestUrl doesn't support streaming/Responses API
	return fetch(API_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${apiKey}`,
		},
		body: JSON.stringify(body),
	});
}

/**
 * Non-streaming response via Responses API.
 */
export async function chatCompletion(params: ChatCompletionParams): Promise<string> {
	if (!params.settings.apiKey) {
		throw new Error('API key not configured. Please set it in Coo settings.');
	}

	const body = buildRequestBody(params, false);
	const response = await apiFetch(params.settings.apiKey, body);
	const responseText = await response.text();

	if (!response.ok) {
		throw new Error(mapHttpError(response.status, responseText));
	}

	return extractResponseText(responseText);
}

/**
 * Streaming response via Responses API.
 */
export async function streamChatCompletion(
	params: ChatCompletionParams,
	callbacks: StreamCallbacks,
): Promise<void> {
	if (!params.settings.apiKey) {
		callbacks.onError(new Error('API key not configured. Please set it in Coo settings.'));
		return;
	}

	const body = buildRequestBody(params, true);

	let response: Response;
	try {
		response = await apiFetch(params.settings.apiKey, body);
	} catch {
		callbacks.onError(new Error('Network error. Please check your connection.'));
		return;
	}

	if (!response.ok) {
		const errorBody = await response.text().catch(() => '');
		console.error('[Coo] Stream error:', response.status, errorBody);
		callbacks.onError(new Error(mapHttpError(response.status, errorBody)));
		return;
	}

	const reader = response.body?.getReader();
	if (!reader) {
		callbacks.onError(new Error('Failed to read response stream.'));
		return;
	}

	const decoder = new TextDecoder();
	let fullText = '';
	let buffer = '';

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed || !trimmed.startsWith('data: ')) continue;

				const data = trimmed.slice(6);
				if (data === '[DONE]') {
					callbacks.onComplete(fullText);
					return;
				}

				try {
					const parsed = JSON.parse(data) as {
						type?: string;
						delta?: string;
					};

					if (parsed.type === 'response.output_text.delta' && parsed.delta) {
						fullText += parsed.delta;
						callbacks.onToken(parsed.delta);
					} else if (parsed.type === 'response.completed') {
						callbacks.onComplete(fullText);
						return;
					}
				} catch {
					// Skip malformed JSON chunks
				}
			}
		}

		callbacks.onComplete(fullText);
	} catch (err) {
		callbacks.onError(
			err instanceof Error ? err : new Error('Stream reading failed.')
		);
	}
}
