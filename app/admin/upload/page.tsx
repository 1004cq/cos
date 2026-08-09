'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RotateCcw } from 'lucide-react';
import {
  LARGE_UPLOAD_BYTES,
  formatBytes,
  isVideoFilenameOrMime,
  resolveUploadContentType,
} from '@/lib/media-type';

interface UploadItem {
  id: string;
  file: File;
  contentType: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  key?: string;
  /** 本地 File.size */
  localSize: number;
  /** 入库 Media.size（优先 COS Content-Length） */
  storedSize?: number;
  cosSize?: number | null;
  sizeMismatch?: boolean;
}

type Album = {
  id: string;
  title: string;
};

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 原文件字节直传 COS（预签名 PUT）。
 * 禁止 canvas / ffmpeg / 前端重编码；超大文件后续可加 multipart（仍无损）。
 */
export default function UploadPage() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [albumId, setAlbumId] = useState('');
  const [albumsError, setAlbumsError] = useState('');
  const [largeHint, setLargeHint] = useState(false);

  useEffect(() => {
    async function loadAlbums() {
      try {
        const res = await fetch('/api/albums');
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || '加载相册失败');
        }
        setAlbums(await res.json());
      } catch (e: unknown) {
        setAlbumsError(e instanceof Error ? e.message : '加载相册失败');
      }
    }
    void loadAlbums();
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const uploadOne = useCallback(
    async (item: UploadItem) => {
      updateItem(item.id, { status: 'uploading', progress: 0, error: undefined, sizeMismatch: undefined });

      const contentType = item.contentType || resolveUploadContentType(item.file.name, item.file.type);

      try {
        const presignRes = await fetch('/api/upload/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: item.file.name,
            contentType,
            size: item.file.size,
          }),
        });

        if (!presignRes.ok) {
          const err = await presignRes.json().catch(() => ({}));
          throw new Error(err.error || '获取预签名失败');
        }

        const { url, key, contentType: signedType } = await presignRes.json();
        // PUT 的 Content-Type 必须与申请预签名时一致
        const putType = signedType || contentType;

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', url);
          xhr.setRequestHeader('Content-Type', putType);

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const progress = Math.round((e.loaded / e.total) * 100);
              updateItem(item.id, { progress, status: 'uploading' });
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`上传失败: ${xhr.status}`));
          };
          xhr.onerror = () => reject(new Error('网络错误'));
          // 直接发送 File/Blob 原字节，不做任何转码或压缩
          xhr.send(item.file);
        });

        const mediaRes = await fetch('/api/media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key,
            filename: item.file.name,
            mimeType: putType,
            size: item.file.size,
            albumId: albumId || null,
          }),
        });

        if (!mediaRes.ok) {
          const err = await mediaRes.json().catch(() => ({}));
          throw new Error(err.error || '入库失败');
        }

        const media = await mediaRes.json();
        updateItem(item.id, {
          progress: 100,
          status: 'success',
          key,
          contentType: putType,
          storedSize: media.size,
          cosSize: media.cosSize,
          sizeMismatch: Boolean(media.sizeMismatch),
        });
      } catch (err: unknown) {
        updateItem(item.id, {
          status: 'error',
          error: err instanceof Error ? err.message : '上传失败',
        });
      }
    },
    [albumId, updateItem]
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const mediaFiles = files.filter((f) => {
        const ct = resolveUploadContentType(f.name, f.type);
        return ct.startsWith('image/') || ct.startsWith('video/');
      });
      if (mediaFiles.length === 0) return;

      if (mediaFiles.some((f) => f.size > LARGE_UPLOAD_BYTES)) {
        setLargeHint(true);
      }

      const newItems: UploadItem[] = mediaFiles.map((file) => {
        const contentType = resolveUploadContentType(file.name, file.type);
        // 粘贴的截图常无文件名；视频保持相册原名，避免改扩展名破坏 MIME
        const isPasteImage =
          contentType.startsWith('image/') &&
          (!file.name || file.name === 'image.png' || file.name === 'blob');

        const named = isPasteImage
          ? new File(
              [file],
              `paste-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${
                contentType.includes('png')
                  ? 'png'
                  : contentType.includes('jpeg') || contentType.includes('jpg')
                    ? 'jpg'
                    : contentType.includes('webp')
                      ? 'webp'
                      : 'bin'
              }`,
              { type: contentType }
            )
          : file;

        return {
          id: makeId(),
          file: named,
          contentType: resolveUploadContentType(named.name, named.type || contentType),
          progress: 0,
          status: 'pending' as const,
          localSize: named.size,
        };
      });

      setItems((prev) => [...prev, ...newItems]);
      newItems.forEach((item) => {
        void uploadOne(item);
      });
    },
    [uploadOne]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      addFiles(Array.from(e.dataTransfer.files));
    },
    [addFiles]
  );

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        addFiles(files);
      }
    }

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles]);

  const successCount = items.filter((i) => i.status === 'success').length;
  const errorCount = items.filter((i) => i.status === 'error').length;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">上传</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            预签名直传 COS · 原画质字节级保存（不转码、不压缩）
          </p>
        </div>
        <Link href="/" className="btn-ghost text-sm">
          查看图库
        </Link>
      </div>

      <div className="rounded-2xl glass p-4 space-y-2 text-sm">
        <p className="font-medium">iPhone 原相机视频说明</p>
        <ul className="list-disc pl-5 space-y-1" style={{ color: 'var(--text-muted)' }}>
          <li>请使用 Safari 打开本页上传，尽量避免微信内打开</li>
          <li>请直接从相册选择原视频，不要先发微信再保存</li>
          <li>本系统原样保存文件，不压缩视频（.MOV / .MP4，HEVC 或 H.264）</li>
        </ul>
      </div>

      {largeHint && (
        <div className="rounded-2xl glass p-4 text-sm border border-amber-300/60 bg-amber-50/50">
          检测到超过 100MB 的文件：请保持屏幕常亮，上传完成前勿切换到微信或锁屏。
          （当前为单次 PUT 无损直传；更大文件后续可加 multipart，仍按原字节上传。）
        </div>
      )}

      <div className="rounded-2xl glass p-4 space-y-2">
        <label className="block text-sm font-medium">归属相册（可选）</label>
        <select
          className="input-glass"
          value={albumId}
          onChange={(e) => setAlbumId(e.target.value)}
        >
          <option value="">不归入相册</option>
          {albums.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
        {albumsError && <p className="text-xs text-red-500">{albumsError}</p>}
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          选择后，本次新上传的文件将写入该相册；已在队列中的任务沿用开始时的选择。
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-3xl p-12 text-center transition border-2 border-dashed glass ${
          dragging ? 'border-blue-400 bg-blue-50/40' : 'border-white/60'
        }`}
      >
        <p className="mb-2" style={{ color: 'var(--text-muted)' }}>
          拖拽文件到这里，或点击选择
        </p>
        <p className="mb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          支持图片与原视频（.mov / .mp4）；也支持 Ctrl/⌘ + V 粘贴截图
        </p>
        <input
          type="file"
          multiple
          accept="image/*,video/*,video/quicktime,.mov,.mp4,.m4v"
          className="hidden"
          id="file-input"
          onChange={(e) => {
            if (e.target.files) addFiles(Array.from(e.target.files));
            e.target.value = '';
          }}
        />
        <label htmlFor="file-input" className="btn-primary inline-block cursor-pointer">
          选择文件
        </label>
      </div>

      {items.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm" style={{ color: 'var(--text-muted)' }}>
            <span>
              完成 {successCount} · 失败 {errorCount} · 共 {items.length}
            </span>
            {errorCount > 0 && (
              <button
                type="button"
                className="btn-ghost !py-1.5 !px-3 text-sm inline-flex items-center gap-1"
                onClick={() => {
                  items
                    .filter((i) => i.status === 'error')
                    .forEach((item) => void uploadOne(item));
                }}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                重试全部失败
              </button>
            )}
          </div>

          {items.map((item) => {
            const isVideo = isVideoFilenameOrMime(item.file.name, item.contentType);
            return (
              <div key={item.id} className="flex items-center gap-4 p-4 rounded-2xl glass">
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">
                    {isVideo ? '[视频] ' : ''}
                    {item.file.name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    本地 {formatBytes(item.localSize)}
                    {item.status === 'success' && item.storedSize != null && (
                      <> · 入库 {formatBytes(item.storedSize)}</>
                    )}
                    {item.contentType ? ` · ${item.contentType}` : ''}
                  </p>
                  {item.status === 'success' && item.sizeMismatch && (
                    <p className="text-xs text-amber-600 mt-1">
                      警告：本地大小与 COS/入库不一致（本地 {formatBytes(item.localSize)}
                      {item.cosSize != null ? ` / COS ${formatBytes(item.cosSize)}` : ''}
                      ）。请重新用 Safari 从相册选择原文件上传。
                    </p>
                  )}
                </div>
                <div className="w-36 text-right text-sm">
                  {item.status === 'uploading' && (
                    <div className="h-2 rounded-full overflow-hidden bg-white/50">
                      <div
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  )}
                  {item.status === 'success' && (
                    <span className="text-green-600">完成</span>
                  )}
                  {item.status === 'error' && (
                    <div className="space-y-1">
                      <p className="text-red-500 text-xs break-all">{item.error}</p>
                      <button
                        type="button"
                        onClick={() => void uploadOne(item)}
                        className="text-blue-600 text-xs hover:underline inline-flex items-center gap-0.5"
                      >
                        <RotateCcw className="w-3 h-3" />
                        重试
                      </button>
                    </div>
                  )}
                  {item.status === 'pending' && (
                    <span style={{ color: 'var(--text-muted)' }}>等待中</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
