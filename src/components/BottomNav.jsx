import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Home as HomeIcon, Hand, Trophy, Goal } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { isDeadlinePassed } from '@/lib/scoring';

export default function BottomNav() {
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const checkLive = async () => {
      try {
        const gws = await base44.entities.Gameweek.list('number', 50);
        const sorted = gws.sort((a, b) => a.number - b.number);
        const active = sorted.find(g => g.is_active) || sorted[sorted.length - 1];
        if (!cancelled) {
          setIsLive(!!active && isDeadlinePassed(active) && !active.is_finalized);
        }
      } catch (err) {
        console.error(err);
      }
    };

    checkLive();
    const unsub = base44.entities.Gameweek.subscribe(checkLive);
    const interval = setInterval(checkLive, 60 * 1000);

    return () => {
      cancelled = true;
      unsub();
      clearInterval(interval);
    };
  }, []);

  // Four tabs, fixed for everyone. Fixtures and Stats live together under
  // Football, and Admin sits behind the profile avatar with Settings — it's
  // occasional configuration, and having it come and go made the bar shift
  // depending on who was logged in.
  const links = [
    { to: '/', label: 'Home', icon: HomeIcon, live: isLive },
    { to: '/picks', label: 'Picks', icon: Hand },
    { to: '/leaderboard', label: 'Standings', icon: Trophy },
    { to: '/football', label: 'Football', icon: Goal },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-30 pb-safe">
      <div className="max-w-lg mx-auto flex items-stretch h-16">
        {links.map(({ to, label, icon: Icon, live }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 flex-1 min-h-[56px] transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`
            }
          >
            <span className="relative inline-flex">
              <Icon size={20} className={live ? 'nav-live-icon' : ''} />
              {live && <span className="nav-live-dot" />}
            </span>
            <span className="text-[11px] font-medium">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
