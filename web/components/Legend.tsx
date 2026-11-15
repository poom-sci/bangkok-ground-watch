'use client';

import { useT, Badge } from './ui';
import { fmtNum, type Layer } from '@/lib/data';
import type { MapViewMode } from './MapView';

const signed = (v: number) => (v > 0 ? `+${fmtNum(v, Number.isInteger(v) ? 0 : 1)}` : fmtNum(v, Number.isInteger(v) ? 0 : 1));

export default function Legend({ mode, type, layer, rangeMm, isNisar }: {
  mode: MapViewMode; type: 'gunw' | 'water'; layer: Layer | null; rangeMm: number | null; isNisar: boolean | null;
}) {
  const t = useT();
  const demo = isNisar === false ? <Badge nisar={false} /> : null;

  if (mode === 'districts') {
    const bands = ['0-20', '20-40', '40-60', '60-80', '80-100'];
    return (
      <div className="legend" role="group" aria-label={t('legend.districts')}>
        <p className="legend-cap">{t('legend.districts')}</p>
        <ul className="swatches">
          {bands.map((b, i) => <li key={b}><span className="sw" style={{ background: `var(--ramp-${i + 1})` }} /><span className="mono">{b}</span></li>)}
          <li><span className="sw hatch" /><span>{t('nodata')}</span></li>
        </ul>
      </div>
    );
  }

  if (type === 'water') {
    const thr = layer ? fmtNum(layer.thresholdDb, 1) : null;
    return (
      <div className="legend" role="group" aria-label={t('legend.waterPlain')}>
        <p className="legend-row"><span className="sw water" /><span>{thr ? t('legend.water', { x: thr }) : t('legend.waterPlain')}</span></p>
        <p className="legend-cap">{t('legend.water.cap')}</p>
        <p className="legend-cap">{t('legend.water.none')}</p>
        {demo}
      </div>
    );
  }

  const ticks = rangeMm != null && rangeMm > 0 ? [-rangeMm, -rangeMm / 2, 0, rangeMm / 2, rangeMm] : null;
  return (
    <div className="legend" role="group" aria-label={t('legend.los')}>
      <div className="los-bar" />
      {ticks && <div className="los-ticks mono">{ticks.map((v) => <span key={v}>{signed(v) ?? ''}</span>)}</div>}
      <p className="legend-cap">{t('legend.los')}</p>
      <p className="legend-cap">{t('legend.nodata')}</p>
      {demo}
    </div>
  );
}
