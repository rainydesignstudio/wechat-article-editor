'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { changedThemeSnapshotFields, type ArticleHistoryIssue, type ArticleHistorySnapshot } from '../../lib/articleHistory';
import type { StoredArticle, ThemeConfig } from '../../lib/types';
import { parseArticle } from '../../lib/frontMatter';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { HistorySnapshotPreview } from './HistorySnapshotPreview';

type Props = {
  articleTitle: string;
  currentSource: string;
  currentTheme: ThemeConfig;
  currentThemeValid: boolean;
  currentDirty: boolean;
  month: string;
  folder: string;
  root: FileSystemDirectoryHandle | null;
  mediaArticle: Pick<StoredArticle, 'id' | 'month' | 'folder'>;
  snapshots: ArticleHistorySnapshot[];
  issues: ArticleHistoryIssue[];
  selectedId: string | null;
  busy: boolean;
  canRestore: boolean;
  canSaveAs: boolean;
  refreshPending: boolean;
  notice: { label: string; tone: 'neutral' | 'success' | 'warning' | 'error' };
  months: string[];
  onClose: () => void;
  getReturnFocus: () => HTMLElement | null;
  onSelect: (id: string) => void;
  onManualSnapshot: () => void;
  onRestore: (snapshot: ArticleHistorySnapshot) => void;
  onSaveAs: (snapshot: ArticleHistorySnapshot, title: string, month: string) => void;
  onToggleRetention: (snapshot: ArticleHistorySnapshot, retained: boolean) => void;
  onRefreshHistory: () => void;
};

type DiffRow = { left: string | null; right: string | null; kind: 'same' | 'removed' | 'added' };

const KIND_LABEL: Record<ArticleHistorySnapshot['kind'], string> = {
  automatic: '自动快照',
  manual: '重要版本',
  'before-restore': '恢复前保护点',
  'before-theme-change': '换主题前保护点',
};

function formatSnapshotTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间无效' : date.toLocaleString('zh-CN');
}

function diffLines(previous: string, current: string): DiffRow[] {
  const left = previous.split('\n');
  const right = current.split('\n');
  if (left.length * right.length > 300_000) {
    let prefix = 0;
    while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1;
    let suffix = 0;
    while (suffix < left.length - prefix && suffix < right.length - prefix && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]) suffix += 1;
    return [
      ...left.slice(0, prefix).map((line) => ({ left: line, right: line, kind: 'same' as const })),
      ...left.slice(prefix, left.length - suffix).map((line) => ({ left: line, right: null, kind: 'removed' as const })),
      ...right.slice(prefix, right.length - suffix).map((line) => ({ left: null, right: line, kind: 'added' as const })),
      ...left.slice(left.length - suffix).map((line, index) => ({ left: line, right: right[right.length - suffix + index] ?? '', kind: 'same' as const })),
    ];
  }
  const width = right.length + 1;
  const table = new Uint32Array((left.length + 1) * width);
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i * width + j] = left[i] === right[j]
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      rows.push({ left: left[i], right: right[j], kind: 'same' });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      rows.push({ left: left[i], right: null, kind: 'removed' });
      i += 1;
    } else {
      rows.push({ left: null, right: right[j], kind: 'added' });
      j += 1;
    }
  }
  while (i < left.length) rows.push({ left: left[i++], right: null, kind: 'removed' });
  while (j < right.length) rows.push({ left: null, right: right[j++], kind: 'added' });
  return rows;
}

function metadataPairs(previous: ArticleHistorySnapshot, currentSource: string, currentTheme: ThemeConfig) {
  const current = parseArticle(currentSource).metadata;
  const themeLabel = (theme: ThemeConfig) => `${theme.name} · v${theme.version}`;
  const themeChanges = changedThemeSnapshotFields(previous.theme, currentTheme);
  const pairs = [
    { label: '标题', before: previous.parsed.metadata.title, after: current.title },
    { label: '摘要', before: previous.parsed.metadata.description, after: current.description },
    { label: '作者', before: previous.parsed.metadata.author, after: current.author },
    { label: '分类', before: previous.parsed.metadata.categories.join('、') || '无', after: current.categories.join('、') || '无' },
    { label: '文章主题', before: themeLabel(previous.theme), after: themeLabel(currentTheme) },
  ];
  if (themeChanges.length) pairs.push({
    label: '主题快照内容',
    before: '历史快照',
    after: `变化字段：${themeChanges.join('、')}`,
  });
  return pairs.map((item) => ({
    ...item,
    changed: item.label === '文章主题' ? item.before !== item.after || themeChanges.length > 0 : item.before !== item.after,
  }));
}

function HistoryRestoreConfirm({
  busy,
  canRestore,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  canRestore: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  useDialogFocus(dialogRef, onCancel);
  return (
    <div className="history-restore-confirm-backdrop" role="presentation">
      <section ref={dialogRef} tabIndex={-1} className="history-restore-confirm" role="alertdialog" aria-modal="true" aria-labelledby="history-restore-title">
        <div><strong id="history-restore-title">恢复到这个版本？</strong><p>会先保存当前稿保护点，再恢复历史正文与主题。当前内容不会被静默覆盖。</p></div>
        <div><button className="button button-quiet" type="button" disabled={busy} onClick={onCancel}>取消</button><button className="button button-danger" type="button" disabled={busy || !canRestore} onClick={onConfirm}>确认恢复</button></div>
      </section>
    </div>
  );
}

export function ArticleHistoryView(props: Props) {
  const {
    articleTitle, currentSource, currentTheme, currentThemeValid, currentDirty, month, folder, root, mediaArticle,
    snapshots, issues, selectedId, busy, canRestore, canSaveAs, refreshPending, notice, months, onClose,
    getReturnFocus, onSelect, onManualSnapshot, onRestore, onSaveAs, onToggleRetention, onRefreshHistory,
  } = props;
  const selected = snapshots.find((item) => item.id === selectedId) ?? snapshots[0] ?? null;
  const [copyTitle, setCopyTitle] = useState(`${articleTitle} 历史 Fork`);
  const [copyMonth, setCopyMonth] = useState(month);
  const [previewMode, setPreviewMode] = useState<'source' | 'render'>('source');
  const [restoreTarget, setRestoreTarget] = useState<ArticleHistorySnapshot | null>(null);
  const monthOptions = useMemo(() => [...new Set([month, ...months])].sort().reverse(), [month, months]);
  const backButtonRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  const getReturnFocusRef = useRef(getReturnFocus);
  const restoreTargetRef = useRef<ArticleHistorySnapshot | null>(restoreTarget);
  onCloseRef.current = onClose;
  getReturnFocusRef.current = getReturnFocus;
  restoreTargetRef.current = restoreTarget;
  const currentParsed = useMemo(() => parseArticle(currentSource), [currentSource]);
  const currentSnapshot = useMemo<ArticleHistorySnapshot>(() => ({
    id: 'current-editor-revision',
    createdAt: '',
    kind: 'manual',
    retained: true,
    title: currentParsed.metadata.title,
    source: currentSource,
    theme: currentTheme,
    parsed: currentParsed,
    themeMatches: currentParsed.metadata.theme.id === currentTheme.id && currentParsed.metadata.theme.version === currentTheme.version,
  }), [currentParsed, currentSource, currentTheme]);
  const sourceDiff = useMemo(() => selected ? diffLines(selected.source, currentSource) : [], [currentSource, selected]);
  const metadata = useMemo(() => selected ? metadataPairs(selected, currentSource, currentTheme) : [], [currentSource, currentTheme, selected]);

  useEffect(() => {
    const focusTarget = getReturnFocusRef.current();
    const previousFocus = focusTarget?.isConnected
      ? focusTarget
      : document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => backButtonRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !restoreTargetRef.current) {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <section className="history-view" aria-labelledby="history-view-title">
      <header className="history-view-header">
        <button ref={backButtonRef} className="button button-quiet history-view-back" type="button" data-history-back="true" onClick={onClose} disabled={busy}>
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m14.5 5-7 7 7 7M8 12h12" /></svg>
          <span>返回编辑器</span>
        </button>
        <div className="history-view-heading"><p className="eyebrow">VERSION HISTORY</p><h1 className="font-heading history-view-title" id="history-view-title">「{articleTitle}」的历史版本</h1><p className="status-copy mt-3">{month}/{folder} · 正文与主题按快照成对保存</p></div>
      </header>
      <div className="history-view-content">
          {issues.length ? <div className="content-library-issues" role="status">{issues.map((item) => <p className="break-words" key={`${item.snapshotId}:${item.message}`}><strong>{item.snapshotId}</strong> · {item.message}</p>)}</div> : null}
          <div className="flex flex-wrap items-center gap-2">
            <p className="status-copy m-0" data-tone={notice.tone} role="status">{notice.label}</p>
            {refreshPending ? <button className="button button-quiet" type="button" onClick={onRefreshHistory} disabled={busy}>重试刷新历史</button> : null}
            <button className="button button-quiet" type="button" onClick={onManualSnapshot} disabled={busy || !canRestore}>保存重要版本</button>
          </div>
          <div className="history-grid">
            <nav className="history-list" aria-label="历史版本列表">
              {snapshots.map((snapshot) => (
                <div className="history-item" key={snapshot.id} data-current={selected?.id === snapshot.id}>
                  <button className="history-item-select" type="button" onClick={() => { onSelect(snapshot.id); setRestoreTarget(null); }} disabled={busy} aria-current={selected?.id === snapshot.id ? 'true' : undefined}>
                    <strong>{snapshot.title || '未命名文稿'}</strong>
                    <span>{formatSnapshotTime(snapshot.createdAt)} · {KIND_LABEL[snapshot.kind]}{snapshot.retained ? ' · 已保护' : ''}</span>
                  </button>
                  {snapshot.kind === 'automatic' ? <button className="history-retain" type="button" onClick={() => onToggleRetention(snapshot, !snapshot.retained)} disabled={busy || refreshPending}>{snapshot.retained ? '取消保护' : '保护此版'}</button> : null}
                </div>
              ))}
              {!snapshots.length ? <p className="status-copy">还没有完整历史版本。手动保存重要版本，或等待自动快照间隔。</p> : null}
            </nav>
            <section className="history-detail" aria-label="历史版本与当前稿对比">
              {selected ? <>
                <div className="history-detail-heading"><div><h3 className="font-heading">{selected.title || '未命名文稿'}</h3><p className="mt-3">{formatSnapshotTime(selected.createdAt)} · {KIND_LABEL[selected.kind]}{currentDirty ? ' · 当前稿有未保存修改' : ''}</p></div></div>
                {!selected.themeMatches ? <div className="content-library-note" data-tone="warning">此历史版本的 Front Matter 与主题快照不一致。恢复和另存已停用，以免绑定错误主题。</div> : null}
                <div className="history-preview-tabs" role="group" aria-label="版本对比方式">
                  <button className="button button-quiet" type="button" aria-pressed={previewMode === 'source'} onClick={() => setPreviewMode('source')}>源码与信息</button>
                  <button className="button button-quiet" type="button" aria-pressed={previewMode === 'render'} onClick={() => setPreviewMode('render')} disabled={!selected.parsed.canCopy || !currentParsed.canCopy || !currentThemeValid}>排版效果</button>
                </div>
                {previewMode === 'source' ? (
                  <div className="history-source-comparison">
                    <div className="history-diff-columns" aria-label="源码双栏对比">
                      <section><h4 className="font-heading">历史版本</h4><pre className="history-diff-lines" tabIndex={0} aria-label="历史版本源码">{sourceDiff.map((row, index) => <span key={`left-${index}`} className="history-diff-row" data-kind={row.kind}><i>{row.left === null ? '' : String(index + 1)}</i><code>{row.left ?? ' '}</code></span>)}</pre></section>
                      <section><h4 className="font-heading">当前稿</h4><pre className="history-diff-lines" tabIndex={0} aria-label="当前稿源码">{sourceDiff.map((row, index) => <span key={`right-${index}`} className="history-diff-row" data-kind={row.kind}><i>{row.right === null ? '' : String(index + 1)}</i><code>{row.right ?? ' '}</code></span>)}</pre></section>
                    </div>
                    <section className="history-metadata-comparison" aria-label="文章信息变化"><h4 className="font-heading">文章信息与主题</h4>{metadata.map((item) => <div key={item.label} className="history-metadata-row" data-changed={item.changed}><strong>{item.label}</strong><span>{item.before || '—'}</span><span>{item.after || '—'}</span></div>)}</section>
                  </div>
                ) : (
                  <div className="history-render-comparison">
                    {selected.parsed.canCopy ? <section><h4 className="font-heading">历史版本</h4><HistorySnapshotPreview key={`old-${selected.id}`} snapshot={selected} root={root} article={mediaArticle} articleTitle={selected.title || articleTitle} /></section> : <div className="content-library-note" data-tone="error">历史版本解析失败；只显示源码，不执行或渲染其中的内容。</div>}
                    {currentParsed.canCopy && currentThemeValid ? <section><h4 className="font-heading">当前稿</h4><HistorySnapshotPreview key="current-editor-revision" snapshot={currentSnapshot} root={root} article={mediaArticle} articleTitle={currentParsed.metadata.title || articleTitle} /></section> : <div className="content-library-note" data-tone="error">当前稿无法安全渲染；请先修复文章元数据或主题快照。</div>}
                  </div>
                )}
                <div className="history-detail-actions">
                  <button className="button button-quiet" type="button" onClick={() => setRestoreTarget(selected)} disabled={busy || !canRestore || !selected.themeMatches}>恢复此版本</button>
                </div>
                {restoreTarget ? <HistoryRestoreConfirm
                  busy={busy}
                  canRestore={canRestore}
                  onCancel={() => setRestoreTarget(null)}
                  onConfirm={() => { onRestore(restoreTarget); setRestoreTarget(null); }}
                /> : null}
                <form className="history-copy-form" onSubmit={(event) => { event.preventDefault(); onSaveAs(selected, copyTitle, copyMonth); }}>
                  <h4 className="font-heading">从历史版本 Fork</h4>
                  <div className="history-copy-fields">
                    <label className="field-stack"><span className="field-label">新文稿标题</span><input className="field" value={copyTitle} onChange={(event) => setCopyTitle(event.target.value)} disabled={busy || !canSaveAs || !selected.themeMatches} /></label>
                    <label className="field-stack"><span className="field-label">保存年月</span><select className="field" value={copyMonth} onChange={(event) => setCopyMonth(event.target.value)} disabled={busy || !canSaveAs || !selected.themeMatches}>{monthOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                  </div>
                  <p className="status-copy">复制文章素材和选中版本的主题快照；新文稿从自身开始记录历史。</p>
                  <button className="button button-primary" type="submit" disabled={busy || !canSaveAs || !selected.themeMatches || !copyTitle.trim()}>创建独立 Fork</button>
                </form>
              </> : <div className="empty-state"><strong>选择一个历史版本</strong><p>历史与当前稿会在此对比。</p></div>}
            </section>
          </div>
      </div>
    </section>
  );
}
