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