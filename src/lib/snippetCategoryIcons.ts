import type { SnippetCategoryIcon } from './types';

export const SNIPPET_CATEGORY_ICONS: { id: SnippetCategoryIcon; label: string; path: string }[] = [
  { id: 'snippet', label: '片段', path: 'm8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16' },
  { id: 'folder', label: '文件夹', path: 'M3 7V4h6l2 3h10v13H3V7Z' },
  { id: 'book', label: '书本', path: 'M12 5v15M12 5C9 3 5 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-6-1-9 1Z' },
  { id: 'document', label: '文档', path: 'M5 3h10l4 4v14H5V3ZM14 3v5h5M9 12h6M9 16h4' },
  { id: 'bookmark', label: '书签', path: 'M6 3h12v18l-6-4-6 4V3Z' },
  { id: 'layers', label: '层叠', path: 'm12 3 10 6-10 6L2 9l10-6ZM2 13l10 6 10-6M2 17l10 6 10-6' },
  { id: 'quote', label: '引用', path: 'M10 5H3v7h5v3l-4 4m17-14h-7v7h5v3l-4 4' },
  { id: 'image', label: '图片', path: 'M3 3h18v18H3V3Zm0 14 6-6 4 4 3-3 5 5M7 7h1' },
  { id: 'table', label: '表格', path: 'M3 4h18v16H3V4Zm0 5h18M3 14h18M9 4v16' },
  { id: 'code', label: '代码', path: 'm8 6-6 6 6 6m8-12 6 6-6 6' },
  { id: 'sparkles', label: '灵感', path: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 2v4m-2-2h4' },
  { id: 'tag', label: '标签', path: 'M3 3h8l10 10-8 8L3 11V3ZM7 7h1' },
];

export function isSnippetCategoryIcon(value: unknown): value is SnippetCategoryIcon {
  return typeof value === 'string' && SNIPPET_CATEGORY_ICONS.some(icon => icon.id === value);
}

export const DEFAULT_SNIPPET_ICONS: Partial<Record<string, SnippetCategoryIcon>> = {
  callout: 'sparkles',
  'table-merged': 'table',
  'image-pair': 'image',
  'horizontal-scroll': 'image',
  'captioned-image': 'image',
  signature: 'bookmark',
  'reading-index': 'book',
  'zixu-entry': 'tag',
  'zixu-index': 'book',
  'zixu-chapter': 'bookmark',
  'zixu-opening': 'document',
  'zixu-note': 'sparkles',
  'rainy-opening': 'document',
  'rainy-section': 'layers',
  'rainy-quote': 'quote',
  'rainy-closing': 'bookmark',
};
