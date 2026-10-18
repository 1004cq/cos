'use client';

import { FolderInput, Share2, Trash2 } from 'lucide-react';
import type { Album } from '@/components/admin/media-types';

type Props = {
  albums: Album[];
  itemsEmpty: boolean;
  allPageSelected: boolean;
  selectedCount: number;
  moveAlbumId: string;
  deleteCos: boolean;
  busy: boolean;
  onToggleSelectAll: () => void;
  onMoveAlbumId: (id: string) => void;
  onBatchMove: () => void;
  onShare: () => void;
  onDeleteCos: (v: boolean) => void;
  onBatchDelete: () => void;
};

export function MediaBatchBar({
  albums,
  itemsEmpty,
  allPageSelected,
  selectedCount,
  moveAlbumId,
  deleteCos,
  busy,
  onToggleSelectAll,
  onMoveAlbumId,
  onBatchMove,
  onShare,
  onDeleteCos,
  onBatchDelete,
}: Props) {
  return (
    <div className="rounded-2xl glass p-3 flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-1.5 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={allPageSelected}
          onChange={onToggleSelectAll}
          disabled={itemsEmpty}
        />
        全选本页
      </label>
      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
        已选 {selectedCount}
      </span>
      <select
        className="input-glass !w-auto !py-2 text-sm"
        value={moveAlbumId}
        onChange={(e) => onMoveAlbumId(e.target.value)}
      >
        <option value="">移出相册 / 未归类</option>
        {albums.map((a) => (
          <option key={a.id} value={a.id}>
            {a.title}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy || selectedCount === 0}
        onClick={onBatchMove}
        className="btn-ghost !py-2 text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
      >
        <FolderInput className="w-4 h-4" />
        批量移入
      </button>
      <button
        type="button"
        disabled={busy || selectedCount === 0}
        onClick={onShare}
        className="btn-ghost !py-2 text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
      >
        <Share2 className="w-4 h-4" />
        生成分享
      </button>
      <label className="flex items-center gap-1.5 text-xs cursor-pointer ml-auto">
        <input
          type="checkbox"
          checked={deleteCos}
          onChange={(e) => onDeleteCos(e.target.checked)}
        />
        同时删 COS
      </label>
      <button
        type="button"
        disabled={busy || selectedCount === 0}
        onClick={onBatchDelete}
        className="btn-ghost !py-2 text-sm inline-flex items-center gap-1.5 text-red-600 disabled:opacity-50"
      >
        <Trash2 className="w-4 h-4" />
        批量删除
      </button>
    </div>
  );
}
