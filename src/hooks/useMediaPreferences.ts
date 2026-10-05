'use client';
import { useCallback, useEffect, useState } from 'react';
import { isMediaPageSize, type MediaPageSize } from '../lib/mediaBrowsing';
const memory = new Map<string, unknown>();
const EVENT = 'rainy-browser-preference-change';
function usePreference<T>(key: string, fallback: T, valid: (value: unknown) => value is T) {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    const sync = () => {
      let candidate: unknown = memory.get(key);
      if (!memory.has(key)) try { const saved = window.localStorage.getItem(key); if (saved !== null) candidate = JSON.parse(saved); } catch {}
      setValue(valid(candidate) ? candidate : fallback);
    };
    const storage = (event: StorageEvent) => { if (event.key === key || event.key === null) { memory.delete(key); sync(); } };
    sync(); window.addEventListener(EVENT, sync); window.addEventListener('storage', storage);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', storage); };
  }, [key, fallback, valid]);
  const save = useCallback((next: T) => {
    memory.set(key, next); setValue(next);
    try { window.localStorage.setItem(key, JSON.stringify(next)); } catch {}
    window.dispatchEvent(new CustomEvent(EVENT));
  }, [key]);
  return [value, save] as const;
}
export type MediaPreferences = { columns: 1 | 2 | 3 | 4; sort: 'name' | 'modified' | 'size'; descending: boolean };
const defaults: MediaPreferences = { columns: 3, sort: 'name', descending: false };
const validMedia = (value: unknown): value is MediaPreferences => Boolean(value && typeof value === 'object' && 'columns' in value && typeof value.columns === 'number' && [1, 2, 3, 4].includes(value.columns) && 'sort' in value && typeof value.sort === 'string' && ['name', 'modified', 'size'].includes(value.sort) && 'descending' in value && typeof value.descending === 'boolean');
const validBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
export const useMediaPreferences = () => usePreference('rainy-media-preferences-v1', defaults, validMedia);
export const useMediaPageSize = () => usePreference<MediaPageSize>('rainy-media-page-size-v1', 20, isMediaPageSize);
export const useAuthoringChecks = () => usePreference('rainy-authoring-checks-v1', true, validBoolean);
