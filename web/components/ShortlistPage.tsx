'use client';

import { fmtDate, fmtNum } from '@/lib/data';
import type { Key } from '@/lib/i18n';
import type { SavedSite } from '@/lib/user';
import { areaLabel } from '@/lib/siting';
import { useLang, useT } from './ui';
import MySites from './MySites';

export default function ShortlistPage({ sites, guest, onOpen, onRemove, onAdd, onSite }: {
  sites: SavedSite[]; guest: boolean; onOpen: (s: SavedSite) => void; onRemove: (s: SavedSite) => void; onAdd: () => void; onSite: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const sorted = [...sites].sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
  if (sorted.length === 0) {
    return (
      <div className="empty-panel">
        <MySites sites={[]} guest={guest} onPick={onOpen} onRemove={onRemove} onAdd={onAdd} />
        <button type="button" className="btn primary" onClick={onSite}>{t('land.open')}</button>
      </div>
    );
  }
  return (
    <>
      {guest && <p className="comp-sub guest-note">{t('sl.guestNote')}</p>}
      <div className="table-wrap">
        <table className="dtable stable">
          <thead>
            <tr>
              <th scope="col">{t('th.score')}</th><th scope="col">{t('th.area')}</th><th scope="col">{t('th.site')}</th><th scope="col">{t('th.saved')}</th><th scope="col"><span className="sr">{t('th.actions')}</span></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.id}>
                <td><span className="mono sc">{fmtNum(s.score, 0)}</span> {s.urban ? <span className="grade small none">{t('rated.pill')}</span> : s.grade && <span className={`grade small ${s.grade}`}>{t(`grade.${s.grade}` as Key)}</span>}</td>
                <td>{s.areaId ? areaLabel(s.areaId, s.areaName, lang) : s.areaName || t('nodata')}</td>
                <td className="mono">{fmtNum(s.lat, 4)}, {fmtNum(s.lng, 4)}</td>
                <td>{fmtDate(s.savedAt.slice(0, 10), lang) ?? t('nodata')}</td>
                <td className="act">
                  <button type="button" className="btn" onClick={() => onOpen(s)}>{t('open')}</button>
                  <button type="button" className="btn" onClick={() => onRemove(s)} aria-label={`${t('my.remove')}: ${s.areaName}`}>{t('my.remove')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="dcards"><MySites sites={sorted} guest={false} onPick={onOpen} onRemove={onRemove} onAdd={onAdd} /></div>
    </>
  );
}
