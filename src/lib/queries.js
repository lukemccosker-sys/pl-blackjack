import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { fetchAllPlayers, fetchAllPlayerStats } from '../../base44/shared/playerQueries.js';

/**
 * Shared data layer.
 *
 * Every page used to hand-roll useState + useEffect + subscribe and fetch its
 * own copy of the same data — so Home, Picks, Stats, Leaderboard and PotPanel
 * each pulled the ENTIRE season of PlayerStat rows independently, and each
 * re-pulled on every stat subscription event during a live gameweek. By May
 * that's ~30k rows, five times over, repeatedly.
 *
 * React Query was already installed and its provider already mounted; it just
 * wasn't being used. Now one cache serves every page, and `useEntitySync`
 * turns entity subscriptions into cache invalidations instead of five
 * independent refetch loops.
 *
 * Season stats and season picks are supersets of the current gameweek's, so
 * pages derive "this gameweek" by filtering the cached season data rather than
 * issuing another request.
 */

const MINUTE = 60 * 1000;

export const qk = {
  gameweeks: ['gameweeks'],
  scoringConfig: ['scoring-config'],
  players: ['players'],
  members: ['members'],
  fixtures: ['fixtures'],
  seasonStats: (season) => ['season-stats', season ?? null],
  seasonPicks: (season) => ['season-picks', season ?? null],
};

export function useGameweeks() {
  return useQuery({
    queryKey: qk.gameweeks,
    queryFn: async () => {
      const gws = await base44.entities.Gameweek.list('number', 100);
      return [...gws].sort((a, b) => a.number - b.number);
    },
    staleTime: 2 * MINUTE,
  });
}

/** The active gameweek, or the latest one if none is flagged active. */
export function useActiveGameweek() {
  const { data: gameweeks = [], ...rest } = useGameweeks();
  const active = gameweeks.find(g => g.is_active) || gameweeks[gameweeks.length - 1] || null;
  return { gameweeks, active, season: active?.season, ...rest };
}

export function useScoringConfig() {
  return useQuery({
    queryKey: qk.scoringConfig,
    queryFn: async () => {
      const configs = await base44.entities.ScoringConfig.filter({ is_active: true });
      return configs[0] || null;
    },
    staleTime: 10 * MINUTE,
  });
}

export function usePlayers() {
  return useQuery({
    queryKey: qk.players,
    // ~800 rows that change at most once a day, so it's worth holding on to.
    queryFn: () => fetchAllPlayers(base44.entities),
    staleTime: 30 * MINUTE,
  });
}

export function useMembers() {
  return useQuery({
    queryKey: qk.members,
    queryFn: () => base44.entities.PoolMember.list('', 100),
    staleTime: 5 * MINUTE,
  });
}

export function useFixtures() {
  return useQuery({
    queryKey: qk.fixtures,
    queryFn: () => base44.entities.Fixture.list('', 1000),
    staleTime: 5 * MINUTE,
  });
}

/** The expensive one — paged across the whole season. Cached once for everyone. */
export function useSeasonStats(season, { enabled = true } = {}) {
  return useQuery({
    queryKey: qk.seasonStats(season),
    queryFn: () => fetchAllPlayerStats(base44.entities, season),
    enabled,
    staleTime: 2 * MINUTE,
  });
}

export function useSeasonPicks(season, { enabled = true } = {}) {
  return useQuery({
    queryKey: qk.seasonPicks(season),
    queryFn: () => (season
      ? base44.entities.Pick.filter({ season }, '', 5000)
      : base44.entities.Pick.list('', 5000)),
    enabled,
    staleTime: MINUTE,
  });
}

/**
 * Bridges Base44 entity subscriptions to the query cache. Mounted once, in
 * Layout — previously each page ran its own subscription and refetch loop.
 * Invalidations are debounced because a sync fires many events in a burst.
 */
export function useEntitySync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const timers = {};
    const invalidate = (keys) => () => {
      const id = keys.map(k => k[0]).join('|');
      clearTimeout(timers[id]);
      timers[id] = setTimeout(() => {
        keys.forEach(queryKey => queryClient.invalidateQueries({ queryKey }));
      }, 500);
    };

    const unsubs = [
      base44.entities.PlayerStat.subscribe(invalidate([['season-stats']])),
      base44.entities.Pick.subscribe(invalidate([['season-picks']])),
      base44.entities.Gameweek.subscribe(invalidate([qk.gameweeks])),
    ];

    return () => {
      unsubs.forEach(u => typeof u === 'function' && u());
      Object.values(timers).forEach(clearTimeout);
    };
  }, [queryClient]);
}

/** Force a refresh of the live-scoring data — used after saving picks. */
export function useRefreshLiveData() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['season-picks'] });
    queryClient.invalidateQueries({ queryKey: ['season-stats'] });
  };
}
