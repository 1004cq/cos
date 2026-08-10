import type { LightboxItem } from '@/components/lightbox';

export type GalleryItem = LightboxItem & {
  key: string;
  thumbUrl?: string;
  kind: 'image' | 'video' | 'other';
  takenAt?: string | null;
  createdAt: string;
  duration?: number | null;
};

export type GalleryViewMode = 'library' | 'year' | 'month' | 'all';
