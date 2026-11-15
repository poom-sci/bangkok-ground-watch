'use client';

import { useEffect, useState } from 'react';
import { LangProvider, Segmented, useT } from './ui';
import Workspace from './Workspace';
import { useDataset } from '@/lib/data';
import type { Lang } from '@/lib/i18n';

function Empty({ failed }: { failed: boolean }) {
  const t = useT();
  return (
    <div className="empty glass">
      <h2>{t(failed ? 'data.unavailable' : 'empty.title')}</h2>
      <p>{t(failed ? 'data.unavailable.body' : 'empty.body')}</p>
    </div>
  );
}

export default function Viewer() {
  const [lang, setLang] = useState<Lang>('en');
  const state = useDataset();

  useEffect(() => {
    try { const v = localStorage.getItem('bgw-lang'); if (v === 'en' || v === 'th') setLang(v); } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const change = (l: Lang) => { setLang(l); try { localStorage.setItem('bgw-lang', l); } catch { /* storage unavailable */ } };

  return (
    <LangProvider value={lang}>
      {state.status === 'loading' ? <LoadingShell /> : state.data.layers.length === 0 ? <EmptyShell lang={lang} onLang={change} failed={state.data.failed} /> : <Workspace data={state.data} lang={lang} onLang={change} />}
    </LangProvider>
  );
}

function LoadingShell() {
  const t = useT();
  return <main className="app"><div className="chip glass solo"><h1>{t('title')}</h1><p className="subtitle">{t('loading')}</p></div></main>;
}

function EmptyShell({ lang, onLang, failed }: { lang: Lang; onLang: (l: Lang) => void; failed: boolean }) {
  const t = useT();
  return (
    <main className="app">
      <div className="topbar">
        <header className="chip glass"><h1>{t('title')}</h1><p className="subtitle">{t('subtitle')}</p></header>
        <div className="toolbar">
          <Segmented label={t('lang.label')} value={lang} onChange={onLang} options={[{ value: 'en', label: 'EN' }, { value: 'th', label: 'TH' }]} />
        </div>
      </div>
      <Empty failed={failed} />
    </main>
  );
}
