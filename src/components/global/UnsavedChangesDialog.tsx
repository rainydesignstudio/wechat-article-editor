'use client';

import { useId, useRef, useState } from 'react';
import { DialogActions, DialogButton, DialogFrame, DialogHeader } from './DialogFrame';

type Props = {
  entries: Array<{ label: string; detail?: string }>;
  description: string;
  saveDisabled?: boolean;
  saveLabel?: string;
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => Promise<boolean>;
};

function ActionIcon({ name }: { name: 'edit' | 'back' | 'discard' | 'save' }) {
  const paths = {
    edit: 'm4 20 4-.8L20 7l-3-3L4.8 16 4 20ZM14 7l3 3',
    back: 'm9 5-7 7 7 7M2 12h20',
    discard: 'M4 10a8 8 0 1 1 1 8M4 4v6h6',
    save: 'M4 4h13l3 3v13H4V4ZM8 4v6h8V4M8 20v-6h8v6',
  };
  return <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

export function UnsavedChangesDialog({ entries, description, saveDisabled = false, saveLabel = '保存并离开', onCancel, onDiscard, onSave }: Props) {
  const id = useId();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);
  const save = async () => {
    if (savingRef.current || saveDisabled) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      if (!await onSave()) setError('保存未完成，修改已保留。请检查后重试。');
    } catch {
      setError('保存未完成，修改已保留。请检查后重试。');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const cancel = () => { if (!savingRef.current) onCancel(); };
  return (
    <DialogFrame titleId={`${id}-title`} descriptionId={`${id}-description`} role="alertdialog" dismissible={!saving} onClose={cancel}>
      <DialogHeader titleId={`${id}-title`} eyebrow="UNSAVED CHANGES" title="有未保存的内容" onClose={cancel} closeDisabled={saving} />
      <div className="dialog-content">
        <p id={`${id}-description`} className="text-sm text-muted">{description}</p>
        <div className="grid max-h-56 gap-2 overflow-y-auto scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">
          {entries.map((entry, index) => <div key={index} className="flex min-w-0 items-start gap-3 rounded-lg border border-line bg-list/50 p-4"><span className="grid size-9 shrink-0 place-items-center rounded-md bg-accent-soft text-accent-text"><ActionIcon name="edit" /></span><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium text-primary">{entry.label}</p>{entry.detail ? <p className="mt-1 break-words text-xs text-muted">{entry.detail}</p> : null}</div><span className="shrink-0 rounded-md border border-line px-2 py-1 text-2xs text-faint">未保存</span></div>)}
        </div>
        {error ? <p className="rounded-lg border border-danger/30 bg-list px-3 py-2 text-xs text-danger" role="alert">{error}</p> : null}
        <DialogActions><div className="grid w-full grid-cols-1 gap-2 md:grid-cols-3">
          <DialogButton disabled={saving} onClick={cancel}><ActionIcon name="back" />继续编辑</DialogButton>
          <DialogButton variant="danger" disabled={saving} onClick={() => { if (!savingRef.current) onDiscard(); }}><ActionIcon name="discard" />放弃变更</DialogButton>
          <DialogButton variant="primary" disabled={saveDisabled || saving} onClick={() => void save()}><ActionIcon name="save" />{saving ? '保存中…' : saveLabel}</DialogButton>
        </div></DialogActions>
      </div>
    </DialogFrame>
  );
}
