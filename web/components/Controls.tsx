'use client';

import { useId } from 'react';
import { Segmented, Chevron, useT, type SegOption } from './ui';
import { parseTrack, type LayerType } from '@/lib/data';
import type { MapViewMode } from './MapView';

export function LayerSwitch({ type, has, disabled, onChange }: {
  type: LayerType; has: Record<LayerType, boolean>; disabled: boolean; onChange: (t: LayerType) => void;
}) {
  const t = useT();
  const options: SegOption<LayerType>[] = [
    { value: 'gunw', label: t('layer.los'), disabled: !has.gunw, tag: has.gunw ? undefined : t('layer.soon') },
    { value: 'water', label: t('layer.water'), disabled: !has.water, tag: has.water ? undefined : t('layer.soon') },
  ];
  return <Segmented label={t('layer.label')} options={options} value={type} onChange={onChange} disabled={disabled} />;
}

export function DisplayControls({ tracks, available, track, onTrack, opacity, onOpacity, mapView, onMapView }: {
  tracks: string[]; available: Set<string>; track: string; onTrack: (t: string) => void;
  opacity: number; onOpacity: (n: number) => void; mapView: MapViewMode; onMapView: (m: MapViewMode) => void;
}) {
  const t = useT();
  const opId = useId();
  const options: SegOption<string>[] = tracks.map((k) => {
    const p = parseTrack(k);
    return { value: k, label: p ? t(p.dir === 'A' ? 'track.A' : 'track.D', { n: p.n }) : k, disabled: !available.has(k) };
  });
  return (
    <div className="display-body">
      <div className="field">
        <span className="field-label">{t('track.label')}</span>
        <Segmented label={t('track.label')} options={options} value={track} onChange={onTrack} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor={opId}>{t('opacity')} <span className="mono">{opacity}%</span></label>
        <input id={opId} className="range" type="range" min={20} max={100} step={5} value={opacity} onChange={(e) => onOpacity(Number(e.target.value))} />
      </div>
      <div className="field">
        <span className="field-label">{t('mapview')}</span>
        <Segmented label={t('mapview')} value={mapView} onChange={onMapView}
          options={[{ value: 'radar', label: t('mapview.radar') }, { value: 'districts', label: t('mapview.districts') }]} />
      </div>
    </div>
  );
}

export function DisplayToggle({ open, onToggle, controls }: { open: boolean; onToggle: () => void; controls: string }) {
  const t = useT();
  return (
    <button type="button" className="btn row-btn" aria-expanded={open} aria-controls={controls} onClick={onToggle}>
      <span>{t('display')}</span><Chevron open={open} />
    </button>
  );
}
