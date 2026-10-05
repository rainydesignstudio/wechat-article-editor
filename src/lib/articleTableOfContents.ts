type MarkdownNode = {
  type: string;
  value?: unknown;
  alt?: unknown;
  properties?: Record<string, unknown>;
  children?: MarkdownNode[];
  data?: { hProperties?: Record<string, unknown>; [key: string]: unknown };
};

const SANITIZED_ID_PREFIX = 'user-content-';

function plainText(node: MarkdownNode): string {
  if (node.type === 'text' || node.type === 'inlineCode') return typeof node.value === 'string' ? node.value : '';
  if (node.type === 'image') return typeof node.alt === 'string' ? node.alt : '';
  if (node.type === 'html') return typeof node.value === 'string' ? node.value.replace(/<[^>]*>/g, '') : '';
  if (node.type === 'break') return ' ';
  return (node.children ?? []).map(plainText).join('');
}

function slugBase(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/[\s-]+/g, '-') || 'section';
}

export function remarkHeadingIds() {
  return (tree: MarkdownNode) => {
    const usedIds = new Set<string>();
    const visit = (node: MarkdownNode) => {
      if (node.type === 'heading') {
        const title = plainText(node).replace(/\s+/g, ' ').trim();
        if (title) {
          const base = slugBase(title);
          let id = base;
          let suffix = 2;
          while (usedIds.has(id)) id = `${base}-${suffix++}`;
          usedIds.add(id);
          node.data = {
            ...node.data,
            hProperties: { ...node.data?.hProperties, id },
          };
        }
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

export function rehypeAlignSanitizedFragmentLinks() {
  return (tree: MarkdownNode) => {
    const ids = new Set<string>();
    const collect = (node: MarkdownNode) => {
      const id = node.properties?.id;
      if (node.type === 'element' && typeof id === 'string') ids.add(id);
      node.children?.forEach(collect);
    };
    collect(tree);

    const align = (node: MarkdownNode) => {
      const href = node.properties?.href;
      if (node.type === 'element' && typeof href === 'string' && href.startsWith('#')) {
        try {
          const target = decodeURIComponent(href.slice(1));
          if (ids.has(target)) node.properties = { ...node.properties, href: `#${SANITIZED_ID_PREFIX}${target}` };
        } catch {
          // Leave malformed fragments for the sanitizer/browser to handle without rewriting content.
        }
      }
      node.children?.forEach(align);
    };
    align(tree);
  };
}
