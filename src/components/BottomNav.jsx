import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home as HomeIcon, Hand, Calendar, Trophy, Settings, Radio, BarChart3 } from 'lucide-react';
import { usePoolAuth } from '@/lib/PoolAuth';

export default function BottomNav() {
  const { member } = usePoolAuth();

  const links = [
    { to: '/', label: 'Home', icon: HomeIcon },
    { to: '/stats', label: 'Stats', icon: BarChart3 },
    { to: '/picks', label: 'Picks', icon: Hand },
    { to: '/live', label: 'Live', icon: Radio },
    { to: '/fixtures', label: 'Fixtures', icon: Calendar },
    { to: '/leaderboard', label: 'Standings', icon: Trophy },
  ];

  if (member?.is_admin) {
    links.push({ to: '/admin', label: 'Admin', icon: Settings });
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-30">
      <div className="max-w-lg mx-auto flex justify-around items-center h-16">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 px-4 py-2 transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`
            }
          >
            <Icon size={20} />
            <span className="text-[10px] font-medium">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}