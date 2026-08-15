# dsh-llm-ollama

[English](README.md) | 中文

这是 Harness LLM 能力的 Ollama Cloud 原生聊天适配器：通过直接 `fetch` 和 NDJSON（逐行 JSON）把 Ollama 原生 `/api/chat` 线协议转换为 `StreamChunk` 协议。默认公共端点的模型发现会把 `/api/tags` 与 cloud 筛选搜索页合并，按 id 去重，移除 HTML 中的 `-cloud` 后缀且不还原，再通过 `/api/show` 获取 OpenAI 兼容 `/v1/models` 列表不提供的上下文窗口与能力（视觉、推理、工具调用）。同一个 Host 插件还把 Ollama 的 `/api/web_search` 与 `/api/web_fetch` 以 `ollama-cloud` 为 id 注册进 Harness 的 web 能力 seam。

包根入口公开 Cordis 插件协议和 `OllamaAdapter`；线协议序列化、NDJSON 解析与 chunk 转换辅助函数不属于根入口的公开协议。同一个 npm 包还导出 `./client` Web client 插件，在 **设置 → 插件 → 插件配置** 中贡献一张 Ollama Cloud 卡片。安装无需修改任何 Harness 核心包或 profile patch。

## 安装

需要 DeepSeek Harness `0.1.0-rc.6` 或更高版本。可直接从 GitHub 安装：

```sh
dsh plugin --profile web add github:NOirBRight/dsh-llm-ollama
dsh web
```

npm 版本发布后，`dsh plugin --profile web add dsh-llm-ollama` 会从 registry 安装同一个包。

仓库会跟踪可直接发布的 `lib/` 产物，因此从 GitHub 安装时无需允许构建脚本。包内的 `dsh.bundle` manifest 插入 Host 适配器，`dsh.client` manifest 让正在运行的 Web Host 提供 `lib/client.js`。移除 bundle 会同时移除两个入口。源码 checkout 构建完成后可运行 `dsh plugin --profile web add link:/absolute/path/to/dsh-llm-ollama`。

## Web 配置

打开 **设置 → 插件 → 插件配置 → Ollama Cloud**。卡片通过 Harness 凭据 API 把 API key 写入 `OLLAMA_API_KEY`；Host 不会在凭据或设置响应中返回已保存的明文。base URL 与模型目录会通过一次带 revision 防护的 `llm-ollama` 设置 mutation 共同保存，因此再次打开时不会看到只保存其中一项的状态。部署级请求默认值仍可在 YAML 中配置，但插件卡片不会展示这些高级选项。Harness 配置面仅限 loopback：通过远程域名访问的浏览器会看到卡片及说明提示，而不是编辑器。请在主机本机（或经 SSH 转发）完成配置，已保存的设置对远程会话照常生效。

**获取可用模型** 会立即打开 Harness frame overlay 选择器，再把尚未保存的端点和输入框中的当前 key 发送到包内仅限 loopback 的 Connection RPC；输入框为空时，Host 使用已保存的凭据。发现期间选择器会明确显示加载或失败状态，而不是在请求完成前保持不出现。使用默认公共端点时，Host 会把 `/api/tags` 与 `/search?c=cloud` 的 cloud 模型卡片合并，移除 HTML 中的 `-cloud` 后缀且不还原，按 id 去重，再以最多六路并发通过 `/api/show` 丰富模型元数据；自定义端点只读取 `/api/tags`。结果保留 tag 顺序，并追加只在 cloud 列表中的模型。`/api/show` 只报告模型是否支持 thinking，不提供逐模型推理等级。适配器根据 Ollama 文档中的原生 `think` 规则提供等级，并单独处理 GPT-OSS 的较窄规则。Ollama 不公开输出上限，因此该值仍由用户编辑。

Models 页面仍会列出并可选择已保存的 `ollama-cloud` 模型。当前 Harness 版本没有为第三方提供方开放该页内的编辑器扩展点，因此完整编辑器位于插件配置中。

## 网页搜索与抓取

当部署挂载 web 能力 seam 时，Host 插件会把 Ollama 的[网页搜索](https://docs.ollama.com/capabilities/web-search)与网页抓取端点以 `ollama-cloud` 为 id 注册为 provider，与聊天路由复用同一份凭据和 API 地址。注册本身不改变任何行为：provider 选择属于部署策略，base bundle 默认 pin 的是 `deepseek-official`。要让 agent 的网页搜索/抓取工具改走 Ollama，在 profile 的 `cordis.patch.yml`（Web profile 为 `~/.dsh/profiles/web/cordis.patch.yml`）中 pin 两个 provider：

```yaml
- id: web
  config:
    searchProvider: ollama-cloud
    fetchProvider: ollama-cloud
```

省略 `fetchProvider` 则只把搜索切到 Ollama，抓取继续使用内置的本地 HTTP 抓取器。编辑后重启 profile 生效。两个 provider 都会在跟随重定向前拒绝请求，API key 不会被转发到重定向目标。

## 协议选择

本适配器只实现原生 `/api/chat` 协议。[架构记录](docs/architecture.zh.md)说明了协议与双运行时包的决策。Ollama Cloud 也提供 OpenAI 兼容（`/v1/chat/completions`）与 Anthropic 兼容（`/v1/messages`）端点，但本包不使用它们：

- **发现**使用 `/api/tags` 和 `/api/show`；默认公共端点还会从 `/search?c=cloud` 补充 cloud 模型卡片。原生响应会返回 `model_info.*.context_length` 与 `capabilities`（视觉、推理、工具调用）；OpenAI 兼容 `/v1/models` 只返回模型 id。
- **OpenAI 兼容**已可由 `@deepseek-ai/dsh-llm-pi-ai` 通过手工声明的 route 支持（`api: openai-completions`，`baseURL: https://ollama.com/v1`）。
- **Anthropic 兼容**面向 Claude Code 等工具；Harness 使用自己的 provider-neutral 消息表示。

通用 thinking 模型的原生 `think` 字段支持 OpenAI `reasoning_effort` 没有的 `"max"`；GPT-OSS 只接受 `"low"`、`"medium"`、`"high"`。原生 `images` 可直接接受 base64 数组。

## 配置

```yaml
- id: llm-ollama
  name: 'dsh-llm-ollama'
  config:
    apiKeyEnv: OLLAMA_API_KEY  # 默认值；每次请求依次通过 ctx.credentials 与环境变量解析
    baseURL: https://ollama.com/api # 默认值；Ollama Cloud 公共 API
    maxTokens: 4096            # 可选的正数单请求输出上限；省略时不发送 num_predict（不限制）
    streamIdleTimeoutMs: 300000 # 可选；正数且可作为 Node timer delay；默认五分钟
    retryPolicy:              # 可选；省略时使用有界的 normal 默认策略
      mode: normal
      backoff:
        initialDelayMs: 500
        maxDelayMs: 10000
        jitterRatio: 0.1
    defaultContextWindow: 4096 # 可选的正整数后备值；默认 4096
    models:                   # 可选；默认为空——通过发现填充
      - id: gpt-oss:20b
        name: GPT-OSS 20B
        contextWindow: 131072
        thinking: true
      - id: llava
        name: LLaVA
        contextWindow: 4096
        vision: true
```

插件注册唯一 provider route `ollama-cloud` 及其已解析的 `retryPolicy`。请求通过 `provider: ollama-cloud` 选择它；`model` 会原样作为线协议的 `model` 字符串传递，因此 Ollama Cloud 更换模型无需重新注册生命周期条目。省略 `models` 时不公开任何模型；显式列表会替换默认值。目录条目通过 `ctx.llm.listModels('ollama-cloud')` 提供给 ACP 编辑器与 Web 选择器等客户端，但它只提供建议：未列出的模型 id 仍会原样通过。条目省略名称时使用 id。

每个已配置模型的 `contextWindow` 都是可选值。`ctx.llm.resolveModelInfo('ollama-cloud', model).context` 先返回模型的精确值；条目无容量或 id 未列出时返回 `defaultContextWindow`。适配器默认值为 4096，即 Ollama 的默认上下文窗口。

`maxTokens` 是适配器为对话请求配置的输出上限。目录条目可声明自己的 `maxTokens`，并优先用于该模型；未声明的条目和未列出的 id 使用 profile 值。精确模型解析会把最终值公开为 `defaultMaxTokens`；`LlmRuntime` 在 agent loop 写入 `request/header` 前把它具体化为 `GenerateOptions.maxTokens`。显式请求值或 `AgentOptions.maxTokens` 优先，并序列化为 `options.num_predict`。适配器不会按 `contextWindow` 限制该请求预算。

### 模型能力

每个目录条目可声明来自 `/api/show` capabilities 的 `vision`、`thinking` 与 `tools` 标志。`vision: true` 会声明 `inputModalities: ['text', 'image']`；适配器通过持久附件服务接受图片 block，并以 `UNSUPPORTED_CONTENT` 拒绝发送给纯文本模型的图片。`thinking: true` 通常会在 `reasoning` 下依序公开 `off`、`low`、`medium`、`high`、`max`；GPT-OSS id 根据 Ollama 的 [Thinking 文档](https://docs.ollama.com/capabilities/thinking)只公开 `low`、`medium`、`high`。默认等级为 `high`。非推理模型完全省略 `reasoning`。

`think` 线字段把 `off` 映射为 `false`，启用的等级映射为同名字符串。session-title 请求在模型可禁用 thinking 时使用 `think: false`；GPT-OSS 使用 `think: "low"`。对 GPT-OSS 直接请求 `off` 会以 `UNSUPPORTED_REASONING_EFFORT` 失败。非推理模型完全省略 `think` 字段。

### 模型发现

插件为 `llm-ollama` 设置命名空间注册模型发现 handler。配置界面的“获取可用模型”先调用 `GET /api/tags`；使用默认公共端点时还会读取 `/search?c=cloud`，只保留 cloud 模型卡片，移除 HTML 中的 `-cloud` 后缀，并与 tag id 去重。随后逐个调用 `POST /api/show` 提取：

- 来自 `model_info.*.context_length` 或 `parameters` 中 `num_ctx` 的 `contextWindow`（优先使用 `parameters`）
- 来自 `capabilities` 数组的 capabilities（视觉、推理、工具调用）

幂等的 tags 请求会在一次传输失败后重试；持续失败时只报告不含凭据的网络详情。候选元数据会显示在 frame overlay 选择器中；只有加入并保存到设置分节的模型才会由 route 公开。

## 动态配置（设置与凭据）

连接信息不会在加载时冻结。`resolveAdapterOptions` 是从原始 config 到已验证信息的唯一显式解析步骤；适配器通过 thunk **每次 operation 只读取一次**：base URL、目录、请求默认值与空闲预算会在下一次请求生效，进行中的流保留启动时的信息。两个可选能力向该 thunk 提供数据：

- **`ctx.settings`**——插件以同一份 `Config` schema 注册 `llm-ollama` 命名空间，并以 `cordis.yml` 条目作为 composition `base`；用户设置文档中的 `llm-ollama:` 分节可覆盖任何字段，无需重启。
- **`ctx.credentials`**——每次 stream call 都从提供端点的同一份已解析 snapshot 获取 API key。配置只携带 `apiKeyEnv`，不携带明文 key。任何位置都没有 key 时请求以 `MISSING_CREDENTIAL` 失败，但 route 保持注册，模型目录仍可浏览。

唯一在注册时捕获的信息是 retry policy；已解析值变化时，插件会原位重新注册 route。

插件还会在 configurable-provider 目录（`ctx.llm.listConfigurableProviders()`）声明 route：provider 为 `ollama-cloud`，设置命名空间为 `llm-ollama`，设置路径为空。

## 模型体验

### 原生对话请求

#### 模型看到什么

模型看到调用方已有对话转换后的原生 Ollama role、content、base64 图片数组、工具声明、工具调用与工具结果。适配器不添加 system 文本。thinking 模型还会收到所选原生 `think` 等级；session-title 请求通常收到 `think: false`，但 GPT-OSS 因无法禁用 thinking 而收到 `think: "low"`。

#### Token 影响

适配器不增加输入文本 token。已解析的请求 `maxTokens` 会变为 `options.num_predict` 并限制生成输出；省略时不发送输出上限。图片与工具 payload 在模型已配置的上下文窗口内消耗由 provider 决定的上下文。

#### KV Cache 影响

模型与已转换消息前缀不变时保持 prefix-stable。修改较早的消息、图片、工具声明或结果、模型 id 或原生请求选项可能使 provider 侧复用失效；缓存可用性与淘汰由 Ollama 控制。

## 已知限制与延后工作

- **工具名称关联**：Ollama 通过 `tool_name`（函数名称）而非 call id 关联工具结果。如果模型在同一轮调用同名工具两次，Harness `CallId` 能区分它们，但线协议不能；serializer 会按顺序发送两个独立 `{role: 'tool', tool_name: X}` 消息，由 provider 按位置匹配。适配器生成连续 `CallId`，并把 `callId → toolName` 映射保存在 `finish.replayState` 供 replay 使用。
- **Thinking 等级元数据**：`/api/show` 会报告 `thinking` 能力，但不会报告每个模型接受的等级。适配器应用 Ollama 文档中的通用 `off`/`low`/`medium`/`high`/`max` 规则及明确的 GPT-OSS `low`/`medium`/`high` 例外；发现过程无法验证更窄的逐模型集合。
- **未公开 `maxTokens`**：Ollama 不会通过 `/api/show` 公开逐模型最大输出。发现结果的 `maxTokens` 为 `undefined`；适配器的 `defaultMaxTokens` 由部署配置。
- **OpenAI 兼容端点**：需要 OpenAI 兼容 `/v1/chat/completions` 的用户可通过 `@deepseek-ai/dsh-llm-pi-ai` 手工声明 route，使用 `api: openai-completions` 和 `baseURL: https://ollama.com/v1`。本适配器不支持该协议。
- **结构化输出**：根据 Ollama Cloud 文档，该服务不支持 structured outputs。本包不公开 `format` 字段。
