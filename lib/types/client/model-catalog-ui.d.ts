/** Shared model-catalog visual pattern extracted from opencode-go. */
import type { CSSProperties, ReactNode } from 'react';
export declare const inputStyle: CSSProperties;
export declare const rowInputStyle: CSSProperties;
export declare const selectStyle: CSSProperties;
export declare const rowStyle: CSSProperties;
export declare const modelDetailStyle: CSSProperties;
export declare const capabilitiesStyle: CSSProperties;
export declare const modelContentStyle: CSSProperties;
export declare const fieldStyle: CSSProperties;
export declare const labelStyle: CSSProperties;
export declare const hintStyle: CSSProperties;
/** Hides modelDetailStyle. First row is Context window, second row is Vision/Reasoning/Default thinking. */
export declare function ModelDetail(props: {
    children: ReactNode;
    gridColumn?: string;
}): ReactNode;
/** Hides rowStyle (2-col grid). */
export declare function CatalogRow(props: {
    children: ReactNode;
}): ReactNode;
/** Hides capabilitiesStyle (flex wrap gap14). */
export declare function CapabilitiesRow(props: {
    children: ReactNode;
}): ReactNode;
/** Hides modelContentStyle (grid for row). */
export declare function ModelContent(props: {
    children: ReactNode;
    label?: string;
}): ReactNode;
/** Small interface: renders a labeled 36h input. */
export declare function CatalogField(props: {
    label: string;
    children: ReactNode;
}): ReactNode;
//# sourceMappingURL=model-catalog-ui.d.ts.map