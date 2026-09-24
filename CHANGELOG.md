## v0.6.27

- Verify compatibility with official DeepSeek Harness `0.1.7-rc.1` and accept DSH package versions from `0.1.7-alpha.2` onward.

## v0.6.24

## 0.6.25

- Declare `webServer` on the Host `inject` list (and nested Connection scope) so settings/auth RPC mounts on DSH 0.1.6+ inject enforcement.

Read settings before credential status. Register catalog extras against providers-ui 0.2.9.

## v0.6.23

DSH Host packages are no longer version-locked. `@deepseek-ai/dsh-*` peers are `*` and optional; unknown Hosts warn once and still mount. Cordis stays `>=4.0.2 <5.0.0`. Compile-target `devDependencies` remain `0.1.5-rc.1`.

## v0.6.22

- 详情页改用共享模板 `ProviderDetail`（由设置页通过 slot 上下文下发，插件不再自带模板与样式）。
- 模型行交给模板渲染：`items`（行数据）+ `extra`（该行的上下文窗口、能力勾选、默认思考等级等私有字段），插件不再画行卡片；行内字段固定列槽、排序态只读并收起、单层圆角。
- 详情模式下插件不再自行请求额度（`props.mode === 'detail'` 时直接返回），额度由设置页的共享缓存提供，右上角刷新走 `props.onRefresh`。
- 高级设置按原型：分隔线区块 + 折叠箭头 + 右侧说明，选项为「复选框 + 缩进说明」。
- 移动端：工具栏与标题同一行（无换行、无溢出），窄屏自动收紧。
- 依赖 `dsh-llm-providers-ui` 升级到 `0.2.0`（破坏性接口：必须使用 slot 下发的 `template`/`copy` 与 `items`/`extra`）。

## v0.6.21

- 详情页改用共享模板 `ProviderDetail`（由设置页通过 slot 上下文下发，插件不再自带模板与样式）。
- 模型行交给模板渲染：`items`（行数据）+ `extra`（该行的上下文窗口、能力勾选、默认思考等级等私有字段），插件不再画行卡片；行内字段固定列槽、排序态只读并收起、单层圆角。
- 详情模式下插件不再自行请求额度（`props.mode === 'detail'` 时直接返回），额度由设置页的共享缓存提供，右上角刷新走 `props.onRefresh`。
- 高级设置按原型：分隔线区块 + 折叠箭头 + 右侧说明，选项为「复选框 + 缩进说明」。
- 移动端：工具栏与标题同一行（无换行、无溢出），窄屏自动收紧。
- 依赖 `dsh-llm-providers-ui` 升级到 `0.2.0`（破坏性接口：必须使用 slot 下发的 `template`/`copy` 与 `items`/`extra`）。

## v0.6.20

- 详情页改用共享模板 `ProviderDetail`（由设置页通过 slot 上下文下发，插件不再自带模板与样式）。
- 模型行交给模板渲染：`items`（行数据）+ `extra`（该行的上下文窗口、能力勾选、默认思考等级等私有字段），插件不再画行卡片；行内字段固定列槽、排序态只读并收起、单层圆角。
- 详情模式下插件不再自行请求额度（`props.mode === 'detail'` 时直接返回），额度由设置页的共享缓存提供，右上角刷新走 `props.onRefresh`。
- 高级设置按原型：分隔线区块 + 折叠箭头 + 右侧说明，选项为「复选框 + 缩进说明」。
- 移动端：工具栏与标题同一行（无换行、无溢出），窄屏自动收紧。
- 依赖 `dsh-llm-providers-ui` 升级到 `0.2.0`（破坏性接口：必须使用 slot 下发的 `template`/`copy` 与 `items`/`extra`）。

# Changelog

## [0.6.19] - 2026-09-09

- Pin GLM-5.3 / GLM-5.3 Flash to vendor `low` / `high` / `max` (default `max`) instead of the generic five-level map.
- Do not advertise Codex five-level effort for Mistral Large 3; it has no reasoning grades.
- Read the monthly usage window ollama.com reports for current account tiers alongside session and weekly.
- Host usage reads that cannot resolve a usable credential answer `INVALID_CREDENTIAL` so the shared quota cache can evict stale readings.
- Migrate the host plane to DeepSeek Harness `0.1.5-rc.1`; verified runtimes now include `0.1.5-rc.1` alongside Alpha.4 and `0.1.2-rc.1`.
- Development dependency and install guidance point at the `dsh-llm-providers-ui` `v0.1.12-015rc1d` candidate tarball.

## [0.6.18] - 2026-09-07

### Changed

- Adopt the shared provider-ui header from `dsh-llm-providers-ui` 0.1.10; remove the per-provider header fork.
- Header quota loads collapsed once settings are ready with idle dedup so expansion never refires; a failed read shows a truthful unavailable dash, never a fabricated percent.
- Development dependency now points at the final `dsh-llm-providers-ui` 0.1.10 release URL with pinned integrity.

## [0.6.17] - 2026-09-03

### Changed

- DSH compatibility declarations cover the verified Alpha.4 and rc.1 runtimes.
- Unknown runtimes warn once and use the normal best-effort mount path; only reproduced failures may be blocklisted.


## 0.6.14

- Settings → LLM Providers: drag cards to reorder; chat picker follows `llm-providers.order` via dsh-llm-providers-ui.


## 0.6.13

- Fix sandbox escalation-schema leak for Ollama: narrow tool `sandbox_permissions` enum to strictly-wider modes scanned from `system` and context-injection `messages`; danger-full-access removes `sandbox_permissions`+justification, read-only keeps both, workspace-write keeps only danger-full-access, original schema unmutated; applied to direct `stream` and `prepareCall` stream

## 0.6.12


- Remove stale RC-only client test dependencies from the alpha1 compatibility gate
- Keep the frozen-install CI and quota-free provider suite release-blocking

## 0.6.11

- Support the DSH 0.1.2-alpha.1 Host image-pricing call while retaining neutral heuristic pricing
- Restore full published-RC and alpha1 client builds with a structural settings scope interface
- Check the built alpha1 adapter contract in CI

## 0.6.9

- Unify model catalog to opencode baseline (Context first row, Vision/Reasoning/Default thinking second row, 32/36px)

## 0.6.7

- Preserve ordinary chat image attachments on DSH 0.1.1-rc.2 by declaring its resolved request-image budgets
- Add a regression test for the rc.2 image-budget contract

## 0.6.6

- Own `prepareCall` so dsh 0.1.1-rc.2 Host can snapshot provider options before streaming
- Widen Host peer ranges to `>=0.1.0-rc.6 <0.1.1 || >=0.1.1-rc.1 <1.0.0`

## 0.6.5

- dsh RC1 compatibility

## 0.6.4

- Verify the eight-retry policy through resolved configuration and real Loader composition while preserving quota and unknown failures

## 0.6.3

- Classify documented status-less Ollama generation, reachability, and overload failures as retryable `SERVER` errors

## 0.6.2

- Retry model requests up to eight times by default; provider configuration can override the budget

## 0.6.1

- Show official reset time under Cloud usage bars when the endpoint reports one; otherwise show the documented 5-hour session / 7-day weekly period
- Rename Settings nav/title from Providers to LLM Providers / LLM 供应商

## 0.6.0

- Move the settings card from Plugins to Settings → Providers
- The Providers nav row is claimed by the first installed provider plugin and disappears when all of them are uninstalled
- Collapsed cards show a short connection status and model count
- Usage refresh shows a skeleton, a spinning official refresh glyph, a failure hint next to the button, and a last-updated clock