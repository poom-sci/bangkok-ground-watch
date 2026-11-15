'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Segmented, Warn, useT } from './ui';
import { cleanName, validateName, type ModeId, type NameError, type Profile } from '@/lib/user';
import type { Key, Lang } from '@/lib/i18n';

const ERR_KEYS: Record<NameError, Key> = { empty: 'name.empty', short: 'name.short', long: 'name.long', chars: 'name.chars' };

const InfoIcon = () => (
  <svg className="icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M8 7.2v4 M8 4.7v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
);
const RadarIcon = () => (
  <svg className="card-icon" viewBox="0 0 32 32" aria-hidden="true"><path d="M5 22a11 11 0 0 1 22 0 M9 22a7 7 0 0 1 14 0 M13 22a3 3 0 0 1 6 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><circle cx="16" cy="25" r="2" fill="currentColor" /></svg>
);
const SiteIcon = () => (
  <svg className="card-icon" viewBox="0 0 32 32" aria-hidden="true"><path d="M13 3c-4.4 0-8 3.4-8 7.6C5 16 13 24 13 24s8-8 8-13.4C21 6.400 17.400 3 13 3z" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="13" cy="10.500" r="2.600" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M24 20c-2 2.600-3 4.100-3 5.600a3 3 0 0 0 6 0c0-1.500-1-3-3-5.600z" fill="currentColor" /></svg>
);

export function HonestLine() {
  const t = useT();
  return <p className="honest"><InfoIcon /><span>{t('honest')}</span></p>;
}

export function NameForm({ onName, onGuest, autoFocus }: { onName: (name: string) => void; onGuest: () => void; autoFocus: boolean }) {
  const t = useT();
  const [value, setValue] = useState('');
  const [err, setErr] = useState<NameError | null>(null);
  const [shown, setShown] = useState(false);
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const er = validateName(value);
    setErr(er); setShown(er != null);
    if (!er) onName(cleanName(value));
  };
  return (
    <form onSubmit={submit} noValidate className="name-form">
      <label htmlFor={`${id}-n`} className="name-label">{t('name.label')}</label>
      <input ref={ref} id={`${id}-n`} className={`name-input${shown && err ? ' invalid' : ''}`} type="text" value={value} placeholder={t('name.ph')} autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={60}
        aria-invalid={shown && err ? true : undefined} aria-describedby={`${id}-h${shown && err ? ` ${id}-e` : ''}`}
        onChange={(e) => { setValue(e.target.value); if (shown) setErr(validateName(e.target.value)); }} />
      {shown && err && <p id={`${id}-e`} className="field-err" role="alert"><Warn />{t(ERR_KEYS[err])}</p>}
      <p id={`${id}-h`} className="comp-sub">{t('name.help')}</p>
      <button type="submit" className="btn primary wide">{t('continue')}</button>
      <button type="button" className="btn wide" onClick={onGuest}>{t('guest')}</button>
      <HonestLine />
    </form>
  );
}

export default function Gate({ step, lang, onLang, profile, hello, siteEnabled, groundLine, siteLine, onName, onGuest, onDismiss, onChoose, onNotYou, leaving }: {
  step: 'A' | 'B'; lang: Lang; onLang: (l: Lang) => void; profile: Profile; hello: boolean; siteEnabled: boolean; groundLine: string; siteLine: string;
  onName: (name: string) => void; onGuest: () => void; onDismiss: () => void; onChoose: (m: ModeId) => void; onNotYou: () => void; leaving: boolean;
}) {
  const t = useT();
  const card = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const signedIn = profile.key != null;
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 768px)').matches;
    if (step === 'B') card.current?.querySelector<HTMLElement>('[data-first]')?.focus();
    else if (!wide) card.current?.focus();
  }, [step]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && step === 'A') { e.preventDefault(); onDismiss(); return; }
    if (e.key !== 'Tab' || !card.current) return;
    const f = [...card.current.querySelectorAll<HTMLElement>('button, input, [href]')].filter((x) => !x.hasAttribute('disabled'));
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === card.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  const last = profile.mode && (profile.mode === 'ground' || siteEnabled) ? profile.mode : null;
  const cards: { id: ModeId; icon: React.ReactNode; title: string; line: string }[] = [
    { id: 'ground', icon: <RadarIcon />, title: t('mode.ground'), line: groundLine },
    ...(siteEnabled ? [{ id: 'site' as ModeId, icon: <SiteIcon />, title: t('mode.site'), line: siteLine }] : []),
  ];
  const first = cards.find((c) => c.id === last) ?? cards[0];
  const heading = step === 'A' ? t('title') : signedIn ? t(hello ? 'hello' : 'welcome', { name: profile.name }) : t('start.guest');
  return (
    <div className={`gate${leaving ? ' leaving' : ''}`} onKeyDown={onKey} onClick={(e) => { if (step === 'A' && e.target === e.currentTarget) onDismiss(); }}>
      <div ref={card} className={`gate-card step-${step}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="gate-head">
          <h2 id={titleId}>{heading}</h2>
          <Segmented label={t('lang.label')} value={lang} onChange={onLang} options={[{ value: 'en', label: 'EN' }, { value: 'th', label: 'TH' }]} />
        </div>
        {step === 'A' ? (
          <>
            <p className="gate-lead">{t('gate.lead')}</p>
            <NameForm onName={onName} onGuest={onGuest} autoFocus={typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches} />
          </>
        ) : (
          <>
            <div className="mode-cards">
              {cards.map((c) => (
                <button key={c.id} type="button" className="mode-card" data-first={c.id === first.id ? '' : undefined} onClick={() => onChoose(c.id)}>
                  {c.icon}
                  <span className="mode-card-title">{c.title}{last === c.id && <span className="tag">{t('lastUsed')}</span>}</span>
                  <span className="mode-card-line">{c.id === 'ground' ? t('start.ground') : t('start.site')}</span>
                  <span className="mode-card-data mono">{c.line}</span>
                </button>
              ))}
            </div>
            <p className="gate-foot">
              {signedIn ? <button type="button" className="link-btn" onClick={onNotYou}>{t('notYou')}</button>
                : <>{t('playingGuest')}<button type="button" className="link-btn" onClick={onNotYou}>{t('user.add')}</button></>}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export function NameDialog({ open, title, onName, onClose }: { open: boolean; title: string; onName: (name: string) => void; onClose: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="about name-dialog" aria-labelledby={id} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      {open && (
        <div className="about-in">
          <div className="about-head">
            <h2 id={id}>{title}</h2>
            <button type="button" className="btn" onClick={onClose}>{t('about.close')}</button>
          </div>
          <NameForm onName={onName} onGuest={onClose} autoFocus />
        </div>
      )}
    </dialog>
  );
}
