'use client';

import { ThemeLibrary } from '../../components/themes/ThemeLibrary';
import { useEditorControllerContext } from '../../components/global/AppProviders';

export default function ThemesRoute() {
  const controller = useEditorControllerContext();
  const { directory } = controller;

  return (
    <ThemeLibrary
      root={directory}
      themes={controller.themeLibrary}
      editorThemes={controller.editorThemes}
      issues={controller.themeIssues}
      currentTheme={controller.article.theme}
      defaultThemeId={controller.articleSettings.defaultArticleThemeId}
      currentArticleSaved={Boolean(controller.article.folder)}
      canApply={Boolean(directory) && (!controller.article.folder || controller.documentTokenRef.current?.root === directory)}
      isRootCurrent={(expectedRoot) => controller.directoryRef.current === expectedRoot}
      onLibraryChange={(expectedRoot, nextThemes, nextIssues) => {
        if (controller.directoryRef.current !== expectedRoot) return;
        controller.setThemeLibrary(nextThemes);
        controller.setThemeIssues(nextIssues);
      }}
      onApply={controller.applyThemeFromLibrary}
      onSetDefault={controller.setDefaultArticleTheme}
    />
  );
}
