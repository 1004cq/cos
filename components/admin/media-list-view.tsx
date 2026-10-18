'use client';

import { Save, Trash2 } from 'lucide-react';
import { formatBytes, formatDateTime } from '@/lib/utils';
import {
  toDatetimeLocalValue,
  type MediaItem,
} from '@/components/admin/media-types';

type Props = {
  items: MediaItem[];
  selected: Set<string>;
  titleDrafts: Record<string, string>;
  takenAtDrafts: Record<string, string>;
  busy: boolean;
  savingTitleId: string | null;
  savingTakenAtId: string | null;
  onToggleSelect: (id: string) => void;
  onPreview: (id: string) => void;
  onTitleDraft: (id: string, value: string) => void;
  onTakenAtDraft: (id: string, value: string) => void;
  onSaveTitle: (id: string) => void;
  onSaveTakenAt: (id: string) => void;
  onClearTakenAt: (id: string) => void;
  onDeleteOne: (id: string) => void;
};

export function MediaListView({
  items,
  selected,
  titleDrafts,
  takenAtDrafts,
  busy,
  savingTitleId,
  savingTakenAtId,
  onToggleSelect,
  onPreview,
  onTitleDraft,
  onTakenAtDraft,
  onSaveTitle,
  onSaveTakenAt,
  onClearTakenAt,
  onDeleteOne,
}: Props) {
  return (
    <ul className="rounded-3xl glass divide-y divide-white/40 overflow-hidden">
      {items.map((item) => {
        const draft = titleDrafts[item.id] ?? '';
        const dirty = draft.trim() !== (item.title ?? '').trim();
        const takenDraft = takenAtDrafts[item.id] ?? '';
        const takenDirty = takenDraft !== toDatetimeLocalValue(item.takenAt);
        return (
          <li
            key={item.id}
            className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 text-sm"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                aria-label={`选择 ${item.filename}`}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation();
                  onToggleSelect(item.id);
                }}
              />
              <button
                type="button"
                className="w-8 h-8 rounded-lg bg-white/60 flex items-center justify-center text-xs shrink-0 hover:bg-white/90"
                style={{ color: 'var(--text-muted)' }}
                onClick={() => onPreview(item.id)}
                aria-label="预览"
              >
                {item.mimeType.startsWith('video/') ? '▶' : '图'}
              </button>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                  文件名：{item.filename}
                </p>
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    className="input-glass !py-1.5 text-sm flex-1 min-w-0"
                    maxLength={100}
                    placeholder="标题（可选）"
                    value={draft}
                    onChange={(e) => onTitleDraft(item.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    type="button"
                    disabled={busy || savingTitleId === item.id || !dirty}
                    onClick={() => onSaveTitle(item.id)}
                    className="btn-ghost !py-1.5 !px-2 text-xs inline-flex items-center gap-1 disabled:opacity-40"
                    title="保存标题（与多选无关）"
                  >
                    <Save className="w-3.5 h-3.5" />
                    保存标题
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <label className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
                    拍摄/展示时间
                  </label>
                  <input
                    type="datetime-local"
                    className="input-glass !py-1.5 text-sm"
                    value={takenDraft}
                    onChange={(e) => onTakenAtDraft(item.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    type="button"
                    disabled={busy || savingTakenAtId === item.id || !takenDirty}
                    onClick={() => onSaveTakenAt(item.id)}
                    className="btn-ghost !py-1.5 !px-2 text-xs inline-flex items-center gap-1 disabled:opacity-40"
                    title="保存拍摄时间；清空后按入库时间排序"
                  >
                    <Save className="w-3.5 h-3.5" />
                    保存时间
                  </button>
                  {takenDraft && (
                    <button
                      type="button"
                      disabled={busy || savingTakenAtId === item.id}
                      onClick={() => onClearTakenAt(item.id)}
                      className="btn-ghost !py-1.5 !px-2 text-xs disabled:opacity-40"
                    >
                      清空并保存
                    </button>
                  )}
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {formatBytes(item.size)} · {item.album?.title || '未归类'} · 入库{' '}
                  {formatDateTime(item.createdAt)}
                  {item.takenAt ? ` · 展示 ${formatDateTime(item.takenAt)}` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <time className="text-xs hidden md:block" style={{ color: 'var(--text-muted)' }}>
                {formatDateTime(item.takenAt || item.createdAt)}
              </time>
              <button
                type="button"
                disabled={busy}
                onClick={() => onDeleteOne(item.id)}
                className="btn-ghost !p-2 text-red-600 disabled:opacity-50"
                aria-label="删除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
