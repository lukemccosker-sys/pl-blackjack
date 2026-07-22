import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { usePoolAuth } from '@/lib/PoolAuth';
import { calculatePlayerPoints, calculatePickTotal, isDeadlinePassed } from '@/lib/scoring';
import ClubBadge from '@/components/ClubBadge';
import MemberAvatar from '@/components/MemberAvatar';
import { Radio, Lock, AlertTriangle } from 'lucide-react';

export default function Live() {
  const { member } = usePoolAuth();
  const [gameweek, setGameweek] = useState(null);
  const [picks, setPicks] = useState([]);
  const [playerStats, setPlayerStats] = useState([]);
  const [players, setPlayers] = useState([]);
  const [members, setMembers] = useState([]);
  const [scoringConfig, setScoringConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const [gws, configs, allPlayers, allMembers] = await Promise.all([
        base44.entities.Gameweek.list('number', 50),
        base44.entities.ScoringConfig.filter({ is_active: true }),
        base44.entities.Player.list('', 600),
        base44.entities.PoolMember.list('', 50),
      ]);
      const sorted = gws.sort((a, b) => a.number - b.number);
      const active = sorted.find(g => g.is_active) || sorted[sorted.length - 1];
      setGameweek(active);
      setScoringConfig(configs[0]);
      setPlayers(allPlayers);
      setMembers(allMembers);
      if (active) {
        await reloadGwData(active.number);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const reloadGwData = async (gwNumber) => {
    const [gwPicks, gwStats] = await Promise.all([
      base44.entities.Pick.filter({ gameweek: gwNumber }),
      base44.entities.PlayerStat.filter({ gameweek: gwNumber }),
    ]);
    setPicks(gwPicks);
    setPlayerStats(gwStats);
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (!gameweek) return;
    const gwNumber = gameweek.number;

    let picksTimer = null;
    let statsTimer = null;

    const unsubPicks = base44.entities.Pick.subscribe(() => {
      clearTimeout(picksTimer);
      picksTimer = setTimeout(() => reloadGwData(gwNumber), 500);
    });

    const unsubStats = base44.entities.PlayerStat.subscribe(() => {
      clearTimeout(statsTimer);
      statsTimer = setTimeout(() => reloadGwData(gwNumber), 500);
    });

    const pollInterval = setInterval(() => {
      reloadGwData(gwNumber);
    }, 5 * 60 * 1000);

    return () => {
      unsubPicks();
      unsubStats();
      clearInterval(pollInterval);
      clearTimeout(picksTimer);
      clearTimeout(statsTimer);
    };
  }, [gameweek]);

  if (loading) return <div className="p-6 text-center text-muted-foreground">Loading...</div>;
  if (!gameweek) return <div className="p-6 text-center text-muted-foreground">No active gameweek.</div>;

  const locked = isDeadlinePassed(gameweek);
  const threshold = scoringConfig?.bust_threshold || 21;

  const picksWithScores = picks.map(pick => {
    const playerData = (pick.player_ids || []).map(pid => {
      const stat = playerStats.find(s => s.player_id === pid);
      return { stat, points: calculatePlayerPoints(stat, scoringConfig) };
    });
    const playerPoints = playerData.map(d => d.points);
    const result = calculatePickTotal(playerPoints, scoringConfig);
    return { ...pick, playerData, playerPoints, ...result };
  }).sort((a, b) => b.score - a.score);

  const medalColors = ['text-yellow-400', 'text-gray-300', 'text-orange-400'];

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Radio className="text-primary" size={20} />
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Live</h1>
          <p className="text-sm text-muted-foreground">Gameweek {gameweek.number}</p>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
          gameweek.is_finalized ? 'bg-primary/20 text-primary' : 'bg-accent text-muted-foreground'
        }`}>
          {gameweek.is_finalized ? 'Final' : 'Live'}
        </span>
      </div>

      {!locked ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Lock className="text-muted-foreground mb-4" size={48} />
          <p className="font-medium mb-1">Picks are hidden until the deadline</p>
          <p className="text-sm text-muted-foreground">
            {gameweek.deadline
              ? `Unlocks at ${new Date(gameweek.deadline).toLocaleString()}`
              : 'Waiting for admin to set a deadline'}
          </p>
        </div>
      ) : picksWithScores.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No picks for this gameweek</p>
      ) : (
        <div className="space-y-3">
          {picksWithScores.map((pick, i) => (
            <div
              key={pick.id}
              className={`relative rounded-xl overflow-hidden ${
                pick.isBust ? 'bg-destructive/10 ring-2 ring-destructive' :
                i === 0 ? 'bg-card ring-1 ring-primary/40' :
                pick.member_id === member?.id ? 'bg-card ring-1 ring-primary/20' : 'bg-card'
              }`}
            >
              {pick.isBust && (
                <div className="bg-destructive text-white text-center py-2 font-black text-2xl tracking-widest">
                  BUST!
                </div>
              )}
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-7 text-center font-bold ${medalColors[i] || 'text-muted-foreground'}`}>
                      {i + 1}
                    </span>
                    <MemberAvatar member={members.find(m => m.id === pick.member_id)} size={28} />
                    <span className="font-medium">
                      {pick.member_name}
                      {pick.member_id === member?.id && <span className="text-xs text-muted-foreground ml-1">(you)</span>}
                    </span>
                    {pick.tier === 'blackjack' && !pick.isBust && (
                      <span className="text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">BLACKJACK!</span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1">
                    {pick.isBust && <AlertTriangle className="text-destructive" size={16} />}
                    <span className={`text-2xl font-bold ${pick.isBust ? 'text-destructive' : 'text-primary'}`}>
                      {pick.score}
                    </span>
                    <span className="text-xs text-muted-foreground">/ {threshold}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {pick.player_ids?.map((pid, idx) => {
                    const player = players.find(p => p.id === pid);
                    if (!player) return null;
                    const { stat, points: pts } = pick.playerData[idx] || { stat: null, points: 0 };
                    return (
                      <div key={pid} className="flex items-center gap-2 bg-accent/40 rounded-lg p-1.5">
                        <ClubBadge code={player.club_code} name={player.club} size={28} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{player.web_name}</p>
                          <p className="text-xs text-muted-foreground">{player.position} · {player.club_short}</p>
                          {stat && (
                            <p className="text-xs text-muted-foreground">
                              {stat.goals}G · {stat.assists}A · {stat.clean_sheets}CS · {stat.minutes}min
                              {stat.yellow_cards > 0 && ` · ${stat.yellow_cards}Y`}
                              {stat.red_cards > 0 && ` · ${stat.red_cards}R`}
                            </p>
                          )}
                        </div>
                        <span className={`text-sm font-bold w-8 text-right ${pts > 0 ? 'text-primary' : pts < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {pts > 0 ? '+' : ''}{pts}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                  <span className="text-xs text-muted-foreground">Total</span>
                  <span className={`text-sm font-bold ${pick.isBust ? 'text-destructive' : 'text-primary'}`}>
                    {pick.total} {pick.isBust && `— ${pick.total - threshold} over`}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}