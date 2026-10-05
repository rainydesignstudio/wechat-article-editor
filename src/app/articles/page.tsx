'use client';

import { ArticlesPage } from '../../components/articles/ArticlesPage';
import { useEditorControllerContext } from '../../components/global/AppProviders';

export default function ArticlesRoute() {
  const controller = useEditorControllerContext();
  return (
    <ArticlesPage
      articles={controller.articlesForOverview}
      allArticles={controller.articleList}
      themes={controller.themeLibrary}
      currentId={controller.currentArticleId}
      directory={controller.directory}
      directoryName={controller.directoryName}
      rememberedDirectoryName={controller.rememberedDirectoryName}
      directoryRestoreState={controller.directoryRestoreState}
      collection={controller.selectedArticleCollection}
      collectionTitle={controller.articleCollectionTitle}
      workspace={controller.editorWorkspace}
      busy={controller.editorWorkspaceBusy || controller.mediaOperation !== null || controller.historyBusy || controller.articleListWork !== null}
      indexMonths={controller.articleIndexMonths}
      indexIssues={controller.articleIndexIssues}
      checks={controller.articleChecks}
      listNotice={controller.articleListNotice}
      listWork={controller.articleListWork}
      onCheck={controller.checkArticleList}
      onCancelCheck={controller.cancelArticleListCheck}
      onRebuildIndexes={controller.rebuildListIndexes}
      onRemoveCategories={controller.removeListCategories}
      onNew={controller.createNewArticle}
      onRefresh={() => { if (controller.directory) void controller.refreshArticles(); }}
      onOpen={controller.openStoredArticle}
      onInfo={controller.openArticleInfo}
      onArchive={controller.archiveStoredArticle}
      onArchiveMany={controller.archiveStoredArticles}
      onClassifyMany={controller.classifyStoredArticles}
      onFork={controller.beginCopy}
      onDelete={controller.setDeleteTarget}
      onDeleteMany={controller.setDeleteTargets}
      onGoToSettings={() => controller.navigateView('settings')}
      onReopenRememberedDirectory={controller.reopenRememberedDirectory}
    />
  );
}
