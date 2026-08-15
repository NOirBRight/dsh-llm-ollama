/** Localized copy for the Ollama Cloud Plugin configuration card. */
/** English Ollama Cloud configuration copy. */
export declare const en: {
    readonly title: "Ollama Cloud";
    readonly description: "Native Ollama Cloud API key, endpoint, and model catalog.";
    readonly expand: "Expand settings";
    readonly collapse: "Collapse settings";
    readonly loading: "Loading plugin settings…";
    readonly unavailable: "This profile does not expose Ollama Cloud settings.";
    readonly remoteAccess: "Remote browsers cannot edit plugin settings: the Harness configuration API is loopback-only. Browse the page on the host itself, or forward it first (ssh -L 3080:127.0.0.1:3080 user@host, then open http://127.0.0.1:3080). Settings saved there keep working for remote sessions.";
    readonly readOnly: "This profile’s settings document is read-only.";
    readonly apiKey: "API key";
    readonly apiKeyPlaceholder: "Enter API key";
    readonly apiKeyConfigured: "Configured — enter a new value to replace it";
    readonly apiKeyPending: "New key entered — discovery uses it now; Save stores it";
    readonly apiKeyUnset: "No API key configured";
    readonly baseURL: "API URL";
    readonly connection: "Connection";
    readonly models: "Model catalog";
    readonly fetchModels: "Fetch available models";
    readonly fetchingModels: "Fetching models…";
    readonly fetchEmpty: "The endpoint returned no models.";
    readonly pickerTitle: "Select model catalog";
    readonly pickerDescription: "Select the models to keep in this catalog.";
    readonly pickerLoading: "Fetching model metadata…";
    readonly applySelected: "Apply selected";
    readonly cancel: "Cancel";
    readonly close: "Close";
    readonly addModel: "Add model manually";
    readonly modelId: "Model ID";
    readonly modelName: "Display name";
    readonly modelContext: "Context window";
    readonly modelOutput: "Maximum output";
    readonly vision: "Vision";
    readonly thinking: "Reasoning";
    readonly tools: "Tools";
    readonly remove: "Remove";
    readonly inherited: "Using the composed catalog";
    readonly customized: "Custom catalog";
    readonly unsaved: "Unsaved changes";
    readonly discard: "Discard";
    readonly save: "Save";
    readonly saving: "Saving…";
    readonly saved: "Saved";
    readonly invalidBaseURL: "Enter an HTTP or HTTPS API URL.";
    readonly invalidModel: "Every model needs a unique ID and valid positive capacities.";
    readonly invalidApiKey: "The API key cannot contain only whitespace.";
    readonly requestFailed: "Request failed.";
};
/** Locale keys owned by the Ollama Cloud configuration card. */
export type OllamaSettingsKey = keyof typeof en;
/** Chinese Ollama Cloud configuration copy. */
export declare const zh: Record<OllamaSettingsKey, string>;
//# sourceMappingURL=locales.d.ts.map