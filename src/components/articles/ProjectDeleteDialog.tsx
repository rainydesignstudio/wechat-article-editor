'use client';

import { DialogActions, DialogButton, DialogFrame, DialogHeader } from '../global/DialogFrame';

export function ProjectDeleteDialog({
  name,
  busy,
  onClose,
  onConfirm,
}: {
  name: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <DialogFrame titleId="project-delete-title" descriptionId="project-delete-description" role="alertdialog" onClose={onClose} dismissible={!busy} wide>
      <DialogHeader titleId="project-delete-title" eyebrow="DELETE PROJECT" title={`删除项目「${name}」？`} onClose={onClose} closeDisabled={busy} />
      <div className="grid gap-4 p-4">
        <p id="project-delete-description">项目中的文章会转入“未分组”。文章正文、分类、图片、历史版本和主题快照都会保留。</p>
        <DialogActions><DialogButton autoFocus disabled={busy} onClick={onClose}>取消</DialogButton><DialogButton variant="danger" disabled={busy} onClick={onConfirm}>{busy ? '正在保存…' : '删除项目'}</DialogButton></DialogActions>
      </div>
    </DialogFrame>
  );
}
