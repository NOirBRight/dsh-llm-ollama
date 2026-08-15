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
import type { LlmDiscoveredModel, LlmModelDiscoveryRequest } from '@deepseek-ai/dsh-llm';
import type { OllamaCatalogModelConfig } from './client-contract.ts';
import type { WireShowResponse } from './types.ts';
/** The public Ollama Cloud API base URL. */
export declare const PUBLIC_BASE_URL = "https://ollama.com/api";
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
export declare function extractContextWindow(show: WireShowResponse): number | undefined;
/** Per-model capability metadata extracted from discovery. */
export interface OllamaModelCapabilities {
    /** Whether the model accepts image input. */
    vision: boolean;
    /** Whether the model supports thinking/reasoning. */
    thinking: boolean;
    /** Whether the model supports tool/function calling. */
    tools: boolean;
}
/** Discovery row retaining Ollama-native capability metadata for this package's client card. */
export type OllamaDiscoveredModel = LlmDiscoveredModel & OllamaCatalogModelConfig;
/**
 * Extract native capability flags from one `/api/show` response.
 * @param capabilities - capability names returned by Ollama.
 * @returns explicit vision, thinking, and tools flags.
 */
export declare function extractCapabilities(capabilities: string[] | undefined): OllamaModelCapabilities;
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
export declare function discoverModels(request: LlmModelDiscoveryRequest, storedApiKey?: () => Promise<string | undefined>): Promise<readonly OllamaDiscoveredModel[]>;
//# sourceMappingURL=discovery.d.ts.map