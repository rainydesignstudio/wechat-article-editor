'use client';

import type { MutableRefObject } from 'react';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { ColumnSplitter } from '../global/ColumnSplitter';
import { parseArticle } from '../../lib/frontMatter';
import type { ArticleSnippet, SnippetCategory, WorkingArticle } from '../../lib/types';

import type { ArticleMediaContext } from './MarkdownPreview';
import type { Tone } from '../../hooks/useEditorController';
import { PreviewPanel } from './PreviewPanel';
import { SourcePanel } from './SourcePanel';

export type EditorWorkspaceProps = {
  article: WorkingArticle;
  themeUpdateAvailable: boolean;
  parsed: ReturnType<typeof parseArticle>;
  compiledCss: string;
  revision: number;
  mediaRevision?: number;
  status: { label: string; tone: Tone };
  mobilePane: 'source' | 'preview';
  directory: FileSystemDirectoryHandle | null;
  snippets: ArticleSnippet[];
  snippetCategories: SnippetCategory[];
  previewRef: MutableRefObject<HTMLElement | null>;
  attachPreview: (element: HTMLElement | null) => void;
  clipboardReceiverRef: MutableRefObject<HTMLDivElement | null>;
  sourceTextareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  onChangeBody: (value: string) => void;
  onSnippetInserted: () => void;
  onOpenInfo: () => void;
  onOpenMediaPicker: () => void;
  onOpenTheme: () => void;
  onPaste: () => Promise<void>;
  onImportFiles: (files: File[], selection: { start: number; end: number }) => void | Promise<void>;
  onPasteConflict: () => void;
  onSetMobilePane: (pane: 'source' | 'preview') => void;
  media: ArticleMediaContext | null;
  mediaBusy: boolean;
  readOnly: boolean;
};

export function EditorWorkspace({
  article,
  themeUpdateAvailable,
  parsed,
  compiledCss,
  revision,
  mediaRevision = 0,
  status,
  mobilePane,
  directory,
  snippets,
  snippetCategories,
  previewRef,
  attachPreview,
  clipboardReceiverRef,
  sourceTextareaRef,
  onChangeBody,
  onSnippetInserted,
  onOpenInfo,
  onOpenMediaPicker,
  onOpenTheme,
  onPaste,
  onImportFiles,
  onPasteConflict,
  onSetMobilePane,
  media,
  mediaBusy,
  readOnly,
}: EditorWorkspaceProps) {
  const layout = useResizableColumns();
  const { containerRef: gridRef, wideEnough, dragging, style: splitStyle } = layout;
  const diagnosticErrors = parsed.diagnostics.filter((item) => item.level === 'error');

  return (
    <div className="editor-workspace" data-wide={wideEnough} data-read-only={readOnly}>
      {!readOnly && (!wideEnough || diagnosticErrors.length > 0) ? <div className="editor-workspace-toolbar">
        <div className="preview-toggle" role="group" aria-label="窄屏编辑与预览切换">
          <button type="button" aria-pressed={mobilePane === 'source'} data-active={mobilePane === 'source'} onClick={() => onSetMobilePane('source')} disabled={mediaBusy}>正文</button>
          <button type="button" aria-pressed={mobilePane === 'preview'} data-active={mobilePane === 'preview'} onClick={() => onSetMobilePane('preview')} disabled={mediaBusy}>预览</button>
        </div>
        {diagnosticErrors.length ? <p className="editor-diagnostic-summary" role="alert">元数据有误 · 正文编辑已暂停</p> : null}
      </div> : null}
      <div ref={gridRef} className={readOnly && !wideEnough ? 'editor-grid grid-rows-2' : 'editor-grid'} data-wide={wideEnough} data-dragging={dragging} style={splitStyle}>
        <div className="editor-source-pane" data-mobile-hidden={!readOnly && mobilePane === 'preview'}>
          <SourcePanel
            article={article}
            parsed={parsed}
            revision={revision}
            mediaRevision={mediaRevision}
            status={status}
            mobilePane={mobilePane}
            directory={directory}
            snippets={snippets}
            snippetCategories={snippetCategories}
            sourceTextareaRef={sourceTextareaRef}
            onChangeBody={onChangeBody}
            onSnippetInserted={onSnippetInserted}
            onImportFiles={onImportFiles}
            onPasteConflict={onPasteConflict}
            onOpenInfo={onOpenInfo}
            onOpenMediaPicker={onOpenMediaPicker}
            mediaBusy={mediaBusy}
            readOnly={readOnly}
          />
        </div>
        <ColumnSplitter layout={layout} label="调整正文与预览宽度" />
        <div className="editor-preview-pane" data-mobile-hidden={!readOnly && mobilePane === 'source'}>
          <PreviewPanel
            onOpenTheme={onOpenTheme}
            article={article}
            themeUpdateAvailable={themeUpdateAvailable}
            parsed={parsed}
            compiledCss={compiledCss}
            mobilePane={mobilePane}
            previewRef={previewRef}
            attachPreview={attachPreview}
            clipboardReceiverRef={clipboardReceiverRef}
            media={media}
            onPaste={onPaste}
            mediaBusy={mediaBusy}
            readOnly={readOnly}
          />
        </div>
      </div>
      {parsed.diagnostics.length ? <section className="diagnostic-stack editor-diagnostics" aria-label="文章诊断">{parsed.diagnostics.map((diagnostic, index) => <p key={`${diagnostic.message}-${index}`} className="diagnostic" data-level={diagnostic.level}>{diagnostic.message}</p>)}</section> : null}
    </div>
  );
}
