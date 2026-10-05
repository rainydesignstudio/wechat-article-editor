'use client';

import { useLayoutEffect, useState } from 'react';

export const UNCLASSIFIED_COLLAPSED_KEY = 'rainy-unclassified-collapsed-v1';
const EVENT = 'rainy-unclassified-collapse-change';
let sessionValue: boolean | null = null;

function currentPreference(): boolean {
  if (sessionValue !== null) return sessionValue;
  try { return window.localStorage.getItem(UNCLASSIFIED_COLLAPSED_KEY) === 'true'; }
  catch { return false; }
}

// Shared across pages and libraries; mounting never overwrites the saved choice.
export function useUnclassifiedCollapsed() {
  const [collapsed, setCollapsed] = useState(false);
  useLayoutEffect(() => {
    const sync = () => setCollapsed(currentPreference());
    const syncStorage = (event: StorageEvent) => {
      if (event.key !== UNCLASSIFIED_COLLAPSED_KEY && event.key !== null) return;
      sessionValue = null;
      sync();
    };
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', syncStorage);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', syncStorage); };
  }, []);
  const toggle = () => {
    const next = !currentPreference();
    sessionValue = next;
    setCollapsed(next);
    try { window.localStorage.setItem(UNCLASSIFIED_COLLAPSED_KEY, String(next)); }
    catch { /* Share the choice for this session when storage is unavailable. */ }
    window.dispatchEvent(new CustomEvent(EVENT));
  };
  return { collapsed, toggle };
}
