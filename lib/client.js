window.__ModuleLoader__.load({
	id: "dsh-llm-ollama",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let react_dom = require("react-dom");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client-contract.ts
		/** Browser-safe constants and JSON decoders shared by the Host and client plugin faces. */
		/** Settings namespace owned by the Ollama Cloud plugin. */
		const OLLAMA_SETTINGS_NAMESPACE = "llm-ollama";
		/** Private Connection RPC channel used by this package's two runtime faces. */
		const OLLAMA_RPC_CHANNEL = "/ollama-cloud";
		/** Rich model-discovery endpoint inside {@link OLLAMA_RPC_CHANNEL}. */
		const OLLAMA_DISCOVER_ENDPOINT = "models/discover";
		/** Atomic settings-save endpoint inside {@link OLLAMA_RPC_CHANNEL}. */
		const OLLAMA_SAVE_ENDPOINT = "settings/save";
		/** Cloud usage-snapshot endpoint inside {@link OLLAMA_RPC_CHANNEL}. */
		const OLLAMA_USAGE_ENDPOINT = "usage/read";
		/** Provider-owned settings snapshot endpoint; includes redacted credential status. */
		const OLLAMA_SETTINGS_READ_ENDPOINT = "settings/read";
		/** Provider-owned credential write endpoint; accepts a new key but never returns it. */
		const OLLAMA_CREDENTIAL_STATUS_ENDPOINT = "credential/status";
		/** Provider-owned credential write endpoint; accepts a new key but never returns it. */
		const OLLAMA_CREDENTIAL_SET_ENDPOINT = "credential/set";
		function isRecord(value) {
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
			if (!isRecord(value) || typeof value["id"] !== "string" || value["id"].length === 0) return void 0;
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
			if (!isRecord(value)) return void 0;
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
		* Narrow the rich discovery result received by the browser plugin.
		* @param value - untrusted RPC result value.
		* @returns the validated result, or undefined when any model is invalid.
		*/
		function decodeOllamaDiscoveryResult(value) {
			if (!isRecord(value) || !Array.isArray(value["models"])) return void 0;
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
			if (!isRecord(value)) return void 0;
			const usage = value["usage"];
			if (typeof usage !== "number" || !Number.isFinite(usage) || usage < 0) return void 0;
			const modelsValue = value["models"];
			const models = [];
			if (modelsValue !== void 0) {
				if (!Array.isArray(modelsValue)) return void 0;
				for (const entry of modelsValue) {
					if (!isRecord(entry) || typeof entry["name"] !== "string" || entry["name"].length === 0) return void 0;
					const requestCount = entry["requestCount"];
					if (typeof requestCount !== "number" || !Number.isSafeInteger(requestCount) || requestCount < 0) return;
					models.push({
						name: entry["name"],
						requestCount
					});
				}
			}
			const resetsAt = value["resetsAt"];
			if (resetsAt !== void 0 && (typeof resetsAt !== "string" || resetsAt.length === 0)) return void 0;
			return {
				usage,
				models,
				...resetsAt === void 0 ? {} : { resetsAt }
			};
		}
		/**
		* Narrow one usage snapshot.
		* @param value - untrusted JSON value.
		* @returns the validated snapshot, or undefined when it is malformed.
		*/
		function decodeOllamaUsageView(value) {
			if (!isRecord(value)) return void 0;
			if (typeof value["fetchedAt"] !== "string" || value["fetchedAt"].length === 0) return void 0;
			const session = value["session"] === void 0 ? void 0 : decodeOllamaUsageWindow(value["session"]);
			const weekly = value["weekly"] === void 0 ? void 0 : decodeOllamaUsageWindow(value["weekly"]);
			const monthly = value["monthly"] === void 0 ? void 0 : decodeOllamaUsageWindow(value["monthly"]);
			if (value["session"] !== void 0 && session === void 0) return void 0;
			if (value["weekly"] !== void 0 && weekly === void 0) return void 0;
			if (value["monthly"] !== void 0 && monthly === void 0) return void 0;
			if (session === void 0 && weekly === void 0 && monthly === void 0) return void 0;
			return {
				fetchedAt: value["fetchedAt"],
				...session === void 0 ? {} : { session },
				...weekly === void 0 ? {} : { weekly },
				...monthly === void 0 ? {} : { monthly }
			};
		}
		/**
		* Narrow the usage reply returned by the Host usage endpoint.
		* @param value - untrusted RPC result value.
		* @returns the validated reply, or undefined when it is malformed.
		*/
		function decodeOllamaUsageReply(value) {
			if (!isRecord(value)) return void 0;
			if (value["status"] === "unsupported") return { status: "unsupported" };
			if (value["status"] !== "ok") return void 0;
			const usage = decodeOllamaUsageView(value["usage"]);
			return usage === void 0 ? void 0 : {
				status: "ok",
				usage
			};
		}
		/**
		* Narrow the accepted settings snapshot returned by the Host save endpoint.
		* @param value - untrusted RPC result value.
		* @returns the validated result, or undefined when it is malformed.
		*/
		function decodeOllamaSaveResult(value) {
			if (!isRecord(value) || !Number.isSafeInteger(value["revision"])) return void 0;
			const revision = value["revision"];
			const settings = decodeOllamaSettings(value["settings"]);
			if (revision < 0 || settings === void 0) return void 0;
			return {
				settings,
				revision
			};
		}
		function decodeOllamaSettingsReadResult(value) {
			if (!isRecord(value) || !Number.isSafeInteger(value["revision"])) return void 0;
			const settings = decodeOllamaSettings(value["settings"]);
			const credential = value["credential"];
			if (settings === void 0 || !isRecord(credential) || typeof credential["configured"] !== "boolean" || typeof credential["writable"] !== "boolean") return void 0;
			const revision = value["revision"];
			return revision < 0 ? void 0 : {
				settings,
				revision,
				credential: {
					configured: credential["configured"],
					writable: credential["writable"]
				}
			};
		}
		function decodeOllamaCredentialStatus(value) {
			if (!isRecord(value) || typeof value["configured"] !== "boolean" || typeof value["writable"] !== "boolean") return void 0;
			return {
				configured: value["configured"],
				writable: value["writable"]
			};
		}
		//#endregion
		//#region node_modules/.pnpm/dsh-llm-providers-ui@https+++github.com+NOirBRight+dsh-llm-providers-ui+releases+downlo_9fe3bd448b199fdcbe5d71b8de10bff6/node_modules/dsh-llm-providers-ui/lib/usage-readers.js
		/** Bundle-safe quota decoders, RPC readers, and browser cache helpers; no ModuleLoader wrapper or reactive store. */
		/**
		* Wire error code the Host answers when the provider credential is missing or
		* unusable (mirrors `INVALID_CREDENTIAL_CODE` in `@deepseek-ai/dsh-llm`, which a
		* browser bundle cannot import). Mapped to `logged-out` so a provider without a
		* usable credential never keeps serving the previous account's quota.
		*/
		const INVALID_CREDENTIAL_CODE = "INVALID_CREDENTIAL";
		/** Whether one RPC failure means "this provider has no usable credential". */
		function credentialFailure(error) {
			return error.code === INVALID_CREDENTIAL_CODE;
		}
		/** Plain-object guard shared by the reader factories and the sidebar cache validator. */
		function recordUsageValue(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
		}
		const SECRET_KEY = /^(?:accessToken|refreshToken|access_token|refresh_token|id_token|idToken|token|apiKey|api_key)$/iu;
		/** Reject any secret-shaped field before a provider response enters UI state. */
		function secretFree(value) {
			if (Array.isArray(value)) return value.every(secretFree);
			const item = recordUsageValue(value);
			if (item === void 0) return true;
			return Object.entries(item).every(([key, child]) => !SECRET_KEY.test(key) && secretFree(child));
		}
		/** Non-empty string guard shared by the reader factories and the sidebar cache validator. */
		function nonEmptyString(value) {
			return typeof value === "string" && value.length > 0;
		}
		function finiteNumber(value) {
			return typeof value === "number" && Number.isFinite(value);
		}
		/** Non-negative finite number guard shared by the reader factories and the sidebar cache validator. */
		function nonNegativeNumber(value) {
			return finiteNumber(value) && value >= 0;
		}
		function displayNumber(value) {
			return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
		}
		function percentage(value) {
			return Math.round(Math.max(0, Math.min(100, value)));
		}
		function percentageText(value) {
			return displayNumber(percentage(value)) + "%";
		}
		const SHORT_LABELS = [
			[/five|5h|5-hour/u, "5h"],
			[/two-hour|2-hour|2h/u, "2h"],
			[/session/u, "S"],
			[/week/u, "W"],
			[/month/u, "M"],
			[/credit/u, "Cr"],
			[/agent/u, "A"],
			[/daily|day/u, "D"],
			[/local/u, "L"],
			[/other/u, "Oth"]
		];
		function shortLabel(value) {
			const normalized = value.toLowerCase();
			if (/^\d+h$/u.test(normalized)) return normalized;
			return SHORT_LABELS.find(([pattern]) => pattern.test(normalized))?.[1] ?? value.slice(0, 4);
		}
		const PERIOD_RANK = {
			M: 6,
			W: 5,
			D: 4,
			CURS: 3,
			S: 1,
			A: 0,
			L: 0,
			CR: -1
		};
		function periodRank(shortLabelValue) {
			const normalized = shortLabelValue.toUpperCase();
			return PERIOD_RANK[normalized] ?? (/^\d+H$/.test(normalized) ? 2 : 0);
		}
		/** Headline window: longest percentage period, else the first text-only window. */
		function pickPrimaryWindow(windows) {
			let best;
			for (const quotaWindow of windows) {
				if (quotaWindow.remainingPercent === void 0) continue;
				if (best === void 0 || periodRank(quotaWindow.shortLabel) > periodRank(best.shortLabel)) best = quotaWindow;
			}
			return best ?? windows[0];
		}
		function remainingWindow(input) {
			const remaining = input.limit === 0 ? void 0 : percentage(100 * (1 - input.used / input.limit));
			return {
				id: input.id,
				label: input.label,
				shortLabel: shortLabel(input.label),
				...remaining === void 0 ? { valueText: displayNumber(Math.max(0, input.limit - input.used)) + " / " + displayNumber(input.limit) } : {
					remainingPercent: remaining,
					valueText: percentageText(remaining)
				},
				...input.resetsAt === void 0 ? {} : { resetsAt: input.resetsAt }
			};
		}
		function usageResult(value, decode) {
			const response = recordUsageValue(value);
			if (response === void 0 || !secretFree(response)) return {
				status: "error",
				message: "malformed usage response"
			};
			if (response.status === "unsupported") return { status: "unsupported" };
			if (response.status === "logged-out") return { status: "logged-out" };
			if (response.status !== "ok") return {
				status: "error",
				message: "unknown usage status"
			};
			const usage = recordUsageValue(response.usage);
			const decoded = usage === void 0 ? void 0 : decode(usage);
			return decoded === void 0 ? {
				status: "error",
				message: "malformed usage response"
			} : {
				status: "ready",
				...decoded
			};
		}
		function decodeFractionUsage(keys, usage) {
			if (!nonEmptyString(usage.fetchedAt)) return void 0;
			const windows = [];
			for (const key of keys) {
				const value = usage[key];
				if (value === void 0) continue;
				const item = recordUsageValue(value);
				if (item === void 0 || !nonNegativeNumber(item.usage)) return void 0;
				if (item.resetsAt !== void 0 && !nonEmptyString(item.resetsAt)) return void 0;
				windows.push(remainingWindow({
					id: key,
					label: key === "session" ? "Session" : key === "weekly" ? "Week" : "Month",
					used: item.usage,
					limit: 1,
					...item.resetsAt === void 0 ? {} : { resetsAt: item.resetsAt }
				}));
			}
			return {
				fetchedAt: usage.fetchedAt,
				windows
			};
		}
		async function readUsage(rpc, channel, payload, signal, decode) {
			const result = await rpc.call(channel, "usage/read", payload, signal);
			if (result.ok) return usageResult(result.value, decode);
			if (credentialFailure(result.error)) return { status: "logged-out" };
			return {
				status: "error",
				message: result.error.message
			};
		}
		/** Create the Ollama Cloud quota reader declared by the Ollama client plugin. */
		function createOllamaUsageReader() {
			return {
				providerKey: "llm-ollama",
				name: "Ollama Cloud",
				read: (rpc, _refresh, signal) => readUsage(rpc, "/ollama-cloud", {}, signal, (value) => decodeFractionUsage([
					"session",
					"weekly",
					"monthly"
				], value))
			};
		}
		const USAGE_CACHE_KEY = "dsh-llm-providers-ui:usage-cache";
		/**
		* Browser last-good usage cache shared across bundles: the sidebar store and
		* each provider Settings card bundle their own copy of this module, so the
		* module-level memory map below is per-bundle while storage is shared.
		* Readable storage is authoritative, including empty after invalidation; memory
		* is only a fallback while storage is unavailable. Stale status persists
		* honestly, and collapsed-header headlines never replace a full multi-window
		* summary (a later full read upgrades a headline).
		*/
		let memoryUsageCache = /* @__PURE__ */ new Map();
		/** Whether a ready or stale summary retains displayable usage windows.
		* @param summary - Current or retained provider usage.
		* @returns Whether its windows can be displayed and persisted.
		*/
		function hasUsageData(summary) {
			return summary !== void 0 && summary.windows.length > 0 && (summary.status === "ready" || summary.status === "stale");
		}
		function cachedSummary(value) {
			const item = recordUsageValue(value);
			if (item === void 0 || !nonEmptyString(item.providerKey) || !nonEmptyString(item.name)) return void 0;
			const status = item.status;
			if (status !== "ready" && status !== "stale") return void 0;
			if (!Array.isArray(item.windows) || item.windows.length === 0) return void 0;
			const windows = [];
			for (const windowValue of item.windows) {
				const quotaWindow = recordUsageValue(windowValue);
				if (quotaWindow === void 0 || !nonEmptyString(quotaWindow.id) || !nonEmptyString(quotaWindow.label) || !nonEmptyString(quotaWindow.shortLabel) || !nonEmptyString(quotaWindow.valueText)) return void 0;
				if (quotaWindow.remainingPercent !== void 0 && (!nonNegativeNumber(quotaWindow.remainingPercent) || quotaWindow.remainingPercent > 100)) return void 0;
				if (quotaWindow.resetsAt !== void 0 && !nonEmptyString(quotaWindow.resetsAt)) return void 0;
				windows.push({
					id: quotaWindow.id,
					label: quotaWindow.label,
					shortLabel: quotaWindow.shortLabel,
					valueText: quotaWindow.valueText,
					...quotaWindow.remainingPercent === void 0 ? {} : { remainingPercent: quotaWindow.remainingPercent },
					...quotaWindow.resetsAt === void 0 ? {} : { resetsAt: quotaWindow.resetsAt }
				});
			}
			return {
				providerKey: item.providerKey,
				name: item.name,
				status,
				windows,
				...nonEmptyString(item.fetchedAt) ? { fetchedAt: item.fetchedAt } : {}
			};
		}
		/** Readable storage backends. A backend that throws on read is unusable and skipped. */
		function usageStorageBackends() {
			const backends = [];
			for (const name of ["localStorage", "sessionStorage"]) try {
				const backend = globalThis[name];
				if (backend === void 0 || backend === null) continue;
				backend.getItem(USAGE_CACHE_KEY);
				backends.push(backend);
			} catch {}
			return backends;
		}
		function storageRead() {
			const backends = usageStorageBackends();
			if (backends.length === 0) return {
				available: false,
				raw: null
			};
			for (const backend of backends) try {
				const raw = backend.getItem(USAGE_CACHE_KEY);
				if (raw !== null) return {
					available: true,
					raw
				};
			} catch {}
			return {
				available: true,
				raw: null
			};
		}
		function storageWrite(value) {
			for (const backend of usageStorageBackends()) try {
				backend.setItem(USAGE_CACHE_KEY, value);
			} catch {}
		}
		function parseUsageCache(raw) {
			const cached = /* @__PURE__ */ new Map();
			if (raw === null) return cached;
			try {
				const parsed = JSON.parse(raw);
				if (!Array.isArray(parsed)) return cached;
				for (const value of parsed) {
					const item = cachedSummary(value);
					if (item !== void 0) cached.set(item.providerKey, item);
				}
			} catch {}
			return cached;
		}
		function readUsageCache() {
			const { available, raw } = storageRead();
			if (!available) return new Map(memoryUsageCache);
			const fromStorage = parseUsageCache(raw);
			memoryUsageCache = new Map(fromStorage);
			return fromStorage;
		}
		/** Persistable copy: status stays ready/stale as the caller holds it, never laundered to ready. */
		function persistableUsage(summary) {
			return {
				providerKey: summary.providerKey,
				name: summary.name,
				status: summary.status,
				windows: summary.windows,
				...summary.fetchedAt === void 0 ? {} : { fetchedAt: summary.fetchedAt }
			};
		}
		/** A collapsed-header single window, never a full multi-window summary. */
		function isHeadlineOnly(summary) {
			return summary.windows.length === 1 && summary.windows[0]?.id === "headline";
		}
		function writeUsageCache(current) {
			const entries = [...current.values()].filter(hasUsageData);
			const { available, raw } = storageRead();
			if (!available) {
				for (const item of entries) memoryUsageCache.set(item.providerKey, persistableUsage(item));
				return;
			}
			const merged = parseUsageCache(raw);
			for (const item of entries) {
				const previous = merged.get(item.providerKey);
				if (previous !== void 0 && !isHeadlineOnly(previous) && isHeadlineOnly(item)) continue;
				merged.set(item.providerKey, persistableUsage(item));
			}
			memoryUsageCache = new Map(merged);
			if (merged.size === 0) return;
			storageWrite(JSON.stringify([...merged.values()]));
		}
		function dropPersistedUsageKeys(keys) {
			const drop = new Set(keys);
			for (const key of drop) memoryUsageCache.delete(key);
			const { available, raw } = storageRead();
			if (!available || raw === null) return;
			let parsed;
			try {
				parsed = JSON.parse(raw);
			} catch {
				return;
			}
			if (!Array.isArray(parsed)) return;
			const kept = parsed.filter((value) => {
				const item = recordUsageValue(value);
				return item === void 0 || !nonEmptyString(item.providerKey) || !drop.has(item.providerKey);
			});
			if (kept.length === parsed.length) return;
			storageWrite(JSON.stringify(kept));
		}
		/** Last-good quota for a Provider card header, available on first paint. */
		function peekCachedUsage(providerKey) {
			return readUsageCache().get(providerKey);
		}
		function rememberCachedUsage(summary) {
			if (!hasUsageData(summary)) return;
			writeUsageCache(/* @__PURE__ */ new Map([[summary.providerKey, summary]]));
		}
		/**
		* Collapsed-header last-good quota for first paint. Ignores headlines without
		* a finite in-range remaining percent so missing quota renders no meter, never
		* a zero bar. Never replaces a cached full multi-window summary, and records
		* no fetchedAt: a headline is display data, not a fetch, so freshness checks
		* treat it as expired and refetch.
		*/
		function rememberHeadlineQuota(providerKey, name, quota) {
			if (quota?.remainingPercent === void 0 || !Number.isFinite(quota.remainingPercent)) return;
			const remainingPercent = Math.round(quota.remainingPercent * 10) / 10;
			if (remainingPercent < 0 || remainingPercent > 100) return;
			const label = quota.label ?? "Quota";
			rememberCachedUsage({
				providerKey,
				name,
				status: "ready",
				windows: [{
					id: "headline",
					label,
					shortLabel: label,
					valueText: String(remainingPercent) + "%",
					remainingPercent
				}]
			});
		}
		function headerQuotaFromCache(summary) {
			if (summary === void 0) return void 0;
			const quotaWindow = pickPrimaryWindow(summary.windows);
			if (quotaWindow === void 0) return void 0;
			return {
				label: quotaWindow.shortLabel || quotaWindow.label,
				...quotaWindow.remainingPercent === void 0 ? {} : { remainingPercent: quotaWindow.remainingPercent },
				...quotaWindow.resetsAt === void 0 ? {} : { detail: quotaWindow.resetsAt }
			};
		}
		//#endregion
		//#region src/reasoning.ts
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
			"glm-5.3": {
				levels: LOW_HIGH_MAX,
				defaultEffort: "max"
			},
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
			if (named(id, "glm-5.3") || id.startsWith("glm-5.3-")) return "glm-5.3";
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
			if (named(id, "mistral-large-3")) return "mistral-large-3";
			return "generic";
		}
		function policyFor(model) {
			const family = ollamaReasoningFamily(model);
			if (family === "generic" || family === "mistral-large-3") return { levels: GENERIC };
			return FAMILIES[family];
		}
		/**
		* Thinking-level map for one catalog row, or undefined when thinking is off.
		* @param model - saved catalog entry.
		*/
		function ollamaThinkingLevelMap(model) {
			if (model.thinking !== true) return void 0;
			if (ollamaReasoningFamily(model.id) === "mistral-large-3") return void 0;
			return policyFor(model.id).levels;
		}
		/**
		* Plugin-owned default effort for a known Cloud family.
		* @param model - Ollama wire model id.
		* @returns a supported selector id, or undefined for unknown families.
		*/
		function ollamaDefaultEffort(model) {
			if (ollamaReasoningFamily(model) === "mistral-large-3") return void 0;
			return policyFor(model).defaultEffort;
		}
		/** Stable order for the Default thinking dropdown. */
		const OLLAMA_EFFORT_ORDER = [
			"off",
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		];
		/** Short labels for advertised Ollama reasoning levels. */
		const OLLAMA_EFFORT_LABELS = Object.freeze({
			off: "Off",
			low: "Low",
			medium: "Medium",
			high: "High",
			xhigh: "Extra high",
			max: "Max"
		});
		/** Advertised thinking levels for one catalog row. */
		function effortsForOllamaModel(model) {
			const map = ollamaThinkingLevelMap(model);
			if (map === void 0) return [];
			return OLLAMA_EFFORT_ORDER.filter((effort) => map[effort] !== null);
		}
		//#endregion
		//#region src/client/BrandMark.tsx
		const PATH = "M16.361 10.26a.894.894 0 0 0-.558.47l-.072.148.001.207c0 .193.004.217.059.353.076.193.152.312.291.448.24.238.51.3.872.205a.86.86 0 0 0 .517-.436.752.752 0 0 0 .08-.498c-.064-.453-.33-.782-.724-.897a1.06 1.06 0 0 0-.466 0zm-9.203.005c-.305.096-.533.32-.65.639a1.187 1.187 0 0 0-.06.52c.057.309.31.59.598.667.362.095.632.033.872-.205.14-.136.215-.255.291-.448.055-.136.059-.16.059-.353l.001-.207-.072-.148a.894.894 0 0 0-.565-.472 1.02 1.02 0 0 0-.474.007Zm4.184 2c-.131.071-.223.25-.195.383.031.143.157.288.353.407.105.063.112.072.117.136.004.038-.01.146-.029.243-.02.094-.036.194-.036.222.002.074.07.195.143.253.064.052.076.054.255.059.164.005.198.001.264-.03.169-.082.212-.234.15-.525-.052-.243-.042-.28.087-.355.137-.08.281-.219.324-.314a.365.365 0 0 0-.175-.48.394.394 0 0 0-.181-.033c-.126 0-.207.03-.355.124l-.085.053-.053-.032c-.219-.13-.259-.145-.391-.143a.396.396 0 0 0-.193.032zm.39-2.195c-.373.036-.475.05-.654.086-.291.06-.68.195-.951.328-.94.46-1.589 1.226-1.787 2.114-.04.176-.045.234-.045.53 0 .294.005.357.043.524.264 1.16 1.332 2.017 2.714 2.173.3.033 1.596.033 1.896 0 1.11-.125 2.064-.727 2.493-1.571.114-.226.169-.372.22-.602.039-.167.044-.23.044-.523 0-.297-.005-.355-.045-.531-.288-1.29-1.539-2.304-3.072-2.497a6.873 6.873 0 0 0-.855-.031zm.645.937a3.283 3.283 0 0 1 1.44.514c.223.148.537.458.671.662.166.251.26.508.303.82.02.143.01.251-.043.482-.08.345-.332.705-.672.957a3.115 3.115 0 0 1-.689.348c-.382.122-.632.144-1.525.138-.582-.006-.686-.01-.853-.042-.57-.107-1.022-.334-1.35-.68-.264-.28-.385-.535-.45-.946-.03-.192.025-.509.137-.776.136-.326.488-.73.836-.963.403-.269.934-.46 1.422-.512.187-.02.586-.02.773-.002zm-5.503-11a1.653 1.653 0 0 0-.683.298C5.617.74 5.173 1.666 4.985 2.819c-.07.436-.119 1.04-.119 1.503 0 .544.064 1.24.155 1.721.02.107.031.202.023.208a8.12 8.12 0 0 1-.187.152 5.324 5.324 0 0 0-.949 1.02 5.49 5.49 0 0 0-.94 2.339 6.625 6.625 0 0 0-.023 1.357c.091.78.325 1.438.727 2.04l.13.195-.037.064c-.269.452-.498 1.105-.605 1.732-.084.496-.095.629-.095 1.294 0 .67.009.803.088 1.266.095.555.288 1.143.503 1.534.071.128.243.393.264.407.007.003-.014.067-.046.141a7.405 7.405 0 0 0-.548 1.873c-.062.417-.071.552-.071.991 0 .56.031.832.148 1.279L3.42 24h1.478l-.05-.091c-.297-.552-.325-1.575-.068-2.597.117-.472.25-.819.498-1.296l.148-.29v-.177c0-.165-.003-.184-.057-.293a.915.915 0 0 0-.194-.25 1.74 1.74 0 0 1-.385-.543c-.424-.92-.506-2.286-.208-3.451.124-.486.329-.918.544-1.154a.787.787 0 0 0 .223-.531c0-.195-.07-.355-.224-.522a3.136 3.136 0 0 1-.817-1.729c-.14-.96.114-2.005.69-2.834.563-.814 1.353-1.336 2.237-1.475.199-.033.57-.028.776.01.226.04.367.028.512-.041.179-.085.268-.19.374-.431.093-.215.165-.333.36-.576.234-.29.46-.489.822-.729.413-.27.884-.467 1.352-.561.17-.035.25-.04.569-.04.319 0 .398.005.569.04a4.07 4.07 0 0 1 1.914.997c.117.109.398.457.488.602.034.057.095.177.132.267.105.241.195.346.374.43.14.068.286.082.503.045.343-.058.607-.053.943.016 1.144.23 2.14 1.173 2.581 2.437.385 1.108.276 2.267-.296 3.153-.097.15-.193.27-.333.419-.301.322-.301.722-.001 1.053.493.539.801 1.866.708 3.036-.062.772-.26 1.463-.533 1.854a2.096 2.096 0 0 1-.224.258.916.916 0 0 0-.194.25c-.054.109-.057.128-.057.293v.178l.148.29c.248.476.38.823.498 1.295.253 1.008.231 2.01-.059 2.581a.845.845 0 0 0-.044.098c0 .006.329.009.732.009h.73l.02-.074.036-.134c.019-.076.057-.3.088-.516.029-.217.029-1.016 0-1.258-.11-.875-.295-1.57-.597-2.226-.032-.074-.053-.138-.046-.141.008-.005.057-.074.108-.152.376-.569.607-1.284.724-2.228.031-.26.031-1.378 0-1.628-.083-.645-.182-1.082-.348-1.525a6.083 6.083 0 0 0-.329-.7l-.038-.064.131-.194c.402-.604.636-1.262.727-2.04a6.625 6.625 0 0 0-.024-1.358 5.512 5.512 0 0 0-.939-2.339 5.325 5.325 0 0 0-.95-1.02 8.097 8.097 0 0 1-.186-.152.692.692 0 0 1 .023-.208c.208-1.087.201-2.443-.017-3.503-.19-.924-.535-1.658-.98-2.082-.354-.338-.716-.482-1.15-.455-.996.059-1.8 1.205-2.116 3.01a6.805 6.805 0 0 0-.097.726c0 .036-.007.066-.015.066a.96.96 0 0 1-.149-.078A4.857 4.857 0 0 0 12 3.03c-.832 0-1.687.243-2.456.698a.958.958 0 0 1-.148.078c-.008 0-.015-.03-.015-.066a6.71 6.71 0 0 0-.097-.725C8.997 1.392 8.337.319 7.46.048a2.096 2.096 0 0 0-.585-.041Zm.293 1.402c.248.197.523.759.682 1.388.03.113.06.244.069.292.007.047.026.152.041.233.067.365.098.76.102 1.24l.002.475-.12.175-.118.178h-.278c-.324 0-.646.041-.954.124l-.238.06c-.033.007-.038-.003-.057-.144a8.438 8.438 0 0 1 .016-2.323c.124-.788.413-1.501.696-1.711.067-.05.079-.049.157.013zm9.825-.012c.17.126.358.46.498.888.28.854.36 2.028.212 3.145-.019.14-.024.151-.057.144l-.238-.06a3.693 3.693 0 0 0-.954-.124h-.278l-.119-.178-.119-.175.002-.474c.004-.669.066-1.19.214-1.772.157-.623.434-1.185.68-1.382.078-.062.09-.063.159-.012z";
		const SIZE = 18;
		/** Compact Ollama logo (currentColor, 18px). */
		function BrandMark() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: SIZE,
				height: SIZE,
				viewBox: "0 0 24 24",
				"aria-hidden": "true",
				style: { flex: "none" },
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					fill: "currentColor",
					d: PATH
				})
			});
		}
		//#endregion
		//#region node_modules/.pnpm/dsh-llm-providers-ui@https+++github.com+NOirBRight+dsh-llm-providers-ui+releases+downlo_9fe3bd448b199fdcbe5d71b8de10bff6/node_modules/dsh-llm-providers-ui/lib/provider-ui.js
		/**
		* Normalize remaining quota to a 0-100 percent value.
		* Valid readings keep their precision (99.9 stays 99.9, never rounds to 100).
		* NaN, Infinity, and out-of-range readings are unavailable, not clamped:
		* clamping would fabricate a full or empty bar from bad data.
		* @param input - percent and/or fraction quota reading.
		* @returns the 0-100 remaining value, or undefined when unavailable.
		*/
		function normalizeQuotaRemaining(input) {
			const percent = input.remainingPercent;
			if (percent !== void 0) return Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent : void 0;
			const fraction = input.remainingFraction;
			if (fraction !== void 0) return Number.isFinite(fraction) && fraction >= 0 && fraction <= 1 ? fraction * 100 : void 0;
		}
		const meterWrapStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 5,
			minWidth: 0
		};
		const meterTopStyle = {
			display: "flex",
			alignItems: "baseline",
			justifyContent: "space-between",
			gap: 8
		};
		const meterLabelStyle = {
			minWidth: 0,
			overflow: "hidden",
			textOverflow: "ellipsis",
			whiteSpace: "nowrap",
			color: "var(--dsw-alias-label-secondary)",
			fontSize: 12,
			lineHeight: "18px"
		};
		const meterValueStyle = {
			flex: "none",
			fontVariantNumeric: "tabular-nums",
			fontWeight: 500,
			fontSize: 12,
			lineHeight: "18px",
			color: "var(--dsw-alias-label-primary)"
		};
		const meterTrackStyle = {
			display: "block",
			width: "100%",
			height: 6,
			overflow: "hidden",
			border: 0,
			borderRadius: 2,
			background: "color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent)",
			position: "relative"
		};
		const meterFillBase = {
			display: "block",
			height: "100%",
			borderRadius: 2,
			position: "relative",
			background: "color-mix(in srgb, var(--dsw-alias-label-primary) 55%, var(--dsw-alias-label-secondary))"
		};
		const meterKnobStyle = {
			position: "absolute",
			right: 0,
			top: 0,
			bottom: 0,
			width: 2,
			background: "var(--dsw-alias-label-primary)"
		};
		const meterSegmentsStyle = {
			position: "absolute",
			inset: 0,
			pointerEvents: "none",
			background: "repeating-linear-gradient(to right, transparent 0, transparent calc(10% - 1px), var(--dsw-alias-bg-layer-1) calc(10% - 1px), var(--dsw-alias-bg-layer-1) 10%)"
		};
		/** Approved A low-quota fill: amber only, no red tier, no hardcoded hue. */
		const meterWarnFill = { background: "var(--dsw-alias-state-warn-primary)" };
		const meterDetailStyle = {
			color: "var(--dsw-alias-label-tertiary)",
			fontSize: 11,
			lineHeight: "16px"
		};
		const meterMissingStyle = {
			color: "var(--dsw-alias-label-tertiary)",
			fontSize: 12,
			lineHeight: "18px"
		};
		/** Segmented remaining-quota meter. Unavailable quota renders a placeholder, never a zero bar. */
		function ProviderQuotaMeter(props) {
			const remaining = normalizeQuotaRemaining(props);
			const label = props.label ?? "Quota";
			if (remaining === void 0) return (0, react_jsx_runtime.jsx)("span", {
				"data-provider-quota-missing": "",
				style: meterMissingStyle,
				children: props.emptyLabel ?? "—"
			});
			const warn = remaining < 20;
			const text = String(remaining);
			return (0, react_jsx_runtime.jsxs)("span", {
				"data-provider-quota": "",
				style: meterWrapStyle,
				...props.id === void 0 ? {} : { id: props.id },
				children: [
					(0, react_jsx_runtime.jsxs)("span", {
						style: meterTopStyle,
						children: [(0, react_jsx_runtime.jsx)("span", {
							style: meterLabelStyle,
							children: label
						}), (0, react_jsx_runtime.jsx)("span", {
							style: meterValueStyle,
							children: text + "%"
						})]
					}),
					(0, react_jsx_runtime.jsxs)("span", {
						"data-provider-quota-meter": "",
						role: "meter",
						"aria-label": label,
						"aria-valuemin": 0,
						"aria-valuemax": 100,
						"aria-valuenow": remaining,
						style: meterTrackStyle,
						children: [(0, react_jsx_runtime.jsx)("span", {
							style: {
								...meterFillBase,
								...warn ? meterWarnFill : {},
								width: text + "%"
							},
							children: (0, react_jsx_runtime.jsx)("span", { style: meterKnobStyle })
						}), (0, react_jsx_runtime.jsx)("span", {
							"aria-hidden": "true",
							style: meterSegmentsStyle
						})]
					}),
					props.detail === void 0 ? null : (0, react_jsx_runtime.jsx)("span", {
						style: meterDetailStyle,
						children: props.detail
					})
				]
			});
		}
		const headerMainStyle = {
			display: "flex",
			alignItems: "center",
			gap: 14,
			minWidth: 0,
			flex: 1
		};
		const headerIdentityStyle = {
			display: "flex",
			alignItems: "center",
			gap: 12,
			minWidth: 0,
			flex: 1
		};
		const headerMarkStyle = {
			width: 28,
			height: 28,
			flex: "none",
			display: "grid",
			placeItems: "center",
			overflow: "visible"
		};
		const headerTitleColStyle = {
			display: "flex",
			flexDirection: "column",
			minWidth: 0,
			flex: 1
		};
		const headerTitleStyle = {
			display: "inline-flex",
			alignItems: "center",
			gap: 8,
			fontSize: 14,
			fontWeight: 600,
			lineHeight: "20px"
		};
		const headerBadgeBase = {
			display: "inline-flex",
			alignItems: "center",
			gap: 4,
			whiteSpace: "nowrap",
			fontSize: 10,
			fontWeight: 500,
			lineHeight: "16px",
			padding: "0 5px",
			borderRadius: 3,
			border: "1px solid transparent"
		};
		const headerBadgeLlm = {
			color: "var(--dsw-alias-label-secondary)",
			borderColor: "var(--dsw-alias-border-l2)",
			background: "transparent"
		};
		const headerBadgeAgent = {
			color: "var(--dsw-alias-bg-layer-1)",
			borderColor: "var(--dsw-alias-label-primary)",
			background: "var(--dsw-alias-label-primary)"
		};
		const headerSummaryStyle = {
			fontSize: 11,
			lineHeight: "16px",
			color: "var(--dsw-alias-label-tertiary)",
			whiteSpace: "nowrap",
			overflow: "hidden",
			textOverflow: "ellipsis"
		};
		const headerMiniStyle = {
			width: 172,
			flex: "none",
			minWidth: 0
		};
		const headerStatusStyle = {
			width: 96,
			flex: "none",
			textAlign: "right",
			fontSize: 11,
			lineHeight: "16px",
			color: "var(--dsw-alias-label-tertiary)",
			whiteSpace: "nowrap",
			overflow: "hidden",
			textOverflow: "ellipsis"
		};
		const headerSideStyle = {
			display: "inline-flex",
			alignItems: "center",
			gap: 10,
			flex: "none"
		};
		const headerUnsavedStyle = {
			fontSize: 12,
			color: "var(--dsw-alias-label-tertiary)"
		};
		const headerChevronStyle = {
			width: 15,
			fontSize: 20,
			lineHeight: 1,
			textAlign: "center",
			color: "var(--dsw-alias-label-tertiary)"
		};
		/**
		* Monochrome role badge: outlined message glyph for LLM, filled terminal glyph
		* for Agent. Shared by migrated card headers and the shell legacy fallback.
		*/
		function ProviderRoleBadge(props) {
			const agent = (props.role ?? "llm") === "agent";
			return (0, react_jsx_runtime.jsxs)("span", {
				"data-provider-role-badge": agent ? "agent" : "llm",
				style: {
					...headerBadgeBase,
					...agent ? headerBadgeAgent : headerBadgeLlm
				},
				children: [(0, react_jsx_runtime.jsx)("svg", {
					viewBox: "0 0 16 16",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: 1.4,
					"aria-hidden": "true",
					children: agent ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("rect", {
						x: "1.5",
						y: "2",
						width: "13",
						height: "12",
						rx: "2"
					}), (0, react_jsx_runtime.jsx)("path", { d: "m4 5 3 3-3 3m5 0h3" })] }) : (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("rect", {
						x: "2",
						y: "2",
						width: "12",
						height: "9",
						rx: "3"
					}), (0, react_jsx_runtime.jsx)("path", { d: "m5 11-1 3 5-3M5 6h6" })] })
				}), agent ? "Agent" : "LLM"]
			});
		}
		/**
		* Approved A header geometry in one row: identity (mark beside title, badge,
		* and count) on the left, headline quota at the right, caller status, and the
		* chevron. Narrow screens stack identity plus chevron over quota plus status.
		* Renders a fragment for the caller-owned header button; props keep the legacy
		* codex provider-chrome signature so existing call sites keep working.
		*/
		function ProviderCardHeader(props) {
			const quota = props.quota === void 0 || props.quota === null ? void 0 : {
				...props.quota.remainingPercent === void 0 ? {} : { remainingPercent: props.quota.remainingPercent },
				...props.quota.remainingFraction === void 0 ? {} : { remainingFraction: props.quota.remainingFraction },
				...props.quota.label === void 0 ? {} : { label: props.quota.label },
				...props.quota.detail === void 0 ? {} : { detail: props.quota.detail }
			};
			return (0, react_jsx_runtime.jsxs)("span", {
				"data-provider-header-main": "",
				style: headerMainStyle,
				children: [
					(0, react_jsx_runtime.jsxs)("span", {
						"data-provider-header-identity": "",
						style: headerIdentityStyle,
						children: [(0, react_jsx_runtime.jsx)("span", {
							"data-provider-header-mark": "",
							style: headerMarkStyle,
							children: props.mark
						}), (0, react_jsx_runtime.jsxs)("span", {
							style: headerTitleColStyle,
							children: [(0, react_jsx_runtime.jsxs)("span", {
								style: headerTitleStyle,
								children: [(0, react_jsx_runtime.jsx)("span", { children: props.title }), (0, react_jsx_runtime.jsx)(ProviderRoleBadge, { ...props.role === void 0 ? {} : { role: props.role } })]
							}), (0, react_jsx_runtime.jsx)("span", {
								"data-provider-header-summary": "",
								style: headerSummaryStyle,
								children: props.summary
							})]
						})]
					}),
					quota === void 0 ? null : (0, react_jsx_runtime.jsx)("span", {
						"data-provider-quota-mini": "",
						style: headerMiniStyle,
						children: (0, react_jsx_runtime.jsx)(ProviderQuotaMeter, { ...quota })
					}),
					props.status === void 0 ? null : (0, react_jsx_runtime.jsx)("span", {
						"data-provider-header-status": "",
						style: headerStatusStyle,
						children: props.status
					}),
					(0, react_jsx_runtime.jsxs)("span", {
						"data-provider-header-side": "",
						style: headerSideStyle,
						children: [props.unsaved === true && props.unsavedLabel !== void 0 ? (0, react_jsx_runtime.jsx)("span", {
							style: headerUnsavedStyle,
							children: props.unsavedLabel
						}) : null, (0, react_jsx_runtime.jsx)("span", {
							"data-provider-header-chevron": "",
							"aria-hidden": "true",
							style: {
								...headerChevronStyle,
								transform: props.open ? "rotate(180deg)" : "none"
							},
							children: "⌄"
						})]
					})
				]
			});
		}
		/**
		* Scoped provider chrome CSS: plain card reset, header button layout, body and
		* model rows, quota meter responsive rules, and coarse-pointer touch targets.
		* The shell injects it once per page; provider cards may also inject it once
		* for standalone use. Duplicate style tags are harmless: every rule is scoped
		* to a data-provider-* attribute; shared geometry overrides legacy inline layout styles.
		*/
		const providerUiCss = [
			"[data-provider-card]{box-sizing:border-box;width:100%;min-width:0;list-style:none;margin:0!important;border:0!important;border-radius:0!important;background:none!important;box-shadow:none!important;overflow:visible}",
			"[data-provider-card-header]{box-sizing:border-box;width:100%;min-height:76px!important;display:flex;align-items:center;justify-content:space-between;gap:16px;border:0;padding:12px 14px!important;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;cursor:pointer}",
			"[data-provider-body][hidden]{display:none!important}",
			"[data-provider-role-badge] svg{width:12px;height:12px}",
			"[data-provider-card-header]:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent)}",
			"[data-provider-body]{display:flex;flex-direction:column;gap:18px;border-top:1px solid var(--dsw-alias-border-l2);padding:16px 14px 18px}",
			"[data-provider-model]{display:flex;align-items:center;gap:9px;min-height:40px}",
			"[data-provider-quota-mini]{display:block}",
			"[data-providers-list]{display:flex;flex-direction:column}",
			"[data-providers-list] [data-sortable-row]+[data-sortable-row]{border-top:1px solid var(--dsw-alias-border-l2)}",
			"[data-providers-section]{container-type:inline-size}",
			"@media (max-width:680px){[data-provider-card-header]{min-height:106px!important;padding:17px 4px!important}[data-provider-header-main]{display:grid!important;grid-template-columns:minmax(0,1fr) auto;gap:7px 9px!important;align-items:center}[data-provider-header-identity]{grid-column:1;grid-row:1;gap:9px!important}[data-provider-header-mark]{width:25px!important;height:25px!important}[data-provider-role-badge]{margin-left:4px;font-size:9px!important}[data-provider-role-badge] svg{width:11px!important;height:11px!important}[data-provider-header-side]{grid-column:2;grid-row:1;justify-self:end}[data-provider-header-side] [data-provider-header-chevron]{width:18px}[data-provider-quota-mini]{grid-column:1;grid-row:2;width:auto!important;max-width:none!important;text-align:left;padding-left:34px!important}[data-provider-header-status]{grid-column:2;grid-row:2;width:auto!important;max-width:100px}[data-provider-model]{min-height:48px}[data-provider-model] input[type=checkbox]{width:17px;height:17px}[data-providers-section] button,[data-provider-card] button{min-height:44px}}",
			"@container (max-width:540px){[data-provider-card-header]{min-height:106px!important;padding:17px 4px!important}[data-provider-header-main]{display:grid!important;grid-template-columns:minmax(0,1fr) auto;gap:7px 9px!important;align-items:center}[data-provider-header-identity]{grid-column:1;grid-row:1;gap:9px!important}[data-provider-header-mark]{width:25px!important;height:25px!important}[data-provider-role-badge]{margin-left:4px;font-size:9px!important}[data-provider-role-badge] svg{width:11px!important;height:11px!important}[data-provider-header-side]{grid-column:2;grid-row:1;justify-self:end}[data-provider-header-side] [data-provider-header-chevron]{width:18px}[data-provider-quota-mini]{grid-column:1;grid-row:2;width:auto!important;max-width:none!important;text-align:left;padding-left:34px!important}[data-provider-header-status]{grid-column:2;grid-row:2;width:auto!important;max-width:100px}[data-provider-model]{min-height:48px}[data-provider-model] input[type=checkbox]{width:17px;height:17px}[data-providers-section] button,[data-provider-card] button{min-height:44px}}",
			"@media (pointer:coarse){[data-sortable-handle],[data-sortable-move]{min-width:44px;min-height:44px}}"
		].join("\n");
		//#endregion
		//#region src/client/provider-chrome.tsx
		const REFRESH_PATH = "M1.272 6.21348C1.70645 3.08888 4.59169 0.908064 7.71634 1.34239C8.95495 1.51469 10.0438 2.07331 10.8814 2.87755L11.9458 1.81407C12.1347 1.6255 12.4572 1.75911 12.4575 2.02598V5.08751C12.4574 5.25303 12.3233 5.38731 12.1577 5.38731H9.0972C8.82993 5.38731 8.69629 5.06361 8.88528 4.87462L10.0327 3.72618C9.3732 3.09994 8.52006 2.66569 7.5513 2.53087C5.08313 2.18779 2.80376 3.91044 2.46048 6.37852C2.11747 8.84665 3.84009 11.1261 6.30814 11.4693C8.77612 11.8121 11.0557 10.0896 11.399 7.62169L11.9937 7.70372L12.5874 7.78673C12.153 10.9112 9.26756 13.0919 6.1431 12.6578C3.01854 12.2234 0.837738 9.33809 1.272 6.21348Z";
		function ensureMotionStyles() {
			if (typeof document === "undefined") return;
			if (document.getElementById("dsh-provider-motion") !== null) return;
			const style = document.createElement("style");
			style.id = "dsh-provider-motion";
			style.textContent = ["@keyframes dsh-provider-spin{to{transform:rotate(360deg)}}", "@keyframes dsh-provider-shimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}"].join("");
			document.head.appendChild(style);
		}
		const iconButtonStyle$1 = {
			boxSizing: "border-box",
			width: 28,
			height: 28,
			padding: 0,
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 999,
			background: "transparent",
			color: "var(--dsw-alias-label-primary)",
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			cursor: "pointer",
			flex: "none"
		};
		const trackStyle = {
			boxSizing: "border-box",
			height: 14,
			overflow: "hidden",
			borderRadius: 999,
			background: "color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent)"
		};
		const shimmerStyle = {
			display: "block",
			width: "100%",
			height: "100%",
			background: "linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--dsw-alias-label-primary) 22%, transparent) 50%, transparent 100%)",
			backgroundSize: "200% 100%",
			animation: "dsh-provider-shimmer 1.25s ease-in-out infinite"
		};
		const chipStyle = {
			display: "inline-block",
			height: 12,
			borderRadius: 4,
			background: "linear-gradient(90deg, color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent) 0%, color-mix(in srgb, var(--dsw-alias-label-primary) 22%, transparent) 50%, color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent) 100%)",
			backgroundSize: "200% 100%",
			animation: "dsh-provider-shimmer 1.25s ease-in-out infinite"
		};
		/** Official `ic_ds_refresh_outline_14` glyph; spins while refreshing. */
		function RefreshIcon(props) {
			ensureMotionStyles();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: 14,
				height: 14,
				viewBox: "0 0 14 14",
				fill: "none",
				"aria-hidden": "true",
				style: props.spinning === true ? { animation: "dsh-provider-spin 0.8s linear infinite" } : void 0,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					fill: "currentColor",
					d: REFRESH_PATH
				})
			});
		}
		/** Icon-only refresh control used by every provider usage block. */
		function UsageRefreshButton(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				style: iconButtonStyle$1,
				disabled: props.disabled === true,
				"aria-label": props.spinning ? props.busyLabel : props.label,
				onClick: props.onClick,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RefreshIcon, { spinning: props.spinning })
			});
		}
		/** Quota chart skeleton: same 14px tracks as live bars, with a moving sheen. */
		function UsageSkeleton(props) {
			ensureMotionStyles();
			const rows = props.rows ?? 2;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 10
				},
				"aria-hidden": "true",
				children: Array.from({ length: rows }, (_, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 6
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "baseline",
							justifyContent: "space-between",
							gap: 10
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
							...chipStyle,
							width: index === 0 ? 92 : 78
						} }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
							...chipStyle,
							width: 36
						} })]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: trackStyle,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: shimmerStyle })
					})]
				}, index))
			});
		}
		/**
		* Title + official refresh glyph used above usage bars.
		* @param props.title - localized usage heading.
		* @param props.spinning - whether a refresh is in flight.
		* @param props.disabled - when true, the refresh button is inert.
		* @param props.refreshLabel - idle aria-label.
		* @param props.busyLabel - aria-label while spinning.
		* @param props.onRefresh - fetch handler.
		* @param props.error - short failure hint shown left of the button.
		* @returns the usage block heading row.
		*/
		function UsageHeader(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 10
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
					style: {
						margin: 0,
						fontSize: 13,
						fontWeight: 600,
						lineHeight: "18px"
					},
					children: props.title
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					style: {
						display: "inline-flex",
						alignItems: "center",
						gap: 8,
						flex: "none"
					},
					children: [props.error !== void 0 && props.error.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							fontSize: 12,
							lineHeight: "18px",
							color: "var(--dsw-alias-state-error-primary)"
						},
						children: props.error
					}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageRefreshButton, {
						spinning: props.spinning,
						disabled: props.disabled === true,
						label: props.refreshLabel,
						busyLabel: props.busyLabel,
						onClick: props.onRefresh
					})]
				})]
			});
		}
		/** Format a usage stamp as a compact local clock, e.g. "12:04". */
		function formatUsageClock(at) {
			return at.toLocaleTimeString(void 0, {
				hour: "2-digit",
				minute: "2-digit",
				hour12: false
			});
		}
		function interpolateCopy(template, params) {
			return template.replace(/\{(\w+)\}/gu, (_match, key) => String(params[key] ?? ""));
		}
		function chineseLocale(locales) {
			const locale = typeof locales === "string" ? locales : locales?.[0] ?? (typeof navigator === "undefined" ? void 0 : navigator.language);
			return typeof locale === "string" && /^zh\b/iu.test(locale);
		}
		function pad2(value) {
			return String(value).padStart(2, "0");
		}
		/** Official grok.com form: 2026年8月20日 11:35. English stays a short local datetime. */
		function formatResetStamp(iso, locales) {
			const at = new Date(iso);
			if (Number.isNaN(at.getTime())) return iso;
			if (chineseLocale(locales)) return String(at.getFullYear()) + "年" + String(at.getMonth() + 1) + "月" + String(at.getDate()) + "日 " + pad2(at.getHours()) + ":" + pad2(at.getMinutes());
			return new Intl.DateTimeFormat(locales, {
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
				hour12: false
			}).format(at);
		}
		/** Official Cursor form: Sep 16 / 9月16日. */
		function formatResetDate(iso, locales) {
			const at = new Date(iso);
			if (Number.isNaN(at.getTime())) return iso;
			if (chineseLocale(locales)) return String(at.getMonth() + 1) + "月" + String(at.getDate()) + "日";
			return new Intl.DateTimeFormat(locales, {
				month: "short",
				day: "numeric"
			}).format(at);
		}
		/** Whole days until reset when at least one day remains; otherwise the datetime form is used. */
		function remainingResetDays(iso, now = Date.now()) {
			const at = Date.parse(iso);
			if (!Number.isFinite(at)) return void 0;
			const days = Math.round((at - now) / 864e5);
			return days >= 1 ? days : void 0;
		}
		/** Localized reset line matching official dashboards. */
		function resetLabelOf(iso, copy, now) {
			if (iso === void 0) return void 0;
			const locales = copy.at.includes("重置") ? "zh-CN" : "en";
			const days = remainingResetDays(iso, now);
			if (days !== void 0) return interpolateCopy(copy.atDays, {
				date: formatResetDate(iso, locales),
				count: days
			});
			return interpolateCopy(copy.at, { time: formatResetStamp(iso, locales) });
		}
		/**
		* Last successful usage read, right-aligned under the bars.
		* @param props.at - when the last successful snapshot arrived.
		* @param props.label - already-localized "12:04 已更新".
		* @returns the stamp, or nothing before the first success.
		*/
		function UsageUpdatedAt(props) {
			if (props.at === void 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: {
					margin: 0,
					textAlign: "right",
					fontSize: 12,
					lineHeight: "18px",
					color: "var(--dsw-alias-label-tertiary)"
				},
				children: props.label
			});
		}
		//#endregion
		//#region node_modules/.pnpm/dsh-llm-providers-ui@https+++github.com+NOirBRight+dsh-llm-providers-ui+releases+downlo_9fe3bd448b199fdcbe5d71b8de10bff6/node_modules/dsh-llm-providers-ui/lib/sortable.js
		/** Pointer-driven sortable list with a floating ghost and animated live preview. */
		const listStyle$1 = {
			display: "flex",
			flexDirection: "column",
			gap: 8
		};
		const rowStyle$1 = {
			display: "grid",
			gridTemplateColumns: "30px minmax(0, 1fr)",
			alignItems: "stretch",
			overflow: "hidden",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 8,
			background: "var(--dsw-alias-bg-layer-1)",
			transition: "box-shadow 150ms ease, opacity 150ms ease, transform 150ms ease"
		};
		const handleStyle = {
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			width: 30,
			minHeight: 42,
			alignSelf: "stretch",
			border: 0,
			borderRight: "1px solid var(--dsw-alias-border-l2)",
			padding: 0,
			flex: "none",
			touchAction: "none",
			userSelect: "none",
			background: "transparent",
			color: "var(--dsw-alias-label-tertiary)",
			position: "relative",
			zIndex: 2
		};
		const cardRowStyle = {
			...rowStyle$1,
			borderRadius: 10,
			background: "var(--dsw-alias-bg-module-platform)",
			overflow: "hidden"
		};
		const cardItemStyle = {
			minWidth: 0,
			display: "flex",
			flexDirection: "column"
		};
		const plainRowStyle = {
			display: "grid",
			alignItems: "stretch",
			background: "transparent"
		};
		const plainItemStyle = {
			minWidth: 0,
			display: "flex",
			flexDirection: "column",
			padding: "4px 0"
		};
		const moveButtonStyle = {
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			minWidth: 34,
			minHeight: 34,
			alignSelf: "center",
			border: 0,
			padding: 0,
			flex: "none",
			background: "transparent",
			color: "var(--dsw-alias-label-tertiary)",
			fontSize: 16,
			cursor: "pointer"
		};
		const touchCss = "@media (pointer:coarse){[data-sortable-handle],[data-sortable-move]{min-width:44px;min-height:44px}}";
		const cardCss = "[data-sortable-card] [data-sortable-item] li,[data-sortable-ghost] [data-sortable-item] li{border:0!important;border-radius:0!important;background:transparent!important;overflow:visible!important;list-style:none;margin:0}";
		/** Grip glyph marking one row's pointer handle. */
		function IconGrip() {
			return (0, react_jsx_runtime.jsxs)("svg", {
				width: "10",
				height: "14",
				viewBox: "0 0 10 14",
				fill: "currentColor",
				"aria-hidden": true,
				children: [
					(0, react_jsx_runtime.jsx)("circle", {
						cx: "2.5",
						cy: "2.5",
						r: "1.2"
					}),
					(0, react_jsx_runtime.jsx)("circle", {
						cx: "7.5",
						cy: "2.5",
						r: "1.2"
					}),
					(0, react_jsx_runtime.jsx)("circle", {
						cx: "2.5",
						cy: "7",
						r: "1.2"
					}),
					(0, react_jsx_runtime.jsx)("circle", {
						cx: "7.5",
						cy: "7",
						r: "1.2"
					}),
					(0, react_jsx_runtime.jsx)("circle", {
						cx: "2.5",
						cy: "11.5",
						r: "1.2"
					}),
					(0, react_jsx_runtime.jsx)("circle", {
						cx: "7.5",
						cy: "11.5",
						r: "1.2"
					})
				]
			});
		}
		/**
		* Pointer-driven sortable list: an in-tree floating ghost follows the pointer,
		* a preview array records the prospective order, and FLIP animations move
		* sibling rows. The ghost stays inside the list ancestry so ancestor-scoped
		* row styles keep matching it while it floats (position:fixed escapes
		* overflow clipping without leaving the scope). Constraint: no
		* transform/filter/perspective on list ancestors, which would re-anchor
		* the fixed ghost to that ancestor instead of the viewport.
		*/
		function SortableList({ items, getId, renderItem, dragLabel, onReorder, disabled = false, chrome = "row", sorting = true, moveButtons = false, moveUpLabel, moveDownLabel }) {
			const card = chrome === "card";
			const plain = chrome === "plain";
			const interactive = sorting && !disabled;
			const showHandle = sorting;
			const upLabel = moveUpLabel ?? (() => "Move up");
			const downLabel = moveDownLabel ?? (() => "Move down");
			/** Commit a durable reorder moving one row by an offset. Pointer preview stays untouched. */
			const moveBy = (id, offset) => {
				if (!interactive || draggedId !== null) return;
				const from = items.findIndex((item) => getId(item) === id);
				if (from < 0) return;
				const to = from + offset;
				if (to < 0 || to >= items.length) return;
				const next = [...items];
				const moved = next.splice(from, 1)[0];
				if (moved === void 0) return;
				next.splice(to, 0, moved);
				onReorder(next);
			};
			/** Arrow keys on a handle commit the same reorder as a pointer drag. */
			const handleKeyDown = (event, id) => {
				if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
				event.preventDefault();
				moveBy(id, event.key === "ArrowUp" ? -1 : 1);
			};
			const [draggedId, setDraggedId] = (0, react.useState)(null);
			const [dropTargetId, setDropTargetId] = (0, react.useState)(null);
			const [previewItems, setPreviewItems] = (0, react.useState)(null);
			const [dragGhost, setDragGhost] = (0, react.useState)(null);
			const rowRefs = (0, react.useRef)(/* @__PURE__ */ new Map());
			const previousRects = (0, react.useRef)(null);
			const previewRef = (0, react.useRef)(null);
			const dragGhostRef = (0, react.useRef)(null);
			const renderedItems = previewItems ?? items;
			const draggedItem = draggedId === null ? void 0 : renderedItems.find((item) => getId(item) === draggedId) ?? items.find((item) => getId(item) === draggedId);
			(0, react.useEffect)(() => {
				if (draggedId === null) return;
				const style = document.createElement("style");
				style.textContent = "html.providers-sortable-dragging, html.providers-sortable-dragging * { cursor: grabbing !important; user-select: none !important; }";
				const previousRootCursor = document.documentElement.style.cursor;
				const previousBodyCursor = document.body.style.cursor;
				document.head.appendChild(style);
				document.documentElement.classList.add("providers-sortable-dragging");
				document.documentElement.style.cursor = "grabbing";
				document.body.style.cursor = "grabbing";
				return () => {
					document.documentElement.classList.remove("providers-sortable-dragging");
					style.remove();
					document.documentElement.style.cursor = previousRootCursor;
					document.body.style.cursor = previousBodyCursor;
				};
			}, [draggedId]);
			(0, react.useEffect)(() => {
				if (draggedId === null) return;
				const handlePointerMove = (event) => {
					const currentGhost = dragGhostRef.current;
					if (currentGhost === null) return;
					event.preventDefault();
					const nextGhost = {
						...currentGhost,
						x: event.clientX - currentGhost.offsetX,
						y: event.clientY - currentGhost.offsetY
					};
					dragGhostRef.current = nextGhost;
					setDragGhost(nextGhost);
					movePreviewFromPointer(nextGhost.y + nextGhost.height / 2);
				};
				const handlePointerUp = (event) => {
					event.preventDefault();
					finishDrag(true);
				};
				const handlePointerCancel = (event) => {
					event.preventDefault();
					finishDrag(false);
				};
				const handleKeyDown = (event) => {
					if (event.key !== "Escape") return;
					event.preventDefault();
					finishDrag(false);
				};
				window.addEventListener("pointermove", handlePointerMove, { passive: false });
				window.addEventListener("pointerup", handlePointerUp, { passive: false });
				window.addEventListener("pointercancel", handlePointerCancel, { passive: false });
				window.addEventListener("keydown", handleKeyDown);
				return () => {
					window.removeEventListener("pointermove", handlePointerMove);
					window.removeEventListener("pointerup", handlePointerUp);
					window.removeEventListener("pointercancel", handlePointerCancel);
					window.removeEventListener("keydown", handleKeyDown);
				};
			}, [draggedId]);
			(0, react.useLayoutEffect)(() => {
				const rects = previousRects.current;
				if (rects === null) return;
				previousRects.current = null;
				rowRefs.current.forEach((node, id) => {
					const previous = rects.get(id);
					if (previous === void 0) return;
					const next = node.getBoundingClientRect();
					const deltaX = previous.left - next.left;
					const deltaY = previous.top - next.top;
					if (deltaX === 0 && deltaY === 0 || typeof node.animate !== "function") return;
					node.animate([{ transform: "translate(" + String(deltaX) + "px, " + String(deltaY) + "px)" }, { transform: "translate(0, 0)" }], {
						duration: 160,
						easing: "cubic-bezier(0.2, 0, 0, 1)"
					});
				});
			}, [renderedItems]);
			const startDrag = (event, id) => {
				if (!interactive || dragGhostRef.current !== null) return;
				if (event.pointerType === "mouse" && event.button !== 0) return;
				const row = event.currentTarget.closest("[data-sortable-row=\"true\"]");
				if (!(row instanceof HTMLElement)) return;
				event.preventDefault();
				if (typeof event.currentTarget.focus === "function") event.currentTarget.focus();
				try {
					event.currentTarget.setPointerCapture(event.pointerId);
				} catch {}
				const rect = row.getBoundingClientRect();
				const nextGhost = {
					id,
					x: rect.left,
					y: rect.top,
					width: rect.width,
					height: rect.height,
					offsetX: event.clientX - rect.left,
					offsetY: event.clientY - rect.top
				};
				dragGhostRef.current = nextGhost;
				const initial = [...items];
				previewRef.current = initial;
				setPreviewItems(initial);
				setDragGhost(nextGhost);
				setDraggedId(id);
			};
			const finishDrag = (commit) => {
				const next = previewRef.current;
				if (commit && next !== null && !sameOrder(next, items, getId)) onReorder(next);
				previewRef.current = null;
				dragGhostRef.current = null;
				setPreviewItems(null);
				setDragGhost(null);
				setDraggedId(null);
				setDropTargetId(null);
			};
			const captureRects = () => {
				previousRects.current = new Map(Array.from(rowRefs.current.entries()).map(([id, node]) => [id, node.getBoundingClientRect()]));
			};
			const setRowRef = (id, node) => {
				if (node === null) rowRefs.current.delete(id);
				else rowRefs.current.set(id, node);
			};
			/** The ghost clones live row controls: keep the copy unfocusable. React 18 types no inert prop, so set the DOM flag behind a support guard. */
			const setGhostInert = (node) => {
				if (node !== null && "inert" in node) node.inert = true;
			};
			const movePreviewFromPointer = (pointerY) => {
				if (draggedId === null) return;
				const current = previewRef.current ?? [...items];
				const from = current.findIndex((item) => getId(item) === draggedId);
				if (from < 0) return;
				const dragged = current[from];
				if (dragged === void 0) return;
				const remaining = current.filter((item) => getId(item) !== draggedId);
				let insertionIndex = remaining.length;
				let nextDropTargetId = remaining.length === 0 ? null : getId(remaining[remaining.length - 1]);
				for (let index = 0; index < remaining.length; index += 1) {
					const item = remaining[index];
					if (item === void 0) continue;
					const id = getId(item);
					const node = rowRefs.current.get(id);
					if (node === void 0) continue;
					const rect = node.getBoundingClientRect();
					if (pointerY < rect.top + rect.height / 2) {
						insertionIndex = index;
						nextDropTargetId = id;
						break;
					}
				}
				const next = [
					...remaining.slice(0, insertionIndex),
					dragged,
					...remaining.slice(insertionIndex)
				];
				setDropTargetId(nextDropTargetId);
				if (sameOrder(next, current, getId)) return;
				captureRects();
				previewRef.current = next;
				setPreviewItems(next);
			};
			const rowChromeStyle = plain ? plainRowStyle : card ? cardRowStyle : rowStyle$1;
			const rowGridColumns = (showHandle ? "44px " : "") + "minmax(0,1fr)" + (moveButtons && showHandle ? " auto auto" : "");
			const rowItemStyle = plain ? plainItemStyle : card ? cardItemStyle : { minWidth: 0 };
			return (0, react_jsx_runtime.jsxs)("div", {
				"data-sortable-card": card ? "" : void 0,
				"data-sortable-plain": plain ? "" : void 0,
				style: {
					...listStyle$1,
					...card ? { gap: 12 } : {},
					...plain ? { gap: 0 } : {}
				},
				children: [
					card ? (0, react_jsx_runtime.jsx)("style", { children: cardCss }) : null,
					plain || moveButtons ? (0, react_jsx_runtime.jsx)("style", { children: touchCss }) : null,
					renderedItems.map((item, index) => {
						const id = getId(item);
						const dragging = draggedId === id;
						const targeted = dropTargetId === id && draggedId !== id;
						return (0, react_jsx_runtime.jsxs)("div", {
							ref: (node) => {
								setRowRef(id, node);
							},
							"data-sortable-row": "true",
							style: {
								...rowChromeStyle,
								gridTemplateColumns: rowGridColumns,
								visibility: dragging ? "hidden" : "visible",
								pointerEvents: dragging ? "none" : "auto",
								borderColor: dragging ? "transparent" : "var(--dsw-alias-border-l2)",
								boxShadow: targeted ? "0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 20%, transparent)" : "none"
							},
							onPointerDown: (event) => {
								const target = event.target;
								if (target instanceof Element && target.closest("a, input, select, textarea, label, button:not([data-sortable-handle])") !== null) return;
								startDrag(event, id);
							},
							children: [
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									"data-sortable-handle": "",
									style: {
										...handleStyle,
										display: showHandle ? "flex" : "none",
										...plain ? { borderRight: 0 } : {},
										cursor: disabled ? "default" : draggedId === null ? "grab" : "grabbing"
									},
									"aria-label": dragLabel(item, index),
									"aria-grabbed": dragging,
									title: dragLabel(item, index),
									disabled,
									hidden: !showHandle,
									onDragStart: (event) => {
										event.preventDefault();
									},
									onPointerDown: (event) => {
										startDrag(event, id);
									},
									onKeyDown: (event) => {
										handleKeyDown(event, id);
									},
									children: (0, react_jsx_runtime.jsx)(IconGrip, {})
								}),
								(0, react_jsx_runtime.jsx)("div", {
									"data-sortable-item": "",
									style: rowItemStyle,
									children: renderItem(item, index)
								}),
								moveButtons ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									"data-sortable-move": "up",
									style: {
										...moveButtonStyle,
										display: showHandle ? "inline-flex" : "none"
									},
									"aria-label": upLabel(item, index),
									title: upLabel(item, index),
									disabled: !interactive || index === 0,
									hidden: !showHandle,
									onClick: () => {
										moveBy(id, -1);
									},
									children: "↑"
								}), (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									"data-sortable-move": "down",
									style: {
										...moveButtonStyle,
										display: showHandle ? "inline-flex" : "none"
									},
									"aria-label": downLabel(item, index),
									title: downLabel(item, index),
									disabled: !interactive || index === renderedItems.length - 1,
									hidden: !showHandle,
									onClick: () => {
										moveBy(id, 1);
									},
									children: "↓"
								})] }) : null
							]
						}, id);
					}),
					dragGhost !== null && draggedItem !== void 0 ? (0, react_jsx_runtime.jsxs)("div", {
						"data-sortable-row": "true",
						"data-sortable-ghost": "true",
						"aria-hidden": "true",
						ref: setGhostInert,
						style: {
							...rowChromeStyle,
							gridTemplateColumns: rowGridColumns,
							position: "fixed",
							boxSizing: "border-box",
							left: dragGhost.x,
							top: dragGhost.y,
							width: dragGhost.width,
							minHeight: dragGhost.height,
							zIndex: 1e4,
							pointerEvents: "none",
							opacity: .96,
							boxShadow: "var(--dsw-shadow-lv2, 0 10px 30px rgba(0, 0, 0, 0.18))",
							outline: "2px solid color-mix(in srgb, var(--dsw-alias-state-business-primary) 22%, transparent)"
						},
						children: [
							(0, react_jsx_runtime.jsx)("div", {
								"data-sortable-handle": "",
								style: {
									...handleStyle,
									display: showHandle ? "flex" : "none",
									...plain ? { borderRight: 0 } : {},
									cursor: "grabbing"
								},
								children: (0, react_jsx_runtime.jsx)(IconGrip, {})
							}),
							(0, react_jsx_runtime.jsx)("div", {
								"data-sortable-item": "",
								style: rowItemStyle,
								children: renderItem(draggedItem, renderedItems.findIndex((item) => getId(item) === draggedId))
							}),
							moveButtons && showHandle ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("span", {
								"aria-hidden": "true",
								style: {
									...moveButtonStyle,
									visibility: "hidden"
								},
								children: "↑"
							}), (0, react_jsx_runtime.jsx)("span", {
								"aria-hidden": "true",
								style: {
									...moveButtonStyle,
									visibility: "hidden"
								},
								children: "↓"
							})] }) : null
						]
					}) : null
				]
			});
		}
		function sameOrder(left, right, getId) {
			return left.length === right.length && left.every((item, index) => {
				const other = right[index];
				return other !== void 0 && getId(item) === getId(other);
			});
		}
		//#endregion
		//#region src/client/model-catalog-ui.tsx
		const inputStyle = {
			boxSizing: "border-box",
			width: "100%",
			minHeight: 36,
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 8,
			padding: "7px 10px",
			background: "var(--dsw-alias-bg-layer-1)",
			color: "var(--dsw-alias-label-primary)",
			font: "inherit"
		};
		const rowInputStyle = {
			...inputStyle,
			minHeight: 32,
			padding: "4px 10px"
		};
		const selectStyle = {
			boxSizing: "border-box",
			minHeight: 32,
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 8,
			padding: "4px 28px 4px 10px",
			backgroundColor: "var(--dsw-alias-bg-layer-1)",
			color: "var(--dsw-alias-label-primary)",
			font: "inherit",
			appearance: "none",
			backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4 6l4 4 4-4' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
			backgroundRepeat: "no-repeat",
			backgroundPosition: "right 8px center"
		};
		const rowStyle = {
			display: "grid",
			gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
			gap: 10
		};
		const modelDetailStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 10,
			borderTop: "1px solid var(--dsw-alias-border-l2)",
			padding: "10px 4px 4px"
		};
		const capabilitiesStyle = {
			display: "flex",
			alignItems: "center",
			flexWrap: "wrap",
			gap: 14
		};
		const modelContentStyle = {
			display: "grid",
			gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr) auto auto",
			alignItems: "center",
			gap: 6,
			padding: "6px 8px"
		};
		const fieldStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 6
		};
		const labelStyle = {
			fontSize: 13,
			color: "var(--dsw-alias-label-secondary)"
		};
		const hintStyle = {
			margin: 0,
			fontSize: 12,
			color: "var(--dsw-alias-label-tertiary)"
		};
		/** Hides modelDetailStyle. First row is Context window, second row is Vision/Reasoning/Default thinking. */
		function ModelDetail(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					...modelDetailStyle,
					...props.gridColumn === void 0 ? {} : { gridColumn: props.gridColumn }
				},
				children: props.children
			});
		}
		/** Hides rowStyle (2-col grid). */
		function CatalogRow(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: rowStyle,
				children: props.children
			});
		}
		/** Hides capabilitiesStyle (flex wrap gap14). */
		function CapabilitiesRow(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: capabilitiesStyle,
				children: props.children
			});
		}
		//#endregion
		//#region src/client/OllamaPluginCard.tsx
		/** Ollama Cloud connection and model-catalog card for Plugin configuration. */
		/** Ollama Cloud window lengths, used only as the reset caption when the API omits a reset time. */
		const OLLAMA_SESSION_HOURS = 5;
		const OLLAMA_WEEKLY_DAYS = 7;
		const OLLAMA_MONTHLY_DAYS = 30;
		const cardStyle = { overflow: "visible" };
		const bodyStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 18,
			borderTop: "1px solid var(--dsw-alias-border-l2)",
			padding: "16px 14px 18px"
		};
		const sectionStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 12
		};
		const sectionTitleStyle = {
			margin: 0,
			fontSize: 14,
			lineHeight: "20px",
			fontWeight: 600,
			color: "var(--dsw-alias-label-primary)"
		};
		const actionsStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "flex-end",
			gap: 10
		};
		const buttonStyle = {
			minHeight: 34,
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 18,
			padding: "6px 14px",
			background: "var(--dsw-alias-bg-layer-1)",
			color: "var(--dsw-alias-label-primary)",
			font: "inherit",
			cursor: "pointer"
		};
		const primaryButtonStyle = {
			...buttonStyle,
			borderColor: "var(--dsw-alias-button-primary-fill)",
			background: "var(--dsw-alias-button-primary-fill)",
			color: "var(--dsw-alias-label-primary-foreground)"
		};
		const iconButtonStyle = {
			boxSizing: "border-box",
			width: 28,
			height: 28,
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			flex: "none",
			border: 0,
			borderRadius: 6,
			padding: 0,
			background: "transparent",
			color: "var(--dsw-alias-label-tertiary)",
			font: "inherit",
			cursor: "pointer"
		};
		const disclosureStyle = {
			display: "inline-flex",
			alignItems: "center",
			gap: 8,
			minWidth: 0,
			border: 0,
			padding: 0,
			background: "transparent",
			color: "var(--dsw-alias-label-primary)",
			font: "inherit",
			textAlign: "left",
			cursor: "pointer"
		};
		const statusStyle$1 = {
			margin: 0,
			fontSize: 13,
			color: "var(--dsw-alias-label-secondary)"
		};
		const errorStyle$1 = {
			...statusStyle$1,
			color: "var(--dsw-alias-state-error-primary)"
		};
		const usageListStyle = {
			margin: 0,
			padding: 0,
			listStyle: "none",
			display: "flex",
			flexDirection: "column",
			gap: 2
		};
		let nextModelRow = 0;
		/** Stable client-only row identity used by the pointer sortable preview. */
		function newModelRowId() {
			nextModelRow += 1;
			return "ollama-model-row-" + String(nextModelRow);
		}
		function modelDraftOf(model) {
			return {
				rowId: newModelRowId(),
				...model,
				contextWindow: model.contextWindow === void 0 ? "" : String(model.contextWindow),
				...model.defaultEffort === void 0 ? {} : { defaultEffort: model.defaultEffort }
			};
		}
		function draftOf(settings) {
			return {
				baseURL: settings.baseURL,
				models: settings.models.map(modelDraftOf)
			};
		}
		function integerOf(text) {
			if (text.trim().length === 0) return void 0;
			const value = Number(text);
			return Number.isSafeInteger(value) && value > 0 ? value : NaN;
		}
		function validURL(value) {
			try {
				const url = new URL(value);
				return url.protocol === "http:" || url.protocol === "https:";
			} catch {
				return false;
			}
		}
		function sameDraft(left, right) {
			return JSON.stringify(left) === JSON.stringify(right);
		}
		function modelSettingsOf(draft) {
			const { rowId: _rowId, contextWindow: contextText, tools: _tools, ...model } = draft;
			const contextWindow = integerOf(contextText);
			return {
				...model,
				id: model.id.trim(),
				...contextWindow === void 0 ? {} : { contextWindow }
			};
		}
		function settingsOf(draft, current) {
			return {
				...current,
				baseURL: draft.baseURL.trim(),
				models: draft.models.map(modelSettingsOf)
			};
		}
		function modelFailure(models) {
			const ids = /* @__PURE__ */ new Set();
			for (const model of models) {
				const id = model.id.trim();
				if (id.length === 0 || ids.has(id)) return true;
				ids.add(id);
				if (Number.isNaN(integerOf(model.contextWindow))) return true;
			}
			return false;
		}
		function usageErrorOf(error, t) {
			const raw = messageOf(error, t("requestFailed"));
			return /failed to fetch|could not reach|network|enotfound|econnreset|econnrefused|etimedout/i.test(raw) ? t("usageUnreachable") : raw;
		}
		function messageOf(error, fallback) {
			return error instanceof Error && error.message.length > 0 ? error.message : fallback;
		}
		/** Expansion-state key that survives id edits and preview reorders. */
		function rowKeyOf(model) {
			return model.rowId;
		}
		/** One capability checkbox. */
		function Capability({ label, checked, disabled, onChange }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				style: {
					...labelStyle,
					display: "inline-flex",
					alignItems: "center",
					gap: 6
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					type: "checkbox",
					checked,
					disabled,
					onChange: (event) => {
						onChange(event.target.checked);
					}
				}), label]
			});
		}
		/** Disclosure chevron; rotates to point down while open. */
		function IconChevron({ open }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: "12",
				height: "12",
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": true,
				style: {
					flex: "none",
					transform: open ? "rotate(90deg)" : "none",
					transition: "transform 120ms ease"
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M6 3.5L10.5 8L6 12.5",
					stroke: "currentColor",
					strokeWidth: "1.5",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				})
			});
		}
		/** Removal glyph for one model row. */
		function IconTrash() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: "14",
				height: "14",
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": true,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9a1 1 0 001 .9h4.6a1 1 0 001-.9L12 4M6.5 6.8v4.4M9.5 6.8v4.4",
					stroke: "currentColor",
					strokeWidth: "1.3",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				})
			});
		}
		function usageResetCopy(t) {
			return {
				at: t("usageResetAt"),
				atDays: t("usageResetAtDays")
			};
		}
		/** One quota window: segmented remaining meter; honest native text when no percent metric. */
		function UsageBar({ label, usedText, window: quota, t, fallbackReset }) {
			const remaining = 100 * (1 - quota.usage);
			if (!Number.isFinite(remaining) || remaining < 0 || remaining > 100) {
				const percent = Math.round(quota.usage * 1e3) / 10;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						alignItems: "baseline",
						justifyContent: "space-between",
						gap: 10
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: labelStyle,
						children: label
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: hintStyle,
						children: [
							usedText,
							" ",
							percent,
							"%"
						]
					})]
				});
			}
			const detail = resetLabelOf(quota.resetsAt, usageResetCopy(t)) ?? fallbackReset;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderQuotaMeter, {
				remainingPercent: Math.round(remaining * 10) / 10,
				label,
				...detail === void 0 ? {} : { detail }
			});
		}
		/** Render the single-package Ollama Cloud contribution under Plugin configuration. */
		/** Headline remaining quota from real auth values; missing renders no meter, never zero. */
		function headlineQuotaOf(view, t) {
			const window = view?.monthly ?? view?.weekly ?? view?.session;
			if (window === void 0) return void 0;
			const remaining = 100 * (1 - window.usage);
			if (!Number.isFinite(remaining) || remaining < 0 || remaining > 100) return void 0;
			return {
				remainingPercent: Math.round(remaining * 10) / 10,
				label: view?.monthly !== void 0 ? t("usageMonthly") : view?.weekly !== void 0 ? t("usageWeekly") : t("usageSession"),
				...(resetLabelOf(window.resetsAt, usageResetCopy(t)) ?? void 0) === void 0 ? {} : { detail: resetLabelOf(window.resetsAt, usageResetCopy(t)) }
			};
		}
		function OllamaPluginCard(props) {
			const { t } = props;
			const snapshot = props.useOllamaSettings((value) => value);
			const [open, setOpen] = (0, react.useState)(false);
			const initial = (0, react.useMemo)(() => snapshot.value === void 0 ? void 0 : draftOf(snapshot.value), [snapshot.value]);
			const [source, setSource] = (0, react.useState)(initial);
			const [draft, setDraft] = (0, react.useState)(initial);
			const [sourceRevision, setSourceRevision] = (0, react.useState)(snapshot.revision);
			const [apiKey, setApiKey] = (0, react.useState)("");
			const [credential, setCredential] = (0, react.useState)(void 0);
			const [busy, setBusy] = (0, react.useState)(false);
			const [fetching, setFetching] = (0, react.useState)(false);
			const [failure, setFailure] = (0, react.useState)(void 0);
			const [notice, setNotice] = (0, react.useState)(void 0);
			const [usage, setUsage] = (0, react.useState)({ status: "idle" });
			const [lastUsage, setLastUsage] = (0, react.useState)(void 0);
			const [usageUpdatedAt, setUsageUpdatedAt] = (0, react.useState)(void 0);
			const usageEpoch = (0, react.useRef)(0);
			const mounted = (0, react.useRef)(true);
			const [catalogOpen, setCatalogOpen] = (0, react.useState)(false);
			const [modelSorting, setModelSorting] = (0, react.useState)(false);
			const [expandedModels, setExpandedModels] = (0, react.useState)(/* @__PURE__ */ new Set());
			const dirty = source !== void 0 && draft !== void 0 && (!sameDraft(source, draft) || apiKey.length > 0);
			(0, react.useEffect)(() => {
				if (snapshot.status !== "ready" || snapshot.value === void 0) return;
				if (snapshot.revision === sourceRevision) return;
				if (dirty) return;
				const next = draftOf(snapshot.value);
				setSource(next);
				setDraft(next);
				setSourceRevision(snapshot.revision);
			}, [
				dirty,
				snapshot.revision,
				snapshot.status,
				snapshot.value,
				sourceRevision
			]);
			const credentialEpoch = (0, react.useRef)(0);
			const refreshCredential = async () => {
				const epoch = credentialEpoch.current + 1;
				credentialEpoch.current = epoch;
				const liveCredential = () => mounted.current && epoch === credentialEpoch.current;
				try {
					const next = await props.describeCredential();
					if (!liveCredential()) return;
					setCredential(next);
				} catch {
					if (!liveCredential()) return;
					setCredential(void 0);
				}
			};
			(0, react.useEffect)(() => {
				if (snapshot.status !== "ready") return;
				refreshCredential();
			}, [snapshot.status, snapshot.value?.apiKeyEnv]);
			(0, react.useEffect)(() => () => {
				props.closeModelPicker();
			}, [props.closeModelPicker]);
			if (snapshot.status === "unavailable") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				style: cardStyle,
				"data-provider-card": "",
				"data-provider-role": "llm",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: providerUiCss }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						"data-provider-card-header": "",
						"aria-expanded": open,
						"aria-label": t(open ? "collapse" : "expand") + ": " + t("title"),
						onClick: () => {
							setOpen(!open);
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderCardHeader, {
							title: t("title"),
							mark: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BrandMark, {}),
							summary: t("summaryModels").replace("{count}", "0"),
							status: t("summaryOff"),
							open,
							role: "llm"
						})
					}),
					open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: bodyStyle,
						"data-provider-body": "",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: statusStyle$1,
							role: "status",
							children: t("remoteAccess")
						})
					}) : null
				]
			});
			const title = t("title");
			const disabled = snapshot.status !== "ready" || !snapshot.writable || busy;
			const keyInvalid = apiKey.length > 0 && apiKey.trim().length === 0;
			const customModels = snapshot.user !== void 0 && Object.prototype.hasOwnProperty.call(snapshot.user, "models");
			const invalid = draft !== void 0 && (!validURL(draft.baseURL.trim()) || modelFailure(draft.models) || keyInvalid);
			const patchDraft = (next) => {
				setDraft((current) => current === void 0 ? current : {
					...current,
					...next
				});
				setFailure(void 0);
				setNotice(void 0);
			};
			const patchModel = (index, patch) => {
				if (draft === void 0) return;
				patchDraft({ models: draft.models.map((model, at) => {
					if (at !== index) return model;
					const next = { ...model };
					if (patch.id !== void 0) next.id = patch.id;
					if ("name" in patch) {
						if (patch.name === void 0) delete next.name;
						else next.name = patch.name;
					}
					if ("description" in patch) {
						if (patch.description === void 0) delete next.description;
						else next.description = patch.description;
					}
					if (patch.contextWindow !== void 0) next.contextWindow = patch.contextWindow;
					if ("vision" in patch) {
						if (patch.vision === void 0) delete next.vision;
						else next.vision = patch.vision;
					}
					if ("thinking" in patch) {
						if (patch.thinking === void 0) delete next.thinking;
						else next.thinking = patch.thinking;
						if (patch.thinking !== true) delete next.defaultEffort;
					}
					if ("defaultEffort" in patch) {
						if (patch.defaultEffort === void 0) delete next.defaultEffort;
						else next.defaultEffort = patch.defaultEffort;
					}
					return next;
				}) });
			};
			const removeModel = (index) => {
				if (draft === void 0) return;
				patchDraft({ models: draft.models.filter((_, at) => at !== index) });
			};
			const toggleModel = (key) => {
				setExpandedModels((current) => {
					const next = new Set(current);
					if (!next.delete(key)) next.add(key);
					return next;
				});
			};
			const loadUsage = async () => {
				const epoch = usageEpoch.current + 1;
				usageEpoch.current = epoch;
				const live = () => mounted.current && epoch === usageEpoch.current;
				setUsage({ status: "loading" });
				try {
					const read = await props.fetchUsage({
						...draft === void 0 ? {} : { baseURL: draft.baseURL.trim() },
						...apiKey.trim().length === 0 ? {} : { apiKey: apiKey.trim() }
					});
					if (!live()) return;
					if (read.kind === "ok") {
						setLastUsage(read.usage);
						rememberHeadlineQuota(OLLAMA_SETTINGS_NAMESPACE, "Ollama Cloud", headlineQuotaOf(read.usage, t));
						setUsageUpdatedAt(/* @__PURE__ */ new Date());
					}
					setUsage(read.kind === "ok" ? {
						status: "ready",
						usage: read.usage
					} : read.kind === "needs-restart" ? { status: "needs-restart" } : { status: "unsupported" });
				} catch (error) {
					if (!live()) return;
					setUsage({
						status: "error",
						message: usageErrorOf(error, t)
					});
				}
			};
			(0, react.useEffect)(() => {
				mounted.current = true;
				return () => {
					mounted.current = false;
				};
			}, []);
			(0, react.useEffect)(() => {
				if (snapshot.status !== "ready" || usage.status !== "idle") return;
				loadUsage();
			}, [snapshot.status, usage.status]);
			const fetchModels = async () => {
				if (draft === void 0) return;
				const currentModels = draft.models.map(modelSettingsOf);
				const initiallyPicked = new Set(currentModels.map((model) => model.id));
				setFetching(true);
				setFailure(void 0);
				setNotice(void 0);
				props.beginModelPicker(initiallyPicked, (selected) => {
					setDraft((current) => {
						if (current === void 0) return current;
						const currentById = new Map(current.models.map((model) => [model.id.trim(), model]));
						const next = /* @__PURE__ */ new Map();
						for (const candidate of selected) {
							const existing = currentById.get(candidate.id);
							const discovered = modelDraftOf(candidate);
							next.set(candidate.id, existing === void 0 ? discovered : {
								...existing,
								...discovered,
								rowId: existing.rowId
							});
						}
						return {
							...current,
							models: [...next.values()]
						};
					});
					setCatalogOpen(true);
					setFailure(void 0);
					setNotice(void 0);
				});
				try {
					const found = await props.discoverModels({
						baseURL: draft.baseURL.trim(),
						...apiKey.trim().length === 0 ? {} : { apiKey: apiKey.trim() }
					});
					if (found.length === 0) {
						const message = t("fetchEmpty");
						props.failModelPicker(message);
						setFailure(message);
						return;
					}
					const foundIds = new Set(found.map((model) => model.id));
					const currentOnly = currentModels.filter((model) => !foundIds.has(model.id));
					props.completeModelPicker([...found, ...currentOnly]);
				} catch (error) {
					const message = messageOf(error, t("requestFailed"));
					props.failModelPicker(message);
					setFailure(message);
				} finally {
					setFetching(false);
				}
			};
			const discard = () => {
				if (source !== void 0) setDraft(structuredClone(source));
				setApiKey("");
				setFailure(void 0);
				setNotice(void 0);
			};
			const save = async () => {
				if (draft === void 0 || snapshot.value === void 0 || invalid) return;
				usageEpoch.current += 1;
				setBusy(true);
				setFailure(void 0);
				setNotice(void 0);
				try {
					const settings = settingsOf(draft, snapshot.value);
					const accepted = await props.saveConfiguration(settings);
					if (apiKey.trim().length > 0) await props.saveCredential(apiKey.trim());
					const next = draftOf(accepted.settings);
					setSource(next);
					setDraft(next);
					setSourceRevision(accepted.revision);
					setApiKey("");
					setNotice(t("saved"));
					await refreshCredential();
					setUsage({ status: "idle" });
				} catch (error) {
					setFailure(messageOf(error, t("requestFailed")));
					setUsage((current) => current.status === "loading" ? { status: "idle" } : current);
				} finally {
					setBusy(false);
				}
			};
			let validation;
			if (draft !== void 0 && !validURL(draft.baseURL.trim())) validation = t("invalidBaseURL");
			else if (draft !== void 0 && modelFailure(draft.models)) validation = t("invalidModel");
			else if (keyInvalid) validation = t("invalidApiKey");
			const headerModelCount = draft?.models.length;
			const headerCount = headerModelCount === void 0 ? "" : t("summaryModels").replace("{count}", String(headerModelCount));
			const headerStatus = credential?.configured === true ? t("summaryOn") : credential?.configured === false ? t("summaryOff") : t("loading");
			const usageView = usage.status === "ready" ? usage.usage : lastUsage;
			const liveQuota = credential?.configured === true ? headlineQuotaOf(usageView, t) : void 0;
			const headerQuota = credential?.configured === false || usage.status === "error" || usage.status === "unsupported" || usage.status === "needs-restart" ? void 0 : liveQuota ?? headerQuotaFromCache(peekCachedUsage("llm-ollama"));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				style: cardStyle,
				"data-provider-card": "",
				"data-provider-role": "llm",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: providerUiCss }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						"data-provider-card-header": "",
						"aria-expanded": open,
						"aria-label": t(open ? "collapse" : "expand") + ": " + title,
						onClick: () => {
							setOpen(!open);
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderCardHeader, {
							title,
							mark: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BrandMark, {}),
							summary: headerCount,
							status: headerStatus,
							open,
							unsaved: dirty,
							unsavedLabel: t("unsaved"),
							role: "llm",
							...headerQuota === void 0 ? credential?.configured === true && (usage.status === "error" || usage.status === "unsupported" || usage.status === "needs-restart") ? { quota: { label: t("usage") } } : {} : { quota: headerQuota }
						})
					}),
					open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: bodyStyle,
						"data-provider-body": "",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: hintStyle,
								children: t("description")
							}),
							snapshot.status === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: statusStyle$1,
								children: t("loading")
							}) : null,
							snapshot.status === "ready" && !snapshot.writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: statusStyle$1,
								children: t("readOnly")
							}) : null,
							draft === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
									style: sectionStyle,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
											style: sectionTitleStyle,
											children: t("connection")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											style: fieldStyle,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													style: labelStyle,
													children: t("apiKey")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													style: inputStyle,
													type: "password",
													"aria-label": t("apiKey"),
													autoComplete: "off",
													value: apiKey,
													placeholder: credential?.configured ? t("apiKeyConfigured") : t("apiKeyPlaceholder"),
													disabled: busy || credential?.writable === false,
													onChange: (event) => {
														setApiKey(event.target.value);
														setFailure(void 0);
														setNotice(void 0);
													}
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													style: hintStyle,
													children: apiKey.length > 0 ? t("apiKeyPending") : credential?.configured ? t("apiKeyConfigured") : t("apiKeyUnset")
												})
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											style: fieldStyle,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: labelStyle,
												children: t("baseURL")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												style: inputStyle,
												type: "url",
												"aria-label": t("baseURL"),
												value: draft.baseURL,
												disabled,
												onChange: (event) => {
													patchDraft({ baseURL: event.target.value });
												}
											})]
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
									style: sectionStyle,
									"aria-label": t("usage"),
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageHeader, {
											title: t("usage"),
											spinning: usage.status === "loading" || usage.status === "idle",
											disabled: usage.status === "loading" || snapshot.status !== "ready",
											refreshLabel: t("usageRefresh"),
											busyLabel: t("usageLoading"),
											...usage.status === "error" ? { error: t("usageRefreshFailed") } : {},
											onRefresh: () => {
												loadUsage();
											}
										}),
										(() => {
											if (usage.status === "loading" || usage.status === "idle") {
												const known = lastUsage === void 0 ? 2 : Number(lastUsage.session !== void 0) + Number(lastUsage.weekly !== void 0) + Number(lastUsage.monthly !== void 0);
												return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageSkeleton, { rows: known > 0 ? known : 2 });
											}
											const bars = usage.status === "ready" ? usage.usage : lastUsage;
											if (bars !== void 0) {
												const primaryWindow = bars.monthly ?? bars.weekly ?? bars.session;
												return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
													bars.monthly === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageBar, {
														label: t("usageMonthly"),
														usedText: t("usageUsed"),
														window: bars.monthly,
														t,
														fallbackReset: t("usageResetEveryDays").replace("{count}", String(OLLAMA_MONTHLY_DAYS))
													}),
													bars.session === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageBar, {
														label: t("usageSession"),
														usedText: t("usageUsed"),
														window: bars.session,
														t,
														fallbackReset: t("usageResetEveryHours").replace("{count}", String(OLLAMA_SESSION_HOURS))
													}),
													bars.weekly === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageBar, {
														label: t("usageWeekly"),
														usedText: t("usageUsed"),
														window: bars.weekly,
														t,
														fallbackReset: t("usageResetEveryDays").replace("{count}", String(OLLAMA_WEEKLY_DAYS))
													}),
													primaryWindow !== void 0 && primaryWindow.models.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														style: {
															display: "flex",
															flexDirection: "column",
															gap: 6
														},
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															style: labelStyle,
															children: t("usageModels")
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
															style: usageListStyle,
															"aria-label": t("usageModels"),
															children: primaryWindow.models.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
																style: {
																	display: "flex",
																	alignItems: "baseline",
																	justifyContent: "space-between",
																	gap: 10
																},
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																	style: {
																		...hintStyle,
																		color: "var(--dsw-alias-label-secondary)",
																		overflowWrap: "anywhere"
																	},
																	children: model.name
																}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																	style: {
																		...hintStyle,
																		flex: "none"
																	},
																	children: [
																		model.requestCount,
																		" ",
																		t("usageRequests")
																	]
																})]
															}, model.name))
														})]
													}) : null
												] });
											}
											if (usage.status === "unsupported") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
												style: hintStyle,
												children: t("usageUnsupported")
											});
											if (usage.status === "needs-restart") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
												style: hintStyle,
												children: t("usageNeedsRestart")
											});
											if (usage.status === "error") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
												style: errorStyle$1,
												children: usage.message
											});
											return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageSkeleton, { rows: 2 });
										})(),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageUpdatedAt, {
											at: usageUpdatedAt,
											label: usageUpdatedAt === void 0 ? "" : t("usageUpdatedAt").replace("{time}", formatUsageClock(usageUpdatedAt))
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
									style: sectionStyle,
									"aria-label": t("models"),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: {
											display: "flex",
											alignItems: "center",
											justifyContent: "space-between",
											gap: 10
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											style: disclosureStyle,
											"aria-expanded": catalogOpen,
											"aria-label": t("models"),
											onClick: () => {
												setCatalogOpen(!catalogOpen);
											},
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconChevron, { open: catalogOpen }),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													style: sectionTitleStyle,
													children: t("models")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													style: hintStyle,
													children: customModels ? t("customized") : t("inherited")
												})
											]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: {
												display: "inline-flex",
												gap: 8
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												style: buttonStyle,
												"aria-pressed": modelSorting,
												disabled: disabled || draft.models.length < 2,
												onClick: () => {
													setModelSorting((current) => !current);
												},
												children: t(modelSorting ? "doneSorting" : "sortModels")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												style: buttonStyle,
												disabled: fetching || invalid || snapshot.status !== "ready",
												onClick: () => {
													fetchModels();
												},
												children: t(fetching ? "fetchingModels" : "fetchModels")
											})]
										})]
									}), catalogOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SortableList, {
										items: draft.models,
										getId: (model) => model.rowId,
										disabled,
										sorting: modelSorting,
										dragLabel: (model, index) => {
											const label = model.id.trim().length > 0 ? model.id.trim() : String(index + 1);
											return t("dragModel") + ": " + label;
										},
										moveButtons: true,
										moveUpLabel: (model, index) => {
											const label = model.id.trim().length > 0 ? model.id.trim() : String(index + 1);
											return t("moveUp") + ": " + label;
										},
										moveDownLabel: (model, index) => {
											const label = model.id.trim().length > 0 ? model.id.trim() : String(index + 1);
											return t("moveDown") + ": " + label;
										},
										onReorder: (models) => {
											patchDraft({ models });
										},
										renderItem: (model, index) => {
											const key = rowKeyOf(model);
											const expanded = expandedModels.has(key);
											const label = model.id.trim().length > 0 ? model.id.trim() : String(index + 1);
											return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												"data-model-row": label,
												"data-provider-model": "",
												style: modelContentStyle,
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
														style: rowInputStyle,
														value: model.id,
														placeholder: t("modelId"),
														"aria-label": t("modelId") + " " + String(index + 1),
														disabled,
														onChange: (event) => {
															patchModel(index, { id: event.target.value });
														}
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
														style: rowInputStyle,
														value: model.name ?? "",
														placeholder: t("modelName"),
														"aria-label": t("modelName") + " " + String(index + 1),
														disabled,
														onChange: (event) => {
															patchModel(index, { name: event.target.value || void 0 });
														}
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														style: iconButtonStyle,
														"aria-label": t("modelDetails") + ": " + label,
														"aria-expanded": expanded,
														title: t("modelDetails"),
														onClick: () => {
															toggleModel(key);
														},
														children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconChevron, { open: expanded })
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														style: iconButtonStyle,
														"aria-label": t("remove") + " " + label,
														title: t("remove"),
														disabled,
														onClick: () => {
															removeModel(index);
														},
														children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconTrash, {})
													}),
													expanded ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(ModelDetail, {
														gridColumn: "1 / -1",
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CatalogRow, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
															style: fieldStyle,
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																style: labelStyle,
																children: t("modelContext")
															}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																style: inputStyle,
																inputMode: "numeric",
																value: model.contextWindow,
																disabled,
																"aria-label": t("modelContext"),
																onChange: (event) => {
																	patchModel(index, { contextWindow: event.target.value });
																}
															})]
														}) }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(CapabilitiesRow, { children: [
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Capability, {
																label: t("vision"),
																checked: model.vision === true,
																disabled,
																onChange: (vision) => {
																	patchModel(index, { vision });
																}
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Capability, {
																label: t("thinking"),
																checked: model.thinking === true,
																disabled,
																onChange: (thinking) => {
																	patchModel(index, { thinking });
																}
															}),
															(() => {
																const efforts = effortsForOllamaModel(modelSettingsOf(model));
																if (efforts.length === 0) return null;
																const suggested = ollamaDefaultEffort(model.id.trim()) ?? efforts[0];
																return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
																	style: {
																		...labelStyle,
																		display: "inline-flex",
																		alignItems: "center",
																		gap: 6
																	},
																	children: [t("defaultEffort"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
																		style: selectStyle,
																		value: model.defaultEffort ?? suggested ?? "",
																		disabled,
																		"aria-label": t("defaultEffort"),
																		onChange: (event) => {
																			const effort = efforts.find((entry) => entry === event.target.value);
																			patchModel(index, { defaultEffort: effort });
																		},
																		children: efforts.map((effort) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																			value: effort,
																			children: OLLAMA_EFFORT_LABELS[effort] ?? effort
																		}, effort))
																	})]
																});
															})()
														] })]
													}) : null
												]
											});
										}
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										style: {
											...buttonStyle,
											alignSelf: "flex-start"
										},
										disabled,
										onClick: () => {
											const model = {
												rowId: newModelRowId(),
												id: "",
												contextWindow: ""
											};
											patchDraft({ models: [...draft.models, model] });
											setExpandedModels((current) => new Set(current).add(model.rowId));
										},
										children: t("addModel")
									})] }) : null]
								})
							] }),
							validation === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: errorStyle$1,
								children: validation
							}),
							failure === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: errorStyle$1,
								children: failure
							}),
							notice === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: statusStyle$1,
								children: notice
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: actionsStyle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: buttonStyle,
									disabled: !dirty || busy,
									onClick: discard,
									children: t("discard")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: primaryButtonStyle,
									disabled: !dirty || invalid || disabled,
									onClick: () => {
										save();
									},
									children: t(busy ? "saving" : "save")
								})]
							})
						]
					}) : null
				]
			});
		}
		//#endregion
		//#region src/client/OllamaModelPicker.tsx
		/** Frame-level model selection overlay opened by the Ollama settings card. */
		/** Shared observable joining the settings card to its frame-level overlay. */
		var OllamaModelPickerController = class {
			snapshot = {
				open: false,
				loading: false,
				candidates: [],
				picked: /* @__PURE__ */ new Set()
			};
			listeners = /* @__PURE__ */ new Set();
			onAdopt;
			/** Read the stable snapshot identity until picker state changes. */
			getSnapshot = () => this.snapshot;
			/** Subscribe one renderer listener. */
			subscribe = (listener) => {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			};
			/** Open immediately while discovery loads with the current selection captured. */
			begin(onAdopt, initiallyPicked = /* @__PURE__ */ new Set()) {
				this.onAdopt = onAdopt;
				this.publish({
					open: true,
					loading: true,
					candidates: [],
					picked: new Set(initiallyPicked)
				});
			}
			/** Populate an open loading picker, retaining only current ids present in the result. */
			complete(candidates) {
				if (!this.snapshot.open || !this.snapshot.loading) return;
				const candidateIds = new Set(candidates.map((model) => model.id));
				this.publish({
					open: true,
					loading: false,
					candidates: [...candidates],
					picked: new Set([...this.snapshot.picked].filter((id) => candidateIds.has(id)))
				});
			}
			/** Keep the open picker visible with a discovery failure. */
			fail(message) {
				if (!this.snapshot.open || !this.snapshot.loading) return;
				this.publish({
					open: true,
					loading: false,
					candidates: [],
					picked: /* @__PURE__ */ new Set(),
					error: message
				});
			}
			/** Close without adopting any candidate. */
			close = () => {
				this.onAdopt = void 0;
				this.publish({
					open: false,
					loading: false,
					candidates: [],
					picked: /* @__PURE__ */ new Set()
				});
			};
			/** Toggle one candidate by id. */
			toggle = (id) => {
				const picked = new Set(this.snapshot.picked);
				if (picked.has(id)) picked.delete(id);
				else picked.add(id);
				this.publish({
					...this.snapshot,
					picked
				});
			};
			/** Close and deliver the selected candidates to the card. */
			adopt = () => {
				if (this.snapshot.loading || this.snapshot.error !== void 0) return;
				const callback = this.onAdopt;
				const selected = this.snapshot.candidates.filter((model) => this.snapshot.picked.has(model.id));
				this.close();
				callback?.(selected);
			};
			publish(snapshot) {
				this.snapshot = snapshot;
				for (const listener of this.listeners) listener();
			}
		};
		const rootStyle = {
			position: "fixed",
			inset: 0,
			zIndex: 1e3,
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			boxSizing: "border-box",
			padding: 24
		};
		const maskStyle = {
			position: "absolute",
			inset: 0,
			background: "var(--dsw-alias-bg-mask-1)",
			backdropFilter: "var(--dsw-mask-blur)"
		};
		const dialogStyle = {
			position: "relative",
			zIndex: 1,
			display: "flex",
			flexDirection: "column",
			width: "min(520px, 100%)",
			maxHeight: "min(680px, calc(100vh - 48px))",
			overflow: "hidden",
			border: "1px solid var(--dsw-alias-border-inverted)",
			borderRadius: 24,
			background: "var(--dsw-alias-bg-layer-2)",
			boxShadow: "var(--dsw-shadow-lv3)",
			color: "var(--dsw-alias-label-primary)"
		};
		const headerStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: 8,
			padding: "22px 14px 12px 24px"
		};
		const titleStyle = {
			margin: 0,
			fontSize: 16,
			lineHeight: "24px",
			fontWeight: 500
		};
		const closeStyle = {
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			width: 28,
			height: 28,
			border: 0,
			borderRadius: 8,
			background: "transparent",
			color: "var(--dsw-alias-label-secondary)",
			cursor: "pointer",
			fontSize: 22
		};
		const descriptionStyle = {
			margin: 0,
			padding: "0 24px",
			fontSize: 14,
			lineHeight: "22px",
			color: "var(--dsw-alias-label-primary)"
		};
		const listStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 14,
			minHeight: 0,
			margin: "20px 24px",
			padding: 0,
			overflowY: "auto",
			listStyle: "none"
		};
		const candidateStyle = {
			display: "flex",
			alignItems: "center",
			gap: 10,
			fontSize: 14,
			lineHeight: "22px",
			cursor: "pointer"
		};
		const statusStyle = {
			display: "flex",
			alignItems: "center",
			minHeight: 96,
			margin: "20px 24px",
			fontSize: 14,
			lineHeight: "22px",
			color: "var(--dsw-alias-label-secondary)"
		};
		const errorStyle = {
			...statusStyle,
			color: "var(--dsw-alias-state-error-primary)"
		};
		const footerStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "flex-end",
			gap: 8,
			padding: "0 24px 24px"
		};
		const outlineButtonStyle = {
			height: 36,
			padding: "0 14px",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 18,
			background: "transparent",
			color: "var(--dsw-alias-label-primary)",
			cursor: "pointer",
			fontSize: 14
		};
		/** Render the Ollama model candidate picker in the frame overlay layer. */
		function OllamaModelPicker(props) {
			const { t } = props;
			const snapshot = props.useOllamaModelPicker((value) => value);
			(0, react.useEffect)(() => {
				if (!snapshot.open) return;
				const onKeyDown = (event) => {
					if (event.key === "Escape") props.closePicker();
				};
				document.addEventListener("keydown", onKeyDown);
				return () => {
					document.removeEventListener("keydown", onKeyDown);
				};
			}, [snapshot.open, props.closePicker]);
			if (!snapshot.open) return null;
			return (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: rootStyle,
				role: "presentation",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: maskStyle,
					"aria-hidden": "true",
					onClick: props.closePicker
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					style: dialogStyle,
					role: "dialog",
					"aria-modal": "true",
					"aria-label": t("pickerTitle"),
					"aria-busy": snapshot.loading,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: headerStyle,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
								style: titleStyle,
								children: t("pickerTitle")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: closeStyle,
								"aria-label": t("close"),
								onClick: props.closePicker,
								children: "×"
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: descriptionStyle,
							children: t("pickerDescription")
						}),
						snapshot.loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: statusStyle,
							role: "status",
							children: t("pickerLoading")
						}) : snapshot.error !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: errorStyle,
							role: "alert",
							children: snapshot.error
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
							style: listStyle,
							children: snapshot.candidates.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								style: candidateStyle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: snapshot.picked.has(model.id),
									onChange: () => {
										props.togglePickerModel(model.id);
									}
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: model.id })]
							}) }, model.id))
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: footerStyle,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: outlineButtonStyle,
								onClick: props.closePicker,
								children: t("cancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: {
									...outlineButtonStyle,
									...snapshot.loading || snapshot.error !== void 0 ? {
										cursor: "not-allowed",
										opacity: .4
									} : {}
								},
								disabled: snapshot.loading || snapshot.error !== void 0,
								onClick: props.adoptPickerModels,
								children: t("applySelected")
							})]
						})
					]
				})]
			}), document.body);
		}
		//#endregion
		//#region src/client/locales.ts
		/** Localized copy for the Ollama Cloud Plugin configuration card. */
		/** English Ollama Cloud configuration copy. */
		const en = {
			title: "Ollama Cloud",
			description: "Native Ollama Cloud API key, endpoint, and model catalog.",
			expand: "Expand settings",
			collapse: "Collapse settings",
			loading: "Loading plugin settings…",
			unavailable: "This profile does not expose Ollama Cloud settings.",
			remoteAccess: "This profile cannot expose Ollama Cloud settings here. Connection requires an authenticated browser session and a trusted Host/Origin; open the authenticated DSH URL or use an SSH loopback tunnel.",
			readOnly: "This profile’s settings document is read-only.",
			apiKey: "API key",
			apiKeyPlaceholder: "Enter API key",
			apiKeyConfigured: "Configured — enter a new value to replace it",
			apiKeyPending: "New key entered — discovery uses it now; Save stores it",
			apiKeyUnset: "No API key configured",
			baseURL: "API URL",
			connection: "Connection",
			usage: "Cloud usage",
			usageRefresh: "Refresh",
			usageLoading: "Reading usage…",
			usageSession: "Session usage",
			usageWeekly: "Weekly usage",
			usageMonthly: "Monthly usage",
			usageUsed: "Used",
			usageModels: "Models used",
			usageRequests: "requests",
			usageUnsupported: "This endpoint does not report cloud usage.",
			usageNeedsRestart: "Usage appears after the running host reloads this plugin (restart dsh).",
			usageUnreachable: "Could not reach Ollama Cloud usage. Check the network and API URL.",
			usageRefreshFailed: "Refresh failed",
			usageUpdatedAt: "Updated {time}",
			usageResetAt: "Resets {time}",
			usageResetAtDays: "Usage limits reset on {date} ({count} days left)",
			usageResetEveryHours: "Resets every {count} hours",
			usageResetEveryDays: "Resets every {count} days",
			models: "Model catalog",
			summaryModels: "{count} models",
			summaryOn: "Configured",
			summaryOff: "Not configured",
			modelDetails: "Details",
			dragModel: "Drag to reorder",
			sortModels: "Sort",
			doneSorting: "Done",
			moveUp: "Move up",
			moveDown: "Move down",
			fetchModels: "Fetch available models",
			fetchingModels: "Fetching models…",
			fetchEmpty: "The endpoint returned no models.",
			pickerTitle: "Select model catalog",
			pickerDescription: "Select the models to keep in this catalog.",
			pickerLoading: "Fetching model metadata…",
			applySelected: "Apply selected",
			cancel: "Cancel",
			close: "Close",
			addModel: "Add model manually",
			modelId: "Model ID",
			modelName: "Display name",
			modelContext: "Context window",
			modelOutput: "Maximum output",
			vision: "Vision",
			thinking: "Reasoning",
			tools: "Tools",
			defaultEffort: "Default thinking",
			remove: "Remove",
			inherited: "Using the composed catalog",
			customized: "Custom catalog",
			unsaved: "Unsaved changes",
			discard: "Discard",
			save: "Save",
			saving: "Saving…",
			saved: "Saved",
			invalidBaseURL: "Enter an HTTP or HTTPS API URL.",
			invalidModel: "Every model needs a unique ID and valid positive capacities.",
			invalidApiKey: "The API key cannot contain only whitespace.",
			requestFailed: "Request failed."
		};
		/** Chinese Ollama Cloud configuration copy. */
		const zh = {
			title: "Ollama Cloud",
			description: "配置原生 Ollama Cloud API 密钥、地址和模型目录。",
			expand: "展开设置",
			collapse: "折叠设置",
			loading: "正在加载插件设置…",
			unavailable: "此 profile 未开放 Ollama Cloud 设置。",
			remoteAccess: "此 profile 无法在当前页面提供 Ollama Cloud 设置。Connection 要求已验证的浏览器会话以及可信的 Host/Origin；请打开 DSH 提供的 authenticated URL，或使用 SSH loopback tunnel。",
			readOnly: "此 profile 的设置文件为只读。",
			apiKey: "API 密钥",
			apiKeyPlaceholder: "输入 API 密钥",
			apiKeyConfigured: "已配置——输入新值可替换",
			apiKeyPending: "已输入新密钥——获取模型会立即使用，保存后写入凭据",
			apiKeyUnset: "尚未配置 API 密钥",
			baseURL: "API 地址",
			connection: "连接",
			usage: "云端用量",
			usageRefresh: "刷新",
			usageLoading: "正在读取用量…",
			usageSession: "Session 用量",
			usageWeekly: "每周用量",
			usageMonthly: "每月用量",
			usageUsed: "已用",
			usageModels: "使用的模型",
			usageRequests: "次请求",
			usageUnsupported: "该端点不提供云端用量信息。",
			usageNeedsRestart: "运行中的宿主尚未加载用量功能，重启 dsh 后自动显示。",
			usageUnreachable: "无法读取云端用量。请检查网络和 API 地址。",
			usageRefreshFailed: "刷新失败",
			usageUpdatedAt: "{time} 已更新",
			usageResetAt: "重置时间：{time}",
			usageResetAtDays: "重置时间：{date}（还剩 {count} 天）",
			usageResetEveryHours: "每 {count} 小时重置",
			usageResetEveryDays: "每 {count} 天重置",
			models: "模型目录",
			summaryModels: "{count} 个模型",
			summaryOn: "已配置",
			summaryOff: "未配置",
			modelDetails: "详细设置",
			dragModel: "拖动调整顺序",
			sortModels: "排序",
			doneSorting: "完成排序",
			moveUp: "上移",
			moveDown: "下移",
			fetchModels: "获取可用模型",
			fetchingModels: "正在获取模型…",
			fetchEmpty: "端点没有返回任何模型。",
			pickerTitle: "选择模型目录",
			pickerDescription: "选择要保留在此目录中的模型。",
			pickerLoading: "正在获取模型元数据…",
			applySelected: "应用所选",
			cancel: "取消",
			close: "关闭",
			addModel: "手动添加模型",
			modelId: "模型 ID",
			modelName: "显示名称",
			modelContext: "上下文窗口",
			modelOutput: "最大输出",
			vision: "视觉",
			thinking: "推理",
			tools: "工具调用",
			defaultEffort: "默认思考",
			remove: "删除",
			inherited: "正在使用组合层模型目录",
			customized: "自定义模型目录",
			unsaved: "有未保存更改",
			discard: "放弃更改",
			save: "保存",
			saving: "保存中…",
			saved: "已保存",
			invalidBaseURL: "请输入 HTTP 或 HTTPS API 地址。",
			invalidModel: "每个模型必须有唯一 ID，容量必须为正整数。",
			invalidApiKey: "API 密钥不能只包含空白字符。",
			requestFailed: "请求失败。"
		};
		//#endregion
		//#region src/client/index.ts
		/** Stable browser-plugin name. */
		const name = "dsh-llm-ollama-client";
		/** Client services required by the Plugin configuration contribution. */
		const inject = [
			"slots",
			"locale",
			"connection"
		];
		/** How long the Providers UI owner may take to register `settings.section` before the missing-owner diagnostic reports. */
		const MISSING_OWNER_GRACE_MS = 15e3;
		/** Register localized Ollama Cloud configuration under Plugin configuration. */
		function apply(ctx) {
			const localeNamespace = "settings.ollama-cloud";
			ctx.effect(() => ctx.locale.register(localeNamespace, {
				zh,
				en
			}), "dsh-llm-ollama: Plugin configuration copy");
			const t = ctx.locale.bind(localeNamespace);
			const picker = new OllamaModelPickerController();
			const { rpc } = ctx.get("connection");
			let currentSnapshot = {
				status: "loading",
				value: void 0,
				base: void 0,
				user: void 0,
				revision: void 0,
				writable: false,
				mode: "host"
			};
			const listeners = /* @__PURE__ */ new Set();
			const publish = (next) => {
				currentSnapshot = next;
				for (const listener of listeners) listener();
			};
			const readManagement = async () => {
				const result = await rpc.call(OLLAMA_RPC_CHANNEL, OLLAMA_SETTINGS_READ_ENDPOINT, {});
				if (!result.ok) {
					publish({
						...currentSnapshot,
						status: "unavailable"
					});
					throw new Error(result.error.message);
				}
				const decoded = decodeOllamaSettingsReadResult(result.value);
				if (decoded === void 0) {
					publish({
						...currentSnapshot,
						status: "unavailable"
					});
					throw new Error(t("requestFailed"));
				}
				publish({
					status: "ready",
					value: decoded.settings,
					base: void 0,
					user: void 0,
					revision: decoded.revision,
					writable: true,
					mode: "host"
				});
			};
			const scope = {
				getSnapshot: () => currentSnapshot,
				subscribe: (listener) => {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				mutate: async () => {
					throw new Error("settings are managed by the provider RPC");
				},
				set: async () => {
					throw new Error("settings are managed by the provider RPC");
				},
				unset: async () => {
					throw new Error("settings are managed by the provider RPC");
				}
			};
			readManagement().catch(() => {});
			const describeCredential = async () => {
				const ref = scope.getSnapshot().value?.apiKeyEnv ?? "OLLAMA_API_KEY";
				const result = await rpc.call(OLLAMA_RPC_CHANNEL, OLLAMA_CREDENTIAL_STATUS_ENDPOINT, { ref });
				if (!result.ok) throw new Error(result.error.message);
				const status = decodeOllamaCredentialStatus(result.value);
				if (status === void 0) throw new Error(t("requestFailed"));
				return status;
			};
			const saveConfiguration = async (settings) => {
				const snapshot = scope.getSnapshot();
				if (snapshot.revision === void 0) throw new Error(t("requestFailed"));
				const saved = await rpc.call(OLLAMA_RPC_CHANNEL, OLLAMA_SAVE_ENDPOINT, {
					baseURL: settings.baseURL,
					models: settings.models,
					expectedRevision: snapshot.revision
				});
				if (!saved.ok) throw new Error(saved.error.message);
				const accepted = decodeOllamaSaveResult(saved.value);
				if (accepted === void 0) throw new Error(t("requestFailed"));
				publish({
					...currentSnapshot,
					status: "ready",
					value: accepted.settings,
					revision: accepted.revision
				});
				return accepted;
			};
			const saveCredential = async (apiKey) => {
				const ref = scope.getSnapshot().value?.apiKeyEnv ?? "OLLAMA_API_KEY";
				const result = await rpc.call(OLLAMA_RPC_CHANNEL, OLLAMA_CREDENTIAL_SET_ENDPOINT, {
					ref,
					value: apiKey
				});
				if (!result.ok) throw new Error(result.error.message);
				if (decodeOllamaCredentialStatus(result.value) === void 0) throw new Error(t("requestFailed"));
				dropPersistedUsageKeys([OLLAMA_SETTINGS_NAMESPACE]);
				ctx.get("providerDirectory")?.invalidateUsage(OLLAMA_SETTINGS_NAMESPACE);
			};
			const fetchUsage = async (request) => {
				const result = await rpc.call(OLLAMA_RPC_CHANNEL, OLLAMA_USAGE_ENDPOINT, request);
				if (!result.ok) {
					if (result.error.message.startsWith("unknown Ollama Cloud endpoint")) return { kind: "needs-restart" };
					throw new Error(result.error.message);
				}
				const reply = decodeOllamaUsageReply(result.value);
				if (reply === void 0) throw new Error("Ollama Cloud returned an invalid usage snapshot");
				return reply.status === "ok" ? {
					kind: "ok",
					usage: reply.usage
				} : { kind: "unsupported" };
			};
			const discoverModels = async (request) => {
				const result = await rpc.call(OLLAMA_RPC_CHANNEL, OLLAMA_DISCOVER_ENDPOINT, request);
				if (!result.ok) throw new Error(result.error.message);
				const decoded = decodeOllamaDiscoveryResult(result.value);
				if (decoded === void 0) throw new Error("Ollama Cloud returned an invalid model catalog");
				return decoded.models;
			};
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "ollama-cloud-model-picker",
				order: 100,
				inject: () => ({
					t,
					hooks: { ollamaModelPicker: picker },
					closePicker: picker.close,
					togglePickerModel: picker.toggle,
					adoptPickerModels: picker.adopt
				})
			}, OllamaModelPicker));
			ctx.slots.inject("settings.provider.item", () => ctx.slots.register({
				name: "settings.provider.item",
				key: OLLAMA_SETTINGS_NAMESPACE,
				locale: localeNamespace,
				inject: () => ({
					t,
					hooks: { ollamaSettings: scope },
					describeCredential,
					saveConfiguration,
					saveCredential,
					discoverModels,
					fetchUsage,
					beginModelPicker: (initiallyPicked, onAdopt) => {
						picker.begin(onAdopt, initiallyPicked);
					},
					completeModelPicker: (candidates) => {
						picker.complete(candidates);
					},
					failModelPicker: (message) => {
						picker.fail(message);
					},
					closeModelPicker: picker.close
				})
			}, OllamaPluginCard));
			ctx.inject(["providerDirectory"], (ctx) => {
				ctx.effect(() => ctx.providerDirectory.register({
					key: OLLAMA_SETTINGS_NAMESPACE,
					role: "llm",
					header: "shared",
					usage: createOllamaUsageReader()
				}), "dsh-llm-ollama: provider directory");
			});
			ctx.effect(() => {
				let warned = false;
				const hasProvidersSection = () => ctx.slots.entries("settings.section").some((entry) => entry.options.id === "providers");
				const check = () => {
					if (!hasProvidersSection() && !warned) {
						warned = true;
						console.warn("[dsh-llm-providers-ui] LLM Providers page missing for card llm-ollama: install dsh-llm-providers-ui to show the card. Host route remains active.");
					}
				};
				const timer = setTimeout(check, MISSING_OWNER_GRACE_MS);
				const stop = ctx.slots.subscribe("settings.section", () => {
					if (warned || !hasProvidersSection()) return;
					warned = true;
					clearTimeout(timer);
				});
				return () => {
					clearTimeout(timer);
					stop();
				};
			}, "dsh-llm-providers-ui: missing owner diagnostic");
		}
		//#endregion
		exports.MISSING_OWNER_GRACE_MS = MISSING_OWNER_GRACE_MS;
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
