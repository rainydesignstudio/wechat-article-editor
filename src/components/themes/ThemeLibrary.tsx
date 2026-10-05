'use client';

import { useFormatSnapshot } from '../../hooks/useFormatSnapshot';
import { articlePreviewStyle, previewSurfaceStyle } from '../../lib/article-format/preview';
import { SnippetTextarea } from '../content/SnippetTextarea';
import { validateContentSource } from '../../lib/contentValidation';
import { getFormatSnapshot } from '../../lib/article-format/runtime';
import { PageHeading } from '../global/PageHeading';

import { useResizableColumns } from '../../hooks/useResizableColumns';
import { ColumnSplitter } from '../global/ColumnSplitter';
import { ButtonBar } from '../global/ButtonBar';
import { CollapsiblePanel, PanelIcon } from '../global/CollapsiblePanel';
import { UnsavedChangesDialog } from '../global/UnsavedChangesDialog';
import { DialogActions, DialogButton, DialogFrame, DialogHeader } from '../global/DialogFrame';
import { PreviewModeSwitch } from '../editor/PreviewModeSwitch';
import { useArticlePreviewMode } from '../../hooks/useArticlePreviewMode';
import { articleDarkPreviewDocument, cloneArticleForDarkPreview, observeArticlePreview } from '../../lib/articleDarkPreview';
import { EditorColorPicker } from '../settings/EditorColorPicker';
import { ArticleThemeFields } from './ArticleThemeFields';
import { tailwindColorToHex } from '../../lib/tailwindPalette';
import type { EditorTheme } from '../../lib/editorThemes';
import { copyDefaultThemes } from '../../lib/themeDefaults';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  deleteThemeLibraryTheme,
  loadThemeLibrary,
  saveThemeLibraryTheme,
  type ThemeLibraryIssue,
} from '../../lib/fileSystem';
import { refreshRootSession } from '../../lib/rootSession';
import { BASIC_THEME, resolveDefaultArticleTheme, themePreviewCss } from '../../lib/themes';
import { parseThemeConfigJson, validateThemeConfig, validateThemeCss, validateThemeFormat } from '../../lib/themeValidation';
import type { ThemeConfig, ThemeNodeKey } from '../../lib/types';
import { MarkdownPreview } from '../editor/MarkdownPreview';
import { ARTICLE_EXAMPLE_IMAGE } from '../../lib/articleExamples';
import { getArticleNodeSelectors, createArticleColorInspection, type ColorBinding } from '../../lib/themeInspection';
import { ThemeInspectionPreview, useThemeInspection, type ThemeInspection } from '../global/ThemeInspection';
import { compileArticleStyles, compileThemeInspectionUtilities } from '../../lib/tailwind';

const STYLEBOOK_SAMPLE = `# 一页文章的开场

这是一段导语。主题样式会作用在真实排版节点上：**重点句**、[普通链接](#把信息说清楚)、删除线 ~~旧说法~~，以及脚注 <sup>1</sup>。

<section style="background:var(--color-article-quote-surface);border:1px solid var(--color-article-line);border-radius:8px;padding:16px;margin:24px 0;">
  <p style="color:var(--color-article-heading);font-weight:700;margin:0 0 8px;">阅读提示 <span style="color:var(--color-article-accent);">· 重点</span></p>
  <section style="background:var(--color-article-tint);border-radius:4px;padding:12px;">
    <p style="color:var(--color-article-ink);margin:0;">正文需要清楚易读。<a href="#把信息说清楚" style="color:var(--color-article-heading);">继续阅读</a>，或记下 <code style="color:var(--color-article-code);background:var(--color-article-code-tint);">theme.title</code>。</p>
    <p style="color:var(--color-article-muted);margin:8px 0 0;font-size:0.875em;">注释补充信息，引用浅底帮助区分阅读区域。</p>
  </section>
  <pre style="background:var(--color-article-code-surface);color:var(--color-article-code-tint);margin:12px 0 0;padding:12px;"><code style="color:inherit;background:transparent;padding:0;">const title = '排印样本';</code></pre>
</section>

## 把信息说清楚

### 小标题与段落

段落用来承接上下文。这里放一段稍长的文字，观察行宽、行高和留白是否适合连续阅读，而不只看一张颜色卡片。

#### 继续拆分

##### 更细的层级

###### 末级标题

> 引用适合承载采访原话或需要特别强调的一段内容。层级、底色和左侧标记都应清楚但不过分抢眼。

- 第一条列表信息
- 第二条列表信息

1. 先交代背景
2. 再给出结论

- [x] 已完成的事项
- [ ] 尚待确认的事项

正文里也会出现 \`行内代码\`。

\`\`\`ts
const article = { title: '排印样本', saved: false };
console.log(article.title);
\`\`\`

| 信息 | 示例 | 状态 |
| --- | --- | --- |
| 标题 | 层级清楚 | 可读 |
| 正文 | 行宽适中 | 连贯 |

<figure><img src="${ARTICLE_EXAMPLE_IMAGE}" alt="Rainy Design 示例图片" /><figcaption>图注在图片下方，作为文章内容的一部分。</figcaption></figure>

---

注脚：这里检查小号注释的阅读感。`;

type ThemeLibraryProps = {
  root: FileSystemDirectoryHandle | null;
  themes: ThemeConfig[];
  editorThemes?: readonly EditorTheme[];
  issues: ThemeLibraryIssue[];
  currentTheme: ThemeConfig;
  defaultThemeId: string | null;
  currentArticleSaved: boolean;
  canApply: boolean;
  isRootCurrent: (root: FileSystemDirectoryHandle) => boolean;
  onLibraryChange: (root: FileSystemDirectoryHandle, themes: ThemeConfig[], issues: ThemeLibraryIssue[]) => void;
  onApply: (theme: ThemeConfig) => void;
  onSetDefault: (themeId: string, root: FileSystemDirectoryHandle) => Promise<void>;
};

function cloneTheme(theme: ThemeConfig): ThemeConfig {
  return JSON.parse(JSON.stringify(theme)) as ThemeConfig;
}

function uniqueThemeId(base: string, themes: ThemeConfig[]): string {
  const taken = new Set(themes.map((theme) => theme.id));
  const safeBase = base.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'imported-theme';
  if (!taken.has(safeBase)) return safeBase;
  let index = 2;
  while (taken.has(`${safeBase}-${index}`)) index += 1;
  return `${safeBase}-${index}`;
}

function ThemeIcon({ name }: { name: 'book' | 'upload' | 'plus' | 'edit' | 'apply' | 'info' | 'check' | 'save' | 'delete' | 'copy' | 'close' | 'code' | 'reset' }) {
  const paths = {
    book: 'M12 5c-3-2-7-2-10-1v15c3-1 7-1 10 1m0-15c3-2 7-2 10-1v15c-3-1-7-1-10 1V5Z',
    upload: 'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',
    plus: 'M12 5v14M5 12h14',
    edit: 'm4 16 12-12 4 4L8 20H4v-4Zm10-10 4 4',
    apply: 'M4 7h10m-4-4 4 4-4 4M4 13v7h16V7h-2',
    info: 'M12 11v6M12 7h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    check: 'm4 12 5 5L20 6',
    save: 'M4 4h13l3 3v13H4V4ZM8 4v6h8V4M8 20v-6h8v6',
    delete: 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
    copy: 'M8 8h12v12H8V8ZM4 16V4h12',
    close: 'm6 6 12 12M18 6 6 18',
    code: 'm8 6-6 6 6 6m8-12 6 6-6 6',
    reset: 'M4 10a8 8 0 1 1 1 8M4 4v6h6',
  };
  return <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

export function ThemePreview({ theme, source = STYLEBOOK_SAMPLE, className = 'theme-stylebook-reader', framed = false, dark = false, inspection, onLocate, onNodeColors }: { theme: ThemeConfig; source?: string; className?: string; framed?: boolean; dark?: boolean; inspection?: ThemeInspection; onLocate?: (binding: ColorBinding) => void; onNodeColors?: (colors: Partial<Record<ThemeNodeKey, string>>) => void }) {
  const formatSnapshot = useFormatSnapshot();
  const reactId = useId();
  const instanceScope = Array.from(reactId, character => character.codePointAt(0)!.toString(36)).join('-');
  const scopeClass = `theme-preview-instance-${instanceScope}`;
  const traceCss = themePreviewCss(theme, instanceScope);
  const articleRef = useRef<HTMLElement | null>(null);
  const lightHostRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const lastSnapshotRef = useRef('');
  const [darkDocument, setDarkDocument] = useState('');
  const [failed, setFailed] = useState(false);
  const [lightTarget, setLightTarget] = useState<HTMLElement | null>(null);
  const [compiledCss, setCompiledCss] = useState('');
  const [compileError, setCompileError] = useState('');
  const provenanceRef = useRef<ReturnType<typeof createArticleColorInspection> | null>(null);
  const [inspectionRevision, setInspectionRevision] = useState(0);
  const utilitiesRef = useRef('');
  const articleCss = articlePreviewStyle(`${compiledCss}\narticle.article-preview { min-height: 100%; min-width: 0; width: 100%; }`);
  useLayoutEffect(() => {
    const host = lightHostRef.current;
    if (!host) return;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    let mount = shadow.querySelector<HTMLElement>('[data-theme-preview]');
    if (!mount) { mount = document.createElement('div'); mount.dataset.themePreview = ''; shadow.append(mount); }
    setLightTarget(mount);
  }, []);
  useEffect(() => {
    let active = true;
    setCompiledCss(''); setCompileError('');
    void compileArticleStyles(source, theme).then(({ css }) => {
      if (active) setCompiledCss(css);
    }).catch((error: unknown) => {
      if (active) setCompileError(error instanceof Error ? error.message : String(error));
    });
    return () => { active = false; };
  }, [source, theme, formatSnapshot.id]);
  useEffect(() => {
    const article = articleRef.current;
    if (!article || !compiledCss || !onNodeColors) return;
    let previous = '';
    const update = () => {
      const colors = Object.fromEntries(Object.entries(getArticleNodeSelectors()).flatMap(([key, selector]) => {
        const node = article.querySelector<HTMLElement>(selector);
        if (!node) return [];
        const value = article.ownerDocument.defaultView!.getComputedStyle(node).color;
        return [[key, tailwindColorToHex(value, article.ownerDocument)]];
      }));
      const snapshot = JSON.stringify(colors);
      if (snapshot !== previous) { previous = snapshot; onNodeColors(colors); }
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(article, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [compiledCss, source, onNodeColors]);
  useEffect(() => {
    if (!inspection || !compiledCss || !articleRef.current) return;
    provenanceRef.current = createArticleColorInspection(articleRef.current, theme, traceCss);
    return () => { provenanceRef.current?.dispose(); provenanceRef.current = null; };
  }, [Boolean(inspection), theme, traceCss, compiledCss, lightTarget]);
  useEffect(() => {
    if (!inspection) return;
    let active = true;
    void compileThemeInspectionUtilities().then(css => {
      if (!active) return;
      utilitiesRef.current = css;
      const shadow = lightHostRef.current?.shadowRoot;
      if (shadow && !shadow.querySelector('[data-theme-inspection-utilities]')) { const style = document.createElement('style'); style.dataset.themeInspectionUtilities = 'true'; style.textContent = css; shadow.append(style); }
      const target = frameRef.current?.contentDocument;
      if (target && !target.querySelector('[data-theme-inspection-utilities]')) { const style = target.createElement('style'); style.dataset.themeInspectionUtilities = 'true'; style.textContent = css; target.head.append(style); }
      setInspectionRevision(value => value + 1);
    });
    return () => { active = false; };
  }, [Boolean(inspection)]);
  useEffect(() => {
    if (!dark || !compiledCss || !articleRef.current) return;
    return observeArticlePreview(articleRef.current, () => {
      try {
        const clone = cloneArticleForDarkPreview(articleRef.current!);
        const snapshot = `${articleCss}\n${clone.outerHTML}`;
        if (snapshot === lastSnapshotRef.current) return;
        lastSnapshotRef.current = snapshot;
        setFailed(false);
        setDarkDocument(articleDarkPreviewDocument(articleCss, clone.outerHTML));
      } catch { lastSnapshotRef.current = ''; setDarkDocument(''); setFailed(true); }
    });
  }, [dark, articleCss, compiledCss, formatSnapshot.id]);
    const content = <div className={`${className} ${scopeClass}`} style={previewSurfaceStyle(dark)} data-preview-mode={dark ? 'dark' : 'light'}>
    <div ref={lightHostRef} hidden={dark} className={framed ? 'mx-auto min-h-full min-w-0 w-full max-w-3xl rounded-lg shadow-panel' : 'min-h-full min-w-0 w-full border-0'} aria-busy={!compiledCss && !compileError} />
    {lightTarget ? createPortal(<><style>{`:host { display: block; min-height: 100%; }\n${articleCss}`}</style><div className={scopeClass}><article ref={articleRef} className="article-preview" data-theme={theme.id}><div className="article-body"><MarkdownPreview source={source} placeholderRelativeImages /></div></article></div></>, lightTarget) : null}
    {compileError ? <p className="border-b border-warning-line bg-warning-surface px-4 py-3 text-xs text-warning-strong" role="alert">主题预览编译失败：{compileError}</p> : null}
    {dark && failed ? <p className="border-b border-warning-line bg-warning-surface px-4 py-3 text-xs text-warning-strong" role="alert">深色预览加载失败，可切回浅色后重试。</p> : null}
    {dark ? <iframe ref={frameRef} className="block h-full min-w-0 w-full border-0" title="文章主题深色预览" sandbox="allow-scripts allow-same-origin" srcDoc={darkDocument} onLoad={() => { const target = frameRef.current?.contentDocument; if (inspection && target) { const style = target.createElement('style'); style.dataset.themeInspectionUtilities = 'true'; style.textContent = utilitiesRef.current; target.head.append(style); setInspectionRevision(value => value + 1); } }} /> : null}
  </div>;
  return inspection ? <ThemeInspectionPreview inspection={inspection} dialogOwner="theme-stylebook-title" rootRef={articleRef} frameRef={dark ? frameRef : undefined} revision={`${inspectionRevision}:${dark}:${articleCss}`} className="flex min-h-0 flex-1 flex-col" onLocate={onLocate} resolve={(element, root) => {
    const light = articleRef.current;
    if (!light || !provenanceRef.current) return [];
    const index = [root, ...root.querySelectorAll<HTMLElement>('*')].indexOf(element);
    const original = [light, ...light.querySelectorAll<HTMLElement>('*')][index];
    return original ? provenanceRef.current.read(original) : [];
  }}>{content}</ThemeInspectionPreview> : content;
}

export function ThemeLibrary({ root, themes: storedThemes, editorThemes = [], issues, currentTheme, defaultThemeId, currentArticleSaved, canApply, isRootCurrent, onLibraryChange, onApply, onSetDefault }: ThemeLibraryProps) {
  const themes = storedThemes;
  const defaultTheme = resolveDefaultArticleTheme(themes, defaultThemeId);
  const { dark, toggle } = useArticlePreviewMode();
  const [sessionRoot, setSessionRoot] = useState(root);
  const [selected, setSelected] = useState<ThemeConfig | null>(null);
  const [browsedThemeId, setBrowsedThemeId] = useState<string | null>(null);
  const [stylebookTheme, setStylebookTheme] = useState<ThemeConfig | null>(null);
  const [notice, setNotice] = useState('');
  const [working, setWorking] = useState(false);
  const [refreshPending, setRefreshPending] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ThemeConfig | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const deletionRef = useRef<object | null>(null);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const importRef = useRef<HTMLInputElement | null>(null);

  const sessionActive = sessionRoot === root && (!root || isRootCurrent(root));
  const browsedTheme = themes.find((theme) => theme.id === browsedThemeId)
    ?? themes.find((theme) => theme.id === currentTheme.id) ?? themes[0] ?? null;

  useEffect(() => {
    setSessionRoot(root);
    setSelected(null);
    setBrowsedThemeId(null);
    setStylebookTheme(null);
    setNotice('');
    setWorking(false);
    setRefreshPending(false);
    setDeleteTarget(null);
    setDeleteError('');
    deletionRef.current = null;
  }, [root]);

  const isSessionCurrent = (expectedRoot: FileSystemDirectoryHandle) => (
    root === expectedRoot && sessionRoot === expectedRoot && isRootCurrent(expectedRoot)
  );

  const updateFromRoot = async (expectedRoot: FileSystemDirectoryHandle = root!) => {
    if (!expectedRoot || !isSessionCurrent(expectedRoot)) return { kind: 'stale' as const };
    return refreshRootSession(
      expectedRoot,
      isSessionCurrent,
      loadThemeLibrary,
      (result) => onLibraryChange(expectedRoot, result.themes, result.issues),
    );
  };

  const publishTheme = (expectedRoot: FileSystemDirectoryHandle, saved: ThemeConfig) => {
    if (!isSessionCurrent(expectedRoot)) return;
    const nextThemes = storedThemes.some((theme) => theme.id === saved.id)
      ? storedThemes.map((theme) => theme.id === saved.id ? saved : theme)
      : [...storedThemes, saved];
    onLibraryChange(expectedRoot, nextThemes, issues);
  };

  const retryRefresh = async () => {
    if (!root || !isSessionCurrent(root)) return;
    const operationRoot = root;
    setWorking(true);
    try {
      const result = await updateFromRoot(operationRoot);
      if (!isSessionCurrent(operationRoot)) return;
      if (result.kind === 'failed') {
        setRefreshPending(true);
        setNotice(`操作已完成；主题列表仍未刷新，请稍后重试：${result.error instanceof Error ? result.error.message : String(result.error)}`);
      } else if (result.kind === 'refreshed') {
        setRefreshPending(false);
        setNotice('主题列表已重新载入。');
      }
    } finally {
      if (isSessionCurrent(operationRoot)) setWorking(false);
    }
  };

  const createTheme = () => {
    if (!root || !sessionActive) return;
    const id = uniqueThemeId('custom-theme', themes);
    const base = themes[0] ?? BASIC_THEME;
    setSelected({ ...base, id, name: '未命名主题', version: '1.0.0' });
    setStylebookTheme({ ...base, id, name: '未命名主题', version: '1.0.0' });
  };

  const copyTheme = async (theme: ThemeConfig) => {
    if (!root || !isSessionCurrent(root)) return;
    const operationRoot = root;
    setWorking(true);
    try {
      const id = uniqueThemeId(`${theme.id}-copy`, themes);
      const saved = await saveThemeLibraryTheme(operationRoot, { ...cloneTheme(theme), id, name: `${theme.name} 副本`, version: '1.0.0' });
      if (!isSessionCurrent(operationRoot)) return;
      publishTheme(operationRoot, saved);
      setSelected(saved);
      const refreshed = await updateFromRoot(operationRoot);
      if (!isSessionCurrent(operationRoot)) return;
      if (refreshed.kind === 'failed') {
        setRefreshPending(true);
        setNotice(`已复制「${saved.name}」并写入资料目录，但列表刷新失败；操作已完成，不要重复复制。可重试刷新：${refreshed.error instanceof Error ? refreshed.error.message : String(refreshed.error)}`);
      } else if (refreshed.kind === 'refreshed') {
        setRefreshPending(false);
        setNotice(`已创建「${saved.name}」。`);
      }
    } catch (error) {
      if (!isSessionCurrent(operationRoot)) return;
      setNotice(`复制主题失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (isSessionCurrent(operationRoot)) setWorking(false);
    }
  };

  const importTheme = async (file?: File) => {
    if (!file || !root || !isSessionCurrent(root)) return;
    const operationRoot = root;
    setWorking(true);
    try {
      const incoming = parseThemeConfigJson(await file.text());
      if (!isSessionCurrent(operationRoot)) return;
      const collision = themes.some((theme) => theme.id === incoming.id);
      const prepared = collision
        ? { ...incoming, id: uniqueThemeId(`${incoming.id}-copy`, themes), name: `${incoming.name} 副本`, version: '1.0.0' }
        : incoming;
      const saved = await saveThemeLibraryTheme(operationRoot, prepared);
      if (!isSessionCurrent(operationRoot)) return;
      publishTheme(operationRoot, saved);
      setSelected(saved);
      const refreshed = await updateFromRoot(operationRoot);
      if (!isSessionCurrent(operationRoot)) return;
      if (refreshed.kind === 'failed') {
        setRefreshPending(true);
        setNotice(`已导入「${saved.name}」并写入资料目录，但列表刷新失败；操作已完成，不要重复导入。可重试刷新：${refreshed.error instanceof Error ? refreshed.error.message : String(refreshed.error)}`);
      } else if (refreshed.kind === 'refreshed') {
        setRefreshPending(false);
        setNotice(collision ? `主题 ID 重复，已作为「${saved.name}」导入。` : `已导入「${saved.name}」。`);
      }
    } catch (error) {
      if (!isSessionCurrent(operationRoot)) return;
      setNotice(`导入失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (isSessionCurrent(operationRoot)) {
        setWorking(false);
        if (importRef.current) importRef.current.value = '';
      }
    }
  };

  const requestDelete = (theme: ThemeConfig) => {
    if (!root || working || themes.length <= 1 || !isSessionCurrent(root)) return;
    if (theme.id === defaultThemeId) { setNotice('请先将另一套主题设为默认，再删除这套主题。'); return; }
    setDeleteError('');
    setDeleteTarget(theme);
  };

  const deleteTheme = async (theme: ThemeConfig) => {
    if (!root || deletionRef.current || !isSessionCurrent(root)) return;
    const operationRoot = root;
    const operation = {};
    deletionRef.current = operation;
    setDeleteError('');
    setWorking(true);
    try {
      await deleteThemeLibraryTheme(operationRoot, theme.id);
      if (!isSessionCurrent(operationRoot)) return;
      onLibraryChange(operationRoot, storedThemes.filter((item) => item.id !== theme.id), issues);
      setSelected(null);
      setDeleteTarget(null);
      setBrowsedThemeId((id) => id === theme.id ? null : id);
      const refreshed = await updateFromRoot(operationRoot);
      if (!isSessionCurrent(operationRoot)) return;
      if (refreshed.kind === 'failed') {
        setRefreshPending(true);
        setNotice(`已删除「${theme.name}」；既有文章快照不受影响，但列表刷新失败，操作已完成，不要重复删除。可重试刷新：${refreshed.error instanceof Error ? refreshed.error.message : String(refreshed.error)}`);
      } else if (refreshed.kind === 'refreshed') {
        setRefreshPending(false);
        setNotice(`已从主题库删除「${theme.name}」；既有文章快照不受影响。`);
      }
    } catch (error) {
      if (!isSessionCurrent(operationRoot)) return;
      const message = `删除失败：${error instanceof Error ? error.message : String(error)}`;
      setDeleteError(message);
      setNotice(message);
    } finally {
      if (deletionRef.current === operation) deletionRef.current = null;
      if (isSessionCurrent(operationRoot)) setWorking(false);
    }
  };

  const exportTheme = (theme: ThemeConfig) => {
    if (!sessionActive) return;
    const blob = new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${theme.id}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setNotice(`已导出 ${theme.id}.json。`);
  };

  const applyTheme = (theme: ThemeConfig) => {
    if (!sessionActive) return;
    if (!canApply) {
      setNotice('当前打开的文章属于另一个资料目录；请切回其资料目录或打开当前目录内的文章后再应用主题。');
      return;
    }
    onApply(theme);
    setSelected(null);
    setStylebookTheme(null);
  };

  const setDefault = async (theme: ThemeConfig) => {
    if (!root || working || !isSessionCurrent(root)) return;
    const expectedRoot = root;
    setWorking(true);
    try {
      await onSetDefault(theme.id, expectedRoot);
      if (isSessionCurrent(expectedRoot)) setNotice(`已将「${theme.name}」设为新稿与模板预览的默认主题；已有文章快照未改变。`);
    } catch (error) {
      if (isSessionCurrent(expectedRoot)) setNotice(`默认主题保存失败：${error instanceof Error ? error.message : String(error)}`);
    } finally { if (isSessionCurrent(expectedRoot)) setWorking(false); }
  };

  const loadDefaults = async () => {
    if (!root || working || !isSessionCurrent(root)) return;
    const expectedRoot = root;
    setWorking(true);
    try {
      const result = await copyDefaultThemes(expectedRoot, 'article-themes');
      if (!isSessionCurrent(expectedRoot)) return;
      const refreshed = await updateFromRoot(expectedRoot);
      if (!isSessionCurrent(expectedRoot)) return;
      setRefreshPending(refreshed.kind === 'failed');
      setNotice(`已添加 ${result.added} 套默认主题，跳过 ${result.skipped} 套已有主题。${result.issues.map(issue => `${issue.file}：${issue.message}`).join('；')}${refreshed.kind === 'failed' ? '列表刷新失败，请重试。' : ''}`);
    } catch (error) { if (isSessionCurrent(expectedRoot)) setNotice(error instanceof Error ? error.message : String(error)); }
    finally { if (isSessionCurrent(expectedRoot)) setWorking(false); }
  };

  const openStylebook = (theme: ThemeConfig) => {
    if (!sessionActive) return;
    setSelected(null);
    setDeleteTarget(null);
    setStylebookTheme(theme);
  };

  if (!sessionActive) {
    return <section className="page-card theme-library-page" aria-label="文章主题"><p className="status-copy" role="status">正在切换资料目录；旧目录中的主题操作已停止。</p></section>;
  }

  return (
    <section className="page-card theme-library-page lg:overflow-hidden" aria-labelledby="theme-library-title">
      <PageHeading>
        <div className="min-w-0"><p id="theme-library-kicker" className="eyebrow">ARTICLE STYLEBOOK</p><h2 id="theme-library-title" className="page-title font-heading">主题库与排印样本册</h2><p className="mt-3 text-sm text-muted">挑一套排印，在完整文章里看看标题、正文与留白。</p></div>
        <ButtonBar label="主题库操作">
          <button className="button button-quiet bg-panel" type="button" onClick={() => importRef.current?.click()} disabled={!root || working}><ThemeIcon name="upload" />导入 JSON</button>
          <input ref={importRef} className="sr-only" type="file" accept=".json,application/json" aria-label="导入主题 JSON 文件" disabled={!root || working} onChange={(event) => void importTheme(event.currentTarget.files?.[0])} />
          <button className="button button-quiet" type="button" disabled={!root || working} onClick={() => void loadDefaults()}><ThemeIcon name="plus" />载入默认主题</button>
          <button className="button button-primary" type="button" onClick={createTheme} disabled={!root || working}><ThemeIcon name="plus" />新建主题</button>
        </ButtonBar>
      </PageHeading>

      {!root ? <p className="shrink-0 rounded-lg border border-line bg-list px-4 py-3 text-xs text-muted">连接资料目录后，读取其中的文章主题；首次连接时会添加默认主题。</p> : null}
      {notice ? <p className="status-copy shrink-0 rounded-lg border border-accent-line bg-accent-soft px-4 py-3" role="status">{notice}</p> : null}
      {refreshPending ? <button className="button button-quiet self-start" type="button" onClick={() => void retryRefresh()} disabled={working}>重新载入主题列表</button> : null}
      {issues.length ? <CollapsiblePanel id="theme-library-issues" title="主题文件需要修复" icon={<PanelIcon kind="issues" />} count={issues.length} open={issuesOpen} onToggle={() => setIssuesOpen(value => !value)} className="shrink-0 border-warning-line bg-warning-surface" contentClassName="text-xs text-warning-strong"><div className="grid max-h-32 gap-2 overflow-y-auto scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">{issues.map((issue) => <p className="break-words" key={`${issue.file}-${issue.message}`}><code>{issue.file}</code>：{issue.message}</p>)}</div></CollapsiblePanel> : null}

      {browsedTheme ? (
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-panel lg:flex-1 lg:flex-row">
          <aside className="flex min-h-0 shrink-0 flex-col border-b border-line bg-list/50 lg:w-72 lg:border-b-0 lg:border-r" aria-label="主题列表">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-4"><h3 className="text-sm font-semibold text-primary">文章主题</h3><span className="font-mono text-xs text-faint">{themes.length} 套</span></div>
            <div className="grid max-h-56 min-h-0 content-start gap-2 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent lg:max-h-none lg:flex-1">
              {themes.map((theme) => <button key={theme.id} className="group flex min-w-0 items-start gap-3 rounded-lg border border-transparent p-3 text-left transition-colors hover:border-line hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-pressed:border-accent-line aria-pressed:bg-accent-soft" type="button" aria-label={`预览主题 ${theme.name}`} aria-pressed={browsedTheme.id === theme.id} aria-controls="theme-library-preview" onClick={() => setBrowsedThemeId(theme.id)}>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-panel text-muted group-aria-pressed:border-accent-line group-aria-pressed:text-accent-text"><ThemeIcon name="book" /></span>
                <span className="grid min-w-0 flex-1 gap-1"><span className="break-words font-sub-heading text-base font-semibold text-primary group-aria-pressed:text-accent-text">{theme.name}</span><span className="break-all font-mono text-2xs text-faint">{theme.id} · v{theme.version}</span>{theme.id === defaultTheme.id ? <span className="flex items-center gap-1 text-2xs text-accent-text"><ThemeIcon name="check" />新稿默认</span> : null}{theme.id === currentTheme.id && theme.version === currentTheme.version ? <span className="flex items-center gap-1 text-2xs text-muted"><ThemeIcon name="check" />当前稿使用</span> : null}</span>
              </button>)}
            </div>
            <p className="hidden shrink-0 border-t border-line px-5 py-4 text-xs text-faint lg:block">选择主题即可预览，应用后才会改变文稿。</p>
          </aside>
          <section id="theme-library-preview" className="flex min-h-0 min-w-0 flex-1 flex-col" aria-labelledby="theme-preview-title">
            <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 md:px-6">
              <div className="min-w-0"><h3 id="theme-preview-title" className="break-words font-heading text-xl font-semibold text-primary">{browsedTheme.name}</h3><p className="mt-1 text-xs text-faint">完整排印预览 <span className="mx-2 text-line-strong" aria-hidden="true">/</span><span className="font-mono">v{browsedTheme.version}</span></p></div>
              <ButtonBar label="主题预览操作"><PreviewModeSwitch dark={dark} onToggle={toggle} /><button className="button button-quiet" type="button" onClick={() => { setSelected(browsedTheme); setDeleteTarget(null); }}><ThemeIcon name="info" />主题详情</button><button className="button button-quiet" type="button" onClick={() => openStylebook(browsedTheme)} disabled={!root || working}><ThemeIcon name="edit" />编辑主题</button><button className="button button-danger" type="button" onClick={() => requestDelete(browsedTheme)} disabled={!root || working || themes.length <= 1 || browsedTheme.id === defaultThemeId} title={browsedTheme.id === defaultThemeId ? '先选择另一套默认主题' : undefined}><ThemeIcon name="delete" />删除主题</button></ButtonBar>
            </header>
            <ThemePreview key={`${browsedTheme.id}-${browsedTheme.version}`} theme={browsedTheme} dark={dark} framed className="h-120 min-h-0 min-w-0 overflow-x-clip overflow-y-auto scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent lg:h-auto lg:flex-1" />
            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4 md:px-6">
              <p className="text-xs text-muted">{currentArticleSaved ? '应用时复制为新文章，原稿与主题快照保留。' : '预览不会改动文稿，应用后可继续编辑。'}</p>
              <ButtonBar label="主题应用操作"><button className="button button-quiet" type="button" onClick={() => void setDefault(browsedTheme)} disabled={!root || working || browsedTheme.id === defaultTheme.id}><ThemeIcon name="check" />{browsedTheme.id === defaultTheme.id ? '当前默认' : '设为新稿默认'}</button><button className="button button-primary" type="button" onClick={() => applyTheme(browsedTheme)} disabled={!canApply || working}><ThemeIcon name="apply" />{canApply ? currentArticleSaved ? '复制并应用' : '应用到当前稿' : !root ? '连接目录后应用' : '文章来自其他目录'}</button></ButtonBar>
            </footer>
          </section>
        </div>
      ) : <div className="empty-state"><div><strong>还没有可用主题</strong><p>导入一份主题 JSON，或新建主题开始排印。</p></div></div>}

      {selected && !stylebookTheme && !deleteTarget ? <ThemeCardDialog
        theme={selected}
        root={root}
        currentTheme={currentTheme}
        currentArticleSaved={currentArticleSaved}
        canApply={canApply}
        busy={working}
        canDelete={storedThemes.length > 1 && selected.id !== defaultThemeId}
        onClose={() => { setSelected(null); setDeleteTarget(null); }}
        onOpenStylebook={() => openStylebook(selected)}
        onCopy={() => void copyTheme(selected)}
        onExport={() => exportTheme(selected)}
        onApply={() => applyTheme(selected)}
        onRequestDelete={() => requestDelete(selected)}
      /> : null}

      {deleteTarget ? <ThemeDeleteDialog theme={deleteTarget} busy={working} error={deleteError} onCancel={() => { if (!deletionRef.current) setDeleteTarget(null); }} onDelete={() => deleteTheme(deleteTarget)} /> : null}

      {stylebookTheme ? <ThemeStylebookDialog
        key={stylebookTheme.id}
        theme={stylebookTheme}
        root={root}
        isRootCurrent={isRootCurrent}
        canApply={canApply}
        onClose={() => { setStylebookTheme(null); setSelected(null); setDeleteTarget(null); }}
        onApply={() => applyTheme(stylebookTheme)}
        onSaved={(savedRoot, saved) => {
          if (!isSessionCurrent(savedRoot)) return;
          setStylebookTheme(saved);
          setSelected((current) => current?.id === saved.id ? saved : current);
          publishTheme(savedRoot, saved);
          setNotice(`已保存「${saved.name}」 · v${saved.version}。文章快照仍保持原样。`);
        }}
      /> : null}
    </section>
  );
}

function ThemeCardDialog({
  theme, root, currentTheme, currentArticleSaved, busy,
  canApply, canDelete,
  onClose, onOpenStylebook, onCopy, onExport, onApply, onRequestDelete,
}: {
  theme: ThemeConfig;
  root: FileSystemDirectoryHandle | null;
  currentTheme: ThemeConfig;
  currentArticleSaved: boolean;
  canApply: boolean;
  canDelete: boolean;
  busy: boolean;
  onClose: () => void;
  onOpenStylebook: () => void;
  onCopy: () => void;
  onExport: () => void;
  onApply: () => void;
  onRequestDelete: () => void;
}) {
  const { dark, toggle } = useArticlePreviewMode();
  return <DialogFrame large titleId="theme-card-title" onClose={onClose} dismissible={!busy}>
    <DialogHeader titleId="theme-card-title" eyebrow={`THEME / ${theme.id} / v${theme.version}`} title={theme.name} onClose={onClose} closeDisabled={busy} />
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
      <aside className="flex min-h-0 min-w-0 shrink-0 flex-col border-b border-line bg-list/50 md:basis-1/3 md:border-r md:border-b-0" aria-label="主题详情菜单">
        <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent"><p className="eyebrow mb-3">THEME ACTIONS</p><ButtonBar label="主题详情操作" className="flex-col items-stretch">
          <button className="button button-primary justify-start" type="button" onClick={onApply} disabled={!canApply || busy}><ThemeIcon name="apply" />{currentArticleSaved ? '复制并应用' : '应用到当前稿'}</button>
          <button className="button button-quiet justify-start" type="button" onClick={onOpenStylebook} disabled={!root || busy}><ThemeIcon name="edit" />编辑主题</button>
          <button className="button button-quiet justify-start" type="button" onClick={onCopy} disabled={!root || busy}><ThemeIcon name="copy" />复制主题</button>
          <button className="button button-quiet justify-start" type="button" onClick={onExport} disabled={busy}><ThemeIcon name="upload" />导出 JSON</button>
          <button className="button button-danger justify-start" type="button" onClick={onRequestDelete} disabled={!root || !canDelete || busy}><ThemeIcon name="delete" />删除主题</button>
        </ButtonBar><div className="mt-6 grid gap-3 border-t border-line pt-4 text-xs text-muted"><p className="font-sub-heading text-sm font-semibold text-primary">当前稿使用</p><p className="break-words">{currentTheme.name}</p><p className="font-mono text-2xs text-faint">v{currentTheme.version}</p><p>{currentArticleSaved ? '应用时创建独立副本，保留原文与原主题快照。' : '应用只改变当前稿，保存文章时写入主题快照。'}</p></div>
        </div>
      </aside>
      <div className="flex min-h-60 min-w-0 flex-1 flex-col gap-3 p-4 md:min-h-0"><div className="flex shrink-0 items-center justify-between gap-3"><p className="font-sub-heading text-sm font-medium text-primary">文章排印预览</p><PreviewModeSwitch dark={dark} onToggle={toggle} /></div><ThemePreview theme={theme} dark={dark} /></div>
    </div>
  </DialogFrame>;
}

function ThemeDeleteDialog({ theme, busy, error, onCancel, onDelete }: {
  theme: ThemeConfig;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onDelete: () => Promise<void>;
}) {
  return <DialogFrame titleId="theme-delete-title" descriptionId="theme-delete-description" role="alertdialog" onClose={onCancel} dismissible={!busy}>
    <DialogHeader titleId="theme-delete-title" eyebrow="DELETE THEME" title="删除主题" onClose={onCancel} closeDisabled={busy} />
    <div className="dialog-content">
      <p id="theme-delete-description" className="text-sm text-muted">确定从主题库删除「{theme.name}」吗？既有文章的主题快照仍会保留。</p>
      <p className="break-all font-mono text-xs text-faint">{theme.id}.json</p>
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      <DialogActions><DialogButton onClick={onCancel} disabled={busy}><ThemeIcon name="close" />取消</DialogButton><DialogButton variant="danger" onClick={() => void onDelete()} disabled={busy}><ThemeIcon name="delete" />{busy ? '删除中…' : '确认删除'}</DialogButton></DialogActions>
    </div>
  </DialogFrame>;
}

function ThemeStylebookDialog({ theme, root, isRootCurrent, canApply, onClose, onApply, onSaved }: {
  theme: ThemeConfig;
  root: FileSystemDirectoryHandle | null;
  isRootCurrent: (root: FileSystemDirectoryHandle) => boolean;
  canApply: boolean;
  onClose: () => void;
  onApply: () => void;
  onSaved: (root: FileSystemDirectoryHandle, theme: ThemeConfig) => void;
}) {
  const { dark, toggle } = useArticlePreviewMode();
  const layout = useResizableColumns(100 / 3, '(width >= 48rem)');
  const [picker, setPicker] = useState<{ label: string; token: string; value: string; select: (color: string) => void } | null>(null);
  const [departure, setDeparture] = useState(false);
  // The unsaved gate serves two exits now: closing the editor and applying the theme.
  const [applyAfter, setApplyAfter] = useState(false);
  const savedBaseline = useRef(JSON.stringify(theme));
  const savedCode = useRef({ css: theme.css, json: JSON.stringify(theme, null, 2) });
  const [codeErrors, setCodeErrors] = useState({ css: '', json: '' });
  const savingRef = useRef(false);
  const [draft, setDraft] = useState(() => cloneTheme(theme));
  const [previewTheme, setPreviewTheme] = useState(() => cloneTheme(theme));
  const [editorTab, setEditorTab] = useState<'tokens' | 'css' | 'json'>('tokens');
  const [cssText, setCssText] = useState(theme.css);
  const [jsonText, setJsonText] = useState(JSON.stringify(theme, null, 2));
  const [nodeKey, setNodeKey] = useState<ThemeNodeKey>('h1');
  const [nodeColors, setNodeColors] = useState<Partial<Record<ThemeNodeKey, string>>>({});
  const inspection = useThemeInspection();
  const cssEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const locateInspection = (binding: ColorBinding) => {
    if (binding.kind === 'css') setEditorTab('css');
    else { setEditorTab('tokens'); if (binding.node) setNodeKey(binding.node); }
  };
  useEffect(() => {
    const binding = inspection.selected;
    if (binding?.kind !== 'css' || binding.start === undefined) return;
    const frame = requestAnimationFrame(() => {
      const editor = cssEditorRef.current;
      if (!editor) return;
      editor.focus({ preventScroll: true }); editor.setSelectionRange(binding.start!, binding.end ?? binding.start!);
      const line = editor.value.slice(0, binding.start).split('\n').length - 1;
      editor.scrollTo({ top: line * parseFloat(getComputedStyle(editor).lineHeight), behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [inspection.selected, editorTab]);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [writeFailed, setWriteFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const readOnly = !root;

  const updateDraft = (next: ThemeConfig) => {
    setWriteFailed(false);
    setDraft(next);
    if (!jsonNeedsValidation) setJsonText(JSON.stringify(next, null, 2));
    setSavedMessage('');
    const errors = [...validateThemeConfig(next), ...validateThemeFormat(next)];
    if (errors.length) setError(errors.join('；'));
    else {
      setError('');
      setPreviewTheme(next);
    }
  };

  const formatCodeErrors = (errors: { css: string; json: string }) => [errors.css && `CSS：${errors.css}`, errors.json && `JSON：${errors.json}`].filter(Boolean).join('；');
  const changeCode = (kind: 'css' | 'json', value: string) => {
    setWriteFailed(false);
    if (kind === 'css') setCssText(value); else setJsonText(value);
    const nextErrors = { ...codeErrors, [kind]: '' };
    setCodeErrors(nextErrors);
    setError(formatCodeErrors(nextErrors));
    setSavedMessage('');
  };
  const validateCode = (): ThemeConfig | null => {
    setWriteFailed(false);
    const failures = { css: validateThemeCss(cssText).join('；'), json: '' };
    let parsed: ThemeConfig | null = null;
    try {
      parsed = parseThemeConfigJson(jsonText);
      if (parsed.id !== theme.id) throw new Error('不能在编辑器中更改主题 ID；请复制主题后再另存为新主题。');
    } catch (cause) { failures.json = cause instanceof Error ? cause.message : String(cause); }
    setCodeErrors(failures);
    if (failures.css || failures.json || !parsed) {
      setError(formatCodeErrors(failures));
      setSavedMessage('');
      return null;
    }
    // JSON supplies the theme fields; explicitly edited CSS supplies its stylesheet.
    const next = { ...parsed, css: cssNeedsValidation ? cssText : parsed.css };
    const formatFailures = validateThemeFormat(next);
    if (formatFailures.length) {
      setCodeErrors(current => ({ ...current, css: formatFailures.join('；') }));
      setError(formatFailures.join('；'));
      setSavedMessage('');
      return null;
    }
    setDraft(next);
    setPreviewTheme(next);
    setCssText(next.css);
    setJsonText(JSON.stringify(next, null, 2));
    setError('');
    setSavedMessage('CSS 与 JSON 校验通过，已应用到本次临时预览。');
    return next;
  };

  const save = async (validatedDraft?: ThemeConfig): Promise<boolean> => {
    if (!root || !isRootCurrent(root) || savingRef.current || unappliedChanges && !validatedDraft || !dirty) return false;
    const operationRoot = root;
    const formatId = getFormatSnapshot().id;
    const target = validatedDraft ?? draft;
    const errors = [...validateThemeConfig(target), ...validateThemeFormat(target)];
    if (errors.length) {
      setError(errors.join('；'));
      return false;
    }
    savingRef.current = true;
    setSaving(true);
    setWriteFailed(false);
    setError('');
    setSavedMessage('保存中…');
    try {
      const measured = await validateContentSource('snippets', STYLEBOOK_SAMPLE, { theme: target });
      if (!isRootCurrent(operationRoot) || getFormatSnapshot().id !== formatId) return false;
      if (measured.errors.length) { setError(measured.errors.join('；')); setSavedMessage('实际排版检查未通过；主题文件未写入。'); return false; }
      const saved = await saveThemeLibraryTheme(operationRoot, target);
      if (!isRootCurrent(operationRoot) || getFormatSnapshot().id !== formatId) return false;
      savedBaseline.current = JSON.stringify(saved);
      savedCode.current = { css: saved.css, json: JSON.stringify(saved, null, 2) };
      setDraft(saved);
      setPreviewTheme(saved);
      setCssText(saved.css);
      setJsonText(JSON.stringify(saved, null, 2));
      setError('');
      setSavedMessage(`已保存 v${saved.version}。既有文章快照未改动。${measured.issues.length ? ` ${measured.issues.length} 项仍需核对。` : ''}`);
      onSaved(operationRoot, saved);
      return true;
    } catch (cause) {
      if (!isRootCurrent(operationRoot)) return false;
      setError(`保存失败：${cause instanceof Error ? cause.message : String(cause)}`);
      setWriteFailed(true);
      return false;
    } finally {
      savingRef.current = false;
      if (isRootCurrent(operationRoot)) setSaving(false);
    }
  };

  const setToken = (key: string, value: string) => updateDraft({ ...draft, tokens: { ...draft.tokens, [key]: value } });
  const selectedNode = draft.nodes?.[nodeKey] ?? {};
  const cssNeedsValidation = cssText !== draft.css;
  const jsonNeedsValidation = jsonText !== JSON.stringify(draft, null, 2);
  const unappliedChanges = cssNeedsValidation || jsonNeedsValidation;
  const dirty = JSON.stringify(draft) !== savedBaseline.current || unappliedChanges;
  const resetChanges = () => {
    if (readOnly || savingRef.current || !dirty) return;
    const baseline = cloneTheme(JSON.parse(savedBaseline.current) as ThemeConfig);
    setDraft(baseline);
    setPreviewTheme(baseline);
    setCssText(baseline.css);
    setJsonText(JSON.stringify(baseline, null, 2));
    setCodeErrors({ css: '', json: '' });
    setWriteFailed(false);
    setError('');
    setSavedMessage('');
  };
  const close = () => { if (savingRef.current) return; if (dirty) setDeparture(true); else onClose(); };
  // Applying used to leave straight away, so unsaved edits were dropped without a word.
  const requestApply = () => { if (savingRef.current) return; if (dirty) { setApplyAfter(true); setDeparture(true); } else onApply(); };
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty || savingRef.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  const setNodeValue = (key: 'fontSize' | 'lineHeight' | 'color', value: string) => {
    const nextNodes = { ...draft.nodes, [nodeKey]: { ...selectedNode, [key]: value || undefined } };
    const nodeRules = nextNodes[nodeKey] ?? {};
    if (!nodeRules.fontSize && !nodeRules.lineHeight && !nodeRules.color) delete nextNodes[nodeKey];
    updateDraft({ ...draft, nodes: Object.keys(nextNodes).length ? nextNodes : undefined });
  };
  const resetNode = () => {
    const nextNodes = { ...draft.nodes };
    delete nextNodes[nodeKey];
    updateDraft({ ...draft, nodes: Object.keys(nextNodes).length ? nextNodes : undefined });
  };

  const activeTab = editorTab;
  const chooseTab = setEditorTab;
  const tabs = [{ id: 'tokens', label: '常用项', icon: 'edit', pending: false, modified: false, failed: false }, { id: 'css', label: 'CSS', icon: 'code', pending: cssNeedsValidation, modified: cssText !== savedCode.current.css, failed: Boolean(codeErrors.css) }, { id: 'json', label: 'JSON', icon: 'code', pending: jsonNeedsValidation, modified: jsonText !== savedCode.current.json, failed: Boolean(codeErrors.json) }] as const;
  const openColor = (label: string, token: string, value: string, select: (color: string) => void) => {
    try { setPicker({ label, token, value: tailwindColorToHex(value, document), select }); }
    catch { setError('无法解析当前颜色，请在 CSS 或 JSON 中修复。'); }
  };
  return <>
    <DialogFrame large titleId="theme-stylebook-title" onClose={close} dismissible={!saving && !picker && !departure} focusActive={!picker && !departure} onKeyDown={event => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 's') return;
      event.preventDefault(); event.stopPropagation();
      if (readOnly || savingRef.current || saving || picker || departure || event.repeat || event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (unappliedChanges) { const next = validateCode(); if (next) void save(next); } else void save();
    }}>
      <header className="dialog-header shrink-0"><div className="min-w-0"><p className="eyebrow">ARTICLE THEME / v{draft.version}</p><h2 id="theme-stylebook-title" className="font-heading dialog-title break-words">{draft.name}</h2></div><ButtonBar label="文章主题编辑操作"><button className="button button-quiet" type="button" onClick={requestApply} disabled={!canApply || saving}><ThemeIcon name="apply" />应用到文章</button><button className="button button-quiet" type="button" onClick={close} disabled={saving}><ThemeIcon name="close" />关闭</button></ButtonBar></header>
      <div ref={layout.containerRef} className="group/theme-columns flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto data-[wide=true]:flex-row data-[wide=true]:overflow-hidden" data-wide={layout.wideEnough} data-dragging={layout.dragging} style={layout.style}>
        <aside ref={inspection.listRef} {...inspection.listProps} className="flex h-96 min-h-0 min-w-0 shrink-0 flex-col border-b border-line bg-list/50 group-data-[wide=true]/theme-columns:h-auto group-data-[wide=true]/theme-columns:w-(--editor-source-width) group-data-[wide=true]/theme-columns:border-b-0" aria-label="主题临时编辑器">
          <div className="shrink-0 border-b border-line p-4"><label className="grid min-w-0 gap-2 text-xs text-muted">主题名称<input className="field min-w-0 w-full" value={draft.name} disabled={readOnly || saving} onChange={event => updateDraft({ ...draft, name: event.target.value })} /></label><p className="mt-2 break-all font-mono text-2xs text-faint">{draft.id}</p></div>
          <nav className="grid shrink-0 grid-cols-3 gap-1 border-b border-line p-3" role="tablist" aria-label="主题编辑菜单">{tabs.map((tab, index) => <button key={tab.id} id={`article-theme-tab-${tab.id}`} role="tab" type="button" tabIndex={activeTab === tab.id ? 0 : -1} aria-selected={activeTab === tab.id} aria-controls="article-theme-editor-panel" disabled={saving} data-validation={tab.failed ? 'failed' : tab.pending ? 'pending' : 'complete'} data-modified={tab.modified} aria-label={tab.failed ? `${tab.label}，校验失败` : tab.modified ? `${tab.label}，已修改` : undefined} className={`flex min-w-0 items-center justify-center gap-1 rounded-lg border border-transparent px-1 py-2 whitespace-nowrap text-xs hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent ${tab.failed ? 'text-danger aria-selected:border-danger aria-selected:bg-danger/10 aria-selected:text-danger' : 'text-muted aria-selected:border-accent-line aria-selected:bg-accent-soft aria-selected:text-accent-text'}`} onClick={() => chooseTab(tab.id)} onKeyDown={event => { const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null; if (next !== null) { event.preventDefault(); chooseTab(tabs[next].id); document.getElementById(`article-theme-tab-${tabs[next].id}`)?.focus(); } }}><ThemeIcon name={tab.icon} />{tab.label}{tab.modified ? <span className={`rounded px-1 text-2xs ${tab.failed ? 'bg-danger/10 text-danger' : 'bg-accent-soft text-accent-text'}`}>已修改</span> : null}</button>)}</nav>
          <div id="article-theme-editor-panel" role="tabpanel" aria-labelledby={`article-theme-tab-${activeTab}`} className="flex min-h-0 min-w-0 flex-1 flex-col p-4">
            {editorTab === 'tokens' ? <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent" onClick={event => { if (event.target === event.currentTarget) inspection.clear(); }}><ArticleThemeFields theme={draft} nodeColors={nodeColors} disabled={readOnly || saving} nodeKey={nodeKey} onNodeKey={setNodeKey} onToken={setToken} onNodeValue={setNodeValue} onResetNode={resetNode} onColor={openColor} inspection={inspection} /></div> : <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3"><div className="flex min-h-0 flex-1 flex-col gap-2"><span className="shrink-0 font-sub-heading text-xs font-semibold text-primary">{editorTab === 'css' ? '受限主题 CSS' : '完整主题 JSON'}</span><SnippetTextarea ref={editorTab === 'css' ? cssEditorRef : undefined} sourceFont="editor" value={editorTab === 'css' ? cssText : jsonText} snippets={[]} readOnly={readOnly} disabled={saving} ariaLabel={editorTab === 'css' ? '主题 CSS' : '完整主题 JSON'} onChange={value => changeCode(editorTab === 'css' ? 'css' : 'json', value)} /></div><p className="shrink-0 text-2xs text-faint">{editorTab === 'css' ? '静态 CSS 仅作用于文章预览，不支持外链与脚本。' : '主题 ID 保持不变；另存为新主题请使用复制。'}</p></div>}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-line p-4"><ButtonBar label="文章主题保存" className="w-full justify-between"><button className="button button-quiet px-2" type="button" disabled={readOnly || saving || !dirty} onClick={resetChanges}><ThemeIcon name="reset" />重置修改</button>{editorTab !== 'tokens' ? <button className="button button-quiet px-2" type="button" disabled={readOnly || saving || !unappliedChanges} onClick={validateCode}><ThemeIcon name="check" />校验并预览</button> : null}<span className="inline-flex min-w-0 after:top-auto after:bottom-full after:mb-2 after:mt-0" data-tooltip={unappliedChanges ? '请先完成校验' : undefined} tabIndex={unappliedChanges ? 0 : undefined} aria-describedby={unappliedChanges ? 'article-theme-validation-hint' : undefined}><button className="button button-primary px-2 disabled:pointer-events-none" type="button" onClick={() => void save()} disabled={readOnly || saving || Boolean(error) && !writeFailed || unappliedChanges || !dirty} aria-describedby={unappliedChanges ? 'article-theme-validation-hint' : undefined}><ThemeIcon name="save" />{saving ? '保存中…' : '保存主题'}</button>{unappliedChanges ? <span id="article-theme-validation-hint" className="sr-only">请先完成校验</span> : null}</span></ButtonBar></div>
        </aside>
        <ColumnSplitter layout={layout} label="调整主题代码与预览宽度" controls="article-theme-editor-panel" />
        <div className="flex min-h-60 min-w-0 flex-1 flex-col gap-3 p-5 group-data-[wide=true]/theme-columns:min-h-0 group-data-[dragging=true]/theme-columns:pointer-events-none"><div className="flex shrink-0 items-center justify-between gap-3"><p className="font-sub-heading text-sm font-medium text-primary">实时排印预览</p><PreviewModeSwitch dark={dark} onToggle={toggle} /></div><ThemePreview theme={previewTheme} dark={dark} inspection={inspection} onLocate={locateInspection} onNodeColors={setNodeColors} /></div>
      </div>
      {error || savedMessage ? <footer className="shrink-0 border-t border-line px-5 py-3">{error ? <p className="text-xs text-danger" role="alert">{error}</p> : <p className="text-xs text-success" role="status">{savedMessage}</p>}</footer> : null}
    </DialogFrame>
    {departure ? <UnsavedChangesDialog entries={[{ label: draft.name, detail: unappliedChanges ? '代码尚未校验' : '文章主题修改尚未保存' }]} description="文章主题有未保存的内容。" saveLabel={applyAfter ? '保存并应用' : '保存并关闭'} saveDisabled={Boolean(error) && !writeFailed || unappliedChanges || readOnly} onCancel={() => { setDeparture(false); setApplyAfter(false); }} onDiscard={onClose} onSave={async () => { if (!await save()) return false; if (applyAfter) { setApplyAfter(false); onApply(); } else onClose(); return true; }} /> : null}
    {picker ? <EditorColorPicker label={picker.label} token={picker.token} modeLabel="文章主题" value={picker.value} onClose={() => setPicker(null)} onSelect={picker.select} /> : null}
  </>;
}
