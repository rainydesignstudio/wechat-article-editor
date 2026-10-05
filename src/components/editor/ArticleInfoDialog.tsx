'use client';

import type { FormEvent } from 'react';
import type { EditorWorkspace } from '../../lib/editorWorkspace';
import type { WorkingArticle, ArticleSummary } from '../../lib/types';
import type { parseArticle } from '../../lib/frontMatter';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from '../global/DialogFrame';
import { InformationButton, InformationIcon } from '../global/InformationButton';

type Props = {
  article: WorkingArticle; parsed: ReturnType<typeof parseArticle>; stored: ArticleSummary | null;
  workspace: EditorWorkspace; archived: boolean; busy: boolean;
  onClose: () => void; onChangeField: (field: 'title' | 'description' | 'author' | 'categories', value: string) => void;
  onOpenTheme: () => void; onChangeProject: (projectId: string | null) => void;
  onOpenHistory: () => void;
  onSave: () => void; onDelete: () => void; onUnarchive: () => void;
};

export function ArticleInfoDialog({ article, parsed, stored, workspace, archived, busy, onClose, onChangeField, onOpenTheme, onChangeProject, onOpenHistory, onSave, onDelete, onUnarchive }: Props) {
  const invalid = parsed.diagnostics.some(item => item.level === 'error');
  const readOnly = archived || busy;
  const disabled = readOnly || invalid;
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); onClose(); };
  return <DialogFrame className="flex min-h-0 max-w-5xl flex-col overflow-hidden" titleId="article-info-title" descriptionId="article-info-description" onClose={onClose} dismissible={!busy}>
    <DialogHeader titleId="article-info-title" eyebrow="MANUSCRIPT DETAILS" title="文稿信息" onClose={onClose} closeDisabled={busy} />
    <form id="article-info-form" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent" onSubmit={handleSubmit}>
      <div className="mb-5 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-list/50 p-4">
        <div className="flex min-w-0 items-center gap-3"><span className="information-badge"><InformationIcon /></span><div className="min-w-0"><strong className="block font-mono text-xs font-semibold text-primary">{stored ? 'article.md' : '未保存文稿'}</strong><p className="mt-1 break-all font-mono text-xs text-muted">{stored?.filePath ?? '保存后写入资料目录'}</p></div></div>
        <span className="shrink-0 rounded-md bg-panel px-2.5 py-1.5 text-xs text-muted" role="status">{archived ? '已归档' : article.dirty ? '有未保存修改' : '已保存'}</span>
      </div>
      <p id="article-info-description" className="mb-4 shrink-0 text-xs text-faint">信息修改会同步到当前文稿，保存文章后写入资料目录。</p>
      {archived || invalid || !article.themeValid ? <p className="mb-4 shrink-0 rounded-lg border border-warning-line bg-warning-surface p-4 text-sm text-warning-strong" role="status">{archived ? '文章已归档，取消归档后可以编辑。' : invalid ? '元数据有误，请先处理诊断再修改字段。' : '主题快照需要修复，当前原稿保持不变。'}</p> : null}
      <div className="grid min-w-0 shrink-0 items-start gap-5 md:grid-cols-3">
        <section className="min-w-0 rounded-lg border border-line bg-list/50 p-4 md:col-span-2" aria-labelledby="article-fields-heading">
          <h3 id="article-fields-heading" className="mb-4 font-sub-heading text-sm font-semibold text-primary">基本信息</h3>
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <label className="field-stack min-w-0 md:col-span-2"><span className="field-label">文章标题</span><input name="article-title" className="field" value={parsed.metadata.title} onChange={event => onChangeField('title', event.target.value)} disabled={disabled} /></label>
            <label className="field-stack min-w-0 md:col-span-2"><span className="field-label">摘要</span><textarea name="article-description" className="field min-h-32" value={parsed.metadata.description} onChange={event => onChangeField('description', event.target.value)} disabled={disabled} placeholder="简要说明这篇文章的内容" /></label>
            <label className="field-stack min-w-0"><span className="field-label">作者</span><input name="article-author" className="field" value={parsed.metadata.author} onChange={event => onChangeField('author', event.target.value)} disabled={disabled} /></label>
            <label className="field-stack min-w-0"><span className="field-label">文章分类</span><input name="article-categories" className="field" value={parsed.metadata.categories.join(', ')} onChange={event => onChangeField('categories', event.target.value)} disabled={disabled} placeholder="用逗号分隔多个分类" /></label>
          </div>
        </section>
        <div className="grid min-w-0 content-start gap-4">
          <section className="grid min-w-0 gap-4 rounded-lg border border-line bg-list/50 p-4" aria-labelledby="article-location-heading">
            <h3 id="article-location-heading" className="font-sub-heading text-sm font-semibold text-primary">排版与归属</h3>
            <InformationButton icon={<InformationIcon book />} title={article.theme.name} subtitle={`v${article.theme.version} · 选择主题`} onClick={onOpenTheme} disabled={busy} />
            <label className="field-stack"><span className="field-label">所属项目</span><select name="article-project" className="field" value={stored ? workspace.articleOrganization[stored.id]?.projectId ?? '' : ''} onChange={event => onChangeProject(event.target.value || null)} disabled={readOnly || !stored}><option value="">未分组</option>{workspace.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          </section>
          <section className="grid min-w-0 gap-3 rounded-lg border border-line bg-list/50 p-4" aria-labelledby="article-manage-heading">
            <h3 id="article-manage-heading" className="font-sub-heading text-sm font-semibold text-primary">文稿管理</h3>
            <button className="button button-quiet justify-start" type="button" disabled={!stored || busy} onClick={onOpenHistory}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 11a9 9 0 1 1 3 8M3 4v7h7M12 7v5l3 2" /></svg>查看历史版本</button>
            {archived ? <button className="button button-quiet justify-start" type="button" disabled={busy} onClick={onUnarchive}>取消归档</button> : null}
            {stored ? <button className="button button-danger justify-start" type="button" disabled={busy} onClick={onDelete}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6" /></svg>删除文章</button> : null}
          </section>
        </div>
      </div>
    </form>
    <DialogFooter><DialogActions><DialogButton onClick={onClose} disabled={busy}>返回编辑</DialogButton><DialogButton variant="primary" disabled={!article.dirty || readOnly || invalid} onClick={onSave}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 3h14l3 3v15H3V3ZM7 3v6h10V3M7 21v-8h10v8" /></svg>保存文章</DialogButton></DialogActions></DialogFooter>
  </DialogFrame>;
}
