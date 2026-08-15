/** Ollama Cloud connection and model-catalog card for Plugin configuration. */
import type { ReactNode } from 'react';
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client';
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { OllamaCatalogModelConfig, OllamaDiscoveryRequest, OllamaSettingsView } from '../client-contract.ts';
import type { OllamaSettingsKey } from './locales.ts';
/** Credential state exposed without returning the credential value. */
export interface OllamaCredentialState {
    /** Whether any Host credential layer supplies the reference. */
    configured: boolean;
    /** Whether the writable credentials provider can replace it. */
    writable: boolean;
}
/** Dependencies injected by the browser-plugin registration. */
export interface OllamaPluginCardFace {
    /** Localized card copy. */
    t: (key: OllamaSettingsKey) => string;
    hooks: {
        /** Reactive Host-owned settings section. */
        ollamaSettings: SettingsScope<OllamaSettingsView>;
    };
    /** Read value-free credential status for the section's reference. */
    describeCredential: () => Promise<OllamaCredentialState>;
    /** Store changed settings and an optional replacement credential. */
    saveConfiguration: (settings: OllamaSettingsView, apiKey?: string) => Promise<void>;
    /** Interrogate the draft endpoint without storing its one-shot key. */
    discoverModels: (request: OllamaDiscoveryRequest) => Promise<readonly OllamaCatalogModelConfig[]>;
}
/** Props delivered by the Plugin configuration item slot. */
export type OllamaPluginCardProps = PropsRuntime<'settings.plugin.item'> & InjectFace<OllamaPluginCardFace>;
/** Render the single-package Ollama Cloud contribution under Plugin configuration. */
export declare function OllamaPluginCard(props: OllamaPluginCardProps): ReactNode;
//# sourceMappingURL=OllamaPluginCard.d.ts.map