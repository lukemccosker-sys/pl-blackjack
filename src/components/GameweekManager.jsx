import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { calculatePlayerPoints, calculatePickTotal, isDeadlinePassed } from '@/lib/scoring';
import { Lock, Check, Star } from 'lucide-react';

export default function GameweekManager() {
  const [gameweeks, setGameweeks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(null);

  const load = async () => {
    const gws = await base44.entities.Gameweek.list('number', 50);
    setGameweeks(gws.sort((a, b) => b.number - a.number));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateGw = async (gw, data) => {
    await base44.entities.Gameweek.update(gw.id, data);
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
        const pickStats = (pick.player_ids || []).map(pid => stats.find(s => s.player_id === pid));
        const points = pickStats.map(stat => calculatePlayerPoints(stat, config));
        const { total, isBust, score, tier, isNatural } = calculatePickTotal(points, config, pickStats);
        return { id: pick.id, total_points: total, is_bust: isBust, score, tier, is_natural: isNatural };
      });
      if (updates.length > 0) {
        await base44.entities.Pick.bulkUpdate(updates);
      }
      await base44.entities.Gameweek.update(gw.id, { is_finalized: true });
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
      <p className="text-sm text-muted-foreground mb-4">
        Gameweeks are created and updated automatically when you sync. Lock status is derived from the FPL deadline — no manual toggle needed.
      </p>
      <div className="space-y-2">
        {gameweeks.map(gw => (
          <div key={gw.id} className="bg-card rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                {gw.is_active && <Star size={16} className="text-primary fill-primary" />}
                <span className="font-medium">Gameweek {gw.number}</span>
              </div>
              {gw.is_finalized ? (
                <span className="text-xs flex items-center gap-1 bg-primary text-white px-2 py-0.5 rounded-full"><Check size={12} /> Final</span>
              ) : isDeadlinePassed(gw) ? (
                <span className="text-xs text-muted-foreground flex items-center gap-1"><Lock size={12} /> Locked</span>
              ) : (
                <span className="text-xs text-muted-foreground">Open</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mb-3">
              {gw.deadline ? `Deadline: ${new Date(gw.deadline).toLocaleString()}` : 'No deadline set'}
            </div>
            {!gw.is_finalized ? (
              <button
                onClick={() => finalizeGw(gw)}
                disabled={finalizing === gw.id}
                className="w-full text-xs py-1.5 rounded-lg bg-primary/20 text-primary"
              >
                {finalizing === gw.id ? 'Finalizing...' : 'Finalize'}
              </button>
            ) : (
              <button
                onClick={() => updateGw(gw, { is_finalized: false })}
                className="w-full text-xs py-1.5 rounded-lg bg-destructive/20 text-destructive"
              >
                Unfinalize
              </button>
            )}
          </div>
        ))}
        {gameweeks.length === 0 && (
          <p className="text-center text-muted-foreground py-8">No gameweeks yet. Run a sync to populate.</p>
        )}
      </div>
    </div>
  );
}