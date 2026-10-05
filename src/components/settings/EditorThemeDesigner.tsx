'use client';

import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import { BASE_EDITOR_THEME, EDITOR_COLOR_ROLES, editorSurfaceTokens, parseEditorThemeJson, resolveEditorThemeColors, resolveEditorThemeSurfaces, validateEditorTheme, type EditorTheme, type EditorColorRole, type EditorColorScheme, type EditorThemeFontRole } from '../../lib/editorThemes';
import type { NavigationGuard } from '../../hooks/useRouteNavigation';
import { tokenizeEditorSource } from '../../lib/editorSourceHighlight';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from '../global/DialogFrame';
import { UnsavedChangesDialog } from '../global/UnsavedChangesDialog';
import { canonicalFontStack, fontOptions } from '../../lib/fontCatalog';
import { CollapsiblePanel, PanelIcon } from '../global/CollapsiblePanel';
import { EditorColorPicker } from './EditorColorPicker';
import { ColorSwatchButton } from '../global/ColorSwatchButton';
import { ThemeInspectionPreview, useThemeInspection, INSPECTION_ROW_CLASSES, type ThemeInspection } from '../global/ThemeInspection';
import { uniqueBindings, type ColorBinding } from '../../lib/themeInspection';

const FONT_TOKENS: Record<EditorThemeFontRole, string> = { ui: '--font-sans', heading: '--font-heading', subHeading: '--font-sub-heading', eyebrow: '--font-eyebrow', serif: '--font-serif', mono: '--font-mono', editorSource: '--font-editor-source', articleSource: '--font-article-source' };
const FONT_LABELS: Record<EditorThemeFontRole, string> = { ui: '界面正文', heading: '界面标题', subHeading: '列表与次级标题', eyebrow: '英文上标', serif: '衬线文字', mono: '等宽文字', editorSource: '代码源码', articleSource: '文章写作源码' };
const FONT_ROLES = Object.keys(FONT_TOKENS) as EditorThemeFontRole[];
const COLOR_LABELS: Record<EditorColorRole, string> = {
  canvas: '工作区背景', rail: '侧栏背景', list: '列表背景', panel: '面板背景', hover: '悬停背景', 'popup-bg': '浮层背景',
  primary: '主要文字', secondary: '次要文字', muted: '辅助文字', faint: '弱化文字', 'popup-text': '浮层文字',
  line: '常规分隔线', 'line-strong': '强调分隔线',
  accent: '主题主色', 'accent-strong': '主色强调', 'accent-text': '主色文字', 'accent-soft': '主色浅底', 'accent-line': '主色边线', selection: '文字选区', 'on-accent': '主色上的文字',
  success: '成功文字', 'success-surface': '成功背景', warning: '警告主色', 'warning-strong': '警告强调', 'warning-surface': '警告背景', 'warning-line': '警告边线', danger: '错误主色', 'on-danger': '错误色上的文字',
  'editor-surface': '源码背景', 'editor-text': '源码正文', 'editor-syntax': '语法标记', 'editor-heading': '源码标题', 'editor-quote': '源码引用',
};
const SAMPLE = '# 从容写下第一句\n\n文字与装饰使用当前编辑器主题。\n\n## 一个清楚的小标题\n\n> 留下想法，也留下一点空白。\n\n- 颜色按语义角色映射\n- 字体独立选择\n\n`const draft = true;`';

export function forkEditorTheme(source: EditorTheme): EditorTheme {
  const palette: Record<string, string> = {};
  const colors = {} as EditorTheme['colors'];
  for (const mode of ['light', 'dark'] as const) {
    const resolved = resolveEditorThemeColors(source, mode);
    colors[mode] = Object.fromEntries(EDITOR_COLOR_ROLES.map(role => {
      const key = `${mode}-${role}`;
      const color = resolved[role];
      palette[key] = color.length === 4 ? `#${[...color.slice(1)].map(channel => channel + channel).join('')}` : color;
      return [role, key];
    })) as EditorTheme['colors']['light'];
  }
  const surfaceReferences = new Map<string, string>();
  const paletteKey = (mode: EditorColorScheme, reference: string, preferred?: EditorColorRole) => {
    // Equal colors can have independent roles. Preserve the authored reference.
    const role = preferred && source.colors[mode][preferred] === reference ? preferred : EDITOR_COLOR_ROLES.find(role => source.colors[mode][role] === reference);
    if (role) return `${mode}-${role}`;
    const identity = `${mode}:${reference}`;
    const existing = surfaceReferences.get(identity);
    if (existing) return existing;
    const key = `surface-${Object.keys(palette).length}`;
    palette[key] = source.palette[reference];
    surfaceReferences.set(identity, key);
    return key;
  };
  const surfaces = source.surfaces ? Object.fromEntries((['light', 'dark'] as const).map(mode => {
    const surface = source.surfaces![mode];
    const reference = (key: string) => paletteKey(mode, key);
    return [mode, { ...surface, primaryButton: paletteKey(mode, surface.primaryButton, 'accent'), primaryText: paletteKey(mode, surface.primaryText, 'on-accent'), primaryHover: typeof surface.primaryHover === 'string' ? paletteKey(mode, surface.primaryHover, 'accent-strong') : surface.primaryHover.map(reference), secondaryButton: paletteKey(mode, surface.secondaryButton, 'panel'), eyebrow: paletteKey(mode, surface.eyebrow, 'accent-text'), dangerSurface: reference(surface.dangerSurface),
      ...(surface.backdrop ? { backdrop: { ...surface.backdrop, color: reference(surface.backdrop.color) } } : {}),
      field: { ...surface.field, color: paletteKey(mode, surface.field.color, 'panel') }, shadow: { ...surface.shadow, color: paletteKey(mode, surface.shadow.color, 'secondary') }, canvasWash: { ...surface.canvasWash, colors: surface.canvasWash.colors.map(reference) } }];
  })) as EditorTheme['surfaces'] : undefined;
  return { kind: 'editor-theme', id: `editor-custom-${Date.now().toString(36)}`, name: `${source.name} 新主题`, version: '1.0.0', formatVersion: 4, palette, colors, fonts: { ...source.fonts }, ...(surfaces ? { surfaces } : {}) };
}

function surfaceBindings(theme: EditorTheme, mode: EditorColorScheme): Record<string, ColorBinding[]> {
  const surface = theme.surfaces?.[mode];
  const binding = (token: string, label: string, reference: string): ColorBinding => {
    const role = EDITOR_COLOR_ROLES.find(role => theme.colors[mode][role] === reference);
    return { key: role ?? `surface:${mode}:${reference}`, label: role ? COLOR_LABELS[role] : label, token: role ? `${token} ← --color-${role}` : token, value: reference };
  };
  const refs: Record<string, [string, string[]]> = {
    action: ['按钮底色', [surface?.primaryButton ?? theme.colors[mode].accent]],
    'action-text': ['按钮文字', [surface?.primaryText ?? theme.colors[mode]['on-accent']]],
    'action-hover': ['按钮悬停底色', surface ? typeof surface.primaryHover === 'string' ? [surface.primaryHover] : [surface.primaryButton] : [theme.colors[mode]['accent-strong']]],
    'editor-action-gradient': ['按钮悬停渐变', surface && Array.isArray(surface.primaryHover) ? surface.primaryHover : []],
    'action-line': ['按钮边线', [theme.colors[mode][surface ? 'accent-line' : 'accent']]],
    eyebrow: ['装饰上标', [surface?.eyebrow ?? theme.colors[mode]['accent-text']]],
    'danger-surface': ['危险操作底色', [surface?.dangerSurface ?? theme.colors[mode].panel]],
    'editor-field-background': ['表单底色', surface?.field.opacity === 0 ? [] : [surface?.field.color ?? theme.colors[mode].panel]],
    'editor-canvas-wash': ['工作区点缀', surface?.canvasWash.opacity ? surface.canvasWash.colors : []],
  };
  return Object.fromEntries(Object.entries(refs).map(([key, [label, values]]) => [key, values.map(value => binding(key.startsWith('editor-') ? `--${key}` : `--color-${key}`, label, value))]));
}

function editorElementBindings(element: HTMLElement, root: HTMLElement, theme: EditorTheme, mode: EditorColorScheme): ColorBinding[] {
  const derived = surfaceBindings(theme, mode);
  const surface = theme.surfaces?.[mode];
  const output: ColorBinding[] = [];
  const placeholderOnly = element.classList.contains('field') && element.matches(':placeholder-shown');
  const ownText = !placeholderOnly && (Array.from(element.childNodes).some(node => node.nodeType === 3 && Boolean(node.textContent?.trim())) || element.matches('input,button,svg,path'));
  const fromClass = (node: HTMLElement, prefix: string) => {
    const color = Array.from(node.classList).filter(value => !value.endsWith('/0')).map(value => value.split('/')[0]).find(value => value.startsWith(`${prefix}-`) && (EDITOR_COLOR_ROLES.includes(value.slice(prefix.length + 1) as EditorColorRole) || value.slice(prefix.length + 1) === 'eyebrow'))?.slice(prefix.length + 1);
    if (color === 'eyebrow') return derived.eyebrow;
    if (color) return [{ key: color, label: COLOR_LABELS[color as EditorColorRole], token: `--color-${color}` }];
    const fallback = prefix === 'text' ? node.classList.contains('editor-theme-preview-caption') ? 'faint' : node.classList.contains('field') ? 'secondary' : null : prefix === 'bg' && node.classList.contains('editor-theme-preview-card') ? 'panel' : null;
    return fallback ? [{ key: fallback, label: COLOR_LABELS[fallback], token: `--color-${fallback}` }] : [];
  };
  if (ownText) {
    let current: HTMLElement | null = element;
    while (current && root.contains(current)) {
      const text = current.classList.contains('button-primary') ? derived['action-text'] : current.classList.contains('button-danger') ? [{ key: current.matches(':hover') ? 'on-danger' : 'danger', label: COLOR_LABELS[current.matches(':hover') ? 'on-danger' : 'danger'], token: current.matches(':hover') ? '--color-on-danger' : '--color-danger' }] : fromClass(current, 'text');
      if (text.length) { output.push(...text); break; }
      current = current.parentElement;
    }
  }
  let background: HTMLElement | null = element;
  while (background && root.contains(background)) {
    const values = background.classList.contains('button-primary') ? derived[background.matches(':hover') ? derived['editor-action-gradient'].length ? 'editor-action-gradient' : 'action-hover' : 'action'] : background.classList.contains('button-danger') ? background.matches(':hover') ? [{ key: 'danger', label: COLOR_LABELS.danger, token: '--color-danger' }] : derived['danger-surface'] : background.classList.contains('field') ? derived['editor-field-background'] : fromClass(background, 'bg');
    output.push(...values);
    if (background === root) output.push(...derived['editor-canvas-wash']);
    const translucent = background.classList.contains('field') && surface && surface.field.opacity < 100 || Array.from(background.classList).some(value => value.startsWith('bg-') && /\/(?:0|[1-9]\d?)$/.test(value));
    if (values.length && !translucent) break;
    background = background.parentElement;
  }
  if (element.classList.contains('button-primary')) output.push(...(element.matches(':hover') ? [{ key: 'accent-strong', label: COLOR_LABELS['accent-strong'], token: '--color-accent-strong' }] : derived['action-line']));
  else if (element.classList.contains('button-danger')) output.push({ key: 'danger', label: COLOR_LABELS.danger, token: '--color-danger' });
  else if (element.classList.contains('field')) {
    const border = element.matches(':focus') ? 'accent' : 'line';
    output.push({ key: border, label: COLOR_LABELS[border], token: `--color-${border}` });
    if (placeholderOnly) output.push({ key: 'faint', label: COLOR_LABELS.faint, token: '--color-faint' });
  }
  else if (element.classList.contains('editor-theme-preview-card')) output.push({ key: 'line', label: COLOR_LABELS.line, token: '--color-line' });
  else output.push(...fromClass(element, 'border'));
  return uniqueBindings(output);
}

function Preview({ theme, mode, inspection }: { theme: EditorTheme; mode: EditorColorScheme; inspection: ThemeInspection }) {
  const colors = resolveEditorThemeColors(theme, mode);
  const tokens = Object.fromEntries([
    ...EDITOR_COLOR_ROLES.map(role => [`--color-${role}`, colors[role]]),
    ...FONT_ROLES.map(role => [FONT_TOKENS[role], theme.fonts[role]]),
    ...Object.entries(editorSurfaceTokens(colors, resolveEditorThemeSurfaces(theme)?.[mode])),
  ]) as CSSProperties;
  return <ThemeInspectionPreview inspection={inspection} dialogOwner="editor-theme-designer-title" revision={theme} resolve={(element, root) => editorElementBindings(element, root, theme, mode)} className="flex min-h-0 flex-1 flex-col"><div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-canvas bg-(image:--editor-canvas-wash) font-sans text-secondary" data-font-role="ui" style={tokens} aria-label="编辑器主题实时预览">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line bg-panel px-4 py-3"><div><p data-font-role="eyebrow" className="font-eyebrow text-2xs font-medium tracking-widest text-eyebrow">WRITING DESK</p><h3 data-font-role="heading" className="mt-1 font-heading text-base font-semibold text-primary">文稿工作台</h3></div><div className="ml-auto flex min-w-0 flex-wrap items-center gap-2"><span className="rounded-md bg-accent-strong px-2 py-1 text-2xs text-on-accent">当前稿</span><input className="field w-36 min-w-0 text-xs" aria-label="测试表单" placeholder="测试表单" /><span className="rounded-md bg-success-surface px-2 py-1 text-2xs text-success">已保存</span></div></header>
    <div className="flex min-h-0 flex-1"><aside className="hidden w-28 shrink-0 border-r border-line bg-rail p-4 md:block"><p className="mb-3 text-xs text-faint">资料库</p><div className="rounded-lg border border-accent-line bg-accent-soft p-2 font-sub-heading text-xs text-accent-text">文章</div><p className="mt-4 text-xs text-muted">主题</p><p className="mt-4 text-xs text-muted">模板</p><section className="mt-5 rounded-md border border-line-strong bg-popup-bg p-2 text-popup-text" aria-label="浮层与悬停样本"><p className="text-2xs font-medium">插入元素</p><div className="mt-2 rounded bg-hover px-1.5 py-1 text-2xs">引用段落</div></section></aside><div className="flex min-h-0 min-w-0 flex-1 flex-col"><div className="flex shrink-0 items-center justify-between border-b border-line bg-list px-4 py-3"><span data-font-role="mono" className="font-mono text-xs text-primary">article.md</span><div className="flex min-w-0 items-center gap-2"><span className="text-2xs text-muted">编译进度</span><span className="h-1.5 w-12 overflow-hidden rounded-full bg-hover" aria-label="编译进度样本"><span className="block h-full w-3/4 rounded-full bg-accent" /></span><span className="text-2xs text-faint">即时预览</span></div></div><div className="min-h-0 flex-1 overflow-auto bg-canvas p-4 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">
      {/* Geometry rationale: the status card needs more width for three single-line labels; adjacent text cards can truncate. */}
      <div className="mb-4 grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)]"><section className="editor-theme-preview-card" aria-label="列表与次级标题字体样本"><p className="editor-theme-preview-caption">列表与次级标题</p><h4 data-font-role="subHeading" className="editor-theme-preview-text font-sub-heading text-sm font-semibold text-primary" title="写作中的灵感">写作中的灵感</h4></section><section className="editor-theme-preview-card" aria-label="衬线文字字体样本"><p className="editor-theme-preview-caption">衬线文字</p><p data-font-role="serif" className="editor-theme-preview-text font-serif text-sm text-secondary" title="把零散的想法，写成一页文字。">把零散的想法，写成一页文字。</p></section><section className="editor-theme-preview-card" aria-label="状态文字样本"><p className="editor-theme-preview-caption">状态文字</p><div className="flex min-w-0 items-center gap-1 text-2xs"><span className="min-w-0 truncate text-success" title="保存成功">保存成功</span><span className="min-w-0 truncate text-warning" title="等待处理">等待处理</span><span className="min-w-0 truncate rounded bg-danger px-1.5 py-0.5 text-on-danger" title="保存失败">保存失败</span></div></section></div><section className="editor-theme-preview-card mb-4 overflow-hidden p-0" aria-label="代码源码字体样本"><p className="editor-theme-preview-caption mb-0 border-b border-line bg-panel px-3 py-2">代码源码 · CSS / JSON / HTML</p><pre data-font-role="editorSource" className="bg-editor-surface p-3 whitespace-pre-wrap break-words font-editor-source text-xs text-editor-text"><span className="text-editor-text">{'const theme = { name: "Rainy", enabled: true };\n.article { color: var(--color-primary); }'}</span></pre></section><section className="editor-theme-preview-card mb-4" aria-label="文字选区与强调样本"><p className="editor-theme-preview-caption">选区与强调</p><p className="flex flex-wrap items-center gap-2 rounded bg-editor-surface p-2 text-xs"><mark className="rounded bg-selection/60 px-2 py-1 text-editor-text">已选文字</mark><span className="rounded border border-accent-line bg-accent-soft px-2 py-1 text-accent-text">关键内容</span><span className="rounded bg-accent px-2 py-1 text-on-accent">主题主色</span></p></section><section className="editor-theme-preview-card overflow-hidden p-0" aria-label="文章写作源码字体样本"><p className="editor-theme-preview-caption mb-0 border-b border-line bg-panel px-3 py-2">文章写作源码 · Markdown</p><pre data-font-role="articleSource" className="m-0 bg-editor-surface p-3 whitespace-pre-wrap wrap-anywhere font-article-source text-editor-source text-editor-text">{tokenizeEditorSource(SAMPLE).map((segment, index) => <span key={index} className={segment.tone ? { syntax: 'text-editor-syntax', heading: 'text-editor-heading', quote: 'text-editor-quote' }[segment.tone] : 'text-editor-text'}>{segment.text}</span>)}</pre></section></div></div></div>
    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line bg-panel p-3"><div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-warning-line bg-warning-surface px-3 py-2 text-2xs" aria-label="警告状态样本"><strong className="font-semibold text-warning-strong">自动保存暂停</strong><span className="text-warning">本地目录待连接</span></div><div className="flex shrink-0 items-center gap-2"><button type="button" className="button button-danger">删除</button><button type="button" className="button button-primary">测试按钮</button></div></footer>
  </div></ThemeInspectionPreview>;
}

export function EditorThemeDesigner({ source, themes, appearanceScheme, navigationGuardRef, onClose, onSave, editing = false }: {
  source: EditorTheme; themes: EditorTheme[]; navigationGuardRef: MutableRefObject<NavigationGuard | null>;
  appearanceScheme: EditorColorScheme;
  onClose: () => void; onSave: (theme: EditorTheme) => Promise<boolean>;
  editing?: boolean;
}) {
  const [draft, setDraft] = useState(() => editing ? { ...forkEditorTheme(source), id: source.id, name: source.name, version: source.version } : forkEditorTheme(source));
  const inspection = useThemeInspection();
  const initial = useRef(JSON.stringify(draft));
  const [mode, setMode] = useState<EditorColorScheme>(appearanceScheme);
  useEffect(() => { inspection.clear(); setMode(appearanceScheme); }, [appearanceScheme]);
  const [colorsOpen, setColorsOpen] = useState(true);
  const [fontsOpen, setFontsOpen] = useState(true);
  const [colorPicker, setColorPicker] = useState<{ scheme: EditorColorScheme; role?: EditorColorRole; key?: string; label?: string; token?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [departure, setDeparture] = useState<(() => void) | null>(null);
  const busyRef = useRef(false);
  const dirty = JSON.stringify(draft) !== initial.current;
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const errors = validateEditorTheme(draft);
  if (themes.some(theme => theme.id === draft.id && (!editing || theme.id !== source.id))) errors.push(`文件名 ${draft.id}.json 已存在。`);
  const availableFonts = [...themes.flatMap(theme => Object.values(theme.fonts)), ...Object.values(draft.fonts)];
  const extraColors = uniqueBindings((['light', 'dark'] as const).flatMap(scheme => Object.values(surfaceBindings(draft, scheme)).flat())).filter(binding => binding.key.startsWith('surface:'));
  useEffect(() => { if (inspection.selected) setColorsOpen(true); }, [inspection.selected]);
  const close = () => {
    if (busyRef.current) return;
    if (dirtyRef.current) setDeparture(() => onClose); else onClose();
  };
  const save = async () => {
    if (busyRef.current || errors.length || (editing && !dirtyRef.current)) return false;
    busyRef.current = true; setSaving(true); setError('');
    try {
      const saved = await onSave(parseEditorThemeJson(JSON.stringify(draft)));
      if (!saved) setError('主题保存失败，修改已保留。');
      return saved;
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); return false; }
    finally { busyRef.current = false; setSaving(false); }
  };
  useEffect(() => {
    navigationGuardRef.current = proceed => {
      if (busyRef.current) return true;
      if (dirtyRef.current) { setDeparture(() => () => { onClose(); proceed(); }); return true; }
      onClose(); return false;
    };
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirtyRef.current || busyRef.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { navigationGuardRef.current = null; window.removeEventListener('beforeunload', beforeUnload); };
  }, [navigationGuardRef, onClose]);

  return <>
    <DialogFrame large titleId="editor-theme-designer-title" descriptionId="editor-theme-designer-description" onClose={close} dismissible={!saving && !colorPicker} focusActive={!colorPicker && !departure}>
      <DialogHeader titleId="editor-theme-designer-title" eyebrow="EDITOR THEME DESIGNER" title={editing ? '编辑编辑器主题' : '新建编辑器主题'} onClose={close} closeDisabled={saving} />
      <div className="shrink-0 border-b border-line p-4"><div className="grid min-w-0 gap-3 md:grid-cols-3"><label className="grid min-w-0 gap-2 text-xs text-muted">主题名称<input className="field w-full min-w-0" value={draft.name} maxLength={80} disabled={saving} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></label><label className="grid min-w-0 gap-2 text-xs text-muted">文件名（不含 .json）<input className="field w-full min-w-0 font-mono" value={draft.id} maxLength={48} autoCapitalize="none" spellCheck={false} disabled={saving} aria-describedby="editor-theme-id-hint" onChange={event => setDraft(current => ({ ...current, id: event.target.value }))} /></label><label className="grid min-w-0 gap-2 text-xs text-muted">版本号<input className="field w-full min-w-0 font-mono" value={draft.version} maxLength={32} spellCheck={false} disabled={saving} aria-describedby="editor-theme-version-hint" onChange={event => setDraft(current => ({ ...current, version: event.target.value }))} /></label></div><div className="mt-2 grid gap-1 text-2xs text-faint md:grid-cols-3"><span /><span id="editor-theme-id-hint" className="break-all">保存到当前资料库：themes/editor-themes/{draft.id || '<id>'}.json{editing && source.id === BASE_EDITOR_THEME.id && draft.id !== source.id ? '；基础主题原文件保留。' : ''}</span><span id="editor-theme-version-hint">版本不改时，保存自动递增末位。</span></div></div>
      <p id="editor-theme-designer-description" className="shrink-0 p-4 text-xs text-muted">分别调整浅色与深色配色，右侧预览当前主题的配色与字体；未保存的修改只作用于此预览。文字大小与排版保持统一。</p>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent lg:flex-row lg:overflow-hidden">
        <aside ref={inspection.listRef} {...inspection.listProps} className="flex h-96 min-h-0 shrink-0 flex-col gap-4 lg:h-auto lg:w-96" aria-label="主题颜色与字体">
          <CollapsiblePanel id="editor-theme-colors" title="颜色" icon={<PanelIcon kind="colors" />} count={EDITOR_COLOR_ROLES.length + extraColors.length} open={colorsOpen} onToggle={() => setColorsOpen(current => !current)} className="data-[open=true]:flex-1 data-[open=false]:shrink-0" contentClassName="flex flex-1 flex-col pb-2">
            <><div className="flex shrink-0 items-center justify-between gap-3 border-b border-line pb-2 text-2xs text-faint"><span>语义角色</span><div className="flex gap-3"><span className="w-8 text-center">浅色</span><span className="w-8 text-center">深色</span></div></div><div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent" aria-label="颜色角色列表" onClick={event => { if (event.target === event.currentTarget) inspection.clear(); }}>{EDITOR_COLOR_ROLES.map(role => <div key={role} {...inspection.rowProps(role)} className={`flex items-center justify-between gap-3 border-b border-line/60 py-3 last:border-0 ${INSPECTION_ROW_CLASSES}`}><div className="min-w-0"><p className="text-xs font-medium text-primary">{COLOR_LABELS[role]}</p><p className="mt-1 break-all font-mono text-2xs text-faint">--color-{role}</p></div><div className="flex shrink-0 gap-3">{(['light', 'dark'] as const).map(scheme => <ColorSwatchButton key={scheme} color={draft.palette[draft.colors[scheme][role]]} colorName={draft.colors[scheme][role]} type="button" data-color-swatch="true" className="size-8 shrink-0 rounded-full border border-line-strong hover:ring-2 hover:ring-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed" aria-label={`${scheme}.${role}`} aria-haspopup="dialog" disabled={saving} onClick={() => setColorPicker({ scheme, role })} />)}</div></div>)}{extraColors.map(binding => { const scheme = binding.key.split(':')[1] as EditorColorScheme; return <div key={binding.key} {...inspection.rowProps(binding.key)} className={`flex items-center justify-between gap-3 border-t border-line py-3 ${INSPECTION_ROW_CLASSES}`}><div className="min-w-0"><p className="text-xs font-medium text-primary">{binding.label} · {scheme === 'light' ? '浅色' : '深色'}</p><p className="mt-1 break-all font-mono text-2xs text-faint">{binding.token}</p></div><ColorSwatchButton color={draft.palette[binding.value!]} className="size-8 shrink-0 rounded-full border border-line-strong focus-visible:outline-2 focus-visible:outline-accent" disabled={saving} aria-label={`修改${binding.label}`} onClick={() => setColorPicker({ scheme, key: binding.value, label: binding.label, token: binding.token })} /></div>; })}</div></>
          </CollapsiblePanel>
          <CollapsiblePanel id="editor-theme-fonts" title="字体" icon={<PanelIcon kind="fonts" />} count={FONT_ROLES.length} open={fontsOpen} onToggle={() => setFontsOpen(current => !current)} className="data-[open=true]:flex-1 data-[open=false]:shrink-0" contentClassName="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent" contentLabel="字体角色列表">
            <div className="grid gap-4">{FONT_ROLES.map(role => <label key={role} className="grid gap-2"><span><span className="block text-xs font-medium text-primary">{FONT_LABELS[role]}</span><span className="mt-1 block font-mono text-2xs text-faint">{FONT_TOKENS[role]}</span></span><select className="field" aria-label={`字体：${FONT_LABELS[role]}`} value={canonicalFontStack(draft.fonts[role])} disabled={saving} onChange={event => setDraft(current => ({ ...current, fonts: { ...current.fonts, [role]: event.target.value } }))}>{fontOptions([draft.fonts[role], ...availableFonts], role === 'editorSource' || role === 'mono').map(font => <option key={font.value} value={font.value}>{font.label}</option>)}</select></label>)}</div>
          </CollapsiblePanel>
        </aside>
        <div className="flex min-h-80 min-w-0 flex-1 flex-col gap-3 lg:min-h-0"><div className="flex shrink-0 flex-wrap items-center justify-between gap-3"><p className="text-xs font-medium text-muted">编辑器预览<span className="ml-2 font-normal text-faint" role="status">{dirty || !editing ? '未保存草稿' : '已保存配色'}{mode !== appearanceScheme ? ' · 临时显示模式' : ''}</span></p><div className="flex gap-1 rounded-lg bg-list p-1" aria-label="编辑器预览模式">{(['light', 'dark'] as const).map(scheme => <button type="button" key={scheme} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted aria-pressed:bg-panel aria-pressed:text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" aria-pressed={mode === scheme} onClick={() => { inspection.clear(); setMode(scheme); }}><svg className="size-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{scheme === 'light' ? <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2.5 12h2m15 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></> : <path d="M19.5 15.7A8.4 8.4 0 0 1 8.3 4.5 8.6 8.6 0 1 0 19.5 15.7Z" />}</svg>{scheme === 'light' ? '浅色' : '深色'}</button>)}</div></div><Preview key={mode} theme={draft} mode={mode} inspection={inspection} /></div>
      </div>
      <DialogFooter className="pt-4">{error || errors.length ? <p role="alert" className="mb-3 text-xs text-danger">{error || errors.join('；')}</p> : null}<DialogActions><DialogButton disabled={saving} onClick={close}><svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>取消</DialogButton><DialogButton variant="primary" disabled={saving || Boolean(errors.length) || (editing && !dirty)} onClick={() => void save().then(saved => { if (saved) onClose(); })}><svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 4h13l3 3v13H4V4ZM8 4v6h8V4M8 20v-6h8v6" /></svg>{saving ? '保存中…' : '保存主题'}</DialogButton></DialogActions></DialogFooter>
    </DialogFrame>
    {colorPicker ? <EditorColorPicker label={colorPicker.label ?? COLOR_LABELS[colorPicker.role!]} token={colorPicker.token ?? `--color-${colorPicker.role}`} modeLabel={colorPicker.scheme === 'light' ? '浅色' : '深色'} value={draft.palette[colorPicker.key ?? draft.colors[colorPicker.scheme][colorPicker.role!]]} onClose={() => setColorPicker(null)} onSelect={hex => setDraft(current => ({ ...current, palette: { ...current.palette, [colorPicker.key ?? current.colors[colorPicker.scheme][colorPicker.role!]]: hex } }))} /> : null}
    {departure ? <UnsavedChangesDialog entries={[{ label: draft.name || '新编辑器主题', detail: '颜色与字体尚未保存' }]} description="新主题有未保存的内容。" saveLabel="保存并继续" saveDisabled={Boolean(errors.length)} onCancel={() => setDeparture(null)} onDiscard={departure} onSave={async () => { if (!await save()) return false; departure(); return true; }} /> : null}
  </>;
}
