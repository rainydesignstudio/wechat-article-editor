import { EDITOR_COLOR_ROLES, editorSurfaceTokens, findEditorTheme, resolveEditorThemeColors, resolveEditorThemeSurfaces, validEditorThemeSurfaces, type EditorThemeSurfaces, type EditorTheme, type EditorThemeFontRole, type EditorColorScheme, type EditorColorRole } from './editorThemes';
import type { EditorAppearance } from './editorWorkspace';

export const EDITOR_THEME_CACHE_KEY = 'rainy-editor-theme-cache-v1';
export const EDITOR_THEME_DIRECTORY_KEY = 'rainy-editor-theme-directory-v1';
export const EDITOR_THEME_STYLE_ID = 'editor-theme-runtime';
const FONT_ROLES: EditorThemeFontRole[] = ['ui', 'heading', 'subHeading', 'eyebrow', 'serif', 'mono', 'editorSource', 'articleSource'];
const FONT_TOKENS: Record<EditorThemeFontRole, string> = { ui: '--font-sans', heading: '--font-heading', subHeading: '--font-sub-heading', eyebrow: '--font-eyebrow', serif: '--font-serif', mono: '--font-mono', editorSource: '--font-editor-source', articleSource: '--font-article-source' };
const CONTRACT = { cacheKey: EDITOR_THEME_CACHE_KEY, directoryKey: EDITOR_THEME_DIRECTORY_KEY, styleId: EDITOR_THEME_STYLE_ID, colorRoles: [...EDITOR_COLOR_ROLES], fontRoles: FONT_ROLES, fontTokens: FONT_TOKENS, codeFont: '"SFMono-Regular", Consolas, "Liberation Mono", monospace' };

type CacheContract = typeof CONTRACT;
export type EditorThemeCache = {
  version: 1;
  directoryId: string;
  appearance: EditorAppearance;
  colorTheme: { id: string; version: string };
  fontTheme: { id: string; version: string };
  colors: Record<EditorColorScheme, Record<EditorColorRole, string>>;
  fonts: Record<EditorThemeFontRole, string>;
  surfaces?: EditorThemeSurfaces;
};
type CacheStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// Keep this validator self-contained: the same function runs before hydration.
function validCache(value: unknown, contract: CacheContract, checkSurfaces: typeof validEditorThemeSurfaces): value is EditorThemeCache {
  const record = (item: unknown): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item);
  const id = (item: unknown) => typeof item === 'string' && /^[a-z0-9][a-z0-9-]{0,47}$/.test(item);
  const theme = (item: unknown) => record(item) && id(item.id) && typeof item.version === 'string' && /^\d+\.\d+\.\d+$/.test(item.version);
  if (!record(value) || value.version !== 1 || typeof value.directoryId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(value.directoryId)) return false;
  const appearance = value.appearance;
  if (!record(appearance) || !id(appearance.themeId) || !['light', 'dark', 'system'].includes(String(appearance.colorMode))) return false;
  if (appearance.custom !== null && (!record(appearance.custom) || !id(appearance.custom.colorThemeId) || !id(appearance.custom.fontThemeId))) return false;
  if (!theme(value.colorTheme) || !theme(value.fontTheme) || !record(value.colorTheme) || !record(value.fontTheme)) return false;
  const custom = record(appearance.custom) ? appearance.custom : null;
  if (value.colorTheme.id !== (custom?.colorThemeId ?? appearance.themeId) || value.fontTheme.id !== (custom?.fontThemeId ?? appearance.themeId)) return false;
  if (!record(value.colors) || Object.keys(value.colors).length !== 2 || !record(value.fonts)) return false;
  const cachedFonts = value.fonts;
  const expectedFonts = contract.fontRoles.filter(role => !['subHeading', 'articleSource'].includes(role) || role in cachedFonts);
  if (Object.keys(value.fonts).length !== expectedFonts.length) return false;
  for (const scheme of ['light', 'dark']) {
    const colors = value.colors[scheme];
    if (!record(colors) || Object.keys(colors).length !== contract.colorRoles.length) return false;
    for (const role of contract.colorRoles) if (typeof colors[role] !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(colors[role] as string)) return false;
  }
  for (const role of contract.fontRoles) {
    const font = role === 'subHeading' ? value.fonts[role] ?? value.fonts.ui : role === 'articleSource' ? value.fonts[role] ?? value.fonts.editorSource : value.fonts[role];
    if (typeof font !== 'string' || !font.trim() || font.length > 180 || !/^[\p{L}\p{N}\s,'"_-]+$/u.test(font)) return false;
  }
  if ('surfaces' in value && !checkSurfaces(value.surfaces)) return false;
  return true;
}

function storageOrNull(): CacheStorage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

export function readEditorThemeCache(storage: CacheStorage | null = storageOrNull()): EditorThemeCache | null {
  if (!storage) return null;
  try {
    const source = storage.getItem(EDITOR_THEME_CACHE_KEY);
    if (!source || source.length > 32_000) return null;
    const cache: unknown = JSON.parse(source);
    return validCache(cache, CONTRACT, validEditorThemeSurfaces) && cache.directoryId === storage.getItem(EDITOR_THEME_DIRECTORY_KEY) ? { ...cache, fonts: { ...cache.fonts, subHeading: cache.fonts.subHeading ?? cache.fonts.ui, articleSource: cache.fonts.articleSource ?? cache.fonts.editorSource, editorSource: cache.fonts.articleSource ? cache.fonts.editorSource : legacyCodeFont(cache.fonts.mono, CONTRACT) } } : null;
  } catch { return null; }
}

export function activateEditorThemeDirectory(directoryId: string | null, storage: CacheStorage | null = storageOrNull()): void {
  if (!storage) return;
  try {
    if (directoryId) storage.setItem(EDITOR_THEME_DIRECTORY_KEY, directoryId);
    else { storage.removeItem(EDITOR_THEME_DIRECTORY_KEY); storage.removeItem(EDITOR_THEME_CACHE_KEY); }
  } catch { /* Theme caching must never block opening or saving the library. */ }
}

export function cacheSavedEditorTheme(directoryId: string, appearance: EditorAppearance, themes: readonly EditorTheme[], storage: CacheStorage | null = storageOrNull()): boolean {
  if (!storage) return false;
  const colorTheme = findEditorTheme(themes, appearance.custom?.colorThemeId ?? appearance.themeId);
  const fontTheme = findEditorTheme(themes, appearance.custom?.fontThemeId ?? appearance.themeId);
  try {
    if (!colorTheme || !fontTheme) { storage.removeItem(EDITOR_THEME_CACHE_KEY); return false; }
    const cache: EditorThemeCache = {
      version: 1, directoryId, appearance: { ...appearance, custom: appearance.custom ? { ...appearance.custom } : null },
      colorTheme: { id: colorTheme.id, version: colorTheme.version }, fontTheme: { id: fontTheme.id, version: fontTheme.version },
      colors: { light: resolveEditorThemeColors(colorTheme, 'light'), dark: resolveEditorThemeColors(colorTheme, 'dark') },
      fonts: { ...fontTheme.fonts, eyebrow: fontTheme.fonts.eyebrow ?? fontTheme.fonts.ui },
      ...(colorTheme.surfaces ? { surfaces: resolveEditorThemeSurfaces(colorTheme) } : {}),
    };
    if (!validCache(cache, CONTRACT, validEditorThemeSurfaces)) return false;
    const source = JSON.stringify(cache);
    if (storage.getItem(EDITOR_THEME_CACHE_KEY) !== source) storage.setItem(EDITOR_THEME_CACHE_KEY, source);
    activateEditorThemeDirectory(directoryId, storage);
    return true;
  } catch { return false; }
}

// A single :root rule supplies both the shell and body-portaled dialogs without an html style attribute.
export function writeEditorThemeStyles(doc: Document, tokens: Record<string, string>, styleId = EDITOR_THEME_STYLE_ID): void {
  let style = doc.getElementById(styleId) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement('style');
    style.id = styleId;
    doc.head.appendChild(style);
  }
  style.textContent = `:root { ${Object.entries(tokens).map(([token, value]) => `${token}: ${value};`).join(' ')} }`;
}

export function applyEditorThemeCache(doc: Document, cache: EditorThemeCache, systemDark: boolean): void {
  const root = doc.documentElement;
  const scheme = cache.appearance.colorMode === 'system' ? (systemDark ? 'dark' : 'light') : cache.appearance.colorMode;
  const tokens: Record<string, string> = {};
  for (const role of EDITOR_COLOR_ROLES) tokens[`--color-${role}`] = cache.colors[scheme][role];
  for (const role of FONT_ROLES) tokens[FONT_TOKENS[role]] = cache.fonts[role];
  Object.assign(tokens, editorSurfaceTokens(cache.colors[scheme], cache.surfaces?.[scheme]));
  writeEditorThemeStyles(doc, tokens);
  root.dataset.colorMode = cache.appearance.colorMode;
  root.dataset.editorColorScheme = scheme;
  root.dataset.editorTheme = cache.appearance.custom ? 'custom' : cache.colorTheme.id;
  root.dataset.editorThemeState = 'cached';
}

function legacyCodeFont(mono: string, contract: CacheContract): string { return /(?:SFMono|Consolas|Roboto Mono|Liberation Mono)/i.test(mono) ? mono : contract.codeFont; }

function bootstrapCache(contract: CacheContract, validate: typeof validCache, codeFont: typeof legacyCodeFont, checkSurfaces: typeof validEditorThemeSurfaces, surfaceTokens: typeof editorSurfaceTokens, writeStyles: typeof writeEditorThemeStyles): void {
  const root = document.documentElement;
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.editorColorScheme = dark ? 'dark' : 'light';
  try {
    const source = window.localStorage.getItem(contract.cacheKey);
    if (!source || source.length > 32_000) return;
    const cache: unknown = JSON.parse(source);
    if (!validate(cache, contract, checkSurfaces) || cache.directoryId !== window.localStorage.getItem(contract.directoryKey)) return;
    const scheme = cache.appearance.colorMode === 'system' ? (dark ? 'dark' : 'light') : cache.appearance.colorMode;
    const tokens: Record<string, string> = {};
    for (const role of contract.colorRoles) tokens[`--color-${role}`] = cache.colors[scheme][role];
    for (const role of contract.fontRoles) tokens[contract.fontTokens[role]] = role === 'subHeading' ? cache.fonts[role] ?? cache.fonts.ui : role === 'articleSource' ? cache.fonts[role] ?? cache.fonts.editorSource : role === 'editorSource' && !cache.fonts.articleSource ? codeFont(cache.fonts.mono, contract) : cache.fonts[role];
    Object.assign(tokens, surfaceTokens(cache.colors[scheme], cache.surfaces?.[scheme]));
    writeStyles(document, tokens, contract.styleId);
    root.dataset.colorMode = cache.appearance.colorMode;
    root.dataset.editorColorScheme = scheme;
    root.dataset.editorTheme = cache.appearance.custom ? 'custom' : cache.colorTheme.id;
    root.dataset.editorThemeState = 'cached';
  } catch { /* Storage denial or invalid data keeps the neutral startup skeleton. */ }
}

export const EDITOR_THEME_BOOTSTRAP_SCRIPT = `(${bootstrapCache.toString()})(${JSON.stringify(CONTRACT)}, ${validCache.toString()}, ${legacyCodeFont.toString()}, ${validEditorThemeSurfaces.toString()}, ${editorSurfaceTokens.toString()}, ${writeEditorThemeStyles.toString()});`;
