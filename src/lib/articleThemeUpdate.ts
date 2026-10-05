import type { ThemeConfig } from './types';

// The library keeps one current file per theme ID. An article keeps its own
// snapshot, so a matching ID with a different version can be reapplied.
export function availableArticleThemeUpdate(current: Pick<ThemeConfig, 'id' | 'version'>, library: readonly ThemeConfig[]): ThemeConfig | null {
  const latest = library.find((theme) => theme.id === current.id);
  return latest && latest.version !== current.version ? latest : null;
}
