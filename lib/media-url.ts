import { getSignedUrl } from '@/lib/cos';
import { normalizeStorage, type StorageBackend } from '@/lib/storage';
import { signMediaFileToken } from '@/lib/media-token';

export type MediaUrlSource = {
  id: string;
  key: string;
  mimeType: string;
  storage?: string | null;
};

export type MediaAccessUrls = {
  url: string;
  thumbUrl: string | null;
  storage: StorageBackend;
};

function localFileUrl(id: string, expiresSec: number): string {
  const t = signMediaFileToken(id, expiresSec);
  return `/api/media/file/${encodeURIComponent(id)}?t=${encodeURIComponent(t)}`;
}

/**
 * 按 Media.storage 生成可访问 URL（图库/分享/灯箱统一走这里）
 * - cos：预签名
 * - local：HMAC 短时 token（公开图库可用，无需登录）
 * 历史无 storage 字段时视为 cos
 */
export async function getMediaAccessUrls(
  media: MediaUrlSource,
  expiresSec = 1800
): Promise<MediaAccessUrls> {
  const storage = normalizeStorage(media.storage, 'cos');
  const isImage = media.mimeType.startsWith('image/');
  const isVideo = media.mimeType.startsWith('video/');

  if (storage === 'local') {
    const url = localFileUrl(media.id, expiresSec);
    // 第一版：本地缩略直接复用原图 URL（CSS 缩小）
    return {
      url,
      thumbUrl: isImage || isVideo ? url : null,
      storage,
    };
  }

  const url = await getSignedUrl(media.key, expiresSec);
  let thumbUrl: string | null = null;
  if (isImage) {
    try {
      thumbUrl = await getSignedUrl(media.key, expiresSec, { thumb: true });
    } catch (err) {
      console.warn('thumb sign failed:', media.key, err);
      thumbUrl = null;
    }
  } else if (isVideo) {
    try {
      thumbUrl = await getSignedUrl(media.key, expiresSec, { snapshot: true });
    } catch (err) {
      console.warn('snapshot sign failed:', media.key, err);
      thumbUrl = null;
    }
  }

  return { url, thumbUrl, storage };
}
