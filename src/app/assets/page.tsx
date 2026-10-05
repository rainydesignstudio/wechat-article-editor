'use client';

import { MediaLibrary } from '../../components/media/MediaLibrary';
import { useEditorControllerContext } from '../../components/global/AppProviders';

export default function AssetsRoute() {
  const controller = useEditorControllerContext();
  return (
    <MediaLibrary
      key={controller.contentLibraryRootSession}
      root={controller.directory}
      sessionKey={controller.contentLibraryRootSession}
      refreshSignal={controller.mediaRefreshRevision}
      articles={controller.articleList}
      isRootCurrent={(expectedRoot, expectedSession) => controller.directoryRef.current === expectedRoot && controller.contentLibraryRootSessionRef.current === expectedSession}
      workspace={controller.editorWorkspace}
      onManage={controller.manageLibraryMedia}
      currentReferenceCount={controller.currentMediaReferenceCount}
      scanReferences={controller.scanLibraryMediaReferences}
      onImport={controller.importSharedFiles}
      onAdopt={controller.openMediaPicker}
      currentArticleId={controller.currentArticleId}
      currentArticleTitle={controller.currentTitle}
      canAdopt={Boolean(controller.article.source.trim() && controller.parsed.canCopy && controller.article.themeValid && !controller.currentArticleIsArchived)}
      busy={controller.mediaOperation !== null || controller.historyBusy}
    />
  );
}
