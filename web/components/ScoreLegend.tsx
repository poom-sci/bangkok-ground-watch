'use client';

import { useState } from 'react';
import { fmtNum, type ScoreMaps } from '@/lib/data';
import { dict, type Key } from '@/lib/i18n';
import { useLang, useT } from './ui';

export function useExclText() {
  const t = useT();
  const lang = useLang();
  const has = (k: string) => (dict[lang] as Record<string, string>)[k] != null;
  return {
    label: (cls: string, fallback: string) => (lang === 'th' && has(`sc.excl.${cls}`) ? t(`sc.excl.${cls}` as Key) : fallback),
    why: (cls: string, fallback: string) => (lang === 'th' && has(`sc.why.${cls}`) ? t(`sc.why.${cls}` as Key) : fallback),
  };
}

export default function ScoreLegend({ maps, areaId, defaultOpen, dashed }: { maps: ScoreMaps; areaId: string | null; defaultOpen: boolean; dashed: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);
  const x = useExclText();
  const a = areaId ? maps.areas[areaId] : null;
  const water = a ? (a.excl.perm_water ?? 0) + (a.excl.water_body ?? 0) : null;
  const line = a && a.scoredPct != null ? t('score.line', { s: fmtNum(a.scoredPct, 0) ?? '', a: fmtNum(a.excl.tree_cover ?? 0, 0) ?? '', b: fmtNum(water ?? 0, 0) ?? '', c: fmtNum(a.excl.wetland ?? 0, 0) ?? '' }) : null;
  return (
    <details className="score-legend glass" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>{t('score.legend')}</summary>
      <button type="button" className="btn sl-close" onClick={() => setOpen(false)}>{t('about.close')}</button>
      <p className="sl-h">{t('score.title')}</p>
      <ul className="sl-ramp">
        {maps.ramp.map((r) => <li key={r.range}><span className="sw" style={{ background: r.colour }} /><span className="mono">{r.range}</span></li>)}
      </ul>
      <p className="sl-h">{t('score.notscored')}</p>
      <ul className="sl-ex">
        {maps.excluded.filter((e) => e.cls !== 'protected' || (a?.excl.protected ?? 0) > 0).map((e) => (
          <li key={e.cls} title={x.why(e.cls, e.reason)}><span className="sw" style={{ background: e.colour }} /><span className="sl-t"><b>{x.label(e.cls, e.label)}</b><span>{x.why(e.cls, e.reason)}</span></span></li>
        ))}
      </ul>
      {line && <p className="sl-line">{line}</p>}
      {dashed && <p className="sl-line">{t('score.dashed')}</p>}
    </details>
  );
}
