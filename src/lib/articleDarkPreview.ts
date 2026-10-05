import { getFormatSnapshot } from './article-format/runtime';
import { formatPreviewDocument } from './article-format/frame';
// Configured conversion runs only in a fresh document. The light DOM remains untouched.
export function observeArticlePreview(root: HTMLElement, refresh: () => void): () => void {
  let active = true;
  let previous = '';
  const sync = () => {
    if (!active) return;
    // React can reapply identical attributes (for example checkbox defaults).
    // A notification alone must never trigger another iframe navigation.
    const content = root.outerHTML;
    if (content === previous) return;
    previous = content;
    refresh();
  };
  const observer = new MutationObserver(sync);
  observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true });
  sync();
  return () => { active = false; observer.disconnect(); };
}


export { createArticleColorNormalizer } from './article-format/colors';

export function cloneArticleForDarkPreview(root: HTMLElement): HTMLElement {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.removeAttribute('hidden');
  const view = root.ownerDocument.defaultView;
  if (!view) throw new Error('文章预览尚未挂载。');
  const originals = [root, ...root.querySelectorAll<HTMLElement>('*')];
  const copies = [clone, ...clone.querySelectorAll<HTMLElement>('*')];
  const options = getFormatSnapshot().bundle.formatter.output;
  originals.forEach((source, index) => {
    const computed = view.getComputedStyle(source);
    for (const property of options.inlineProperties) copies[index].style.setProperty(property, computed.getPropertyValue(property));
  });
  if (getFormatSnapshot().bundle.formatter.preview.stripThemeBackground) {
    for (const node of [clone, clone.querySelector<HTMLElement>(':scope > .article-body')]) {
      node?.style.removeProperty('background-color'); node?.style.removeProperty('background-image');
    }
  }
  return clone;
}

export function articleDarkPreviewDocument(css: string, html: string): string {
  return formatPreviewDocument(css, html, true);
}
