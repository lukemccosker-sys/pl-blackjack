import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { usePoolAuth } from '@/lib/PoolAuth';
import { calculatePlayerPoints, calculatePickTotal, isDeadlinePassed, isGameweekFinished } from '@/lib/scoring';
import PlayerSearch from '@/components/PlayerSearch';
import PickSummary from '@/components/PickSummary';
import ClubBadge from '@/components/ClubBadge';
import { Lock, Clock } from 'lucide-react';

export default function Picks() {
  const { member } = usePoolAuth();
  const [gameweek, setGameweek] = useState(null);
  const [scoringConfig, setScoringConfig] = useState(null);
  const [players, setPlayers] = useState([]);
  const [existingPick, setExistingPick] = useState(null);
  const [playerStats, setPlayerStats] = useState([]);
  const [fixtures, setFixtures] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [gws, configs, allPlayers] = await Promise.all([
        base44.entities.Gameweek.list('number', 50),
        base44.entities.ScoringConfig.filter({ is_active: true }),
        base44.entities.Player.list('', 600),
      ]);
      const sorted = gws.sort((a, b) => a.number - b.number);
      const active = sorted.find(g => g.is_active) || sorted[sorted.length - 1];
      setGameweek(active);
      setScoringConfig(configs[0] || null);
      setPlayers(allPlayers);
      if (active && member) {
        const [picks, stats, gwFixtures] = await Promise.all([
          base44.entities.Pick.filter({ member_id: member.id, gameweek: active.number }),
          base44.entities.PlayerStat.filter({ gameweek: active.number }),
          base44.entities.Fixture.filter({ gameweek: active.number }),
        ]);
        if (picks.length > 0) {
          setExistingPick(picks[0]);
          setSelectedIds(picks[0].player_ids || []);
        }
        setPlayerStats(stats);
        setFixtures(gwFixtures);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const locked = isDeadlinePassed(gameweek);
  const gwFinished = isGameweekFinished(fixtures, gameweek.number);

  const handleToggle = (player) => {
    if (locked) return;
    setSelectedIds(prev => {
      if (prev.includes(player.id)) return prev.filter(id => id !== player.id);
      if (prev.length >= 5) return prev;
      return [...prev, player.id];
    });
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const pickData = {
        member_id: member.id, member_name: member.name,
        gameweek: gameweek.number, player_ids: selectedIds,
      };
      if (existingPick) {
        await base44.entities.Pick.update(existingPick.id, pickData);
      } else {
        const created = await base44.entities.Pick.create(pickData);
        setExistingPick(created);
      }
      setSaved(true);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-center text-muted-foreground">Loading...</div>;
  if (!gameweek) return <div className="p-6 text-center text-muted-foreground">No active gameweek yet. Ask your admin to set one up.</div>;

  const selectedPlayers = selectedIds.map(id => players.find(p => p.id === id)).filter(Boolean);
  const playerPoints = selectedPlayers.map(p => {
    const stat = playerStats.find(s => s.player_id === p.id);
    return calculatePlayerPoints(stat, scoringConfig);
  });
  const { total, isBust } = calculatePickTotal(playerPoints, scoringConfig);

  return (
    <div className="p-4 pb-48">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Gameweek {gameweek.number}</h1>
        {locked ? (
          <p className="text-destructive flex items-center gap-1 mt-1 text-sm">
            <Lock size={14} /> Picks locked
          </p>
        ) : (
          <p className="text-muted-foreground flex items-center gap-1 mt-1 text-sm">
            <Clock size={14} /> {gameweek.deadline ? `Deadline: ${new Date(gameweek.deadline).toLocaleString()}` : 'No deadline set'}
          </p>
        )}
      </div>

      {!locked && (
        <PlayerSearch players={players} selectedIds={selectedIds} onToggle={handleToggle} />
      )}

      {locked && (
        <div className="space-y-2 mb-4">
          {selectedPlayers.map((p, i) => {
            const stat = playerStats.find(s => s.player_id === p.id);
            const pts = calculatePlayerPoints(stat, scoringConfig);
            return (
              <div key={p.id} className="bg-card rounded-xl p-3 flex items-center gap-3">
                <ClubBadge code={p.club_code} name={p.club} size={36} />
                <div className="flex-1">
                  <p className="font-medium text-sm">{p.web_name}</p>
                  <p className="text-xs text-muted-foreground">{p.position} · {p.club_short}</p>
                  {stat && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {stat.goals}G · {stat.assists}A · {stat.clean_sheets}CS · {stat.minutes}min
                      {stat.yellow_cards > 0 && ` · ${stat.yellow_cards}Y`}
                      {stat.red_cards > 0 && ` · ${stat.red_cards}R`}
                    </p>
                  )}
                </div>
                {gwFinished && (
                  <span className={`text-2xl font-bold ${pts > 0 ? 'text-primary' : 'text-muted-foreground'}`}>{pts}</span>
                )}
              </div>
            );
          })}
          {selectedPlayers.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No picks saved for this gameweek</p>
          )}
        </div>
      )}

      <PickSummary
        selectedPlayers={selectedPlayers}
        playerPoints={playerPoints}
        total={total}
        isBust={isBust}
        threshold={scoringConfig?.bust_threshold || 21}
        onSave={handleSave}
        onRemove={handleToggle}
        saving={saving}
        saved={saved}
        isLocked={locked}
        hasFive={selectedIds.length === 5}
        isFinalized={gwFinished}
      />
    </div>
  );
}