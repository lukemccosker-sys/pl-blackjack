import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { usePoolAuth } from '@/lib/PoolAuth';
import { calculatePlayerPoints, calculatePickTotal, isDeadlinePassed } from '@/lib/scoring';
import ClubBadge from '@/components/ClubBadge';
import MemberAvatar from '@/components/MemberAvatar';
import { Lock } from 'lucide-react';

export default function Home() {
  const { member } = usePoolAuth();
  const [gameweek, setGameweek] = useState(null);
  const [myPick, setMyPick] = useState(null);
  const [allPicks, setAllPicks] = useState([]);
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
    setAllPicks(gwPicks);
    setPlayerStats(gwStats);
    setMyPick(gwPicks.find(p => p.member_id === member?.id) || null);
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (!gameweek) return;
    const gwNumber = gameweek.number;
    let timer = null;

    const unsubPicks = base44.entities.Pick.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(() => reloadGwData(gwNumber), 500);
    });
    const unsubStats = base44.entities.PlayerStat.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(() => reloadGwData(gwNumber), 500);
    });
    const pollInterval = setInterval(() => reloadGwData(gwNumber), 5 * 60 * 1000);

    return () => {
      unsubPicks();
      unsubStats();
      clearInterval(pollInterval);
      clearTimeout(timer);
    };
  }, [gameweek]);

  if (loading) return <div className="p-6 text-center text-muted-foreground">Loading...</div>;
  if (!gameweek) return <div className="p-6 text-center text-muted-foreground">No active gameweek yet.</div>;

  const locked = isDeadlinePassed(gameweek);
  const threshold = scoringConfig?.bust_threshold || 21;

  const myPlayerIds = myPick?.player_ids || [];
  const myPlayerData = myPlayerIds.map(id => {
    const player = players.find(p => p.id === id);
    if (!player) return null;
    const stat = playerStats.find(s => s.player_id === id);
    return { player, stat, points: calculatePlayerPoints(stat, scoringConfig) };
  }).filter(Boolean);
  const myResult = calculatePickTotal(myPlayerData.map(d => d.points), scoringConfig);

  const leaderboard = allPicks.map(pick => {
    const pts = (pick.player_ids || []).map(pid => {
      const stat = playerStats.find(s => s.player_id === pid);
      return calculatePlayerPoints(stat, scoringConfig);
    });
    return { pick, ...calculatePickTotal(pts, scoringConfig) };
  }).sort((a, b) => b.score - a.score).slice(0, 5);

  const medalColors = ['text-yellow-400', 'text-gray-300', 'text-orange-400'];

  return (
    <div className="p-4 pb-20">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Home</h1>
        <p className="text-sm text-muted-foreground">Gameweek {gameweek.number}</p>
      </div>

      {/* My Picks */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">My Picks</h2>

        {!myPick && !locked ? (
          <Link to="/picks" className="block bg-primary text-primary-foreground rounded-xl p-4 text-center font-medium">
            Make your picks
          </Link>
        ) : myPlayerData.length > 0 ? (
          <>
            {/* Score Card */}
            <div className={`rounded-xl p-4 mb-3 ${myResult.isBust ? 'bg-destructive/10 ring-2 ring-destructive' : myResult.tier === 'blackjack' ? 'bg-primary/10 ring-1 ring-primary/30' : 'bg-card'}`}>
              {myResult.isBust ? (
                <div className="text-center">
                  <p className="text-destructive font-black text-3xl tracking-widest">BUST!</p>
                  <p className="text-sm text-destructive/80 mt-1">{myResult.total} — {myResult.total - threshold} over</p>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    {myResult.tier === 'blackjack' && (
                      <span className="text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">BLACKJACK!</span>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">Your total</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-3xl font-bold ${myResult.isBust ? 'text-destructive' : 'text-primary'}`}>{myResult.score}</p>
                    <p className="text-xs text-muted-foreground">/ {threshold}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Player List */}
            <div className="space-y-1.5">
              {myPlayerData.map(({ player: p, stat, points: pts }) => (
                <div key={p.id} className="flex items-center gap-3 bg-card rounded-xl p-2.5">
                  <ClubBadge code={p.club_code} name={p.club} size={28} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.web_name}</p>
                    <p className="text-xs text-muted-foreground">{p.position} · {p.club_short}</p>
                    {stat && (
                      <p className="text-xs text-muted-foreground">
                        {stat.goals}G · {stat.assists}A · {stat.clean_sheets}CS · {stat.minutes}min
                        {stat.yellow_cards > 0 && ` · ${stat.yellow_cards}Y`}
                        {stat.red_cards > 0 && ` · ${stat.red_cards}R`}
                      </p>
                    )}
                  </div>
                  <span className={`text-lg font-bold w-8 text-right ${pts > 0 ? 'text-primary' : pts < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {pts > 0 ? '+' : ''}{pts}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-center text-muted-foreground py-4 bg-card rounded-xl text-sm">No picks for this gameweek</p>
        )}
      </div>

      {/* Compact Leaderboard */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Leaderboard</h2>

        {!locked ? (
          <div className="bg-card rounded-xl p-6 text-center">
            <Lock className="text-muted-foreground mx-auto mb-2" size={24} />
            <p className="text-sm text-muted-foreground">Leaderboard live once picks lock</p>
          </div>
        ) : leaderboard.length === 0 ? (
          <p className="text-center text-muted-foreground py-4 bg-card rounded-xl text-sm">No picks yet</p>
        ) : (
          <div className="space-y-1.5">
            {leaderboard.map((entry, i) => (
              <div key={entry.pick.id} className={`flex items-center gap-3 p-2.5 rounded-xl ${i === 0 ? 'bg-primary/10 ring-1 ring-primary/30' : 'bg-card'}`}>
                <span className={`w-5 text-center font-bold text-sm ${medalColors[i] || 'text-muted-foreground'}`}>{i + 1}</span>
                <MemberAvatar member={members.find(m => m.id === entry.pick.member_id)} size={28} />
                <p className="flex-1 text-sm font-medium truncate">{entry.pick.member_name}</p>
                <span className={`text-lg font-bold ${entry.isBust ? 'text-destructive' : 'text-primary'}`}>{entry.score}</span>
              </div>
            ))}
            <Link to="/leaderboard" className="block text-center text-xs text-primary font-medium py-2">See full leaderboard →</Link>
          </div>
        )}
      </div>
    </div>
  );
}