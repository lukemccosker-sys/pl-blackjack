import { calculatePlayerPoints } from '@/lib/scoring';

const MIN_HAND = 2;
const MAX_HAND = 5;

/**
 * Finds hands of 2-5 players whose combined gameweek points equal exactly
 * the threshold. Only sizes with exact matches are offered.
 *
 * `skip` cycles: first through hand sizes (2 → 3 → 4 → 5), then through the
 * distinct point-combinations for a size, then through alternative players
 * holding those same point values. So shuffling keeps finding new hands.
 *
 * Note on approach: an earlier version brute-forced player combinations from
 * the top 30 scorers, which made larger hands impossible to find — if the
 * lowest score in that pool is 6, the cheapest 5-card hand is already 30 and
 * every 4- and 5-card blackjack silently vanished. The search now runs over
 * distinct POINT VALUES (there are only ever a dozen or so) and maps back to
 * real players afterwards, so every player is in scope and it stays fast.
 */
export function findBlackjackTeam(players, stats, scoringConfig, threshold = 21, skip = 0) {
  const statByPlayer = new Map();
  (stats || []).forEach(s => { if (s?.player_id) statByPlayer.set(s.player_id, s); });

  const candidates = (players || [])
    .map(p => {
      const stat = statByPlayer.get(p.id);
      if (!stat) return null;
      const points = calculatePlayerPoints(stat, scoringConfig);
      return { player: p, stat, points };
    })
    .filter(d => d !== null && d.points > 0 && d.points < threshold);

  if (candidates.length < MIN_HAND) return null;

  // Group players by their score, best first, so headline hands lead with the
  // big scorers rather than a row of one-pointers.
  const byValue = new Map();
  candidates.forEach(d => {
    if (!byValue.has(d.points)) byValue.set(d.points, []);
    byValue.get(d.points).push(d);
  });
  byValue.forEach(list => list.sort((a, b) => (b.stat?.minutes || 0) - (a.stat?.minutes || 0)));

  const values = [...byValue.keys()].sort((a, b) => b - a);
  const counts = values.map(v => byValue.get(v).length);

  const bySize = collectBySize(values, counts, threshold);
  if (bySize.length === 0) return null;

  const sizeIndex = skip % bySize.length;
  const combos = bySize[sizeIndex];
  const comboIndex = Math.floor(skip / bySize.length) % combos.length;
  const rotation = Math.floor(skip / (bySize.length * combos.length));

  return materialise(combos[comboIndex], byValue, rotation);
}

/**
 * Every multiset of point values (respecting how many players actually hold
 * each value) that sums to the threshold, bucketed by hand size. Returns only
 * the sizes that have at least one solution.
 */
function collectBySize(values, counts, threshold) {
  const bucket = {};
  for (let size = MIN_HAND; size <= MAX_HAND; size++) bucket[size] = [];

  const acc = [];
  (function search(i, remaining, size) {
    if (remaining === 0) {
      if (size >= MIN_HAND) bucket[size].push(acc.slice());
      return;
    }
    if (i >= values.length || size >= MAX_HAND) return;

    const value = values[i];
    const maxTake = Math.min(counts[i], MAX_HAND - size, Math.floor(remaining / value));
    for (let take = 0; take <= maxTake; take++) {
      for (let t = 0; t < take; t++) acc.push(value);
      search(i + 1, remaining - take * value, size + take);
      for (let t = 0; t < take; t++) acc.pop();
    }
  })(0, threshold, 0);

  const sizes = [];
  for (let size = MIN_HAND; size <= MAX_HAND; size++) {
    if (bucket[size].length > 0) sizes.push(bucket[size]);
  }
  return sizes;
}

/**
 * Turn a list of point values into actual players. Repeated values draw
 * different players, and `rotation` shifts which ones, so shuffling through a
 * repeated point pattern still surfaces fresh faces.
 */
function materialise(valueCombo, byValue, rotation = 0) {
  const takenPerValue = {};
  return valueCombo.map(value => {
    const pool = byValue.get(value);
    const nth = takenPerValue[value] || 0;
    takenPerValue[value] = nth + 1;
    const offset = pool.length > 0 ? (rotation + nth) % pool.length : 0;
    return pool[offset];
  });
}
