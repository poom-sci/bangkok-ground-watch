const base = { className: 'icon-20', viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const };

export const IconOverview = () => (<svg {...base}><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="11" y="3" width="6" height="6" rx="1" /><rect x="3" y="11" width="6" height="6" rx="1" /><rect x="11" y="11" width="6" height="6" rx="1" /></svg>);
export const IconSite = () => (<svg {...base}><path d="M10 18s6-5.2 6-9.5A6 6 0 0 0 4 8.500C4 12.800 10 18 10 18z" /><circle cx="10" cy="8.500" r="2.200" /></svg>);
export const IconGround = () => (<svg {...base}><path d="M3 14a7 7 0 0 1 14 0 M6 14a4 4 0 0 1 8 0" /><circle cx="10" cy="16" r="1" /></svg>);
export const IconDistricts = () => (<svg {...base}><path d="M4 5h12 M4 10h12 M4 15h12" /></svg>);
export const IconShortlist = () => (<svg {...base}><path d="M6 3h8v14l-4-3.200L6 17z" /></svg>);
export const IconUser = () => (<svg {...base}><circle cx="10" cy="7" r="3" /><path d="M4 17c.5-3.200 3-4.800 6-4.800s5.500 1.600 6 4.800" /></svg>);
