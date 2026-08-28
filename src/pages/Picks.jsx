import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { usePoolAuth } from '@/lib/PoolAuth';
import {
  useActiveGameweek, useScoringConfig, usePlayers, useFixtures, usePicks,
  useSeasonStats, useRefreshLiveData,
} from '@/lib/queries';
import { calculatePlayerPoints, calculatePickTotal, isDeadlinePassed, isGameweekFinished } from '@/lib/scoring';
import { buildPickingContext, buildShortlist, filterFixturesToSeason } from '@/lib/playerForm';
import PlayerSearch from '@/components/PlayerSearch';
import PickSummary from '@/components/PickSummary';
import CardHand from '@/components/CardHand';
import Countdown from '@/components/Countdown';
import PageHeader from '@/components/PageHeader';
import { Lock, ChevronDown } from 'lucide-react';

// Tolerate picks that predate the season backfill.
const matchesSeason = (pick, season) => !season || !pick.season || pick.season === season;

export default function Picks() {
  const { member } = usePoolAuth();

  const { gameweeks, active: gameweek, isLoading: gwLoading } = useActiveGameweek();
  const { data: scoringConfig } = useScoringConfig();
  const { data: players = [] } = usePlayers();
  const { data: allFixtures = [] } = useFixtures();
  const { data: seasonPicks = [] } = usePicks();
  const { data: seasonStats = [], isPending: statsPending } = useSeasonStats(gameweek?.season, {
    enabled: !gwLoading,
  });
  const refreshLiveData = useRefreshLiveData();

  const loading = gwLoading || statsPending;

  const [selectedIds, setSelectedIds] = useState([]);
  const [seeded, setSeeded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fixtures = useMemo(
    () => filterFixturesToSeason(allFixtures, gameweeks, gameweek?.season),
    [allFixtures, gameweeks, gameweek]
  );
  const playerStats = useMemo(
    () => seasonStats.filter(s => s.gameweek === gameweek?.number),
    [seasonStats, gameweek]
  );
  const existingPick = useMemo(
    () => seasonPicks.find(p =>
      p.member_id === member?.id &&
      p.gameweek === gameweek?.number &&
      matchesSeason(p, gameweek?.season)
    ) || null,
    [seasonPicks, member, gameweek]
  );

  // Seed the selection from a saved pick exactly once, so a later cache
  // refresh can't wipe out choices made since.
  useEffect(() => {
    if (seeded || loading) return;
    setSelectedIds(existingPick?.player_ids || []);
    setSeeded(true);
  }, [seeded, loading, existingPick]);

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
        await base44.entities.Pick.create(pickData);
      }
      refreshLiveData();
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
    // Bottom padding clears the persistent pick sheet plus the nav bar.
    <div className="p-4 pb-sheet">
      <PageHeader
        title={`Gameweek ${gameweek.number}`}
        subtitle={locked ? (
          <p className="text-destructive flex items-center gap-1 mt-1 text-sm">
            <Lock size={14} /> Picks locked
          </p>
        ) : (
          <Countdown deadline={gameweek.deadline} className="mt-1" />
        )}
      />

      {/* Full width: the running total and the save button live in the sheet
          pinned to the bottom, so nothing competes with the player list. */}
      {!locked && (
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

      <PickSummary
        selectedPlayers={selectedPlayers}
        playerPoints={playerPoints}
        isBust={isBust}
        onSave={handleSave}
        onRemove={handleToggle}
        saving={saving}
        saved={saved}
        isLocked={locked}
        hasMinimum={selectedIds.length >= 2}
        tier={tier}
        isFinalized={gwFinished}
        meterTotal={projectedTotal}
        threshold={scoringConfig?.bust_threshold || 21}
      />
    </div>
  );
}