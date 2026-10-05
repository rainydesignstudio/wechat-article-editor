import type { ArticleSnippet, SnippetCategory } from './types';

export type SnippetGroup = { id: string; name: string; icon?: SnippetCategory['icon']; items: ArticleSnippet[] };
export type SnippetTreeRow = { id: string; group: SnippetGroup; snippet?: ArticleSnippet };

export function groupSnippetMatches(snippets: ArticleSnippet[], categories: SnippetCategory[] = []): SnippetGroup[] {
  const groups = new Map<string, SnippetGroup>();
  for (const snippet of snippets) {
    const id = snippet.categoryId ?? 'uncategorized';
    const category = categories.find(item => item.id === id);
    if (!groups.has(id)) groups.set(id, { id, name: category?.name ?? (id === 'uncategorized' ? '未分类' : id), icon: category?.icon, items: [] });
    groups.get(id)!.items.push(snippet);
  }
  return [...groups.values()].sort((a, b) => (categories.find(c => c.id === a.id)?.order ?? 0) - (categories.find(c => c.id === b.id)?.order ?? 0));
}

export function snippetTreeRows(groups: SnippetGroup[], expanded: string[]): SnippetTreeRow[] {
  return groups.flatMap(group => [{ id: `snippet-category-${group.id}`, group }, ...(expanded.includes(group.id) ? group.items.map(snippet => ({ id: `snippet-option-${snippet.id}`, group, snippet })) : [])]);
}
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

export type SnippetMenuMatch = {
  query: string;
  start: number;
  end: number;
  items: ArticleSnippet[];
};

export type SnippetSpaceExpansion = {
  snippet: ArticleSnippet;
  start: number;
  end: number;
};

type MarkdownNode = {
  type?: string;
  position?: { start?: { offset?: number }; end?: { offset?: number } };
  children?: MarkdownNode[];
};

const markdownParser = unified().use(remarkParse).use(remarkGfm);

function frontMatterBounds(source: string): { bodyStart: number; end: number | null } | null {
  const opening = source.match(/^---\r?\n/);
  if (!opening) return null;
  const bodyStart = opening[0].length;
  const remainder = source.slice(bodyStart);
  const closing = /\r?\n---(?:\r?\n|$)/.exec(remainder);
  if (!closing) return { bodyStart, end: null };
  return { bodyStart, end: bodyStart + closing.index + closing[0].length };
}

function containsCodeNodeAt(node: MarkdownNode, caret: number): boolean {
  if (node.type === 'code' || node.type === 'inlineCode') {
    const start = node.position?.start?.offset;
    const end = node.position?.end?.offset;
    if (typeof start === 'number' && typeof end === 'number' && start <= caret && caret <= end) return true;
  }
  return node.children?.some((child) => containsCodeNodeAt(child, caret)) ?? false;
}

function insideMarkdownCode(source: string, caret: number): boolean {
  const bounds = frontMatterBounds(source);
  const bodyStart = bounds?.end ?? (bounds ? source.length : 0);
  const body = source.slice(bodyStart);
  const bodyCaret = caret - bodyStart;
  if (bodyCaret < 0) return false;
  if (!/[`~]/.test(body)) return false;
  try {
    const tree = markdownParser.parse(body) as unknown as MarkdownNode;
    return containsCodeNodeAt(tree, bodyCaret);
  } catch {
    // Do not offer transformations when Markdown parsing cannot establish the context.
    return true;
  }
}

function insideUrl(source: string, caret: number): boolean {
  const prefix = source.slice(0, caret);
  const line = prefix.slice(prefix.lastIndexOf('\n') + 1);
  const token = /\S*$/.exec(line)?.[0] ?? '';
  return /[a-z][a-z\d+.-]*:\/\/|www\./i.test(token);
}

function triggerContextAllowed(source: string, caret: number, composing: boolean): boolean {
  if (composing || caret < 0 || caret > source.length) return false;
  const bounds = frontMatterBounds(source);
  const insideFrontMatter = Boolean(bounds && (bounds.end === null || caret <= bounds.end));
  return !insideFrontMatter && !insideMarkdownCode(source, caret) && !insideUrl(source, caret);
}

export function findSnippetMenuMatch(
  source: string,
  caret: number,
  snippets: ArticleSnippet[],
  composing = false,
): SnippetMenuMatch | null {
  if (composing || caret < 0 || caret > source.length) return null;
  const prefix = source.slice(0, caret);
  const match = /(^|[^/])\/\/([a-z0-9-]*)$/i.exec(prefix);
  if (!match) return null;
  if (!triggerContextAllowed(source, caret, composing)) return null;
  const query = match[2].toLowerCase();
  const start = caret - query.length - 2;
  const items = snippets.filter((snippet) => snippet.trigger.slice(2).toLowerCase().startsWith(query));
  if (!items.length) return null;
  return { query, start, end: caret, items };
}

export function findSnippetSpaceExpansion(
  source: string,
  caret: number,
  snippets: ArticleSnippet[],
  composing = false,
): SnippetSpaceExpansion | null {
  if (composing || caret < 0 || caret > source.length) return null;
  const prefix = source.slice(0, caret);
  const match = /\/\/([a-z0-9]+(?:-[a-z0-9]+)*)$/i.exec(prefix);
  if (!match) return null;
  if (!triggerContextAllowed(source, caret, composing)) return null;
  const start = caret - match[0].length;
  if (start > 0 && prefix[start - 1] === '/') return null;
  const snippet = snippets.find((item) => item.trigger.toLowerCase() === match[0].toLowerCase());
  return snippet ? { snippet, start, end: caret } : null;
}

export function prepareSnippetInsertion(content: string, source = '', start = source.length): { text: string; caretOffset: number } {
  content = content.replace(/^(?:\r?\n)+/, '');
  const newline = start > 0 && source[start - 1] !== '\n' ? (source.includes('\r\n') ? '\r\n' : '\n') : '';
  const markerIndex = content.indexOf('▌');
  if (markerIndex < 0) return { text: newline + content, caretOffset: newline.length + content.length };
  return { text: `${newline}${content.slice(0, markerIndex)}${content.slice(markerIndex + 1)}`, caretOffset: newline.length + markerIndex };
}
