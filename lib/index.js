import z from "@deepseek-ai/schemastery";
import { INVALID_CREDENTIAL_CODE, LlmAdapter, LlmError, RetryPolicySchema, assertUsableApiKey, attributionHeaders, normalizeApiKey, resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import { deepEqualJson, installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { MAX_TIMER_DELAY_MS } from "@deepseek-ai/dsh-timeout";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import { createProvider } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { WebError } from "@deepseek-ai/dsh-web";
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
const OLLAMA_DEFAULT_CONTEXT_WINDOW = 262144;
/** Default maximum idle interval while a stream read is outstanding. */
const OLLAMA_DEFAULT_STREAM_IDLE_TIMEOUT_MS = 3e5;
/** Private Connection RPC channel used by this package's two runtime faces. */
const OLLAMA_RPC_CHANNEL = "/ollama-cloud";
/** Rich model-discovery endpoint inside {@link OLLAMA_RPC_CHANNEL}. */
const OLLAMA_DISCOVER_ENDPOINT = "models/discover";
/** Atomic settings-save endpoint inside {@link OLLAMA_RPC_CHANNEL}. */
const OLLAMA_SAVE_ENDPOINT = "settings/save";
/** Cloud usage-snapshot endpoint inside {@link OLLAMA_RPC_CHANNEL}. */
const OLLAMA_USAGE_ENDPOINT = "usage/read";
function isRecord$1(value) {
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
	if (!isRecord$1(value) || typeof value["id"] !== "string" || value["id"].length === 0) return void 0;
	const name = value["name"];
	const description = value["description"];
	const contextWindow = value["contextWindow"];
	const maxTokens = value["maxTokens"];
	const vision = value["vision"];
	const thinking = value["thinking"];
	const defaultEffort = value["defaultEffort"];
	const tools = value["tools"];
	if (name !== void 0 && typeof name !== "string") return void 0;
	if (description !== void 0 && typeof description !== "string") return void 0;
	if (!optionalPositiveInteger(contextWindow) || !optionalPositiveInteger(maxTokens)) return void 0;
	if (vision !== void 0 && typeof vision !== "boolean") return void 0;
	if (thinking !== void 0 && typeof thinking !== "boolean") return void 0;
	if (defaultEffort !== void 0 && (typeof defaultEffort !== "string" || defaultEffort.length === 0)) return;
	if (tools !== void 0 && typeof tools !== "boolean") return void 0;
	return {
		id: value["id"],
		...name === void 0 ? {} : { name },
		...description === void 0 ? {} : { description },
		...contextWindow === void 0 ? {} : { contextWindow },
		...maxTokens === void 0 ? {} : { maxTokens },
		...vision === void 0 ? {} : { vision },
		...thinking === void 0 ? {} : { thinking },
		...defaultEffort === void 0 ? {} : { defaultEffort },
		...tools === void 0 ? {} : { tools }
	};
}
/**
* Narrow the redacted, schema-resolved settings section before it enters React state.
* @param value - untrusted settings response value.
* @returns the validated settings view, or undefined when the response is invalid.
*/
function decodeOllamaSettings(value) {
	if (!isRecord$1(value)) return void 0;
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
	if (!isRecord$1(value)) return void 0;
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
	if (!isRecord$1(value) || !Array.isArray(value["models"])) return void 0;
	const models = [];
	for (const model of value["models"]) {
		const decoded = decodeOllamaCatalogModel(model);
		if (decoded === void 0) return void 0;
		models.push(decoded);
	}
	return { models };
}
/**
* Narrow one usage window crossing the plugin RPC.
* @param value - untrusted JSON value.
* @returns the validated window, or undefined when any field is invalid.
*/
function decodeOllamaUsageWindow(value) {
	if (!isRecord$1(value)) return void 0;
	const usage = value["usage"];
	if (typeof usage !== "number" || !Number.isFinite(usage) || usage < 0) return void 0;
	const modelsValue = value["models"];
	const models = [];
	if (modelsValue !== void 0) {
		if (!Array.isArray(modelsValue)) return void 0;
		for (const entry of modelsValue) {
			if (!isRecord$1(entry) || typeof entry["name"] !== "string" || entry["name"].length === 0) return void 0;
			const requestCount = entry["requestCount"];
			if (typeof requestCount !== "number" || !Number.isSafeInteger(requestCount) || requestCount < 0) return;
			models.push({
				name: entry["name"],
				requestCount
			});
		}
	}
	return {
		usage,
		models
	};
}
/**
* Narrow one usage snapshot.
* @param value - untrusted JSON value.
* @returns the validated snapshot, or undefined when it is malformed.
*/
function decodeOllamaUsageView(value) {
	if (!isRecord$1(value)) return void 0;
	if (typeof value["fetchedAt"] !== "string" || value["fetchedAt"].length === 0) return void 0;
	const session = value["session"] === void 0 ? void 0 : decodeOllamaUsageWindow(value["session"]);
	const weekly = value["weekly"] === void 0 ? void 0 : decodeOllamaUsageWindow(value["weekly"]);
	if (value["session"] !== void 0 && session === void 0) return void 0;
	if (value["weekly"] !== void 0 && weekly === void 0) return void 0;
	if (session === void 0 && weekly === void 0) return void 0;
	return {
		fetchedAt: value["fetchedAt"],
		...session === void 0 ? {} : { session },
		...weekly === void 0 ? {} : { weekly }
	};
}
/**
* Narrow the usage reply returned by the Host usage endpoint.
* @param value - untrusted RPC result value.
* @returns the validated reply, or undefined when it is malformed.
*/
function decodeOllamaUsageReply(value) {
	if (!isRecord$1(value)) return void 0;
	if (value["status"] === "unsupported") return { status: "unsupported" };
	if (value["status"] !== "ok") return void 0;
	const usage = decodeOllamaUsageView(value["usage"]);
	return usage === void 0 ? void 0 : {
		status: "ok",
		usage
	};
}
/**
* Narrow one atomic settings-save request crossing the plugin RPC.
* @param value - untrusted RPC payload.
* @returns the validated request, or undefined when any field is invalid.
*/
function decodeOllamaSaveRequest(value) {
	if (!isRecord$1(value) || typeof value["baseURL"] !== "string" || value["baseURL"].length === 0) return void 0;
	if (!Array.isArray(value["models"]) || !Number.isSafeInteger(value["expectedRevision"])) return void 0;
	const expectedRevision = value["expectedRevision"];
	if (expectedRevision < 0) return void 0;
	const models = [];
	for (const model of value["models"]) {
		const decoded = decodeOllamaCatalogModel(model);
		if (decoded === void 0) return void 0;
		models.push(decoded);
	}
	return {
		baseURL: value["baseURL"],
		models,
		expectedRevision
	};
}
/**
* Narrow the accepted settings snapshot returned by the Host save endpoint.
* @param value - untrusted RPC result value.
* @returns the validated result, or undefined when it is malformed.
*/
function decodeOllamaSaveResult(value) {
	if (!isRecord$1(value) || !Number.isSafeInteger(value["revision"])) return void 0;
	const revision = value["revision"];
	const settings = decodeOllamaSettings(value["settings"]);
	if (revision < 0 || settings === void 0) return void 0;
	return {
		settings,
		revision
	};
}
//#endregion
//#region lib/types/discovery.js
/**
* Answering "which models can this Ollama Cloud endpoint serve?" for the
* configuration surface's "fetch available models" action.
*
* The native `/api/tags` endpoint supplies the model listing; `/api/show`
* then discloses each model's context length and capabilities (vision,
* thinking, tools), which the OpenAI-compatible `/v1/models` listing does
* not provide.
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
/** Maximum concurrent `/api/show` reads during one discovery operation. */
const SHOW_CONCURRENCY = 6;
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
function usableProbeKey$1(raw) {
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
* Deduplicate native tag rows, retaining the first row for each id.
* @param tags - rows returned by the native tags endpoint.
* @returns unique rows in native tag order.
*/
function uniqueTagModels(tags) {
	const unique = [];
	const seen = /* @__PURE__ */ new Set();
	for (const tag of tags) {
		const id = tag.model ?? tag.name;
		if (id === void 0 || id.length === 0 || seen.has(id)) continue;
		seen.add(id);
		unique.push(tag);
	}
	return unique;
}
/** Enrich one tags entry, retaining its id when `/api/show` cannot answer. */
async function discoverTaggedModel(tag, baseURL, apiKey, signal) {
	const id = tag.model ?? tag.name;
	if (typeof id !== "string" || id.length === 0) return void 0;
	const fallback = {
		id,
		...tag.name !== void 0 && tag.name !== id ? { name: tag.name } : {}
	};
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
			...signal === void 0 ? {} : { signal }
		});
	} catch (error) {
		if (signal?.aborted) throw new LlmError("model discovery aborted by caller", "ABORTED", { cause: error });
		return fallback;
	}
	if (!showResponse.ok) return fallback;
	let showText;
	try {
		showText = await readBounded(showResponse, showUrl);
	} catch (error) {
		if (signal?.aborted) throw new LlmError("model discovery aborted by caller", "ABORTED", { cause: error });
		return fallback;
	}
	let showBody;
	try {
		showBody = JSON.parse(showText);
	} catch {
		return fallback;
	}
	const contextWindow = extractContextWindow(showBody);
	const capabilities = extractCapabilities(showBody.capabilities);
	return {
		...fallback,
		...contextWindow === void 0 ? {} : { contextWindow },
		...capabilities
	};
}
/**
* Interrogate one Ollama Cloud endpoint for the models it advertises.
* Calls `GET /api/tags`, then calls `POST /api/show` per unique model to
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
	const apiKey = supplied === void 0 ? void 0 : usableProbeKey$1(supplied);
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
	const uniqueTags = uniqueTagModels(tagsBody.models);
	const models = new Array(uniqueTags.length);
	let cursor = 0;
	const worker = async () => {
		for (;;) {
			const index = cursor;
			cursor += 1;
			if (index >= uniqueTags.length) return;
			const tag = uniqueTags[index];
			if (tag !== void 0) models[index] = await discoverTaggedModel(tag, baseURL, apiKey, request.signal);
		}
	};
	await Promise.all(Array.from({ length: Math.min(SHOW_CONCURRENCY, uniqueTags.length) }, worker));
	return models.filter((model) => model !== void 0);
}
//#endregion
//#region lib/types/reasoning.js
/**
* Per-family Ollama Cloud thinking levels and plugin-owned defaults.
*
* `/api/show` only reports a thinking capability. Distinct effort budgets
* come from vendor docs: an OpenAI-compatible endpoint accepting a string
* is not treated as a real budget. Unknown thinking models keep the generic
* five-level map and no `defaultEffort`.
*
* @module dsh-llm-ollama/reasoning
*/
const UNSUPPORTED = null;
/** Pin every pi-ai level so an absent key is never guessed as supported. */
function pin(supported) {
	return {
		off: supported.off ?? UNSUPPORTED,
		minimal: supported.minimal ?? UNSUPPORTED,
		low: supported.low ?? UNSUPPORTED,
		medium: supported.medium ?? UNSUPPORTED,
		high: supported.high ?? UNSUPPORTED,
		xhigh: supported.xhigh ?? UNSUPPORTED,
		max: supported.max ?? UNSUPPORTED
	};
}
const OFF_HIGH = pin({
	off: "none",
	high: "high"
});
const OFF_HIGH_MAX = pin({
	off: "none",
	high: "high",
	max: "max"
});
const OFF_LOW_HIGH = pin({
	off: "none",
	low: "low",
	high: "high"
});
const OFF_LOW_HIGH_MAX = pin({
	off: "none",
	low: "low",
	high: "high",
	max: "max"
});
const OFF_MEDIUM_HIGH = pin({
	off: "none",
	medium: "medium",
	high: "high"
});
const LOW_MEDIUM_HIGH = pin({
	low: "low",
	medium: "medium",
	high: "high"
});
const LOW_HIGH_MAX = pin({
	low: "low",
	high: "high",
	max: "max"
});
const HIGH_ONLY = pin({ high: "high" });
const GENERIC = pin({
	off: "none",
	low: "low",
	medium: "medium",
	high: "high",
	max: "max"
});
const FAMILIES = {
	"glm-5.2": {
		levels: OFF_HIGH_MAX,
		defaultEffort: "max"
	},
	"glm-5.1": {
		levels: OFF_HIGH,
		defaultEffort: "high"
	},
	"deepseek-v4-pro": {
		levels: OFF_LOW_HIGH_MAX,
		defaultEffort: "high"
	},
	"deepseek-v4-flash": {
		levels: OFF_LOW_HIGH_MAX,
		defaultEffort: "high"
	},
	"gpt-oss": {
		levels: LOW_MEDIUM_HIGH,
		defaultEffort: "medium"
	},
	gemma4: {
		levels: OFF_HIGH,
		defaultEffort: "high"
	},
	"nemotron-3-ultra": {
		levels: OFF_MEDIUM_HIGH,
		defaultEffort: "medium"
	},
	"nemotron-3-super": {
		levels: OFF_LOW_HIGH,
		defaultEffort: "low"
	},
	"nemotron-3-nano": {
		levels: OFF_LOW_HIGH,
		defaultEffort: "low"
	},
	"minimax-m3": {
		levels: OFF_HIGH,
		defaultEffort: "high"
	},
	"minimax-m2": {
		levels: HIGH_ONLY,
		defaultEffort: "high"
	},
	"kimi-k2.7": {
		levels: HIGH_ONLY,
		defaultEffort: "high"
	},
	"kimi-k3": {
		levels: LOW_HIGH_MAX,
		defaultEffort: "max"
	},
	"kimi-k2.6": {
		levels: OFF_HIGH,
		defaultEffort: "high"
	},
	"qwen3.5": {
		levels: OFF_HIGH,
		defaultEffort: "high"
	}
};
/**
* Strip a registry prefix so family matching sees the native Ollama id.
* @param model - wire model id, possibly `registry/name:tag`.
*/
function ollamaModelBasename(model) {
	const slash = model.lastIndexOf("/");
	return slash === -1 ? model : model.slice(slash + 1);
}
function named(id, family) {
	return id === family || id.startsWith(`${family}:`);
}
/**
* Classify one catalog id into a documented Cloud family, or generic.
* @param model - Ollama wire model id.
*/
function ollamaReasoningFamily(model) {
	const id = ollamaModelBasename(model).toLowerCase();
	if (named(id, "gpt-oss")) return "gpt-oss";
	if (named(id, "glm-5.2")) return "glm-5.2";
	if (named(id, "glm-5.1")) return "glm-5.1";
	if (named(id, "deepseek-v4-pro")) return "deepseek-v4-pro";
	if (named(id, "deepseek-v4-flash")) return "deepseek-v4-flash";
	if (named(id, "gemma4")) return "gemma4";
	if (named(id, "nemotron-3-ultra")) return "nemotron-3-ultra";
	if (named(id, "nemotron-3-super")) return "nemotron-3-super";
	if (named(id, "nemotron-3-nano")) return "nemotron-3-nano";
	if (named(id, "minimax-m3")) return "minimax-m3";
	if (id === "minimax-m2" || id.startsWith("minimax-m2.") || id.startsWith("minimax-m2:")) return "minimax-m2";
	if (id === "kimi-k2.7" || id.startsWith("kimi-k2.7-") || id.startsWith("kimi-k2.7:")) return "kimi-k2.7";
	if (id === "kimi-k2.6" || id.startsWith("kimi-k2.6-") || id.startsWith("kimi-k2.6:")) return "kimi-k2.6";
	if (named(id, "kimi-k3")) return "kimi-k3";
	if (named(id, "qwen3.5")) return "qwen3.5";
	return "generic";
}
function policyFor(model) {
	const family = ollamaReasoningFamily(model);
	if (family === "generic") return { levels: GENERIC };
	return FAMILIES[family];
}
/**
* Thinking-level map for one catalog row, or undefined when thinking is off.
* @param model - saved catalog entry.
*/
function ollamaThinkingLevelMap(model) {
	if (model.thinking !== true) return void 0;
	return policyFor(model.id).levels;
}
/**
* Plugin-owned default effort for a known Cloud family.
* @param model - Ollama wire model id.
* @returns a supported selector id, or undefined for unknown families.
*/
function ollamaDefaultEffort(model) {
	return policyFor(model).defaultEffort;
}
Object.freeze({
	off: "Off",
	low: "Low",
	medium: "Medium",
	high: "High",
	xhigh: "Extra high",
	max: "Max"
});
/**
* Attach the family or row default to a resolved model when that level is offered.
* @param info - descriptor from the delegated pi-ai adapter.
* @param model - Ollama wire model id.
* @param override - optional saved row default.
*/
function applyOllamaReasoningMetadata(info, model, override) {
	if (info.reasoning === void 0) return info;
	const preferred = override ?? ollamaDefaultEffort(model);
	if (preferred === void 0) return info;
	const defaultEffort = preferred;
	if (!info.reasoning.efforts.some((effort) => effort.id === defaultEffort)) return info;
	return {
		...info,
		reasoning: {
			...info.reasoning,
			defaultEffort
		}
	};
}
//#endregion
//#region lib/types/pi-ai-profile.js
/**
* Translate the plugin's Ollama-native connection facts into the pi-ai profile
* used for OpenAI Chat Completions. The user-facing base URL remains the
* native /api endpoint because discovery and Web capabilities use it; only
* this profile switches chat to /v1.
*
* @module dsh-llm-ollama/pi-ai-profile
*/
/** Safe output capability used when Ollama does not disclose one. */
const OLLAMA_DEFAULT_MODEL_MAX_TOKENS = 32768;
const NO_COST = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0
};
/** Map the user-facing native Ollama base URL to the OpenAI-compatible chat base. */
function openAICompatibleBaseURL(baseURL) {
	const normalized = baseURL.replace(/\/+$/, "");
	if (normalized.endsWith("/v1")) return normalized;
	if (normalized.endsWith("/api")) return normalized.slice(0, -4) + "/v1";
	return normalized + "/v1";
}
/** Build one pi-ai model descriptor for OpenAI Chat Completions. */
function toPiAiModel(model, connection, baseUrl) {
	const levels = ollamaThinkingLevelMap(model);
	return {
		id: model.id,
		name: model.name ?? model.id,
		api: "openai-completions",
		provider: OLLAMA_PROVIDER,
		baseUrl,
		reasoning: model.thinking === true,
		...levels === void 0 ? {} : { thinkingLevelMap: levels },
		input: model.vision === true ? ["text", "image"] : ["text"],
		cost: NO_COST,
		contextWindow: model.contextWindow ?? connection.defaultContextWindow,
		maxTokens: model.maxTokens ?? 32768,
		compat: {
			supportsStore: false,
			supportsDeveloperRole: false,
			supportsReasoningEffort: true,
			supportsUsageInStreaming: true,
			maxTokensField: "max_tokens",
			thinkingFormat: "openai"
		}
	};
}
/** Harness-authenticated provider auth; the actual key is supplied per request by PiAiAdapter. */
function ollamaAuth() {
	return { apiKey: {
		name: "Ollama Cloud API key",
		resolve: ({ credential }) => Promise.resolve({
			auth: credential?.key === void 0 ? {} : { apiKey: credential.key },
			source: "Ollama Cloud"
		})
	} };
}
/** Resolve the complete pi-ai profile for one Ollama options snapshot. */
function createOllamaPiAiProfile(connection) {
	const baseURL = openAICompatibleBaseURL(connection.baseURL);
	const models = connection.models.map((model) => toPiAiModel(model, connection, baseURL));
	const configuredMaxTokens = /* @__PURE__ */ new Map();
	const piProvider = createProvider({
		id: OLLAMA_PROVIDER,
		name: "Ollama Cloud",
		baseUrl: baseURL,
		auth: ollamaAuth(),
		models,
		api: openAICompletionsApi()
	});
	return {
		provider: OLLAMA_PROVIDER,
		displayName: "Ollama Cloud",
		apiKeyEnv: connection.apiKeyEnv,
		baseURL,
		defaultContextWindow: connection.defaultContextWindow,
		defaultMaxTokens: OLLAMA_DEFAULT_MODEL_MAX_TOKENS,
		defaultInput: ["text"],
		streamIdleTimeoutMs: connection.streamIdleTimeoutMs,
		retryPolicy: connection.retryPolicy,
		piProvider,
		configuredMaxTokens
	};
}
//#endregion
//#region lib/types/adapter.js
/**
* Ollama Cloud chat adapter for the Harness LLM seam. The public adapter and
* provider route stay Ollama-specific, while the chat wire implementation is
* delegated to pi-ai's OpenAI Chat Completions support. Ollama-native APIs
* remain in use for discovery and Web Search/Fetch outside this class.
*
* @module dsh-llm-ollama/adapter
*/
/** Default maximum idle interval while an adapter stream read is outstanding. */
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = OLLAMA_DEFAULT_STREAM_IDLE_TIMEOUT_MS;
/** Default combined request/response context capacity. */
const DEFAULT_CONTEXT_WINDOW = OLLAMA_DEFAULT_CONTEXT_WINDOW;
/** The Ollama Cloud chat adapter backed by pi-ai OpenAI Chat Completions. */
var OllamaAdapter = class extends LlmAdapter {
	config;
	snapshot;
	constructor(config) {
		super();
		this.config = config;
	}
	/** Rebuild the delegated adapter only when the plugin publishes a new options snapshot. */
	current() {
		const options = this.config.options();
		if (this.snapshot?.options === options) return this.snapshot.adapter;
		const profile = createOllamaPiAiProfile(options);
		const profiles = /* @__PURE__ */ new Map([[OLLAMA_PROVIDER, profile]]);
		const adapter = new PiAiAdapter({
			profiles: () => profiles,
			resolveApiKey: () => this.config.resolveApiKey(options),
			...this.config.resolveAttachments === void 0 ? {} : { resolveAttachments: this.config.resolveAttachments }
		});
		this.snapshot = {
			options,
			adapter
		};
		return adapter;
	}
	providerInfo(provider) {
		return this.current().providerInfo(provider);
	}
	providerRetryPolicy(provider) {
		return this.current().providerRetryPolicy(provider);
	}
	listModels(provider) {
		return this.current().listModels(provider);
	}
	async resolveModel(provider, model, signal) {
		return applyOllamaReasoningMetadata(await this.current().resolveModel(provider, model, signal), model, this.config.options().models.find((entry) => entry.id === model)?.defaultEffort);
	}
	stream(options) {
		return this.current().stream(options);
	}
};
//#endregion
//#region lib/types/usage.js
/**
* Reading the account's Ollama Cloud quota for the configuration card.
*
* Ollama exposes the settings page's "Cloud usage" panel as
* `GET <base>/usage` (the native API base already ends in `/api`). The
* reply carries the session and weekly windows as consumed fractions plus
* per-model request counts; nothing secret. The credential travels only on
* this Host-to-Ollama hop — the browser receives the parsed snapshot.
*
* A self-hosted endpoint answers 404, which the card renders as "unsupported"
* rather than as a failure: usage is advisory information, never a blocker.
*
* @module dsh-llm-ollama/usage
*/
/** Public Ollama Cloud API base URL. */
const PUBLIC_BASE_URL$1 = OLLAMA_PUBLIC_BASE_URL;
/** Per-read budget for one usage request. */
const DEFAULT_USAGE_REQUEST_TIMEOUT_MS = 15e3;
/** Error code for an endpoint without a usage surface (e.g. self-hosted). */
const OLLAMA_USAGE_UNSUPPORTED = "OLLAMA_USAGE_UNSUPPORTED";
/** Error code for a failed or unreadable usage read. */
const OLLAMA_USAGE_FAILED = "OLLAMA_USAGE_FAILED";
/** Replies larger than this are refused; a healthy usage reply is a few KiB. */
const MAX_USAGE_BYTES = 1048576;
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Check a probe key before it is placed in a header. */
function usableProbeKey(raw) {
	const checked = normalizeApiKey(raw);
	if (checked.ok) return checked.value;
	throw new LlmError(checked.reason === "empty" ? "this provider's API key is blank; enter it in Plugin configuration first" : "this provider's API key contains characters no HTTP header can carry; paste the raw key only", INVALID_CREDENTIAL_CODE);
}
/**
* Convert one wire window. A window without a finite non-negative fraction is
* dropped; per-model entries keep only well-formed rows so one odd entry
* cannot sink the whole panel.
*/
function parseWindow(value) {
	if (!isRecord(value)) return void 0;
	const usage = value["usage"];
	if (typeof usage !== "number" || !Number.isFinite(usage) || usage < 0) return void 0;
	const models = [];
	if (Array.isArray(value["models"])) for (const entry of value["models"]) {
		if (!isRecord(entry) || typeof entry["name"] !== "string" || entry["name"].length === 0) continue;
		const requestCount = entry["request_count"];
		if (typeof requestCount !== "number" || !Number.isSafeInteger(requestCount) || requestCount < 0) continue;
		models.push({
			name: entry["name"],
			requestCount
		});
	}
	return {
		usage,
		models
	};
}
/**
* Convert the provider reply into the secret-free snapshot the card renders.
* @param value - opaque JSON returned by the usage endpoint.
* @param url - endpoint read, for error messages.
* @returns session and weekly windows with per-model request counts.
*/
function parseOllamaUsage(value, url) {
	const limits = isRecord(value) ? value.limits : void 0;
	const session = isRecord(limits) ? parseWindow(limits["session"]) : void 0;
	const weekly = isRecord(limits) ? parseWindow(limits["weekly"]) : void 0;
	if (session === void 0 && weekly === void 0) throw new LlmError(`${url} returned a malformed usage response`, OLLAMA_USAGE_FAILED);
	return {
		fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
		...session === void 0 ? {} : { session },
		...weekly === void 0 ? {} : { weekly }
	};
}
/**
* Read the account's current cloud usage without issuing a model request.
* The draft's one-shot key wins; otherwise the route's stored credential is
* asked for, mirroring model discovery. Self-hosted endpoints typically
* answer 404, surfaced as {@link OLLAMA_USAGE_UNSUPPORTED}.
* @param request - the endpoint and one-shot credential to use.
* @param storedApiKey - the credential the named route already stored, asked
*   for only when the draft carries none.
* @returns the parsed snapshot, safe to forward to the browser.
* @throws LlmError when the endpoint refuses, fails, or answers malformed JSON.
*/
async function readOllamaUsage(request, storedApiKey) {
	const baseURL = (request.baseURL ?? PUBLIC_BASE_URL$1).replace(/\/+$/, "");
	const supplied = request.apiKey ?? await storedApiKey?.();
	const apiKey = supplied === void 0 || supplied.trim().length === 0 ? void 0 : usableProbeKey(supplied);
	const url = `${baseURL}/usage`;
	const timeout = AbortSignal.timeout(DEFAULT_USAGE_REQUEST_TIMEOUT_MS);
	const signal = request.signal === void 0 ? timeout : AbortSignal.any([request.signal, timeout]);
	let response;
	try {
		response = await fetch(url, {
			method: "GET",
			headers: {
				accept: "application/json",
				...apiKey === void 0 ? {} : { authorization: `Bearer ${apiKey}` },
				...attributionHeaders()
			},
			redirect: "error",
			signal
		});
	} catch (error) {
		if (request.signal?.aborted) throw new LlmError("Ollama Cloud usage read aborted by caller", "ABORTED", { cause: error });
		const detail = error instanceof Error && error.message.length > 0 ? `: ${error.message}` : "";
		throw new LlmError(`could not reach ${url}${detail}`, OLLAMA_USAGE_FAILED, { cause: error });
	}
	if (response.status === 404) {
		await response.body?.cancel();
		throw new LlmError("this Ollama endpoint does not report cloud usage", OLLAMA_USAGE_UNSUPPORTED);
	}
	if (!response.ok) {
		await response.body?.cancel();
		throw new LlmError(`${url} answered ${response.status}${response.status === 401 || response.status === 403 ? "; check the API key" : ""}`, response.status === 401 || response.status === 403 ? INVALID_CREDENTIAL_CODE : OLLAMA_USAGE_FAILED);
	}
	const declared = Number(response.headers.get("content-length") ?? NaN);
	if (Number.isFinite(declared) && declared > MAX_USAGE_BYTES) {
		await response.body?.cancel();
		throw new LlmError(`${url} answered with more than ${MAX_USAGE_BYTES} bytes`, OLLAMA_USAGE_FAILED);
	}
	let text;
	try {
		text = await response.text();
	} catch (error) {
		throw new LlmError(`${url} could not be read`, OLLAMA_USAGE_FAILED, { cause: error });
	}
	if (text.length > MAX_USAGE_BYTES) throw new LlmError(`${url} answered with more than ${MAX_USAGE_BYTES} bytes`, OLLAMA_USAGE_FAILED);
	let body;
	try {
		body = JSON.parse(text);
	} catch (error) {
		throw new LlmError(`${url} did not answer with JSON`, OLLAMA_USAGE_FAILED, { cause: error });
	}
	return parseOllamaUsage(body, url);
}
//#endregion
//#region lib/types/web.js
/**
* Ollama Cloud web capability providers: `/api/web_search` and
* `/api/web_fetch` behind the `ctx.web` seam. Both reuse the LLM route's
* credential reference and base URL, resolved per operation so a settings
* change reaches the very next call. Redirects fail closed because every
* request carries the credential (`redirect: 'error'`, matching the other
* credentialed web providers).
* @module dsh-llm-ollama/web
*/
/** Stable id both providers register under (one backend serves both capabilities). */
const OLLAMA_WEB_PROVIDER_ID = "ollama-cloud";
/** Ollama's `/api/web_search` accepts at most ten results per call. */
const MAX_SEARCH_RESULTS = 10;
/** Default per-attempt budget for one Ollama Cloud web request. */
const DEFAULT_WEB_REQUEST_TIMEOUT_MS = 15e3;
/** Error code for a provider-side request budget expiry. */
const OLLAMA_WEB_TIMEOUT = "OLLAMA_WEB_TIMEOUT";
/** Error code for a retryable transport failure before an HTTP response arrives. */
const OLLAMA_WEB_TRANSPORT = "OLLAMA_WEB_TRANSPORT";
/** Decode one search response, dropping entries without a usable URL. */
function decodeSearchResponse(body) {
	if (!Array.isArray(body.results)) throw new WebError("ollama-cloud web search answered without a \"results\" array", "OLLAMA_WEB_BAD_REPLY");
	const sources = [];
	for (const entry of body.results) {
		if (typeof entry !== "object" || entry === null || typeof entry.url !== "string" || entry.url.length === 0) continue;
		sources.push({
			url: entry.url,
			...typeof entry.title === "string" && entry.title.length > 0 ? { title: entry.title } : {},
			...typeof entry.content === "string" && entry.content.length > 0 ? { snippet: entry.content } : {}
		});
	}
	return {
		sources,
		truncated: false
	};
}
/** Decode one fetch response; extracted page content is plain text/markdown, not HTML. */
function decodeFetchResponse(body) {
	if (typeof body.content !== "string") throw new WebError("ollama-cloud web fetch answered without text \"content\"", "OLLAMA_WEB_BAD_REPLY");
	return body.content;
}
/** Combine caller cancellation with one provider-side attempt budget. */
function requestAttempt(signal, timeoutMs) {
	const controller = new AbortController();
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		controller.abort(/* @__PURE__ */ new Error(`ollama-cloud web request timed out after ${timeoutMs}ms`));
	}, timeoutMs);
	timer.unref();
	const onCallerAbort = () => {
		controller.abort(signal?.reason);
	};
	if (signal?.aborted) onCallerAbort();
	else signal?.addEventListener("abort", onCallerAbort, { once: true });
	return {
		signal: controller.signal,
		timedOut: () => timedOut,
		clear: () => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", onCallerAbort);
		}
	};
}
/** Whether a fetch rejection names the redirect policy rather than a transient transport failure. */
function isRedirectFailure(error) {
	let current = error;
	while (current instanceof Error) {
		if (/redirect/i.test(current.message)) return true;
		current = current.cause;
	}
	return false;
}
/** POST one credentialed JSON attempt that refuses redirects, and decode the reply. */
async function postJsonAttempt(options, url, apiKey, payload, callerSignal) {
	const timeoutMs = options.requestTimeoutMs ?? 15e3;
	const attempt = requestAttempt(callerSignal, timeoutMs);
	let response;
	try {
		response = await fetch(url, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json",
				authorization: `Bearer ${apiKey}`,
				...attributionHeaders()
			},
			body: JSON.stringify(payload),
			redirect: "error",
			signal: attempt.signal
		});
	} catch (error) {
		if (callerSignal?.aborted) throw new WebError("ollama-cloud web request aborted by caller", "ABORTED", { cause: error });
		if (attempt.timedOut()) throw new WebError(`ollama-cloud web request timed out after ${timeoutMs}ms`, OLLAMA_WEB_TIMEOUT, { cause: error });
		if (isRedirectFailure(error)) throw new WebError(`${url} attempted a redirect`, "WEB_PROVIDER_ERROR", { cause: error });
		const detail = error instanceof Error && error.message.length > 0 ? `: ${error.message}` : "";
		throw new WebError(`could not reach ${url}${detail}`, OLLAMA_WEB_TRANSPORT, { cause: error });
	} finally {
		attempt.clear();
	}
	if (!response.ok) {
		await response.body?.cancel();
		throw new WebError(`${url} answered ${response.status}${response.status === 401 || response.status === 403 ? "; check the API key" : ""}`, "WEB_PROVIDER_ERROR");
	}
	let body;
	try {
		body = await response.json();
	} catch (error) {
		throw new WebError(`${url} did not answer with JSON`, "OLLAMA_WEB_BAD_REPLY", { cause: error });
	}
	return {
		status: response.status,
		body
	};
}
/** POST one operation, retrying only a transient pre-response failure once. */
async function postJson(options, suffix, payload, signal) {
	const url = `${options.baseURL().replace(/\/+$/, "")}${suffix}`;
	const apiKey = await options.resolveApiKey();
	if (apiKey === void 0) throw new WebError("ollama-cloud web capabilities need an API key; store one through Plugin configuration", "OLLAMA_WEB_MISSING_CREDENTIAL");
	try {
		return await postJsonAttempt(options, url, apiKey, payload, signal);
	} catch (error) {
		if (!(error instanceof WebError && (error.code === "OLLAMA_WEB_TIMEOUT" || error.code === "OLLAMA_WEB_TRANSPORT")) || signal?.aborted) throw error;
	}
	return postJsonAttempt(options, url, apiKey, payload, signal);
}
/** The Ollama Cloud search provider; HTTP redirects fail as `WEB_PROVIDER_ERROR`. */
var OllamaWebSearchProvider = class {
	options;
	id = OLLAMA_WEB_PROVIDER_ID;
	constructor(options) {
		this.options = options;
	}
	available() {
		return URL.canParse(this.options.baseURL());
	}
	async search(request, signal) {
		const { body } = await postJson(this.options, "/web_search", {
			query: request.query,
			...request.maxResults === void 0 ? {} : { max_results: Math.min(request.maxResults, MAX_SEARCH_RESULTS) }
		}, signal);
		return decodeSearchResponse(body);
	}
};
/** The Ollama Cloud fetch provider; HTTP redirects fail as `WEB_PROVIDER_ERROR`. */
var OllamaWebFetchProvider = class {
	options;
	id = OLLAMA_WEB_PROVIDER_ID;
	constructor(options) {
		this.options = options;
	}
	available() {
		return URL.canParse(this.options.baseURL());
	}
	async fetch(request, signal) {
		const { status, body } = await postJson(this.options, "/web_fetch", { url: request.url }, signal);
		return {
			url: request.url,
			statusCode: status,
			body: {
				kind: "text",
				content: decodeFetchResponse(body)
			},
			truncated: false
		};
	}
};
//#endregion
//#region lib/types/index.js
/**
* Register the `ollama-cloud` route with chat delegated to pi-ai OpenAI Chat
* Completions, while keeping Ollama-native discovery and Web Search/Fetch as
* independent capabilities. Connection facts resolve per operation from the
* optional `llm-ollama` settings section and the credential seam, so saved
* endpoint, catalog, and key changes reach the next operation.
*
* A loopback Connection channel serves `/api/tags` plus `/api/show` discovery
* and atomically saves the card's native base URL and model catalog.
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
	defaultEffort: z.string(),
	tools: z.boolean()
});
const Config = z.object({
	apiKeyEnv: z.string().role("credential-ref").default(DEFAULT_API_KEY_ENV),
	baseURL: z.string().default(PUBLIC_BASE_URL),
	models: z.array(catalogModel).default([]),
	maxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER),
	defaultContextWindow: z.number().step(1).min(1).default(DEFAULT_CONTEXT_WINDOW),
	streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
	webRequestTimeoutMs: z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS).default(DEFAULT_WEB_REQUEST_TIMEOUT_MS),
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
			...model.defaultEffort === void 0 ? {} : { defaultEffort: model.defaultEffort },
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
	const webRequestTimeoutMs = config.webRequestTimeoutMs ?? 15e3;
	if (!Number.isSafeInteger(webRequestTimeoutMs) || webRequestTimeoutMs <= 0 || webRequestTimeoutMs > MAX_TIMER_DELAY_MS) throw new Error(`llm-ollama: webRequestTimeoutMs must be a positive safe integer no greater than ${MAX_TIMER_DELAY_MS}`);
	return {
		apiKeyEnv: credentialRef(config.apiKeyEnv ?? "OLLAMA_API_KEY"),
		baseURL: config.baseURL ?? PUBLIC_BASE_URL,
		models: resolveModels(config.models),
		defaultContextWindow: config.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW,
		maxTokens: config.maxTokens,
		streamIdleTimeoutMs,
		webRequestTimeoutMs,
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
function settingsFailure(message) {
	return {
		ok: false,
		error: {
			code: "internal",
			message,
			details: {}
		}
	};
}
/** Fold one usage-read failure: "unsupported" is a legitimate answer, the rest are errors. */
function usageFailure(error) {
	if (error instanceof LlmError && error.code === "OLLAMA_USAGE_UNSUPPORTED") return {
		ok: true,
		value: { status: "unsupported" }
	};
	return settingsFailure(error instanceof LlmError && error.message.length > 0 ? error.message : "Ollama Cloud usage read failed");
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
		throw new LlmError(`llm-ollama: no API key for provider route "${OLLAMA_PROVIDER}"; store ${ref} through the credentials service (Plugin configuration writes it), or export ${ref} in the launching environment`, "MISSING_CREDENTIAL");
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
	ctx.effect(() => {
		const web = ctx.get("web");
		if (web === void 0) return () => {};
		const shared = {
			baseURL: () => options().baseURL,
			resolveApiKey: storedApiKey,
			requestTimeoutMs: options().webRequestTimeoutMs
		};
		const disposeSearch = web.registerSearchProvider(new OllamaWebSearchProvider(shared));
		const disposeFetch = web.registerFetchProvider(new OllamaWebFetchProvider(shared));
		return () => {
			disposeSearch();
			disposeFetch();
		};
	}, "llm-ollama: web providers");
	ctx.inject(["connection"], (connectionCtx) => {
		connectionCtx.connection.rpc.handle(OLLAMA_RPC_CHANNEL, async (endpoint, payload, signal) => {
			if (endpoint === "models/discover") {
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
			}
			if (endpoint === "settings/save") {
				const request = decodeOllamaSaveRequest(payload);
				if (request === void 0) return settingsFailure("invalid Ollama Cloud settings request");
				const settings = ctx.get("settings");
				if (settings === void 0) return settingsFailure("Ollama Cloud settings are unavailable");
				try {
					const before = settings.describe().find((descriptor) => descriptor.ns === NS);
					if (before === void 0) return settingsFailure("Ollama Cloud settings are unavailable");
					const current = decodeOllamaSettings(before.value);
					if (current === void 0) return settingsFailure("Ollama Cloud settings are invalid");
					const ops = [];
					if (!deepEqualJson(current.baseURL, request.baseURL)) ops.push({
						op: "set",
						path: ["baseURL"],
						value: request.baseURL
					});
					if (!deepEqualJson(current.models, request.models)) ops.push({
						op: "set",
						path: ["models"],
						value: request.models
					});
					if (ops.length > 0) await settings.mutate(NS, ops, request.expectedRevision);
					const accepted = settings.describe().find((descriptor) => descriptor.ns === NS);
					const acceptedSettings = decodeOllamaSettings(accepted?.value);
					if (accepted === void 0 || acceptedSettings === void 0) return settingsFailure("Ollama Cloud settings could not be reloaded");
					return {
						ok: true,
						value: {
							settings: acceptedSettings,
							revision: accepted.revision
						}
					};
				} catch (error) {
					return settingsFailure(error instanceof Error && error.message.length > 0 ? error.message : "Ollama Cloud settings save failed");
				}
			}
			if (endpoint === "usage/read") {
				const request = decodeOllamaDiscoveryRequest(payload);
				if (request === void 0) return settingsFailure("invalid Ollama Cloud usage request");
				try {
					return {
						ok: true,
						value: {
							status: "ok",
							usage: await readOllamaUsage({
								...request,
								signal
							}, storedApiKey)
						}
					};
				} catch (error) {
					return usageFailure(error);
				}
			}
			return settingsFailure(`unknown Ollama Cloud endpoint: ${endpoint}`);
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
export { Config, DEFAULT_API_KEY_ENV, DEFAULT_CONTEXT_WINDOW, DEFAULT_STREAM_IDLE_TIMEOUT_MS, DEFAULT_USAGE_REQUEST_TIMEOUT_MS, DEFAULT_WEB_REQUEST_TIMEOUT_MS, OLLAMA_DISCOVER_ENDPOINT, OLLAMA_PROVIDER, OLLAMA_PUBLIC_BASE_URL, OLLAMA_RPC_CHANNEL, OLLAMA_SAVE_ENDPOINT, OLLAMA_SETTINGS_NAMESPACE, OLLAMA_USAGE_ENDPOINT, OLLAMA_USAGE_FAILED, OLLAMA_USAGE_UNSUPPORTED, OLLAMA_WEB_PROVIDER_ID, OllamaAdapter, OllamaWebFetchProvider, OllamaWebSearchProvider, PUBLIC_BASE_URL, apply, decodeOllamaCatalogModel, decodeOllamaDiscoveryRequest, decodeOllamaDiscoveryResult, decodeOllamaSaveRequest, decodeOllamaSaveResult, decodeOllamaSettings, decodeOllamaUsageReply, discoverModels, extractCapabilities, extractContextWindow, inject, name, parseOllamaUsage, readOllamaUsage, resolveAdapterOptions };
