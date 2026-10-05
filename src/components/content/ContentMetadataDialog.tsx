'use client';

import type { ReactNode } from 'react';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from '../global/DialogFrame';

export function ContentMetadataDialog({ kind, creating, busy, saveDisabled, submitLabel, shortcutEnabled = false, onShortcut, onValidate, validationDisabled = false, validating = false, status, statusTone = 'success', error, children, onClose, onSave }: {
  kind: 'snippets' | 'templates'; busy: boolean;
  creating: boolean; submitLabel?: string; shortcutEnabled?: boolean;
  onShortcut?: () => void; onValidate?: () => void; validationDisabled?: boolean; validating?: boolean;
  status?: string; statusTone?: 'warning' | 'success';
  saveDisabled: boolean; error?: string; children: ReactNode; onClose: () => void; onSave: () => void;
}) {
  const snippet = kind === 'snippets';
  return <DialogFrame titleId="content-information-title" descriptionId="content-information-description" onClose={onClose} dismissible={!busy} className="flex min-h-0 max-w-3xl flex-col overflow-hidden">
    <DialogHeader titleId="content-information-title" eyebrow={snippet ? 'SNIPPET INFORMATION' : 'TEMPLATE INFORMATION'} title={snippet ? '片段信息' : '起稿模板信息'} onClose={onClose} closeDisabled={busy} />
    <form id="content-information-form" className="flex min-h-0 flex-col" aria-label={snippet ? '编辑片段信息' : '编辑起稿模板信息'} onSubmit={event => { event.preventDefault(); event.stopPropagation(); if (!saveDisabled && !busy) onSave(); }} onKeyDown={event => {
      if (!shortcutEnabled || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.repeat || event.nativeEvent.isComposing || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      event.stopPropagation();
      if (!busy) { if (onShortcut) onShortcut(); else if (!saveDisabled) onSave(); }
    }}>
      <div className="min-h-0 overflow-x-clip overflow-y-auto scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">
        <div className="min-w-0 p-4">
          <p id="content-information-description" className="sr-only">{snippet ? '编辑片段的文件名、名称、分类、触发词、图标和说明。' : '编辑起稿模板的文件名、标题、分类、作者、图标和摘要。'}</p>
          {children}{error ? <p className="mt-4 text-sm text-danger" role="alert">{error}</p> : status ? <p className={`mt-4 text-sm ${statusTone === 'warning' ? 'text-warning' : 'text-success'}`} role="status">{status}</p> : null}
        </div>
      </div>
      <DialogFooter><DialogActions><DialogButton disabled={busy} onClick={onClose}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 6 12 12M18 6 6 18" /></svg>取消</DialogButton>{onValidate ? <DialogButton disabled={busy || validationDisabled} onClick={onValidate}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m5 12 4 4L19 6" /></svg>{validating ? '校验中…' : '校验'}</DialogButton> : null}<DialogButton type="submit" variant="primary" aria-keyshortcuts="Meta+S Control+S" title={`${submitLabel ?? (creating ? '确认信息' : '保存信息')}（⌘S / Ctrl+S）`} disabled={saveDisabled || busy}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4h13l3 3v13H4V4ZM8 4v6h8V4M8 20v-6h8v6" /></svg>{busy && !validating ? '保存中…' : submitLabel ?? (creating ? '确认信息' : '保存信息')}</DialogButton></DialogActions></DialogFooter>
    </form>
  </DialogFrame>;
}
