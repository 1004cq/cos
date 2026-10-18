export type Album = {
  id: string;
  title: string;
};

export type MediaItem = {
  id: string;
  key: string;
  filename: string;
  title?: string | null;
  mimeType: string;
  size: number;
  createdAt: string;
  takenAt?: string | null;
  album?: { id: string; title: string } | null;
};

/** datetime-local 控件值（本地时区） */
export function toDatetimeLocalValue(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
