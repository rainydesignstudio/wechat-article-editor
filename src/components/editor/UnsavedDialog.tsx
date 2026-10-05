'use client';

import { UnsavedChangesDialog } from '../global/UnsavedChangesDialog';

export function UnsavedDialog({ label, onCancel, onSave, onDiscard }: { label: string; onCancel: () => void; onSave: () => Promise<boolean>; onDiscard: () => void }) {
  return <UnsavedChangesDialog entries={[{ label: '当前文稿', detail: '正文与文章信息有未保存的修改' }]} description={`即将${label}。保存后可继续；放弃变更将恢复已保存的文稿。`} saveLabel="保存并继续" onCancel={onCancel} onSave={onSave} onDiscard={onDiscard} />;
}
