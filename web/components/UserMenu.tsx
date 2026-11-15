'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Chevron, useT } from './ui';
import { HonestLine } from './Gate';
import { SolsatMark } from './Brand';
import { clip, type Profile } from '@/lib/user';

const PersonIcon = () => (
  <svg className="icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="5.500" r="3" fill="none" stroke="currentColor" strokeWidth="1.600" /><path d="M2.500 14c.5-3 2.800-4.500 5.500-4.500s5 1.500 5.500 4.500" fill="none" stroke="currentColor" strokeWidth="1.600" strokeLinecap="round" /></svg>
);

export default function UserMenu({ profile, canMySites, onMySites, onSwitch, onSignOut, onAdd, onAbout }: {
  profile: Profile; canMySites: boolean; onMySites: () => void; onSwitch: () => void; onSignOut: () => void; onAdd: () => void; onAbout: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  const signedIn = profile.key != null;

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault(); e.stopPropagation();
      setOpen(false); btn.current?.focus();
    };
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', key, true);
    document.addEventListener('mousedown', away);
    box.current?.querySelector<HTMLElement>('button')?.focus();
    return () => { document.removeEventListener('keydown', key, true); document.removeEventListener('mousedown', away); };
  }, [open]);

  const pick = (fn: () => void) => () => { btn.current?.focus(); setOpen(false); fn(); };
  return (
    <div className="usermenu">
      <button ref={btn} type="button" className="btn user-chip" aria-expanded={open} aria-controls={id} aria-label={`${t('user.menu')}: ${signedIn ? profile.name : t('user.guest')}`} onClick={() => setOpen((v) => !v)}>
        <PersonIcon /><span className="user-name">{signedIn ? clip(profile.name, 12) : t('user.guest')}</span><Chevron open={open} />
      </button>
      {open && (
        <div ref={box} id={id} className="menu glass">
          <p className="menu-head">{signedIn ? profile.name : t('user.guest')}</p>
          {canMySites && <button type="button" className="menu-item" onClick={pick(onMySites)}>{t('my.title')}</button>}
          <button type="button" className="menu-item" onClick={pick(onSwitch)}>{t('user.switch')}</button>
          <button type="button" className="menu-item" onClick={pick(signedIn ? onSignOut : onAdd)}>{t(signedIn ? 'user.signout' : 'user.add')}</button>
          <a className="menu-item" href="/">{t('user.home')}</a>
          <button type="button" className="menu-item menu-about" onClick={pick(onAbout)}>{t('about.open')}</button>
          <HonestLine />
          <p className="menu-brand"><SolsatMark size={28} /></p>
        </div>
      )}
    </div>
  );
}

export function SignOutDialog({ open, name, onConfirm, onCancel }: { open: boolean; name: string; onConfirm: () => void; onCancel: () => void }) {
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
    <dialog ref={ref} className="about name-dialog" aria-labelledby={id} onClose={onCancel} onClick={(e) => { if (e.target === ref.current) onCancel(); }}>
      <div className="about-in">
        <h2 id={id} className="signout-q">{t('signout.q', { name: clip(name, 24) })}</h2>
        <div className="signout-actions">
          <button type="button" className="btn primary" onClick={onConfirm}>{t('user.signout')}</button>
          <button type="button" className="btn" onClick={onCancel}>{t('cancel')}</button>
        </div>
      </div>
    </dialog>
  );
}
