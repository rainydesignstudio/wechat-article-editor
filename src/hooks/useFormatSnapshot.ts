'use client';
import { useSyncExternalStore } from 'react';
import { getFormatSnapshot, getInitialFormatSnapshot, subscribeFormatSnapshot } from '../lib/article-format/runtime';
export function useFormatSnapshot() { return useSyncExternalStore(subscribeFormatSnapshot, getFormatSnapshot, getInitialFormatSnapshot); }
