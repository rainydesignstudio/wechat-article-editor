'use client';

import { useState } from 'react';
import { paginateMedia } from '../lib/mediaBrowsing';
import { useMediaPageSize } from './useMediaPreferences';

export function useMediaPagination<T>(items: readonly T[], scope: readonly unknown[]) {
  const [pageSize, setPageSize] = useMediaPageSize();
  const context = [...scope, pageSize];
  const [requested, setRequested] = useState({ context, page: 1 });
  const same = context.length === requested.context.length && context.every((value, index) => Object.is(value, requested.context[index]));
  const result = paginateMedia(items, same ? requested.page : 1, pageSize);
  // Adjust before committing the render: no stale page flash on filtering or deletion.
  if (!same || requested.page !== result.page) setRequested({ context, page: result.page });
  return { ...result, pageSize, setPageSize, setPage: (page: number) => setRequested({ context, page }) };
}
