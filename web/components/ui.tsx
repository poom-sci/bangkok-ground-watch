'use client';

import { createContext, useContext } from 'react';
import { translate, type Key, type Lang } from '@/lib/i18n';

const LangContext = createContext<Lang>('en');
export const LangProvider = LangContext.Provider;
export const useLang = () => useContext(LangContext);

export function useT() {
  const lang = useLang();
  return (key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars);
}

export const Check = () => (
  <svg className="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const Warn = () => (
  <svg className="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2l6.5 11.5h-13z M8 6.5v3.2 M8 11.6v.1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const Chevron = ({ open }: { open: boolean }) => (
  <svg className={`icon chev${open ? ' open' : ''}`} viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export interface SegOption<V extends string> { value: V; label: string; disabled?: boolean; tag?: string }

export function Segmented<V extends string>({ label, options, value, onChange, disabled }: {
  label: string; options: SegOption<V>[]; value: V; onChange: (v: V) => void; disabled?: boolean;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => {
        const off = disabled || o.disabled;
        return (
          <button key={o.value} type="button" className="seg-btn" aria-pressed={value === o.value} disabled={off} aria-disabled={off || undefined}
            onClick={() => onChange(o.value)}>
            {value === o.value && !off && <Check />}
            <span>{o.label}</span>
            {o.tag && <span className="tag">{o.tag}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Pending() {
  const t = useT();
  return <span className="pending" title={t('pending.tip')}>{t('pending')}<span className="sr">{`: ${t('pending.tip')}`}</span></span>;
}

export function NoData({ text }: { text?: string }) {
  const t = useT();
  return <span className="nodata">{text ?? t('nodata')}</span>;
}

export function Badge({ nisar }: { nisar: boolean }) {
  const t = useT();
  return (
    <span className={`badge ${nisar ? 'ok' : 'demo'}`}>
      {nisar ? <Check /> : <Warn />}
      {t(nisar ? 'badge.nisar' : 'badge.demo')}
    </span>
  );
}
