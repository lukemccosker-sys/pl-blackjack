/**
 * Shared player-list fetch helper. Used by ALL client pages AND the sync
 * backend function so the player list limit never drifts between them.
 *
 * Pass the entities accessor appropriate to your context:
 *   - Client pages:  fetchAllPlayers(base44.entities)
 *   - Sync function: fetchAllPlayers(base44.asServiceRole.entities)
 */
export const PLAYER_LIST_LIMIT = 2000;

export async function fetchAllPlayers(entities) {
  return await entities.Player.list('', PLAYER_LIST_LIMIT);
}

/**
 * Paginated PlayerStat fetcher. A single list() call is capped (2000 rows)
 * well below a full season's worth of stats (841 players × up to 38 GWs),
 * so this pages through every row by skipping in batches until the API
 * returns fewer than the page size.
 *
 * Optionally filter by season to avoid pulling stale data from prior years.
 */
const STAT_PAGE_SIZE = 5000;

export async function fetchAllPlayerStats(entities, season) {
  const all = [];
  let skip = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch = season
      ? await entities.PlayerStat.filter({ season }, '', STAT_PAGE_SIZE, skip)
      : await entities.PlayerStat.list('', STAT_PAGE_SIZE, skip);
    all.push(...batch);
    if (batch.length < STAT_PAGE_SIZE) break;
    skip += STAT_PAGE_SIZE;
  }
  return all;
}