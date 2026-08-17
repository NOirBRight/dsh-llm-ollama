# Architecture: Ollama capabilities with OpenAI-compatible chat

English | [中文](architecture.zh.md)

The accepted protocol decision is recorded in [ADR 0001](adr/0001-separate-chat-protocol-from-ollama-capabilities.md).

## Capability ownership

The package owns one Ollama-specific provider identity, ollama-cloud, but it does not treat every Ollama endpoint as one protocol.

Chat uses OpenAI Chat Completions through the shared pi-ai-backed adapter:

    DSH GenerateOptions
      -> OllamaAdapter
      -> PiAiAdapter
      -> POST <chat-base>/chat/completions
      -> DSH StreamChunk

Ollama-specific independent capabilities remain native:

    model discovery  -> GET /api/tags + POST /api/show
    web search       -> POST /api/web_search
    web fetch        -> POST /api/web_fetch

DSH routes web_search and web_fetch through ctx.web. Their provider selection is independent of the selected chat model and adapter.

## Endpoint mapping

The llm-ollama settings section stores the native Ollama base URL because discovery and Web capabilities use it directly. The default is:

    https://ollama.com/api

The chat adapter maps the native sibling endpoint to:

    https://ollama.com/v1

A base ending in /api becomes /v1, an existing /v1 remains unchanged, and every other custom root gains a trailing /v1.

## Model catalog

Discovery reads /api/tags, deduplicates native ids, and enriches selected models through /api/show. The native metadata provides context length plus vision, tools, and thinking capabilities that /v1/models does not expose.

The saved catalog is converted into pi-ai model descriptors for chat:

- vision controls text/image input modalities;
- thinking controls reasoning availability;
- known Cloud families expose only vendor-real levels and pin a per-model defaultEffort;
- unknown thinking models keep off, low, medium, high, and max with no plugin default;
- discovered context length sizes the pi-ai model;
- a configured model or route maxTokens becomes a request default;
- models absent from the saved catalog are rejected.

The fallback context window is 262,144 tokens. Discovery should provide an exact value for normal operation; the fallback also leaves headroom for pi-ai's context-safety reserve when metadata is unavailable.

## OpenAI compatibility profile

The adapter pins Ollama-specific pi-ai compatibility instead of relying on generic endpoint detection:

- use max_tokens, not max_completion_tokens;
- send reasoning_effort for thinking models;
- request streaming usage;
- keep system messages as system messages;
- do not send store or prompt_cache fields.

Provider-issued OpenAI tool-call IDs are retained end to end through tool results and the session log. The old private native adapter's locally synthesized call IDs are no longer used for new chat requests.

## Runtime faces

The Host plugin registers:

- the OllamaAdapter route;
- the llm-ollama settings section;
- Ollama Web Search and Fetch providers;
- the loopback-only discovery/save RPC.

The client plugin contributes the Ollama Cloud settings card and model picker. The settings namespace, credential reference, provider id, and picker behavior remain stable across the chat protocol migration.

## Web request resilience

Search and Fetch reject redirects before following them. Each attempt has a configurable webRequestTimeoutMs budget, defaulting to 15 seconds. One transient timeout or pre-response transport failure is retried; HTTP errors, malformed replies, missing credentials, redirects, and caller cancellation are not retried.

## Alternatives

OpenAI Responses is not used because Ollama supports only the non-stateful flavor and DSH already owns history. Anthropic Messages is not used because Ollama Cloud requires an additional Bearer authorization header and the compatibility surface has no model listing or prompt caching. Supporting multiple chat protocols behind one route would multiply serializer, replay, and failure behavior without a current consumer.

## Known limitations

- GenerateOptions.stop remains unsupported by the shared PiAiAdapter.
- Ollama does not publish per-model output limits, so maxTokens remains deployment configuration.
- /api/show reports thinking capability but not the exact accepted effort set; the plugin applies Ollama's documented general rule and GPT-OSS exception.
- Existing logs written by v0.2.2 and earlier can contain duplicate ollama-call-0 values; they are not migrated.
