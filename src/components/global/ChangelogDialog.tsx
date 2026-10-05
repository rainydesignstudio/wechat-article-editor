'use client';

import { useCallback, useState } from 'react';
import { APP_VERSION } from '../../lib/appVersion';
import { useAnimatedMaxHeight } from '../../hooks/useAnimatedMaxHeight';
import changelog from '../../lib/changelog.json' with { type: 'json' };
import { DialogButton, DialogFrame, DialogHeader } from './DialogFrame';

type Release = (typeof changelog)[number];

// Newest first: changelog.json is chronological, the dialog reads newest → oldest.
const RELEASES: Release[] = [...changelog].reverse();
const NEWEST_VERSION = RELEASES[0]?.version;
const RELEASE_STATUS: Record<string, { label: string; className: string }> = {
  published: { label: '已发布', className: 'bg-success-surface text-success' },
  local: { label: '本地版本', className: 'bg-list text-muted' },
  'in-progress': { label: '开发中', className: 'bg-warning-surface text-warning-strong' },
};

function isCollapsible(release: Release): boolean {
  return Boolean(release.sections?.length);
}

// Only the newest release starts expanded, and only when it actually has sections to show.
function initialOpenMap(): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  RELEASES.forEach(release => {
    map[release.version] = release.version === NEWEST_VERSION && isCollapsible(release);
  });
  return map;
}

function ReleaseBlock({ release, open, onToggle }: { release: Release; open: boolean; onToggle: () => void }) {
  const bodyRef = useAnimatedMaxHeight(open);
  const collapsible = isCollapsible(release);
  const bodyId = `changelog-body-${release.version}`;
  const status = RELEASE_STATUS[release.status] ?? RELEASE_STATUS['in-progress'];

  return <section className="grid gap-3 rounded-lg border border-line bg-list/50 p-4" aria-label={`版本 ${release.version}`}>
    <button type="button" aria-expanded={collapsible ? open : undefined} aria-controls={collapsible ? bodyId : undefined} disabled={!collapsible} onClick={onToggle} className="group/release flex w-full items-center justify-between gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default">
      <span className="font-mono text-sm font-semibold text-primary">{release.version}</span>
      <span className="flex items-center gap-2">
        <span className={`rounded-md px-2 py-1 text-xs ${status.className}`}>{status.label}</span>
        {collapsible ? <svg className="size-4 shrink-0 text-faint transition-transform duration-200 ease-out motion-reduce:transition-none group-aria-expanded/release:rotate-90" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m9 5 7 7-7 7" /></svg> : null}
      </span>
    </button>
    <p className="text-sm text-muted">{release.summary}</p>
    {collapsible ? <div id={bodyId} ref={bodyRef} className="overflow-hidden transition-[max-height] duration-200 ease-out motion-reduce:transition-none">
      <div className="grid gap-2">{release.sections!.map(section => <details key={section.title} className="collapsible-panel group/section">
        <summary className="panel-heading list-none [&::-webkit-details-marker]:hidden"><span className="min-w-0 flex-1">{section.title}</span><span className="font-mono text-xs font-normal text-faint">{section.items.length}</span><svg className="size-4 shrink-0 text-faint group-open/section:rotate-90" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m9 5 7 7-7 7" /></svg></summary>
        <ul className="grid list-disc gap-3 px-8 pb-4 text-sm text-secondary">{section.items.map(item => <li key={item}>{item}</li>)}</ul>
      </details>)}</div>
    </div> : null}
  </section>;
}

export function ChangelogDialog({ onClose }: { onClose: () => void }) {
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(initialOpenMap);
  const collapsibleVersions = RELEASES.filter(isCollapsible).map(release => release.version);
  const allOpen = collapsibleVersions.every(version => openMap[version]);

  const toggleAll = useCallback(() => {
    setOpenMap(current => {
      const next = !collapsibleVersions.every(version => current[version]);
      const updated: Record<string, boolean> = { ...current };
      collapsibleVersions.forEach(version => { updated[version] = next; });
      return updated;
    });
  }, [collapsibleVersions]);

  return <DialogFrame titleId="changelog-title" onClose={onClose} className="flex min-h-0 max-w-3xl flex-col overflow-hidden">
    <DialogHeader
      titleId="changelog-title"
      eyebrow={`RELEASE NOTES / v${APP_VERSION}`}
      title="版本与变化"
      onClose={onClose}
      actions={<DialogButton onClick={toggleAll}>
        {allOpen
          ? <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m8 4 4 4 4-4M8 20l4-4 4 4" /></svg>
          : <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m8 9 4-4 4 4M8 15l4 4 4-4" /></svg>}
        {allOpen ? '全部收起' : '全部展开'}
      </DialogButton>}
    />
    <div className="min-h-0 overflow-x-clip overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">
      <div className="grid gap-4">{RELEASES.map(release => <ReleaseBlock
        key={release.version}
        release={release}
        open={Boolean(openMap[release.version])}
        onToggle={() => setOpenMap(current => ({ ...current, [release.version]: !current[release.version] }))}
      />)}</div>
    </div>
  </DialogFrame>;
}
