import rehypeHighlight from 'rehype-highlight';
import { getFormatSnapshot } from './article-format/runtime';

type CodeNode = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: CodeNode[] };

export function rehypeArticleCodeHighlight() {
  // Leave language-less blocks as plain text and let rehype-highlight's
  // missing-language handling preserve unknown fences without execution.
  return rehypeHighlight({ detect: false });
}

// A configured HTML whitespace representation keeps code lines/tabs during rich-text paste.
export function rehypeArticleCodeWhitespace() {
  return (tree: CodeNode) => {
    const options = getFormatSnapshot().bundle.formatter.codeWhitespace;
    if (!options.enabled) return;
    const preserve = (node: CodeNode) => {
      if (!node.children) return;
      node.children = node.children.flatMap(child => {
        if (child.type !== 'text' || typeof child.value !== 'string') {
          preserve(child);
          return [child];
        }
        return child.value.split(/(\r\n|\r|\n|\t| +)/g).filter(Boolean).map(piece => {
          if (piece === '\n' || piece === '\r' || piece === '\r\n') return { type: 'element', tagName: 'br', properties: {}, children: [] };
          if (piece === '\t') return { type: 'element', tagName: 'span', properties: { 'data-code-tab': 'true' }, children: [{ type: 'text', value: '\u00a0'.repeat(options.tabSize) }] };
          return { type: 'text', value: piece.replace(/ /g, '\u00a0') };
        });
      });
    };
    const visit = (node: CodeNode) => {
      if (node.type === 'element' && node.tagName === 'pre') {
        for (const child of node.children ?? []) if (child.type === 'element' && child.tagName === 'code') preserve(child);
      } else node.children?.forEach(visit);
    };
    visit(tree);
  };
}
