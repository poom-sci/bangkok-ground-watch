'use client';

import type { ReactNode } from 'react';
import { LogoTile } from './Brand';
import { IconDistricts, IconGround, IconOverview, IconShortlist, IconSite } from './Icons';
import { useT } from './ui';
import type { Lang } from '@/lib/i18n';
import { routeSearch, type Tab } from '@/lib/route';
import { sitingEnabled } from '@/lib/siting';

const ICONS: Record<Tab, () => ReactNode> = { overview: IconOverview, site: IconSite, ground: IconGround, districts: IconDistricts, shortlist: IconShortlist };

export function tabsAvailable(): Tab[] {
  return sitingEnabled ? ['overview', 'site', 'ground', 'districts', 'shortlist'] : ['overview', 'ground', 'districts'];
}

export function useTabLabel() {
  const t = useT();
  return (tab: Tab) => t(tab === 'overview' ? 'nav.overview' : tab === 'site' ? 'mode.site' : tab === 'ground' ? 'mode.ground' : tab === 'districts' ? 'nav.districts' : 'nav.shortlist');
}

function NavLinks({ tab, onNav, bar }: { tab: Tab; onNav: (t: Tab) => void; bar?: boolean }) {
  const label = useTabLabel();
  const t = useT();
  return (
    <nav className={bar ? 'tabbar' : 'sidenav'} aria-label={t(bar ? 'tab.bar' : 'nav.main')}>
      <ul>
        {tabsAvailable().map((k) => {
          const Icon = ICONS[k];
          const active = tab === k;
          return (
            <li key={k}>
              <a className="nav-item" href={routeSearch({ tab: k, d: null, lat: null, lng: null, area: null, about: false, focus: null, layer: null })} aria-current={active ? 'page' : undefined} title={label(k)} aria-label={label(k)}
                onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); onNav(k); }}>
                <Icon /><span className="nav-label">{label(k)}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default function Shell({ tab, onNav, title, descriptor, badge, lang, onLang, userMenu, onAbout, children }: {
  tab: Tab; onNav: (t: Tab) => void; title: string; descriptor: string; badge: ReactNode; lang: Lang; onLang: (l: Lang) => void; userMenu: ReactNode; onAbout: () => void; children: ReactNode;
}) {
  const t = useT();
  const toggle = () => onLang(lang === 'en' ? 'th' : 'en');
  return (
    <div className="shell">
      <a className="skip" href="#main">{t('skip')}</a>
      <aside className="sidebar">
        <a className="brand" href={routeSearch({ tab: 'overview', d: null, lat: null, lng: null, area: null, about: false, focus: null, layer: null })} onClick={(e) => { e.preventDefault(); onNav('overview'); }}>
          <LogoTile size={32} />
          <span className="brand-text"><span className="brand-name2">{t('title')}</span><span className="brand-by">by SOLSAT</span></span>
        </a>
        <NavLinks tab={tab} onNav={onNav} />
        <div className="side-foot">
          <button type="button" className="side-btn" onClick={onAbout}><span className="nav-label">{t('about.open')}</span><span className="rail-i" aria-hidden="true">i</span></button>
          <button type="button" className="side-btn lang-btn" onClick={toggle} aria-label={`${t('lang.toggle')}: ${lang === 'en' ? 'TH' : 'EN'}`}>
            <span className="lang-seg" aria-hidden="true"><b className={lang === 'en' ? 'on' : ''}>EN</b><b className={lang === 'th' ? 'on' : ''}>TH</b></span>
          </button>
          <div className="side-user">{userMenu}</div>
        </div>
      </aside>
      <div className="content">
        <header className="topbar2">
          <div className="top-titles">
            <h1>{title}</h1>
            <p className="top-desc">{descriptor}</p>
          </div>
          <div className="top-right">
            {badge}
            <div className="top-phone">
              <button type="button" className="btn lang-mini" onClick={toggle} aria-label={`${t('lang.toggle')}: ${lang === 'en' ? 'TH' : 'EN'}`}>{lang.toUpperCase()}</button>
              <div className="phone-user">{userMenu}</div>
            </div>
          </div>
        </header>
        <main id="main" className="page" tabIndex={-1}>{badge && <div className="badge-row">{badge}</div>}{children}</main>
      </div>
      <NavLinks tab={tab} onNav={onNav} bar />
    </div>
  );
}
