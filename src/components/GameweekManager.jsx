import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { calculatePlayerPoints, calculatePickTotal } from '@/lib/scoring';
import { Button } from '@/components/ui/button';
import { Lock, Unlock, Check, Plus, Star } from 'lucide-react';

export default function GameweekManager() {
  const [gameweeks, setGameweeks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newGw, setNewGw] = useState('');
  const [newDeadline, setNewDeadline] = useState('');
  const [finalizing, setFinalizing] = useState(null);

  const load = async () => {
    const gws = await base44.entities.Gameweek.list('number', 50);
    setGameweeks(gws.sort((a, b) => b.number - a.number));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const createGw = async () => {
    const num = parseInt(newGw);
    if (!num) return;
    await base44.entities.Gameweek.create({
      number: num,
      deadline: newDeadline ? new Date(newDeadline).toISOString() : null,
    });
    setNewGw('');
    setNewDeadline('');
    load();
  };

  const updateGw = async (gw, data) => {
    await base44.entities.Gameweek.update(gw.id, data);
    load();
  };

  const setActive = async (gw) => {
    const active = gameweeks.filter(g => g.is_active);
    for (const g of active) {
      await base44.entities.Gameweek.update(g.id, { is_active: false });
    }
    await base44.entities.Gameweek.update(gw.id, { is_active: !gw.is_active });
    load();
  };

  const finalizeGw = async (gw) => {
    setFinalizing(gw.id);
    try {
      const [picks, stats, configs] = await Promise.all([
        base44.entities.Pick.filter({ gameweek: gw.number }),
        base44.entities.PlayerStat.filter({ gameweek: gw.number }),
        base44.entities.ScoringConfig.filter({ is_active: true }),
      ]);
      const config = configs[0];
      const updates = picks.map(pick => {
        const points = (pick.player_ids || []).map(pid => {
          const stat = stats.find(s => s.player_id === pid);
          return calculatePlayerPoints(stat, config);
        });
        const { total, isBust, score } = calculatePickTotal(points, config);
        return { id: pick.id, total_points: total, is_bust: isBust, score };
      });
      if (updates.length > 0) {
        await base44.entities.Pick.bulkUpdate(updates);
      }
      await base44.entities.Gameweek.update(gw.id, { is_finalized: true, is_locked: true });
      load();
    } catch (err) {
      console.error(err);
    } finally {
      setFinalizing(null);
    }
  };

  if (loading) return <div className="text-center text-muted-foreground py-8">Loading...</div>;

  return (
    <div>
      <div className="bg-card rounded-xl p-4 mb-4">
        <h3 className="font-medium mb-3">Create Gameweek</h3>
        <div className="flex gap-2 mb-2">
          <input
            type="number" value={newGw}
            onChange={(e) => setNewGw(e.target.value)}
            placeholder="GW #"
            className="w-20 bg-accent rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="datetime-local" value={newDeadline}
            onChange={(e) => setNewDeadline(e.target.value)}
            className="flex-1 bg-accent rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <Button onClick={createGw} disabled={!newGw} size="sm" className="w-full">
          <Plus size={16} /> Create
        </Button>
      </div>

      <div className="space-y-2">
        {gameweeks.map(gw => (
          <div key={gw.id} className="bg-card rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                {gw.is_active && <Star size={16} className="text-primary fill-primary" />}
                <span className="font-medium">Gameweek {gw.number}</span>
              </div>
              {gw.is_finalized ? (
                <span className="text-xs text-primary flex items-center gap-1"><Check size={12} /> Final</span>
              ) : gw.is_locked ? (
                <span className="text-xs text-muted-foreground flex items-center gap-1"><Lock size={12} /> Locked</span>
              ) : (
                <span className="text-xs text-muted-foreground">Open</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mb-3">
              {gw.deadline ? `Deadline: ${new Date(gw.deadline).toLocaleString()}` : 'No deadline set'}
            </div>
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={() => setActive(gw)}
                className={`text-xs py-1.5 rounded-lg ${gw.is_active ? 'bg-primary text-primary-foreground' : 'bg-accent text-muted-foreground'}`}
              >
                {gw.is_active ? 'Active' : 'Set Active'}
              </button>
              <button
                onClick={() => updateGw(gw, { is_locked: !gw.is_locked })}
                className="text-xs py-1.5 rounded-lg bg-accent text-muted-foreground"
              >
                {gw.is_locked ? <><Lock size={12} className="inline mr-1" />Unlock</> : <><Unlock size={12} className="inline mr-1" />Lock</>}
              </button>
              {!gw.is_finalized ? (
                <button
                  onClick={() => finalizeGw(gw)}
                  disabled={finalizing === gw.id}
                  className="text-xs py-1.5 rounded-lg bg-primary/20 text-primary col-span-2"
                >
                  {finalizing === gw.id ? 'Finalizing...' : 'Finalize Scoring'}
                </button>
              ) : (
                <button
                  onClick={() => updateGw(gw, { is_finalized: false, is_locked: false })}
                  className="text-xs py-1.5 rounded-lg bg-destructive/20 text-destructive col-span-2"
                >
                  Unfinalize
                </button>
              )}
            </div>
          </div>
        ))}
        {gameweeks.length === 0 && (
          <p className="text-center text-muted-foreground py-8">No gameweeks yet</p>
        )}
      </div>
    </div>
  );
}