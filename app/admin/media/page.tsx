'use client';

import { LayoutGrid, List, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ShareCreateDialog } from '@/components/share-create-dialog';
import { Lightbox } from '@/components/lightbox';
import { MediaBatchBar } from '@/components/admin/media-batch-bar';
import { MediaGridView } from '@/components/admin/media-grid-view';
import { MediaListView } from '@/components/admin/media-list-view';
import { useAdminMedia } from '@/components/admin/use-admin-media';

export default function AdminMediaPage() {
  const {
    items,
    thumbs,
    albums,
    page,
    setPage,
    totalPages,
    total,
    searchInput,
    setSearchInput,
    view,
    setView,
    loading,
    error,
    successMsg,
    selected,
    setSelected,
    moveAlbumId,
    setMoveAlbumId,
    busy,
    deleteCos,
    setDeleteCos,
    shareOpen,
    setShareOpen,
    shareIds,
    setShareIds,
    titleDrafts,
    setTitleDrafts,
    takenAtDrafts,
    setTakenAtDrafts,
    savingTitleId,
    savingTakenAtId,
    lightboxIndex,
    setLightboxIndex,
    lightboxItems,
    backfilling,
    allPageSelected,
    selectedCount,
    toggleSelect,
    toggleSelectAll,
    snapshotSelectedIds,
    handleBatchDelete,
    handleBatchMove,
    openShareSelected,
    onSearchSubmit,
    saveTitle,
    saveTakenAt,
    handleBackfillPosters,
    openPreview,
    setItems,
    setError,
    setSuccessMsg,
    setSavingTakenAtId,
  } = useAdminMedia();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">媒体库</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            共 {total} 项 · 列表视图可改标题与拍摄/展示时间 · 勾选后批量操作
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={backfilling || busy}
            onClick={() => void handleBackfillPosters()}
            className="text-sm px-3 py-2 rounded-xl glass hover:bg-white/50 disabled:opacity-50"
          >
            {backfilling ? '补封面中…' : '补全视频封面'}
          </button>
          <div className="flex gap-1 rounded-xl glass p-1">
          <button
            type="button"
            onClick={() => setView('grid')}
            className={cn(
              'p-2 rounded-lg transition',
              view === 'grid' ? 'bg-white/80 text-blue-600' : 'hover:bg-white/40'
            )}
            aria-label="网格"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            className={cn(
              'p-2 rounded-lg transition',
              view === 'list' ? 'bg-white/80 text-blue-600' : 'hover:bg-white/40'
            )}
            aria-label="列表"
          >
            <List className="w-4 h-4" />
          </button>
          </div>
        </div>
      </div>

      <form onSubmit={onSearchSubmit} className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: 'var(--text-muted)' }}
          />
          <input
            className="input-glass !pl-10"
            placeholder="搜索文件名或标题..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary text-sm">
          搜索
        </button>
      </form>

      <MediaBatchBar
        albums={albums}
        itemsEmpty={items.length === 0}
        allPageSelected={allPageSelected}
        selectedCount={selectedCount}
        moveAlbumId={moveAlbumId}
        deleteCos={deleteCos}
        busy={busy}
        onToggleSelectAll={toggleSelectAll}
        onMoveAlbumId={setMoveAlbumId}
        onBatchMove={() => void handleBatchMove()}
        onShare={openShareSelected}
        onDeleteCos={setDeleteCos}
        onBatchDelete={() => void handleBatchDelete(snapshotSelectedIds())}
      />

      {error && (
        <div className="rounded-2xl glass px-4 py-3 text-sm text-red-600">{error}</div>
      )}
      {successMsg && (
        <div className="rounded-2xl glass px-4 py-3 text-sm text-green-700">{successMsg}</div>
      )}

      {loading ? (
        <p className="text-center py-16 text-sm" style={{ color: 'var(--text-muted)' }}>
          加载中...
        </p>
      ) : items.length === 0 ? (
        <div className="rounded-3xl glass p-12 text-center" style={{ color: 'var(--text-muted)' }}>
          没有匹配的媒体
        </div>
      ) : view === 'grid' ? (
        <MediaGridView
          items={items}
          thumbs={thumbs}
          selected={selected}
          onToggleSelect={toggleSelect}
          onPreview={openPreview}
        />
      ) : (
        <MediaListView
          items={items}
          selected={selected}
          titleDrafts={titleDrafts}
          takenAtDrafts={takenAtDrafts}
          busy={busy}
          savingTitleId={savingTitleId}
          savingTakenAtId={savingTakenAtId}
          onToggleSelect={toggleSelect}
          onPreview={openPreview}
          onTitleDraft={(id, value) =>
            setTitleDrafts((prev) => ({ ...prev, [id]: value }))
          }
          onTakenAtDraft={(id, value) =>
            setTakenAtDrafts((prev) => ({ ...prev, [id]: value }))
          }
          onSaveTitle={(id) => void saveTitle(id)}
          onSaveTakenAt={(id) => void saveTakenAt(id)}
          onClearTakenAt={(id) => {
            setTakenAtDrafts((prev) => ({ ...prev, [id]: '' }));
            void (async () => {
              setSavingTakenAtId(id);
              setError('');
              try {
                const res = await fetch(`/api/media/${id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ takenAt: null }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || '清空失败');
                setItems((prev) =>
                  prev.map((m) => (m.id === id ? { ...m, takenAt: null } : m))
                );
                setSuccessMsg('已清空拍摄时间（将按入库时间排序）');
              } catch (e: unknown) {
                setError(e instanceof Error ? e.message : '清空失败');
              } finally {
                setSavingTakenAtId(null);
              }
            })();
          }}
          onDeleteOne={(id) => void handleBatchDelete([id])}
        />
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="btn-ghost text-sm disabled:opacity-50"
          >
            上一页
          </button>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="btn-ghost text-sm disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      )}

      <ShareCreateDialog
        open={shareOpen}
        onClose={() => {
          setShareOpen(false);
          setShareIds([]);
        }}
        mediaIds={shareIds}
        title={`分享已选 ${shareIds.length} 项`}
        onCreated={() => {
          setSelected(new Set());
          setSuccessMsg('分享已创建');
        }}
      />

      {lightboxIndex !== null && lightboxItems.length > 0 && (
        <Lightbox
          items={lightboxItems}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onChange={setLightboxIndex}
          variant="simple"
        />
      )}
    </div>
  );
}
