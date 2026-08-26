import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { fetchAllPlayers, fetchAllPlayerStats } from '../../base44/shared/playerQueries.js';
import { usePoolAuth } from '@/lib/PoolAuth';
import { calculatePlayerPoints, calculatePickTotal, isDeadlinePassed, isGameweekFinished } from '@/lib/scoring';
import { buildPickingContext, buildShortlist, filterFixturesToSeason } from '@/lib/playerForm';
import PlayerSearch from '@/components/PlayerSearch';
import PickSummary from '@/components/PickSummary';
import PickRail from '@/components/PickRail';
import CardHand from '@/components/CardHand';
import Countdown from '@/components/Countdown';
import TwentyOneMeter from '@/components/TwentyOneMeter';
import { Lock, ChevronDown } from 'lucide-react';

export default function Picks() {
  const { member } = usePoolAuth();
  const [gameweek, setGameweek] = useState(null);
  const [scoringConfig, setScoringConfig] = useState(null);
  const [players, setPlayers] = useState([]);
  const [existingPick, setExistingPick] = useState(null);
  const [playerStats, setPlayerStats] = useState([]);
  const [seasonStats, setSeasonStats] = useState([]);
  const [fixtures, setFixtures] = useState([]);
  const [gameweeks, setGameweeks] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [gws, configs, allPlayers] = await Promise.all([
        base44.entities.Gameweek.list('number', 50),
        base44.entities.ScoringConfig.filter({ is_active: true }),
        fetchAllPlayers(base44.entities),
      ]);
      const sorted = gws.sort((a, b) => a.number - b.number);
      const active = sorted.find(g => g.is_active) || sorted[sorted.length - 1];
      setGameweek(active);
      setGameweeks(sorted);
      setScoringConfig(configs[0] || null);
      setPlayers(allPlayers);
      if (active && member) {
        // Season-wide stats and fixtures power the form + fixture-difficulty
        // suggestions and the projected total, so they're fetched here rather
        // than only the current gameweek's slice.
        const [picks, stats, allFixtures, seasonStatRows] = await Promise.all([
          base44.entities.Pick.filter(active.season ? { member_id: member.id, gameweek: active.number, season: active.season } : { member_id: member.id, gameweek: active.number }),
          base44.entities.PlayerStat.filter(active.season ? { gameweek: active.number, season: active.season } : { gameweek: active.number }),
          base44.entities.Fixture.list('', 1000),
          fetchAllPlayerStats(base44.entities, active.season),
        ]);
        if (picks.length > 0) {
          setExistingPick(picks[0]);
          setSelectedIds(picks[0].player_ids || []);
        }
        setPlayerStats(stats);
        setSeasonStats(seasonStatRows);
        setFixtures(filterFixturesToSeason(allFixtures, sorted, active.season));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Form + fixture difficulty for every player, and the ranked shortlist that
  // fronts the picker. Hooks must sit above the early returns below.
  const pickingContext = useMemo(() => buildPickingContext({
    players,
    stats: seasonStats,
    fixtures,
    scoringConfig,
    gameweekNumber: gameweek?.number,
  }), [players, seasonStats, fixtures, scoringConfig, gameweek]);

  const shortlist = useMemo(() => buildShortlist({
    players,
    stats: seasonStats,
    fixtures,
    scoringConfig,
    gameweekNumber: gameweek?.number,
    limit: 20,
  }), [players, seasonStats, fixtures, scoringConfig, gameweek]);

  if (loading) return <div className="p-6 text-center text-muted-foreground">Loading...</div>;
  if (!gameweek) return <div className="p-6 text-center text-muted-foreground">No active gameweek yet. Ask your admin to set one up.</div>;

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
        gameweek: gameweek.number, season: gameweek.season, player_ids: selectedIds,
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

  const selectedPlayers = selectedIds.map(id => players.find(p => p.id === id)).filter(Boolean);
  const pickedStats = selectedPlayers.map(p => playerStats.find(s => s.player_id === p.id));
  const playerPoints = pickedStats.map(stat => calculatePlayerPoints(stat, scoringConfig));
  const { isBust, tier, isNatural, score } = calculatePickTotal(playerPoints, scoringConfig, pickedStats);
  const playerData = selectedPlayers.map((p, i) => ({
    player: p,
    stat: playerStats.find(s => s.player_id === p.id),
    points: playerPoints[i],
  }));

  const pointsByPlayerId = {};
  players.forEach(p => {
    const stat = playerStats.find(s => s.player_id === p.id);
    pointsByPlayerId[p.id] = calculatePlayerPoints(stat, scoringConfig);
  });

  // Pre-deadline every live score is 0, so the meter runs on projected points
  // (recent form discounted by start rate, nudged by fixture difficulty).
  const projectedTotal = selectedIds.reduce(
    (sum, id) => sum + (pickingContext.expectedByPlayerId[id] || 0),
    0
  );

  return (
    <div className={`p-4 ${locked ? 'pb-48' : 'pb-6'}`}>
      <div className="mb-4">
        <h1 className="text-2xl font-bold font-heading">Gameweek {gameweek.number}</h1>
        {locked ? (
          <p className="text-destructive flex items-center gap-1 mt-1 text-sm">
            <Lock size={14} /> Picks locked
          </p>
        ) : (
          <Countdown deadline={gameweek.deadline} className="mt-1" />
        )}
      </div>

      {!locked && (
        <TwentyOneMeter
          total={projectedTotal}
          threshold={scoringConfig?.bust_threshold || 21}
          count={selectedIds.length}
          live={false}
          className="mb-4"
        />
      )}

      {!locked && (
        <div className="flex gap-3 items-start">
          <div className="flex-1 min-w-0">
            <PlayerSearch
              players={players}
              selectedIds={selectedIds}
              onToggle={handleToggle}
              pointsByPlayerId={pointsByPlayerId}
              gameweekNumber={gameweek.number}
              shortlist={shortlist}
              formIndex={pickingContext.formIndex}
              fixtureByClub={pickingContext.fixtureByClub}
              showLivePoints={false}
            />
          </div>
          <PickRail
            selectedPlayers={selectedPlayers}
            onRemove={handleToggle}
            onSave={handleSave}
            saving={saving}
            saved={saved}
            hasFive={selectedIds.length >= 2}
          />
        </div>
      )}

      {locked && (
        <div className="mb-4">
          {playerData.length > 0 ? (
            <button onClick={() => setExpanded(prev => !prev)} className="w-full text-left">
              <div className="flex items-center justify-between bg-card rounded-xl p-3 mb-2">
                <p className="text-xs text-muted-foreground">Your total</p>
                <div className="flex items-center gap-1.5">
                  <span className={`text-2xl font-bold font-display ${isBust ? 'text-destructive' : 'text-white'}`}>{score}</span>
                  <span className="text-xs text-muted-foreground">/ {scoringConfig?.bust_threshold || 21}</span>
                  <ChevronDown size={16} className={`text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </div>
              </div>
              <CardHand
                playerData={playerData}
                isBust={isBust}
                isBlackjack={tier === 'blackjack'}
                isNatural={isNatural}
                threshold={scoringConfig?.bust_threshold || 21}
                showPoints={true}
                spread={expanded}
                large={true}
              />
              {!expanded && (
                <p className="text-center text-[10px] text-muted-foreground -mt-2">Tap to expand your picks</p>
              )}
            </button>
          ) : (
            <p className="text-center text-muted-foreground py-8">No picks saved for this gameweek</p>
          )}
        </div>
      )}

      {locked && (
        <PickSummary
          selectedPlayers={selectedPlayers}
          playerPoints={playerPoints}
          isBust={isBust}
          onSave={handleSave}
          onRemove={handleToggle}
          saving={saving}
          saved={saved}
          isLocked={locked}
          hasFive={selectedIds.length >= 2}
          tier={tier}
          isFinalized={gwFinished}
        />
      )}
    </div>
  );
}