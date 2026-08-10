'use client';

import { useRef, useState } from 'react';
import { usePinch } from '@use-gesture/react';
import {
  type GalleryDensity,
  DENSITY_PRESETS,
  densityFromPinchScale,
  snapDensityByColumns,
} from '@/lib/gallery-density';

type Props = {
  density: GalleryDensity;
  onDensityChange: (density: GalleryDensity) => void;
  children: (props: {
    columns: number;
    pinching: boolean;
    bind: ReturnType<typeof usePinch>;
  }) => React.ReactNode;
};

/**
 * 图库网格捏合缩放（与大图灯箱双指缩放无关）
 */
export function GalleryPinchGrid({ density, onDensityChange, children }: Props) {
  const preset = DENSITY_PRESETS[density];
  const [liveColumns, setLiveColumns] = useState<number | null>(null);
  const [pinching, setPinching] = useState(false);
  const baseColumnsRef = useRef(preset.columns);
  const densityRef = useRef(density);
  densityRef.current = density;
  const onChangeRef = useRef(onDensityChange);
  onChangeRef.current = onDensityChange;

  const bind = usePinch(
    ({ offset: [scale], first, last }) => {
      if (first) {
        baseColumnsRef.current =
          liveColumns ?? DENSITY_PRESETS[densityRef.current].columns;
        setPinching(true);
      }

      setLiveColumns(densityFromPinchScale(baseColumnsRef.current, scale));

      if (last) {
        setPinching(false);
        const snapped = snapDensityByColumns(
          densityFromPinchScale(baseColumnsRef.current, scale)
        );
        setLiveColumns(null);
        onChangeRef.current(snapped);
      }
    },
    {
      scaleBounds: { min: 0.45, max: 2.2 },
      rubberband: 0.12,
      pointer: { touch: true },
    }
  );

  const columns = liveColumns ?? preset.columns;

  return <>{children({ columns, pinching, bind })}</>;
}
