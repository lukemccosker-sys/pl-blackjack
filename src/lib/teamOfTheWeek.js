import { calculatePlayerPoints } from '@/lib/scoring';

/**
 * Finds a combination of 3-5 players whose combined gameweek points
 * equal exactly the threshold — a "blackjack" team of the week.
 *
 * Searches the top 30 scoring players (by gameweek points) for the
 * smallest combination (3, then 4, then 5) that sums to the target.
 *
 * Pass `skip` to skip the first N found combinations (for refresh).
 */
export function findBlackjackTeam(players, stats, scoringConfig, threshold = 21, skip = 0) {
  const candidates = players
    .map(p => {
      const stat = stats.find(s => s.player_id === p.id);
      if (!stat) return null;
      const points = calculatePlayerPoints(stat, scoringConfig);
      return { player: p, stat, points };
    })
    .filter(d => d !== null && d.points > 0 && d.points < threshold)
    .sort((a, b) => b.points - a.points);

  const pool = candidates.slice(0, 30);

  // Collect every valid combination across all sizes (3, 4, 5),
  // then index into the combined list with `skip` so the shuffle
  // can surface teams of different sizes.
  const all = [];
  for (let size = 3; size <= 5; size++) {
    if (pool.length < size) continue;
    all.push(...findAllCombinations(pool, size, threshold));
  }

  if (all.length === 0) return null;

  const idx = skip % all.length;
  return all[idx];
}

function findAllCombinations(pool, size, target) {
  const n = pool.length;
  if (n < size) return [];

  const results = [];
  const indices = Array.from({ length: size }, (_, i) => i);

  while (true) {
    const sum = indices.reduce((acc, idx) => acc + pool[idx].points, 0);
    if (sum === target) {
      results.push(indices.map(idx => pool[idx]));
    }

    let i = size - 1;
    while (i >= 0 && indices[i] === n - size + i) i--;
    if (i < 0) break;

    indices[i]++;
    for (let j = i + 1; j < size; j++) {
      indices[j] = indices[j - 1] + 1;
    }
  }

  return results;
}