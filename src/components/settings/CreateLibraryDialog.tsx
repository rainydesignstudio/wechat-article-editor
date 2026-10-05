'use client';

import { useRef, useState, type FormEvent } from 'react';
import type { LibraryCreationResult } from '../../hooks/useEditorController';
import { normalizeDataDirectoryName } from '../../lib/fileSystem';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from '../global/DialogFrame';

function LibraryIcon({ cancel = false }: { cancel?: boolean }) {
  return <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {cancel ? <path d="m6 6 12 12M6 18 18 6" /> : <path d="M3 7V4h6l2 3h10v13H3V7Zm9 4v6m-3-3h6" />}
  </svg>;
}

export function CreateLibraryDialog({ onCreate, onClose }: { onCreate: (name: string) => Promise<LibraryCreationResult>; onClose: () => void }) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState<{ label: string; error: boolean } | null>(null);
  const creatingRef = useRef(false);
  let normalizedName = '', nameIssue = '';
  if (name.trim()) {
    try { normalizedName = normalizeDataDirectoryName(name); }
    catch (error) { nameIssue = error instanceof Error ? error.message : String(error); }
  }
  const close = () => { if (!creatingRef.current) onClose(); };
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creatingRef.current || !normalizedName || nameIssue) return;
    creatingRef.current = true;
    setCreating(true);
    setFeedback(null);
    try {
      const result = await onCreate(normalizedName);
      if (result.status === 'created') onClose();
      else setFeedback({ label: result.status === 'error' ? result.message : '已取消选择父目录，可重新选择。', error: result.status === 'error' });
    } catch (error) {
      setFeedback({ label: error instanceof Error ? error.message : String(error), error: true });
    } finally { creatingRef.current = false; setCreating(false); }
  };

  return <DialogFrame titleId="create-library-title" descriptionId="create-library-description" onClose={close} dismissible={!creating}>
    <DialogHeader titleId="create-library-title" eyebrow="CREATE LOCAL LIBRARY" title="新建资料库" onClose={close} closeDisabled={creating} />
    <form onSubmit={create} aria-busy={creating}>
      <div className="dialog-content">
        <p id="create-library-description" className="text-sm text-muted">为资料库取个名字，再选择保存它的父目录。</p>
        <label className="field-stack" htmlFor="new-library-name">
          <span className="field-label">资料库名称</span>
          <input id="new-library-name" name="library-name" className="field" value={name} maxLength={80} onChange={event => { setName(event.target.value); setFeedback(null); }} placeholder="例如：我的文稿" autoFocus autoComplete="off" spellCheck={false} required disabled={creating} aria-invalid={Boolean(nameIssue)} aria-describedby={nameIssue ? 'create-library-name-error' : 'create-library-name-help'} />
          <span id="create-library-name-help" className="text-xs text-faint">用作新文件夹名称，最多 80 个字符。</span>
          {nameIssue ? <span id="create-library-name-error" className="text-xs text-danger" role="alert">{nameIssue}</span> : null}
        </label>
        <div className="grid min-w-0 gap-3 rounded-lg border border-line bg-list/50 p-4" aria-label="资料库保存位置预览">
          <p className="text-xs text-muted">创建位置</p>
          <div className="flex min-w-0 items-start gap-2 text-sm"><span className="mt-0.5 text-accent-text"><LibraryIcon /></span><p className="min-w-0 break-all"><span className="text-muted">所选父目录 / </span><strong className="font-medium text-primary">{normalizedName || '资料库名称'}</strong></p></div>
          <p className="text-xs text-muted">接下来在系统窗口选择父目录。资料库会建在这个新文件夹内；已有同名文件夹不会覆盖。</p>
        </div>
        {feedback ? <p className="status-copy" data-tone={feedback.error ? 'error' : 'neutral'} role={feedback.error ? 'alert' : 'status'}>{feedback.label}</p> : null}
        {creating ? <p className="text-xs text-muted" role="status">选择父目录后，将创建并打开资料库…</p> : null}
      </div>
      <DialogFooter><DialogActions>
        <DialogButton disabled={creating} onClick={close}><LibraryIcon cancel />取消</DialogButton>
        <DialogButton type="submit" variant="primary" disabled={creating || !normalizedName || Boolean(nameIssue)}><LibraryIcon />{creating ? '创建中…' : '选择父目录并创建'}</DialogButton>
      </DialogActions></DialogFooter>
    </form>
  </DialogFrame>;
}
