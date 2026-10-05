'use client';

import { useLayoutEffect, useState } from 'react';

export const ARTICLE_PREVIEW_MODE_KEY = 'rainy-article-preview-mode-v1';
const EVENT = 'rainy-article-preview-mode-change';
let sessionMode: string | null = null;

// Shared across the editor, theme library and dialogs. Until a user chooses a
// mode, system changes continue to apply; no preference is written on mount.
export function useArticlePreviewMode() {
  const [dark, setDark] = useState(false);
  useLayoutEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = (event?: Event) => {
      if (event?.type === 'storage') sessionMode = null;
      let saved: string | null = null;
      try { saved = window.localStorage.getItem(ARTICLE_PREVIEW_MODE_KEY); } catch { /* unavailable storage */ }
      const mode = sessionMode ?? saved;
      setDark(mode === 'dark' || (mode !== 'light' && query.matches));
    };
    sync();
    query.addEventListener('change', sync);
    window.addEventListener('storage', sync);
    window.addEventListener(EVENT, sync);
    return () => { query.removeEventListener('change', sync); window.removeEventListener('storage', sync); window.removeEventListener(EVENT, sync); };
  }, []);
  const toggle = () => {
    const next = !dark;
    sessionMode = next ? 'dark' : 'light';
    setDark(next);
    try { window.localStorage.setItem(ARTICLE_PREVIEW_MODE_KEY, next ? 'dark' : 'light'); } catch { /* session still works */ }
    window.dispatchEvent(new CustomEvent(EVENT));
  };
  return { dark, toggle };
}
