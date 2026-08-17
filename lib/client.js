window.__ModuleLoader__.load({
	id: "dsh-llm-ollama",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
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
			return {
				usage,
				models
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
			if (value["session"] !== void 0 && session === void 0) return void 0;
			if (value["weekly"] !== void 0 && weekly === void 0) return void 0;
			if (session === void 0 && weekly === void 0) return void 0;
			return {
				fetchedAt: value["fetchedAt"],
				...session === void 0 ? {} : { session },
				...weekly === void 0 ? {} : { weekly }
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
			return "generic";
		}
		function policyFor(model) {
			const family = ollamaReasoningFamily(model);
			if (family === "generic") return { levels: GENERIC };
			return FAMILIES[family];
		}
		/**
		* Thinking-level map for one catalog row, or undefined when thinking is off.
		* @param model - saved catalog entry.
		*/
		function ollamaThinkingLevelMap(model) {
			if (model.thinking !== true) return void 0;
			return policyFor(model.id).levels;
		}
		/**
		* Plugin-owned default effort for a known Cloud family.
		* @param model - Ollama wire model id.
		* @returns a supported selector id, or undefined for unknown families.
		*/
		function ollamaDefaultEffort(model) {
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
		//#region src/client/SortableList.tsx
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
			border: 0,
			borderRight: "1px solid var(--dsw-alias-border-l2)",
			padding: 0,
			touchAction: "none",
			userSelect: "none",
			background: "transparent",
			color: "var(--dsw-alias-label-tertiary)"
		};
		const ghostStyle = {
			...rowStyle$1,
			position: "fixed",
			zIndex: 1e4,
			pointerEvents: "none",
			opacity: .96,
			boxShadow: "var(--dsw-shadow-lv2, 0 10px 30px rgba(0, 0, 0, 0.18))",
			outline: "2px solid color-mix(in srgb, var(--dsw-alias-state-business-primary) 22%, transparent)"
		};
		/** Grip glyph marking one row's pointer handle. */
		function IconGrip() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "10",
				height: "14",
				viewBox: "0 0 10 14",
				fill: "currentColor",
				"aria-hidden": true,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "2.5",
						cy: "2.5",
						r: "1.2"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "7.5",
						cy: "2.5",
						r: "1.2"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "2.5",
						cy: "7",
						r: "1.2"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "7.5",
						cy: "7",
						r: "1.2"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "2.5",
						cy: "11.5",
						r: "1.2"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "7.5",
						cy: "11.5",
						r: "1.2"
					})
				]
			});
		}
		/**
		* A small dependency-free sortable surface adapted from CodexHub's
		* SortableList: pointer movement drives a portal ghost and a preview array,
		* while FLIP animations move sibling rows into their prospective positions.
		*/
		function SortableList({ items, getId, renderItem, dragLabel, onReorder, disabled = false }) {
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
				style.textContent = "html.ollama-sortable-dragging, html.ollama-sortable-dragging * { cursor: grabbing !important; user-select: none !important; }";
				const previousRootCursor = document.documentElement.style.cursor;
				const previousBodyCursor = document.body.style.cursor;
				document.head.appendChild(style);
				document.documentElement.classList.add("ollama-sortable-dragging");
				document.documentElement.style.cursor = "grabbing";
				document.body.style.cursor = "grabbing";
				return () => {
					document.documentElement.classList.remove("ollama-sortable-dragging");
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
				if (disabled || event.button !== 0) return;
				const row = event.currentTarget.closest("[data-sortable-row=\"true\"]");
				if (!(row instanceof HTMLElement)) return;
				event.preventDefault();
				event.currentTarget.focus();
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
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: listStyle$1,
				children: [renderedItems.map((item, index) => {
					const id = getId(item);
					const dragging = draggedId === id;
					const targeted = dropTargetId === id && draggedId !== id;
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						ref: (node) => {
							setRowRef(id, node);
						},
						"data-sortable-row": "true",
						style: {
							...rowStyle$1,
							visibility: dragging ? "hidden" : "visible",
							pointerEvents: dragging ? "none" : "auto",
							borderColor: dragging ? "transparent" : "var(--dsw-alias-border-l2)",
							boxShadow: targeted ? "0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 20%, transparent)" : "none"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: {
								...handleStyle,
								cursor: disabled ? "default" : draggedId === null ? "grab" : "grabbing"
							},
							"aria-label": dragLabel(item, index),
							"aria-grabbed": dragging,
							title: dragLabel(item, index),
							disabled,
							onDragStart: (event) => {
								event.preventDefault();
							},
							onPointerDown: (event) => {
								startDrag(event, id);
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconGrip, {})
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: { minWidth: 0 },
							children: renderItem(item, index)
						})]
					}, id);
				}), dragGhost !== null && draggedItem !== void 0 ? (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					"data-sortable-ghost": "true",
					style: {
						...ghostStyle,
						left: dragGhost.x,
						top: dragGhost.y,
						width: dragGhost.width,
						minHeight: dragGhost.height
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							...handleStyle,
							cursor: "grabbing"
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconGrip, {})
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: { minWidth: 0 },
						children: renderItem(draggedItem, renderedItems.findIndex((item) => getId(item) === draggedId))
					})]
				}), document.body) : null]
			});
		}
		function sameOrder(left, right, getId) {
			return left.length === right.length && left.every((item, index) => {
				const other = right[index];
				return other !== void 0 && getId(item) === getId(other);
			});
		}
		//#endregion
		//#region src/client/OllamaPluginCard.tsx
		/** Ollama Cloud connection and model-catalog card for Plugin configuration. */
		const cardStyle = {
			overflow: "hidden",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 10,
			background: "var(--dsw-alias-bg-module-platform)"
		};
		const headerStyle$1 = {
			boxSizing: "border-box",
			width: "100%",
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: 16,
			border: 0,
			padding: "13px 14px",
			background: "transparent",
			color: "var(--dsw-alias-label-primary)",
			font: "inherit",
			textAlign: "left",
			cursor: "pointer"
		};
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
		const rowStyle = {
			display: "grid",
			gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
			gap: 10
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
		const modelContentStyle = {
			display: "grid",
			gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr) auto auto",
			alignItems: "center",
			gap: 6,
			padding: "6px 8px"
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
		const statusStyle$1 = {
			margin: 0,
			fontSize: 13,
			color: "var(--dsw-alias-label-secondary)"
		};
		const errorStyle$1 = {
			...statusStyle$1,
			color: "var(--dsw-alias-state-error-primary)"
		};
		const barTrackStyle = {
			boxSizing: "border-box",
			height: 14,
			display: "flex",
			overflow: "hidden",
			borderRadius: 999,
			background: "color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent)"
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
		/** One quota window: an aggregate consumed percentage and solid meter. */
		function UsageBar({ label, usedText, window: quota }) {
			const percent = Math.round(quota.usage * 1e3) / 10;
			const fill = Math.min(100, Math.max(0, percent));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: barTrackStyle,
					role: "progressbar",
					"aria-label": label,
					"aria-valuemin": 0,
					"aria-valuemax": 100,
					"aria-valuenow": Math.round(fill),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						"data-usage-fill": "true",
						style: {
							width: String(fill) + "%",
							height: "100%",
							flex: "none",
							background: "var(--dsw-alias-state-business-primary)",
							transition: "width 200ms ease"
						}
					})
				})]
			});
		}
		/** Render the single-package Ollama Cloud contribution under Plugin configuration. */
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
			const [catalogOpen, setCatalogOpen] = (0, react.useState)(false);
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
			const refreshCredential = async () => {
				try {
					setCredential(await props.describeCredential());
				} catch {
					setCredential(void 0);
				}
			};
			(0, react.useEffect)(() => {
				if (!open || snapshot.status !== "ready") return;
				refreshCredential();
			}, [
				open,
				snapshot.status,
				snapshot.value?.apiKeyEnv
			]);
			(0, react.useEffect)(() => () => {
				props.closeModelPicker();
			}, [props.closeModelPicker]);
			if (snapshot.status === "unavailable") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				style: cardStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					style: headerStyle$1,
					"aria-expanded": open,
					"aria-label": t(open ? "collapse" : "expand") + ": " + t("title"),
					onClick: () => {
						setOpen(!open);
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: {
							display: "flex",
							minWidth: 0,
							flexDirection: "column",
							gap: 3
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								fontSize: 14,
								lineHeight: "20px",
								fontWeight: 600
							},
							children: t("title")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								fontSize: 13,
								lineHeight: "18px",
								color: "var(--dsw-alias-label-tertiary)"
							},
							children: t("description")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						"aria-hidden": "true",
						style: {
							fontSize: 18,
							transform: open ? "rotate(180deg)" : "none"
						},
						children: "⌄"
					})]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: bodyStyle,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: statusStyle$1,
						role: "status",
						children: t("remoteAccess")
					})
				}) : null]
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
				setUsage({ status: "loading" });
				try {
					const read = await props.fetchUsage({
						...draft === void 0 ? {} : { baseURL: draft.baseURL.trim() },
						...apiKey.trim().length === 0 ? {} : { apiKey: apiKey.trim() }
					});
					setUsage(read.kind === "ok" ? {
						status: "ready",
						usage: read.usage
					} : read.kind === "needs-restart" ? { status: "needs-restart" } : { status: "unsupported" });
				} catch (error) {
					setUsage({
						status: "error",
						message: messageOf(error, t("requestFailed"))
					});
				}
			};
			(0, react.useEffect)(() => {
				if (!open || snapshot.status !== "ready" || usage.status !== "idle") return;
				loadUsage();
			}, [
				open,
				snapshot.status,
				usage.status
			]);
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
				setBusy(true);
				setFailure(void 0);
				setNotice(void 0);
				try {
					const settings = settingsOf(draft, snapshot.value);
					const accepted = await props.saveConfiguration(settings, apiKey.trim().length === 0 ? void 0 : apiKey.trim());
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
				} finally {
					setBusy(false);
				}
			};
			let validation;
			if (draft !== void 0 && !validURL(draft.baseURL.trim())) validation = t("invalidBaseURL");
			else if (draft !== void 0 && modelFailure(draft.models)) validation = t("invalidModel");
			else if (keyInvalid) validation = t("invalidApiKey");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				style: cardStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					style: headerStyle$1,
					"aria-expanded": open,
					"aria-label": t(open ? "collapse" : "expand") + ": " + title,
					onClick: () => {
						setOpen(!open);
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: {
							display: "flex",
							minWidth: 0,
							flexDirection: "column",
							gap: 3
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								fontSize: 14,
								lineHeight: "20px",
								fontWeight: 600
							},
							children: title
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								fontSize: 13,
								lineHeight: "18px",
								color: "var(--dsw-alias-label-tertiary)"
							},
							children: t("description")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: {
							display: "inline-flex",
							alignItems: "center",
							gap: 10
						},
						children: [dirty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: hintStyle,
							children: t("unsaved")
						}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							"aria-hidden": "true",
							style: {
								fontSize: 18,
								transform: open ? "rotate(180deg)" : "none"
							},
							children: "⌄"
						})]
					})]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: bodyStyle,
					children: [
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
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: {
											display: "flex",
											alignItems: "center",
											justifyContent: "space-between",
											gap: 10
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
											style: sectionTitleStyle,
											children: t("usage")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											style: buttonStyle,
											disabled: usage.status === "loading" || snapshot.status !== "ready",
											onClick: () => {
												loadUsage();
											},
											children: t(usage.status === "loading" ? "usageLoading" : "usageRefresh")
										})]
									}),
									usage.status === "ready" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
										usage.usage.session === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageBar, {
											label: t("usageSession"),
											usedText: t("usageUsed"),
											window: usage.usage.session
										}),
										usage.usage.weekly === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageBar, {
											label: t("usageWeekly"),
											usedText: t("usageUsed"),
											window: usage.usage.weekly
										}),
										usage.usage.weekly !== void 0 && usage.usage.weekly.models.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
												children: usage.usage.weekly.models.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
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
									] }) : null,
									usage.status === "unsupported" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: hintStyle,
										children: t("usageUnsupported")
									}) : null,
									usage.status === "needs-restart" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: hintStyle,
										children: t("usageNeedsRestart")
									}) : null,
									usage.status === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: errorStyle$1,
										children: usage.message
									}) : null
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
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										style: buttonStyle,
										disabled: fetching || invalid || snapshot.status !== "ready",
										onClick: () => {
											fetchModels();
										},
										children: t(fetching ? "fetchingModels" : "fetchModels")
									})]
								}), catalogOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SortableList, {
									items: draft.models,
									getId: (model) => model.rowId,
									disabled,
									dragLabel: (model, index) => {
										const label = model.id.trim().length > 0 ? model.id.trim() : String(index + 1);
										return t("dragModel") + ": " + label;
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
												expanded ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													style: {
														...modelDetailStyle,
														gridColumn: "1 / -1"
													},
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
														style: rowStyle,
														children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
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
														})
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														style: capabilitiesStyle,
														children: [
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
																		style: inputStyle,
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
														]
													})]
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
				}) : null]
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
			remoteAccess: "Remote browsers cannot edit plugin settings: the Harness configuration API is loopback-only. Browse the page on the host itself, or forward it first (ssh -L 3080:127.0.0.1:3080 user@host, then open http://127.0.0.1:3080). Settings saved there keep working for remote sessions.",
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
			usageUsed: "Used",
			usageModels: "Models used this week",
			usageRequests: "requests",
			usageUnsupported: "This endpoint does not report cloud usage.",
			usageNeedsRestart: "Usage appears after the running host reloads this plugin (restart dsh).",
			models: "Model catalog",
			modelDetails: "Details",
			dragModel: "Drag to reorder",
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
			remoteAccess: "远程浏览器无法编辑插件设置：Harness 配置 API 仅限 loopback。请在主机本机打开页面，或先做端口转发（ssh -L 3080:127.0.0.1:3080 用户@主机，再访问 http://127.0.0.1:3080）。在主机上保存的配置对远程会话照常生效。",
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
			usageUsed: "已用",
			usageModels: "本周使用模型",
			usageRequests: "次请求",
			usageUnsupported: "该端点不提供云端用量信息。",
			usageNeedsRestart: "运行中的宿主尚未加载用量功能，重启 dsh 后自动显示。",
			models: "模型目录",
			modelDetails: "详细设置",
			dragModel: "拖动调整顺序",
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
			"connection",
			"remote",
			"settingsScope"
		];
		/** Register localized Ollama Cloud configuration under Plugin configuration. */
		function apply(ctx) {
			const localeNamespace = "settings.ollama-cloud";
			ctx.effect(() => ctx.locale.register(localeNamespace, {
				zh,
				en
			}), "dsh-llm-ollama: Plugin configuration copy");
			const t = ctx.locale.bind(localeNamespace);
			const scope = ctx.settingsScope.bind({
				namespace: OLLAMA_SETTINGS_NAMESPACE,
				decode: decodeOllamaSettings
			});
			const picker = new OllamaModelPickerController();
			const { api, rpc } = ctx.get("connection");
			const describeCredential = async () => {
				const ref = scope.getSnapshot().value?.apiKeyEnv ?? "OLLAMA_API_KEY";
				const response = await api.credentials.describe({ refs: [ref] });
				if (!response.result.ok) throw new Error(response.result.error.message);
				const credential = response.result.value.credentials[ref];
				return {
					configured: credential?.configured ?? false,
					writable: credential?.writable ?? true
				};
			};
			const saveConfiguration = async (settings, apiKey) => {
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
				if (apiKey !== void 0) {
					const ref = accepted.settings.apiKeyEnv;
					const response = await api.credentials.set({
						ref,
						value: apiKey
					});
					if (!response.result.ok) throw new Error(response.result.error.message);
				}
				return accepted;
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
			ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				id: "ollama-cloud",
				order: 40,
				locale: localeNamespace,
				inject: () => ({
					t,
					hooks: { ollamaSettings: scope },
					describeCredential,
					saveConfiguration,
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
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
