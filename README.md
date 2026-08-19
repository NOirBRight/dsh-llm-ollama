# dsh-llm-ollama

English | [中文](README.zh.md)

Ollama Cloud integration for DeepSeek Harness. Chat uses Ollama's OpenAI-compatible Chat Completions endpoint through the shared pi-ai-backed adapter. Model discovery and the Web Search/Fetch providers remain on Ollama-native APIs because those independent capabilities are not part of the chat protocol.

The package root exposes the Cordis plugin contract and OllamaAdapter. The same artifact exports ./client, which contributes the Ollama Cloud card under Settings → LLM Providers. The protocol and capability split is recorded in [ADR 0001](docs/adr/0001-separate-chat-protocol-from-ollama-capabilities.md).

## Installation

DeepSeek Harness 0.1.0-rc.6 or later is required. Install directly from GitHub:

~~~sh
dsh plugin --profile web add github:NOirBRight/dsh-llm-ollama#v0.6.3
dsh web
~~~

The repository tracks release-ready lib artifacts, so GitHub installation needs no build-script allowlist. A source checkout can use a link installation after running pnpm run build.

## Web configuration

Open Settings → LLM Providers → Ollama Cloud. The card stores the API key through the Harness credentials API under OLLAMA_API_KEY; the Host never returns the stored literal. It saves the native base URL and model catalog together as one revision-fenced llm-ollama settings mutation.

Fetch available models opens the picker immediately and calls the package's loopback-only RPC with the unsaved endpoint and one-shot key. The Host reads /api/tags, deduplicates native ids, and enriches up to six models concurrently through /api/show. The native metadata supplies context windows plus vision, thinking, and tools flags that /v1/models does not expose. The picker starts from the current draft selection, preserves current-only models, and replaces the draft catalog when applied.

The card's Cloud usage section mirrors ollama.com/settings: the Host reads GET <baseURL>/usage with the stored (or one-shot) key and renders the session and weekly windows as consumed-percentage meters plus the week's per-model request counts. The credential never crosses to the browser. A self-hosted endpoint without the usage surface shows an unsupported note instead of an error.

The model catalog starts collapsed and lists one row per model: a drag handle reorders rows (the order persists with the catalog), the chevron opens that row's context window, Default thinking, and capability flags, and the trash button removes it.

### Plugin configuration screenshots

Cloud usage and the complete weekly model activity list:

![Ollama Cloud connection and usage](docs/images/ollama-cloud-usage.png)

Sortable model catalog:

![Ollama Cloud sortable model catalog](docs/images/ollama-model-catalog.png)

The Models page lists saved ollama-cloud models and can select them. Current Harness releases do not expose a third-party editor slot inside that page, so this package owns its editor under Plugin configuration.

## Capability and protocol split

Chat uses:

    POST <openai-base>/chat/completions

The configured baseURL remains the native Ollama API address. The plugin maps chat to its /v1 sibling:

    https://ollama.com/api  ->  https://ollama.com/v1
    http://localhost:11434/api  ->  http://localhost:11434/v1

The Ollama-native independent capabilities remain:

    model discovery  ->  GET /api/tags + POST /api/show
    web search       ->  POST /api/web_search
    web fetch        ->  POST /api/web_fetch

Search and Fetch are ctx.web providers, so they work with any selected chat model. A DeepSeek, Codex, Kimi, or OpenAI-compatible chat model can still call the Ollama-backed web_search tool when the profile selects ollama-cloud.

OpenAI Responses is not the default because Ollama supports only the non-stateful flavor. Anthropic Messages is not the default because Ollama Cloud needs an extra Bearer header and that compatibility surface has no model listing or prompt caching.

## Web search and fetch

The Host plugin registers both Web providers under ollama-cloud. Registration alone does not change deployment policy; pin the desired providers in the profile patch:

~~~yaml
- id: web
  config:
    searchProvider: ollama-cloud
    fetchProvider: ollama-cloud
~~~

Omit fetchProvider to keep the built-in HTTP fetcher while moving only search. Both providers reject redirects before following them. Each attempt has a 15-second default budget and one transient timeout or pre-response transport failure is retried. HTTP errors, malformed replies, missing credentials, redirects, and caller cancellation are not retried.

## Config

~~~yaml
- id: llm-ollama
  name: 'dsh-llm-ollama'
  config:
    apiKeyEnv: OLLAMA_API_KEY
    baseURL: https://ollama.com/api
    defaultContextWindow: 262144
    streamIdleTimeoutMs: 300000
    webRequestTimeoutMs: 15000
    retryPolicy:
      mode: normal
      maxRetries: 8
      backoff:
        initialDelayMs: 500
        maxDelayMs: 10000
        jitterRatio: 0.1
    models:
      - id: gpt-oss:20b
        name: GPT-OSS 20B
        contextWindow: 131072
        thinking: true
      - id: llava
        name: LLaVA
        contextWindow: 4096
        vision: true
~~~

The bundle retries eligible model-request failures up to eight times by default. Documented status-less generation, reachability, and overload failures are classified as `SERVER`; authentication, invalid-request, and unsupported-content failures remain non-retryable.

The provider route remains ollama-cloud and the settings namespace remains llm-ollama. Only configured catalog models are accepted for chat. The adapter does not install a request-level maxTokens default; output is not capped from the catalog. Per-row `contextWindow` is the DSH compaction budget.

The fallback context window is 262,144 tokens. Discovery should normally provide an exact model value; the fallback also leaves room for pi-ai's context-safety reserve when metadata is unavailable.

### Model capabilities

vision controls text/image input modalities. thinking enables selectable reasoning efforts. Known Ollama Cloud families expose only vendor-real levels and pin a plugin `defaultEffort` used when the session has not picked one (GLM-5.2 and Kimi K3 default to max; DeepSeek V4 and MiniMax M3 to high; GPT-OSS to medium; Nemotron Super/Nano to low). Unknown thinking models keep off, low, medium, high, and max with no plugin default. tools records discovery metadata; the actual request carries the current DSH tool definitions.

The OpenAI Chat Completions profile is pinned for Ollama: it sends max_tokens, reasoning_effort, and streaming usage, preserves system-role messages, and does not send store, max_completion_tokens, or prompt_cache fields.

## Model Experience

### Prompt effects

The system prompt and all provider-neutral messages are translated by PiAiAdapter into OpenAI Chat Completions messages. Tool calls retain provider-issued ids and tool results return with the matching tool_call_id. Images are encoded as base64 data URLs only for models marked vision-capable.

### Token effects

Usage maps to Harness input/output counts. maxTokens is clamped against the configured context capacity by pi-ai, leaving a safety reserve. Ollama does not currently expose cache-read/cache-write accounting through this endpoint.

### KV-cache effects

Stable model, system prompt, history, tool definitions, and request options preserve a stable serialized prefix. Tool-call ids are provider-issued protocol fields and are replayed unchanged. Changing earlier messages, tools, images, model id, or reasoning/output options can invalidate provider-side reuse.

## Known limitations and deferred work

- GenerateOptions.stop is not supported by the shared PiAiAdapter.
- Models absent from the saved catalog are rejected; the old native adapter's pass-through behavior is removed.
- /api/show reports thinking capability but not the exact accepted effort set, so the plugin applies Ollama's general rule and the GPT-OSS exception.
- Ollama does not publish per-model output limits.
- Logs written by v0.2.2 and earlier can contain duplicate ollama-call-0 values; existing logs are not migrated.
- Structured-output format configuration is not exposed by this package.
