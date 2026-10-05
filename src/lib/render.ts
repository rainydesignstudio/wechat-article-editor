import { createArticleColorNormalizer } from './articleDarkPreview';
import { articleFormatAllowsCssProperty } from './articleFormat';
import { assertFormatReady, getFormatSnapshot } from './article-format/runtime';

export { SAFE_REHYPE_SCHEMA, sanitizeStyleValue, rehypeSafeStyles, sanitizeHtml } from './article-format/sanitize';
import { sanitizeHtml } from './article-format/sanitize';

export function extractClassCandidates(html: string): string[] {
  const candidates = new Set<string>();
  const pattern = /class(?:Name)?\s*=\s*["']([^"']+)["']/gi;
  for (const match of html.matchAll(pattern)) {
    for (const candidate of match[1].split(/\s+/)) {
      if (candidate && /^[a-zA-Z0-9_:/.[\]#%!,()\-]+$/.test(candidate)) candidates.add(candidate);
    }
  }
  return [...candidates];
}

export function extractMarkdownClassCandidates(markdown: string): string[] {
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
  return extractClassCandidates(sanitizeHtml(withoutCode));
}

type ClipboardStyleMap = { get(name: string): { toString(): string } | undefined };

function clipboardDimension(source: HTMLElement, computed: CSSStyleDeclaration, typed: ClipboardStyleMap | undefined, property: string): string {
  // Typed OM retains percentages and auto, unlike getComputedStyle's used pixel
  // width. Never freeze intrinsic heading labels or automatic image heights.
  const value = typed?.get(property)?.toString() || source.style?.getPropertyValue(property) || '';
  const resolved = value.replace(/var\(\s*(--[\w-]+)\s*\)/g, (_, token: string) => computed.getPropertyValue(token).trim());
  if (getFormatSnapshot().bundle.formatter.output.preserveAutoDimensions && resolved === 'auto') return resolved;
  return !resolved || /^(auto|none|normal)$/.test(resolved) ? '' : resolved;
}

export type ClipboardPayload = {
  html: string;
  text: string;
  localImageCount: number;
};

export function clipboardPlainText(node: Node, inCodeBlock = false): string {
  const element = node.nodeType === 1 ? node as HTMLElement : null;
  if (element?.tagName === 'BR') return '\n';
  if (inCodeBlock && element?.hasAttribute('data-code-tab')) return '\t';
  const codeBlock = inCodeBlock || element?.tagName === 'CODE' && element.parentElement?.tagName === 'PRE';
  if (!node.childNodes?.length) {
    const value = node.textContent ?? '';
    return codeBlock ? value.replace(/\u00a0/g, ' ') : value;
  }
  return [...node.childNodes].map(child => clipboardPlainText(child, codeBlock)).join('');
}

export function buildClipboardPayload(root: HTMLElement): ClipboardPayload {
  const snapshot = getFormatSnapshot(); assertFormatReady(snapshot);
  const output = snapshot.bundle.formatter.output;
  const keptAttributes = new Set(output.preserveAttributes);
  const body = root.querySelector('.article-body') ?? root;
  // Preview containers are editor implementation details. Keep their two style layers in the
  // clipboard, using the configured output container.
  const bodyClone = body === root ? body.cloneNode(true) as HTMLElement : root.ownerDocument.createElement(output.wrapperTag);
  if (body !== root) for (const child of Array.from(body.childNodes ?? body.children)) bodyClone.append(child.cloneNode(true));
  const rawText = clipboardPlainText(bodyClone);
  const maximum = output.plainText.maxConsecutiveNewlines;
  const boundedText = maximum > 0 ? rawText.replace(new RegExp(`\\n{${maximum + 1},}`, 'g'), '\n'.repeat(maximum)) : rawText;
  const plainText = output.plainText.trim ? boundedText.trim() : boundedText;
  // The generated article and body are the reader page, not authored color blocks.
  // Content descendants can still carry explicit backgrounds into the clipboard.
  const clone = body === root ? bodyClone : root.ownerDocument.createElement(output.wrapperTag);
  if (clone !== bodyClone) {
    clone.append(bodyClone);
    for (const attribute of root.attributes) {
      if (keptAttributes.has(attribute.name)) clone.setAttribute(attribute.name, attribute.value);
    }
  }
  // Restore filesystem references only in an inert document: detached <img> elements
  // in the live document can otherwise start unwanted localhost HTTP requests.
  root.ownerDocument?.createElement('template').content?.append(clone);
  const sourceElements = [...(body === root ? [] : [root]), body, ...Array.from(body.querySelectorAll('*'))];
  const cloneElements = [...(clone === bodyClone ? [] : [clone]), bodyClone, ...Array.from(bodyClone.querySelectorAll('*'))];
  const view = root.ownerDocument?.defaultView ?? window;
  const { normalizePaint } = createArticleColorNormalizer(root.ownerDocument);
  let localImageCount = 0;

  for (let index = 0; index < cloneElements.length; index += 1) {
    const source = sourceElements[index] as HTMLElement | undefined;
    const target = cloneElements[index] as HTMLElement | undefined;
    if (!source || !target) continue;
    const localAssetSource = source.getAttribute('data-local-asset-src');
    const localAssetSourceSet = source.getAttribute('data-local-asset-srcset');
    const clipboardSource = source.getAttribute('data-clipboard-src');
    const hasClipboardSource = source.hasAttribute('data-clipboard-src');
    const clipboardSourceSet = source.getAttribute('data-clipboard-srcset');
    if (localAssetSource || localAssetSourceSet) {
      localImageCount += 1;
    }
    if (target.tagName === 'IMG' && hasClipboardSource) {
      if (clipboardSource) target.setAttribute('src', clipboardSource);
      else target.removeAttribute('src');
    } else if (localAssetSource && target.tagName === 'IMG') {
      target.setAttribute('src', localAssetSource);
    }
    if (clipboardSourceSet && (target.tagName === 'IMG' || target.tagName === 'SOURCE')) {
      target.setAttribute('srcset', clipboardSourceSet);
    }
    if (!localAssetSource && !localAssetSourceSet && target.tagName === 'IMG') {
      const src = target.getAttribute('src') ?? '';
      if (src.startsWith('./') || src.startsWith('../') || src.startsWith('blob:') || src.startsWith('media/image/')) localImageCount += 1;
    }
    const computed = view.getComputedStyle(source);
    const typed = (source as HTMLElement & { computedStyleMap?: () => ClipboardStyleMap }).computedStyleMap?.();
    const styles = [...output.inlineProperties.map((property) => {
      if (output.stripRootBackground && body !== root && (source === root || source === body) && (property === 'background-color' || property === 'background-image')) return '';
      const value = property.startsWith('grid-template-') ? typed?.get(property)?.toString() || computed.getPropertyValue(property) : computed.getPropertyValue(property);
      return articleFormatAllowsCssProperty(property, value) ? `${property}:${output.colorEncoding === 'rgb' ? normalizePaint(value) : value}` : '';
    }), ...output.dimensionProperties.map(property => `${property}:${clipboardDimension(source, computed, typed, property)}`)]
      .filter((value) => value && !value.endsWith(':'))
      .join(';');
    if (styles) target.setAttribute('style', styles);
    else target.removeAttribute('style');
    [...target.attributes].forEach((attribute) => {
      if (output.removeClasses && attribute.name === 'class' || attribute.name.startsWith('data-') && !keptAttributes.has(attribute.name) || attribute.name.startsWith('aria-') && !keptAttributes.has(attribute.name)) {
        target.removeAttribute(attribute.name);
      }
    });
  }

  return {
    html: sanitizeHtml(clone.outerHTML),
    text: plainText,
    localImageCount,
  };
}
