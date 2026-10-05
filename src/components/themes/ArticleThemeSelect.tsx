'use client';

import type { ThemeConfig } from '../../lib/types';

export function ArticleThemeSelect({ themes, value, onChange }: {
  themes: readonly ThemeConfig[];
  value: string;
  onChange: (id: string) => void;
}) {
  return <label className="flex min-w-0 items-center gap-2 text-xs text-muted">
    <span className="shrink-0">预览主题</span>
    <select className="field min-h-9 min-w-0 w-40 py-1.5 text-xs" value={value} onChange={(event) => onChange(event.target.value)}>
      {themes.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
    </select>
  </label>;
}
