window.__ModuleLoader__.load({
	id: "dsh-llm-ollama",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client-contract.ts
		/** Browser-safe constants and JSON decoders shared by the Host and client plugin faces. */
		/** Settings namespace owned by the Ollama Cloud plugin. */
		const OLLAMA_SETTINGS_NAMESPACE = "llm-ollama";
		/** Private Connection RPC channel used by this package's two runtime faces. */
		const OLLAMA_RPC_CHANNEL = "/ollama-cloud";
		/** Rich model-discovery endpoint inside {@link OLLAMA_RPC_CHANNEL}. */
		const OLLAMA_DISCOVER_ENDPOINT = "models/discover";
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
			const tools = value["tools"];
			if (name !== void 0 && typeof name !== "string") return void 0;
			if (description !== void 0 && typeof description !== "string") return void 0;
			if (!optionalPositiveInteger(contextWindow) || !optionalPositiveInteger(maxTokens)) return void 0;
			if (vision !== void 0 && typeof vision !== "boolean") return void 0;
			if (thinking !== void 0 && typeof thinking !== "boolean") return void 0;
			if (tools !== void 0 && typeof tools !== "boolean") return void 0;
			return {
				id: value["id"],
				...name === void 0 ? {} : { name },
				...description === void 0 ? {} : { description },
				...contextWindow === void 0 ? {} : { contextWindow },
				...maxTokens === void 0 ? {} : { maxTokens },
				...vision === void 0 ? {} : { vision },
				...thinking === void 0 ? {} : { thinking },
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
		//#endregion
		//#region src/client/OllamaPluginCard.tsx
		/** Ollama Cloud connection and model-catalog card for Plugin configuration. */
		const cardStyle = {
			overflow: "hidden",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 10,
			background: "var(--dsw-alias-bg-module-platform)"
		};
		const headerStyle = {
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
			borderColor: "var(--dsw-alias-brand-primary)",
			background: "var(--dsw-alias-brand-primary)",
			color: "var(--dsw-alias-label-on-brand)"
		};
		const modelStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 10,
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 8,
			padding: 12
		};
		const capabilitiesStyle = {
			display: "flex",
			alignItems: "center",
			flexWrap: "wrap",
			gap: 14
		};
		const statusStyle = {
			margin: 0,
			fontSize: 13,
			color: "var(--dsw-alias-label-secondary)"
		};
		const errorStyle = {
			...statusStyle,
			color: "var(--dsw-alias-state-error-primary)"
		};
		function modelDraftOf(model) {
			return {
				...model,
				contextWindow: model.contextWindow === void 0 ? "" : String(model.contextWindow),
				maxTokens: model.maxTokens === void 0 ? "" : String(model.maxTokens)
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
			const { contextWindow: contextText, maxTokens: maxText, ...model } = draft;
			const contextWindow = integerOf(contextText);
			const maxTokens = integerOf(maxText);
			return {
				...model,
				id: model.id.trim(),
				...contextWindow === void 0 ? {} : { contextWindow },
				...maxTokens === void 0 ? {} : { maxTokens }
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
				if (Number.isNaN(integerOf(model.contextWindow)) || Number.isNaN(integerOf(model.maxTokens))) return true;
			}
			return false;
		}
		function messageOf(error, fallback) {
			return error instanceof Error && error.message.length > 0 ? error.message : fallback;
		}
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
			const [candidates, setCandidates] = (0, react.useState)(void 0);
			const [picked, setPicked] = (0, react.useState)(/* @__PURE__ */ new Set());
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
			if (snapshot.status === "unavailable") return null;
			const title = t("title");
			const disabled = snapshot.status !== "ready" || !snapshot.writable || busy;
			const keyInvalid = apiKey.length > 0 && apiKey.trim().length === 0;
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
					if (patch.maxTokens !== void 0) next.maxTokens = patch.maxTokens;
					if ("vision" in patch) {
						if (patch.vision === void 0) delete next.vision;
						else next.vision = patch.vision;
					}
					if ("thinking" in patch) {
						if (patch.thinking === void 0) delete next.thinking;
						else next.thinking = patch.thinking;
					}
					if ("tools" in patch) {
						if (patch.tools === void 0) delete next.tools;
						else next.tools = patch.tools;
					}
					return next;
				}) });
			};
			const removeModel = (index) => {
				if (draft === void 0) return;
				patchDraft({ models: draft.models.filter((_, at) => at !== index) });
			};
			const fetchModels = async () => {
				if (draft === void 0) return;
				setFetching(true);
				setFailure(void 0);
				setNotice(void 0);
				try {
					const found = await props.discoverModels({
						baseURL: draft.baseURL.trim(),
						...apiKey.trim().length === 0 ? {} : { apiKey: apiKey.trim() }
					});
					if (found.length === 0) {
						setFailure(t("fetchEmpty"));
						return;
					}
					setCandidates(found);
					setPicked(new Set(found.map((model) => model.id)));
				} catch (error) {
					setFailure(messageOf(error, t("requestFailed")));
				} finally {
					setFetching(false);
				}
			};
			const addPicked = () => {
				if (draft === void 0 || candidates === void 0) return;
				const merged = new Map(draft.models.map((model) => [model.id, model]));
				for (const candidate of candidates) {
					if (!picked.has(candidate.id)) continue;
					merged.set(candidate.id, {
						...merged.get(candidate.id),
						...modelDraftOf(candidate)
					});
				}
				patchDraft({ models: [...merged.values()] });
				setCandidates(void 0);
				setPicked(/* @__PURE__ */ new Set());
			};
			const discard = () => {
				if (source !== void 0) setDraft(structuredClone(source));
				setApiKey("");
				setCandidates(void 0);
				setPicked(/* @__PURE__ */ new Set());
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
					await props.saveConfiguration(settings, apiKey.trim().length === 0 ? void 0 : apiKey.trim());
					const next = draftOf(settings);
					setSource(next);
					setDraft(next);
					setSourceRevision(snapshot.revision);
					setApiKey("");
					setNotice(t("saved"));
					await refreshCredential();
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
					style: headerStyle,
					"aria-expanded": open,
					"aria-label": `${t(open ? "collapse" : "expand")}: ${title}`,
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
							style: statusStyle,
							children: t("loading")
						}) : null,
						snapshot.status === "ready" && !snapshot.writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: statusStyle,
							children: t("readOnly")
						}) : null,
						draft === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
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
											children: credential?.configured ? t("apiKeyConfigured") : t("apiKeyUnset")
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
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							style: sectionStyle,
							"aria-label": t("models"),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										gap: 10
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
										style: sectionTitleStyle,
										children: t("models")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: hintStyle,
										children: snapshot.user !== void 0 ? t("customized") : t("inherited")
									})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										style: buttonStyle,
										disabled: fetching || invalid || snapshot.status !== "ready",
										onClick: () => {
											fetchModels();
										},
										children: t(fetching ? "fetchingModels" : "fetchModels")
									})]
								}),
								draft.models.map((model, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: modelStyle,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: rowStyle,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												style: fieldStyle,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													style: labelStyle,
													children: t("modelId")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													style: inputStyle,
													value: model.id,
													disabled,
													onChange: (event) => {
														patchModel(index, { id: event.target.value });
													}
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												style: fieldStyle,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													style: labelStyle,
													children: t("modelName")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													style: inputStyle,
													value: model.name ?? "",
													disabled,
													onChange: (event) => {
														patchModel(index, { name: event.target.value || void 0 });
													}
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												style: fieldStyle,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													style: labelStyle,
													children: t("modelContext")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													style: inputStyle,
													inputMode: "numeric",
													value: model.contextWindow,
													disabled,
													onChange: (event) => {
														patchModel(index, { contextWindow: event.target.value });
													}
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												style: fieldStyle,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													style: labelStyle,
													children: t("modelOutput")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													style: inputStyle,
													inputMode: "numeric",
													value: model.maxTokens,
													disabled,
													onChange: (event) => {
														patchModel(index, { maxTokens: event.target.value });
													}
												})]
											})
										]
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
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Capability, {
												label: t("tools"),
												checked: model.tools === true,
												disabled,
												onChange: (tools) => {
													patchModel(index, { tools });
												}
											}),
											model.thinking === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: hintStyle,
												children: t("reasoningLevels")
											}) : null,
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												style: buttonStyle,
												disabled,
												onClick: () => {
													removeModel(index);
												},
												children: t("remove")
											})
										]
									})]
								}, `${String(index)}:${model.id}`)),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: buttonStyle,
									disabled,
									onClick: () => {
										patchDraft({ models: [...draft.models, {
											id: "",
											contextWindow: "",
											maxTokens: ""
										}] });
									},
									children: t("addModel")
								})
							]
						})] }),
						candidates === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							style: modelStyle,
							"aria-label": t("discoveredModels"),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
									style: sectionTitleStyle,
									children: t("discoveredModels")
								}),
								candidates.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									style: {
										...labelStyle,
										display: "flex",
										alignItems: "center",
										gap: 8
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: picked.has(model.id),
											onChange: () => {
												setPicked((current) => {
													const next = new Set(current);
													if (!next.delete(model.id)) next.add(model.id);
													return next;
												});
											}
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: model.name ?? model.id }),
										model.contextWindow === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: hintStyle,
											children: String(model.contextWindow)
										}),
										model.vision === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: hintStyle,
											children: t("vision")
										}) : null,
										model.thinking === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: hintStyle,
											children: t("thinking")
										}) : null,
										model.tools === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: hintStyle,
											children: t("tools")
										}) : null
									]
								}, model.id)),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: actionsStyle,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										style: buttonStyle,
										onClick: () => {
											setCandidates(void 0);
											setPicked(/* @__PURE__ */ new Set());
										},
										children: t("close")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										style: primaryButtonStyle,
										disabled: picked.size === 0,
										onClick: addPicked,
										children: t("addSelected")
									})]
								})
							]
						}),
						validation === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: errorStyle,
							children: validation
						}),
						failure === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: errorStyle,
							children: failure
						}),
						notice === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: statusStyle,
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
			readOnly: "This profile’s settings document is read-only.",
			apiKey: "API key",
			apiKeyPlaceholder: "Enter API key",
			apiKeyConfigured: "Configured — enter a new value to replace it",
			apiKeyUnset: "No API key configured",
			baseURL: "API URL",
			connection: "Connection",
			models: "Model catalog",
			fetchModels: "Fetch available models",
			fetchingModels: "Fetching models…",
			fetchEmpty: "The endpoint returned no models.",
			discoveredModels: "Available models",
			addSelected: "Add selected models",
			close: "Close",
			addModel: "Add model manually",
			modelId: "Model ID",
			modelName: "Display name",
			modelContext: "Context window",
			modelOutput: "Maximum output",
			vision: "Vision",
			thinking: "Reasoning",
			tools: "Tools",
			reasoningLevels: "Levels: off, low, medium, high, max",
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
			readOnly: "此 profile 的设置文件为只读。",
			apiKey: "API 密钥",
			apiKeyPlaceholder: "输入 API 密钥",
			apiKeyConfigured: "已配置——输入新值可替换",
			apiKeyUnset: "尚未配置 API 密钥",
			baseURL: "API 地址",
			connection: "连接",
			models: "模型目录",
			fetchModels: "获取可用模型",
			fetchingModels: "正在获取模型…",
			fetchEmpty: "端点没有返回任何模型。",
			discoveredModels: "可用模型",
			addSelected: "加入所选模型",
			close: "关闭",
			addModel: "手动添加模型",
			modelId: "模型 ID",
			modelName: "显示名称",
			modelContext: "上下文窗口",
			modelOutput: "最大输出",
			vision: "视觉",
			thinking: "推理",
			tools: "工具调用",
			reasoningLevels: "等级：off、low、medium、high、max",
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
		function same(left, right) {
			return JSON.stringify(left) === JSON.stringify(right);
		}
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
				const current = scope.getSnapshot().value;
				for (const field of ["baseURL", "models"]) {
					if (same(current?.[field], settings[field])) continue;
					await scope.set(field, settings[field]);
					if (!same(scope.getSnapshot().value?.[field], settings[field])) throw new Error(t("requestFailed"));
				}
				if (apiKey !== void 0) {
					const ref = scope.getSnapshot().value?.apiKeyEnv ?? "OLLAMA_API_KEY";
					const response = await api.credentials.set({
						ref,
						value: apiKey
					});
					if (!response.result.ok) throw new Error(response.result.error.message);
				}
			};
			const discoverModels = async (request) => {
				const result = await rpc.call(OLLAMA_RPC_CHANNEL, OLLAMA_DISCOVER_ENDPOINT, request);
				if (!result.ok) throw new Error(result.error.message);
				const decoded = decodeOllamaDiscoveryResult(result.value);
				if (decoded === void 0) throw new Error("Ollama Cloud returned an invalid model catalog");
				return decoded.models;
			};
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
					discoverModels
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
