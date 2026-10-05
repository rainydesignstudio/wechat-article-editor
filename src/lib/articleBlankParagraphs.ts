import { getFormatSnapshot } from './article-format/runtime';
type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  position?: { start?: { offset?: number }; end?: { offset?: number } };
};

function emptyParagraphs(gap: string, betweenBlocks: boolean): MarkdownNode[] {
  if (!/^[\t \r\n]*$/.test(gap)) return [];
  const newlines = gap.match(/\r\n|\r|\n/g)?.length ?? 0;
  // One blank line separates two Markdown blocks. Only further blank lines
  // need their own paragraph. At the document edges there is no separator.
  const options = getFormatSnapshot().bundle.formatter.markdown;
  const separators = betweenBlocks ? options.betweenBlocks : options.atEdges;
  return Array.from({ length: Math.max(0, newlines - separators) }, () => ({
    type: 'paragraph',
    children: [{ type: 'html', value: '<br>' }],
  }));
}

// Markdown treats blank lines as separators and discards their count. Keep
// extra empty lines as <p><br></p> without touching fenced code or nested blocks.
export function remarkArticleBlankParagraphs() {
  return (tree: MarkdownNode, file: { value: string | Uint8Array }) => {
    if (!getFormatSnapshot().bundle.formatter.markdown.preserveExtraBlankLines) return;
    if (!tree.children) return;
    const source = typeof file.value === 'string' ? file.value : new TextDecoder().decode(file.value);
    const children: MarkdownNode[] = [];
    let previousEnd = 0;
    for (const node of tree.children) {
      const start = node.position?.start?.offset ?? previousEnd;
      children.push(...emptyParagraphs(source.slice(previousEnd, start), children.length > 0), node);
      previousEnd = node.position?.end?.offset ?? start;
    }
    children.push(...emptyParagraphs(source.slice(previousEnd), false));
    tree.children = children;
  };
}

export function remarkArticleSoftBreaks() {
  return (tree: MarkdownNode) => {
    if (getFormatSnapshot().bundle.formatter.markdown.softBreaks !== 'line-break') return;
    const visit = (node: MarkdownNode) => {
      if (!node.children || node.type === 'code' || node.type === 'inlineCode') return;
      node.children = node.children.flatMap(child => {
        if (child.type !== 'text' || !child.value?.includes('\n')) { visit(child); return [child]; }
        const parts = child.value.split('\n');
        return parts.flatMap((value, index) => index ? [{ type: 'break' }, { ...child, value }] : [{ ...child, value }]);
      });
    };
    visit(tree);
  };
}

type SourcePositionNode = { type: string; properties?: Record<string, unknown>; position?: { start?: { line?: number } }; children?: SourcePositionNode[] };
export function rehypeArticleSourcePositions() {
  return (tree: SourcePositionNode) => {
    const visit = (node: typeof tree) => {
      if (node.type === 'element' && node.position?.start?.line) { node.properties ??= {}; node.properties.dataSourceLine = node.position.start.line; }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
