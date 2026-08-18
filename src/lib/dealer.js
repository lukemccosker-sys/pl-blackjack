export const DEALER_HAND_SIZE = 5;

export function pickDealerHand(players) {
  const pool = [...players];
  const hand = [];
  for (let i = 0; i < DEALER_HAND_SIZE && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    hand.push(pool[idx].id);
    pool.splice(idx, 1);
  }
  return hand;
}

/**
 * Ensures a PotWeek row (holding the dealer's random hand) exists for the
 * given gameweek, creating one if needed. Safe to call from any page —
 * dealing doesn't require anyone to have joined the money pot yet.
 *
 * After gameweek 1 the dealer only draws from players who have scored
 * points in a previous gameweek this season, so the dealer's hand is
 * always made up of "playing" players. Falls back to the full pool if
 * too few qualified players are available.
 * Returns the (possibly updated) list of weeks.
 */
export async function ensureDealerWeek({ base44, season, gameweekNumber, weekLocked, players, existingWeeks }) {
  if (weekLocked || !season || players.length === 0) return existingWeeks;
  const already = existingWeeks.find(w => w.gameweek === gameweekNumber);
  if (already) return existingWeeks;

  let pool = players;
  if (gameweekNumber > 1) {
    try {
      const prevStats = await base44.entities.PlayerStat.filter({ season }, '-gameweek', 1000);
      const playersWithPoints = new Set(
        prevStats.filter(s => (s.points || 0) > 0).map(s => s.player_id)
      );
      const filtered = players.filter(p => playersWithPoints.has(p.id));
      if (filtered.length >= DEALER_HAND_SIZE) {
        pool = filtered;
      }
    } catch (err) {
      // fall back to full player pool
    }
  }

  const dealerHand = pickDealerHand(pool);
  const created = await base44.entities.PotWeek.create({
    season, gameweek: gameweekNumber, stake_amount: 0,
    bettor_ids: [], dealer_player_ids: dealerHand, is_resolved: false,
  });
  return [...existingWeeks, created];
}