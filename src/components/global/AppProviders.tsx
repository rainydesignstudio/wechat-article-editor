'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { useFormatSnapshot } from '../../hooks/useFormatSnapshot';
import { useEditorController } from '../../hooks/useEditorController';
import { DEFAULT_EDITOR_THEME, EDITOR_COLOR_ROLES, editorSurfaceTokens, findEditorTheme, resolveEditorThemeColors, resolveEditorThemeSurfaces } from '../../lib/editorThemes';
import type { EditorAppearance } from '../../lib/editorWorkspace';
import { applyEditorThemeCache, cacheSavedEditorTheme, readEditorThemeCache, writeEditorThemeStyles, type EditorThemeCache } from '../../lib/editorThemeCache';

type EditorController = ReturnType<typeof useEditorController> & {
  editorAppearancePreview: EditorAppearance | null;
  previewEditorAppearance: (appearance: EditorAppearance | null) => void;
  displayedEditorAppearance: EditorAppearance;
};
const EditorContext = createContext<EditorController | null>(null);

export function AppProviders({ children }: { children: ReactNode }) {
  const controller = useEditorController();
  const format = useFormatSnapshot();
  const [editorAppearancePreview, previewEditorAppearance] = useState<EditorAppearance | null>(null);
  const [startupCache, setStartupCache] = useState<EditorThemeCache | null>(null);
  const [hasLoadedAppearance, setHasLoadedAppearance] = useState(false);
  useLayoutEffect(() => { setStartupCache(readEditorThemeCache()); }, []);
  useLayoutEffect(() => {
    if (controller.editorAppearanceReady) {
      setStartupCache(null);
      setHasLoadedAppearance(true);
    }
  }, [controller.editorAppearanceReady]);
  const appearance = editorAppearancePreview ?? (controller.editorAppearanceReady
    ? controller.editorWorkspace.appearance : startupCache?.appearance ?? controller.editorWorkspace.appearance);
  const editorThemes = controller.editorThemes;
  useLayoutEffect(() => {
    if (!controller.editorAppearanceReady && !startupCache) return;
    const root = document.documentElement;
    const systemScheme = window.matchMedia('(prefers-color-scheme: dark)');
    root.dataset.colorMode = appearance.colorMode;
    const syncEditorColorScheme = () => {
      if (!controller.editorAppearanceReady && startupCache) {
        applyEditorThemeCache(document, startupCache, systemScheme.matches);
        return;
      }
      const mode = appearance.colorMode === 'system'
        ? (systemScheme.matches ? 'dark' : 'light')
        : appearance.colorMode;
      root.dataset.editorColorScheme = mode;
      const colorsFrom = appearance.custom?.colorThemeId ?? appearance.themeId;
      const fontsFrom = appearance.custom?.fontThemeId ?? appearance.themeId;
      const colorTheme = findEditorTheme(editorThemes, colorsFrom) ?? DEFAULT_EDITOR_THEME;
      const fontTheme = findEditorTheme(editorThemes, fontsFrom) ?? DEFAULT_EDITOR_THEME;
      const colors = resolveEditorThemeColors(colorTheme, mode);
      const tokens: Record<string, string> = {};
      for (const role of EDITOR_COLOR_ROLES) tokens[`--color-${role}`] = colors[role];
      Object.assign(tokens, editorSurfaceTokens(colors, resolveEditorThemeSurfaces(colorTheme)?.[mode]));
      Object.assign(tokens, {
        '--font-sans': fontTheme.fonts.ui,
        '--font-heading': fontTheme.fonts.heading,
        '--font-sub-heading': fontTheme.fonts.subHeading,
        '--font-eyebrow': fontTheme.fonts.eyebrow ?? fontTheme.fonts.ui,
        '--font-serif': fontTheme.fonts.serif,
        '--font-mono': fontTheme.fonts.mono,
        '--font-editor-source': fontTheme.fonts.editorSource,
        '--font-article-source': fontTheme.fonts.articleSource,
      });
      writeEditorThemeStyles(document, tokens);
      root.dataset.editorTheme = appearance.custom ? 'custom' : colorTheme.id;
      root.dataset.editorThemeState = 'ready';
    };
    const syncSystemScheme = () => {
      if (appearance.colorMode === 'system') syncEditorColorScheme();
    };
    syncEditorColorScheme();
    systemScheme.addEventListener('change', syncSystemScheme);
    return () => {
      systemScheme.removeEventListener('change', syncSystemScheme);
    };
  }, [appearance, editorThemes, controller.editorAppearanceReady, startupCache]);
  useEffect(() => {
    if (!controller.editorAppearanceReady || !controller.editorAppearanceVerified || !controller.editorDirectoryId) return;
    cacheSavedEditorTheme(controller.editorDirectoryId, controller.editorWorkspace.appearance, editorThemes);
  }, [controller.editorAppearanceReady, controller.editorAppearanceVerified, controller.editorDirectoryId, controller.editorWorkspace.appearance, editorThemes]);
  const visible = controller.editorAppearanceReady || Boolean(startupCache) || hasLoadedAppearance;
  const loading = !controller.editorAppearanceReady || controller.contentLibrariesState === 'loading' || format.error === '正在载入资料库格式配置…';
  return (
    <EditorContext.Provider value={{ ...controller, editorAppearancePreview, previewEditorAppearance, displayedEditorAppearance: appearance }}>
      <div className={visible ? 'h-full' : 'hidden h-full group-data-[editor-theme-state=cached]/theme:block'} inert={loading} aria-busy={loading}>{children}</div>
      <StartupLoading loading={loading} />
    </EditorContext.Provider>
  );
}

function StartupLoading({ loading }: { loading: boolean }) {
  const [present, setPresent] = useState(true);
  const [fading, setFading] = useState(false);
  useEffect(() => {
    if (loading) { setPresent(true); setFading(false); return; }
    setFading(true);
    const timer = window.setTimeout(() => setPresent(false), 300);
    return () => window.clearTimeout(timer);
  }, [loading]);
  if (!present && !loading) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas text-primary opacity-100 transition-opacity duration-300 ease-out data-[fading=true]:opacity-0 motion-reduce:transition-none" data-fading={!loading && fading} role="status" aria-live="polite" aria-label="正在载入资料库">
    <div className="flex flex-col items-center gap-4 p-4">
      <svg className="size-8 animate-spin text-accent motion-reduce:animate-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle className="opacity-25" cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M12 3a9 9 0 0 1 9 9" /></svg>
      <p className="text-sm text-muted">正在载入资料库与外观…</p>
    </div>
  </div>;
}

export function useEditorControllerContext(): EditorController {
  const controller = useContext(EditorContext);
  if (!controller) throw new Error('useEditorControllerContext must be used inside AppProviders');
  return controller;
}
