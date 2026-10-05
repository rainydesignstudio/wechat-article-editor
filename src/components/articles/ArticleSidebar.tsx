'use client';

import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { orderArticlesForGroup, getArticleOrganization } from '../../lib/editorWorkspace';
import type { EditorProject } from '../../lib/editorWorkspace';
import type { ArticleSummary } from '../../lib/types';
import { useEditorControllerContext } from '../global/AppProviders';
import { useUnclassifiedCollapsed } from '../../hooks/useUnclassifiedCollapsed';
import { ArticleActionsMenu } from './ArticleActionsMenu';

const ARTICLE_DRAG = 'application/x-rainy-article';
const PROJECT_DRAG = 'application/x-rainy-project';

function Chevron({ expanded }: { expanded: boolean }) {
  return <svg className="article-chevron" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" data-expanded={expanded}><path d="m9 5 7 7-7 7" /></svg>;
}

function CollapseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5-7 7 7 7" /></svg>;
}

function FileIcon() {
  return <svg className="article-sidebar-file-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3h9l5 5v13H5V3Z" /><path d="M14 3v5h5M8 13h8M8 17h6" /></svg>;
}

function PinIcon({ active }: { active: boolean }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" data-active={active}><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6ZM12 14v7" /></svg>;
}

function CollectionIcon({ kind }: { kind: 'all' | 'archived' }) {
  if (kind === 'all') return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 6.2C9.5 4.7 6.5 4.5 3 5v13c3.5-.5 6.5-.3 9 1.2 2.5-1.5 5.5-1.7 9-1.2V5c-3.5-.5-6.5-.3-9 1.2ZM12 6.2v13" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v12h14V8M10 12h4" /></svg>;
}

function CollectionLabel({ name, count }: { name: string; count: number }) {
  return <span className="relative grid h-9 min-w-0 flex-1 content-center">
    <span className="block min-w-0 truncate transition duration-300 group-hover/collection:-translate-y-1 group-focus-within/collection:-translate-y-1 motion-reduce:transition-none">{name}</span>
    <span className="pointer-events-none absolute top-1/2 left-0 -translate-y-0.5 text-xs text-muted opacity-0 transition duration-300 group-hover/collection:translate-y-0.5 group-hover/collection:opacity-100 group-focus-within/collection:translate-y-0.5 group-focus-within/collection:opacity-100 motion-reduce:transition-none" aria-hidden="true">共 {count} 篇文档</span>
  </span>;
}

function ArticleSidebarRow({
  article,
  projectId,
  archived,
  current,
  disabled,
  onOpen,
  onInfo,
  onArchive,
  onFork,
  onDelete,
  onDrop,
  onDragStart,
}: {
  article: ArticleSummary;
  projectId: string | null;
  archived: boolean;
  current: boolean;
  disabled: boolean;
  onOpen: (article: ArticleSummary) => void;
  onInfo: (article: ArticleSummary) => void;
  onArchive: (article: ArticleSummary, archived: boolean) => void;
  onFork: (article: ArticleSummary) => void;
  onDelete: (article: ArticleSummary) => void;
  onDrop: (event: DragEvent<HTMLDivElement>, projectId: string | null, targetId: string) => void;
  onDragStart: (event: DragEvent<HTMLDivElement>, article: ArticleSummary) => void;
}) {
  return (
    <div
      className="article-sidebar-row-wrap group hover:bg-rail data-[current=true]:hover:bg-accent-soft"
      draggable={!archived}
      onDragStart={(event) => onDragStart(event, article)}
      onDragOver={(event) => { if (!archived) event.preventDefault(); }}
      onDrop={(event) => onDrop(event, projectId, article.id)}
      data-current={current}
    >
      <button className={current ? 'article-sidebar-row group-hover:text-accent-text' : 'article-sidebar-row group-hover:text-primary'} type="button" data-active={current} onClick={() => onOpen(article)} aria-current={current ? 'page' : undefined}>
        <FileIcon />
        <span className="article-sidebar-label">{article.parse.metadata.title || '未命名文章'}</span>
      </button>
      <ArticleActionsMenu article={article} archived={archived} disabled={disabled} insetSummary onInfo={onInfo} onArchive={onArchive} onFork={onFork} onDelete={onDelete} />
    </div>
  );
}

function ProjectSettingsMenu({ project, onRename, onDelete, onMoveUp, onMoveDown }: { project: EditorProject; onRename: () => void; onDelete: () => void; onMoveUp: () => void; onMoveDown: () => void }) {
  return (
    <details className="project-settings-menu">
      <summary className="hover:bg-hover hover:text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" aria-label={`项目操作：${project.name}`} data-tooltip="项目操作"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg><span>更多</span></summary>
      <div role="group" aria-label={`项目操作：${project.name}`}>
        {project.pinned ? <><button type="button" onClick={(event) => { event.currentTarget.closest('details')!.open = false; onMoveUp(); }}>上移置顶项目</button><button type="button" onClick={(event) => { event.currentTarget.closest('details')!.open = false; onMoveDown(); }}>下移置顶项目</button></> : null}
        <button type="button" onClick={(event) => { event.currentTarget.closest('details')!.open = false; onRename(); }}>重命名项目</button>
        <button type="button" onClick={(event) => { event.currentTarget.closest('details')!.open = false; onDelete(); }}>删除项目</button>
      </div>
    </details>
  );
}

export function ArticleSidebar({
  collapsed,
  mobileOpen,
  onToggleCollapsed,
  onCloseMobile,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapsed: () => void;
  onCloseMobile: () => void;
}) {
  const controller = useEditorControllerContext();
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const { collapsed: unclassifiedCollapsed, toggle: toggleUnclassified } = useUnclassifiedCollapsed();
  const [archivedCollapsed, setArchivedCollapsed] = useState(false);
  const newProjectInputRef = useRef<HTMLInputElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const archivedExpanded = controller.selectedArticleCollection === 'archived' && !archivedCollapsed;
  const articleCount = controller.articleList.filter(item => !getArticleOrganization(controller.editorWorkspace, item.id).archived).length;

  useEffect(() => {
    const openMenus = () => sidebarRef.current?.querySelectorAll<HTMLDetailsElement>('.project-settings-menu[open]');
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      openMenus()?.forEach((menu) => { if (!menu.contains(event.target as Node)) menu.open = false; });
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const menu = openMenus()?.item(0);
      if (!menu) return;
      menu.open = false;
      menu.querySelector('summary')?.focus();
      event.preventDefault();
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const closeAndSelect = (collection: 'all' | 'unclassified' | 'archived' | `project:${string}`) => {
    controller.setArticleCollection(collection);
    onCloseMobile();
  };
  const selectArchive = () => {
    if (controller.selectedArticleCollection === 'archived') setArchivedCollapsed(value => !value);
    else { setArchivedCollapsed(false); closeAndSelect('archived'); }
  };

  const handleCreateProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectName.trim()) return;
    const saved = await controller.createProject(projectName);
    if (saved) {
      setProjectName('');
      setCreatingProject(false);
      onCloseMobile();
    }
  };

  const handleRenameProject = async (event: FormEvent<HTMLFormElement>, project: EditorProject) => {
    event.preventDefault();
    if (!renameValue.trim()) return;
    const saved = await controller.renameProject(project.id, renameValue);
    if (saved) setRenamingProjectId(null);
  };

  const handleArticleDragStart = (event: DragEvent<HTMLDivElement>, article: ArticleSummary) => {
    event.stopPropagation();
    event.dataTransfer.setData(ARTICLE_DRAG, article.id);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleArticleDrop = (event: DragEvent<HTMLDivElement>, projectId: string | null, targetId?: string) => {
    event.preventDefault();
    event.stopPropagation();
    const draggedId = event.dataTransfer.getData(ARTICLE_DRAG);
    const dragged = controller.articleList.find((article) => article.id === draggedId);
    if (!dragged || controller.editorWorkspace.articleOrganization[dragged.id]?.archived) return;
    const sourceProjectId = getArticleOrganization(controller.editorWorkspace, dragged.id).projectId;
    if (sourceProjectId !== projectId) {
      void controller.moveStoredArticleToProject(dragged, projectId);
      return;
    }
    const ordered = orderArticlesForGroup(controller.articleList, controller.editorWorkspace, projectId, false).map((article) => article.id);
    const sourceIndex = ordered.indexOf(dragged.id);
    if (sourceIndex < 0) return;
    ordered.splice(sourceIndex, 1);
    const targetIndex = targetId ? ordered.indexOf(targetId) : 0;
    ordered.splice(targetIndex < 0 ? ordered.length : targetIndex, 0, dragged.id);
    void controller.reorderStoredArticleGroup(projectId, ordered);
  };

  const handleProjectDrop = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData(PROJECT_DRAG);
    if (!sourceId || sourceId === targetId) return;
    const pinned = controller.editorProjectsInDisplayOrder.filter((project) => project.pinned).map((project) => project.id);
    const from = pinned.indexOf(sourceId);
    const to = pinned.indexOf(targetId);
    if (from < 0 || to < 0) return;
    pinned.splice(from, 1);
    pinned.splice(to, 0, sourceId);
    void controller.reorderPinnedProjects(pinned);
  };

  const movePinnedProject = (id: string, direction: -1 | 1) => {
    const pinned = controller.editorProjectsInDisplayOrder.filter((project) => project.pinned).map((project) => project.id);
    const index = pinned.indexOf(id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= pinned.length) return;
    pinned.splice(index, 1);
    pinned.splice(targetIndex, 0, id);
    void controller.reorderPinnedProjects(pinned);
  };

  const renderArticle = (article: ArticleSummary, projectId: string | null, archived: boolean) => (
    <ArticleSidebarRow
      key={article.id}
      article={article}
      projectId={projectId}
      archived={archived}
      current={controller.currentArticleId === article.id && controller.articleMode === 'editor'}
      disabled={controller.editorWorkspaceBusy || controller.mediaOperation !== null || controller.historyBusy}
      onOpen={(item) => { controller.openStoredArticle(item); onCloseMobile(); }}
      onInfo={controller.openArticleInfo}
      onArchive={controller.archiveStoredArticle}
      onFork={controller.beginCopy}
      onDelete={controller.setDeleteTarget}
      onDrop={handleArticleDrop}
      onDragStart={handleArticleDragStart}
    />
  );

  return (
    <>
      <aside ref={sidebarRef} className={collapsed ? 'article-sidebar md:min-w-0 md:w-0 md:border-r-0 md:z-50' : 'article-sidebar'} data-collapsed={collapsed} data-mobile-open={mobileOpen} aria-label="文章列表">
        <header className="article-sidebar-heading">
          <strong className="font-heading">文章</strong>
          <button className="article-sidebar-collapse" type="button" aria-label={collapsed ? '展开文章列表' : '折叠文章列表'} data-tooltip={collapsed ? '展开文章列表' : '折叠文章列表'} onClick={onToggleCollapsed}>
            <CollapseIcon />
          </button>
        </header>
        <div className="article-sidebar-body">
          {!controller.directory ? (
            <div className="article-sidebar-empty">
              <p>{controller.directoryRestoreState === 'checking' ? '正在恢复上次的资料目录…' : controller.rememberedDirectoryName ? '上次的资料目录等待授权，授权后文章会出现在这里。' : '先选择资料目录，文章才会出现在这里。'}</p>
              {controller.directoryRestoreState === 'checking' ? null : <button type="button" onClick={controller.rememberedDirectoryName ? controller.reopenRememberedDirectory : () => controller.navigateView('settings')}>{controller.rememberedDirectoryName ? '授权并打开' : '前往设置'}</button>}
            </div>
          ) : (
            <>
              <section className="article-sidebar-section article-sidebar-section--entry" aria-label="文章入口">
                <button className="article-sidebar-link group/collection hover:bg-hover" type="button" aria-label={`全部文章，共 ${articleCount} 篇文档`} data-active={controller.selectedArticleCollection === 'all'} onClick={() => closeAndSelect('all')}>
                  <CollectionIcon kind="all" /><CollectionLabel name="全部文章" count={articleCount} />
                </button>
                <button className="article-sidebar-link group/collection hover:bg-hover" type="button" aria-label={`归档，共 ${controller.orderedArchivedArticles.length} 篇文档`} aria-expanded={archivedExpanded} aria-controls="archived-article-rows" data-active={controller.selectedArticleCollection === 'archived'} onClick={selectArchive}>
                  <CollectionIcon kind="archived" /><CollectionLabel name="归档" count={controller.orderedArchivedArticles.length} />
                </button>
                <div id="archived-article-rows" hidden={!archivedExpanded}>{archivedExpanded ? controller.orderedArchivedArticles.map(item => renderArticle(item, getArticleOrganization(controller.editorWorkspace, item.id).projectId, true)) : null}</div>
              </section>

              <div className="article-sidebar-divider" aria-hidden="true" />
              <section className="article-sidebar-section" aria-label="项目">
                <div className="article-sidebar-section-label"><span>项目</span><div className="flex items-center gap-1"><details className="project-settings-menu"><summary aria-label="项目管理" data-tooltip="项目管理" className="hover:bg-hover hover:text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg><span>更多</span></summary><div role="group" aria-label="项目管理"><button type="button" disabled={controller.editorWorkspaceBusy} onClick={(event) => { event.currentTarget.closest('details')!.open = false; setCreatingProject(true); requestAnimationFrame(() => newProjectInputRef.current?.focus()); }}>新建项目</button></div></details><button className="article-sidebar-add" type="button" aria-label="新建文稿" data-tooltip="新建文稿" disabled={controller.editorWorkspaceBusy || controller.mediaOperation !== null || controller.historyBusy} onClick={controller.createNewArticle}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg></button></div></div>
                {creatingProject ? <form className="article-project-form" onSubmit={handleCreateProject}>
                  <label htmlFor="new-project-name">新建项目</label>
                  <input ref={newProjectInputRef} id="new-project-name" value={projectName} onChange={event => setProjectName(event.target.value)} maxLength={48} placeholder="项目名称" disabled={controller.editorWorkspaceBusy} />
                  <div><button type="submit" disabled={!projectName.trim() || controller.editorWorkspaceBusy}>保存</button><button type="button" onClick={() => setCreatingProject(false)}>取消</button></div>
                </form> : null}
                {controller.editorProjectsInDisplayOrder.map((project) => {
                  const groupArticles = orderArticlesForGroup(controller.articleList, controller.editorWorkspace, project.id, false);
                  const renaming = renamingProjectId === project.id;
                  return (
                    <div
                      key={project.id}
                      className="article-project"
                      draggable={project.pinned && !controller.editorWorkspaceBusy}
                      onDragStart={(event) => { event.dataTransfer.setData(PROJECT_DRAG, project.id); event.dataTransfer.effectAllowed = 'move'; }}
                      onDragOver={(event) => { if (event.dataTransfer.types.includes(PROJECT_DRAG)) event.preventDefault(); }}
                      onDrop={(event) => handleProjectDrop(event, project.id)}
                    >
                      <div className="article-project-head group/collection">
                        <div className="flex min-h-9 min-w-0 flex-1 items-center rounded-md text-sm font-semibold text-secondary hover:bg-hover">
                          <button className="grid size-9 shrink-0 place-items-center rounded-md text-faint hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent" type="button" aria-label={`${project.collapsed ? '展开' : '折叠'}项目「${project.name}」`} aria-expanded={!project.collapsed} onClick={() => void controller.setProjectCollapsed(project.id, !project.collapsed)}><Chevron expanded={!project.collapsed} /></button>
                          <button className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md pr-3 text-left text-sm font-semibold text-secondary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent data-[active=true]:text-accent-text" type="button" aria-label={`${project.name}，共 ${groupArticles.length} 篇文档`} data-active={controller.selectedArticleCollection === `project:${project.id}`} aria-current={controller.selectedArticleCollection === `project:${project.id}` ? 'page' : undefined} onClick={() => closeAndSelect(`project:${project.id}`)}><CollectionLabel name={project.name} count={groupArticles.length} /></button>
                        </div>
                        <ProjectSettingsMenu
                          project={project}
                          onRename={() => { setRenamingProjectId(project.id); setRenameValue(project.name); requestAnimationFrame(() => renameInputRef.current?.focus()); }}
                          onDelete={() => controller.setProjectDeleteTarget({ id: project.id, name: project.name })}
                          onMoveUp={() => movePinnedProject(project.id, -1)}
                          onMoveDown={() => movePinnedProject(project.id, 1)}
                        />
                        <button className="article-project-pin" type="button" aria-label={project.pinned ? `取消置顶：${project.name}` : `置顶项目：${project.name}`} aria-pressed={project.pinned} data-active={project.pinned} data-tooltip={project.pinned ? '取消置顶' : '置顶项目'} disabled={controller.editorWorkspaceBusy} onClick={() => void controller.setProjectPinned(project.id, !project.pinned)}><PinIcon active={project.pinned} /><span className="article-project-pin-copy">{project.pinned ? '已置顶' : '置顶'}</span></button>
                      </div>
                      {renaming ? (
                        <form className="article-project-form" onSubmit={(event) => void handleRenameProject(event, project)}>
                          <label htmlFor={`rename-project-${project.id}`}>项目名称</label>
                          <input ref={renameInputRef} id={`rename-project-${project.id}`} value={renameValue} onChange={(event) => setRenameValue(event.target.value)} maxLength={48} disabled={controller.editorWorkspaceBusy} />
                          <div><button type="submit" disabled={!renameValue.trim() || controller.editorWorkspaceBusy}>保存</button><button type="button" onClick={() => setRenamingProjectId(null)}>取消</button></div>
                        </form>
                      ) : null}
                      {!project.collapsed ? (
                        <div className="article-project-articles" onDragOver={(event) => { if (event.dataTransfer.types.includes(ARTICLE_DRAG)) event.preventDefault(); }} onDrop={(event) => handleArticleDrop(event, project.id)}>
                          {groupArticles.map((item) => renderArticle(item, project.id, false))}
                          {groupArticles.length === 0 ? <p className="article-project-empty">把文章拖到这里</p> : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </section>

              <section className="article-sidebar-section article-uncategorized" aria-label="未分组">
                <div onDragOver={(event) => { if (event.dataTransfer.types.includes(ARTICLE_DRAG)) event.preventDefault(); }} onDrop={(event) => handleArticleDrop(event, null)}>
                  <div className="article-project-head group/collection">
                    <div className="flex min-h-9 min-w-0 flex-1 items-center rounded-md text-sm font-semibold text-secondary hover:bg-hover">
                      <button className="grid size-9 shrink-0 place-items-center rounded-md text-faint hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent" type="button" aria-label={`${unclassifiedCollapsed ? '展开' : '折叠'}未分组`} aria-expanded={!unclassifiedCollapsed} aria-controls="unclassified-article-rows" onClick={toggleUnclassified}><Chevron expanded={!unclassifiedCollapsed} /></button>
                      <button className="article-uncategorized-heading flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md pr-3 text-left text-sm hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent data-[active=true]:text-accent-text" type="button" aria-label={`未分组，共 ${controller.orderedUnclassifiedArticles.length} 篇文档`} data-active={controller.selectedArticleCollection === 'unclassified'} aria-current={controller.selectedArticleCollection === 'unclassified' ? 'page' : undefined} onClick={() => closeAndSelect('unclassified')}><CollectionLabel name="未分组" count={controller.orderedUnclassifiedArticles.length} /></button>
                    </div>
                  </div>
                  {!unclassifiedCollapsed ? <div id="unclassified-article-rows">{controller.orderedUnclassifiedArticles.map((item) => renderArticle(item, null, false))}</div> : null}
                </div>
              </section>
            </>
          )}
        </div>
      </aside>
      {mobileOpen ? <button className="article-sidebar-backdrop" type="button" aria-label="关闭文章导航" onClick={onCloseMobile} /> : null}
    </>
  );
}
