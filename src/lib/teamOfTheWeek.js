import { calculatePlayerPoints } from '@/lib/scoring';

/**
 * Finds blackjack combinations of 2-5 players whose combined gameweek
 * points equal exactly the threshold. Only sizes with exact matches
 * are included.
 *
 * `skip` cycles through available sizes: e.g. 2 → 3 → 4 → 5 → 2 → 3 → 4 → 5 …
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

  const bySize = [];
  for (let size = 2; size <= 5; size++) {
    if (pool.length < size) continue;
    const exact = findAllCombinations(pool, size, threshold);
    if (exact.length > 0) bySize.push(exact);
  }

  if (bySize.length === 0) return null;

  const sizeIndex = skip % bySize.length;
  const combos = bySize[sizeIndex];
  const comboIndex = Math.floor(skip / bySize.length) % combos.length;
  return combos[comboIndex];
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