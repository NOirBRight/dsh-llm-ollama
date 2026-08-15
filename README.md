# dsh-llm-ollama

English | [中文](README.zh.md)

Ollama Cloud native chat adapter for the harness LLM seam: direct `fetch` + NDJSON (newline-delimited JSON) translating the Ollama native `/api/chat` wire format into the `StreamChunk` protocol. Model discovery interrogates `/api/tags` + `/api/show` for context windows and capabilities (vision, thinking, tools) that the OpenAI-compatible `/v1/models` listing does not provide.

The package root exposes the Cordis plugin contract and `OllamaAdapter`; wire serialization, NDJSON parsing, and chunk translation helpers are not part of that root contract. The same npm artifact also exports `./client`, a Web client plugin that contributes one Ollama Cloud card to **Settings → Plugins → Plugin configuration**. No Harness core package or profile patch requires modification.

## Installation

DeepSeek Harness `0.1.0-rc.6` or later is required. Install directly from GitHub:

```sh
dsh plugin --profile web add github:NOirBRight/dsh-llm-ollama
dsh web
```

After an npm release, `dsh plugin --profile web add dsh-llm-ollama` installs the same package from the registry.

The repository tracks release-ready `lib/` artifacts, so GitHub installation needs no build-script allowlist. The package's `dsh.bundle` manifest inserts the Host adapter, while its `dsh.client` manifest makes the running Web host serve `lib/client.js`. Removing the bundle removes both faces. A source checkout can use `dsh plugin --profile web add link:/absolute/path/to/dsh-llm-ollama` after building the package.

## Web configuration

Open **Settings → Plugins → Plugin configuration → Ollama Cloud**. The card writes the API key through the Harness credentials API under `OLLAMA_API_KEY`; the Host never returns the stored literal in credential or settings responses. It edits the base URL, fallback context window, optional output cap, stream idle timeout, and model catalog through the revision-fenced `llm-ollama` settings section.

**Fetch available models** calls the package's loopback-only Connection RPC with the unsaved endpoint and an optional one-shot key. The Host interrogates `/api/tags` and `/api/show`, then returns model ids, context windows, and native vision/thinking/tools flags. The user selects which rows to add before saving. Thinking rows automatically expose `off`, `low`, `medium`, `high`, and `max` through the adapter; output limits remain editable because Ollama does not disclose them.

The Models page still lists saved `ollama-cloud` models and can select them. Current Harness releases do not provide a third-party editor extension inside that page, so this package owns its complete editor under Plugin configuration instead.

## Protocol choice

This adapter implements only the native `/api/chat` protocol. The [architecture record](docs/architecture.md) explains the protocol and dual-runtime package decision. Ollama Cloud also exposes OpenAI-compatible (`/v1/chat/completions`) and Anthropic-compatible (`/v1/messages`) endpoints, but neither is used here:

- **Discovery** requires `/api/tags` + `/api/show`, which return `model_info.*.context_length` and `capabilities` (vision, thinking, tools). The OpenAI-compatible `/v1/models` returns only model ids.
- **OpenAI-compatible** is already covered by `@deepseek-ai/dsh-llm-pi-ai` as a hand-declared route (`api: openai-completions`, `baseURL: https://ollama.com/v1`).
- **Anthropic-compatible** exists for tools like Claude Code, not for the harness, which has its own provider-neutral message vocabulary.

The native `think` field supports `"max"` (not available in OpenAI `reasoning_effort`), and native `images` accepts base64 arrays directly.

## Config

```yaml
- id: llm-ollama
  name: 'dsh-llm-ollama'
  config:
    apiKeyEnv: OLLAMA_API_KEY  # default; resolved per request via ctx.credentials, then the environment
    baseURL: https://ollama.com/api # default; the public Ollama Cloud API
    maxTokens: 4096            # optional positive per-request output cap; omitted sends no num_predict (unlimited)
    streamIdleTimeoutMs: 300000 # optional; positive finite Node timer delay; five-minute default
    retryPolicy:              # optional; omission uses bounded normal defaults
      mode: normal
      backoff:
        initialDelayMs: 500
        maxDelayMs: 10000
        jitterRatio: 0.1
    defaultContextWindow: 4096 # optional positive-integer fallback; this is the default
    models:                   # optional; defaults to none — use discovery to populate
      - id: gpt-oss:20b
        name: GPT-OSS 20B
        contextWindow: 131072
        thinking: true
      - id: llava
        name: LLaVA
        contextWindow: 4096
        vision: true
```

The plugin registers the single provider route `ollama-cloud` together with its resolved `retryPolicy`. A request selects it with `provider: ollama-cloud`; its `model` is passed through as the wire `model` string, so changing Ollama Cloud models does not require lifecycle-time registration. Omitting `models` advertises none; an explicit list replaces those defaults. Catalog entries are exposed through `ctx.llm.listModels('ollama-cloud')` for clients such as ACP editors and the Web selector, but remain advisory: unlisted model ids still pass through unchanged. An omitted entry name defaults to its id.

`contextWindow` is optional per configured model. `ctx.llm.resolveModelInfo('ollama-cloud', model).context` returns an exact model value first, then `defaultContextWindow` for an entry without capacity or an unlisted pass-through id. The adapter default is 4096 (Ollama's default context window).

`maxTokens` is the adapter-configured output cap for conversation requests. A catalog entry may carry its own `maxTokens`, which wins for that model; an entry without one, and any unlisted pass-through id, resolve to the profile value. Exact-model resolution exposes the winner as `defaultMaxTokens`; `LlmRuntime` materializes that value into `GenerateOptions.maxTokens` before the agent loop writes `request/header`. An explicit request or `AgentOptions.maxTokens` value wins and is serialized as `options.num_predict`. The adapter does not clamp this request budget against `contextWindow`.

### Model capabilities

Each catalog entry may declare `vision`, `thinking`, and `tools` flags (from `/api/show` capabilities). A `vision: true` entry declares `inputModalities: ['text', 'image']`; the adapter accepts image blocks through the durable attachment service and rejects images on text-only models with `UNSUPPORTED_CONTENT`. A `thinking: true` entry exposes ordered `off`, `low`, `medium`, `high`, and `max` reasoning efforts under `reasoning`; the default effort is `high`. A non-thinking model omits `reasoning` entirely.

The `think` wire field maps: `off` → `think: false`; `low`/`medium`/`high`/`max` → `think: "<level>"`. A request with `GenerateOptions.purpose: 'session-title'` forces `think: false`. For non-thinking models, the `think` field is omitted entirely.

### Model discovery

The plugin registers a model discovery handler for the `llm-ollama` settings namespace. The configuration surface's "fetch available models" action calls `GET /api/tags` to list models, then `POST /api/show` per model to extract:

- `contextWindow` from `model_info.*.context_length` or `parameters` `num_ctx` (preferring `parameters`)
- `capabilities` (vision, thinking, tools) from the `capabilities` array

The reply is candidate metadata the surface offers for adoption; `settings.yaml` remains the only thing that decides what a route serves.

## Dynamic configuration (settings + credentials)

Connection facts are not frozen at load. `resolveAdapterOptions` is the one explicit resolve step from raw config to validated facts, and the adapter re-reads them through a thunk **once per operation**: base URL, catalog, request defaults, and idle budget all take effect on the next request, while an in-flight stream keeps the facts it started with. Two optional seams feed that thunk:

- **`ctx.settings`** — the plugin registers the `llm-ollama` namespace with this same `Config` schema and its `cordis.yml` entry as the composition `base`, so a `llm-ollama:` section in the user settings document overrides any field without a restart.
- **`ctx.credentials`** — the API key resolves per stream call, from the *same* resolved snapshot that supplies the endpoint. Configuration carries only `apiKeyEnv`, never a literal key. A request with no key anywhere fails with `MISSING_CREDENTIAL`, while the route stays registered and the catalog stays browsable.

The one registration-captured fact is the retry policy: when its resolved value changes, the plugin re-registers the route in place.

The plugin also declares its route in the configurable-provider directory (`ctx.llm.listConfigurableProviders()`): provider `ollama-cloud`, settings namespace `llm-ollama`, empty settings path.

## Model Experience

### Native conversation request

#### What the model sees

The model receives the caller's existing conversation translated to native Ollama roles, content, base64 image arrays, tool declarations, tool calls, and tool results. The adapter adds no system text. `thinking` models also receive the selected native `think` level; session-title requests receive `think: false`.

#### Token effect

The adapter adds no input text tokens. The resolved request `maxTokens` becomes `options.num_predict` and caps generated output; omission sends no output cap. Image and tool payloads consume provider-defined context within the model's configured context window.

#### KV Cache effect

An unchanged model and translated message prefix remain prefix-stable. Changes to earlier messages, images, tool declarations or results, model id, or native request options can invalidate provider-side reuse; Ollama controls cache availability and eviction.

## Known Limitations and Deferred Work

- **Tool-name correlation**: Ollama correlates tool results by `tool_name` (the function name), not by a call id. If the model calls the same tool twice in one turn, the harness `CallId` distinguishes them, but the wire cannot — the serializer sends both as separate `{role: 'tool', tool_name: X}` messages in order, and the provider matches them positionally. The adapter generates sequential `CallId`s and stores the `callId → toolName` mapping in `finish.replayState` for replay.
- **GPT-OSS thinking**: GPT-OSS requires `think: "low"|"medium"|"high"` and cannot disable thinking. The adapter exposes `off` for all thinking models; if GPT-OSS rejects `think: false`, the error propagates as `INVALID_REQUEST`. A per-model `noOff` flag is a future enhancement.
- **`maxTokens` not disclosed**: Ollama does not disclose per-model max output through `/api/show`. Discovery sets `maxTokens: undefined`; the adapter's `defaultMaxTokens` is a deployment-configured value.
- **OpenAI-compatible endpoint**: users who want the OpenAI-compatible `/v1/chat/completions` endpoint can use `@deepseek-ai/dsh-llm-pi-ai` as a hand-declared route with `api: openai-completions` and `baseURL: https://ollama.com/v1`. This adapter does not support that protocol.
- **Structured outputs**: Ollama Cloud does not support structured outputs (per the docs). The `format` field is not exposed.