'use client';

import { useState } from 'react';
import { parseArticle } from '../../lib/frontMatter';
import type { ArticleTemplate, SnippetCategory, ThemeConfig } from '../../lib/types';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from '../global/DialogFrame';
import { CollapsiblePanel, PanelHeading } from '../global/CollapsiblePanel';
import { PreviewModeSwitch } from '../editor/PreviewModeSwitch';
import { useArticlePreviewMode } from '../../hooks/useArticlePreviewMode';
import { ContentRenderPreview } from './ContentRenderPreview';
import { ArticleThemeSelect } from '../themes/ArticleThemeSelect';
import { CategoryIcon } from './SnippetCategoryDialog';
import { TemplateArticleCategoryTags } from './TemplateArticleCategoryTags';

function DocumentIcon() {
  return <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 3h9l5 5v13H5V3ZM14 3v5h5M9 12h6M9 16h6" /></svg>;
}

export function TemplateDialog({ templates, categories, themes, defaultTheme, onClose, onCreate }: {
  templates: ArticleTemplate[];
  categories: SnippetCategory[];
  themes: readonly ThemeConfig[];
  defaultTheme: ThemeConfig;
  onClose: () => void;
  onCreate: (template: ArticleTemplate | null, theme: ThemeConfig) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const { dark, toggle } = useArticlePreviewMode();
  const usableTemplates = templates.filter(template => !parseArticle(template.source).diagnostics.some(item => item.level === 'error'));
  const selected = usableTemplates.find(template => template.id === selectedId) ?? null;
  const previewTheme = themes.find(theme => theme.id === selectedThemeId) ?? defaultTheme;
  const uncategorized = usableTemplates.filter(template => !categories.some(category => category.id === template.categoryId));
  const title = selected?.name ?? '空白文章';
  const description = selected ? parseArticle(selected.source).metadata.description || '保留模板的正文结构，以所选主题开始新稿。' : '从空白开始，创建后写下你的第一句话。';
  const source = selected ? parseArticle(selected.source).body : '# 文章标题\n\n从这里写下第一句话。';
  const renderTemplate = (template: ArticleTemplate) => <PanelHeading key={template.id} title={template.name} icon={<CategoryIcon name={template.icon ?? 'document'} />} aria-pressed={selected?.id === template.id} onClick={() => setSelectedId(template.id)} className="flex-col items-stretch gap-1.5 rounded-lg aria-pressed:bg-accent-soft aria-pressed:text-accent-text" details={<TemplateArticleCategoryTags categories={parseArticle(template.source).metadata.categories} />} />;
  return <DialogFrame large titleId="template-dialog-title" descriptionId="template-dialog-description" onClose={onClose}>
    <DialogHeader titleId="template-dialog-title" eyebrow="NEW MANUSCRIPT" title="选择起稿方式" onClose={onClose} />
    <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
      <aside className="flex min-h-0 min-w-0 shrink-0 flex-col border-b border-line bg-list/50 md:w-72 md:border-r md:border-b-0" aria-label="起稿方式">
        <div className="max-h-56 min-h-0 overflow-x-clip overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent md:max-h-none md:flex-1">
          <p className="px-4 py-3 text-xs text-faint">选择结构和主题，预览新稿的排版。</p>
          <div className="grid gap-2">
            <PanelHeading title="空白文章" icon={<DocumentIcon />} aria-pressed={!selected} onClick={() => setSelectedId(null)} className="rounded-lg aria-pressed:bg-accent-soft aria-pressed:text-accent-text" />
            {categories.map(category => {
              const grouped = usableTemplates.filter(template => template.categoryId === category.id);
              const open = Boolean(expandedCategories[category.id]);
              return <CollapsiblePanel key={category.id} id={`new-article-category-${category.id}`} title={category.name} icon={<CategoryIcon name={category.icon} />} count={grouped.length} open={open} onToggle={() => setExpandedCategories(previous => ({ ...previous, [category.id]: !previous[category.id] }))} className="shrink-0" contentClassName="px-2 pb-2">
                <div className="grid gap-1">{grouped.map(renderTemplate)}{!grouped.length ? <p className="px-3 py-3 text-xs text-faint">此分类还没有可用模板。</p> : null}</div>
              </CollapsiblePanel>;
            })}
            {uncategorized.length ? <CollapsiblePanel id="new-article-category-unclassified" title="未分类" icon={<DocumentIcon />} count={uncategorized.length} open={expandedCategories.unclassified ?? !categories.length} onToggle={() => setExpandedCategories(previous => ({ ...previous, unclassified: !(previous.unclassified ?? !categories.length) }))} className="shrink-0" contentClassName="px-2 pb-2"><div className="grid gap-1">{uncategorized.map(renderTemplate)}</div></CollapsiblePanel> : null}
          </div>
          {!usableTemplates.length ? <p className="px-4 py-3 text-xs text-muted">没有可用模板，可先创建空白文章。</p> : null}
        </div>
        <p id="template-dialog-description" className="shrink-0 border-t border-line p-4 text-xs text-muted">新稿使用右侧选中的主题与新的日期；原模板和已有文章保留。</p>
      </aside>
      <section className="flex min-h-60 min-w-0 flex-1 flex-col gap-4 p-4 md:min-h-0" aria-label="起稿排版预览">
        <header className="flex shrink-0 flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-sub-heading text-base font-semibold text-primary">{title}</h3><p className="mt-1 text-xs text-muted">{description}</p></div><div className="flex min-w-0 flex-wrap items-center gap-3"><ArticleThemeSelect themes={themes} value={previewTheme.id} onChange={setSelectedThemeId} /><PreviewModeSwitch dark={dark} onToggle={toggle} /></div></header>
        <ContentRenderPreview key={`${selected?.id ?? 'blank'}:${previewTheme.id}:${previewTheme.version}`} theme={previewTheme} source={source} dark={dark} fill bare />
        <p className="shrink-0 text-xs text-faint">{selected ? `创建时采用「${previewTheme.name}」；模板原文件保持不变。` : '空白稿中的示意文字仅用于排版预览。'}</p>
      </section>
    </div>
    <DialogFooter><DialogActions><DialogButton onClick={onClose}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 6 12 12M18 6 6 18" /></svg>取消</DialogButton><DialogButton variant="primary" onClick={() => onCreate(selected, previewTheme)}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 5v14M5 12h14" /></svg>创建文章</DialogButton></DialogActions></DialogFooter>
  </DialogFrame>;
}
