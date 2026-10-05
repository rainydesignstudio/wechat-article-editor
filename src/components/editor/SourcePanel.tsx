'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type MutableRefObject } from 'react';
import type { ArticleSnippet, SnippetCategory, WorkingArticle } from '../../lib/types';
import type { ArticleFormatIssue } from '../../lib/articleFormat';
import { validateArticleAuthoringMarkdown } from '../../lib/articleAuthoringFormat';
import { groupSourceLineIssues, logicalSourceLines } from '../../lib/sourceLineDiagnostics';
import type { Tone } from '../../hooks/useEditorController';
import { inspectLocalArticleImages } from '../../lib/mediaManagement';
import { useAuthoringChecks } from '../../hooks/useMediaPreferences';
import { useSourceLineNumbers } from '../../hooks/useSourceLineNumbers';
import { SnippetTextarea } from '../content/SnippetTextarea';
import { InsertElementsMenu } from './InsertElementsMenu';
import { IconButton } from '../global/IconButton';
import { FindIcon } from '../content/SourceFindBar';
import { useFormatSnapshot } from '../../hooks/useFormatSnapshot';
import { InformationButton, InformationIcon } from '../global/InformationButton';
import type { parseArticle } from '../../lib/frontMatter';

type Props = {
  article: WorkingArticle;
  parsed: ReturnType<typeof parseArticle>;
  revision: number;
  mediaRevision?: number;
  status: { label: string; tone: Tone; formatRevision?: number };
  mobilePane: 'source' | 'preview';
  directory: FileSystemDirectoryHandle | null;
  snippets: ArticleSnippet[];
  snippetCategories: SnippetCategory[];
  sourceTextareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  onChangeBody: (value: string) => void;
  onSnippetInserted: () => void;
  onImportFiles: (files: File[], selection: { start: number; end: number }) => void | Promise<void>;
  onPasteConflict: () => void;
  onOpenInfo: () => void;
  onOpenMediaPicker: () => void;
  mediaBusy: boolean;
  readOnly: boolean;
};

export function SourcePanel({
  article,
  parsed,
  revision,
  mediaRevision = 0,
  status,
  mobilePane,
  directory,
  snippets,
  snippetCategories,
  sourceTextareaRef,
  onChangeBody,
  onSnippetInserted,
  onImportFiles,
  onPasteConflict,
  onOpenInfo,
  onOpenMediaPicker,
  mediaBusy,
  readOnly,
}: Props) {
  const formatSnapshot = useFormatSnapshot();
  const openFindRef = useRef<(() => void) | null>(null);
  const openPickerRef = useRef<(() => void) | null>(null);
  const insertTextRef = useRef<((text: string, caretOffset: number) => boolean) | null>(null);
  const imagePickerRef = useRef<HTMLInputElement | null>(null);
  const { showLineNumbers, toggle: toggleLineNumbers } = useSourceLineNumbers();
  const [checksEnabled, setChecksEnabled] = useAuthoringChecks();
  const [fileRevision, setFileRevision] = useState(0);
  useEffect(() => { const refresh = () => setFileRevision(value => value + 1); window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh); }, []);
  const [lineIssues, setLineIssues] = useState<ArticleFormatIssue[]>([]);
  const [lineValidationError, setLineValidationError] = useState('');
  const lineCount = useMemo(() => logicalSourceLines(parsed.body).length, [parsed.body]);
  const lineConcerns = useMemo(() => groupSourceLineIssues(lineIssues, lineCount), [lineIssues, lineCount]);

  useEffect(() => {
    setLineIssues([]);
    setLineValidationError('');
    if (!checksEnabled) return;
    let current = true;
    // Utility checks compile CSS. Wait until typing pauses so the source field
    // stays responsive while the reader edits a long article.
    const timer = window.setTimeout(() => {
      void Promise.all([validateArticleAuthoringMarkdown(parsed.body, '当前文章正文'), inspectLocalArticleImages(parsed.body, directory, article.month, article.folder)]).then((results) => {
        const issues = results.flat();
        if (!current) return;
        setLineIssues(issues);
        const engineIssue = issues.find((issue) => issue.kind === 'engine');
        if (engineIssue) setLineValidationError(engineIssue.message);
      }).catch((error: unknown) => {
        if (current) setLineValidationError(error instanceof Error ? error.message : String(error));
      });
    }, 600);
    return () => { current = false; window.clearTimeout(timer); };
  }, [parsed.body, checksEnabled, directory, article.month, article.folder, mediaRevision, fileRevision, formatSnapshot.id]);
  const handleImageFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    const textarea = sourceTextareaRef.current;
    const selection = textarea ? { start: textarea.selectionStart, end: textarea.selectionEnd } : { start: parsed.body.length, end: parsed.body.length };
    event.currentTarget.value = '';
    if (files.length) void onImportFiles(files, selection);
  };
  const fileName = article.month && article.folder ? 'article.md' : '未保存文稿';

  return (
    <section className="panel source-panel" data-mobile-hidden={mobilePane === 'preview'} onKeyDownCapture={event => {
      if (event.defaultPrevented || event.repeat || event.nativeEvent.isComposing || event.keyCode === 229 || event.altKey
        || !(event.metaKey || event.ctrlKey) || event.key !== '/' || !event.currentTarget.contains(event.target as Node)) return;
      event.preventDefault();
      event.stopPropagation();
      toggleLineNumbers();
    }}>
      <div className="panel-header source-panel-header">
        <InformationButton icon={<InformationIcon />} title={fileName} subtitle="点击文件修改基本信息" titleClassName="font-mono" onClick={onOpenInfo} disabled={!directory || readOnly || mediaBusy || parsed.diagnostics.some((item) => item.level === 'error')} />
        <div className="toolbar-actions source-actions">
          <input ref={imagePickerRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,image/avif" multiple hidden onChange={handleImageFiles} />
          <IconButton tooltip={`${showLineNumbers ? '隐藏行号' : '显示行号'}（⌘/ / Ctrl+/）`} aria-pressed={showLineNumbers} onClick={toggleLineNumbers} icon={<svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 5h13M8 12h13M8 19h13" /><path d="M3 4h1v4M3 11h1v4M3 18h1v3" /></svg>} />
          <IconButton tooltip="查找替换（⌘F / Ctrl+F）" icon={<FindIcon />} onClick={() => openFindRef.current?.()} />
          <InsertElementsMenu
            disabled={readOnly || mediaBusy}
            readOnly={readOnly}
            onOpenSnippetPicker={() => openPickerRef.current?.()}
            onChooseImage={() => imagePickerRef.current?.click()}
            onOpenMediaPicker={onOpenMediaPicker}
            onInsert={(text, caretOffset) => insertTextRef.current?.(text, caretOffset)}
          />
        </div>
      </div>
      <SnippetTextarea
        key={typeof parsed.metadata?.id === 'string' ? parsed.metadata.id : undefined}
        ref={sourceTextareaRef}
        value={parsed.body}
        snippets={snippets}
        categories={snippetCategories}
        openFindRef={openFindRef}
        openPickerRef={openPickerRef}
        insertTextRef={insertTextRef}
        onChange={onChangeBody}
        onSnippetInserted={onSnippetInserted}
        disabled={mediaBusy || readOnly || parsed.diagnostics.some((item) => item.level === 'error')}
        onImportFiles={onImportFiles}
        onPasteConflict={onPasteConflict}
        showLineNumbers={showLineNumbers}
        lineConcerns={lineConcerns}
      />
      <div className="source-footer">
        <label className="flex shrink-0 items-center gap-1.5 text-2xs text-muted"><input type="checkbox" role="switch" className="size-3 accent-accent" checked={checksEnabled} onChange={event => setChecksEnabled(event.target.checked)} aria-label={checksEnabled ? '错误检查开启' : '错误检查关闭'} />{checksEnabled ? '错误检查开启' : '错误检查关闭'}</label>
        <span className="status-copy" data-tone={status.tone} role="status">{status.label}</span>
        <span className="status-copy">{article.dirty ? '未保存' : '已保存'}{status.formatRevision === revision ? '' : ` · revision ${revision}`}</span>
        {parsed.diagnostics.some((item) => item.level === 'error') ? <span className="status-copy" data-tone="error">元数据错误时正文只读</span> : null}
        {checksEnabled && lineValidationError ? <span className="status-copy" data-tone="warning" role="status">撰写诊断暂不可用：{lineValidationError}</span> : null}
      </div>
      {directory && article.month && article.folder ? null : <p>文章尚未保存到资料目录；保存前不会生成文章文件。</p>}
    </section>
  );
}
