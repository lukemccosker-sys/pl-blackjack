import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Home as HomeIcon, Hand, Calendar, Trophy, Settings, BarChart3, Coins } from 'lucide-react';
import { usePoolAuth } from '@/lib/PoolAuth';
import { base44 } from '@/api/base44Client';
import { isDeadlinePassed } from '@/lib/scoring';

export default function BottomNav() {
  const { member } = usePoolAuth();
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

  const links = [
    { to: '/', label: 'Home', icon: HomeIcon, live: isLive },
    { to: '/stats', label: 'Stats', icon: BarChart3 },
    { to: '/picks', label: 'Picks', icon: Hand },
    { to: '/fixtures', label: 'Fixtures', icon: Calendar },
    { to: '/leaderboard', label: 'Standings', icon: Trophy },
    { to: '/pot', label: 'Pot', icon: Coins },
  ];

  if (member?.is_admin) {
    links.push({ to: '/admin', label: 'Admin', icon: Settings });
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-30">
      <div className="max-w-lg mx-auto flex justify-around items-center h-16">
        {links.map(({ to, label, icon: Icon, live }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 px-2 py-2 transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`
            }
          >
            <span className="relative inline-flex">
              <Icon size={20} className={live ? 'nav-live-icon' : ''} />
              {live && <span className="nav-live-dot" />}
            </span>
            <span className="text-[10px] font-medium">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
