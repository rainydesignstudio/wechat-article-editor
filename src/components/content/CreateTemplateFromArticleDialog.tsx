'use client';

import { useRef, useState } from 'react';
import { isContentFileId, saveArticleTemplate } from '../../lib/contentLibraries';
import { parseArticle, updateFrontMatter } from '../../lib/frontMatter';
import { articleFormatMessage } from '../../lib/articleFormat';
import { validateContentSource, type ContentValidationResult } from '../../lib/contentValidation';
import type { ArticleTemplate, SnippetCategory, SnippetCategoryIcon } from '../../lib/types';
import { ContentMetadataDialog } from './ContentMetadataDialog';
import { ContentMetadataEditor, type TemplateMetadataInputs } from './ContentMetadataEditor';

export function CreateTemplateFromArticleDialog({ source, dirty, root, categories, templates, isCurrent, onCreated, onClose }: {
  source: string;
  dirty: boolean;
  root: FileSystemDirectoryHandle;
  categories: SnippetCategory[];
  templates: ArticleTemplate[];
  isCurrent: () => boolean;
  onCreated: (template: ArticleTemplate, formatIssueCount: number, hasLocalMedia: boolean) => void;
  onClose: () => void;
}) {
  const [fileId, setFileId] = useState(() => `template-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)}`);
  const [templateSource, setTemplateSource] = useState(() => {
    const now = new Date().toISOString();
    return updateFrontMatter(source, { createdAt: now, updatedAt: now, templateIcon: 'document' });
  });
  const initial = parseArticle(source).metadata;
  const [inputs, setInputs] = useState<TemplateMetadataInputs>(() => ({ title: initial.title, author: initial.author, description: initial.description, categories: initial.categories.join(', ') }));
  const [categoryId, setCategoryId] = useState<string | undefined>(() => categories[0]?.id);
  const [busy, setBusy] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<{ signature: string; result: ContentValidationResult } | null>(null);
  const [error, setError] = useState('');
  const savingRef = useRef(false);
  const parsed = parseArticle(templateSource);
  const invalid = parsed.diagnostics.some(item => item.level === 'error');
  const hasLocalMedia = /(?:^|[\s('"=])(?:\.\/)?media\//m.test(parsed.body);
  const fileError = !fileId || !isContentFileId(fileId)
    ? '文件名须由小写字母、数字和连字符组成，最多 48 字符。'
    : templates.some(template => template.id === fileId) ? '此文件名已存在，请换一个名称。' : '';
  const signature = JSON.stringify([fileId, categoryId, templateSource]);
  const validated = validation?.signature === signature && !validation.result.errors.length;
  const changeField = (field: keyof TemplateMetadataInputs, value: string) => {
    setInputs(previous => ({ ...previous, [field]: value }));
    const patch = field === 'categories' ? { categories: value.split(/[,，]/).map(item => item.trim()).filter(Boolean) } : { [field]: value };
    setTemplateSource(previous => updateFrontMatter(previous, patch));
  };
  const validate = async (): Promise<boolean> => {
    if (savingRef.current || fileError || !categoryId || invalid || !isCurrent()) return false;
    savingRef.current = true; setBusy(true); setValidating(true); setValidation(null); setError('');
    try {
      const result = await validateContentSource('templates', templateSource);
      if (!isCurrent()) return false;
      setValidation({ signature, result });
      if (result.errors.length) setError(`校验失败，尚未创建。${result.errors.join('；')}`);
      return !result.errors.length;
    } catch (cause) {
      if (isCurrent()) setError(`校验失败：${cause instanceof Error ? cause.message : String(cause)}`);
      return false;
    } finally {
      savingRef.current = false;
      if (isCurrent()) { setBusy(false); setValidating(false); }
    }
  };
  const save = async (validateFirst = false) => {
    if (savingRef.current || fileError || !categoryId || invalid || !isCurrent()) return;
    if (!validated) { const passed = await validate(); if (!validateFirst || !passed || !isCurrent()) return; }
    savingRef.current = true;
    setBusy(true);
    setError('');
    let formatIssueCount = 0;
    let completed = false;
    try {
      const template = await saveArticleTemplate(root, fileId, templateSource, null, categoryId, issues => { formatIssueCount = issues.length; });
      completed = true;
      if (isCurrent()) onCreated(template, formatIssueCount, hasLocalMedia);
      else onClose();
    } catch (cause) {
      if (isCurrent()) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      savingRef.current = false;
      if (!completed && isCurrent()) setBusy(false);
    }
  };
  return <ContentMetadataDialog kind="templates" creating busy={busy} validating={validating} onValidate={() => validate()} validationDisabled={Boolean(fileError || !categoryId || invalid || !isCurrent())} saveDisabled={Boolean(fileError || !categoryId || invalid || !isCurrent() || !validated)} submitLabel="创建模板" shortcutEnabled onShortcut={() => save(true)} error={error} status={validated ? validation.result.issues.length ? `校验通过；${validation.result.issues.length} 项格式仍需核对。${articleFormatMessage(validation.result.issues)}` : '校验通过；可创建起稿模板。' : undefined} statusTone={validation?.result.issues.length ? 'warning' : 'success'} onClose={onClose} onSave={() => void save()}>
    <div className="grid gap-4">
      <p className="rounded-lg border border-line bg-list/50 p-4 text-sm text-muted">取用当前编辑稿的完整正文{dirty ? '，包括未保存修改' : ''}；创建模板不会改动当前文章。</p>
      {hasLocalMedia ? <p className="rounded-lg border border-warning-line bg-warning-surface p-4 text-sm text-warning-strong" role="status">当前正文引用本地媒体。模板库只保存正文与引用，不复制媒体文件；以后用此模板起稿时，需要重新导入这些文件。</p> : null}
      {!categories.length ? <p className="rounded-lg border border-warning-line bg-warning-surface p-4 text-sm text-warning-strong" role="status">资料库还没有模板分类；请先到模板库创建分类。</p> : null}
      {invalid ? <p className="rounded-lg border border-warning-line bg-warning-surface p-4 text-sm text-warning-strong" role="status">当前文稿元数据有误，请先修复后再创建模板。</p> : null}
      <ContentMetadataEditor fileId={fileId} fileError={fileError} creating creationSavesContent onFileIdChange={setFileId} metadata={parsed.metadata} inputs={inputs} categories={categories} categoryId={categoryId} onCategoryChange={setCategoryId} disabled={busy} invalid={invalid} onSnippetChange={() => {}} onMetadataChange={changeField} onTemplateIconChange={(icon: SnippetCategoryIcon) => setTemplateSource(previous => updateFrontMatter(previous, { templateIcon: icon }))} />
    </div>
  </ContentMetadataDialog>;
}
