'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { RotateCcw, CheckCircle2 } from 'lucide-react';
import {
  LARGE_UPLOAD_BYTES,
  formatBytes,
  isVideoFilenameOrMime,
  resolveUploadContentType,
} from '@/lib/media-type';
import { capturePosterBlobFromFile } from '@/lib/video-poster';
import {
  CLIENT_POSTER_TIMEOUT_MS,
  MEDIA_SAVE_TIMEOUT_MS,
  PRESIGN_TIMEOUT_MS,
  type UploadPhase,
  assertCosOriginPutUrl,
  fetchWithTimeout,
  putTimeoutMs,
  readApiError,
  uploadPhaseLabel,
  xhrPutFile,
} from '@/lib/upload-client';

interface UploadItem {
  id: string;
  file: File;
  contentType: string;
  /** 可选展示标题（入库用，不改 filename） */
  title: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  /** 上传中三阶段：获取预签名 / PUT / 入库 */
  phase?: UploadPhase;
  error?: string;
  key?: string;
  /** 数据库 Media.id（入库成功后） */
  mediaId?: string;
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
 * 原文件字节直传 COS（预签名 PUT），成功后自动 POST /api/media 入库。
 * 禁止 canvas / ffmpeg / 前端重编码。
 * 三阶段明确状态 + 各步超时，禁止无限转圈。
 */
export default function UploadPage() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [albumId, setAlbumId] = useState('');
  const [albumsError, setAlbumsError] = useState('');
  const [largeHint, setLargeHint] = useState(false);

  const itemsRef = useRef(items);
  const albumIdRef = useRef(albumId);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  itemsRef.current = items;
  albumIdRef.current = albumId;

  useEffect(() => {
    async function loadAlbums() {
      try {
        const res = await fetch('/api/albums');
        if (!res.ok) {
          throw new Error(await readApiError(res, '加载相册失败'));
        }
        setAlbums(await res.json());
      } catch (e: unknown) {
        setAlbumsError(e instanceof Error ? e.message : '加载相册失败');
      }
    }
    void loadAlbums();
  }, []);

  useEffect(() => {
    return () => {
      void wakeLockRef.current?.release().catch(() => undefined);
      wakeLockRef.current = null;
    };
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const requestWakeLock = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch {
      // 浏览器可能拒绝；仅提示用户手动保持常亮
    }
  }, []);

  const releaseWakeLockIfIdle = useCallback(() => {
    const busy = itemsRef.current.some((i) => i.status === 'uploading');
    if (busy) return;
    void wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
  }, []);

  const uploadOne = useCallback(
    async (queueId: string) => {
      const snapshot = itemsRef.current.find((i) => i.id === queueId);
      if (!snapshot) return;
      if (snapshot.status === 'uploading' || snapshot.status === 'success') return;

      updateItem(queueId, {
        status: 'uploading',
        phase: 'presign',
        progress: 0,
        error: undefined,
        sizeMismatch: undefined,
      });

      if (snapshot.localSize > LARGE_UPLOAD_BYTES) {
        void requestWakeLock();
      }

      const contentType =
        snapshot.contentType ||
        resolveUploadContentType(snapshot.file.name, snapshot.file.type);

      try {
        // —— 1. 获取预签名 ——
        updateItem(queueId, { phase: 'presign', progress: 0 });
        const presignRes = await fetchWithTimeout(
          '/api/upload/presign',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: snapshot.file.name,
              contentType,
              size: snapshot.file.size,
            }),
          },
          PRESIGN_TIMEOUT_MS,
          '获取预签名超时，请重试'
        );

        if (!presignRes.ok) {
          throw new Error(await readApiError(presignRes, '获取预签名失败'));
        }

        const { url, key, contentType: signedType } = await presignRes.json();
        if (typeof url !== 'string' || typeof key !== 'string') {
          throw new Error('预签名响应无效');
        }
        assertCosOriginPutUrl(url);
        const putType = signedType || contentType;

        // —— 2. PUT 直传 COS（按体积 5–10 分钟超时）——
        updateItem(queueId, { phase: 'put', progress: 0 });
        const timeoutMs = putTimeoutMs(snapshot.file.size);
        await xhrPutFile(url, snapshot.file, putType, timeoutMs, (progress) => {
          updateItem(queueId, { progress, phase: 'put', status: 'uploading' });
        });

        // —— 3. 入库（可选客户端海报；失败不堵死）——
        updateItem(queueId, { phase: 'saving', progress: 100 });

        const latest = itemsRef.current.find((i) => i.id === queueId);
        const title = (latest?.title ?? snapshot.title).trim();

        let posterKey: string | undefined;
        if (
          putType.startsWith('video/') ||
          isVideoFilenameOrMime(snapshot.file.name, putType)
        ) {
          try {
            const posterBlob = await Promise.race([
              capturePosterBlobFromFile(snapshot.file),
              new Promise<null>((resolve) =>
                setTimeout(() => resolve(null), CLIENT_POSTER_TIMEOUT_MS)
              ),
            ]);
            if (posterBlob && posterBlob.size > 0) {
              const posterName = `${snapshot.file.name.replace(/\.[^.]+$/, '') || 'video'}-poster.jpg`;
              const posterPresign = await fetchWithTimeout(
                '/api/upload/presign',
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    filename: posterName,
                    contentType: 'image/jpeg',
                    size: posterBlob.size,
                  }),
                },
                PRESIGN_TIMEOUT_MS,
                '海报预签名超时'
              );
              if (posterPresign.ok) {
                const { url: posterPutUrl, key: pk } = await posterPresign.json();
                if (typeof posterPutUrl === 'string') {
                  try {
                    assertCosOriginPutUrl(posterPutUrl);
                    const putOk = await fetchWithTimeout(
                      posterPutUrl,
                      {
                        method: 'PUT',
                        headers: { 'Content-Type': 'image/jpeg' },
                        body: posterBlob,
                      },
                      CLIENT_POSTER_TIMEOUT_MS,
                      '海报上传超时'
                    );
                    if (putOk.ok && typeof pk === 'string' && pk.startsWith('media/')) {
                      posterKey = pk;
                    }
                  } catch (posterPutErr) {
                    console.warn('video poster PUT skipped:', posterPutErr);
                  }
                }
              }
            }
          } catch (posterErr) {
            console.warn('video poster client capture skipped:', posterErr);
          }
        }

        const mediaRes = await fetchWithTimeout(
          '/api/media',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              key,
              filename: snapshot.file.name,
              mimeType: putType,
              size: snapshot.file.size,
              albumId: albumIdRef.current || null,
              ...(title ? { title } : {}),
              ...(posterKey ? { posterKey } : {}),
            }),
          },
          MEDIA_SAVE_TIMEOUT_MS,
          '入库超时，文件可能已传到 COS，请重试入库或到媒体库确认'
        );

        if (!mediaRes.ok) {
          throw new Error(await readApiError(mediaRes, '入库失败'));
        }

        const media = await mediaRes.json();

        updateItem(queueId, {
          progress: 100,
          status: 'success',
          phase: undefined,
          key,
          mediaId: media.id,
          contentType: putType,
          storedSize: media.size,
          cosSize: media.cosSize,
          sizeMismatch: Boolean(media.sizeMismatch),
        });
      } catch (err: unknown) {
        updateItem(queueId, {
          status: 'error',
          phase: undefined,
          error: err instanceof Error ? err.message : '上传失败',
        });
      } finally {
        releaseWakeLockIfIdle();
      }
    },
    [updateItem, requestWakeLock, releaseWakeLockIfIdle]
  );

  const addFiles = useCallback((files: File[]) => {
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
        title: '',
        progress: 0,
        status: 'pending' as const,
        localSize: named.size,
      };
    });

    // 入队后可填标题，再点「开始上传」；COS 成功后自动入库，无需再点确认
    setItems((prev) => [...prev, ...newItems]);
  }, []);

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
      const pasteItems = e.clipboardData?.items;
      if (!pasteItems) return;
      const files: File[] = [];
      for (const item of Array.from(pasteItems)) {
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
  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const uploadingCount = items.filter((i) => i.status === 'uploading').length;

  function startUpload(ids: string[]) {
    const idSet = new Set(ids);
    itemsRef.current
      .filter(
        (i) => idSet.has(i.id) && (i.status === 'pending' || i.status === 'error')
      )
      .forEach((item) => {
        void uploadOne(item.id);
      });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">上传</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            预签名直传 COS · 成功后自动入库 · 超时可重试
          </p>
        </div>
        <div className="flex gap-2">
          {successCount > 0 && (
            <Link href="/admin/media" className="btn-primary text-sm">
              查看媒体库（{successCount}）
            </Link>
          )}
          <Link href="/" className="btn-ghost text-sm">
            查看图库
          </Link>
        </div>
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
        <div className="rounded-2xl glass p-4 text-sm border border-amber-300/60 bg-amber-50/50 space-y-1">
          <p>
            检测到超过 100MB 的文件：请<strong>保持屏幕常亮</strong>，上传完成前勿切换到微信或锁屏。
            建议使用 <strong>Safari</strong> 上传。
          </p>
          <p style={{ color: 'var(--text-muted)' }}>
            （当前为单次 PUT 无损直传；更大文件后续可加 multipart，仍按原字节上传。）
          </p>
        </div>
      )}

      <div className="rounded-2xl glass p-4 space-y-2">
        <label className="block text-sm font-medium">归属相册（可选）</label>
        <select
          className="input-glass"
          value={albumId}
          onChange={(e) => setAlbumId(e.target.value)}
          disabled={uploadingCount > 0}
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
          流程：获取预签名 → 上传到 COS（显示进度）→ 入库。任一步超时会标红并可重试。
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
          <div
            className="flex flex-wrap items-center justify-between gap-2 text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            <span>
              已入库 {successCount} · 上传中 {uploadingCount} · 失败 {errorCount} · 等待{' '}
              {pendingCount} · 共 {items.length}
            </span>
            <div className="flex gap-2">
              {pendingCount > 0 && (
                <button
                  type="button"
                  className="btn-primary !py-1.5 !px-3 text-sm"
                  onClick={() =>
                    startUpload(items.filter((i) => i.status === 'pending').map((i) => i.id))
                  }
                >
                  开始上传全部
                </button>
              )}
              {errorCount > 0 && (
                <button
                  type="button"
                  className="btn-ghost !py-1.5 !px-3 text-sm inline-flex items-center gap-1"
                  onClick={() =>
                    startUpload(items.filter((i) => i.status === 'error').map((i) => i.id))
                  }
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  重试全部失败
                </button>
              )}
            </div>
          </div>

          {items.map((item) => {
            const isVideo = isVideoFilenameOrMime(item.file.name, item.contentType);
            const canEditTitle = item.status === 'pending' || item.status === 'error';
            const phaseText =
              item.status === 'uploading' && item.phase
                ? uploadPhaseLabel(item.phase, item.progress)
                : null;
            return (
              <div key={item.id} className="p-4 rounded-2xl glass space-y-3">
                <div className="flex items-center gap-4">
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
                  <div className="w-40 text-right text-sm shrink-0">
                    {item.status === 'uploading' && (
                      <div className="space-y-1">
                        <div className="h-2 rounded-full overflow-hidden bg-white/50">
                          <div
                            className={`h-full bg-blue-500 transition-all ${
                              item.phase === 'saving' || item.phase === 'presign'
                                ? 'animate-pulse'
                                : ''
                            }`}
                            style={{
                              width:
                                item.phase === 'put'
                                  ? `${item.progress}%`
                                  : item.phase === 'saving'
                                    ? '100%'
                                    : '15%',
                            }}
                          />
                        </div>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {phaseText}
                        </p>
                      </div>
                    )}
                    {item.status === 'success' && (
                      <span className="text-green-600 inline-flex items-center gap-1 justify-end">
                        <CheckCircle2 className="w-4 h-4" />
                        已入库
                      </span>
                    )}
                    {item.status === 'error' && (
                      <div className="space-y-1">
                        <p className="text-red-500 text-xs break-all text-left sm:text-right">
                          {item.error || '上传失败'}
                        </p>
                        <button
                          type="button"
                          onClick={() => void uploadOne(item.id)}
                          className="text-blue-600 text-xs hover:underline inline-flex items-center gap-0.5"
                        >
                          <RotateCcw className="w-3 h-3" />
                          重试
                        </button>
                      </div>
                    )}
                    {item.status === 'pending' && (
                      <button
                        type="button"
                        className="btn-primary !py-1.5 !px-3 text-xs"
                        onClick={() => void uploadOne(item.id)}
                      >
                        开始上传
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                    标题{isVideo ? '（推荐）' : '（可选）'} · 最长 100 字
                  </label>
                  <input
                    type="text"
                    className="input-glass text-sm"
                    maxLength={100}
                    placeholder="不填则前台显示文件名"
                    value={item.title}
                    disabled={!canEditTitle}
                    onChange={(e) => updateItem(item.id, { title: e.target.value })}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
