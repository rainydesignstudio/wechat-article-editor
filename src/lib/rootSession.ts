export type RootRefreshResult<Value> =
  | { kind: 'refreshed'; value: Value }
  | { kind: 'stale' }
  | { kind: 'failed'; error: unknown };

export async function refreshRootSession<Root extends object, Value>(
  expectedRoot: Root,
  isCurrentRoot: (root: Root) => boolean,
  load: (root: Root) => Promise<Value>,
  commit: (value: Value) => void,
): Promise<RootRefreshResult<Value>> {
  try {
    const value = await load(expectedRoot);
    if (!isCurrentRoot(expectedRoot)) return { kind: 'stale' };
    commit(value);
    return { kind: 'refreshed', value };
  } catch (error) {
    return isCurrentRoot(expectedRoot) ? { kind: 'failed', error } : { kind: 'stale' };
  }
}
