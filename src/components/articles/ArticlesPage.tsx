'use client';

import { PageHeading } from '../global/PageHeading';
import { IconButton } from '../global/IconButton';
import { DialogActions, DialogButton, DialogFrame, DialogHeader } from '../global/DialogFrame';
import { createPortal } from 'react-dom';
import { summarizeArticleListChecks, type ArticleListCheck } from '../../lib/articleListChecks';

import { ButtonBar } from '../global/ButtonBar';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { ArticleCollection, Tone } from '../../hooks/useEditorController';
import { getArticleOrganization, type EditorWorkspace } from '../../lib/editorWorkspace';
import type { ArticleSummary, ArticleIndexIssue, ThemeConfig } from '../../lib/types';
import { availableArticleThemeUpdate } from '../../lib/articleThemeUpdate';
import { ThemeUpdateTag } from '../themes/ThemeUpdateTag';
import { ArticleActionsMenu } from './ArticleActionsMenu';

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间待修复';
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

type Props = {
  articles: ArticleSummary[];
  allArticles: ArticleSummary[];
  themes: ThemeConfig[];
  currentId: string;
  directory: FileSystemDirectoryHandle | null;
  directoryName: string | null;
  rememberedDirectoryName: string | null;
  directoryRestoreState: 'checking' | 'idle' | 'permission-needed';
  collection: ArticleCollection;
  collectionTitle: string;
  workspace: EditorWorkspace;
  busy: boolean;
  indexMonths: string[];
  indexIssues: ArticleIndexIssue[];
  checks: Record<string, ArticleListCheck>;
  listNotice: { label: string; tone: Tone };
  listWork: { kind: 'check' | 'index' | 'tags'; completed: number; total: number } | null;
  onCheck: (targets: ArticleSummary[]) => Promise<void>;
  onCancelCheck: (clearNotice?: boolean) => void;
  onRebuildIndexes: (months: string[]) => Promise<void>;
  onRemoveCategories: (targets: ArticleSummary[], labels: string[]) => Promise<boolean>;
  onNew: () => void;
  onRefresh: () => void;
  onOpen: (stored: ArticleSummary) => void;
  onInfo: (stored: ArticleSummary) => void;
  onArchive: (stored: ArticleSummary, archived: boolean) => void;
  onArchiveMany: (stored: ArticleSummary[], archived: boolean) => void;
  onClassifyMany: (stored: ArticleSummary[], projectId: string | null) => Promise<boolean>;
  onFork: (stored: ArticleSummary) => void;
  onDelete: (stored: ArticleSummary) => void;
  onDeleteMany: (stored: ArticleSummary[]) => void;
  onGoToSettings: () => void;
  onReopenRememberedDirectory: () => void;
};

export function ArticlesPage({
  articles,
  allArticles,
  themes,
  currentId,
  directory,
  directoryName,
  rememberedDirectoryName,
  directoryRestoreState,
  collection,
  collectionTitle,
  workspace,
  busy,
  indexMonths, indexIssues, checks, listNotice, listWork, onCheck, onCancelCheck, onRebuildIndexes, onRemoveCategories,
  onNew,
  onRefresh,
  onOpen,
  onInfo,
  onArchive,
  onArchiveMany,
  onClassifyMany,
  onFork,
  onDelete,
  onDeleteMany,
  onGoToSettings,
  onReopenRememberedDirectory,
}: Props) {
  const [query, setQuery] = useState('');
  const [month, setMonth] = useState('all');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [managingCategories, setManagingCategories] = useState(false);
  const [categoryTargets, setCategoryTargets] = useState<string[]>([]);
  const [categoryDecision, setCategoryDecision] = useState<{ rows: ArticleSummary[]; labels: string[]; scope: string } | null>(null);
  const [indexDecision, setIndexDecision] = useState<string[] | null>(null);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);
  const projectMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const months = useMemo(() => Array.from(new Set(indexMonths)).sort().reverse(), [indexMonths]);
  const categories = useMemo(
    () => Array.from(new Set(articles.flatMap((item) => item.parse.metadata.categories).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [articles],
  );
  useEffect(() => { setSelectedCategories(current => { const next = current.filter(label => categories.includes(label)); return next.length === current.length ? current : next; }); }, [categories]);
  const projectsInOrder = useMemo(
    () => workspace.projectOrder.flatMap((id) => workspace.projects.filter((project) => project.id === id)),
    [workspace.projectOrder, workspace.projects],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('zh-CN');
    return articles.filter((item) => {
      const titleMatches = !needle || item.parse.metadata.title.toLocaleLowerCase('zh-CN').includes(needle);
      const monthMatches = month === 'all' || item.month === month;
      const categoryMatches = selectedCategories.length === 0 || selectedCategories.some((category) => item.parse.metadata.categories.includes(category));
      return titleMatches && monthMatches && categoryMatches;
    });
  }, [articles, month, query, selectedCategories]);

  useEffect(() => { setSelectedCategories([]); setSelectedIds([]); setSelecting(false); setProjectMenuOpen(false); setManagingCategories(false); }, [collection, directory]);

  useEffect(() => {
    setSelectedIds([]);
    setProjectMenuOpen(false);
  }, [collection, query, month, selectedCategories]);

  useEffect(() => {
    const availableIds = new Set(articles.map((item) => item.id));
    setSelectedIds((current) => {
      const next = current.filter((id) => availableIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [articles]);

  useEffect(() => {
    if (!projectMenuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !projectMenuRef.current?.contains(event.target)) setProjectMenuOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setProjectMenuOpen(false);
      projectMenuButtonRef.current?.focus();
      event.preventDefault();
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [projectMenuOpen]);

  const scope = JSON.stringify([collection, query, month, selectedCategories]);
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const totals = summarizeArticleListChecks(filtered, checks);
  const listBusy = busy || listWork !== null;
  const affected = filtered.filter(item => item.parse.metadata.categories.some(label => categoryTargets.includes(label)));
  useEffect(() => { onCancelCheck(true); setCategoryTargets([]); setCategoryDecision(null); return () => onCancelCheck(true); }, [scope, directory, onCancelCheck]);

  const toggleCategory = (category: string) => {
    if (managingCategories) { setCategoryTargets(current => current.includes(category) ? current.filter(item => item !== category) : [...current, category]); return; }
    setSelectedCategories((current) => current.includes(category) ? current.filter((item) => item !== category) : [...current, category]);
  };
  const hasActiveFilters = Boolean(query.trim() || month !== 'all' || selectedCategories.length);
  const selectionActive = selecting;
  const selectedArticles = filtered.filter((item) => selectedIds.includes(item.id));
  const allFilteredSelected = Boolean(filtered.length) && filtered.every((item) => selectedIds.includes(item.id));
  const toggleSelected = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const leaveSelection = () => { setSelecting(false); setSelectedIds([]); setProjectMenuOpen(false); };
  const toggleSelection = () => { setManagingCategories(false); setCategoryTargets([]); selecting ? leaveSelection() : setSelecting(true); };

  useEffect(() => {
    if (!selectedArticles.length || busy) setProjectMenuOpen(false);
  }, [selectedArticles.length, busy]);

  if (!directory) {
    return (
      <section className="page-card justify-center" aria-labelledby="articles-empty-title">
        <div className="mx-auto flex w-full max-w-xl flex-col items-start gap-4 rounded-lg border border-line bg-panel p-6 md:p-10">
          <span className="grid size-12 place-items-center rounded-lg bg-accent-soft text-accent-text" aria-hidden="true"><svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3.75h8l4 4V20H6z" /><path d="M14 4v4h4M9 12h6M9 15.5h4" /></svg></span>
          <p id="articles-empty-kicker" className="eyebrow">RAINY 文稿台 / 本地资料库</p>
          <h2 id="articles-empty-title" className="page-title font-heading">{directoryRestoreState === 'checking' ? '正在恢复资料目录' : rememberedDirectoryName ? '重新授权上次目录' : '选择资料目录，开始写作'}</h2>
          <p className="m-0 max-w-lg text-sm text-muted mt-3">{directoryRestoreState === 'checking' ? '正在检查上次选择的本地目录与读写权限。' : rememberedDirectoryName ? `已记住「${rememberedDirectoryName}」。授权后可直接载入文章，无需重新选择文件夹。` : '文章、图片、历史版本和项目顺序保存在你选择的目录中。当前没有打开的资料目录，也没有演示稿。'}</p>
          {directoryRestoreState === 'checking' ? null : rememberedDirectoryName ? <div className="mt-2 flex flex-wrap gap-2"><button className="button button-primary" type="button" onClick={onReopenRememberedDirectory}>授权并打开</button><button className="button button-quiet" type="button" onClick={onGoToSettings}>选择其他目录</button></div> : <button className="button button-primary mt-2" type="button" onClick={onGoToSettings}>前往设置选择目录</button>}
        </div>
      </section>
    );
  }

  return (
    <section className="page-card" aria-labelledby="archive-title">
        <PageHeading className="border-b border-line pb-5">
          <div className="min-w-0">
            <p id="archive-kicker" className="eyebrow">{directoryName ?? '本地资料库'} / {collectionTitle}</p>
            <h2 id="archive-title" className="page-title font-heading">{collection === 'archived' ? '归档文稿' : collection === 'all' ? '文稿索引' : collection === 'unclassified' ? '未分组文稿' : '项目文稿'}</h2>
            <p className="max-w-160 text-sm text-muted mt-3">{collection === 'archived' ? '归档文章保留原项目与全部内容，取消归档后可以继续编辑。' : '从这里查找文稿，或在左侧列表整理项目与顺序。'}</p>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <div className="flex items-baseline gap-2 border-r border-line pr-4" aria-label={`当前显示 ${filtered.length} 篇，共 ${articles.length} 篇`}>
              <strong className="font-mono text-3xl font-medium tracking-tight text-accent-text">{String(filtered.length).padStart(2, '0')}</strong>
              <span className="text-xs text-muted">篇文稿</span>
            </div>
            {collection !== 'archived' ? <ButtonBar label="文章操作"><button className="button button-primary" type="button" onClick={onNew}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 4v16M4 12h16" /></svg>新建文章</button></ButtonBar> : null}
          </div>
        </PageHeading>

        <section className="min-w-0 rounded-lg border border-line bg-panel" aria-label="文章筛选与列表">
          <div className="flex flex-col gap-3 border-b border-line p-4 md:flex-row md:items-end md:p-5">
            <label className="block min-w-0 flex-1">
              <span className="field-label mb-1.5 block">搜索标题</span>
              <span className="relative block">
                <svg className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
                <input className="field pl-10" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入文章标题" />
              </span>
            </label>
            <label className="block md:w-44 md:shrink-0">
              <span className="field-label mb-1.5 block">保存年月</span>
              <select className="field" value={month} onChange={(event) => setMonth(event.target.value)}>
                <option value="all">全部年月</option>
                {months.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>

          {indexIssues.length ? <div className="grid gap-2 border-b border-warning-line bg-warning-surface p-4" role="status"><p className="text-xs text-warning-strong">索引需要修复；当前列表可能不完整，请先核对受影响年月。</p>{indexIssues.map(issue => <p key={`${issue.month}-${issue.message}`} className="break-words text-xs text-muted">{issue.month}：{issue.message}</p>)}<button className="button button-quiet self-start" type="button" disabled={listBusy} onClick={() => setIndexDecision([...new Set(indexIssues.map(item => item.month))])}>扫描并重建索引</button></div> : null}
          {listNotice.label ? <p className="status-copy border-b border-line px-4 py-3 md:px-5" data-tone={listNotice.tone} role="status">{listNotice.label}</p> : null}
          <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-line px-4 py-3 md:px-5">
            <IconButton tooltip={collection === 'archived' ? '归档分类只读；取消归档后可移除标签' : managingCategories ? '退出标签多选' : '多选分类标签'} disabled={collection === 'archived' || listBusy || !categories.length} aria-pressed={managingCategories} onClick={() => { leaveSelection(); setManagingCategories(value => !value); setCategoryTargets([]); }} icon={<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="1" /><path d="m5 7 2 2 3-4M15 5h6M15 10h6M3 17h8M15 17h6" /></svg>} />
            <span className="mr-1 text-xs font-medium text-muted">分类</span>
            {categories.length ? categories.map((category) => {
              const pressed = managingCategories ? categoryTargets.includes(category) : selectedCategories.includes(category);
              return <button key={category} type="button" className="rounded-full border border-line bg-panel px-2.5 py-1 text-xs text-muted transition hover:border-accent-line hover:text-secondary aria-pressed:border-accent-line aria-pressed:bg-accent-soft aria-pressed:font-medium aria-pressed:text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" aria-pressed={pressed} disabled={listBusy} onClick={() => toggleCategory(category)}>{category}</button>;
            }) : <span className="text-xs text-faint">当前集合暂无分类</span>}
            {managingCategories ? <><span className="text-xs text-faint">已选 {categoryTargets.length} 个</span><button className="button button-danger min-h-8 px-2 py-1 text-xs" type="button" disabled={!affected.length || listBusy} onClick={() => setCategoryDecision({ rows: [...affected], labels: [...categoryTargets], scope })}>移除所选标签</button><button className="button button-quiet min-h-8 px-2 py-1 text-xs" type="button" disabled={listBusy} onClick={() => { setManagingCategories(false); setCategoryTargets([]); }}>取消</button></> : null}
            {hasActiveFilters ? <button className="ml-auto rounded-md border-0 bg-transparent px-2 py-1 text-xs text-muted underline underline-offset-2 hover:text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" type="button" onClick={() => { setQuery(''); setMonth('all'); setSelectedCategories([]); }}>清除筛选</button> : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-list pl-3 pr-4 py-3 md:pr-5">
            <div className="flex flex-wrap items-center gap-2">
              <button className="grid size-8 shrink-0 place-items-center rounded-md border border-line bg-panel text-muted transition-colors hover:border-accent-line hover:text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-pressed:border-accent-line aria-pressed:bg-accent-soft aria-pressed:text-accent-text" type="button" aria-label={selectionActive ? '退出多选模式' : '进入多选模式'} aria-pressed={selectionActive} data-tooltip={selectionActive ? '退出多选' : '多选文章'} onClick={toggleSelection}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="8" height="8" rx="1" /><path d="m5.5 7 1.5 1.5L10 5.5M15 5h6M15 10h6M3 17h8M15 17h6" /></svg></button>
              <div className="flex items-baseline gap-2">
                <h3 className="font-sub-heading text-sm font-semibold text-primary">文章列表</h3>
                <span className="text-xs text-faint">{selectionActive ? `已选 ${selectedArticles.length} / ${filtered.length}` : `显示 ${filtered.length} / ${articles.length}`}</span>
              </div>
              {selectionActive && filtered.length ? <button className="rounded-md border-0 bg-transparent px-1 text-xs text-muted underline underline-offset-2 transition-colors hover:text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" type="button" onClick={() => setSelectedIds(allFilteredSelected ? [] : filtered.map((item) => item.id))}>{allFilteredSelected ? '清除选择' : '全选当前'}</button> : null}
            </div>
            {selectionActive ? <ButtonBar label={collection === 'archived' ? '归档文稿批量操作' : '文章批量操作'}>
              {collection === 'archived' ? <>
                <button className="button button-quiet min-h-8 px-2 py-1 text-xs" type="button" disabled={!selectedArticles.length || busy} onClick={() => onArchiveMany(selectedArticles, false)}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 13v6h16v-6M12 16V4m0 0-4 4m4-4 4 4" /></svg>取消归档</button>
                <button className="button button-danger min-h-8 px-2 py-1 text-xs" type="button" disabled={!selectedArticles.length || busy} onClick={() => onDeleteMany(selectedArticles)}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>删除</button>
              </> : <>
                <div ref={projectMenuRef} className="relative">
                  <button ref={projectMenuButtonRef} className="button button-quiet min-h-8 px-2 py-1 text-xs" type="button" aria-expanded={projectMenuOpen} aria-controls="bulk-project-menu" disabled={!selectedArticles.length || busy} onClick={() => setProjectMenuOpen((open) => !open)}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h7l2 2h9v11H3zM3 7V4h7l2 3" /></svg>分组至</button>
                  {projectMenuOpen ? <div id="bulk-project-menu" className="absolute top-full left-0 z-20 mt-2 grid w-56 max-h-56 gap-0.5 overflow-x-clip overflow-y-auto rounded-md border border-line bg-panel p-1 shadow-panel scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent" role="group" aria-label="选择目标项目">
                    {[{ id: null, name: '未分组' }, ...projectsInOrder].map((project) => <button key={project.id ?? 'unclassified'} className="w-full break-words rounded-sm px-3 py-2 text-left text-xs text-secondary hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" type="button" onClick={() => { setProjectMenuOpen(false); void onClassifyMany(selectedArticles, project.id); }}>{project.name}</button>)}
                  </div> : null}
                </div>
                <button className="button button-quiet min-h-8 px-2 py-1 text-xs" type="button" disabled={!selectedArticles.length || busy} onClick={() => onArchiveMany(selectedArticles, true)}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v12h14V8M10 12h4" /></svg>归档</button>
              </>}
            </ButtonBar> : null}
            <div className="ml-auto flex min-w-0 flex-wrap items-center gap-3">
              <span className="status-copy" data-tone={totals.error || totals.failed ? 'error' : totals.warning || totals.stale ? 'warning' : 'neutral'} role="status">{filtered.length ? `上次检查：已检测 ${totals.checked} 篇 · 警告 ${totals.warning} 篇 · 错误 ${totals.error} 篇 · 未检测 ${totals.unchecked} 篇${totals.stale ? ` · 需重检 ${totals.stale} 篇` : ''}${totals.failed ? ` · 检查失败 ${totals.failed} 篇` : ''}` : '当前范围无文章需检查'}</span>
              {listWork?.kind === 'check' ? <><span className="text-xs text-muted">检查中 {listWork.completed}/{listWork.total}</span><button className="button button-quiet min-h-8 px-2 py-1 text-xs" type="button" onClick={() => onCancelCheck()}>取消检查</button></> : <button className="button button-quiet min-h-8 px-2 py-1 text-xs" type="button" disabled={!filtered.length || listBusy} onClick={() => void onCheck([...filtered])}>检查当前范围</button>}
              <IconButton tooltip="扫描并重建当前年月索引" disabled={listBusy || !indexMonths.length} onClick={() => setIndexDecision(month === 'all' ? [...indexMonths] : [month])} icon={<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8l5 5v2M13 3v5h5M7 11h4M7 15h2" /><path d="M21 13v4h-4M21 17a4 4 0 1 1-1.17-2.83" /></svg>} />
              <button className="button button-quiet min-h-8 px-2 py-1 text-xs" type="button" disabled={listBusy} onClick={onRefresh}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.5 9a7 7 0 0 1 12-2L20 12M4 12l2.5 5a7 7 0 0 0 12-2" /></svg>刷新</button>
            </div>
          </div>

          {filtered.length ? (
            <section aria-label={`${collectionTitle}列表`}>
              {filtered.map((item, index) => {
                const hasErrors = item.parse.diagnostics.some((diagnostic) => diagnostic.level === 'error');
                const organization = getArticleOrganization(workspace, item.id);
                const projectName = organization.projectId ? workspace.projects.find((project) => project.id === organization.projectId)?.name : null;
                const title = item.parse.metadata.title || '未命名文章';
                const current = item.id === currentId;
                const selected = selectionActive && selectedIds.includes(item.id);
                const themeUpdate = availableArticleThemeUpdate(item.theme, themes);
                const content = <>
                  <span className="flex min-w-0 flex-wrap items-center gap-2"><strong className="min-w-0 truncate font-sub-heading text-sm font-semibold text-primary group-hover:text-accent-text">{title}</strong>{hasErrors ? <span className="rounded-md border border-warning-line bg-warning-surface px-1.5 py-0.5 text-xs text-warning-strong">需处理</span> : null}</span>
                  <span className="mt-1 block truncate text-xs text-muted">{item.parse.metadata.description || (item.indexState === 'repair-needed' ? '摘要待索引补全' : '暂无摘要')}</span>
                  <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
                    <span className="font-medium text-muted">{projectName ?? '未分组'}</span><span aria-hidden="true">·</span>
                    <span>{item.parse.metadata.categories.length ? item.parse.metadata.categories.join('、') : '未添加分类'}</span><span aria-hidden="true">·</span>
                    <span aria-label={`主题「${item.theme.name}」版本 ${item.theme.version}`}>v{item.theme.version}</span>
                    {themeUpdate ? <ThemeUpdateTag /> : null}
                    <span aria-hidden="true">·</span>
                    <time dateTime={item.parse.metadata.updatedAt}>{formatDate(item.parse.metadata.updatedAt)}</time>
                    {checks[item.id] ? <span className="status-copy" data-tone={checks[item.id].state === 'failed' || checks[item.id].error ? 'error' : checks[item.id].state === 'stale' || checks[item.id].warning ? 'warning' : 'neutral'} title={checks[item.id].message ?? `检查时间：${checks[item.id].checkedAt}`}>{checks[item.id].state === 'failed' ? `检查失败：${checks[item.id].message ?? '需重试'}` : checks[item.id].state === 'stale' ? '需重检' : `上次检查 · 警告 ${checks[item.id].warning} · 错误 ${checks[item.id].error}`}</span> : null}
                  </span>
                </>;
                const selectOnKey = (event: KeyboardEvent<HTMLElement>) => {
                  if (event.key !== ' ' && event.key !== 'Enter') return;
                  event.preventDefault();
                  toggleSelected(item.id);
                };
                return (
                  <article key={item.id} className="group relative flex min-w-0 items-start gap-3 border-b border-line px-4 py-4 last:border-b-0 hover:bg-hover data-[current=true]:bg-accent-soft data-[selected=true]:bg-accent-soft data-[selected=true]:hover:bg-accent-soft data-[selecting=true]:cursor-pointer data-[selection-opacity=muted]:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:items-center md:px-5" data-current={current && !selectionActive} data-selected={selected} data-selecting={selectionActive} data-selection-opacity={selectionActive && !selected ? 'muted' : 'full'} role={selectionActive ? 'checkbox' : undefined} aria-checked={selectionActive ? selected : undefined} aria-label={selectionActive ? `选择「${title}」` : undefined} tabIndex={selectionActive ? 0 : undefined} onClick={selectionActive ? () => toggleSelected(item.id) : undefined} onKeyDown={selectionActive ? selectOnKey : undefined}>
                    {current && !selectionActive ? <span className="absolute inset-y-3 left-0 w-0.75 rounded-full bg-accent" aria-hidden="true" /> : null}
                    <span className="grid w-6 shrink-0 place-items-start pt-0.5 md:pt-0"><span className="font-mono text-xs text-faint" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span></span>
                    {selectionActive ? <span className="min-w-0 flex-1 text-left">{content}</span> : <button className="min-w-0 flex-1 border-0 bg-transparent p-0 text-left focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" type="button" onClick={() => onOpen(item)}>{content}</button>}
                    {selectionActive ? <span className="grid size-8 shrink-0 place-items-center rounded-md border border-line-strong bg-panel text-faint data-[checked=true]:border-accent data-[checked=true]:bg-accent data-[checked=true]:text-on-accent" data-checked={selected} aria-hidden="true"><svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" />{selected ? <path d="m7 12 3.5 3.5L17 9" /> : null}</svg></span> : <ArticleActionsMenu article={item} archived={collection === 'archived' || organization.archived} disabled={busy} onInfo={onInfo} onArchive={onArchive} onFork={onFork} onDelete={onDelete} />}
                  </article>
                );
              })}
            </section>
          ) : (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-8 text-center" aria-live="polite">
              <strong className="font-sub-heading text-sm font-semibold text-primary">{indexIssues.length && !articles.length ? '请先修复索引以确认文章列表' : articles.length ? '没有匹配的文章' : collection === 'archived' ? '这里还没有归档文章' : '这个列表还没有文章'}</strong>
              <p className="m-0 max-w-112 text-sm text-muted mt-3">{indexIssues.length && !articles.length ? '索引尚不完整，当前不能判断这个集合是否为空。' : articles.length ? '调整搜索、年月或分类筛选。' : collection === 'archived' ? '归档文章会留在这里，随时可以取消归档。' : '新建文章后，会出现在这个资料目录和项目列表中。'}</p>
              {!indexIssues.length && !articles.length && collection !== 'archived' ? <button className="button button-quiet" type="button" onClick={onNew}>新建文章</button> : null}
            </div>
          )}
        </section>
        {categoryDecision && typeof document !== 'undefined' ? createPortal(<DialogFrame titleId="remove-categories-title" role="alertdialog" onClose={() => setCategoryDecision(null)}><DialogHeader titleId="remove-categories-title" eyebrow="CATEGORY MANAGEMENT" title="移除分类标签" onClose={() => setCategoryDecision(null)} /><div className="grid gap-4 p-4"><p className="text-sm text-primary">标签：{categoryDecision.labels.join('、')}</p><p className="text-sm text-muted">范围：{collectionTitle}当前筛选结果，共影响 {categoryDecision.rows.length} 篇文章。{query.trim() ? `搜索：${query.trim()}。` : ''}{month !== 'all' ? `年月：${month}。` : ''}</p><p className="text-xs text-warning-strong">移除后会修改这些文章的分类；正文、其他信息和已有历史保留。</p><DialogActions><DialogButton autoFocus onClick={() => setCategoryDecision(null)}>取消</DialogButton><DialogButton variant="danger" onClick={() => { const decision = categoryDecision; setCategoryDecision(null); void onRemoveCategories(decision.rows, decision.labels).then(done => { if (done && scopeRef.current === decision.scope) setCategoryTargets([]); }); }}>确认移除</DialogButton></DialogActions></div></DialogFrame>, document.body) : null}
        {indexDecision && typeof document !== 'undefined' ? createPortal(<DialogFrame titleId="rebuild-index-title" onClose={() => setIndexDecision(null)}><DialogHeader titleId="rebuild-index-title" eyebrow="ARTICLE INDEX" title="扫描并重建索引" onClose={() => setIndexDecision(null)} /><div className="grid gap-4 p-4"><p className="text-sm text-primary">将读取以下年月中的全部文章正文和主题快照，再重建列表索引：{indexDecision.join('、')}。</p><p className="text-xs text-muted">原稿保持不变，损坏文章会保留诊断条目。文章较多时可能需要一些时间。</p><DialogActions><DialogButton autoFocus onClick={() => setIndexDecision(null)}>取消</DialogButton><DialogButton variant="primary" onClick={() => { const months = indexDecision; setIndexDecision(null); void onRebuildIndexes(months); }}>开始重建</DialogButton></DialogActions></div></DialogFrame>, document.body) : null}
    </section>
  );
}
