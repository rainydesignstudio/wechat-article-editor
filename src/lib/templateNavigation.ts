export type TemplateTab = 'snippets' | 'templates';

export function readTemplateTab(search: string): TemplateTab {
  return new URLSearchParams(search).get('tab') === 'templates' ? 'templates' : 'snippets';
}

export function templateHref(tab: TemplateTab): string {
  return `/template/?tab=${tab}`;
}

export function historyPosition(state: unknown): number | null {
  if (!state || typeof state !== 'object') return null;
  const position = (state as Record<string, unknown>).rainyHistoryPosition;
  return typeof position === 'number' && Number.isSafeInteger(position) ? position : null;
}
