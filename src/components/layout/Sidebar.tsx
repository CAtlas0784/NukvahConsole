import { NavLink } from 'react-router';
import { motion } from 'motion/react';
import { Bookmark, Compass, Globe2, LayoutDashboard, Package, ScrollText, Search, Settings, SlidersHorizontal, Swords, Users } from 'lucide-react';
import { useT, type TKey } from '@/i18n';
import { ease } from '@/lib/motion';
import { NukvahSigil } from '@/components/fx/NukvahSigil';

const NAV: { section: TKey; items: { to: string; key: TKey; icon: typeof Search }[] }[] = [
  {
    section: 'nav.sectionCore',
    items: [
      { to: '/', key: 'nav.dashboard', icon: LayoutDashboard },
      { to: '/search', key: 'nav.search', icon: Search },
    ],
  },
  {
    section: 'nav.sectionDominion',
    items: [
      { to: '/characters', key: 'nav.characters', icon: Users },
      { to: '/builder', key: 'nav.builder', icon: SlidersHorizontal },
      { to: '/inventory', key: 'nav.inventory', icon: Package },
      { to: '/armory', key: 'nav.armory', icon: Swords },
      { to: '/world', key: 'nav.world', icon: Globe2 },
    ],
  },
  {
    section: 'nav.sectionArchive',
    items: [
      { to: '/commands', key: 'nav.commands', icon: ScrollText },
      { to: '/presets', key: 'nav.presets', icon: Bookmark },
      { to: '/settings', key: 'nav.settings', icon: Settings },
    ],
  },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const t = useT();
  return (
    <nav aria-label="Primary" className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-6 pt-7 pb-8">
        <div className="relative -my-3 -ml-3 h-16 w-16 shrink-0">
          <NukvahSigil size={64} body={false} />
        </div>
        <div>
          <div className="font-display text-lg tracking-[0.34em] text-gilded">NUKVAH</div>
          <div className="text-[10px] tracking-[0.2em] text-dim uppercase">{t('brand.tagline')}</div>
        </div>
      </div>

      <div className="relative flex-1 overflow-y-auto px-4 pb-6">
        {/* The Irminsul line: a vertical data-trunk connecting every node. */}
        <div className="pointer-events-none absolute top-2 bottom-8 left-[33px] w-px bg-gradient-to-b from-gold/0 via-gold/25 to-gold/0" aria-hidden />
        {NAV.map((group) => (
          <div key={group.section} className="mb-6">
            <div className="mb-2 pl-12 text-[10px] font-semibold tracking-[0.28em] text-dim uppercase">{t(group.section)}</div>
            <ul className="space-y-0.5">
              {group.items.map(({ to, key, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === '/'}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 rounded-xl py-2.5 pr-3 pl-3 text-sm transition-colors ${isActive ? 'text-ivory' : 'text-mist hover:text-ivory'}`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <motion.span
                            layoutId="nav-active"
                            className="absolute inset-0 rounded-xl border border-gold/25 bg-gradient-to-r from-gold/[0.12] to-transparent"
                            transition={{ duration: 0.4, ease }}
                          />
                        )}
                        <span className="relative z-10 grid h-5 w-5 place-items-center">
                          <span
                            className={`h-2.5 w-2.5 rotate-45 rounded-[2px] border transition-all duration-300 ${
                              isActive ? 'border-cyan bg-cyan shadow-[0_0_12px_#7ef0ff]' : 'border-gold/40 bg-night group-hover:border-gold'
                            }`}
                          />
                        </span>
                        <Icon size={16} className={`relative z-10 ${isActive ? 'text-gold' : 'opacity-70'}`} />
                        <span className="relative z-10 font-medium">{t(key)}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 px-6 pb-6 text-[10px] tracking-[0.16em] text-dim uppercase">
        <Compass size={12} /> SnezhnayaCore · 7.2
      </div>
    </nav>
  );
}
