'use client';

import { useState } from 'react';
import { useLang, useT } from './ui';
import { fmtDate, fmtNum } from '@/lib/data';
import type { Key } from '@/lib/i18n';
import type { SavedSite } from '@/lib/user';

const BookmarkIcon = () => (
  <svg className="empty-icon" viewBox="0 0 32 32" aria-hidden="true"><path d="M9 4h14v24l-7-6-7 6z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
);

function Row({ s, onPick, onRemove }: { s: SavedSite; onPick: (s: SavedSite) => void; onRemove: (s: SavedSite) => void }) {
  const t = useT();
  const lang = useLang();
  const date = fmtDate(s.savedAt.slice(0, 10), lang);
  return (
    <li className="srow">
      <button type="button" className="srow-main" onClick={() => onPick(s)}>
        <span className="srow-text">
          <span className="dmain">{s.areaName || t('nodata')}</span>
          <span className="dsub">{date ? t('my.saved', { date }) : ''}</span>
        </span>
        <span className="srow-score mono">{fmtNum(s.score, 0) ?? t('nodata')}</span>
        {s.urban ? <span className="grade small none">{t('rated.pill')}</span> : s.grade && <span className={`grade small ${s.grade}`}>{t(`grade.${s.grade}` as Key)}</span>}
      </button>
      <button type="button" className="btn icon-btn" aria-label={`${t('my.remove')}: ${s.areaName}`} title={t('my.remove')} onClick={() => onRemove(s)}>
        <svg className="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.500h10 M6.500 4.500V3h3v1.500 M4.500 4.500l.6 8.500h5.800l.6-8.500" fill="none" stroke="currentColor" strokeWidth="1.600" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
    </li>
  );
}

export default function MySites({ sites, guest, limit, onPick, onRemove, onAdd }: {
  sites: SavedSite[]; guest: boolean; limit?: number; onPick: (s: SavedSite) => void; onRemove: (s: SavedSite) => void; onAdd: () => void;
}) {
  const t = useT();
  const [all, setAll] = useState(false);
  if (guest && sites.length === 0) return (
    <div className="my-empty"><BookmarkIcon /><p>{t('my.guest')}</p><button type="button" className="btn" onClick={onAdd}>{t('user.add')}</button></div>
  );
  if (sites.length === 0) return (
    <div className="my-empty"><BookmarkIcon /><p className="my-empty-t">{t('my.empty')}</p><p className="comp-sub">{t('my.empty.sub')}</p></div>
  );
  const shown = limit && !all ? sites.slice(0, limit) : sites;
  return (
    <div>
      <ul className="arealist">{shown.map((s) => <Row key={s.id} s={s} onPick={onPick} onRemove={onRemove} />)}</ul>
      {limit && sites.length > limit && (
        <button type="button" className="btn wide" aria-expanded={all} onClick={() => setAll((v) => !v)}>{all ? t('my.top') : t('my.all', { n: sites.length })}</button>
      )}
    </div>
  );
}
