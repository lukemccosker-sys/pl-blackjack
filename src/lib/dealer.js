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
 * Returns the (possibly updated) list of weeks.
 */
export async function ensureDealerWeek({ base44, season, gameweekNumber, weekLocked, players, existingWeeks }) {
  if (weekLocked || !season || players.length === 0) return existingWeeks;
  const already = existingWeeks.find(w => w.gameweek === gameweekNumber);
  if (already) return existingWeeks;
  const dealerHand = pickDealerHand(players);
  const created = await base44.entities.PotWeek.create({
    season, gameweek: gameweekNumber, stake_amount: 0,
    bettor_ids: [], dealer_player_ids: dealerHand, is_resolved: false,
  });
  return [...existingWeeks, created];
}
