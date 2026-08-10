/** 图库网格密度档位（对标 iOS 照片捏合缩放） */

export type GalleryDensity = 'all' | 'month' | 'year';

export type DensityPreset = {
  density: GalleryDensity;
  columns: number;
  /** 分组粒度 */
  groupBy: 'day' | 'month' | 'year';
  showSectionHeaders: boolean;
};

export const DENSITY_PRESETS: Record<GalleryDensity, DensityPreset> = {
  all: { density: 'all', columns: 3, groupBy: 'day', showSectionHeaders: false },
  month: { density: 'month', columns: 6, groupBy: 'month', showSectionHeaders: true },
  year: { density: 'year', columns: 9, groupBy: 'year', showSectionHeaders: true },
};

export const DENSITY_ORDER: GalleryDensity[] = ['all', 'month', 'year'];

export const MIN_COLUMNS = 2;
export const MAX_COLUMNS = 10;

export function clampColumns(n: number): number {
  return Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, Math.round(n)));
}

/** 松手吸附到最近档位（按列数） */
export function snapDensityByColumns(columns: number): GalleryDensity {
  const c = clampColumns(columns);
  const distances = DENSITY_ORDER.map((d) => ({
    d,
    dist: Math.abs(DENSITY_PRESETS[d].columns - c),
  }));
  distances.sort((a, b) => a.dist - b.dist || DENSITY_ORDER.indexOf(a.d) - DENSITY_ORDER.indexOf(b.d));
  return distances[0]!.d;
}

export function densityFromPinchScale(baseColumns: number, scale: number): number {
  // 双指张开 scale↑ → 列数增多（缩略图变小）；捏合 scale↓ → 列数减少
  return clampColumns(baseColumns * scale);
}

/** 列数 ≤5 显示完整时长；更密仅图标 */
export function isCompactGrid(columns: number): boolean {
  return columns >= 7;
}

export function showTinyDuration(columns: number): boolean {
  return columns >= 5 && columns < 7;
}
