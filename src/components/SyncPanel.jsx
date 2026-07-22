import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { RefreshCw, Users, Calendar, BarChart3, Check, AlertCircle } from 'lucide-react';

export default function SyncPanel({ member }) {
  const [syncing, setSyncing] = useState(null);
  const [results, setResults] = useState({});
  const [syncGw, setSyncGw] = useState('');

  const handleSync = async (action, gameweek) => {
    setSyncing(action);
    try {
      const resp = await base44.functions.invoke('syncFplData', {
        action,
        gameweek: gameweek ? Number(gameweek) : undefined,
        member_id: member.id,
      });
      setResults(prev => ({ ...prev, [action]: resp.data }));
    } catch (err) {
      setResults(prev => ({ ...prev, [action]: { error: err.message } }));
    } finally {
      setSyncing(null);
    }
  };

  const cards = [
    { action: 'players', icon: Users, title: 'Sync Players', desc: 'Fetch all Premier League players from the FPL API' },
    { action: 'fixtures', icon: Calendar, title: 'Sync Fixtures', desc: 'Fetch all match fixtures with kickoff times and scores' },
    { action: 'stats', icon: BarChart3, title: 'Sync Stats', desc: 'Fetch player stats for a specific gameweek', needsGw: true },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground mb-2">
        Pull live data from the Fantasy Premier League API. Sync players and fixtures first, then stats after matches are played.
      </p>
      {cards.map(c => {
        const Icon = c.icon;
        const result = results[c.action];
        return (
          <div key={c.action} className="bg-card rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon size={18} className="text-primary" />
              <h3 className="font-medium">{c.title}</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-3">{c.desc}</p>
            {c.needsGw && (
              <input
                type="number" value={syncGw}
                onChange={(e) => setSyncGw(e.target.value)}
                placeholder="GW #"
                className="w-24 bg-accent rounded-lg px-3 py-2 text-sm mb-3 mr-2"
              />
            )}
            <Button
              onClick={() => handleSync(c.action, c.needsGw ? syncGw : null)}
              disabled={syncing !== null || (c.needsGw && !syncGw)}
              size="sm" variant="outline"
            >
              <RefreshCw size={14} className={syncing === c.action ? 'animate-spin' : ''} />
              {syncing === c.action ? 'Syncing...' : 'Sync Now'}
            </Button>
            {result && (
              <div className={`mt-2 text-sm ${result.error ? 'text-destructive' : 'text-primary'}`}>
                {result.error ? (
                  <span className="flex items-center gap-1"><AlertCircle size={14} /> {result.error}</span>
                ) : (
                  <span className="flex items-center gap-1"><Check size={14} /> {result.created || 0} created, {result.updated || 0} updated</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}