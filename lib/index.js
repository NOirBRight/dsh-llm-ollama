import z from "@deepseek-ai/schemastery";
import { CallId, EMPTY_RESPONSE_CODE, INVALID_CREDENTIAL_CODE, LlmAdapter, LlmError, ReasoningEffortId, RetryPolicySchema, assertUsableApiKey, attributionHeaders, contentHasImage, normalizeApiKey, resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import { deepEqualJson, installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { MAX_TIMER_DELAY_MS, idleWatchdog, timeoutOf } from "@deepseek-ai/dsh-timeout";
//#region lib/types/serialize.js
/**
* Serialize harness messages into Ollama native chat format. User text is joined;
* assistant text becomes `content`, reasoning blocks become `thinking`, tool
* calls become `tool_calls` (with `arguments` re-parsed from the raw JSON
* string to an object), and tool results become separate `{role: 'tool'}`
* messages keyed by `tool_name`. Assistant reasoning is replayed as `thinking`
* only on tool-call turns, matching Ollama's passback convention. Core image
* blocks are resolved to base64 through the attachment service for vision
* models; text-only models reject images before serialization. Unknown
* declaration-merged block types retain the adapter's documented extension
* fallback.
*
* @module dsh-llm-ollama/serialize
*/
/** Validate the adapter-owned effort before resolving its Ollama wire value. */
function reasoningEffort(effort) {
	if (effort === "off" || effort === "low" || effort === "medium" || effort === "high" || effort === "max") return effort;
	throw new LlmError(`Ollama does not support reasoning effort "${effort}"`, "UNSUPPORTED_REASONING_EFFORT");
}
/** Resolve the `think` wire value from the request effort and the model's thinking capability. */
function resolveThink(options, defaults) {
	if (defaults.thinking === false) return {};
	if (options.purpose === "session-title") return { think: false };
	const effort = options.reasoningEffort === void 0 ? void 0 : reasoningEffort(options.reasoningEffort);
	if (effort === void 0) return {};
	if (effort === "off") return { think: false };
	return { think: effort };
}
/** Join the text blocks of a message (used for user/tool-result content). */
function flattenText(blocks) {
	return blocks.filter((block) => block.type === "text").map((block) => block.text).join("");
}
/** Collect base64 images from image blocks, resolving bytes through the attachment service. */
async function collectImages(blocks, attachments) {
	const images = [];
	for (const block of blocks) if (block.type === "image") {
		const stored = await attachments.readImage(block.attachment);
		images.push(Buffer.from(stored.data).toString("base64"));
	}
	return images;
}
/** Serialize one assistant message (text + reasoning + tool calls). */
function serializeAssistant(message) {
	const text = flattenText(message.content);
	const thinking = message.content.filter((block) => block.type === "reasoning").map((block) => block.text).join("");
	const toolCalls = message.content.filter((block) => block.type === "tool-call").map((block) => {
		const toolCall = block;
		let parsed;
		try {
			parsed = JSON.parse(toolCall.arguments);
		} catch {
			parsed = {};
		}
		return { function: {
			name: toolCall.name,
			arguments: parsed
		} };
	});
	return {
		role: "assistant",
		content: text,
		...toolCalls.length > 0 && thinking.length > 0 ? { thinking } : {},
		...toolCalls.length > 0 ? { tool_calls: toolCalls } : {}
	};
}
/**
* Serialize the conversation into Ollama wire messages. Tool-result blocks
* become standalone `{role: 'tool'}` messages keyed by `tool_name`; the
* harness puts each tool result in its own user-role message, so a mixed
* user message contributes its text first and its tool results as separate
* wire messages after. The `callIdToName` map is maintained in-order so
* each tool result resolves its `tool_name` from the preceding tool-call.
* @param messages - the harness conversation, in order.
* @param attachments - durable byte resolver for image references; required when messages contain images.
* @returns the wire messages; order preserved, each tool result expanded into its own entry.
*/
async function serializeMessages(messages, attachments) {
	const wire = [];
	const callIdToName = /* @__PURE__ */ new Map();
	for (const message of messages) {
		if (message.role === "system") {
			wire.push({
				role: "system",
				content: flattenText(message.content)
			});
			continue;
		}
		if (message.role === "assistant") {
			for (const block of message.content) if (block.type === "tool-call") {
				const toolCall = block;
				callIdToName.set(String(toolCall.id), toolCall.name);
			}
			wire.push(serializeAssistant(message));
			continue;
		}
		const toolResults = message.content.filter((block) => block.type === "tool-result");
		const text = flattenText(message.content);
		if (contentHasImage(message.content)) {
			if (attachments === void 0) throw new LlmError("Ollama image input requires the durable attachment service", "UNSUPPORTED_CONTENT");
			const images = await collectImages(message.content, attachments);
			wire.push({
				role: "user",
				content: text,
				...images.length > 0 ? { images } : {}
			});
		} else if (text.length > 0 || toolResults.length === 0) wire.push({
			role: "user",
			content: text
		});
		for (const result of toolResults) {
			const toolResult = result;
			const toolName = callIdToName.get(String(toolResult.toolCallId));
			if (toolName === void 0) throw new LlmError(`Ollama cannot correlate tool result for call id "${toolResult.toolCallId}"; no preceding assistant tool-call carries that id`, "INVALID_HISTORY");
			wire.push({
				role: "tool",
				tool_name: toolName,
				content: flattenText(toolResult.content) || "(no output)"
			});
		}
	}
	return wire;
}
/**
* Build the full wire request. Always streaming (`stream: true`); optional
* fields are omitted rather than sent as null, so provider defaults apply.
* @param options - the harness request (model, history, system, tools, sampling).
* @param defaults - adapter-level thinking defaults; undefined fields put nothing on the wire.
* @param attachments - durable byte resolver for image references; required when messages contain images.
* @returns the `/api/chat` request body.
*/
async function serializeRequest(options, defaults = {}, attachments) {
	const messages = await serializeMessages(options.messages, attachments);
	if (options.system !== void 0) messages.unshift({
		role: "system",
		content: options.system
	});
	const tools = options.tools?.map((tool) => ({
		type: "function",
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters
		}
	}));
	const resolvedThink = resolveThink(options, defaults);
	const wireOptions = {
		...options.maxTokens === void 0 ? {} : { num_predict: options.maxTokens },
		...options.temperature === void 0 ? {} : { temperature: options.temperature },
		...options.stop === void 0 ? {} : { stop: options.stop }
	};
	return {
		model: options.model,
		messages,
		stream: true,
		...resolvedThink.think !== void 0 ? { think: resolvedThink.think } : {},
		...tools !== void 0 && tools.length > 0 ? { tools } : {},
		...Object.keys(wireOptions).length > 0 ? { options: wireOptions } : {}
	};
}
//#endregion
//#region lib/types/ndjson.js
/**
* Decode an NDJSON byte stream into individual JSON-serialized lines. Ollama
* streams `/api/chat` as newline-delimited JSON objects
* (`application/x-ndjson`), one per line; the terminal line carries
* `done: true`. Unlike SSE there is no `[DONE]` sentinel — the caller
* identifies the terminal chunk by parsing each line and checking `done`.
*
* A line may split across reads, including mid-UTF-8, so partial bytes are
* buffered until the next `\n`. A stream that ends without a final newline
* on a non-empty buffer yields the buffered text as a last line (the
* terminal chunk is still identified by `done: true` in the parsed JSON).
*
* @module dsh-llm-ollama/ndjson
*/
/**
* Parse an NDJSON byte stream into individual line strings. Each non-empty
* line is yielded in arrival order; empty lines (blank separators) are
* skipped. The caller parses each line as JSON.
* @param stream - raw NDJSON bytes; reads may split anywhere, including mid-UTF-8.
* @returns each non-empty line as a string, in arrival order.
*/
async function* parseNdjson(stream) {
	const decoder = new TextDecoder();
	const reader = stream.getReader();
	let buffer = "";
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			let newlineIndex;
			while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
				const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
				buffer = buffer.slice(newlineIndex + 1);
				if (line.length > 0) yield line;
			}
		}
		const tail = buffer.replace(/\r$/, "");
		if (tail.length > 0) yield tail;
	} finally {
		await reader.cancel().catch(() => {});
	}
}
/**
* Consume an NDJSON byte stream and yield parsed JSON objects, stopping after
* the terminal chunk (`done: true`). Throws `LlmError('STREAM_CLOSED')` when
* the stream ends without a `done: true` chunk (truncated response).
* @param stream - raw NDJSON bytes from `/api/chat`.
* @returns parsed `WireChatChunk` objects in arrival order, the terminal chunk last.
*/
async function* parseChatChunks(stream) {
	for await (const line of parseNdjson(stream)) {
		let chunk;
		try {
			chunk = JSON.parse(line);
		} catch {
			throw new LlmError(`malformed NDJSON line: ${line.slice(0, 120)}`, "MALFORMED_RESPONSE");
		}
		yield chunk;
		if (chunk.done) return;
	}
	throw new LlmError("Ollama NDJSON stream ended without a done chunk", "STREAM_CLOSED");
}
//#endregion
//#region lib/types/translate.js
/**
* Translate Ollama NDJSON chunks with one stateful harness block per content,
* reasoning, or tool-call. Ollama streams complete tool calls per chunk (not
* argument fragments), so each tool call opens a block, receives its full
* arguments in one delta, and closes at the terminal chunk. Finish reason and
* usage are deferred until the `done: true` chunk, ensuring no chunk follows
* `finish`.
*
* @module dsh-llm-ollama/translate
*/
/**
* Map the wire `done_reason` to the harness `FinishReason`. Ollama uses
* `"stop"` for both normal completion and tool-call turns, so the presence of
* tool-call blocks distinguishes them.
* @param reason - the wire `done_reason` string.
* @param hasToolCalls - whether any tool-call blocks were opened.
* @returns the mapped reason; unrecognized values become `{kind: 'error'}` with the uppercased value as `code`.
*/
function mapFinishReason(reason, hasToolCalls) {
	switch (reason) {
		case "stop": return hasToolCalls ? { kind: "tool-calls" } : { kind: "stop" };
		case "length": return { kind: "max-tokens" };
		default: return {
			kind: "error",
			failure: {
				message: `model stopped: ${reason}`,
				code: reason.toUpperCase()
			}
		};
	}
}
/**
* Map wire usage fields. Ollama reports `prompt_eval_count` (input) and
* `eval_count` (output) on the terminal chunk; there are no cache fields.
* @param chunk - the terminal NDJSON chunk.
* @returns disjoint harness counts.
*/
function mapUsage(chunk) {
	return {
		inputTokens: chunk.prompt_eval_count ?? 0,
		outputTokens: chunk.eval_count ?? 0
	};
}
/** Assemble the final `ContentBlock` for one open block. */
function closeBlock(block) {
	switch (block.kind) {
		case "text": return {
			type: "text",
			text: block.text
		};
		case "reasoning": return {
			type: "reasoning",
			text: block.text
		};
		case "tool-call": return {
			type: "tool-call",
			id: CallId(block.callId ?? ""),
			name: block.name ?? "",
			arguments: block.text
		};
	}
}
/**
* Consume parsed NDJSON chat chunks and yield `StreamChunk`s. The terminal
* chunk (`done: true`) flushes all `block-end`s, `usage`, and `finish`.
* @param chunks - parsed wire chunks from `parseChatChunks`.
* @returns deltas as they arrive; `block-end`s, `usage`, and `finish` are deferred to the `done: true` chunk.
*   A `stop` finish with no opened blocks is a degenerate provider completion and maps to an
*   `EMPTY_RESPONSE` error finish instead of a successful empty message.
*/
async function* translate(chunks) {
	let nextIndex = 0;
	let textBlock;
	let reasoningBlock;
	const toolBlocks = [];
	const order = [];
	let toolCallCounter = 0;
	const replayEntries = [];
	function open(kind) {
		const block = {
			index: nextIndex++,
			kind,
			text: ""
		};
		order.push(block);
		return block;
	}
	for await (const chunk of chunks) {
		const message = chunk.message;
		const thinking = message.thinking;
		if (typeof thinking === "string" && thinking.length > 0) {
			if (!reasoningBlock) {
				reasoningBlock = open("reasoning");
				yield {
					type: "block-start",
					index: reasoningBlock.index,
					blockType: "reasoning"
				};
			}
			reasoningBlock.text += thinking;
			yield {
				type: "reasoning-delta",
				index: reasoningBlock.index,
				text: thinking
			};
		}
		const content = message.content;
		if (typeof content === "string" && content.length > 0) {
			if (!textBlock) {
				textBlock = open("text");
				yield {
					type: "block-start",
					index: textBlock.index,
					blockType: "text"
				};
			}
			textBlock.text += content;
			yield {
				type: "text-delta",
				index: textBlock.index,
				text: content
			};
		}
		for (const call of message.tool_calls ?? []) {
			const callId = `ollama-call-${toolCallCounter++}`;
			const toolName = call.function.name;
			const argumentsJson = JSON.stringify(call.function.arguments);
			const block = open("tool-call");
			block.callId = callId;
			block.name = toolName;
			block.text = argumentsJson;
			toolBlocks.push(block);
			replayEntries.push({
				callId,
				toolName
			});
			yield {
				type: "block-start",
				index: block.index,
				blockType: "tool-call"
			};
			yield {
				type: "tool-call-delta",
				index: block.index,
				id: CallId(callId),
				name: toolName,
				argumentsDelta: argumentsJson
			};
		}
		if (chunk.done) {
			for (const block of order) yield {
				type: "block-end",
				index: block.index,
				block: closeBlock(block)
			};
			yield {
				type: "usage",
				usage: mapUsage(chunk)
			};
			const reason = mapFinishReason(chunk.done_reason ?? "stop", toolBlocks.length > 0);
			yield {
				type: "finish",
				reason: reason.kind === "stop" && order.length === 0 ? {
					kind: "error",
					failure: {
						message: "model returned a completed response with no content",
						code: EMPTY_RESPONSE_CODE
					}
				} : reason,
				...replayEntries.length > 0 ? { replayState: { callIds: replayEntries } } : {}
			};
			return;
		}
	}
	throw new LlmError("Ollama chunk stream ended without a done chunk", "STREAM_CLOSED");
}
//#endregion
//#region lib/types/client-contract.js
/** Browser-safe constants and JSON decoders shared by the Host and client plugin faces. */
/** Settings namespace owned by the Ollama Cloud plugin. */
const OLLAMA_SETTINGS_NAMESPACE = "llm-ollama";
/** Provider route owned by the Ollama Cloud plugin. */
const OLLAMA_PROVIDER = "ollama-cloud";
/** Credential reference used when the settings section names none. */
const DEFAULT_API_KEY_ENV = "OLLAMA_API_KEY";
/** Public Ollama Cloud native API base URL. */
const OLLAMA_PUBLIC_BASE_URL = "https://ollama.com/api";
/** Default context capacity for models without discovered metadata. */
const OLLAMA_DEFAULT_CONTEXT_WINDOW = 4096;
/** Default maximum idle interval while a stream read is outstanding. */
const OLLAMA_DEFAULT_STREAM_IDLE_TIMEOUT_MS = 3e5;
/** Private Connection RPC channel used by this package's two runtime faces. */
const OLLAMA_RPC_CHANNEL = "/ollama-cloud";
/** Rich model-discovery endpoint inside {@link OLLAMA_RPC_CHANNEL}. */
const OLLAMA_DISCOVER_ENDPOINT = "models/discover";
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function optionalPositiveInteger(value) {
	return value === void 0 || typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
/**
* Narrow one model crossing the settings or plugin-RPC JSON boundary.
* @param value - untrusted JSON value.
* @returns the validated model, or undefined when any field is invalid.
*/
function decodeOllamaCatalogModel(value) {
	if (!isRecord(value) || typeof value["id"] !== "string" || value["id"].length === 0) return void 0;
	const name = value["name"];
	const description = value["description"];
	const contextWindow = value["contextWindow"];
	const maxTokens = value["maxTokens"];
	const vision = value["vision"];
	const thinking = value["thinking"];
	const tools = value["tools"];
	if (name !== void 0 && typeof name !== "string") return void 0;
	if (description !== void 0 && typeof description !== "string") return void 0;
	if (!optionalPositiveInteger(contextWindow) || !optionalPositiveInteger(maxTokens)) return void 0;
	if (vision !== void 0 && typeof vision !== "boolean") return void 0;
	if (thinking !== void 0 && typeof thinking !== "boolean") return void 0;
	if (tools !== void 0 && typeof tools !== "boolean") return void 0;
	return {
		id: value["id"],
		...name === void 0 ? {} : { name },
		...description === void 0 ? {} : { description },
		...contextWindow === void 0 ? {} : { contextWindow },
		...maxTokens === void 0 ? {} : { maxTokens },
		...vision === void 0 ? {} : { vision },
		...thinking === void 0 ? {} : { thinking },
		...tools === void 0 ? {} : { tools }
	};
}
/**
* Narrow the redacted, schema-resolved settings section before it enters React state.
* @param value - untrusted settings response value.
* @returns the validated settings view, or undefined when the response is invalid.
*/
function decodeOllamaSettings(value) {
	if (!isRecord(value)) return void 0;
	const apiKeyEnv = value["apiKeyEnv"];
	const baseURL = value["baseURL"];
	const models = value["models"];
	const maxTokens = value["maxTokens"];
	const defaultContextWindow = value["defaultContextWindow"];
	const streamIdleTimeoutMs = value["streamIdleTimeoutMs"];
	if (typeof apiKeyEnv !== "string" || apiKeyEnv.length === 0) return void 0;
	if (typeof baseURL !== "string" || baseURL.length === 0) return void 0;
	if (!Array.isArray(models)) return void 0;
	if (!optionalPositiveInteger(maxTokens)) return void 0;
	if (!optionalPositiveInteger(defaultContextWindow) || defaultContextWindow === void 0) return void 0;
	if (typeof streamIdleTimeoutMs !== "number" || !Number.isFinite(streamIdleTimeoutMs) || streamIdleTimeoutMs <= 0) return;
	const decodedModels = [];
	for (const model of models) {
		const decoded = decodeOllamaCatalogModel(model);
		if (decoded === void 0) return void 0;
		decodedModels.push(decoded);
	}
	return {
		apiKeyEnv,
		baseURL,
		models: decodedModels,
		...maxTokens === void 0 ? {} : { maxTokens },
		defaultContextWindow,
		streamIdleTimeoutMs
	};
}
/**
* Narrow the rich discovery request received by the Host plugin.
* @param value - untrusted RPC request payload.
* @returns the validated request, or undefined when the payload is invalid.
*/
function decodeOllamaDiscoveryRequest(value) {
	if (!isRecord(value)) return void 0;
	const baseURL = value["baseURL"];
	const apiKey = value["apiKey"];
	if (baseURL !== void 0 && (typeof baseURL !== "string" || baseURL.length === 0)) return void 0;
	if (apiKey !== void 0 && typeof apiKey !== "string") return void 0;
	return {
		...baseURL === void 0 ? {} : { baseURL },
		...apiKey === void 0 ? {} : { apiKey }
	};
}
/**
* Narrow the rich discovery result received by the browser plugin.
* @param value - untrusted RPC result value.
* @returns the validated result, or undefined when any model is invalid.
*/
function decodeOllamaDiscoveryResult(value) {
	if (!isRecord(value) || !Array.isArray(value["models"])) return void 0;
	const models = [];
	for (const model of value["models"]) {
		const decoded = decodeOllamaCatalogModel(model);
		if (decoded === void 0) return void 0;
		models.push(decoded);
	}
	return { models };
}
//#endregion
//#region lib/types/discovery.js
/**
* Answering "which models can this Ollama Cloud endpoint serve?" for the
* configuration surface's "fetch available models" action.
*
* The native `/api/tags` endpoint lists every available cloud model, and
* `/api/show` discloses each model's context length and capabilities
* (vision, thinking, tools) — metadata the OpenAI-compatible `/v1/models`
* listing does not provide. This is why the adapter uses the native protocol
* for discovery rather than the OpenAI-compatible surface.
*
* Nothing here is stored: the request carries a draft the user is still
* editing, and the reply is candidate metadata the surface offers for
* adoption. `settings.yaml` remains the only thing that decides what a route
* serves.
*
* @module dsh-llm-ollama/discovery
*/
/** Endpoint replies larger than this are refused. */
const MAX_RESPONSE_BYTES = 4194304;
/** The public Ollama Cloud API base URL. */
const PUBLIC_BASE_URL = OLLAMA_PUBLIC_BASE_URL;
/**
* Read a reply body, refusing one that outgrows the ceiling. A declared length
* is checked first so an honest server is turned away without transferring
* anything; the accumulated total is what actually enforces the bound.
*/
async function readBounded(response, url) {
	const oversized = () => new LlmError(`${url} answered with more than ${MAX_RESPONSE_BYTES} bytes`, "DISCOVERY_FAILED");
	const declared = Number(response.headers.get("content-length") ?? NaN);
	if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
		await response.body?.cancel();
		throw oversized();
	}
	/* v8 ignore next -- fetch always exposes a body stream on a 2xx Response; the null guard is defensive. */
	if (response.body === null) return "";
	const reader = response.body.getReader();
	const chunks = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > MAX_RESPONSE_BYTES) throw oversized();
			chunks.push(value);
		}
	} finally {
		/* v8 ignore next 4 -- cancel() after a completed or abandoned read settles without rejecting; unobserved best-effort cleanup. */
		await reader.cancel().catch(() => {});
	}
	const body = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(body);
}
/** Accept one probe key, or refuse it before the header is built. */
function usableProbeKey(raw) {
	const checked = normalizeApiKey(raw);
	if (checked.ok) return checked.value;
	throw new LlmError(checked.reason === "empty" ? "this provider's API key is blank; enter it in Plugin configuration, or clear it to probe unauthenticated" : "this provider's API key contains characters no HTTP header can carry; paste the raw key only", INVALID_CREDENTIAL_CODE);
}
/** Build the bearer headers for a discovery request. */
function authHeaders(apiKey) {
	return {
		accept: "application/json",
		...apiKey === void 0 ? {} : { authorization: `Bearer ${apiKey}` },
		...attributionHeaders()
	};
}
/** Two attempts make the idempotent tags probe tolerate one transient transport failure. */
const TAGS_NETWORK_ATTEMPTS = 2;
/** Describe a transport failure without including request headers or credentials. */
function networkDetail(error) {
	if (!(error instanceof Error)) return "";
	const cause = typeof error.cause === "object" && error.cause !== null ? error.cause : void 0;
	const code = cause !== void 0 && "code" in cause && typeof cause.code === "string" ? cause.code : void 0;
	const message = error.message.length === 0 ? "" : `: ${error.message}`;
	return code === void 0 ? message : `${message} (${code})`;
}
/** Fetch the idempotent tags listing, retrying one transport-level failure. */
async function fetchTags(url, headers, signal) {
	let failure;
	for (let attempt = 0; attempt < TAGS_NETWORK_ATTEMPTS; attempt += 1) try {
		return await fetch(url, {
			method: "GET",
			headers,
			...signal === void 0 ? {} : { signal }
		});
	} catch (error) {
		if (signal?.aborted) throw new LlmError("model discovery aborted by caller", "ABORTED", { cause: error });
		failure = error;
	}
	throw new LlmError(`could not reach ${url}${networkDetail(failure)}`, "DISCOVERY_FAILED", { cause: failure });
}
/**
* Extract the context window from a `/api/show` response. Scans `model_info`
* for any `*.context_length` key (e.g. `gemma3.context_length`,
* `llama.context_length`), and also parses `parameters` for a `num_ctx`
* line — preferring the `parameters` value when both are present, because a
* Modelfile-level `PARAMETER num_ctx` overrides the base model's context
* length ([issue #16188](https://github.com/ollama/ollama/issues/16188)).
* @param show - the `/api/show` response.
* @returns the context window in tokens, or `undefined` when neither source discloses one.
*/
function extractContextWindow(show) {
	const paramCtx = parseNumCtx(show.parameters);
	if (paramCtx !== void 0) return paramCtx;
	if (show.model_info !== void 0) {
		for (const [key, value] of Object.entries(show.model_info)) if (key.endsWith(".context_length") && typeof value === "number" && Number.isInteger(value) && value > 0) return value;
	}
}
/** Parse `num_ctx <value>` from a parameters string. */
function parseNumCtx(parameters) {
	if (parameters === void 0) return void 0;
	const match = parameters.match(/num_ctx\s+(\d+)/);
	if (match === null) return void 0;
	const value = Number(match[1]);
	return Number.isInteger(value) && value > 0 ? value : void 0;
}
/** Capability strings reported by `/api/show` and `/api/tags`. */
const CAPABILITY_VISION = "vision";
const CAPABILITY_THINKING = "thinking";
const CAPABILITY_TOOLS = "tools";
/**
* Extract native capability flags from one `/api/show` response.
* @param capabilities - capability names returned by Ollama.
* @returns explicit vision, thinking, and tools flags.
*/
function extractCapabilities(capabilities) {
	const set = new Set(capabilities ?? []);
	return {
		vision: set.has(CAPABILITY_VISION),
		thinking: set.has(CAPABILITY_THINKING),
		tools: set.has(CAPABILITY_TOOLS)
	};
}
/**
* Interrogate one Ollama Cloud endpoint for the models it advertises.
* Calls `GET /api/tags` to list models, then `POST /api/show` per model to
* extract context length and capabilities.
* @param request - the endpoint and one-shot credential to use.
* @param storedApiKey - the credential the named route already stored, asked
*   for only when the draft carries none.
* @returns advertised models with context windows and native capability flags in endpoint order.
* @throws LlmError when the endpoint refuses or fails the request, or the reply is not a model listing.
*/
async function discoverModels(request, storedApiKey) {
	const baseURL = (request.baseURL ?? PUBLIC_BASE_URL).replace(/\/+$/, "");
	const supplied = request.apiKey ?? await storedApiKey?.();
	const apiKey = supplied === void 0 ? void 0 : usableProbeKey(supplied);
	const tagsUrl = `${baseURL}/tags`;
	const tagsResponse = await fetchTags(tagsUrl, authHeaders(apiKey), request.signal);
	if (!tagsResponse.ok) throw new LlmError(`${tagsUrl} answered ${tagsResponse.status}${tagsResponse.status === 401 || tagsResponse.status === 403 ? "; check the API key" : ""}`, "DISCOVERY_FAILED");
	let tagsText;
	try {
		tagsText = await readBounded(tagsResponse, tagsUrl);
	} catch (error) {
		if (request.signal?.aborted) throw new LlmError("model discovery aborted by caller", "ABORTED", { cause: error });
		throw error;
	}
	let tagsBody;
	try {
		tagsBody = JSON.parse(tagsText);
	} catch (error) {
		throw new LlmError(`${tagsUrl} did not answer with JSON`, "DISCOVERY_FAILED", { cause: error });
	}
	if (!Array.isArray(tagsBody.models)) throw new LlmError(`${tagsUrl} response has no "models" array`, "DISCOVERY_FAILED");
	const models = [];
	for (const tag of tagsBody.models) {
		const id = tag.model ?? tag.name;
		if (typeof id !== "string" || id.length === 0) continue;
		const showUrl = `${baseURL}/show`;
		let showResponse;
		try {
			showResponse = await fetch(showUrl, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					...authHeaders(apiKey)
				},
				body: JSON.stringify({ model: id }),
				...request.signal === void 0 ? {} : { signal: request.signal }
			});
		} catch (error) {
			if (request.signal?.aborted) throw new LlmError("model discovery aborted by caller", "ABORTED", { cause: error });
			models.push({
				id,
				...tag.name !== void 0 && tag.name !== id ? { name: tag.name } : {}
			});
			continue;
		}
		if (!showResponse.ok) {
			models.push({
				id,
				...tag.name !== void 0 && tag.name !== id ? { name: tag.name } : {}
			});
			continue;
		}
		let showText;
		try {
			showText = await readBounded(showResponse, showUrl);
		} catch {
			models.push({
				id,
				...tag.name !== void 0 && tag.name !== id ? { name: tag.name } : {}
			});
			continue;
		}
		let showBody;
		try {
			showBody = JSON.parse(showText);
		} catch {
			models.push({
				id,
				...tag.name !== void 0 && tag.name !== id ? { name: tag.name } : {}
			});
			continue;
		}
		const contextWindow = extractContextWindow(showBody);
		const capabilities = extractCapabilities(showBody.capabilities);
		models.push({
			id,
			...tag.name !== void 0 && tag.name !== id ? { name: tag.name } : {},
			...contextWindow === void 0 ? {} : { contextWindow },
			...capabilities
		});
	}
	return models;
}
//#endregion
//#region lib/types/adapter.js
/**
* `OllamaAdapter`: fetch + NDJSON against an Ollama Cloud `/api/chat` endpoint,
* emitting harness `StreamChunk`s. The adapter is transport-only: connection
* facts arrive through a thunk resolved once per operation and the bearer
* token through a per-request resolver, so the registering plugin owns
* validation, layering, and credential policy.
*
* @module dsh-llm-ollama/adapter
*/
var __addDisposableResource = function(env, value, async) {
	if (value !== null && value !== void 0) {
		if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
		var dispose, inner;
		if (async) {
			if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
			dispose = value[Symbol.asyncDispose];
		}
		if (dispose === void 0) {
			if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
			dispose = value[Symbol.dispose];
			if (async) inner = dispose;
		}
		if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
		if (inner) dispose = function() {
			try {
				inner.call(this);
			} catch (e) {
				return Promise.reject(e);
			}
		};
		env.stack.push({
			value,
			dispose,
			async
		});
	} else if (async) env.stack.push({ async: true });
	return value;
};
var __disposeResources = (function(SuppressedError) {
	return function(env) {
		function fail(e) {
			env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
			env.hasError = true;
		}
		var r, s = 0;
		function next() {
			while (r = env.stack.pop()) try {
				if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
				if (r.dispose) {
					var result = r.dispose.call(r.value);
					if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) {
						fail(e);
						return next();
					});
				} else s |= 1;
			} catch (e) {
				fail(e);
			}
			if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
			if (env.hasError) throw env.error;
		}
		return next();
	};
})(typeof SuppressedError === "function" ? SuppressedError : function(error, suppressed, message) {
	var e = new Error(message);
	return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
/** Default maximum idle interval while an adapter stream read is outstanding. */
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = OLLAMA_DEFAULT_STREAM_IDLE_TIMEOUT_MS;
/** Default combined request/response context capacity. */
const DEFAULT_CONTEXT_WINDOW = OLLAMA_DEFAULT_CONTEXT_WINDOW;
const STREAM_IDLE_TIMEOUT_CODE = "LLM_STREAM_IDLE_TIMEOUT";
const OFF_EFFORT = ReasoningEffortId("off");
const LOW_EFFORT = ReasoningEffortId("low");
const MEDIUM_EFFORT = ReasoningEffortId("medium");
const HIGH_EFFORT = ReasoningEffortId("high");
const MAX_EFFORT = ReasoningEffortId("max");
const ALL_REASONING_EFFORTS = [
	{
		id: OFF_EFFORT,
		name: "Off"
	},
	{
		id: LOW_EFFORT,
		name: "Low"
	},
	{
		id: MEDIUM_EFFORT,
		name: "Medium"
	},
	{
		id: HIGH_EFFORT,
		name: "High"
	},
	{
		id: MAX_EFFORT,
		name: "Max"
	}
];
function modelInfo(provider, model) {
	const inputModalities = model.vision === true ? ["text", "image"] : ["text"];
	return {
		provider,
		id: model.id,
		name: model.name ?? model.id,
		...model.description === void 0 ? {} : { description: model.description },
		inputModalities
	};
}
/**
* Map an HTTP status to a stable LlmError code.
* @param status - status of a non-2xx provider response.
* @param error - parsed provider error body, when available.
* @returns the normalized harness error code.
*/
function httpErrorCode(status, error) {
	if (status === 401 || status === 403) return "AUTH";
	if (status === 429) return "RATE_LIMIT";
	if (status === 400) return "INVALID_REQUEST";
	if (status >= 500) return "SERVER";
	return `HTTP_${status}`;
}
/**
* The Ollama Cloud native chat adapter. One instance serves every model name
* it was registered under (the harness model name IS the wire model name).
*
* One stable signal reaches both initial fetch and body reads. Caller aborts
* map to `ABORTED`; the configured per-read idle watchdog maps to `TIMEOUT`.
*/
var OllamaAdapter = class extends LlmAdapter {
	config;
	constructor(config) {
		super();
		this.config = config;
	}
	providerInfo(provider) {
		return {
			id: provider,
			name: "Ollama Cloud"
		};
	}
	providerRetryPolicy(_provider) {
		return this.config.options().retryPolicy;
	}
	listModels(provider) {
		return Promise.resolve(this.config.options().models.map((model) => modelInfo(provider, model)));
	}
	resolveModel(provider, model, _signal) {
		const connection = this.config.options();
		const configured = connection.models.find((entry) => entry.id === model);
		const contextWindow = configured?.contextWindow ?? connection.defaultContextWindow;
		const inputModalities = configured?.vision === true ? ["text", "image"] : ["text"];
		const defaultMaxTokens = configured?.maxTokens ?? connection.maxTokens;
		return Promise.resolve({
			...configured === void 0 ? {
				provider,
				id: model,
				name: model,
				inputModalities
			} : modelInfo(provider, configured),
			context: { contextWindow },
			...defaultMaxTokens !== void 0 ? { defaultMaxTokens } : {},
			...configured?.thinking === true ? { reasoning: {
				efforts: ALL_REASONING_EFFORTS,
				defaultEffort: HIGH_EFFORT
			} } : {}
		});
	}
	async *stream(options) {
		const env_1 = {
			stack: [],
			error: void 0,
			hasError: false
		};
		try {
			const connection = this.config.options();
			const apiKey = await this.config.resolveApiKey(connection);
			const consumer = new AbortController();
			const upstream = options.signal === void 0 ? consumer.signal : AbortSignal.any([options.signal, consumer.signal]);
			const watchdog = __addDisposableResource(env_1, idleWatchdog(upstream, connection.streamIdleTimeoutMs, STREAM_IDLE_TIMEOUT_CODE), false);
			const iterator = this.request(options, watchdog.signal, connection, apiKey, () => {
				watchdog.pulse();
			})[Symbol.asyncIterator]();
			let exhausted = false;
			try {
				while (true) {
					const result = await watchdog.next(iterator);
					if (result.done) {
						exhausted = true;
						return;
					}
					yield result.value;
				}
			} catch (error) {
				if (timeoutOf(watchdog.signal, STREAM_IDLE_TIMEOUT_CODE) !== void 0) throw new LlmError(`Ollama stream idle timeout after ${connection.streamIdleTimeoutMs}ms`, "TIMEOUT", { cause: error });
				if (options.signal?.aborted) throw new LlmError("Ollama request aborted by caller", "ABORTED", { cause: error });
				if (error instanceof LlmError) throw error;
				throw new LlmError(`Ollama API stream from ${connection.baseURL} failed`, "TRANSPORT", { cause: error });
			} finally {
				consumer.abort("Ollama stream consumer stopped");
				if (!exhausted && iterator.return !== void 0) try {
					await iterator.return();
				} catch (_abortedTransportTeardown) {}
			}
		} catch (e_1) {
			env_1.error = e_1;
			env_1.hasError = true;
		} finally {
			__disposeResources(env_1);
		}
	}
	async *request(options, signal, connection, apiKey, onChunk) {
		const configured = connection.models.find((entry) => entry.id === options.model);
		const containsImage = options.messages.some((message) => contentHasImage(message.content));
		if (containsImage && configured?.vision !== true) throw new LlmError(`Ollama model "${options.model}" does not support image input`, "UNSUPPORTED_CONTENT");
		const attachments = containsImage ? this.config.resolveAttachments?.() : void 0;
		if (containsImage && attachments === void 0) throw new LlmError("Ollama image input requires the durable attachment service", "UNSUPPORTED_CONTENT");
		const body = await serializeRequest(options, { thinking: configured?.thinking }, attachments);
		const payload = JSON.stringify(body);
		const headers = {
			"authorization": `Bearer ${apiKey}`,
			"content-type": "application/json",
			"accept": "application/x-ndjson",
			...attributionHeaders()
		};
		let response;
		try {
			response = await fetch(`${connection.baseURL}/chat`, {
				method: "POST",
				headers,
				body: payload,
				signal
			});
		} catch (error) {
			if (signal.aborted) throw error;
			throw new LlmError(`Ollama API request to ${connection.baseURL} failed`, "TRANSPORT", { cause: error });
		}
		if (!response.ok) {
			let message = `Ollama API error (HTTP ${response.status})`;
			let providerError;
			try {
				providerError = await response.json();
				if (providerError.error) message = providerError.error;
			} catch {}
			throw new LlmError(message, httpErrorCode(response.status, providerError), { status: response.status });
		}
		if (!response.body) throw new LlmError("Ollama API returned no response body", "EMPTY_RESPONSE");
		const chunks = parseChatChunks(response.body);
		const pulsed = async function* () {
			for await (const chunk of chunks) {
				onChunk();
				yield chunk;
			}
		};
		yield* translate(pulsed());
	}
};
//#endregion
//#region lib/types/index.js
/**
* Register an {@link OllamaAdapter} for the `ollama-cloud` provider route on
* `ctx.llm`, with connection facts resolved per request instead of frozen at
* load: the plugin layers its `cordis.yml` entry config under the optional
* `llm-ollama` user-settings section (`ctx.settings`) and resolves the API
* key through the optional credential seam (`ctx.credentials`), so a changed
* base URL, catalog, or key reaches the very next request without restarting
* anything, while an in-flight stream keeps the facts it started with. The
* one registration-captured fact — the retry policy — re-registers the route
* in place when it changes.
*
* The plugin also registers a model discovery handler that interrogates
* `/api/tags` + `/api/show` for the configuration surface's "fetch available
* models" action, returning context windows and capability metadata the
* OpenAI-compatible `/v1/models` listing does not provide.
* @module dsh-llm-ollama
*/
const name = "llm-ollama";
const inject = ["llm"];
const NS = settingsNamespace(OLLAMA_SETTINGS_NAMESPACE);
const catalogModel = z.object({
	id: z.string().required(),
	name: z.string(),
	description: z.string(),
	contextWindow: z.number().step(1).min(1),
	maxTokens: z.number().step(1).min(1),
	vision: z.boolean(),
	thinking: z.boolean(),
	tools: z.boolean()
});
const Config = z.object({
	apiKeyEnv: z.string().role("credential-ref").default(DEFAULT_API_KEY_ENV),
	baseURL: z.string().default(PUBLIC_BASE_URL),
	models: z.array(catalogModel).default([]),
	maxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER),
	defaultContextWindow: z.number().step(1).min(1).default(DEFAULT_CONTEXT_WINDOW),
	streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
	retryPolicy: RetryPolicySchema
});
/** Resolve, validate, and detach the advisory model catalog. */
function resolveModels(models) {
	const seen = /* @__PURE__ */ new Set();
	return (models ?? []).map((model) => {
		if (model.id.length === 0) throw new Error("llm-ollama: catalog model ids must be non-empty");
		if (model.name !== void 0 && model.name.length === 0) throw new Error(`llm-ollama: catalog model "${model.id}" has an empty name`);
		if (model.contextWindow !== void 0 && (!Number.isInteger(model.contextWindow) || model.contextWindow <= 0)) throw new Error(`llm-ollama: catalog model "${model.id}" contextWindow must be a positive integer`);
		if (model.maxTokens !== void 0 && (!Number.isInteger(model.maxTokens) || model.maxTokens <= 0)) throw new Error(`llm-ollama: catalog model "${model.id}" maxTokens must be a positive integer`);
		if (seen.has(model.id)) throw new Error(`llm-ollama: duplicate catalog model "${model.id}"`);
		seen.add(model.id);
		return {
			id: model.id,
			...model.name === void 0 ? {} : { name: model.name },
			...model.description === void 0 ? {} : { description: model.description },
			...model.contextWindow === void 0 ? {} : { contextWindow: model.contextWindow },
			...model.maxTokens === void 0 ? {} : { maxTokens: model.maxTokens },
			...model.vision === void 0 ? {} : { vision: model.vision },
			...model.thinking === void 0 ? {} : { thinking: model.thinking },
			...model.tools === void 0 ? {} : { tools: model.tools }
		};
	});
}
/**
* The one explicit resolve step from raw config to validated connection facts.
* @param config - raw plugin config or resolved settings snapshot.
* @returns validated connection facts plus the credential reference.
*/
function resolveAdapterOptions(config) {
	if (config.defaultContextWindow !== void 0 && (!Number.isInteger(config.defaultContextWindow) || config.defaultContextWindow <= 0)) throw new Error("llm-ollama: defaultContextWindow must be a positive integer");
	if (config.maxTokens !== void 0 && (!Number.isSafeInteger(config.maxTokens) || config.maxTokens <= 0)) throw new Error("llm-ollama: maxTokens must be a positive safe integer");
	const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS;
	if (!Number.isFinite(streamIdleTimeoutMs) || streamIdleTimeoutMs <= 0 || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) throw new Error(`llm-ollama: streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`);
	return {
		apiKeyEnv: credentialRef(config.apiKeyEnv ?? "OLLAMA_API_KEY"),
		baseURL: config.baseURL ?? PUBLIC_BASE_URL,
		models: resolveModels(config.models),
		defaultContextWindow: config.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW,
		maxTokens: config.maxTokens,
		streamIdleTimeoutMs,
		retryPolicy: resolveRetryPolicy(config.retryPolicy, "llm-ollama: retryPolicy")
	};
}
function discoveryFailure(message, baseURL) {
	return {
		ok: false,
		error: {
			code: "model-discovery-failed",
			message,
			details: {
				settingsNs: OLLAMA_SETTINGS_NAMESPACE,
				...baseURL === void 0 ? {} : { baseURL }
			}
		}
	};
}
function apply(ctx, config) {
	let current = () => config;
	let lastRaw;
	let lastGood;
	const options = () => {
		const raw = current();
		if (raw === lastRaw && lastGood !== void 0) return lastGood;
		try {
			const next = resolveAdapterOptions(raw);
			lastRaw = raw;
			lastGood = next;
			return next;
		} catch (error) {
			if (lastGood === void 0) throw error;
			lastRaw = raw;
			ctx.logger.error("llm-ollama: keeping the last good configuration after an invalid settings section");
			ctx.logger.error(error);
			return lastGood;
		}
	};
	options();
	const resolveApiKey = async (connection) => {
		const ref = connection.apiKeyEnv;
		const credentials = ctx.get("credentials");
		if (credentials !== void 0) {
			const hit = await credentials.resolve(ref);
			if (hit !== void 0) return assertUsableApiKey(hit.value, "llm-ollama", ref);
		} else {
			const ambient = launchEnvironmentOf(ctx).get(ref);
			if (ambient !== void 0 && ambient.value.length > 0) return assertUsableApiKey(ambient.value, "llm-ollama", ref);
		}
		throw new LlmError(`llm-ollama: no API key for provider route "${OLLAMA_PROVIDER}"; store ${ref} through the credentials service (the web Models page writes it), or export ${ref} in the launching environment`, "MISSING_CREDENTIAL");
	};
	const adapter = new OllamaAdapter({
		options,
		resolveApiKey,
		resolveAttachments: () => ctx.get("attachments")
	});
	ctx.llm.registerConfigurableProviders([{
		provider: OLLAMA_PROVIDER,
		displayName: "Ollama Cloud",
		settingsNs: NS,
		settingsPath: []
	}]);
	const registration = ctx.llm.registerAdapter([OLLAMA_PROVIDER], adapter);
	let registeredPolicy = options().retryPolicy;
	const ensureRegistrationFacts = () => {
		const policy = options().retryPolicy;
		if (deepEqualJson(policy, registeredPolicy)) return;
		registration.replace([OLLAMA_PROVIDER]);
		registeredPolicy = policy;
	};
	const storedApiKey = async () => {
		const ref = options().apiKeyEnv;
		const credentials = ctx.get("credentials");
		if (credentials !== void 0) return (await credentials.resolve(ref))?.value;
		return launchEnvironmentOf(ctx).get(ref)?.value;
	};
	ctx.llm.registerModelDiscovery(NS, (request) => discoverModels(request, storedApiKey));
	ctx.inject(["connection"], (connectionCtx) => {
		connectionCtx.connection.rpc.handle(OLLAMA_RPC_CHANNEL, async (endpoint, payload, signal) => {
			if (endpoint !== "models/discover") return discoveryFailure(`unknown Ollama Cloud endpoint: ${endpoint}`);
			const request = decodeOllamaDiscoveryRequest(payload);
			if (request === void 0) return discoveryFailure("invalid Ollama Cloud discovery request");
			try {
				return {
					ok: true,
					value: { models: await discoverModels({
						...request,
						signal
					}, storedApiKey) }
				};
			} catch (error) {
				return discoveryFailure(error instanceof LlmError ? error.message : "Ollama Cloud model discovery failed", request.baseURL);
			}
		}, { authority: "loopback" });
	});
	installSettingsSection(ctx, NS, Config, config, {
		setSource: (source) => {
			current = source;
		},
		onChange: ensureRegistrationFacts
	});
}
//#endregion
export { Config, DEFAULT_API_KEY_ENV, DEFAULT_CONTEXT_WINDOW, DEFAULT_STREAM_IDLE_TIMEOUT_MS, OLLAMA_DISCOVER_ENDPOINT, OLLAMA_PROVIDER, OLLAMA_PUBLIC_BASE_URL, OLLAMA_RPC_CHANNEL, OLLAMA_SETTINGS_NAMESPACE, OllamaAdapter, PUBLIC_BASE_URL, apply, decodeOllamaCatalogModel, decodeOllamaDiscoveryRequest, decodeOllamaDiscoveryResult, decodeOllamaSettings, discoverModels, extractCapabilities, extractContextWindow, inject, name, resolveAdapterOptions };
