'use client';

import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { useEditorControllerContext } from './AppProviders';
import { AppDialogs } from './AppDialogs';
import { ChangelogDialog } from './ChangelogDialog';
import { EditorTopbar } from './EditorTopbar';
import { MainSidebar } from './MainSidebar';
import { ArticleSidebar } from '../articles/ArticleSidebar';
import { ArticleHistoryView } from '../history/ArticleHistoryDialog';
import { ArticleStatisticsDialog } from '../editor/ArticleStatisticsDialog';
import { articleStatisticsFromHtml } from '../../lib/articleStatistics';
import { CreateTemplateFromArticleDialog } from '../content/CreateTemplateFromArticleDialog';
import { ArticleExportDialog } from '../editor/ArticleExportDialog';
import { getFormatSnapshot } from '../../lib/article-format/runtime';
import { useFormatSnapshot } from '../../hooks/useFormatSnapshot';
import { parseArticle } from '../../lib/frontMatter';

export function AppShell({ children }: { children: ReactNode }) {
  const format = useFormatSnapshot();
  const controller = useEditorControllerContext();
  const historyArticle = controller.article;
  const historyRoot = controller.directory;
  const historyViewOpen = Boolean(
    controller.historyDialogOpen && controller.view === 'articles' && controller.articleMode === 'editor'
    && historyRoot && historyArticle.month && historyArticle.folder,
  );
  const [mainCollapsed, setMainCollapsed] = useState(false);
  const [articleSidebarCollapsed, setArticleSidebarCollapsed] = useState(false);
  const [articleSidebarMobileOpen, setArticleSidebarMobileOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [statisticsOpen, setStatisticsOpen] = useState(false);
  const [templateSnapshot, setTemplateSnapshot] = useState<{ source: string; dirty: boolean; root: FileSystemDirectoryHandle; sessionKey: number; formatId: string } | null>(null);
  const [exportSnapshot, setExportSnapshot] = useState<{ source: string; body: string; title: string; dirty: boolean; root: FileSystemDirectoryHandle; month: string | null; folder: string | null; themeId: string; themeVersion: string; sessionKey: number; formatId: string } | null>(null);

  useEffect(() => {
    if (controller.view !== 'articles' || controller.articleMode !== 'editor') controller.setHistoryDialogOpen(false);
  }, [controller.articleMode, controller.setHistoryDialogOpen, controller.view]);

  const toggleArticleSidebar = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(width < 48rem)').matches) {
      setArticleSidebarMobileOpen((open) => !open);
      return;
    }
    setArticleSidebarCollapsed((collapsed) => !collapsed);
  };

  const openHistory = (event: MouseEvent<HTMLButtonElement>) => {
    controller.historyOpenerRef.current = event.currentTarget;
    void controller.openArticleHistory();
  };

  const closeHistoryView = () => {
    controller.setHistoryDialogOpen(false);
    window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-history-trigger="true"]')?.focus());
  };

  return (
    <main className="app-shell">
      <div className="shell-frame">
        <MainSidebar
          view={controller.view}
          mediaOperation={controller.mediaOperation}
          collapsed={mainCollapsed}
          colorMode={controller.displayedEditorAppearance.colorMode}
          onNavigate={controller.navigateView}
          onToggleCollapsed={() => setMainCollapsed((collapsed) => !collapsed)}
          onSetColorMode={controller.setEditorColorMode}
          onOpenChangelog={() => setChangelogOpen(true)}
        />
        {controller.view === 'articles' && !historyViewOpen ? (
          <ArticleSidebar
            collapsed={articleSidebarCollapsed}
            mobileOpen={articleSidebarMobileOpen}
            onToggleCollapsed={() => setArticleSidebarCollapsed((collapsed) => !collapsed)}
            onCloseMobile={() => setArticleSidebarMobileOpen(false)}
          />
        ) : null}
        <section className="workspace">
          <EditorTopbar
            hidden={historyViewOpen}
            view={controller.view}
            articleMode={controller.articleMode}
            currentTitle={controller.currentTitle}
            currentProjectName={controller.currentProjectName}
            articleCollectionTitle={controller.articleCollectionTitle}
            article={controller.article}
            directory={controller.directory}
            currentArticleIsArchived={controller.currentArticleIsArchived}
            metadataWritable={controller.parseErrors.length === 0}
            mediaOperation={controller.mediaOperation}
            historyBusy={controller.historyBusy}
            isReadyToCopy={controller.isReadyToCopy}
            isCompiling={controller.isCompiling}
            onToggleArticleSidebar={toggleArticleSidebar}
            onShowOverview={() => controller.navigateArticleMode('overview')}
            onShowStatistics={() => setStatisticsOpen(true)}
            onCreateTemplate={() => { if (controller.directory) setTemplateSnapshot({ source: controller.article.source, dirty: controller.article.dirty, root: controller.directory, sessionKey: controller.contentLibraryRootSession, formatId: getFormatSnapshot().id }); }}
            onExport={() => { if (controller.directory) setExportSnapshot({ source: controller.article.source, body: controller.parsed.body, title: controller.currentTitle, dirty: controller.article.dirty, root: controller.directory, month: controller.article.month, folder: controller.article.folder, themeId: controller.article.theme.id, themeVersion: controller.article.theme.version, sessionKey: controller.contentLibraryRootSession, formatId: getFormatSnapshot().id }); }}
            onChangeTitle={(value) => controller.changeField('title', value)}
            onOpenHistory={openHistory}
            onSave={() => void controller.saveCurrent()}
            onCopy={() => void controller.copyRichText()}
            onCompile={() => void controller.compileCurrent()}
            onCheckFormat={() => void controller.checkCurrentFormat()}
          />
          {format.library && format.error !== '正在载入资料库格式配置…' && (format.error || format.source === 'built-in') ? <p className="shrink-0 border-b border-warning-line bg-warning-surface px-4 py-2 text-xs text-warning-strong" role={format.error ? 'alert' : 'status'}>{format.error ?? '当前资料库未提供格式三件套，正在使用内置默认整套配置。'}{format.error && format.error !== '正在载入资料库格式配置…' ? ' 请按 FORMAT.md 修复三件套，再重新打开当前资料库。' : ''}</p> : null}
          <div className="workspace-main" hidden={historyViewOpen}>{children}</div>
          {historyViewOpen && historyRoot && historyArticle.month && historyArticle.folder ? (
            <ArticleHistoryView
              articleTitle={controller.currentTitle}
              currentSource={historyArticle.source}
              currentTheme={historyArticle.theme}
              currentThemeValid={historyArticle.themeValid}
              currentDirty={historyArticle.dirty}
              month={historyArticle.month}
              folder={historyArticle.folder}
              root={historyRoot}
              mediaArticle={{ id: controller.currentArticleId, month: historyArticle.month, folder: historyArticle.folder }}
              snapshots={controller.historySnapshots}
              issues={controller.historyIssues}
              selectedId={controller.historySelectedId}
              busy={controller.historyBusy}
              canRestore={!controller.currentArticleIsArchived && historyArticle.themeValid && controller.documentTokenRef.current?.root === historyRoot && !controller.mediaOperationRef.current}
              canSaveAs={Boolean(controller.articleList.find((item) => item.id === controller.currentArticleId && controller.article.themeValid && !item.parse.diagnostics.some((diagnostic) => diagnostic.level === 'error')))}
              refreshPending={controller.historyRefreshPending}
              notice={controller.historyNotice}
              months={controller.articleList.map((item) => item.month)}
              onClose={closeHistoryView}
              getReturnFocus={() => controller.historyOpenerRef.current}
              onSelect={controller.setHistorySelectedId}
              onManualSnapshot={() => void controller.createManualHistorySnapshot()}
              onRestore={(target) => void controller.restoreHistorySnapshot(target)}
              onSaveAs={(target, title, month) => void controller.saveHistoryAsArticle(target, title, month)}
              onToggleRetention={(target, retained) => void controller.toggleHistoryRetention(target, retained)}
              onRefreshHistory={() => void controller.refreshArticleHistory()}
            />
          ) : null}
        </section>
      </div>
      <AppDialogs />
      {statisticsOpen ? <ArticleStatisticsDialog title={controller.currentTitle} dirty={controller.article.dirty} statistics={controller.parsed.canCopy && controller.article.themeValid && controller.previewRef.current?.querySelector('.article-body') ? articleStatisticsFromHtml(controller.previewRef.current.querySelector('.article-body')!.innerHTML) : null} issue={!controller.parsed.canCopy || !controller.article.themeValid ? '请先修复元数据或主题快照，再查看正文统计。' : undefined} onClose={() => setStatisticsOpen(false)} /> : null}
      {templateSnapshot ? <CreateTemplateFromArticleDialog source={templateSnapshot.source} dirty={templateSnapshot.dirty} root={templateSnapshot.root} categories={controller.templateCategories} templates={controller.templates} isCurrent={() => controller.directoryRef.current === templateSnapshot.root && controller.contentLibraryRootSessionRef.current === templateSnapshot.sessionKey} onCreated={(template, formatIssueCount, hasLocalMedia) => {
        if (controller.directoryRef.current === templateSnapshot.root && controller.contentLibraryRootSessionRef.current === templateSnapshot.sessionKey) {
          controller.setTemplates(previous => [...previous.filter(item => item.id !== template.id), template].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')));
          controller.setStatus({ label: `起稿模板已创建：${template.name}${formatIssueCount ? ` · 格式检查提示 ${formatIssueCount} 项` : ''}${hasLocalMedia ? ' · 本地媒体文件未随模板保存' : ''}`, tone: formatIssueCount || hasLocalMedia ? 'warning' : 'success' });
        }
        setTemplateSnapshot(null);
      }} onClose={() => setTemplateSnapshot(null)} /> : null}
      {exportSnapshot ? <ArticleExportDialog source={exportSnapshot.source} title={exportSnapshot.title} dirty={exportSnapshot.dirty} root={exportSnapshot.root} month={exportSnapshot.month} folder={exportSnapshot.folder} visualAvailable={controller.parsed.canCopy && controller.article.themeValid} previewRef={controller.previewRef} isCurrent={() => {
        const current = controller.articleRef.current;
        return getFormatSnapshot().id === exportSnapshot.formatId && controller.directoryRef.current === exportSnapshot.root && controller.contentLibraryRootSessionRef.current === exportSnapshot.sessionKey
          && current.month === exportSnapshot.month && current.folder === exportSnapshot.folder
          && current.theme.id === exportSnapshot.themeId && current.theme.version === exportSnapshot.themeVersion
          && parseArticle(current.source).body === exportSnapshot.body;
      }} prepareVisual={controller.prepareVisualExport} onExported={(fileName, mediaFiles) => controller.setStatus({ label: `已导出 ${fileName}${mediaFiles === undefined ? '' : ` · 包含 ${mediaFiles} 个媒体文件`}`, tone: 'success' })} onClose={() => setExportSnapshot(null)} /> : null}
      {changelogOpen ? <ChangelogDialog onClose={() => setChangelogOpen(false)} /> : null}
    </main>
  );
}
