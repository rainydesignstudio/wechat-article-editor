import { useLayoutEffect, useRef } from 'react';

// Shared by the release notes and format check disclosures. Pixel endpoints animate while
// the expanded state settles at `none`, so later content changes cannot be clipped.
export function useAnimatedMaxHeight(open: boolean) {
  const bodyRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    if (!node.style.maxHeight) {
      node.style.maxHeight = open ? 'none' : '0px';
      return;
    }
    if (open) {
      node.style.maxHeight = `${node.getBoundingClientRect().height}px`;
      node.getBoundingClientRect();
      node.style.maxHeight = `${node.scrollHeight}px`;
      const settle = (event?: TransitionEvent) => {
        if (event && (event.target !== node || event.propertyName !== 'max-height')) return;
        node.style.maxHeight = 'none';
      };
      node.addEventListener('transitionend', settle);
      const timer = window.setTimeout(settle, 220);
      return () => { node.removeEventListener('transitionend', settle); window.clearTimeout(timer); };
    }
    node.style.maxHeight = node.style.maxHeight === 'none' ? `${node.scrollHeight}px` : node.style.maxHeight;
    node.getBoundingClientRect();
    node.style.maxHeight = '0px';
  }, [open]);
  return bodyRef;
}
