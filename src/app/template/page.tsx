'use client';

import { ContentLibrary } from '../../components/content/ContentLibrary';
import { useEditorControllerContext } from '../../components/global/AppProviders';
import { resolveDefaultArticleTheme, THEMES } from '../../lib/themes';

export default function TemplateRoute() {
  const controller = useEditorControllerContext();
  const themes = controller.directory && controller.themeLibrary.length ? controller.themeLibrary : THEMES;
  const defaultTheme = resolveDefaultArticleTheme(themes, controller.articleSettings.defaultArticleThemeId);
  return (
    <ContentLibrary
      key={controller.contentLibraryRootSession}
      root={controller.directory}
      librariesState={controller.contentLibrariesState}
      sessionKey={controller.contentLibraryRootSession}
      themes={themes}
      defaultTheme={defaultTheme}
      snippets={controller.snippets}
      snippetCategories={controller.snippetCategories}
      templates={controller.templates}
      templateCategories={controller.templateCategories}
      snippetIssues={controller.snippetIssues}
      templateIssues={controller.templateIssues}
      registerNavigationGuard={controller.registerNavigationGuard}
      isRootCurrent={(expectedRoot, expectedSessionKey) => controller.directoryRef.current === expectedRoot && controller.contentLibraryRootSessionRef.current === expectedSessionKey}
      onSnippetsChange={(expectedRoot, expectedSessionKey, snippets, issues, categories) => {
        if (controller.directoryRef.current !== expectedRoot || controller.contentLibraryRootSessionRef.current !== expectedSessionKey) return;
        controller.setSnippets(snippets);
        controller.setSnippetIssues(issues);
        if (categories) controller.setSnippetCategories(categories);
      }}
      onTemplatesChange={(expectedRoot, expectedSessionKey, templates, issues, categories) => {
        if (controller.directoryRef.current !== expectedRoot || controller.contentLibraryRootSessionRef.current !== expectedSessionKey) return;
        controller.setTemplates(templates);
        controller.setTemplateIssues(issues);
        if (categories) controller.setTemplateCategories(categories);
      }}
    />
  );
}
