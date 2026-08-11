/**
 * 相册封面：优先 coverKey；否则取相册内第一张可用图（图片 key 或视频 posterKey）
 */
export function resolveAlbumCoverKey(album: {
  coverKey?: string | null;
  media?: Array<{
    key: string;
    posterKey?: string | null;
    mimeType: string;
  }>;
}): string | null {
  if (album.coverKey && album.coverKey.startsWith('media/')) {
    return album.coverKey;
  }
  const list = album.media || [];
  for (const m of list) {
    if (m.mimeType.startsWith('image/') && m.key.startsWith('media/')) {
      return m.key;
    }
  }
  for (const m of list) {
    if (
      m.mimeType.startsWith('video/') &&
      m.posterKey &&
      m.posterKey.startsWith('media/')
    ) {
      return m.posterKey;
    }
  }
  return null;
}
