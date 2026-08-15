/** Frame-level model selection overlay opened by the Ollama settings card. */
import type { ReactNode } from 'react';
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { OllamaCatalogModelConfig } from '../client-contract.ts';
import type { OllamaSettingsKey } from './locales.ts';
/** Immutable observable state consumed by the shell overlay. */
export interface OllamaModelPickerSnapshot {
    /** Whether the overlay is visible. */
    open: boolean;
    /** Whether model metadata is still loading. */
    loading: boolean;
    /** Candidates in provider order. */
    candidates: readonly OllamaCatalogModelConfig[];
    /** IDs selected for adoption. */
    picked: ReadonlySet<string>;
    /** Visible discovery failure, when loading did not complete. */
    error?: string;
}
type Listener = () => void;
type Adopt = (models: readonly OllamaCatalogModelConfig[]) => void;
/** Shared observable joining the settings card to its frame-level overlay. */
export declare class OllamaModelPickerController {
    private snapshot;
    private readonly listeners;
    private onAdopt;
    /** Read the stable snapshot identity until picker state changes. */
    getSnapshot: () => OllamaModelPickerSnapshot;
    /** Subscribe one renderer listener. */
    subscribe: (listener: Listener) => (() => void);
    /** Open immediately while discovery loads. */
    begin(onAdopt: Adopt): void;
    /** Populate an open loading picker with every model selected initially. */
    complete(candidates: readonly OllamaCatalogModelConfig[]): void;
    /** Keep the open picker visible with a discovery failure. */
    fail(message: string): void;
    /** Close without adopting any candidate. */
    close: () => void;
    /** Toggle one candidate by id. */
    toggle: (id: string) => void;
    /** Close and deliver the selected candidates to the card. */
    adopt: () => void;
    private publish;
}
/** Values contributed to the shell overlay entry. */
export interface OllamaModelPickerFace {
    /** Localized picker copy. */
    t: (key: OllamaSettingsKey) => string;
    hooks: {
        /** Reactive picker state. */
        ollamaModelPicker: OllamaModelPickerController;
    };
    /** Close without adoption. */
    closePicker: () => void;
    /** Toggle one model id. */
    togglePickerModel: (id: string) => void;
    /** Adopt the selected models. */
    adoptPickerModels: () => void;
}
/** Props delivered by the frame overlay slot. */
export type OllamaModelPickerProps = PropsRuntime<'shell.overlay'> & InjectFace<OllamaModelPickerFace>;
/** Render the Ollama model candidate picker in the frame overlay layer. */
export declare function OllamaModelPicker(props: OllamaModelPickerProps): ReactNode;
export {};
//# sourceMappingURL=OllamaModelPicker.d.ts.map