'use client';

import type { ReactNode } from 'react';
import type { MediaPreferences } from '../../hooks/useMediaPreferences';
import { IconPopover } from '../global/IconPopover';
import { IconButton } from '../global/IconButton';
import { MediaIcon, MediaSourceSwitch } from './MediaGallery';

export type MediaControl = 'selection' | 'group' | 'article' | 'sort' | 'layout' | null;
type Option = { value: string; label: string };
type Filter = { value: string; options: Option[]; onChange: (value: string) => void };
type Selection = { active: boolean; count: number; hasVisible: boolean; onEnable: () => void; onAll: () => void; onTransfer: () => void; onDelete: () => void; onCancel: () => void };
const menuItem = 'flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent aria-checked:bg-accent-soft aria-checked:text-accent-text';

function FilterOptions({ filter, onClose }: { filter: Filter; onClose: () => void }) {
  return filter.options.map(option => <button key={option.value} type="button" role="menuitemradio" aria-checked={filter.value === option.value} className={menuItem} onClick={() => { filter.onChange(option.value); onClose(); }}><span className="w-3 shrink-0" aria-hidden="true">{filter.value === option.value ? '✓' : ''}</span><span className="min-w-0 truncate">{option.label}</span></button>);
}

export function MediaToolbar({ source, onSourceChange, articleLabel, query, onQueryChange, preferences, onPreferencesChange, activeControl, onControlChange, disabled, count, groups, articles, selection, actions }: {
  source: 'shared' | 'article'; onSourceChange: (value: 'shared' | 'article') => void;
  articleLabel?: string; query: string; onQueryChange: (value: string) => void;
  preferences: MediaPreferences; onPreferencesChange: (value: MediaPreferences) => void;
  activeControl: MediaControl; onControlChange: (value: MediaControl) => void;
  disabled: boolean; count?: ReactNode; groups?: Filter; articles?: Filter; selection?: Selection; actions?: ReactNode;
}) {
  const close = () => onControlChange(null);
  const toggle = (name: NonNullable<MediaControl>) => { if (disabled) return; if (name === 'selection') selection?.onEnable(); onControlChange(activeControl === name ? null : name); };
  const sorts: Array<{ value: MediaPreferences['sort']; label: string }> = [{ value: 'name', label: '文件名' }, { value: 'modified', label: '修改时间' }, { value: 'size', label: '文件大小' }];
  const sortLabel = sorts.find(option => option.value === preferences.sort)!.label;
  return <div className="flex min-w-0 flex-wrap items-center gap-3" role="group" aria-label="素材工具栏">
    <MediaSourceSwitch value={source} articleLabel={articleLabel} disabled={disabled} onChange={value => { close(); onSourceChange(value); }} />
    <div className="order-3 flex w-full min-w-0 items-center lg:order-none lg:w-auto lg:flex-1">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-clip py-1 md:gap-2 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">
        {selection ? <div className="flex shrink-0 items-center gap-1" role="group" aria-label="批量图片操作">
          <IconButton icon={<MediaIcon name="select" />} tooltip={`多选图片 · 已选 ${selection.count} 项`} aria-label={`多选图片，已选 ${selection.count} 项`} aria-pressed={selection.active} aria-expanded={activeControl === 'selection'} disabled={disabled} onClick={() => toggle('selection')}>{selection.count ? <span className="absolute -top-1 -right-1 rounded-full bg-accent px-1 font-mono text-2xs text-action-text" aria-hidden="true">{selection.count}</span> : null}</IconButton>
          {activeControl === 'selection' ? <>
            <IconButton icon={<MediaIcon name="all" />} tooltip="全选当前页图片" aria-label="全选本页图片" disabled={disabled || !selection.hasVisible} onClick={selection.onAll} />
            <IconButton icon={<MediaIcon name="use" />} tooltip={selection.count ? '移动／复制所选图片' : '移动／复制 · 请先勾选图片'} aria-label="移动或复制所选图片" disabled={disabled || !selection.count} onClick={selection.onTransfer} />
            <IconButton icon={<MediaIcon name="delete" />} tone="danger" tooltip={selection.count ? '删除所选图片' : '删除所选 · 请先勾选图片'} aria-label="删除所选图片" disabled={disabled || !selection.count} onClick={selection.onDelete} />
            <IconButton icon={<MediaIcon name="close" />} tooltip="取消选择" aria-label="取消图片选择" disabled={disabled} onClick={selection.onCancel} />
          </> : null}
        </div> : null}
        <label className="field-stack min-w-20 flex-1"><span className="sr-only">搜索图片文件名或文章标题</span><input className="field" type="search" placeholder={articles ? '搜索文件名或文章标题…' : '搜索文件名…'} value={query} disabled={disabled} onChange={event => onQueryChange(event.target.value)} /></label>
        {source === 'article' && groups ? <IconPopover label="所属分组" tooltip={`分组：${groups.options.find(option => option.value === groups.value)?.label ?? '全部分组'}`} icon={<MediaIcon name="group" />} open={activeControl === 'group'} disabled={disabled} onToggle={() => toggle('group')} onClose={close}><FilterOptions filter={groups} onClose={close} /></IconPopover> : null}
        {source === 'article' && articles ? <IconPopover label="所属文章" tooltip={`文章：${articles.options.find(option => option.value === articles.value)?.label ?? '全部文章'}`} icon={<MediaIcon name="article" />} open={activeControl === 'article'} disabled={disabled} onToggle={() => toggle('article')} onClose={close}><FilterOptions filter={articles} onClose={close} /></IconPopover> : null}
        <IconPopover label="图片排序" tooltip={`排序：${sortLabel} · ${preferences.descending ? '降序' : '升序'}`} icon={<MediaIcon name="sort" />} open={activeControl === 'sort'} disabled={disabled} onToggle={() => toggle('sort')} onClose={close}>
          {sorts.map(option => <div key={option.value} className="group/sort flex min-w-0 items-center gap-1">
            <button type="button" role="menuitemradio" aria-checked={preferences.sort === option.value} className={menuItem} onClick={() => { onPreferencesChange({ ...preferences, sort: option.value }); close(); }}><span className="w-3 shrink-0" aria-hidden="true">{preferences.sort === option.value ? '✓' : ''}</span><span>{option.label}</span></button>
            <IconButton icon={<span aria-hidden="true">{preferences.descending ? '↓' : '↑'}</span>} className="opacity-100 md:opacity-0 md:group-hover/sort:opacity-100 md:group-focus-within/sort:opacity-100 md:data-[current=true]:opacity-100 pointer-coarse:opacity-100" data-current={preferences.sort === option.value} tooltip={`按${option.label}${preferences.descending ? '升序' : '降序'}`} aria-label={`按${option.label}切换为${preferences.descending ? '升序' : '降序'}`} onClick={() => onPreferencesChange({ ...preferences, sort: option.value, descending: !preferences.descending })} />
          </div>)}
        </IconPopover>
        <IconPopover label="图片布局" tooltip={preferences.columns === 1 ? '布局：横向列表' : `布局：每排 ${preferences.columns} 张`} icon={<MediaIcon name="layout" />} open={activeControl === 'layout'} kind="dialog" disabled={disabled} onToggle={() => toggle('layout')} onClose={close}>
          <label className="grid gap-3 p-2"><span>{preferences.columns === 1 ? '横向列表' : `每排 ${preferences.columns} 张`}</span><input type="range" min="1" max="4" step="1" value={preferences.columns} aria-label="每排图片数量" aria-valuetext={preferences.columns === 1 ? '横向列表' : `每排${preferences.columns}张`} className="w-full accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" onChange={event => onPreferencesChange({ ...preferences, columns: Number(event.target.value) as MediaPreferences['columns'] })} /><span className="flex justify-between text-2xs text-muted"><span>列表</span><span>4列</span></span></label>
        </IconPopover>
      </div>
    </div>
    {actions ? <div className="ml-auto flex shrink-0 items-center lg:ml-0">{actions}</div> : count !== undefined ? <span className="ml-auto shrink-0 text-xs text-muted lg:ml-0" role="status">{count}</span> : null}
  </div>;
}
