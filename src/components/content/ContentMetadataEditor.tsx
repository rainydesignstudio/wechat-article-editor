'use client';

import type { ArticleMeta, ArticleSnippet, SnippetCategory, SnippetCategoryIcon } from '../../lib/types';
import { isSnippetCategoryIcon } from '../../lib/snippetCategoryIcons';
import { CategoryIcon, IconSelectionFieldset } from './SnippetCategoryDialog';

export type TemplateMetadataInputs = Partial<Record<'title' | 'description' | 'author' | 'categories', string>>;

export function ContentMetadataEditor({ snippet, metadata, inputs, fileId, fileError, creating, creationSavesContent = false, categoryId, categories, onCategoryChange, disabled, invalid, onFileIdChange, onSnippetChange, onMetadataChange, onTemplateIconChange }: {
  snippet?: ArticleSnippet; metadata?: ArticleMeta; inputs?: TemplateMetadataInputs;
  fileId: string; fileError?: string; creating: boolean; creationSavesContent?: boolean; onFileIdChange: (value: string) => void;
  categoryId?: string; onCategoryChange: (id: string | undefined) => void;
  categories: SnippetCategory[]; disabled: boolean; invalid: boolean;
  onSnippetChange: (patch: Partial<ArticleSnippet>) => void;
  onMetadataChange: (field: keyof TemplateMetadataInputs, value: string) => void;
  onTemplateIconChange: (icon: SnippetCategoryIcon) => void;
}) {
  const rawTemplateIcon = metadata?.templateIcon;
  const templateIcon = isSnippetCategoryIcon(rawTemplateIcon) ? rawTemplateIcon : 'document';
  const fileField = <div className="grid min-w-0 gap-1.5">
        <label className="min-w-0" htmlFor="content-file-name"><span className="field-label">文件名</span></label>
        <div className="flex min-w-0 items-center gap-2">
          <input id="content-file-name" name="content-file-name" className="field min-w-0 flex-1 font-mono text-xs" value={fileId} maxLength={48} pattern="[a-z0-9](?:[a-z0-9]|-){0,47}" placeholder={snippet ? 'my-snippet' : 'my-template'} required autoComplete="off" spellCheck={false} disabled={disabled} aria-invalid={Boolean(fileError)} aria-describedby="content-file-help" onChange={event => onFileIdChange(event.target.value)} />
          <span className="shrink-0 font-mono text-xs text-faint">{snippet ? '.json' : '.md'}</span>
        </div>
        <p id="content-file-help" className="text-xs text-muted">小写字母、数字和连字符，最多 48 字符；无需填写扩展名。{creating ? creationSavesContent ? '创建模板时写入文件。' : '首次保存内容时创建文件。' : '保存信息时同步修改文件名。'}</p>
        {fileError ? <p className="text-xs text-danger" role="alert">{fileError}</p> : null}
      </div>;
  if (snippet) return <div className="grid min-w-0 gap-6 md:grid-cols-5">
    <div className="grid min-w-0 content-start gap-4 md:col-span-3">
      <p className="text-sm text-muted">名称、分类和触发词帮助你找到并插入这段内容。</p>
      {fileField}
      <label className="field-stack min-w-0"><span className="field-label">名称</span><input name="snippet-name" className="field" value={snippet.name} maxLength={80} onChange={event => onSnippetChange({ name: event.target.value })} disabled={disabled} required /></label>
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <label className="field-stack min-w-0"><span className="field-label">分类</span><select name="snippet-category" className="field" value={categoryId ?? ''} onChange={event => onCategoryChange(event.target.value || undefined)} disabled={disabled}><option value="" disabled={Boolean(categoryId)}>请选择分类</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label className="field-stack min-w-0"><span className="field-label">触发词</span><input name="snippet-trigger" className="field font-mono text-xs" value={snippet.trigger} placeholder="//my-snippet" onChange={event => onSnippetChange({ trigger: event.target.value })} spellCheck={false} disabled={disabled} required /></label>
      </div>
    </div>
    <aside className="min-w-0 md:col-span-2 md:border-l md:border-line md:pl-6">
      <IconSelectionFieldset name="snippet-icon" label="片段图标" hint="用于片段列表和编辑器的插入菜单。" value={snippet.icon ?? 'snippet'} disabled={disabled} previewLabel="默认预览" onChange={icon => onSnippetChange({ icon })}>
        <div className="flex min-w-0 items-center gap-2 rounded-lg border border-line bg-list/50 p-3 text-sm font-semibold text-primary" aria-label="片段列表默认预览">
          <CategoryIcon name={snippet.icon} /><span className="min-w-0 truncate">{snippet.name.trim() || '未命名片段'}</span>
        </div>
      </IconSelectionFieldset>
    </aside>
    <label className="field-stack min-w-0 md:col-span-5"><span className="field-label">说明</span><textarea name="snippet-description" className="field min-h-24 resize-y" value={snippet.description} maxLength={240} placeholder="说明这段内容的用途。" onChange={event => onSnippetChange({ description: event.target.value })} disabled={disabled} /></label>
    {creating ? <p className="text-xs text-muted md:col-span-5">确认信息后继续编辑正文；点击“保存内容”时，文件名、信息与正文一起保存。</p> : null}
  </div>;
  if (!metadata) return null;
  return <div className="grid min-w-0 gap-6 md:grid-cols-5">
    <div className="grid min-w-0 content-start gap-4 md:col-span-3">
      {fileField}
      <label className="field-stack min-w-0"><span className="field-label">标题</span><input name="template-title" className="field" value={inputs?.title ?? metadata.title} onChange={event => onMetadataChange('title', event.target.value)} disabled={disabled || invalid} /></label>
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <label className="field-stack min-w-0"><span className="field-label">模板分类</span><select name="template-category" className="field" value={categoryId ?? ''} onChange={event => onCategoryChange(event.target.value || undefined)} disabled={disabled}><option value="" disabled={Boolean(categoryId)}>请选择分类</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label className="field-stack min-w-0"><span className="field-label">作者</span><input name="template-author" className="field" value={inputs?.author ?? metadata.author} onChange={event => onMetadataChange('author', event.target.value)} disabled={disabled || invalid} /></label>
      </div>
      <label className="field-stack min-w-0"><span className="field-label">文章分类</span><input name="template-categories" className="field" value={inputs?.categories ?? metadata.categories.join(', ')} placeholder="多个分类用逗号分隔" onChange={event => onMetadataChange('categories', event.target.value)} disabled={disabled || invalid} /></label>
    </div>
    <aside className="min-w-0 md:col-span-2 md:border-l md:border-line md:pl-6">
      <IconSelectionFieldset name="template-icon" label="起稿模板图标" hint="用于模板列表和选择起稿方式。" value={templateIcon} disabled={disabled || invalid} previewLabel="默认预览" onChange={onTemplateIconChange}>
        <div className="flex min-w-0 items-center gap-2 rounded-lg border border-line bg-list/50 p-3 text-sm font-semibold text-primary" aria-label="起稿模板列表默认预览">
          <CategoryIcon name={templateIcon} /><span className="min-w-0 truncate">{(inputs?.title ?? metadata.title).trim() || '未命名起稿模板'}</span>
        </div>
      </IconSelectionFieldset>
    </aside>
    <label className="field-stack min-w-0 md:col-span-5"><span className="field-label">摘要</span><textarea name="template-description" className="field min-h-24 resize-y" value={inputs?.description ?? metadata.description} placeholder="说明这份起稿结构的用途。" onChange={event => onMetadataChange('description', event.target.value)} disabled={disabled || invalid} /></label>
    {creating ? <p className="text-xs text-muted md:col-span-5">{creationSavesContent ? '创建时将当前正文与以上信息一起写入模板文件；当前文章保持不变。' : '确认信息后继续编辑正文；点击“保存内容”时，文件名、信息与正文一起保存。'}</p> : null}
  </div>;
}
