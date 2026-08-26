import React from 'react';
import { usePoolAuth } from '@/lib/PoolAuth';
import GameweekManager from '@/components/GameweekManager';
import StatEditor from '@/components/StatEditor';
import ScoringEditor from '@/components/ScoringEditor';
import SyncPanel from '@/components/SyncPanel';
import { useUrlState } from '@/lib/useUrlState';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function Admin() {
  const { member } = usePoolAuth();
  const [tab, setTab] = useUrlState('tab', ['gameweeks', 'stats', 'scoring', 'sync'], 'gameweeks');

  if (!member?.is_admin) {
    return <div className="p-6 text-center text-muted-foreground">Admin access required</div>;
  }

  const tabs = [
    { key: 'gameweeks', label: 'Gameweeks' },
    { key: 'stats', label: 'Stats' },
    { key: 'scoring', label: 'Scoring' },
    { key: 'sync', label: 'Sync' },
  ];

  return (
    <div className="p-4 pb-20">
      <div className="flex items-center gap-3 mb-4 pr-12">
        <Link
          to="/settings"
          aria-label="Back to settings"
          className="-ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold font-heading truncate">Admin Panel</h1>
      </div>
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 min-h-[44px] rounded-lg text-sm font-medium whitespace-nowrap ${
              tab === t.key ? 'bg-primary text-primary-foreground' : 'bg-accent text-muted-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'gameweeks' && <GameweekManager />}
      {tab === 'stats' && <StatEditor />}
      {tab === 'scoring' && <ScoringEditor />}
      {tab === 'sync' && <SyncPanel member={member} />}
    </div>
  );
}