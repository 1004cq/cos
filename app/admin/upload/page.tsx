'use client';

import { useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface UploadItem {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  key?: string;
}

export default function UploadPage() {
  const { status } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);

  if (status === 'unauthenticated') {
    router.push('/admin/login');
    return null;
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }, []);

  function addFiles(files: File[]) {
    const newItems: UploadItem[] = files.map((file) => ({
      file,
      progress: 0,
      status: 'pending',
    }));
    setItems((prev) => {
      const start = prev.length;
      const next = [...prev, ...newItems];
      newItems.forEach((item, idx) => uploadOne(item, start + idx));
      return next;
    });
  }

  async function uploadOne(item: UploadItem, index: number) {
    try {
      const presignRes = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: item.file.name,
          contentType: item.file.type || 'application/octet-stream',
          size: item.file.size,
        }),
      });

      if (!presignRes.ok) {
        const err = await presignRes.json();
        throw new Error(err.error || '获取预签名失败');
      }

      const { url, key } = await presignRes.json();

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url);
        xhr.setRequestHeader('Content-Type', item.file.type || 'application/octet-stream');

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100);
            setItems((prev) => {
              const next = [...prev];
              next[index] = { ...next[index], progress, status: 'uploading' };
              return next;
            });
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`上传失败: ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error('网络错误'));
        xhr.send(item.file);
      });

      const mediaRes = await fetch('/api/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          filename: item.file.name,
          mimeType: item.file.type || 'application/octet-stream',
          size: item.file.size,
        }),
      });

      if (!mediaRes.ok) throw new Error('入库失败');

      setItems((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], progress: 100, status: 'success', key };
        return next;
      });
    } catch (err: any) {
      setItems((prev) => {
        const next = [...prev];
        next[index] = {
          ...next[index],
          status: 'error',
          error: err.message || '上传失败',
        };
        return next;
      });
    }
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">上传照片 / 视频</h1>
          <Link href="/" className="btn-ghost !py-1.5 !px-3 text-sm">
            返回时间轴
          </Link>
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
          <p className="mb-4" style={{ color: 'var(--text-muted)' }}>
            拖拽文件到这里，或点击选择
          </p>
          <input
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            id="file-input"
            onChange={(e) => {
              if (e.target.files) addFiles(Array.from(e.target.files));
            }}
          />
          <label htmlFor="file-input" className="btn-primary inline-block cursor-pointer">
            选择文件
          </label>
        </div>

        {items.length > 0 && (
          <div className="mt-8 space-y-3">
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-4 p-4 rounded-2xl glass">
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">{item.file.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {(item.file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <div className="w-32 text-right text-sm">
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
                    <span className="text-red-500">{item.error}</span>
                  )}
                  {item.status === 'pending' && (
                    <span style={{ color: 'var(--text-muted)' }}>等待中</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}