import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { fetchAllPlayers } from '../../base44/shared/playerQueries.js';
import { usePoolAuth } from '@/lib/PoolAuth';
import { calculatePlayerPoints, calculatePickTotal, isDeadlinePassed } from '@/lib/scoring';
import { findBlackjackTeam } from '@/lib/teamOfTheWeek';
import MemberAvatar from '@/components/MemberAvatar';
import CardHand from '@/components/CardHand';
import PotPanel from '@/components/PotPanel';
import { Lock, ChevronDown, Info, X, Sparkles, RefreshCw } from 'lucide-react';

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
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoTab, setInfoTab] = useState('rules');
  const [totwSkip, setTotwSkip] = useState(0);

  const toggleExpanded = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const loadData = async () => {
    try {
      const [gws, configs, allPlayers, allMembers] = await Promise.all([
        base44.entities.Gameweek.list('number', 50),
        base44.entities.ScoringConfig.filter({ is_active: true }),
        fetchAllPlayers(base44.entities),
        base44.entities.PoolMember.list('', 50),
      ]);
      const sorted = gws.sort((a, b) => a.number - b.number);
      const active = sorted.find(g => g.is_active) || sorted[sorted.length - 1];
      setGameweek(active);
      setScoringConfig(configs[0]);
      setPlayers(allPlayers);
      setMembers(allMembers);
      if (active) {
        await reloadGwData(active, allPlayers);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const reloadGwData = async (gw) => {
    const gwNumber = gw.number;
    const season = gw.season;
    const [gwPicks, gwStats] = await Promise.all([
      base44.entities.Pick.filter(season ? { gameweek: gwNumber, season } : { gameweek: gwNumber }),
      base44.entities.PlayerStat.filter(season ? { gameweek: gwNumber, season } : { gameweek: gwNumber }),
    ]);
    setAllPicks(gwPicks);
    setPlayerStats(gwStats);
    setMyPick(gwPicks.find(p => p.member_id === member?.id) || null);
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (!gameweek) return;
    let timer = null;

    const unsubPicks = base44.entities.Pick.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(() => reloadGwData(gameweek), 500);
    });
    const unsubStats = base44.entities.PlayerStat.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(() => reloadGwData(gameweek), 500);
    });
    const pollInterval = setInterval(() => reloadGwData(gameweek), 5 * 60 * 1000);

    return () => {
      unsubPicks();
      unsubStats();
      clearInterval(pollInterval);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameweek]);

  const locked = gameweek ? isDeadlinePassed(gameweek) : false;
  const threshold = scoringConfig?.bust_threshold || 21;

  const teamOfTheWeek = useMemo(() => {
    if (!locked || !scoringConfig || players.length === 0 || playerStats.length === 0) return null;
    return findBlackjackTeam(players, playerStats, scoringConfig, threshold, totwSkip);
  }, [locked, scoringConfig, players, playerStats, threshold, totwSkip]);

  if (loading) return <div className="p-6 text-center text-muted-foreground">Loading...</div>;
  if (!gameweek) return <div className="p-6 text-center text-muted-foreground">No active gameweek yet.</div>;

  const myPlayerIds = myPick?.player_ids || [];
  const myPlayerData = myPlayerIds.map(id => {
    const player = players.find(p => p.id === id);
    if (!player) return null;
    const stat = playerStats.find(s => s.player_id === id);
    return { player, stat, points: calculatePlayerPoints(stat, scoringConfig) };
  }).filter(Boolean);
  const myResult = calculatePickTotal(myPlayerData.map(d => d.points), scoringConfig, myPlayerData.map(d => d.stat));

  const picksWithScores = allPicks.map(pick => {
    const playerData = (pick.player_ids || []).map(pid => {
      const player = players.find(p => p.id === pid);
      const stat = playerStats.find(s => s.player_id === pid);
      return { player, stat, points: calculatePlayerPoints(stat, scoringConfig) };
    }).filter(d => d.player);
    const playerPoints = playerData.map(d => d.points);
    const result = calculatePickTotal(playerPoints, scoringConfig, playerData.map(d => d.stat));
    return { ...pick, playerData, ...result };
  }).sort((a, b) => b.score - a.score);

  const leaderboard = picksWithScores.slice(0, 5);

  const medalColors = ['text-yellow-400', 'text-gray-300', 'text-orange-400'];

  return (
    <div className="p-4 pb-20">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading">Home</h1>
          <p className="text-sm text-muted-foreground">Gameweek {gameweek.number}</p>
        </div>
        <button
          onClick={() => setInfoOpen(true)}
          className="p-2 rounded-full bg-card ring-1 ring-border text-foreground hover:bg-accent transition-colors shrink-0 mr-10"
          aria-label="Rules and scoring info"
        >
          <Info size={20} />
        </button>
      </div>

      {/* My Picks */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">My Picks</h2>

        {!myPick && !locked ? (
          <Link to="/picks" className="block bg-primary text-primary-foreground rounded-xl p-4 text-center font-medium">
            Make your picks
          </Link>
        ) : myPlayerData.length > 0 ? (
          <button onClick={() => toggleExpanded('mine')} className="w-full text-left">
            {/* Score header */}
            <div className="flex items-center justify-between bg-card rounded-xl p-3 mb-2">
              <p className="text-xs text-muted-foreground">Your total</p>
              <div className="flex items-center gap-1.5">
                <span className={`text-2xl font-bold font-display ${myResult.isBust ? 'text-destructive' : 'text-white'}`}>{myResult.score}</span>
                <span className="text-xs text-muted-foreground">/ {threshold}</span>
                <ChevronDown size={16} className={`text-muted-foreground transition-transform ${expandedIds.has('mine') ? 'rotate-180' : ''}`} />
              </div>
            </div>

            {/* Card hand */}
            <CardHand
              playerData={myPlayerData}
              isBust={expandedIds.has('mine') && myResult.isBust}
              isBlackjack={expandedIds.has('mine') && myResult.tier === 'blackjack'}
              isNatural={expandedIds.has('mine') && myResult.isNatural}
              threshold={threshold}
              showPoints={expandedIds.has('mine')}
              spread={expandedIds.has('mine')}
            />
            {!expandedIds.has('mine') && (
              <p className="text-center text-[10px] text-muted-foreground -mt-2">Tap for the breakdown</p>
            )}
          </button>
        ) : (
          <p className="text-center text-muted-foreground py-4 bg-card rounded-xl text-sm">No picks for this gameweek</p>
        )}
      </div>

      {/* Compact Leaderboard */}
      <div className="mb-6">
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
              <div key={entry.id} className={`flex items-center gap-3 p-2.5 rounded-xl ${i === 0 ? 'bg-primary/10 ring-1 ring-primary/30' : 'bg-card'}`}>
                <span className={`w-5 text-center font-bold text-sm ${medalColors[i] || 'text-muted-foreground'}`}>{i + 1}</span>
                <MemberAvatar member={members.find(m => m.id === entry.member_id)} size={28} />
                <p className="flex-1 min-w-0 text-sm font-medium truncate">{entry.member_name}</p>
                <span className={`text-lg font-bold ${entry.isBust ? 'text-destructive' : 'text-white'}`}>{entry.score}</span>
              </div>
            ))}
            <Link to="/leaderboard" className="block text-center text-xs text-white font-medium py-2">See full leaderboard →</Link>
          </div>
        )}
      </div>

      {/* Everyone's Picks, once locked */}
      {locked && picksWithScores.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Everyone's Picks</h2>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              gameweek.is_finalized ? 'bg-primary/20 text-white' : 'bg-accent text-muted-foreground'
            }`}>
              {gameweek.is_finalized ? 'Final' : 'Live'}
            </span>
          </div>
          <div className="space-y-3">
            {picksWithScores.map((pick, i) => {
              const isExpanded = expandedIds.has(pick.id);
              return (
                <button
                  key={pick.id}
                  onClick={() => toggleExpanded(pick.id)}
                  className={`w-full text-left rounded-xl p-3 ${
                    pick.isBust ? 'bg-destructive/10 ring-2 ring-destructive' :
                    i === 0 ? 'bg-card ring-1 ring-primary/40' :
                    pick.member_id === member?.id ? 'bg-card ring-1 ring-primary/20' : 'bg-card'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-5 text-center font-bold text-sm ${medalColors[i] || 'text-muted-foreground'}`}>{i + 1}</span>
                      <MemberAvatar member={members.find(m => m.id === pick.member_id)} size={26} />
                      <span className="font-medium text-sm">
                        {pick.member_name}
                        {pick.member_id === member?.id && <span className="text-xs text-muted-foreground ml-1">(you)</span>}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-lg font-bold ${pick.isBust ? 'text-destructive' : 'text-white'}`}>{pick.score}</span>
                      <ChevronDown size={16} className={`text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </div>
                  <CardHand
                    playerData={pick.playerData}
                    isBust={isExpanded && pick.isBust}
                    isBlackjack={isExpanded && pick.tier === 'blackjack' && !pick.isBust}
                    isNatural={isExpanded && pick.isNatural}
                    threshold={threshold}
                    showPoints={isExpanded}
                    spread={isExpanded}
                  />
                  {!isExpanded && (
                    <p className="text-center text-[10px] text-muted-foreground mt-2">Tap for the breakdown</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Team of the Week — a blackjack example */}
      {locked && teamOfTheWeek && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Sparkles size={12} /> Team of the Week
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTotwSkip(s => s + 1)}
                className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-accent text-muted-foreground hover:bg-primary/20 hover:text-white transition-colors"
                aria-label="Shuffle Team of the Week"
              >
                <RefreshCw size={12} /> Shuffle
              </button>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/20 text-white">Blackjack</span>
            </div>
          </div>
          <div className="rounded-xl bg-card ring-1 ring-primary/30 p-3">
            <p className="text-xs text-muted-foreground text-center mb-1">
              These {teamOfTheWeek.length} players would've hit {threshold} exactly
            </p>
            <CardHand
              playerData={teamOfTheWeek}
              isNatural={false}
              threshold={threshold}
              showPoints={true}
              spread={true}
            />
            <p className="text-center font-display font-black text-2xl blackjack-reveal mt-2">
              BLACKJACK
            </p>
          </div>
        </div>
      )}

      {/* The Pot */}
      <div className="mb-6">
        <PotPanel />
      </div>

      {infoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setInfoOpen(false)}>
          <div className="absolute inset-0 bg-black/80" />
          <div
            className="relative bg-background border border-border rounded-xl w-full max-w-md max-h-[85vh] overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading text-lg font-bold text-center flex-1">How PL Blackjack Works</h2>
              <button onClick={() => setInfoOpen(false)} className="text-muted-foreground hover:text-foreground p-1">
                <X size={18} />
              </button>
            </div>
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setInfoTab('rules')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${infoTab === 'rules' ? 'bg-primary text-primary-foreground' : 'bg-accent text-muted-foreground'}`}
              >
                Rules
              </button>
              <button
                onClick={() => setInfoTab('scoring')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${infoTab === 'scoring' ? 'bg-primary text-primary-foreground' : 'bg-accent text-muted-foreground'}`}
              >
                Scoring
              </button>
            </div>
            {infoTab === 'rules' ? (
              <div className="space-y-3">
                {[
                  { icon: '🎯', title: 'The Goal', text: `Pick 2–5 PL players each gameweek. Their combined stats aim to hit ${threshold} exactly — blackjack!` },
                  { icon: '♠️', title: 'Card Positions', text: 'GK ♠, DEF ♦, MID ♣, FWD ♥.' },
                  { icon: '🔒', title: 'Locking In', text: 'Picks lock at the gameweek deadline. After that, picks are revealed and scores update live.' },
                  { icon: '💥', title: 'Bust', text: `Go over ${threshold} and you bust — your gameweek score is 0.` },
                  { icon: '🃏', title: 'Blackjack', text: `Hit ${threshold} exactly for a Blackjack — that's +${scoringConfig?.blackjack_bonus || 10} bonus points on top of your score.` },
                  { icon: '✨', title: 'Natural 21', text: `If a GK you picked scores a goal, it's a "Natural 21" — automatic blackjack.` },
                  { icon: '💵', title: 'The Pot (Side Game)', text: 'The money pot is an optional side game — buy in, bet each week, and try to beat your mates to win the cash. Highest scorer takes the pot. Totally separate from the main competition.' },
                  { icon: '🏆', title: 'Overall Leaderboard', text: 'Separate from the pot, there\'s a season-long leaderboard tracking everyone\'s gameweek scores. Hit the Leaderboard tab to see where you stack across the whole season.' },
                ].map((r, i) => (
                  <div key={i} className="flex gap-3 bg-accent/40 rounded-lg p-3">
                    <span className="text-xl shrink-0">{r.icon}</span>
                    <div>
                      <p className="font-medium text-sm">{r.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{r.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg overflow-hidden border border-border">
                  {[
                    { label: 'Goals (GK)', val: scoringConfig?.points_per_goal_gk ?? 10 },
                    { label: 'Goals (DEF)', val: scoringConfig?.points_per_goal_def ?? 6 },
                    { label: 'Goals (MID)', val: scoringConfig?.points_per_goal_mid ?? 5 },
                    { label: 'Goals (FWD)', val: scoringConfig?.points_per_goal_fwd ?? 4 },
                    { label: 'Assists', val: scoringConfig?.points_per_assist ?? 2 },
                    { label: 'Clean Sheet (GK)', val: scoringConfig?.points_per_cleansheet_gk ?? 4 },
                    { label: 'Clean Sheet (DEF)', val: scoringConfig?.points_per_cleansheet_def ?? 4 },
                    { label: 'Clean Sheet (MID)', val: scoringConfig?.points_per_cleansheet_mid ?? 1 },
                    { label: 'Appearance', val: scoringConfig?.points_per_appearance ?? 1 },
                    { label: 'Yellow Card', val: scoringConfig?.points_per_yellow_card ?? 2 },
                    { label: 'Red Card', val: scoringConfig?.points_per_red_card ?? 5 },
                  ].map((row, i) => (
                    <div key={i} className={`flex items-center justify-between px-3 py-2 text-sm ${i % 2 === 0 ? 'bg-card' : 'bg-accent/30'}`}>
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className={`font-bold font-display ${row.val < 0 ? 'text-yellow-400' : 'text-white'}`}>{row.val > 0 ? '+' : ''}{row.val}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-primary/10 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Bust threshold</span>
                    <span className="font-bold font-display text-white">{threshold}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Blackjack bonus</span>
                    <span className="font-bold font-display text-white">+{scoringConfig?.blackjack_bonus || 10} pts</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}