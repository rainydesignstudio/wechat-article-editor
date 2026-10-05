'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { ArticleMode, ViewKey } from '../../hooks/useEditorController';
import type { WorkingArticle } from '../../lib/types';

type IconName = 'menu' | 'back' | 'edit' | 'statistics' | 'history' | 'template' | 'export' | 'check' | 'save' | 'copy' | 'refresh';

function Icon({ name }: { name: IconName }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (name === 'menu') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
  if (name === 'back') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="m10 5-7 7 7 7M3 12h18" /></svg>;
  if (name === 'edit') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="m4 20 4.4-.9L19 8.5 15.5 5 4.9 15.6 4 20ZM13.5 7l3.5 3.5" /></svg>;
  if (name === 'statistics') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M4 20h16M6 17v-5h3v5M11 17V7h3v10M16 17v-8h3v8" /></svg>;
  if (name === 'history') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M4 8a9 9 0 1 1-1 5M4 4v4h4M12 7v5l3 2" /></svg>;
  if (name === 'template') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M5 3h9l4 4v4M14 3v4h4M5 3v18h8M8 11h5M8 15h3M18 15v7M14.5 18.5h7" /></svg>;
  if (name === 'export') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4" /></svg>;
  if (name === 'check') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M5 3h14v7M5 3v18h8M8 7h7M8 11h4m2 6 3 3 5-6" /></svg>;
  if (name === 'save') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M4 4h13l3 3v13H4V4Z" /><path d="M8 4v6h8V4M8 20v-6h8v6" /></svg>;
  if (name === 'copy') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.5 9a7 7 0 0 1 12-2L20 12M4 12l2.5 5a7 7 0 0 0 12-2" /></svg>;
}

const VIEW_LABELS: Record<ViewKey, string> = {
  articles: '文章',
  assets: '素材',
  themes: '文章主题',
  template: '模板',
  settings: '设置',
};

type Props = {
  hidden?: boolean;
  view: ViewKey;
  articleMode: ArticleMode;
  currentTitle: string;
  currentProjectName: string | null;
  articleCollectionTitle: string;
  article: WorkingArticle;
  directory: FileSystemDirectoryHandle | null;
  currentArticleIsArchived: boolean;
  metadataWritable: boolean;
  mediaOperation: 'import' | 'rename' | null;
  historyBusy: boolean;
  isReadyToCopy: boolean;
  isCompiling: boolean;
  onToggleArticleSidebar: () => void;
  onShowOverview: () => void;
  onShowStatistics: () => void;
  onCreateTemplate: () => void;
  onExport: () => void;
  onChangeTitle: (value: string) => void;
  onOpenHistory: (event: MouseEvent<HTMLButtonElement>) => void;
  onSave: () => void;
  onCopy: () => void;
  onCompile: () => void;
  onCheckFormat: () => void;
};

export function EditorTopbar({
  hidden = false,
  view,
  articleMode,
  currentTitle,
  currentProjectName,
  articleCollectionTitle,
  article,
  directory,
  currentArticleIsArchived,
  metadataWritable,
  mediaOperation,
  historyBusy,
  isReadyToCopy,
  isCompiling,
  onToggleArticleSidebar,
  onShowOverview,
  onShowStatistics,
  onCreateTemplate,
  onExport,
  onChangeTitle,
  onOpenHistory,
  onSave,
  onCopy,
  onCompile,
  onCheckFormat,
}: Props) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(currentTitle);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const suppressBlurCommitRef = useRef(false);
  const disabled = mediaOperation !== null || historyBusy || currentArticleIsArchived;
  const isEditor = view === 'articles' && articleMode === 'editor';

  useEffect(() => setTitleDraft(currentTitle), [currentTitle]);
  useEffect(() => { if (currentArticleIsArchived) setEditingTitle(false); }, [currentArticleIsArchived]);
  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  const finishTitleEdit = (commit: boolean) => {
    if (commit && titleDraft.trim()) onChangeTitle(titleDraft.trim());
    else setTitleDraft(currentTitle);
    setEditingTitle(false);
  };

  const viewTitle = view === 'articles' ? articleCollectionTitle : VIEW_LABELS[view];

  return (
    <header hidden={hidden} className="workspace-toolbar">
      <div className="toolbar-context">
        {view === 'articles' ? (
          <button className="toolbar-icon-button article-sidebar-toggle" type="button" aria-label="显示文章导航" data-tooltip="文章导航" onClick={onToggleArticleSidebar}>
            <Icon name="menu" /><span className="toolbar-action-copy">文章</span>
          </button>
        ) : null}
        {isEditor ? (
          <div className="title-stack">
            <button className="return-crumb" type="button" onClick={onShowOverview} aria-label={currentArticleIsArchived ? '返回归档文章' : '返回文章总览'} data-tooltip="返回">
              <span className="return-crumb-icon" aria-hidden="true"><Icon name="back" /></span><span>文章</span>{currentArticleIsArchived ? <><span className="crumb-separator">/</span><span>归档</span></> : null}{currentProjectName ? <><span className="crumb-separator">/</span><span className="crumb-project">{currentProjectName}</span></> : null}
            </button>
            {currentArticleIsArchived ? (
              <div className="flex min-w-0 items-center gap-2"><h1 className="font-heading truncate text-base font-semibold text-primary">{currentTitle}</h1><span className="shrink-0 rounded-md border border-line bg-rail px-2 py-0.5 text-xs font-semibold text-faint">只读</span></div>
            ) : editingTitle ? (
              <input
                ref={titleInputRef}
                className="title-edit-input font-heading"
                aria-label="编辑文章标题"
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={() => {
                  if (suppressBlurCommitRef.current) { suppressBlurCommitRef.current = false; return; }
                  finishTitleEdit(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') { event.preventDefault(); finishTitleEdit(true); }
                  if (event.key === 'Escape') { event.preventDefault(); suppressBlurCommitRef.current = true; finishTitleEdit(false); }
                }}
              />
            ) : (
              <button className="title-trigger font-heading" type="button" onClick={() => setEditingTitle(true)} data-tooltip="修改标题" disabled={!directory || currentArticleIsArchived || !metadataWritable}>
                <span>{currentTitle}</span><span className="title-edit-icon" aria-hidden="true"><Icon name="edit" /></span>
              </button>
            )}
          </div>
        ) : (
          <div className="toolbar-title">
            <p className="eyebrow">{view === 'articles' ? 'RAINY WORKSPACE' : 'WORKSPACE'}</p>
            <h1 className="font-heading toolbar-heading">{viewTitle}</h1>
          </div>
        )}
      </div>

      <div className="toolbar-actions">
        {isEditor ? (
          <>
            <button className="toolbar-icon-button" type="button" aria-label="文章统计" data-tooltip="文章统计" onClick={onShowStatistics}><Icon name="statistics" /><span className="toolbar-action-copy">文章统计</span></button>
            <button className="toolbar-icon-button" type="button" aria-label="历史版本" data-tooltip="历史版本" data-history-trigger="true" disabled={disabled || !directory || !article.folder} onClick={onOpenHistory}><Icon name="history" /><span className="toolbar-action-copy">历史</span></button>
            <button className="toolbar-icon-button" type="button" aria-label="从当前文章创建起稿模板" data-tooltip="创建起稿模板" disabled={!directory || mediaOperation !== null || historyBusy} onClick={onCreateTemplate}><Icon name="template" /><span className="toolbar-action-copy">创建模板</span></button>
            <button className="toolbar-icon-button" type="button" aria-label="导出文章" data-tooltip="导出文章" disabled={!directory || mediaOperation !== null || historyBusy} onClick={onExport}><Icon name="export" /><span className="toolbar-action-copy">导出</span></button>
            <span className="toolbar-divider" aria-hidden="true" />
            <button className="toolbar-icon-button" type="button" aria-label="更新样式" data-tooltip={isCompiling ? '正在生成样式' : '更新样式'} disabled={disabled || isCompiling || !directory} onClick={onCompile}><Icon name="refresh" /><span className="toolbar-action-copy">{isCompiling ? '生成中' : '更新样式'}</span></button>
            <button className="toolbar-icon-button" type="button" aria-label="格式检查" data-tooltip="格式检查" disabled={!directory || mediaOperation !== null || historyBusy || isCompiling || !article.themeValid} onClick={onCheckFormat}><Icon name="check" /><span className="toolbar-action-copy">格式检查</span></button>
            <button className="toolbar-icon-button toolbar-icon-button--primary" type="button" aria-label="保存文章" data-tooltip="保存文章" disabled={!article.dirty || !directory || disabled} onClick={onSave}><Icon name="save" /><span className="toolbar-action-copy">保存</span></button>
            <button className="toolbar-icon-button" type="button" aria-label="复制富文本" data-tooltip="复制富文本" disabled={!isReadyToCopy || isCompiling || disabled} onClick={onCopy}><Icon name="copy" /><span className="toolbar-action-copy">复制</span></button>
          </>
        ) : null}
      </div>
    </header>
  );
}
