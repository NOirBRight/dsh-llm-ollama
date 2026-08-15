/**
 * Ollama native chat wire format (NDJSON streaming). Types only.
 *
 * Source of truth: the official API docs at https://docs.ollama.com/api
 * (chat, tags, show, streaming, thinking, tool-calling), cross-checked
 * against the Go types in ollama/api/types.go.
 *
 * @module dsh-llm-ollama/types
 */

/** Request body for `POST {baseURL}/chat`. */
export interface WireChatRequest {
  model: string
  messages: WireMessage[]
  stream: true
  /** Optional function tools the model may call. */
  tools?: WireTool[]
  /**
   * Thinking control: `false` disables thinking; `true` enables the provider
   * default; `"low"`/`"medium"`/`"high"`/`"max"` request a specific level.
   * Omit for the provider default.
   */
  think?: boolean | 'low' | 'medium' | 'high' | 'max'
  /** Runtime generation options; `num_ctx` sets the context window. */
  options?: WireOptions
  /** Model keep-alive duration; omitted for cloud (server-managed). */
  keep_alive?: string | number
}

/** Runtime generation options accepted by `/api/chat`. */
export interface WireOptions {
  /** Context window size in tokens. */
  num_ctx?: number
  /** Maximum output tokens (`-1` = unlimited); omitted lets the provider default apply. */
  num_predict?: number
  temperature?: number
  /** Stop sequences (string or array). */
  stop?: string | string[]
}

/** System-role message: a single string of instructions. */
export interface WireSystemMessage {
  role: 'system'
  content: string
}

/** User-role message: text plus optional base64 images for vision models. */
export interface WireUserMessage {
  role: 'user'
  content: string
  /** Base64-encoded images for multimodal models. */
  images?: string[]
}

/** Assistant-role message: text, thinking passback, and/or tool calls. */
export interface WireAssistantMessage {
  role: 'assistant'
  content: string
  /** Reasoning trace passback (thinking models only, on tool-call turns). */
  thinking?: string
  /** Complete tool calls the model made on this turn. */
  tool_calls?: WireToolCall[]
}

/** Tool-result message: the output of one tool call, keyed by tool name. */
export interface WireToolMessage {
  role: 'tool'
  /** The function name whose result this is (Ollama correlates by name, not call id). */
  tool_name: string
  content: string
}

/** One entry of the request `messages` array, discriminated on `role`. */
export type WireMessage =
  | WireSystemMessage
  | WireUserMessage
  | WireAssistantMessage
  | WireToolMessage

/** A completed tool call; `arguments` is a JSON object, not a string. */
export interface WireToolCall {
  /** Provider-issued call id returned by current Ollama releases; older responses may omit it. */
  id?: string
  function: {
    name: string
    description?: string
    /** Parsed arguments object; re-stringified at the adapter boundary. */
    arguments: Record<string, unknown>
  }
}

/** One entry of the request `tools` array. */
export interface WireTool {
  type: 'function'
  function: {
    name: string
    description: string
    /** JSON Schema object for the arguments. */
    parameters: Record<string, unknown>
  }
}

/** One parsed NDJSON line from `/api/chat` streaming. */
export interface WireChatChunk {
  model: string
  created_at: string
  message: WireChatMessage
  done: boolean
  /** Present on the terminal chunk (`done: true`). */
  done_reason?: string
  /** Input token count (terminal chunk). */
  prompt_eval_count?: number
  /** Output token count (terminal chunk). */
  eval_count?: number
  total_duration?: number
  load_duration?: number
  prompt_eval_duration?: number
  eval_duration?: number
}

/** The `message` field of one NDJSON chunk. */
export interface WireChatMessage {
  role: 'assistant'
  /** Visible text delta (may be empty string on reasoning/tool-call chunks). */
  content?: string
  /** Reasoning trace delta (thinking models only). */
  thinking?: string
  /** Complete tool calls in this chunk (not argument fragments). */
  tool_calls?: WireToolCall[]
}

/** Non-2xx error body from `/api/chat`. */
export interface WireError {
  error?: string
}

/** One model entry in a `/api/tags` listing response. */
export interface WireTagModel {
  name?: string
  model?: string
  modified_at?: string
  size?: number
  digest?: string
  details?: WireModelDetails
  /** Capabilities: `["completion","vision","tools","thinking"]`. */
  capabilities?: string[]
}

/** `/api/tags` response. */
export interface WireTagsResponse {
  models: WireTagModel[]
}

/** High-level model details from `/api/tags` or `/api/show`. */
export interface WireModelDetails {
  parent_model?: string
  format?: string
  family?: string
  families?: string[]
  parameter_size?: string
  quantization_level?: string
}

/** `/api/show` response. */
export interface WireShowResponse {
  /** Model parameter settings serialized as text (e.g. `num_ctx 32768\n`). */
  parameters?: string
  license?: string
  modified_at?: string
  details?: WireModelDetails
  template?: string
  /** Capabilities: `["completion","vision","tools","thinking"]`. */
  capabilities?: string[]
  /** Additional model metadata; `*.context_length` keys hold the context window. */
  model_info?: Record<string, unknown>
}
