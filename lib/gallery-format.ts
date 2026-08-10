/** 图库日期/时长格式化（iOS 照片风格） */

export function itemSortDate(item: { takenAt?: string | null; createdAt?: string }): Date {
  const raw = item.takenAt || item.createdAt;
  const d = raw ? new Date(raw) : new Date(0);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}

export function formatGalleryDay(date: Date): string {
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatGalleryMonth(date: Date): string {
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' });
}

export function formatGalleryYear(date: Date): string {
  return date.toLocaleDateString('zh-CN', { year: 'numeric' });
}

export function formatWeekday(date: Date): string {
  return date.toLocaleDateString('zh-CN', { weekday: 'long' });
}

export function formatTimeOfDay(date: Date): string {
  const h = date.getHours();
  const period = h < 6 ? '凌晨' : h < 12 ? '上午' : h < 18 ? '下午' : '晚上';
  const time = date.toLocaleTimeString('zh-CN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });
  return `${period} ${time}`;
}

export function formatDuration(seconds?: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '';
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function yearKey(date: Date): string {
  return String(date.getFullYear());
}
