'use client';

import { SettingsPanel } from '../../components/settings/SettingsPanel';
import { useEditorControllerContext } from '../../components/global/AppProviders';

export default function SettingsRoute() {
  const controller = useEditorControllerContext();
  return (
    <SettingsPanel
      key={controller.contentLibraryRootSession}
      root={controller.directory}
      directoryName={controller.directoryName}
      rememberedDirectoryName={controller.rememberedDirectoryName}
      directoryRestoreState={controller.directoryRestoreState}
      directoryBookmarkIssue={controller.directoryBookmarkIssue}
      directoryStatus={controller.status}
      fileSystemReady={controller.fileSystemReady}
      settings={controller.articleSettings}
      issue={controller.settingsIssue}
      notice={controller.settingsNotice}
      busy={controller.settingsBusy}
      workspace={controller.editorWorkspace}
      workspaceIssue={controller.editorWorkspaceIssue}
      workspaceBusy={controller.editorWorkspaceBusy}
      editorThemes={controller.editorThemes}
      editorThemeIssues={controller.editorThemeIssues}
      onSave={(next) => void controller.saveSettings(next)}
      onAuthorizeDirectory={controller.authorizeDirectory}
      onCreateDirectory={controller.requestCreateDataDirectory}
      onReopenRememberedDirectory={controller.reopenRememberedDirectory}
      onSaveAppearance={controller.saveEditorAppearance}
      onCreateEditorTheme={controller.createEditorTheme}
      onLoadDefaultEditorThemes={controller.loadDefaultEditorThemes}
      onDeleteEditorTheme={controller.removeEditorTheme}
      onPreviewAppearance={controller.previewEditorAppearance}
      registerNavigationGuard={controller.registerNavigationGuard}
    />
  );
}
