import type { CSSProperties } from 'react';
import { getFormatSnapshot } from './runtime';

export function previewSurfaceStyle(dark = false): CSSProperties {
  const preview = getFormatSnapshot().bundle.formatter.preview;
  return { backgroundColor: dark ? preview.dark.background : preview.light.background };
}
export function articlePreviewStyle(css: string): string {
  const preview = getFormatSnapshot().bundle.formatter.preview;
  const font = preview.fontFamily ? `font-family:${preview.fontFamily};` : '';
  const surface = preview.stripThemeBackground ? '\narticle.article-preview,article.article-preview>.article-body{background:transparent;}' : '';
  return `:host{${font}color:${preview.color};}\n${css}${surface}`;
}
