/**
 * Form + fixture engine.
 *
 * The Fixture entity carries no FPL difficulty rating, so club strength is
 * derived from this season's finished fixtures (points per game + goal
 * difference per game). Player form is measured in POOL points — the same
 * calculatePlayerPoints the live scoring uses — so a suggestion always
 * reflects this pool's scoring config rather than raw FPL points.
 */
import { calculatePlayerPoints } from './scoring';

export const FORM_WINDOW = 4;

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/**
 * League table built from finished fixtures.
 * Returns { [clubName]: { played, points, gf, ga, ppg, gdpg, rating } }
 * where rating is 0 (weakest) .. 1 (strongest).
 */
export function buildClubStrength(fixtures) {
  const table = {};
  const ensure = (club) => {
    if (!club) return null;
    if (!table[club]) table[club] = { played: 0, points: 0, gf: 0, ga: 0 };
    return table[club];
  };

  (fixtures || []).forEach(f => {
    if (!f?.finished) return;
    if (typeof f.home_score !== 'number' || typeof f.away_score !== 'number') return;
    const h = ensure(f.home_team);
    const a = ensure(f.away_team);
    if (!h || !a) return;

    h.played++; a.played++;
    h.gf += f.home_score; h.ga += f.away_score;
    a.gf += f.away_score; a.ga += f.home_score;

    if (f.home_score > f.away_score) h.points += 3;
    else if (f.home_score < f.away_score) a.points += 3;
    else { h.points += 1; a.points += 1; }
  });

  Object.values(table).forEach(t => {
    t.ppg = t.played ? t.points / t.played : 1.35;
    t.gdpg = t.played ? (t.gf - t.ga) / t.played : 0;
    // Mostly results-driven, with goal difference as a tiebreak signal.
    t.rating = clamp((t.ppg / 3) * 0.7 + ((t.gdpg + 3) / 6) * 0.3, 0, 1);
  });

  return table;
}

/** club name -> club_short, harvested from the player list. */
export function buildClubShortNames(players) {
  const map = {};
  (players || []).forEach(p => {
    if (p?.club && p?.club_short && !map[p.club]) map[p.club] = p.club_short;
  });
  return map;
}

/** The fixture a club plays in a given gameweek, if any. */
export function getUpcomingFixture(fixtures, gameweekNumber, clubName) {
  if (!clubName) return null;
  return (fixtures || []).find(f =>
    f?.gameweek === gameweekNumber &&
    (f.home_team === clubName || f.away_team === clubName)
  ) || null;
}

/**
 * Rate a fixture from one club's point of view.
 * ease: 1 (brutal) .. 5 (dream). difficulty is its inverse, FPL-style.
 */
export function rateFixture(fixture, clubName, strength, shortNames = {}) {
  if (!fixture || !clubName) return null;
  const isHome = fixture.home_team === clubName;
  const opponent = isHome ? fixture.away_team : fixture.home_team;
  const opp = strength?.[opponent];
  // Fall back to mid-table until an opponent has a couple of games on record.
  const oppRating = opp && opp.played >= 2 ? opp.rating : 0.5;

  const ease = clamp((1 - oppRating) * 4 + 1 + (isHome ? 0.35 : -0.35), 1, 5);

  return {
    isHome,
    opponent,
    opponentShort: shortNames[opponent] || opponent?.slice(0, 3).toUpperCase() || '???',
    ease,
    difficulty: 6 - ease,
    kickoff: fixture.kickoff_time || null,
  };
}

/** Tailwind classes for a fixture-ease chip. */
export function fixtureEaseClasses(ease) {
  if (ease == null) return 'bg-accent text-muted-foreground';
  if (ease >= 4) return 'bg-emerald-500/20 text-emerald-300';
  if (ease >= 3) return 'bg-primary/15 text-white';
  if (ease >= 2) return 'bg-amber-500/20 text-amber-300';
  return 'bg-destructive/20 text-destructive';
}

/**
 * Per-player form over the completed gameweeks immediately before
 * `upToGameweek`. Points are pool points, not FPL points.
 */
export function buildFormIndex(stats, scoringConfig, upToGameweek, windowSize = FORM_WINDOW) {
  const index = {};
  if (!scoringConfig || typeof upToGameweek !== 'number') return index;

  const byPlayer = {};
  (stats || []).forEach(s => {
    if (!s || typeof s.gameweek !== 'number' || !s.player_id) return;
    if (s.gameweek >= upToGameweek) return;                 // completed weeks only
    if (s.gameweek < upToGameweek - windowSize) return;
    if (!byPlayer[s.player_id]) byPlayer[s.player_id] = [];
    byPlayer[s.player_id].push(s);
  });

  Object.entries(byPlayer).forEach(([pid, rows]) => {
    rows.sort((a, b) => b.gameweek - a.gameweek);
    const pts = rows.map(r => calculatePlayerPoints(r, scoringConfig));
    const appearances = rows.filter(r => (r.minutes || 0) > 0).length;
    const totalPoints = pts.reduce((sum, p) => sum + p, 0);

    index[pid] = {
      games: rows.length,
      appearances,
      totalPoints,
      avgPoints: rows.length ? totalPoints / rows.length : 0,
      perStart: appearances ? totalPoints / appearances : 0,
      minutes: rows.reduce((sum, r) => sum + (r.minutes || 0), 0),
      lastPoints: pts[0] ?? 0,
      lastGameweek: rows[0]?.gameweek ?? null,
      startRate: rows.length ? appearances / rows.length : 0,
    };
  });

  return index;
}

/**
 * Expected pool points for a player this week: recent per-start scoring,
 * discounted by how often they actually start, nudged by fixture ease.
 */
export function expectedPoints(form, fixtureRating) {
  if (!form || form.appearances === 0) return 0;
  const easeMultiplier = fixtureRating
    ? 0.75 + (fixtureRating.ease - 1) * 0.125   // 0.75x brutal .. 1.25x dream
    : 1;
  return form.perStart * form.startRate * easeMultiplier;
}

/**
 * Ranked suggestions for the upcoming gameweek: in form, playing, and with
 * a kind fixture. Capped per club so the list isn't five players from the
 * one team, and seeded with a goalkeeper since a GK goal is a Natural 21.
 */
export function buildShortlist({
  players,
  stats,
  fixtures,
  scoringConfig,
  gameweekNumber,
  limit = 20,
  perClubCap = 2,
}) {
  if (!scoringConfig || typeof gameweekNumber !== 'number') return [];

  const strength = buildClubStrength(fixtures);
  const shortNames = buildClubShortNames(players);
  const formIndex = buildFormIndex(stats, scoringConfig, gameweekNumber);

  const candidates = (players || []).map(p => {
    const form = formIndex[p.id];
    if (!form || form.appearances === 0) return null;

    const fixture = getUpcomingFixture(fixtures, gameweekNumber, p.club);
    if (!fixture) return null;                              // blank gameweek

    const rating = rateFixture(fixture, p.club, strength, shortNames);
    return { player: p, form, fixture: rating, expected: expectedPoints(form, rating) };
  }).filter(Boolean);

  candidates.sort((a, b) => b.expected - a.expected);

  const perClub = {};
  const picked = [];
  for (const c of candidates) {
    const club = c.player.club || 'unknown';
    if ((perClub[club] || 0) >= perClubCap) continue;
    perClub[club] = (perClub[club] || 0) + 1;
    picked.push(c);
    if (picked.length >= limit) break;
  }

  // Make sure at least one keeper is on show — a GK goal is a Natural 21.
  if (!picked.some(c => c.player.position === 'GK')) {
    const bestGk = candidates.find(c => c.player.position === 'GK');
    if (bestGk) picked.splice(Math.max(0, picked.length - 1), 1, bestGk);
  }

  return picked;
}

/** Everything a picking screen needs, computed once. */
export function buildPickingContext({ players, stats, fixtures, scoringConfig, gameweekNumber }) {
  const strength = buildClubStrength(fixtures);
  const shortNames = buildClubShortNames(players);
  const formIndex = buildFormIndex(stats, scoringConfig, gameweekNumber);

  const fixtureByClub = {};
  Object.keys(shortNames).forEach(club => {
    const fx = getUpcomingFixture(fixtures, gameweekNumber, club);
    fixtureByClub[club] = rateFixture(fx, club, strength, shortNames);
  });

  const expectedByPlayerId = {};
  (players || []).forEach(p => {
    expectedByPlayerId[p.id] = expectedPoints(formIndex[p.id], fixtureByClub[p.club]);
  });

  return { strength, shortNames, formIndex, fixtureByClub, expectedByPlayerId };
}
