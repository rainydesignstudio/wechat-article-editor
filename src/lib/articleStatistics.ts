import { parseFragment } from 'parse5';

type HtmlNode = {
  nodeName: string;
  tagName?: string;
  value?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: HtmlNode[];
};

export type ArticleStatistics = {
  characters: number;
  readingMinutes: number;
  headings: number;
  paragraphs: number;
  images: number;
  links: number;
  codeBlocks: number;
};

const IGNORED_TAGS = new Set(['script', 'style', 'template']);

function localImagePlaceholder(node: HtmlNode): boolean {
  return node.attrs?.some(attribute => attribute.name === 'data-local-asset-src' || attribute.name === 'data-local-asset-srcset') ?? false;
}

function visibleText(node: HtmlNode): string {
  if (node.tagName && IGNORED_TAGS.has(node.tagName)) return '';
  if (localImagePlaceholder(node)) return '';
  if (node.nodeName === '#text') return node.value ?? '';
  return (node.childNodes ?? []).map(visibleText).join('');
}

function containsImage(node: HtmlNode): boolean {
  return node.tagName === 'img' || localImagePlaceholder(node) || (node.childNodes ?? []).some(containsImage);
}

export function articleStatisticsFromHtml(html: string): ArticleStatistics {
  const tree = parseFragment(html) as unknown as HtmlNode;
  const statistics: ArticleStatistics = { characters: 0, readingMinutes: 0, headings: 0, paragraphs: 0, images: 0, links: 0, codeBlocks: 0 };
  const visit = (node: HtmlNode) => {
    const tag = node.tagName;
    if (tag && IGNORED_TAGS.has(tag)) return;
    if (tag && /^h[1-6]$/.test(tag)) statistics.headings += 1;
    if (tag === 'p' && (visibleText(node).trim() || containsImage(node))) statistics.paragraphs += 1;
    if (tag === 'img' || localImagePlaceholder(node)) statistics.images += 1;
    if (tag === 'a' && node.attrs?.some(attribute => attribute.name === 'href')) statistics.links += 1;
    if (tag === 'pre') statistics.codeBlocks += 1;
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(tree);
  statistics.characters = Array.from(visibleText(tree)).filter(character => !/\s/u.test(character)).length;
  statistics.readingMinutes = Math.ceil(statistics.characters / 300);
  return statistics;
}
