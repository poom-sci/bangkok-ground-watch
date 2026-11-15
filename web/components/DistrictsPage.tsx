'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fmtNum, parseTrack, type Dataset, type District } from '@/lib/data';
import { NoData, useLang, useT } from './ui';
import type { Key } from '@/lib/i18n';

type SortKey = 'rank' | 'index' | 'name' | 'losA' | 'losD' | 'water' | 'usable' | 'density';
interface Row { d: District; name: string; rank: number | null; index: number | null; losA: number | null; losD: number | null; water: number | null; usable: number | null; density: number | null }

const val = (r: Row, k: SortKey): number | string | null => (k === 'rank' ? r.rank : k === 'index' ? r.index : k === 'name' ? r.name : k === 'losA' ? r.losA : k === 'losD' ? r.losD : k === 'water' ? r.water : k === 'usable' ? r.usable : r.density);

export default function DistrictsPage({ data, tracks, selected, onOpen, onClose, profile, showClose }: {
  data: Dataset; tracks: string[]; selected: string | null; onOpen: (code: string) => void; onClose: () => void; profile: ReactNode; showClose: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'index', dir: 'desc' });
  const colRef = useRef<HTMLDivElement>(null);
  const lastOpened = useRef<string | null>(null);
  const asc = tracks.find((k) => parseTrack(k)?.dir === 'A') ?? null;
  const desc = tracks.find((k) => parseTrack(k)?.dir === 'D') ?? null;
  const trackName = (k: string | null) => { const p = k ? parseTrack(k) : null; return p ? t(p.dir === 'A' ? 'track.A' : 'track.D', { n: p.n }) : ''; };

  const rows = useMemo<Row[]>(() => {
    const ranked = data.districts.filter((d) => d.index != null).sort((a, b) => (b.index ?? 0) - (a.index ?? 0)).map((d) => d.dcode);
    return data.districts.map((d) => {
      const waters = d.water.flatMap((w) => (w.pct != null ? [w.pct] : []));
      const coh = d.los.flatMap((x) => (x.coherent != null ? [x.coherent] : []));
      const r = ranked.indexOf(d.dcode);
      return {
        d, name: lang === 'en' ? d.nameEn : d.nameTh, rank: r >= 0 ? r + 1 : null, index: d.index,
        losA: asc ? d.losSum[asc] ?? null : null, losD: desc ? d.losSum[desc] ?? null : null,
        water: waters.length ? Math.max(...waters) : d.waterMaxPct, usable: coh.length ? Math.round(coh.reduce((a, b) => a + b, 0) / coh.length) : null, density: d.popDensity,
      };
    });
  }, [data.districts, lang, asc, desc]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const f = needle ? rows.filter((r) => r.d.nameEn.toLowerCase().includes(needle) || r.d.nameTh.toLowerCase().includes(needle)) : rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...f].sort((a, b) => {
      const x = val(a, sort.key), y = val(b, sort.key);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      if (typeof x === 'string' && typeof y === 'string') return dir * x.localeCompare(y, lang === 'th' ? 'th' : 'en');
      return dir * ((x as number) - (y as number));
    });
  }, [rows, q, sort, lang]);
  const withIdx = shown.filter((r) => r.index != null);
  const withoutIdx = shown.filter((r) => r.index == null);

  useEffect(() => {
    if (selected) { lastOpened.current = selected; requestAnimationFrame(() => colRef.current?.querySelector<HTMLElement>('h2')?.focus()); }
    else if (lastOpened.current) { const c = lastOpened.current; lastOpened.current = null; requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-open="${c}"]`)?.focus()); }
  }, [selected]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && selected && !e.defaultPrevented && !document.querySelector('dialog[open]')) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, onClose]);

  if (!data.districtsOk) {
    return (
      <div className="state-error" role="alert">
        <p>{t('err.d')}</p>
        <button type="button" className="btn" onClick={() => window.location.reload()}>{t('retry')}</button>
      </div>
    );
  }

  const cols: { key: SortKey; label: string; num: boolean; cls: string }[] = [
    { key: 'rank', label: t('th.rank'), num: true, cls: '' },
    { key: 'name', label: t('th.district'), num: false, cls: '' },
    { key: 'index', label: t('th.index'), num: true, cls: 'idx' },
    ...(asc ? [{ key: 'losA' as SortKey, label: t('th.los', { track: trackName(asc) }), num: true, cls: 'c-wide' }] : []),
    ...(desc ? [{ key: 'losD' as SortKey, label: t('th.los', { track: trackName(desc) }), num: true, cls: 'c-wide' }] : []),
    { key: 'water', label: t('th.water'), num: true, cls: '' },
    { key: 'usable', label: t('th.usableMean'), num: true, cls: '' },
    { key: 'density', label: t('th.density'), num: true, cls: 'c-wide' },
  ];
  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' || key === 'rank' ? 'asc' : 'desc' }));
  const pct = (v: number | null) => (v == null ? <NoData /> : <><span className="mono">{fmtNum(v, 0)}</span>%</>);
  const num = (v: number | null, d = 1) => (v == null ? <NoData /> : <span className="mono">{fmtNum(v, d)}</span>);
  const sortOptions: { value: string; label: string }[] = [
    { value: 'index:desc', label: t('th.index') }, { value: 'name:asc', label: t('th.district') }, { value: 'water:desc', label: t('th.water') }, { value: 'usable:desc', label: t('th.usable') }, { value: 'density:desc', label: t('th.density') },
  ];

  const body = (list: Row[], offset: number) => list.map((r, i) => (
    <tr key={r.d.dcode} className={selected === r.d.dcode ? 'sel' : undefined} onClick={() => onOpen(r.d.dcode)}>
      <td className="mono r">{r.rank ?? ''}</td>
      <td><button type="button" className="cell-btn" data-open={r.d.dcode} title={lang === 'en' ? r.d.nameTh : r.d.nameEn} aria-pressed={selected === r.d.dcode} onClick={(e) => { e.stopPropagation(); onOpen(r.d.dcode); }}>{r.name}</button></td>
      <td className="r">{num(r.index, 1)}</td>
      {asc && <td className="r c-wide">{num(r.losA)}</td>}
      {desc && <td className="r c-wide">{num(r.losD)}</td>}
      <td className="r">{pct(r.water)}</td>
      <td className="r">{pct(r.usable)}</td>
      <td className="r c-wide">{num(r.density, 0)}</td>
      <td className="sr">{offset + i}</td>
    </tr>
  ));

  return (
    <div className={`dpage${selected ? ' has-profile' : ''}`}>
      <div className="dmain-col">
        <div className="toolbar-row">
          <label className="search">
            <span className="sr">{t('search')}</span>
            <input type="search" value={q} placeholder={t('search')} onChange={(e) => setQ(e.target.value)} />
          </label>
          <p className="count" aria-live="polite">{t('count', { n: shown.length, total: rows.length })}</p>
          <label className="sortsel">
            <span className="field-label">{t('sort')}</span>
            <select value={`${sort.key}:${sort.dir}`} onChange={(e) => { const [key, dir] = e.target.value.split(':'); setSort({ key: key as SortKey, dir: dir as 'asc' | 'desc' }); }}>
              {sortOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>
        <p className="comp-sub index-note">{t('d.indexNote')}</p>
        {shown.length === 0 ? <p className="comp-sub">{t('none.q', { q })}</p> : (
          <>
            <div className="table-wrap">
              <table className="dtable">
                <thead>
                  <tr>
                    {cols.map((c, i) => (
                      <th key={`${c.key}${i}`} scope="col" className={`${c.num ? 'r' : ''} ${c.cls}`} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button type="button" className="th-btn" onClick={() => toggle(c.key)}>{c.label}<span aria-hidden="true">{sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</span></button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body(withIdx, 0)}
                  {withoutIdx.length > 0 && <tr className="divider-row"><th colSpan={cols.length} scope="rowgroup">{t('nodivider')}</th></tr>}
                  {body(withoutIdx, withIdx.length)}
                </tbody>
              </table>
            </div>
            <ul className="dcards">
              {shown.map((r) => (
                <li key={r.d.dcode}>
                  <button type="button" className="drow" onClick={() => onOpen(r.d.dcode)}>
                    <span className="rank mono">{r.rank ?? ''}</span>
                    <span className="dname"><span className="dmain">{r.name}</span><span className="dsub">{asc && r.losA != null ? `LOS ${fmtNum(r.losA, 1)} ${t('unit.mm')}` : t('row.noLos')} · {r.water != null ? `${fmtNum(r.water, 0)}%` : t('nodata')}</span></span>
                    <span className="didx">{r.index != null ? <span className="mono">{fmtNum(r.index, 1)}</span> : <NoData />}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {selected && <div className="dock-col profile-col" ref={colRef}>{showClose && <div className="dock-head"><button type="button" className="btn" onClick={onClose}>{t('about.close')}</button></div>}<div className="dock-body">{profile}</div></div>}
    </div>
  );
}

export type { Key };
