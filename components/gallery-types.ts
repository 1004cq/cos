import type { LightboxItem } from '@/components/lightbox';

export type GalleryItem = LightboxItem & {
  key: string;
  thumbUrl?: string;
  kind: 'image' | 'video' | 'other';
  takenAt?: string | null;
  createdAt: string;
  duration?: number | null;
};

export type GalleryDensity = import('@/lib/gallery-density').GalleryDensity;

/** @deprecated 使用 GalleryDensity */
export type GalleryViewMode = GalleryDensity | 'library';
