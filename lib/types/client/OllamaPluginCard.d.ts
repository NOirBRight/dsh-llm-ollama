/** Ollama Cloud connection and model-catalog card for Plugin configuration. */
import type { ReactNode } from 'react';
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client';
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { OllamaCatalogModelConfig, OllamaDiscoveryRequest, OllamaSaveResult, OllamaSettingsView, OllamaUsageView } from '../client-contract.ts';
import type { OllamaSettingsKey } from './locales.ts';
/** Credential state exposed without returning the credential value. */
export interface OllamaCredentialState {
    /** Whether any Host credential layer supplies the reference. */
    configured: boolean;
    /** Whether the writable credentials provider can replace it. */
    writable: boolean;
}
/**
 * Answer of one usage read: the snapshot, an endpoint without a usage
 * surface, or a running Host whose plugin code predates the usage endpoint
 * (a restart loads it; the card says so instead of showing an error).
 */
export type OllamaUsageRead = {
    kind: 'ok';
    usage: OllamaUsageView;
} | {
    kind: 'unsupported';
} | {
    kind: 'needs-restart';
};
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
    /** Atomically store changed settings and return the accepted Host snapshot. */
    saveConfiguration: (settings: OllamaSettingsView, apiKey?: string) => Promise<OllamaSaveResult>;
    /** Interrogate the draft endpoint without storing its one-shot key. */
    discoverModels: (request: OllamaDiscoveryRequest) => Promise<readonly OllamaCatalogModelConfig[]>;
    /** Read the account's cloud usage with the stored or one-shot credential. */
    fetchUsage: (request: OllamaDiscoveryRequest) => Promise<OllamaUsageRead>;
    /** Open the frame-level picker immediately with the current selected ids. */
    beginModelPicker: (initiallyPicked: ReadonlySet<string>, onAdopt: (models: readonly OllamaCatalogModelConfig[]) => void) => void;
    /** Populate the open picker with discovered candidates. */
    completeModelPicker: (candidates: readonly OllamaCatalogModelConfig[]) => void;
    /** Show a discovery failure in the open picker. */
    failModelPicker: (message: string) => void;
    /** Close a picker whose owning settings card unmounts. */
    closeModelPicker: () => void;
}
/** Props delivered by the Plugin configuration item slot. */
export type OllamaPluginCardProps = PropsRuntime<'settings.provider.item'> & InjectFace<OllamaPluginCardFace>;
/** Render the single-package Ollama Cloud contribution under Plugin configuration. */
export declare function OllamaPluginCard(props: OllamaPluginCardProps): ReactNode;
//# sourceMappingURL=OllamaPluginCard.d.ts.map