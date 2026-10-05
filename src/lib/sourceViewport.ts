/** Measure a source offset against the existing highlight text, without another text mirror. */
export function sourceOffsetRect(layer: HTMLElement, offset: number): DOMRect | null {
  const doc = layer.ownerDocument;
  const walker = doc.createTreeWalker(layer, 4); // NodeFilter.SHOW_TEXT
  let remaining = Math.max(0, offset);
  let last: Text | null = null;
  const rectAt = (node: Text, index: number) => {
    const range = doc.createRange();
    range.setStart(node, index);
    range.collapse(true);
    return range.getBoundingClientRect();
  };
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    // Empty source lines need a zero-width glyph for layout, but have no source characters.
    if (node.parentElement?.closest('[data-source-padding]')) {
      if (remaining === 0) return rectAt(node, 0);
      continue;
    }
    if (remaining < node.length) return rectAt(node, remaining);
    remaining -= node.length;
    last = node;
  }
  return last ? rectAt(last, last.length) : null;
}

/** Change only the common viewport; never scroll the textarea or a passive text layer. */
export function revealSourceRect(viewport: HTMLElement, rect: Pick<DOMRect, 'top' | 'bottom' | 'height'>): void {
  if (!rect.height || !viewport.clientHeight) return;
  const top = viewport.getBoundingClientRect().top + viewport.clientTop;
  const bottom = top + viewport.clientHeight;
  if (rect.top < top) viewport.scrollTop += rect.top - top;
  else if (rect.bottom > bottom) viewport.scrollTop += rect.bottom - bottom;
}
