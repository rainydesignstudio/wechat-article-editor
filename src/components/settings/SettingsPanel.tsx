'use client';

import { PageHeading } from '../global/PageHeading';

import { ButtonBar } from '../global/ButtonBar';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from '../global/DialogFrame';
import { UnsavedChangesDialog } from '../global/UnsavedChangesDialog';
import { EditorThemeDesigner } from './EditorThemeDesigner';
import type { NavigationGuard } from '../../hooks/useRouteNavigation';
import type { ArticleSettings } from '../../lib/articleSettings';
import { BASE_EDITOR_THEME, EDITOR_COLOR_ROLES, findEditorTheme, resolveEditorThemeColors, type EditorTheme, type EditorColorScheme, type EditorColorRole } from '../../lib/editorThemes';
import type { EditorThemeIssue } from '../../lib/editorThemeLibrary';
import {
  DEFAULT_EDITOR_APPEARANCE,
  EDITOR_COLOR_MODES,
  type EditorAppearance,
  type EditorColorMode,
  type EditorWorkspace,
} from '../../lib/editorWorkspace';

type Props = {
  root: FileSystemDirectoryHandle | null;
  directoryName: string | null;
  rememberedDirectoryName: string | null;
  directoryRestoreState: 'checking' | 'idle' | 'permission-needed';
  directoryBookmarkIssue: string | null;
  directoryStatus: { label: string; tone: 'neutral' | 'success' | 'warning' | 'error' };
  fileSystemReady: boolean;
  settings: ArticleSettings;
  issue: string | null;
  notice: { label: string; tone: 'neutral' | 'success' | 'warning' | 'error' };
  busy: boolean;
  workspace: EditorWorkspace;
  workspaceIssue: string | null;
  workspaceBusy: boolean;
  editorThemes: EditorTheme[];
  editorThemeIssues: EditorThemeIssue[];
  onSave: (settings: ArticleSettings) => void;
  onAuthorizeDirectory: () => void;
  onCreateDirectory: () => void;
  onReopenRememberedDirectory: () => void;
  onSaveAppearance: (appearance: EditorAppearance) => Promise<boolean>;
  onCreateEditorTheme: (theme: EditorTheme, previous?: EditorTheme, expectedRoot?: FileSystemDirectoryHandle) => Promise<boolean>;
  onLoadDefaultEditorThemes: () => Promise<boolean>;
  onDeleteEditorTheme: (id: string, expectedRoot?: FileSystemDirectoryHandle) => Promise<boolean>;
  onPreviewAppearance: (appearance: EditorAppearance | null) => void;
  registerNavigationGuard: (guard: NavigationGuard) => () => void;
};

function SettingsIcon({ name }: { name: 'folder' | 'upload' | 'download' | 'export' | 'reset' | 'undo' | 'check' | 'save' | 'plus' | 'document' | 'theme' | 'history' | 'clock' | 'edit' | 'delete' }) {
  const paths = {
    edit: 'm4 16 12-12 4 4L8 20H4v-4Zm10-10 4 4',
    delete: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
    folder: 'M3 7V5h6l2 2h10v13H3V7Z',
    upload: 'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',
    download: 'M12 3v13m-5-5 5 5 5-5M4 15v6h16v-6',
    export: 'M14 3h7v7M21 3l-9 9M10 4H4v16h16v-6',
    reset: 'M4 10a8 8 0 1 1 1 8M4 4v6h6',
    undo: 'm8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12',
    check: 'm4 12 5 5L20 6',
    save: 'M4 4h13l3 3v13H4V4ZM8 4v6h8V4M8 20v-6h8v6',
    plus: 'M12 5v14M5 12h14',
    document: 'M5 3h9l5 5v13H5V3ZM14 3v5h5M9 12h6M9 16h4',
    theme: 'M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h3a5 5 0 0 0 5-5c0-3-4-5-9-5Z',
    history: 'M4 10a8 8 0 1 1 1 8M4 4v6h6M12 7v5l3 2',
    clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  };
  return <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

function sameAppearance(left: EditorAppearance, right: EditorAppearance) {
  return left.themeId === right.themeId && left.colorMode === right.colorMode
    && Boolean(left.custom) === Boolean(right.custom)
    && left.custom?.colorThemeId === right.custom?.colorThemeId
    && left.custom?.fontThemeId === right.custom?.fontThemeId;
}

const COLOR_SWATCH_BACKGROUNDS: Record<EditorColorRole, string> = {
  'canvas': 'bg-canvas',
  'rail': 'bg-rail',
  'list': 'bg-list',
  'panel': 'bg-panel',
  'hover': 'bg-hover',
  'popup-bg': 'bg-popup-bg',
  'primary': 'bg-primary',
  'secondary': 'bg-secondary',
  'muted': 'bg-muted',
  'faint': 'bg-faint',
  'popup-text': 'bg-popup-text',
  'line': 'bg-line',
  'line-strong': 'bg-line-strong',
  'accent': 'bg-accent',
  'accent-strong': 'bg-accent-strong',
  'accent-text': 'bg-accent-text',
  'accent-soft': 'bg-accent-soft',
  'accent-line': 'bg-accent-line',
  'selection': 'bg-selection',
  'on-accent': 'bg-on-accent',
  'success': 'bg-success',
  'success-surface': 'bg-success-surface',
  'warning': 'bg-warning',
  'warning-strong': 'bg-warning-strong',
  'warning-surface': 'bg-warning-surface',
  'warning-line': 'bg-warning-line',
  'danger': 'bg-danger',
  'on-danger': 'bg-on-danger',
  'editor-surface': 'bg-editor-surface',
  'editor-text': 'bg-editor-text',
  'editor-syntax': 'bg-editor-syntax',
  'editor-heading': 'bg-editor-heading',
  'editor-quote': 'bg-editor-quote',
};

// The twelve roles that carry a theme's identity, laid out four to a row in three families:
// surface and hairline, then the type ramp, then the accent family and the status colours. Roles
// are drawn from different families on purpose — themes routinely alias `list` to `canvas` and
// `secondary` to `primary`, and picking both of a pair would show the same colour twice.
const THEME_PALETTE_ROLES: EditorColorRole[] = [
  'canvas', 'panel', 'line-strong', 'muted',
  'primary', 'accent-soft', 'accent', 'accent-strong',
  'selection', 'success', 'warning', 'danger',
];

function ThemeSample({ theme, kind = 'both', scheme = 'light' }: { theme: EditorTheme; kind?: 'both' | 'colors' | 'fonts'; scheme?: EditorColorScheme }) {
  const colors = resolveEditorThemeColors(theme, scheme);
  const tokens = Object.fromEntries(EDITOR_COLOR_ROLES.map((role) => [`--color-${role}`, colors[role]])) as CSSProperties;
  const fonts = { '--font-heading': theme.fonts.heading, '--font-sans': theme.fonts.ui } as CSSProperties;
  if (kind === 'colors') {
    const roles = EDITOR_COLOR_ROLES.filter((role) => role !== 'accent');
    const rows = [roles.slice(0, 16), roles.slice(16)];
    return <span className="flex overflow-hidden rounded-lg border border-line" aria-hidden="true" style={tokens}><span className="aspect-square w-1/3 shrink-0 bg-accent" data-color-role="accent" /><span className="flex min-w-0 flex-1 flex-col">{rows.map((row, index) => <span key={index} className="flex min-h-0 flex-1">{row.map((role) => <span key={role} className={`min-w-0 flex-1 ${COLOR_SWATCH_BACKGROUNDS[role]}`} data-color-role={role} />)}</span>)}</span></span>;
  }
  if (kind === 'fonts') return <span className="grid gap-1" style={fonts}><span className="font-heading text-lg text-primary">文稿 Aa</span><span className="font-sans text-xs text-muted">把想法留在文字里。</span></span>;
  // The ring is drawn in the theme's own `line-strong`, so a swatch that matches the card surface
  // still reads as a distinct dot instead of disappearing into it.
  return <span className="flex min-w-0 items-center justify-between gap-4 rounded-lg border p-4" aria-hidden="true" style={{ ...tokens, ...fonts, background: colors.canvas, borderColor: colors.line }}>
    <span className="grid min-w-0 gap-3"><span className="font-heading text-lg font-semibold" style={{ color: colors.primary }}>文稿 Aa</span><span className="font-sans text-xs" style={{ color: colors.secondary }}>文字，让下一篇从容开始。</span></span>
    <span className="grid w-fit shrink-0 grid-cols-4 gap-1.5">{THEME_PALETTE_ROLES.map((role) => <i key={role} className={`size-3 rounded-full ring-1 ring-line-strong ${COLOR_SWATCH_BACKGROUNDS[role]}`} data-color-role={role} />)}</span>
  </span>;
}

const SETTINGS_TABS = [
  { id: 'library', label: '本地目录', icon: 'folder' },
  { id: 'appearance', label: '外观', icon: 'theme' },
  { id: 'workflow', label: '自动保存', icon: 'clock' },
] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number]['id'];

export function SettingsPanel({
  root,
  directoryName,
  rememberedDirectoryName,
  directoryRestoreState,
  directoryBookmarkIssue,
  directoryStatus,
  fileSystemReady,
  settings,
  issue,
  notice,
  busy,
  workspace,
  workspaceIssue,
  workspaceBusy,
  editorThemes,
  editorThemeIssues,
  onSave,
  onAuthorizeDirectory,
  onCreateDirectory,
  onReopenRememberedDirectory,
  onSaveAppearance,
  onCreateEditorTheme,
  onLoadDefaultEditorThemes,
  onDeleteEditorTheme,
  onPreviewAppearance,
  registerNavigationGuard,
}: Props) {
  const [tab, setTab] = useState<SettingsTab>('library');
  const [directoryActionRequested, setDirectoryActionRequested] = useState(false);
  const [draft, setDraft] = useState(settings);
  const [appearanceDraft, setAppearanceDraft] = useState(workspace.appearance);
  const [appearanceEdited, setAppearanceEdited] = useState(false);
  const [appearanceSaving, setAppearanceSaving] = useState(false);
  const [appearanceSaved, setAppearanceSaved] = useState(false);
  const [departure, setDeparture] = useState<{ proceed: () => void } | null>(null);
  const appearanceGuardRef = useRef({ dirty: false, busy: false });
  const [combination, setCombination] = useState<EditorAppearance['custom']>(null);
  const [systemDark, setSystemDark] = useState(false);
  const previewScheme: EditorColorScheme = appearanceDraft.colorMode === 'system' ? (systemDark ? 'dark' : 'light') : appearanceDraft.colorMode;
  const appearanceDirty = appearanceEdited && !sameAppearance(appearanceDraft, workspace.appearance);
  appearanceGuardRef.current = { dirty: appearanceDirty, busy: busy || workspaceBusy || appearanceSaving };
  const [appearanceNotice, setAppearanceNotice] = useState('外观偏好分别保存在当前资料目录。');
  const savedColorModeRef = useRef(workspace.appearance.colorMode);
  const [designerSource, setDesignerSource] = useState<EditorTheme | null>(null);
  const [designerEditing, setDesignerEditing] = useState(false);
  const [deleteThemeTarget, setDeleteThemeTarget] = useState<EditorTheme | null>(null);
  const deleteThemeRootRef = useRef<FileSystemDirectoryHandle | null>(null);
  const themeImportRef = useRef<HTMLInputElement | null>(null);
  const designerGuardRef = useRef<NavigationGuard | null>(null);
  const missingThemeIds = [appearanceDraft.custom?.colorThemeId ?? appearanceDraft.themeId, appearanceDraft.custom?.fontThemeId ?? appearanceDraft.themeId]
    .filter((id, index, ids) => ids.indexOf(id) === index && !findEditorTheme(editorThemes, id));
  useEffect(() => setDraft(settings), [root, settings]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setSystemDark(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    if (!appearanceEdited) setAppearanceDraft(workspace.appearance);
    else if (savedColorModeRef.current !== workspace.appearance.colorMode) {
      setAppearanceDraft((current) => ({ ...current, colorMode: workspace.appearance.colorMode }));
    }
    savedColorModeRef.current = workspace.appearance.colorMode;
  }, [appearanceEdited, workspace.appearance]);
  useEffect(() => {
    onPreviewAppearance(appearanceDirty ? appearanceDraft : null);
  }, [appearanceDirty, appearanceDraft, onPreviewAppearance]);
  useEffect(() => () => onPreviewAppearance(null), [onPreviewAppearance]);
  useEffect(() => registerNavigationGuard((proceed) => {
    if (appearanceGuardRef.current.busy) return true;
    if (designerGuardRef.current?.(() => {
      if (appearanceGuardRef.current.dirty) setDeparture({ proceed }); else proceed();
    })) return true;
    if (!appearanceGuardRef.current.dirty) return false;
    setDeparture({ proceed });
    return true;
  }), [registerNavigationGuard]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!appearanceGuardRef.current.dirty && !appearanceGuardRef.current.busy) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  const tabBusy = busy || workspaceBusy || appearanceSaving;
  const appearanceDisabled = !root || tabBusy || Boolean(workspaceIssue);
  const appearanceActionsDisabled = appearanceDisabled || !appearanceDirty;
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: SettingsTab) => {
    if (tabBusy) return;
    const index = SETTINGS_TABS.findIndex((item) => item.id === current);
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? SETTINGS_TABS.length - 1
      : event.key === 'ArrowRight' ? (index + 1) % SETTINGS_TABS.length
      : event.key === 'ArrowLeft' ? (index + SETTINGS_TABS.length - 1) % SETTINGS_TABS.length : null;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = SETTINGS_TABS[nextIndex].id;
    setTab(next);
    document.getElementById(`settings-tab-${next}`)?.focus();
  };

  const handleSettingsSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(draft);
  };

  const changeAppearance = (next: EditorAppearance) => {
    if (appearanceDisabled) return;
    appearanceGuardRef.current.dirty = !sameAppearance(next, workspace.appearance);
    setAppearanceDraft(next);
    setAppearanceEdited(true);
    setAppearanceSaved(false);
    setAppearanceNotice('正在预览，保存后才会写入资料目录。');
  };

  const selectColorMode = (mode: EditorColorMode) => changeAppearance({ ...appearanceDraft, colorMode: mode });

  const cancelAppearance = () => {
    appearanceGuardRef.current.dirty = false;
    setAppearanceDraft(workspace.appearance);
    setAppearanceEdited(false);
    setAppearanceSaved(false);
    onPreviewAppearance(null);
    setAppearanceNotice('已取消变更，恢复已保存的外观。');
  };

  const saveAppearance = async () => {
    if (appearanceActionsDisabled || missingThemeIds.length || appearanceGuardRef.current.busy) return false;
    appearanceGuardRef.current.busy = true;
    setAppearanceSaving(true);
    try {
      const saved = await onSaveAppearance(appearanceDraft);
      if (saved) {
        appearanceGuardRef.current.dirty = false;
        setAppearanceEdited(false);
        setAppearanceSaved(true);
        onPreviewAppearance(null);
      }
      setAppearanceNotice(saved ? '编辑器外观已保存。' : '保存失败，预览和未保存修改已保留。');
      return saved;
    } catch {
      setAppearanceNotice('保存失败，预览和未保存修改已保留。');
      return false;
    } finally {
      appearanceGuardRef.current.busy = false;
      setAppearanceSaving(false);
    }
  };

  const resetAppearance = () => {
    changeAppearance({ ...DEFAULT_EDITOR_APPEARANCE });
    setAppearanceNotice(sameAppearance(DEFAULT_EDITOR_APPEARANCE, workspace.appearance) ? '已恢复默认外观，没有待保存变更。' : '已预览雨青默认外观，保存后生效。');
  };

  const openThemeDesigner = () => {
    const colorTheme = findEditorTheme(editorThemes, appearanceDraft.custom?.colorThemeId ?? appearanceDraft.themeId) ?? editorThemes[0] ?? BASE_EDITOR_THEME;
    const fontTheme = findEditorTheme(editorThemes, appearanceDraft.custom?.fontThemeId ?? appearanceDraft.themeId) ?? colorTheme;
    setDesignerEditing(false);
    setDesignerSource({ ...colorTheme, fonts: { ...fontTheme.fonts } });
  };

  return (
    <section className="page-card overflow-hidden" aria-labelledby="settings-title">
      <PageHeading>
        <div className="min-w-0">
          <p id="settings-kicker" className="eyebrow">WORKSPACE SETTINGS</p>
          <h2 id="settings-title" className="page-title font-heading">偏好与保存</h2>
          <p className="mt-3 text-sm text-muted">安排你的写作环境，让文稿在本地安心保存。</p>
        </div>
        <div className="flex min-w-0 items-center gap-3 rounded-lg border border-line bg-list px-4 py-3 text-sm data-[ready=true]:border-accent-line data-[ready=true]:bg-accent-soft" data-ready={Boolean(root)}>
          <span className="size-2 shrink-0 rounded-full bg-faint" aria-hidden="true" />
          <div className="min-w-0"><p className="text-xs text-faint">{root ? '当前资料目录' : rememberedDirectoryName ? '上次资料目录' : '资料目录未选择'}</p><strong className="block max-w-64 truncate font-medium text-primary">{directoryName ?? rememberedDirectoryName ?? '选择一个本地目录'}</strong></div>
        </div>
      </PageHeading>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-panel">
        <div className="shrink-0 overflow-x-auto border-b border-line px-4 py-3 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent md:px-6">
          <div className="flex w-max gap-1 rounded-lg bg-list p-1" role="tablist" aria-label="设置分类">
            {SETTINGS_TABS.map((item) => <button key={item.id} id={`settings-tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls={`settings-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} disabled={tabBusy} onClick={() => setTab(item.id)} onKeyDown={(event) => onTabKeyDown(event, item.id)} className="flex min-h-9 items-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-hover hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 aria-selected:bg-panel aria-selected:text-accent-text">
              <SettingsIcon name={item.icon} />{item.label}{item.id === 'appearance' && appearanceDirty ? <span className="size-1.5 rounded-full bg-accent" aria-label="外观有未保存修改" /> : null}
            </button>)}
          </div>
        </div>

        <section id="settings-panel-library" role="tabpanel" aria-labelledby="settings-tab-library" hidden={tab !== 'library'} tabIndex={0} className="min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:p-8">
          <div className="grid gap-6">
            <div><p className="eyebrow">LOCAL LIBRARY</p><h3 id="library-title" className="mt-1 font-heading text-xl font-semibold text-primary">本地资料库</h3><p className="mt-3 text-sm text-muted">管理文稿的保存位置与访问权限。</p></div>
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-list/50 p-4 md:p-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-text" aria-hidden="true"><SettingsIcon name="folder" /></span>
              <h4 className="min-w-0 flex-1 break-all font-sub-heading text-lg font-semibold text-primary">{directoryName ?? rememberedDirectoryName ?? '选择你的资料目录'}</h4>
              <span className="flex items-center gap-2 rounded-md bg-list px-3 py-2 text-xs text-muted"><span className="size-1.5 rounded-full bg-faint data-[ready=true]:bg-success" data-ready={Boolean(root)} aria-hidden="true" />{root ? '已连接 · 可读写' : directoryRestoreState === 'checking' ? '正在检查上次目录' : rememberedDirectoryName ? '等待授权' : '尚未连接'}</span>
              <ButtonBar label="资料目录操作">
                {!root && rememberedDirectoryName ? <button className="button button-primary" type="button" disabled={!fileSystemReady || tabBusy} onClick={() => { setDirectoryActionRequested(true); onReopenRememberedDirectory(); }}><SettingsIcon name="folder" />授权并打开</button> : null}
                <button className={!root && !rememberedDirectoryName ? 'button button-primary' : 'button button-quiet'} type="button" disabled={!fileSystemReady || tabBusy} onClick={() => { setDirectoryActionRequested(true); onAuthorizeDirectory(); }}><SettingsIcon name="export" />打开已有资料库</button>
                <button className="button button-quiet" type="button" disabled={!fileSystemReady || tabBusy} aria-haspopup="dialog" onClick={() => {
                  const proceed = () => onCreateDirectory();
                  if (appearanceGuardRef.current.dirty) setDeparture({ proceed }); else proceed();
                }}><SettingsIcon name="plus" />新建资料库</button>
              </ButtonBar>
            </div>
            {directoryActionRequested && directoryStatus.tone !== 'neutral' ? <p className="status-copy" data-tone={directoryStatus.tone} role="status">{directoryStatus.label}</p> : null}
            {!fileSystemReady ? <p className="text-xs text-warning-strong" role="status">当前浏览器不支持本地目录读写，请使用支持此功能的桌面浏览器。</p> : null}
            {directoryBookmarkIssue ? <p className="rounded-lg border border-warning-line bg-warning-surface p-4 text-sm text-warning-strong" role="alert">{directoryBookmarkIssue}</p> : null}
            {workspaceIssue ? <p className="rounded-lg border border-warning-line bg-warning-surface p-4 text-sm text-warning-strong" role="alert">{workspaceIssue} 为保护原文件，项目组织和外观设置保持只读。</p> : null}
            <div className="grid gap-5 md:grid-cols-2">
              <div className="flex items-start gap-3"><span className="mt-0.5 text-faint"><SettingsIcon name="document" /></span><div><h4 className="text-sm font-medium text-primary">文稿与素材</h4><p className="mt-2 text-xs text-muted">正文、图片与文章主题快照，保存在同一份资料库中。</p></div></div>
              <div className="flex items-start gap-3"><span className="mt-0.5 text-faint"><SettingsIcon name="theme" /></span><div><h4 className="text-sm font-medium text-primary">模板与偏好</h4><p className="mt-2 text-xs text-muted">片段、起稿模板、项目组织和编辑器外观，随资料目录分别保存。</p></div></div>
            </div>
            <div className="grid gap-2 border-t border-line pt-5 text-xs text-muted"><p className="flex items-start gap-2"><SettingsIcon name="history" />{root ? '已记住此目录，权限有效时刷新后可继续。' : rememberedDirectoryName ? '已记住上次目录，授权后可直接打开。' : '应用会记住你的选择，权限有效时刷新后自动打开。'}</p><p className="text-faint">更换目录会打开另一份资料库，原目录中的文件保留。</p></div>
          </div>
        </section>

        <section id="settings-panel-appearance" role="tabpanel" aria-labelledby="settings-tab-appearance" hidden={tab !== 'appearance'} tabIndex={0} className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-hidden p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:p-8">
          <header className="flex shrink-0 flex-wrap items-start justify-between gap-4">
            <div className="min-w-0"><p className="eyebrow">EDITOR APPEARANCE</p><h3 id="appearance-title" className="mt-1 font-heading text-xl font-semibold text-primary">挑个喜欢的主题</h3><p className="mt-3 text-sm text-muted">点击主题即时预览，保存后才会保留；文章排版单独管理。</p></div>
            <ButtonBar label="编辑器主题操作"><button className="button button-quiet" type="button" disabled={appearanceDisabled} onClick={() => themeImportRef.current?.click()}><SettingsIcon name="upload" />导入 JSON</button><input ref={themeImportRef} className="sr-only" type="file" accept=".json,application/json" aria-label="导入编辑器主题 JSON" disabled={appearanceDisabled} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void file.text().then(raw => JSON.parse(raw) as EditorTheme).then(theme => root ? onCreateEditorTheme(theme, undefined, root) : false).then(saved => setAppearanceNotice(saved ? '编辑器主题已导入。' : '导入失败，请检查主题 JSON 或同名文件。')).catch(error => setAppearanceNotice(String(error))); }} /><button className="button button-quiet" type="button" disabled={appearanceDisabled} onClick={() => void onLoadDefaultEditorThemes().then(saved => setAppearanceNotice(saved ? '默认主题已添加，已有文件保留。' : '默认主题载入失败，请查看文件诊断。'))}><SettingsIcon name="download" />载入默认主题</button><button className="button button-primary" type="button" disabled={appearanceDisabled} onClick={openThemeDesigner}><SettingsIcon name="plus" />新建编辑器主题</button></ButtonBar>
          </header>
          {!root || workspaceIssue || missingThemeIds.length || editorThemeIssues.length ? <div className="grid max-h-24 shrink-0 gap-2 overflow-y-auto rounded-lg bg-list px-4 py-3 text-xs text-muted" role="status">
            {!root ? <p>连接资料目录后，即可选择并保存编辑器主题。</p> : null}
            {workspaceIssue ? <p className="text-warning-strong" role="alert">{workspaceIssue} 外观设置保持只读。</p> : null}
            {missingThemeIds.length ? <p className="text-warning-strong" role="alert">找不到所选主题：{missingThemeIds.join('、')}。暂以基础主题显示，将对应 JSON 放入 themes/editor-themes/ 后刷新可恢复。</p> : null}
            {editorThemeIssues.length ? <p className="text-warning-strong" role="alert">{editorThemeIssues.map((item) => `${item.file}：${item.message}`).join('；')}</p> : null}
          </div> : null}
          <fieldset className="min-w-0 shrink-0"><legend className="mb-2 text-sm font-medium text-primary">显示模式</legend><div className="flex flex-wrap gap-2">{EDITOR_COLOR_MODES.map((mode) => <button key={mode.id} className="min-h-9 rounded-lg border border-line bg-panel px-4 py-2 text-sm text-muted transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 aria-pressed:border-accent-line aria-pressed:bg-accent-soft aria-pressed:text-accent-text" type="button" aria-pressed={appearanceDraft.colorMode === mode.id} disabled={appearanceDisabled} onClick={() => selectColorMode(mode.id)}>{mode.label}</button>)}</div></fieldset>
          <fieldset className="flex min-h-0 min-w-0 flex-1 flex-col">
            <legend className="mb-3 text-sm font-medium text-primary">编辑器主题</legend>
            <div className="min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-scroll p-1 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent" tabIndex={0} role="region" aria-label="编辑器主题列表">
              <div className="grid content-start gap-3 md:grid-cols-2 xl:grid-cols-4">
                {editorThemes.map((theme) => {
                  const selected = !appearanceDraft.custom && appearanceDraft.themeId === theme.id;
                  return <div key={theme.id} className="group relative min-w-0"><button className="grid w-full min-w-0 content-start gap-3 rounded-xl border border-line bg-panel p-3 text-left transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 aria-pressed:border-accent aria-pressed:ring-2 aria-pressed:ring-accent/20" type="button" aria-label={`预览编辑器主题 ${theme.name}`} aria-pressed={selected} disabled={appearanceDisabled} onClick={() => changeAppearance({ ...appearanceDraft, themeId: theme.id, custom: null })}>
                    <ThemeSample theme={theme} />
                    <span className="flex min-w-0 items-start justify-between gap-2 px-1"><strong className="break-words font-sub-heading text-sm font-medium text-primary">{theme.name}</strong>{selected ? <span className="shrink-0 text-xs text-accent-text">{appearanceDirty ? '预览中' : '已选'}</span> : null}</span><span className="break-all px-1 font-mono text-xs text-faint">{theme.id} · v{theme.version}</span>
                  </button><ButtonBar label={`主题「${theme.name}」操作`} className="absolute top-5 right-5 rounded-md bg-panel p-1 opacity-100 shadow-panel md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"><button className="button button-quiet size-9 min-h-0 p-0" type="button" aria-label={`编辑主题「${theme.name}」`} data-tooltip="编辑" disabled={appearanceDisabled} onClick={() => { setDesignerEditing(true); setDesignerSource(theme); }}><SettingsIcon name="edit" /></button><button className="button button-danger size-9 min-h-0 p-0" type="button" aria-label={`删除主题「${theme.name}」`} data-tooltip="删除" disabled={appearanceDisabled || theme.id === BASE_EDITOR_THEME.id || [workspace.appearance.themeId, workspace.appearance.custom?.colorThemeId, workspace.appearance.custom?.fontThemeId, appearanceDraft.themeId, appearanceDraft.custom?.colorThemeId, appearanceDraft.custom?.fontThemeId].includes(theme.id)} onClick={() => { deleteThemeRootRef.current = root; setDeleteThemeTarget(theme); }}><SettingsIcon name="delete" /></button></ButtonBar></div>;
                })}
                <button className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-strong bg-list/50 p-5 text-center text-muted transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 aria-pressed:border-accent aria-pressed:text-accent-text" type="button" aria-pressed={Boolean(appearanceDraft.custom)} disabled={appearanceDisabled} onClick={() => setCombination(appearanceDraft.custom ?? { colorThemeId: appearanceDraft.themeId, fontThemeId: appearanceDraft.themeId })}>
                  <span className="grid size-11 place-items-center rounded-lg border border-dashed border-line-strong"><SettingsIcon name="plus" /></span><strong className="font-sub-heading text-sm font-medium">自定义组合</strong><span className="text-xs">选择一套配色和一套字体</span>{appearanceDraft.custom ? <span className="text-xs text-accent-text">{findEditorTheme(editorThemes, appearanceDraft.custom.colorThemeId)?.name}色彩 · {findEditorTheme(editorThemes, appearanceDraft.custom.fontThemeId)?.name}字体</span> : null}
                </button>
              </div>
            </div>
          </fieldset>
          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <div className="flex flex-wrap items-center gap-3"><button className="button button-quiet" type="button" disabled={appearanceActionsDisabled} onClick={resetAppearance}><SettingsIcon name="reset" />重置外观</button><p className="status-copy text-xs" role="status">{appearanceNotice}</p></div>
            <ButtonBar label="外观保存操作"><button className="button button-quiet" type="button" disabled={appearanceActionsDisabled} onClick={cancelAppearance}><SettingsIcon name="undo" />取消变更</button><button className="button button-primary" type="button" aria-label={appearanceSaved ? '已保存' : '保存外观'} disabled={appearanceActionsDisabled || Boolean(missingThemeIds.length)} onClick={() => void saveAppearance()}><SettingsIcon name={appearanceSaved ? 'check' : 'save'} />{appearanceSaving ? '保存中…' : appearanceSaved ? '已保存' : '保存外观'}</button></ButtonBar>
          </footer>
        </section>

        <section id="settings-panel-workflow" role="tabpanel" aria-labelledby="settings-tab-workflow" hidden={tab !== 'workflow'} tabIndex={0} className="min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:p-8">
          <div className="grid gap-6">
            <div><p className="eyebrow">SAVING & HISTORY</p><h3 id="workflow-title" className="mt-1 font-heading text-xl font-semibold text-primary">让保存成为写作的习惯</h3><p className="mt-3 text-sm text-muted">计时只作用于当前文章，有变化时才保存。</p></div>
            {!root ? <p className="rounded-lg bg-list px-4 py-3 text-xs text-muted">连接资料目录后，可修改并保存自动化设置。</p> : null}
            {issue ? <p className="rounded-lg border border-warning-line bg-warning-surface p-4 text-sm text-warning-strong" role="alert">{issue} 请修复 settings.json 后重新载入资料目录。</p> : null}
            <form className="grid gap-6" onSubmit={handleSettingsSubmit}>
              <div className="grid items-start gap-4 lg:grid-cols-2">
                <div className="grid gap-5 rounded-xl border border-line bg-list/50 p-5 md:p-6">
                  <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">AUTO SAVE</p><h4 className="mt-1 font-heading text-lg font-semibold text-primary">自动保存</h4></div><label className="flex shrink-0 items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-xs text-secondary"><input className="size-4 accent-accent" type="checkbox" role="switch" aria-label="启用自动保存" checked={draft.autoSave.enabled} onChange={(event) => setDraft({ ...draft, autoSave: { ...draft.autoSave, enabled: event.target.checked } })} disabled={!root || busy} />启用</label></div>
                  <p className="text-sm text-muted">有未保存改动时，写入文章正文、主题快照和月索引。</p>
                  <label className="field-stack"><span className="field-label">保存间隔（秒）</span><input className="field" type="number" min="1" max="86400" step="1" value={draft.autoSave.intervalSeconds} onChange={(event) => setDraft({ ...draft, autoSave: { ...draft.autoSave, intervalSeconds: Number(event.target.value) } })} disabled={!root || busy || !draft.autoSave.enabled} /></label>
                  <p className="border-t border-line pt-4 text-xs text-faint">保存当前稿，保持文章文件与编辑内容同步。</p>
                </div>
                <div className="grid gap-5 rounded-xl border border-line bg-list/50 p-5 md:p-6">
                  <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">HISTORY SNAPSHOTS</p><h4 className="mt-1 font-heading text-lg font-semibold text-primary">历史快照</h4></div><label className="flex shrink-0 items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-xs text-secondary"><input className="size-4 accent-accent" type="checkbox" role="switch" aria-label="启用自动历史快照" checked={draft.autoSnapshot.enabled} onChange={(event) => setDraft({ ...draft, autoSnapshot: { ...draft.autoSnapshot, enabled: event.target.checked } })} disabled={!root || busy} />启用</label></div>
                  <p className="text-sm text-muted">保留完整正文和对应主题，用于回看或恢复之前的版本。</p>
                  <div className="grid gap-4 md:grid-cols-2"><label className="field-stack"><span className="field-label">快照间隔（分钟）</span><input className="field" type="number" min="1" max="10080" step="1" value={draft.autoSnapshot.intervalMinutes} onChange={(event) => setDraft({ ...draft, autoSnapshot: { ...draft.autoSnapshot, intervalMinutes: Number(event.target.value) } })} disabled={!root || busy || !draft.autoSnapshot.enabled} /></label><label className="field-stack"><span className="field-label">自动快照保留数</span><input className="field" type="number" min="1" max="100" step="1" value={draft.autoSnapshot.maxCount} onChange={(event) => setDraft({ ...draft, autoSnapshot: { ...draft.autoSnapshot, maxCount: Number(event.target.value) } })} disabled={!root || busy || !draft.autoSnapshot.enabled} /></label></div>
                  <p className="border-t border-line pt-4 text-xs text-faint">相同内容不重复写入，保留最近的自动快照。</p>
                </div>
              </div>
              <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5"><p className="status-copy" data-tone={notice.tone} role="status">{notice.label}</p><ButtonBar label="自动保存设置操作"><button className="button button-primary" type="submit" disabled={!root || busy}><SettingsIcon name="save" />保存设置</button></ButtonBar></footer>
            </form>
          </div>
        </section>
      </div>
      {designerSource && typeof document !== 'undefined' ? createPortal(<EditorThemeDesigner editing={designerEditing} appearanceScheme={previewScheme} source={designerSource} themes={editorThemes} navigationGuardRef={designerGuardRef} onClose={() => { designerGuardRef.current = null; setDesignerSource(null); }} onSave={async theme => { if (!await onCreateEditorTheme(theme, designerEditing ? designerSource : undefined, root ?? undefined)) return false; changeAppearance({ themeId: theme.id, colorMode: appearanceDraft.colorMode, custom: null }); return true; }} />, document.body) : null}
      {deleteThemeTarget && typeof document !== 'undefined' ? createPortal(<DialogFrame titleId="editor-theme-delete-title" role="alertdialog" onClose={() => setDeleteThemeTarget(null)} dismissible={!workspaceBusy}><DialogHeader titleId="editor-theme-delete-title" eyebrow="DELETE EDITOR THEME" title="删除编辑器主题" onClose={() => setDeleteThemeTarget(null)} closeDisabled={workspaceBusy} /><div className="dialog-content"><p className="text-sm text-primary">「{deleteThemeTarget.name}」</p><p className="mt-3 text-sm text-muted">将从当前资料目录移除该主题。默认主题可通过“载入默认主题”重新添加，自定义主题删除后无法恢复。</p><p className="mt-3 text-xs text-faint" role="status">{appearanceNotice}</p></div><DialogFooter><DialogActions><DialogButton disabled={workspaceBusy} onClick={() => setDeleteThemeTarget(null)}>取消</DialogButton><DialogButton variant="danger" disabled={workspaceBusy} onClick={() => void onDeleteEditorTheme(deleteThemeTarget.id, deleteThemeRootRef.current ?? undefined).then(removed => { if (removed) { setDeleteThemeTarget(null); setAppearanceNotice('主题已删除。'); } else setAppearanceNotice('删除失败，主题保留。'); })}>确认删除</DialogButton></DialogActions></DialogFooter></DialogFrame>, document.body) : null}
      {departure && typeof document !== 'undefined' ? createPortal(<UnsavedChangesDialog entries={[{ label: '外观设置', detail: `${findEditorTheme(editorThemes, appearanceDraft.custom?.colorThemeId ?? appearanceDraft.themeId)?.name ?? appearanceDraft.themeId}配色 · ${findEditorTheme(editorThemes, appearanceDraft.custom?.fontThemeId ?? appearanceDraft.themeId)?.name ?? appearanceDraft.themeId}字体` }]} description="外观预览尚未保存。离开后，未保存的配色、字体和显示模式将恢复到已保存的设置。" saveDisabled={appearanceDisabled || Boolean(missingThemeIds.length)} onCancel={() => setDeparture(null)} onDiscard={() => { const proceed = departure.proceed; cancelAppearance(); setDeparture(null); proceed(); }} onSave={async () => { const proceed = departure.proceed; if (!await saveAppearance()) return false; setDeparture(null); proceed(); return true; }} />, document.body) : null}
      {combination && typeof document !== 'undefined' ? createPortal(<DialogFrame wide titleId="appearance-combination-title" descriptionId="appearance-combination-description" onClose={() => setCombination(null)}><DialogHeader titleId="appearance-combination-title" eyebrow="CUSTOM EDITOR THEME" title="组合颜色与字体" onClose={() => setCombination(null)} /><div className="dialog-content"><p id="appearance-combination-description" className="text-sm text-muted">分别选择一套配色和一套字体，应用后即时预览；保存外观才会写入目录。</p><div className="grid min-w-0 gap-4 md:grid-cols-2">
        <fieldset className="min-w-0 rounded-xl border border-line bg-list/50 p-3"><legend className="px-1 text-sm font-medium text-primary">颜色</legend><div className="grid max-h-80 gap-2 overflow-y-auto p-1 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">{editorThemes.map((theme) => <button key={theme.id} className="grid min-w-0 gap-2 rounded-lg border border-line bg-panel p-3 text-left text-sm text-primary hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-pressed:border-accent aria-pressed:bg-accent-soft" type="button" aria-label={`选择${theme.name}配色`} aria-pressed={combination.colorThemeId === theme.id} onClick={() => setCombination({ ...combination, colorThemeId: theme.id })}><ThemeSample theme={theme} kind="colors" scheme={previewScheme} /><span>{theme.name}</span></button>)}</div></fieldset>
        <fieldset className="min-w-0 rounded-xl border border-line bg-list/50 p-3"><legend className="px-1 text-sm font-medium text-primary">字体</legend><div className="grid max-h-80 gap-2 overflow-y-auto p-1 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">{editorThemes.map((theme) => <button key={theme.id} className="grid min-w-0 gap-2 rounded-lg border border-line bg-panel p-3 text-left text-sm text-primary hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-pressed:border-accent aria-pressed:bg-accent-soft" type="button" aria-label={`选择${theme.name}字体`} aria-pressed={combination.fontThemeId === theme.id} onClick={() => setCombination({ ...combination, fontThemeId: theme.id })}><ThemeSample theme={theme} kind="fonts" /><span className="text-xs text-faint">{theme.name}</span></button>)}</div></fieldset>
      </div><DialogActions><DialogButton onClick={() => setCombination(null)}>取消</DialogButton><DialogButton variant="primary" disabled={appearanceDisabled} onClick={() => { changeAppearance({ ...appearanceDraft, custom: { ...combination } }); setCombination(null); }}>应用组合并预览</DialogButton></DialogActions></div></DialogFrame>, document.body) : null}
    </section>
  );
}
