import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { deleteObject } from '@/lib/cos';
import { deleteLocalMediaFile, normalizeStorage } from '@/lib/storage';

/**
 * 批量媒体操作
 * Body:
 *   action: 'move' | 'delete'
 *   ids: string[]
 *   albumId?: string | null   (move)
 *   deleteFromCos?: boolean   (delete，兼容旧字段)
 *   deleteFile?: boolean      (delete，按 storage 删文件)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const { action, ids, albumId, deleteFromCos, deleteFile } = body;
    const shouldDeleteFile = Boolean(deleteFile ?? deleteFromCos);

    if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== 'string')) {
      return NextResponse.json({ error: 'ids 无效' }, { status: 400 });
    }

    if (ids.length > 100) {
      return NextResponse.json({ error: '单次最多 100 项' }, { status: 400 });
    }

    if (action === 'move') {
      let targetAlbumId: string | null = null;
      if (albumId === null || albumId === '' || albumId === undefined) {
        targetAlbumId = null;
      } else if (typeof albumId === 'string') {
        const album = await prisma.album.findUnique({ where: { id: albumId } });
        if (!album) {
          return NextResponse.json({ error: '相册不存在' }, { status: 400 });
        }
        targetAlbumId = albumId;
      } else {
        return NextResponse.json({ error: 'albumId 无效' }, { status: 400 });
      }

      const result = await prisma.media.updateMany({
        where: { id: { in: ids } },
        data: { albumId: targetAlbumId },
      });

      return NextResponse.json({ success: true, count: result.count });
    }

    if (action === 'delete') {
      const mediaList = await prisma.media.findMany({
        where: { id: { in: ids } },
        select: { id: true, key: true, storage: true },
      });

      if (mediaList.length === 0) {
        return NextResponse.json({ error: '没有可删除的媒体' }, { status: 404 });
      }

      const fileErrors: { id: string; key: string; storage: string; error: string }[] = [];

      if (shouldDeleteFile) {
        for (const m of mediaList) {
          const storage = normalizeStorage(m.storage, 'cos');
          try {
            if (storage === 'cos') {
              await deleteObject(m.key);
            } else {
              await deleteLocalMediaFile(m.key);
            }
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : '存储删除失败';
            fileErrors.push({ id: m.id, key: m.key, storage, error: message });
          }
        }

        if (fileErrors.length > 0) {
          return NextResponse.json(
            {
              error: `${fileErrors.length} 个存储对象删除失败，已中止数据库删除`,
              cosErrors: fileErrors,
              fileErrors,
              deleted: 0,
            },
            { status: 502 }
          );
        }
      }

      const result = await prisma.media.deleteMany({
        where: { id: { in: mediaList.map((m) => m.id) } },
      });

      return NextResponse.json({
        success: true,
        count: result.count,
        fileDeleted: shouldDeleteFile,
        cosDeleted: shouldDeleteFile,
      });
    }

    return NextResponse.json({ error: '不支持的 action' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '批量操作失败';
    console.error('media batch error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
