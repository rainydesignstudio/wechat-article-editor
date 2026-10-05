'use client';

import { CopyDialog, DeleteDialog } from '../articles/ArticleDialogs';
import { ProjectDeleteDialog } from '../articles/ProjectDeleteDialog';
import { ArticleInfoDialog } from '../editor/ArticleInfoDialog';
import { ThemeDialog } from '../themes/ThemeDialog';
import { TemplateDialog } from '../content/TemplateDialog';
import { UnsavedDialog } from '../editor/UnsavedDialog';
import { MediaAssetDialog } from '../media/MediaLibrary';
import { MediaPickerDialog } from '../media/MediaPickerDialog';
import { useEditorControllerContext } from './AppProviders';
import { resolveDefaultArticleTheme, THEMES } from '../../lib/themes';
import { getArticleOrganization } from '../../lib/editorWorkspace';
import { FormatCheckDialog } from './FormatCheckDialog';
import { CreateLibraryDialog } from '../settings/CreateLibraryDialog';

export function AppDialogs() {
  const controller = useEditorControllerContext();
  const {
    article,
    articleInfoDialogOpen,
    articleList,
    copyMonth,
    copySourceOverride,
    copyTarget,
    copyOpenerRef,
    copyThemeTarget,
    copyTitle,
    deleteTargets,
    formatCheck,
    resolveFormatCheck,
    directory,
    documentTokenRef,
    editorWorkspace,
    editorWorkspaceBusy,
    historyBusy,
    historyOpenerRef,
    mediaOperation,
    mediaOperationRef,
    mediaTarget,
    mutationQueueRef,
    pendingActionLabel,
    projectDeleteTarget,
    setArticleInfoDialogOpen,
    setCopyMonth,
    setCopySourceOverride,
    setCopyFromThemeLibrary,
    setCopyTarget,
    setCopyThemeTarget,
    setCopyTitle,
    setDeleteTargets,
    setMediaTarget,
    setProjectDeleteTarget,
    showTemplateDialog,
    showUnsavedDialog,
    themeLibrary,
    resolvePendingAction,
    cancelPendingAction,
    confirmCopy,
    confirmDelete,
    confirmDeleteProject,
    createArticleFromTemplate,
    closeTemplateDialog,
    changeTheme,
    renameMediaImage,
  } = controller;

  const currentStored = directory ? articleList.find((item) => item.id === controller.currentArticleId) ?? null : null;
  const articleThemes = directory && themeLibrary.length ? themeLibrary : THEMES;
  const defaultArticleTheme = resolveDefaultArticleTheme(articleThemes, controller.articleSettings.defaultArticleThemeId);
  // A pending draft decision takes focus first; only one top-level dialog may own the focus trap.
  const activeDialog = formatCheck ? 'format'
    : showUnsavedDialog ? 'unsaved'
    : controller.createLibraryDialogOpen ? 'create-library'
    : controller.mediaPickerRequest && controller.view === 'articles' && controller.articleMode === 'editor' ? 'media-picker'
    : mediaTarget ? 'media'
    : articleInfoDialogOpen ? 'info'
    : projectDeleteTarget ? 'project-delete'
    : deleteTargets.length ? 'delete'
    : copyTarget ? 'copy'
    : controller.showThemeDialog ? 'theme'
    : showTemplateDialog ? 'template'
    : null;

  return (
    <>
      {activeDialog === 'media-picker' && controller.mediaPickerRequest ? <MediaPickerDialog
        key={controller.mediaPickerRequest.id}
        root={controller.mediaPickerRequest.root}
        sessionKey={controller.mediaPickerRequest.sessionKey}
        refreshSignal={controller.mediaRefreshRevision}
        articles={controller.articleList}
        articleId={controller.mediaPickerRequest.articleId}
        articleTitle={controller.currentTitle}
        initialAsset={controller.mediaPickerRequest.initialAsset}
        isCurrent={() => controller.directoryRef.current === controller.mediaPickerRequest?.root && controller.contentLibraryRootSessionRef.current === controller.mediaPickerRequest?.sessionKey}
        busy={mediaOperation !== null || historyBusy}
        onImport={controller.importSharedFiles}
        onAdopt={controller.adoptLibraryImage}
        onManage={controller.manageLibraryMedia}
        currentReferenceCount={controller.currentMediaReferenceCount}
        scanReferences={controller.scanLibraryMediaReferences}
        onClose={controller.closeMediaPicker}
      /> : null}
      {activeDialog === 'template' ? <TemplateDialog templates={controller.templates} categories={controller.templateCategories} themes={articleThemes} defaultTheme={defaultArticleTheme} onClose={closeTemplateDialog} onCreate={createArticleFromTemplate} /> : null}
      {activeDialog === 'theme' ? <ThemeDialog
        key={`${controller.contentLibraryRootSession}:${controller.currentArticleId}`}
        current={article.theme}
        themes={directory ? themeLibrary : THEMES}
        source={controller.parsed.body}
        media={controller.articleMediaContext}
        busy={mediaOperation !== null || historyBusy || editorWorkspaceBusy}
        blockedReason={controller.currentArticleIsArchived ? '归档文章只读，取消归档后可以采用主题。' : controller.parsed.diagnostics.some(item => item.level === 'error') ? '请先修复文章元数据，再采用主题。' : !article.themeValid && article.folder ? '请先修复当前文章主题快照。' : ''}
        issue={controller.status.tone === 'error' ? controller.status.label : ''}
        onClose={() => controller.setShowThemeDialog(false)}
        onSelect={changeTheme}
      /> : null}
      {activeDialog === 'unsaved' ? <UnsavedDialog label={pendingActionLabel} onCancel={cancelPendingAction} onSave={() => resolvePendingAction(false)} onDiscard={() => void resolvePendingAction(true)} /> : null}
      {activeDialog === 'create-library' ? <CreateLibraryDialog onCreate={controller.createDataDirectory} onClose={() => controller.setCreateLibraryDialogOpen(false)} /> : null}
      {activeDialog === 'copy' && copyTarget ? <CopyDialog
        article={copyTarget}
        title={copyTitle}
        month={copyMonth}
        months={Array.from(new Set(articleList.map((item) => item.month))).sort().reverse()}
        applyTheme={copyThemeTarget}
        usesCurrentDraft={copySourceOverride !== null}
        fromThemeLibrary={controller.copyFromThemeLibrary}
        onChangeTitle={setCopyTitle}
        onChangeMonth={setCopyMonth}
        onClose={() => {
          const opener = copyOpenerRef.current;
          copyOpenerRef.current = null;
          setCopyTarget(null);
          setCopyThemeTarget(null);
          setCopySourceOverride(null);
          setCopyFromThemeLibrary(false);
          requestAnimationFrame(() => { if (opener?.isConnected) opener.focus(); });
        }}
        onConfirm={confirmCopy}
      /> : null}
      {activeDialog === 'delete' && deleteTargets.length ? <DeleteDialog articles={deleteTargets} archived={getArticleOrganization(editorWorkspace, deleteTargets[0].id).archived} onClose={() => setDeleteTargets([])} onConfirm={confirmDelete} /> : null}
      {activeDialog === 'project-delete' && projectDeleteTarget ? <ProjectDeleteDialog
        name={projectDeleteTarget.name}
        busy={editorWorkspaceBusy}
        onClose={() => setProjectDeleteTarget(null)}
        onConfirm={() => void confirmDeleteProject()}
      /> : null}
      {activeDialog === 'info' ? <ArticleInfoDialog
        article={article}
        parsed={controller.parsed}
        stored={currentStored}
        workspace={editorWorkspace}
        archived={controller.currentArticleIsArchived}
        busy={mediaOperation !== null || historyBusy || editorWorkspaceBusy}
        onClose={() => setArticleInfoDialogOpen(false)}
        onChangeField={controller.changeField}
        onOpenTheme={() => { setArticleInfoDialogOpen(false); controller.setShowThemeDialog(true); }}
        onChangeProject={(projectId) => { if (currentStored) void controller.setStoredArticleProject(currentStored, projectId); }}
        onOpenHistory={() => {
          setArticleInfoDialogOpen(false);
          historyOpenerRef.current = document.querySelector<HTMLButtonElement>('[data-history-trigger="true"]');
          void controller.openArticleHistory();
        }}
        onSave={() => void controller.saveCurrent()}
        onDelete={() => {
          if (currentStored) setDeleteTargets([currentStored]);
          setArticleInfoDialogOpen(false);
        }}
        onUnarchive={() => {
          if (currentStored) controller.archiveStoredArticle(currentStored, false);
          setArticleInfoDialogOpen(false);
        }}
      /> : null}
      {activeDialog === 'media' && mediaTarget ? <MediaAssetDialog
        key={`${mediaTarget.articleId}:${mediaTarget.fileName}`}
        asset={mediaTarget}
        canRename={directory === mediaTarget.root && documentTokenRef.current?.root === mediaTarget.root && (controller.getCurrentArticleId() === mediaTarget.articleId || !controller.articleRef.current.dirty) && !mutationQueueRef.current.isDeleting(mediaTarget.root, mediaTarget.articleId)}
        renameBlockedReason={directory !== mediaTarget.root ? '请先选择这张图片所属的资料目录。' : documentTokenRef.current?.root !== mediaTarget.root ? '当前稿件来自另一个资料目录；重新打开该目录中的稿件后才能改名。' : controller.articleRef.current.dirty && controller.getCurrentArticleId() !== mediaTarget.articleId ? '当前稿件有未保存改动；先保存或处理后，再改其他文章的图片。' : mutationQueueRef.current.isDeleting(mediaTarget.root, mediaTarget.articleId) ? '所属文章正在删除；请刷新素材列表后重试。' : undefined}
        busy={mediaOperation !== null}
        sessionKey={controller.contentLibraryRootSession}
        isCurrent={() => directory === mediaTarget.root && controller.contentLibraryRootSessionRef.current === controller.contentLibraryRootSession}
        onClose={() => setMediaTarget(null)}
        onRename={renameMediaImage}
      /> : null}
      {activeDialog === 'format' && formatCheck ? <FormatCheckDialog mode={formatCheck.mode} report={formatCheck.report} onDecision={resolveFormatCheck} /> : null}
    </>
  );
}
