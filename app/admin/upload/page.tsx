'use client';

import { useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface UploadItem {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  key?: string;
}

export default function UploadPage() {
  const { data: session, status } = useSession();
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
    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
  }, []);

  function addFiles(files: File[]) {
    const newItems: UploadItem[] = files.map((file) => ({
      file,
      progress: 0,
      status: 'pending',
    }));
    setItems((prev) => [...prev, ...newItems]);
    newItems.forEach((item, idx) => uploadOne(item, items.length + idx));
  }

  async function uploadOne(item: UploadItem, index: number) {
    try {
      // 1. 获取预签名
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

      // 2. 直接 PUT 到 COS
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
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`上传失败: ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error('网络错误'));
        xhr.send(item.file);
      });

      // 3. 入库
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

      if (!mediaRes.ok) {
        throw new Error('入库失败');
      }

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
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">上传照片 / 视频</h1>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-2xl p-12 text-center transition ${
            dragging ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-700 bg-zinc-900'
          }`}
        >
          <p className="text-zinc-400 mb-4">拖拽文件到这里，或点击选择</p>
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
          <label
            htmlFor="file-input"
            className="inline-block px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 cursor-pointer transition"
          >
            选择文件
          </label>
        </div>

        {items.length > 0 && (
          <div className="mt-8 space-y-3">
            {items.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-4 p-4 rounded-xl bg-zinc-900 border border-zinc-800"
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm">{item.file.name}</p>
                  <p className="text-xs text-zinc-500">
                    {(item.file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>

                <div className="w-32">
                  {item.status === 'uploading' && (
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  )}
                  {item.status === 'success' && (
                    <span className="text-green-400 text-sm">完成</span>
                  )}
                  {item.status === 'error' && (
                    <span className="text-red-400 text-sm">{item.error}</span>
                  )}
                  {item.status === 'pending' && (
                    <span className="text-zinc-500 text-sm">等待中</span>
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