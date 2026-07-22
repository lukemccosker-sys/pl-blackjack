import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { RefreshCw, Check, AlertCircle } from 'lucide-react';

export default function SyncPanel({ member }) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleSync = async () => {
    setSyncing(true);
    setResult(null);
    setError(null);
    try {
      const resp = await base44.functions.invoke('syncFplData', { member_id: member.id });
      setResult(resp.data);
    } catch (err) {
      setError(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Pulls live data from the Fantasy Premier League API: players, gameweeks, fixtures, and stats for finished gameweeks. Run regularly (e.g. daily) to keep everything current.
      </p>
      <Button onClick={handleSync} disabled={syncing} className="w-full">
        <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
        {syncing ? 'Syncing...' : 'Sync Now'}
      </Button>
      {result && (
        <div className="bg-card rounded-xl p-4 space-y-2 text-sm">
          <p className="text-primary flex items-center gap-1 font-medium">
            <Check size={14} /> Sync complete
          </p>
          <div className="space-y-1 text-muted-foreground">
            <p>Players: {result.bootstrap?.playersCreated || 0} new, {result.bootstrap?.playersUpdated || 0} updated, {result.bootstrap?.playersDeleted || 0} removed</p>
            <p>Gameweeks: {result.bootstrap?.gwsCreated || 0} new, {result.bootstrap?.gwsUpdated || 0} updated</p>
            <p>Fixtures: {result.fixtures?.created || 0} new, {result.fixtures?.updated || 0} updated, {result.fixtures?.fixturesDeleted || 0} removed</p>
            {result.gameweeksFinalized?.length > 0 && (
              <p className="text-primary">Finalized: GW {result.gameweeksFinalized.map(g => g.gameweek).join(', ')}</p>
            )}
          </div>
        </div>
      )}
      {error && (
        <div className="bg-card rounded-xl p-4 text-sm text-destructive flex items-center gap-1">
          <AlertCircle size={14} /> {error}
        </div>
      )}
    </div>
  );
}