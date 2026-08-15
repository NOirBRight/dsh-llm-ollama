/**
 * Ollama native metadata wire types used by discovery. Chat wire translation
 * is owned by pi-ai's OpenAI-compatible implementation and intentionally has
 * no local serializer types here.
 *
 * @module dsh-llm-ollama/types
 */
/** Non-2xx error body from Ollama APIs. */
export interface WireError {
    error?: string;
}
/** One model entry in a /api/tags listing response. */
export interface WireTagModel {
    name?: string;
    model?: string;
    modified_at?: string;
    size?: number;
    digest?: string;
    details?: WireModelDetails;
    /** Capabilities such as completion, vision, tools, and thinking. */
    capabilities?: string[];
}
/** /api/tags response. */
export interface WireTagsResponse {
    models: WireTagModel[];
}
/** High-level model details from /api/tags or /api/show. */
export interface WireModelDetails {
    parent_model?: string;
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
}
/** /api/show response. */
export interface WireShowResponse {
    /** Model parameter settings serialized as text, for example num_ctx 32768. */
    parameters?: string;
    license?: string;
    modified_at?: string;
    details?: WireModelDetails;
    template?: string;
    /** Capabilities such as completion, vision, tools, and thinking. */
    capabilities?: string[];
    /** Additional model metadata; *.context_length keys hold the context window. */
    model_info?: Record<string, unknown>;
}
//# sourceMappingURL=types.d.ts.map