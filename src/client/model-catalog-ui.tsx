/** Shared model-catalog visual pattern extracted from opencode-go. */

import type { CSSProperties, ReactNode } from 'react'

export const inputStyle: CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  minHeight: 36,
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 8,
  padding: '7px 10px',
  background: 'var(--dsw-alias-bg-layer-1)',
  color: 'var(--dsw-alias-label-primary)',
  font: 'inherit',
}

export const rowInputStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 32,
  padding: '4px 10px',
}

export const selectStyle: CSSProperties = {
  boxSizing: 'border-box',
  minHeight: 32,
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 8,
  padding: '4px 28px 4px 10px',
  backgroundColor: 'var(--dsw-alias-bg-layer-1)',
  color: 'var(--dsw-alias-label-primary)',
  font: 'inherit',
  appearance: 'none',
  backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4 6l4 4 4-4' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 8px center',
}

export const rowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 10,
}

export const modelDetailStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  borderTop: '1px solid var(--dsw-alias-border-l2)',
  padding: '10px 4px 4px',
}

export const capabilitiesStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 14,
}

export const modelContentStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr) auto auto',
  alignItems: 'center',
  gap: 6,
  padding: '6px 8px',
}

export const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

export const labelStyle: CSSProperties = {
  fontSize: 13,
  color: 'var(--dsw-alias-label-secondary)',
}

export const hintStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: 'var(--dsw-alias-label-tertiary)',
}

/** Hides modelDetailStyle. First row is Context window, second row is Vision/Reasoning/Default thinking. */
export function ModelDetail(props: { children: ReactNode, gridColumn?: string }): ReactNode {
  return <div style={{ ...modelDetailStyle, ...(props.gridColumn === undefined ? {} : { gridColumn: props.gridColumn }) }}>{props.children}</div>
}

/** Hides rowStyle (2-col grid). */
export function CatalogRow(props: { children: ReactNode }): ReactNode {
  return <div style={rowStyle}>{props.children}</div>
}

/** Hides capabilitiesStyle (flex wrap gap14). */
export function CapabilitiesRow(props: { children: ReactNode }): ReactNode {
  return <div style={capabilitiesStyle}>{props.children}</div>
}

/** Hides modelContentStyle (grid for row). */
export function ModelContent(props: { children: ReactNode, label?: string }): ReactNode {
  return <div data-model-row={props.label} style={modelContentStyle}>{props.children}</div>
}

/** Small interface: renders a labeled 36h input. */
export function CatalogField(props: { label: string, children: ReactNode }): ReactNode {
  return (
    <label style={fieldStyle}>
      <span style={labelStyle}>{props.label}</span>
      {props.children}
    </label>
  )
}
