export type Style = { start: number; end: number; style: string; meta?: Record<string, unknown> }
export type Block = { id: string; text: string; type?: string; styles?: Style[]; editable?: boolean; [key: string]: unknown }
