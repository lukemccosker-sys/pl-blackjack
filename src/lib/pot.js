/**
 * Pot settlement maths, kept pure so it can be tested without a database.
 *
 * Two things the previous inline version got wrong and this fixes:
 *   1. A tie silently handed the whole pot to whoever happened to sort first.
 *      Tied top scorers now split it.
 *   2. Money was split with floating point, which can lose or invent cents.
 *      Splitting happens in integer cents, with any remainder handed out one
 *      cent at a time so the shares always add back up to the pot exactly.
 */

/** Split an integer number of cents n ways, distributing the remainder. */
export function splitCents(totalCents, n) {
  if (!n || n <= 0) return [];
  const safeTotal = Math.max(0, Math.round(totalCents));
  const base = Math.floor(safeTotal / n);
  const remainder = safeTotal - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * Decide who wins a pot week.
 *
 * Every bettor is scored, the highest score takes the pot, and ties split it.
 * An all-zero week (everyone busted) is a tie between all bettors, so the
 * stakes come back rather than being handed to an arbitrary buster.
 *
 * @param {string[]} bettorIds     members who staked this week
 * @param {number}   stakeAmount   per-member stake
 * @param {Function} scoreOf       (memberId) => number
 * @returns {{ potAmount, topScore, isTie, winners: Array<{id, score, share}> }}
 */
export function decidePotWeek({ bettorIds, stakeAmount, scoreOf }) {
  const ids = Array.isArray(bettorIds) ? bettorIds.filter(Boolean) : [];
  const stake = Number(stakeAmount) || 0;
  const potAmount = Math.round(stake * ids.length * 100) / 100;

  if (ids.length === 0) {
    return { potAmount: 0, topScore: null, isTie: false, winners: [] };
  }

  const scored = ids.map(id => ({ id, score: Number(scoreOf(id)) || 0 }));
  const topScore = Math.max(...scored.map(s => s.score));
  const top = scored.filter(s => s.score === topScore);
  const shares = splitCents(potAmount * 100, top.length);

  return {
    potAmount,
    topScore,
    isTie: top.length > 1,
    winners: top.map((w, i) => ({ id: w.id, score: w.score, share: shares[i] / 100 })),
  };
}

/** Display label for the winner field — "Alice", or "Alice & Bob (split)". */
export function winnerLabel(winners, nameOf) {
  const names = (winners || []).map(w => nameOf(w.id) || 'Unknown');
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]} (split)`;
}
