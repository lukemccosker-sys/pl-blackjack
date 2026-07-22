import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { RefreshCw, Check, AlertCircle, Trash2 } from 'lucide-react';

export default function SyncPanel({ member }) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [gameweeks, setGameweeks] = useState([]);
  const [resetGw, setResetGw] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState(null);

  useEffect(() => {
    (async () => {
      const gws = await base44.entities.Gameweek.list('number', 50);
      const sorted = gws.sort((a, b) => b.number - a.number);
      setGameweeks(sorted);
      if (sorted.length > 0) setResetGw(String(sorted[0].number));
    })();
  }, []);

  const handleReset = async () => {
    setResetting(true);
    setResetResult(null);
    try {
      await base44.entities.PlayerStat.deleteMany({ gameweek: Number(resetGw) });
      setResetResult({ gameweek: resetGw, success: true });
    } catch (err) {
      setResetResult({ gameweek: resetGw, error: err.message || 'Reset failed' });
    } finally {
      setResetting(false);
    }
  };

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

      <div className="pt-4 border-t border-border">
        <h3 className="text-sm font-semibold mb-2">Reset Gameweek Stats</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Delete all PlayerStat rows for a specific gameweek. Use this if stat data gets corrupted or mixed across seasons.
        </p>
        <div className="flex gap-2">
          <select
            value={resetGw}
            onChange={(e) => setResetGw(e.target.value)}
            disabled={resetting || gameweeks.length === 0}
            className="flex-1 bg-accent rounded-lg px-3 py-2 text-sm"
          >
            {gameweeks.length === 0 && <option value="">No gameweeks</option>}
            {gameweeks.map(gw => (
              <option key={gw.id} value={gw.number}>Gameweek {gw.number}</option>
            ))}
          </select>
          <Button onClick={handleReset} disabled={resetting || !resetGw} variant="destructive">
            <Trash2 size={16} />
            {resetting ? 'Deleting...' : 'Reset'}
          </Button>
        </div>
        {resetResult && (
          <div className={`mt-2 text-sm flex items-center gap-1 ${resetResult.error ? 'text-destructive' : 'text-primary'}`}>
            {resetResult.error ? (
              <><AlertCircle size={14} /> {resetResult.error}</>
            ) : (
              <><Check size={14} /> Deleted all stats for GW {resetResult.gameweek}</>
            )}
          </div>
        )}
      </div>
    </div>
  );
}