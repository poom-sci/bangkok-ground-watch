'use client';

import { useState } from 'react';
import { useLang, useT, NoData, Pending } from './ui';
import { fmtNum, type District } from '@/lib/data';

const names = (d: District, lang: 'en' | 'th') => (lang === 'en' ? [d.nameEn, d.nameTh] : [d.nameTh, d.nameEn]);

function Row({ d, rank, track, selected, onPick }: { d: District; rank: number | null; track: string; selected: boolean; onPick: () => void }) {
  const t = useT();
  const lang = useLang();
  const [main] = names(d, lang);
  const sum = fmtNum(d.losSum[track], 1);
  const idx = fmtNum(d.index, 0);
  const pct = d.index != null ? Math.max(0, Math.min(100, d.index)) : 0;
  return (
    <li>
      <button type="button" className="drow" aria-current={selected || undefined} onClick={onPick}>
        <span className="rank mono">{rank ?? ''}</span>
        <span className="dname">
          <span className="dmain">{main}</span>
          <span className="dsub">{sum ? <>{t('row.cum', { track })} <span className="mono">{sum}</span> {t('unit.mm')}</> : t('row.noLos')}</span>
          {idx && <span className="bar"><span style={{ width: `${pct}%` }} /></span>}
        </span>
        <span className="didx">{idx ? <span className="mono">{idx}</span> : <NoData />}</span>
      </button>
    </li>
  );
}

export function DistrictList({ districts, track, selected, onPick, waterAvailable }: {
  districts: District[]; track: string; selected: string | null; onPick: (c: string) => void; waterAvailable: boolean;
}) {
  const t = useT();
  const [all, setAll] = useState(false);
  const ranked = districts.filter((d) => d.index != null).sort((a, b) => (b.index ?? 0) - (a.index ?? 0));
  const none = districts.filter((d) => d.index == null);
  const shown = all ? ranked : ranked.slice(0, 10);
  const total = districts.length;
  return (
    <>
      <p className="panel-sub">{t('districts.sub')}{waterAvailable ? '' : ` · ${t('index.noWater')}`}</p>
      <ul className="dlist">
        {shown.map((d, i) => <Row key={d.dcode} d={d} rank={i + 1} track={track} selected={d.dcode === selected} onPick={() => onPick(d.dcode)} />)}
        {all && none.length > 0 && <li className="divider" role="separator"><span>{t('nodata')}</span></li>}
        {all && none.map((d) => <Row key={d.dcode} d={d} rank={null} track={track} selected={d.dcode === selected} onPick={() => onPick(d.dcode)} />)}
      </ul>
      {total > 10 && (
        <button type="button" className="btn wide" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? t('showTop') : t('showAll', { n: total })}
        </button>
      )}
    </>
  );
}
