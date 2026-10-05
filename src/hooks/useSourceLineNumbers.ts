'use client';

import { useLayoutEffect, useState } from 'react';

export const SOURCE_LINE_NUMBERS_KEY = 'rainy-source-line-numbers-v1';
const EVENT = 'rainy-source-line-numbers-change';
let sessionValue: boolean | null = null;

function currentPreference(): boolean {
  if (sessionValue !== null) return sessionValue;
  try { return window.localStorage.getItem(SOURCE_LINE_NUMBERS_KEY) === 'true'; }
  catch { return false; }
}

// One preference for every article; mounting never overwrites the saved choice.
export function useSourceLineNumbers() {
  const [showLineNumbers, setShowLineNumbers] = useState(false);
  useLayoutEffect(() => {
    const sync = () => setShowLineNumbers(currentPreference());
    const syncStorage = (event: StorageEvent) => {
      if (event.key !== SOURCE_LINE_NUMBERS_KEY && event.key !== null) return;
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
    setShowLineNumbers(next);
    try { window.localStorage.setItem(SOURCE_LINE_NUMBERS_KEY, String(next)); }
    catch { /* Keep the preference shared for this session when storage is unavailable. */ }
    window.dispatchEvent(new CustomEvent(EVENT));
  };
  return { showLineNumbers, toggle };
}
