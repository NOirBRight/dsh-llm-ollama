# dsh-llm-ollama

[English](README.md) | 中文

DeepSeek Harness 的 Ollama Cloud 集成。聊天通过共享的 pi-ai adapter 使用 Ollama 的 OpenAI-compatible Chat Completions；模型发现和 Web Search/Fetch 继续使用 Ollama 原生 API，因为这些独立能力不属于聊天协议。

包根入口公开 Cordis plugin contract 和 OllamaAdapter。同一 artifact 还导出 ./client，在 Settings → LLM Providers 中提供 Ollama Cloud 卡片。协议与能力分离决策记录在 [ADR 0001](docs/adr/0001-separate-chat-protocol-from-ollama-capabilities.zh.md)。

## 安装

要求 DeepSeek Harness 0.1.0-rc.6 或更高版本。直接从 GitHub 安装：

~~~sh
dsh plugin --profile web add github:NOirBRight/dsh-llm-ollama#v0.6.4
dsh web
~~~

仓库跟踪可直接发布的 lib artifacts，因此 GitHub 安装不需要 build-script allowlist。源码 checkout 可在执行 pnpm run build 后使用 link 安装。

## Web 配置

打开 Settings → LLM Providers → Ollama Cloud。卡片通过 Harness credentials API 把 API key 存到 OLLAMA_API_KEY；Host 不会返回已保存的明文。它会用一次带 revision 防护的 llm-ollama mutation 同时保存原生 base URL 和模型目录。

Fetch available models 会立即打开 picker，并用未保存 endpoint 和一次性 key 调用包的 loopback-only RPC。Host 读取 /api/tags、按原生 id 去重，并最多并发六个 /api/show 请求 enrich 模型。原生元数据会提供 /v1/models 不提供的 context window 及 vision、thinking、tools 标志。Picker 从当前草稿选择初始化，保留 current-only 模型，并在应用时替换草稿目录。

卡片的「云端用量」区与 ollama.com/settings 一致：Host 用已存（或一次性）key 读取 GET <baseURL>/usage，把 Session 和每周窗口渲染成已用百分比进度条，并列出本周各模型的请求数。凭据不会传到浏览器。没有用量接口的自建端点会显示「不支持」提示而不是报错。

模型目录默认折叠，展开后一行一个模型：左侧把手可拖动排序（顺序随目录一起保存），右侧箭头展开该行的上下文窗口、最大输出和能力开关，垃圾桶按钮删除该行。

### 插件配置截图

云端用量与完整的每周模型活动列表：

![Ollama Cloud 连接与云端用量](docs/images/ollama-cloud-usage.png)

可拖动排序的模型目录：

![Ollama Cloud 可排序模型目录](docs/images/ollama-model-catalog.png)

Models 页面会列出已保存的 ollama-cloud 模型并允许选择。当前 Harness 版本没有 Models 页面里的第三方编辑器 slot，因此本包在 Plugin configuration 中持有完整编辑器。

## 能力与协议分离

聊天使用：

    POST <openai-base>/chat/completions

配置中的 baseURL 仍表示 Ollama 原生 API 地址。插件会把聊天映射到相邻的 /v1：

    https://ollama.com/api  ->  https://ollama.com/v1
    http://localhost:11434/api  ->  http://localhost:11434/v1

Ollama 原生独立能力继续使用：

    模型发现  ->  GET /api/tags + POST /api/show
    网页搜索  ->  POST /api/web_search
    网页抓取  ->  POST /api/web_fetch

Search 和 Fetch 是 ctx.web provider，因此可与任意聊天模型配合。只要 profile 选择 ollama-cloud，DeepSeek、Codex、Kimi 或 OpenAI-compatible 聊天模型都可以调用 Ollama 提供的 web_search 工具。

不把 OpenAI Responses 设为默认，因为 Ollama 只支持 non-stateful 版本。不把 Anthropic Messages 设为默认，因为 Ollama Cloud 需要额外 Bearer header，而且该兼容面没有模型列表或 prompt caching。

## Web 搜索与抓取

Host plugin 会把两个 Web provider 注册为 ollama-cloud。注册本身不会改变部署策略；在 profile patch 中 pin 需要的 provider：

~~~yaml
- id: web
  config:
    searchProvider: ollama-cloud
    fetchProvider: ollama-cloud
~~~

省略 fetchProvider 可继续使用内置 HTTP fetcher，只把搜索切到 Ollama。两个 provider 都会在跟随 redirect 前拒绝。每次尝试默认有 15 秒预算，一次瞬时超时或收到 HTTP 响应前的传输失败会重试；HTTP 错误、格式错误响应、缺失凭据、redirect 和调用方取消不会重试。

## 配置

~~~yaml
- id: llm-ollama
  name: 'dsh-llm-ollama'
  config:
    apiKeyEnv: OLLAMA_API_KEY
    baseURL: https://ollama.com/api
    maxTokens: 4096
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

bundle 默认对符合条件的模型请求失败最多重试八次。官方无状态码的生成、可达性和过载失败归类为 `SERVER`；鉴权、无效请求和不支持内容失败仍不可重试。

Provider route 继续是 ollama-cloud，设置命名空间继续是 llm-ollama。只有配置目录中的模型可以聊天。模型 entry 的 maxTokens 优先于 route 值；两者都不存在时，adapter 不设置请求默认。Ollama 不公开逐模型输出限制，因此发现结果不会填写 maxTokens。

Fallback context window 是 262,144 tokens。正常情况下发现过程应提供精确模型值；元数据缺失时，该 fallback 也为 pi-ai 的上下文安全余量留出空间。

### 模型能力

vision 决定 text/image 输入模态。thinking 启用可选择的 reasoning effort。已知的 Ollama Cloud 家族只暴露厂商真实档，并在会话未选择时使用插件 `defaultEffort`（GLM-5.2 和 Kimi K3 默认 max；DeepSeek V4 和 MiniMax M3 默认 high；GPT-OSS 默认 medium；Nemotron Super/Nano 默认 low）。未知 thinking model 仍提供 off、low、medium、high、max，且不设插件默认。tools 记录发现元数据；实际请求会携带当前 DSH tool definitions。

Ollama 的 OpenAI Chat Completions profile 被显式固定：发送 max_tokens、reasoning_effort 和 streaming usage，保留 system role，不发送 store、max_completion_tokens 或 prompt_cache 字段。

## 模型体验

### Prompt 影响

System prompt 和所有 provider-neutral 消息由 PiAiAdapter 转换成 OpenAI Chat Completions messages。工具调用保留 provider 签发的 id，工具结果用匹配的 tool_call_id 返回。只有标记 vision-capable 的模型会接收 base64 data URL 图片。

### Token 影响

Usage 映射成 Harness input/output 计数。pi-ai 会按配置的 context capacity clamp maxTokens 并保留安全余量。Ollama 当前不会通过该 endpoint 提供 cache-read/cache-write 统计。

### KV Cache 影响

模型、system prompt、历史、tool definitions 和请求选项不变时，序列化前缀保持稳定。Tool-call id 是 provider 签发的协议字段，回放时保持不变。修改更早消息、工具、图片、模型 id 或 reasoning/output 选项可能使 provider 侧复用失效。

## 已知限制与延后工作

- 共享 PiAiAdapter 不支持 GenerateOptions.stop。
- 不在保存目录中的模型会被拒绝；旧原生 adapter 的 pass-through 行为被移除。
- /api/show 会报告 thinking 能力，但不会报告精确 effort 集合，因此插件应用 Ollama 通用规则和 GPT-OSS 例外。
- Ollama 不公开逐模型输出限制。
- v0.2.2 及更早版本的日志可能包含重复 ollama-call-0；本次不迁移旧日志。
- 本包不公开 structured-output format 配置。
