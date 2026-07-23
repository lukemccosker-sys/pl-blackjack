import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { calculatePlayerPoints, calculatePickTotal } from '../../shared/scoring.js';
import { fetchAllPlayers } from '../../shared/playerQueries.js';

const FPL_BASE = 'https://fantasy.premierleague.com/api';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const syncStartTime = Date.now();
    const body = await req.json();
    const { member_id } = body;

    if (!member_id) {
      return Response.json({ error: 'Member ID required' }, { status: 400 });
    }
    let isAdmin = false;
    try {
      const member = await base44.asServiceRole.entities.PoolMember.get(member_id);
      isAdmin = member?.is_admin === true;
    } catch (e) {
      isAdmin = false;
    }
    if (!isAdmin) {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const bsData = await fplFetch('/bootstrap-static/');
    const bootstrapResult = await syncBootstrap(base44, bsData);
    const fixturesResult = await syncFixtures(base44, bsData);

    const gameweeks = await base44.asServiceRole.entities.Gameweek.list('number', 50);
    const allFixtures = await base44.asServiceRole.entities.Fixture.list('', 1000);

    // --- Season backfill: Gameweeks missing a season field ---
    const gwsWithoutSeason = gameweeks.filter(gw => !gw.season && gw.deadline);
    let gwSeasonBackfilled = 0;
    if (gwsWithoutSeason.length > 0) {
      const gwSeasonUpdates = gwsWithoutSeason.map(gw => ({
        id: gw.id,
        season: deriveSeason(gw.deadline),
      }));
      for (let i = 0; i < gwSeasonUpdates.length; i += 500) {
        await base44.asServiceRole.entities.Gameweek.bulkUpdate(gwSeasonUpdates.slice(i, i + 500));
      }
      gwSeasonBackfilled = gwSeasonUpdates.length;
      gwSeasonUpdates.forEach(u => {
        const gw = gameweeks.find(g => g.id === u.id);
        if (gw) gw.season = u.season;
      });
    }

    // --- Season backfill: PlayerStats missing a season field ---
    const seasonByGw = {};
    gameweeks.forEach(gw => { if (gw.season) seasonByGw[gw.number] = gw.season; });
    let statSeasonBackfilled = 0;
    for (const gw of gameweeks) {
      const season = seasonByGw[gw.number];
      if (!season) continue;
      try {
        const stats = await base44.asServiceRole.entities.PlayerStat.filter({ gameweek: gw.number });
        const needingSeason = stats.filter(s => !s.season);
        if (needingSeason.length > 0) {
          const updates = needingSeason.map(s => ({ id: s.id, season }));
          for (let i = 0; i < updates.length; i += 500) {
            await base44.asServiceRole.entities.PlayerStat.bulkUpdate(updates.slice(i, i + 500));
          }
          statSeasonBackfilled += needingSeason.length;
        }
      } catch (e) {
        // season backfill is best-effort; don't block sync
      }
    }

    // --- Compute the REAL active gameweek from fixture data ---
    // FPL's is_current flag can be wrong or lagging, especially around
    // season boundaries. Instead of trusting it, compute the active GW as:
    // within the current season, the lowest-numbered gameweek that does NOT
    // have all its fixtures marked finished.
    const fplActiveGw = gameweeks.find(g => g.is_active);
    // Derive the current season from today's actual date, not from any
    // Gameweek record's stored season — FPL's is_current flag can be
    // stale/wrong, which would silently scope the active-GW computation
    // to the wrong season and find nothing.
    const currentSeason = deriveSeason(new Date().toISOString());

    let computedActiveGw = null;
    const seasonGws = gameweeks
      .filter(gw => !currentSeason || gw.season === currentSeason)
      .sort((a, b) => a.number - b.number);
    for (const gw of seasonGws) {
      const gwFixtures = allFixtures.filter(f => f.gameweek === gw.number);
      if (gwFixtures.length === 0) continue;
      if (!gwFixtures.every(f => f.finished)) {
        computedActiveGw = gw;
        break;
      }
    }
    // Pre-season fallback: if no GW with fixtures was found but FPL reports
    // an active GW with no fixtures yet, trust FPL (fixtures may not be
    // scheduled for the new season). If FPL's GW has all fixtures finished,
    // the season is over — don't fall back.
    if (!computedActiveGw && fplActiveGw) {
      const fplGwFixtures = allFixtures.filter(f => f.gameweek === fplActiveGw.number);
      if (fplGwFixtures.length === 0) {
        computedActiveGw = fplActiveGw;
      }
    }

    // Correct is_active on all gameweeks to match the computed result,
    // so client pages (Home, Live, Stats, Picks, Leaderboard) reading
    // is_active get the right value without any client-side changes.
    const gwActiveUpdates = [];
    gameweeks.forEach(gw => {
      const shouldBeActive = computedActiveGw && gw.id === computedActiveGw.id;
      if (gw.is_active !== shouldBeActive) {
        gwActiveUpdates.push({ id: gw.id, is_active: shouldBeActive });
        gw.is_active = shouldBeActive;
      }
    });
    if (gwActiveUpdates.length > 0) {
      await base44.asServiceRole.entities.Gameweek.bulkUpdate(gwActiveUpdates);
    }

    const activeGw = computedActiveGw;
    let activeDiscrepancy = null;
    if (fplActiveGw && computedActiveGw && fplActiveGw.number !== computedActiveGw.number) {
      activeDiscrepancy = {
        fplCurrent: fplActiveGw.number,
        computedActive: computedActiveGw.number,
        message: `FPL reports GW${fplActiveGw.number} as current, but GW${computedActiveGw.number} is the actual first unfinished gameweek — using GW${computedActiveGw.number}`,
      };
    }
    const attempted = [];
    const succeeded = [];
    const failed = [];
    let activeReport = null;

    // 1. Always sync live stats for the active (in-progress) gameweek, but
    //    don't mark it stats_synced unless all its fixtures are finished.
    if (activeGw) {
      attempted.push(activeGw.number);
      try {
        const statResult = await syncStats(base44, activeGw.number, deriveSeason(activeGw.deadline));
        const gwFixtures = allFixtures.filter(f => f.gameweek === activeGw.number);
        const allFinished = gwFixtures.length > 0 && gwFixtures.every(f => f.finished);
        if (allFinished) {
          await base44.asServiceRole.entities.Gameweek.update(activeGw.id, {
            is_finalized: true, stats_synced: true,
          });
          succeeded.push({ gameweek: activeGw.number, ...statResult });
        }
        activeReport = {
          gameweek: activeGw.number, synced: true, finalized: allFinished,
          hasMatchData: statResult.hasMatchData,
        };
      } catch (err) {
        activeReport = { gameweek: activeGw.number, synced: false, error: err.message };
      }
    } else {
      activeReport = { noActiveGw: true };
    }

    // 2. Backfill stats for every OTHER finished gameweek in the current
    //    season that hasn't been marked stats_synced yet. Each gameweek is
    //    wrapped in its own try/catch so one failure doesn't block the rest.
    //    Uses a time budget (20s) instead of a flat cap — processes as many
    //    gameweeks as fit within the budget, then stops. Press Sync again
    //    to continue from the next unsynced gameweek.
    const BACKFILL_TIME_BUDGET_MS = 20000;
    let backfillProcessed = 0;
    const remainingUnsynced = [];
    for (const gw of gameweeks) {
      if (gw.stats_synced) continue;
      if (activeGw && gw.number === activeGw.number) continue;
      if (currentSeason && gw.season !== currentSeason) continue;
      const gwFixtures = allFixtures.filter(f => f.gameweek === gw.number);
      if (gwFixtures.length === 0) continue;
      if (!gwFixtures.every(f => f.finished)) continue;

      if (Date.now() - syncStartTime > BACKFILL_TIME_BUDGET_MS) {
        remainingUnsynced.push(gw.number);
        continue;
      }

      attempted.push(gw.number);
      backfillProcessed++;
      try {
        const statResult = await syncStats(base44, gw.number, deriveSeason(gw.deadline));
        await base44.asServiceRole.entities.Gameweek.update(gw.id, {
          is_finalized: true, stats_synced: true,
        });
        succeeded.push({ gameweek: gw.number, ...statResult });
      } catch (err) {
        failed.push({ gameweek: gw.number, error: err.message });
      }
    }

    // Update local gameweek objects to reflect this run's sync results
    succeeded.forEach(s => {
      const gw = gameweeks.find(g => g.number === s.gameweek);
      if (gw) { gw.stats_synced = true; gw.is_finalized = true; }
    });

    // Compute one-line season status for the report
    const reportSeason = activeGw?.season || (gameweeks.length > 0 ? gameweeks[gameweeks.length - 1].season : '') || '';
    const finishedGws = gameweeks.filter(gw => {
      if (currentSeason && gw.season !== currentSeason) return false;
      const gwFixtures = allFixtures.filter(f => f.gameweek === gw.number);
      return gwFixtures.length > 0 && gwFixtures.every(f => f.finished);
    });
    const totalFinished = finishedGws.length;

    let seasonStatus;
    if (!reportSeason) {
      seasonStatus = 'No season data yet — run sync to populate';
    } else if (!activeGw && totalFinished === 0) {
      seasonStatus = `Season ${reportSeason} — no gameweek started yet`;
    } else if (activeGw) {
      const priorFinished = finishedGws.filter(gw => gw.number !== activeGw.number);
      const priorSynced = priorFinished.filter(gw => gw.stats_synced).length;
      seasonStatus = `Season ${reportSeason} — Gameweek ${activeGw.number} active, ${priorSynced} of ${priorFinished.length} prior gameweeks synced`;
    } else {
      const syncedFinished = finishedGws.filter(gw => gw.stats_synced).length;
      seasonStatus = `Season ${reportSeason} — ${syncedFinished} of ${totalFinished} gameweeks synced`;
    }

    const stillRemaining = remainingUnsynced.length;

    return Response.json({
      success: true,
      bootstrap: bootstrapResult,
      fixtures: fixturesResult,
      gameweeksSynced: succeeded,
      report: {
        attempted,
        succeeded: succeeded.map(s => ({ gameweek: s.gameweek, created: s.created, updated: s.updated, picksUpdated: s.picksUpdated })),
        failed,
        active: activeReport,
        activeDiscrepancy,
        seasonBackfill: { gameweeksUpdated: gwSeasonBackfilled, playerStatsUpdated: statSeasonBackfilled },
        duplicatesDeleted: bootstrapResult.duplicatesDeleted || 0,
        seasonStatus,
        backfill: {
          timeBudgetMs: BACKFILL_TIME_BUDGET_MS,
          elapsedMs: Date.now() - syncStartTime,
          processedThisRun: backfillProcessed,
          stillRemaining,
          remainingGameweeks: remainingUnsynced,
        },
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function fplFetch(path) {
  const resp = await fetch(`${FPL_BASE}${path}`, {
    headers: { 'User-Agent': 'PL-Blackjack/1.0' }
  });
  if (!resp.ok) throw new Error(`FPL API error: ${resp.status}`);
  return resp.json();
}

// fetchAllPlayers is imported from ../../shared/playerQueries.js

function deriveSeason(deadlineStr) {
  if (!deadlineStr) return '';
  const d = new Date(deadlineStr);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  if (month >= 7) {
    return `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
  }
  return `${year - 1}-${String(year % 100).padStart(2, '0')}`;
}

async function syncBootstrap(base44, data) {
  const teams = {};
  data.teams.forEach(t => { teams[t.id] = t; });
  const positionMap = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };

  const existingPlayersRaw = await fetchAllPlayers(base44.asServiceRole.entities);

  // One-time duplicate-player cleanup: an earlier version of the sync could
  // create duplicate Player rows sharing the same fpl_id (before player
  // fetching was fixed to avoid truncation). Group by fpl_id, keep the most
  // recently updated row, and delete the rest — before the upsert logic runs.
  const dupGroups = {};
  existingPlayersRaw.forEach(p => {
    if (!p.fpl_id) return;
    (dupGroups[p.fpl_id] ||= []).push(p);
  });
  const duplicateIdsToDelete = [];
  Object.values(dupGroups).forEach(group => {
    if (group.length <= 1) return;
    group.sort((a, b) => new Date(b.updated_date || 0) - new Date(a.updated_date || 0));
    group.slice(1).forEach(p => duplicateIdsToDelete.push(p.id));
  });
  let duplicatesDeleted = 0;
  for (let i = 0; i < duplicateIdsToDelete.length; i += 500) {
    const batch = duplicateIdsToDelete.slice(i, i + 500);
    await base44.asServiceRole.entities.Player.deleteMany({ id: { $in: batch } });
    duplicatesDeleted += batch.length;
  }
  const deletedIdSet = new Set(duplicateIdsToDelete);
  const existingPlayers = existingPlayersRaw.filter(p => !deletedIdSet.has(p.id));

  const playerMap = {};
  existingPlayers.forEach(p => { if (p.fpl_id) playerMap[p.fpl_id] = p; });

  const playersToCreate = [];
  const playersToUpdate = [];
  data.elements.forEach(el => {
    const team = teams[el.team];
    const playerData = {
      fpl_id: el.id,
      web_name: el.web_name,
      full_name: `${el.first_name} ${el.second_name}`,
      club: team?.name || '',
      club_short: team?.short_name || '',
      club_code: team?.code || 0,
      position: positionMap[el.element_type] || 'MID',
      price: (el.now_cost || 0) / 10,
    };
    if (playerMap[el.id]) {
      playersToUpdate.push({ id: playerMap[el.id].id, ...playerData });
    } else {
      playersToCreate.push(playerData);
    }
  });

  let playersCreated = 0, playersUpdated = 0;
  for (let i = 0; i < playersToCreate.length; i += 500) {
    const batch = playersToCreate.slice(i, i + 500);
    await base44.asServiceRole.entities.Player.bulkCreate(batch);
    playersCreated += batch.length;
  }
  for (let i = 0; i < playersToUpdate.length; i += 500) {
    const batch = playersToUpdate.slice(i, i + 500);
    await base44.asServiceRole.entities.Player.bulkUpdate(batch);
    playersUpdated += batch.length;
  }

  const existingGws = await base44.asServiceRole.entities.Gameweek.list('number', 50);
  const gwMap = {};
  existingGws.forEach(g => { gwMap[g.number] = g; });

  const gwsToCreate = [];
  const gwsToUpdate = [];
  data.events.forEach(ev => {
    const season = deriveSeason(ev.deadline_time);
    if (gwMap[ev.id]) {
      const existing = gwMap[ev.id];
      const update = { id: existing.id, deadline: ev.deadline_time, is_active: ev.is_current || false, season };
      // Season transition: a gameweek row reused across seasons must start
      // fresh — reset stats_synced and is_finalized so stale state from
      // the previous season doesn't leak into the new one.
      if (existing.season && existing.season !== season) {
        update.stats_synced = false;
        update.is_finalized = false;
      }
      gwsToUpdate.push(update);
    } else {
      gwsToCreate.push({ number: ev.id, deadline: ev.deadline_time, is_active: ev.is_current || false, season });
    }
  });

  let gwsCreated = 0, gwsUpdated = 0;
  if (gwsToCreate.length > 0) {
    await base44.asServiceRole.entities.Gameweek.bulkCreate(gwsToCreate);
    gwsCreated = gwsToCreate.length;
  }
  if (gwsToUpdate.length > 0) {
    await base44.asServiceRole.entities.Gameweek.bulkUpdate(gwsToUpdate);
    gwsUpdated = gwsToUpdate.length;
  }

  // Delete stale players not in fresh FPL data
  const freshPlayerIds = new Set(data.elements.map(el => el.id));
  const stalePlayerFplIds = existingPlayers
    .filter(p => p.fpl_id && !freshPlayerIds.has(p.fpl_id))
    .map(p => p.fpl_id);
  let playersDeleted = 0;
  if (stalePlayerFplIds.length > 0) {
    await base44.asServiceRole.entities.Player.deleteMany({ fpl_id: { $in: stalePlayerFplIds } });
    playersDeleted = stalePlayerFplIds.length;
  }

  return { playersCreated, playersUpdated, playersDeleted, duplicatesDeleted, gwsCreated, gwsUpdated };
}

async function syncFixtures(base44, bsData) {
  const fixtures = await fplFetch('/fixtures/');
  const teams = {};
  bsData.teams.forEach(t => { teams[t.id] = t; });

  const players = await fetchAllPlayers(base44.asServiceRole.entities);
  const playerMap = {};
  players.forEach(p => { if (p.fpl_id) playerMap[p.fpl_id] = p; });

  const existing = await base44.asServiceRole.entities.Fixture.list('', 1000);
  const existingMap = {};
  existing.forEach(f => { if (f.fpl_id) existingMap[f.fpl_id] = f; });

  const toCreate = [];
  const toUpdate = [];
  const scorerWarnings = [];
  fixtures.forEach(fx => {
    const homeTeam = teams[fx.team_h];
    const awayTeam = teams[fx.team_a];
    const fxStats = fx.stats || [];
    const goalsEntry = fxStats.find(s => s.identifier === 'goals_scored');
    const ogEntry = fxStats.find(s => s.identifier === 'own_goals');
    const assistsEntry = fxStats.find(s => s.identifier === 'assists');
    const mapStatList = (items, isOG = false) => (items || []).map(item => {
      const player = playerMap[item.element];
      if (!player) {
        const homeName = homeTeam?.name || 'Home';
        const awayName = awayTeam?.name || 'Away';
        scorerWarnings.push(`GW${fx.event || '?'} ${homeName} vs ${awayName}: unmatched player id ${item.element}`);
        return null;
      }
      return { player: player.id, name: player.web_name, count: item.value, is_own_goal: isOG };
    }).filter(Boolean);

    // Normal goals: h → home team, a → away team
    // Own goals: h → away team (home player scored on own goal),
    //            a → home team (away player scored on own goal)
    const homeGoalscorers = [
      ...mapStatList(goalsEntry?.h),
      ...mapStatList(ogEntry?.a, true),
    ];
    const awayGoalscorers = [
      ...mapStatList(goalsEntry?.a),
      ...mapStatList(ogEntry?.h, true),
    ];

    const fixtureData = {
      fpl_id: fx.id,
      gameweek: fx.event || 0,
      home_team: homeTeam?.name || '',
      away_team: awayTeam?.name || '',
      home_team_code: homeTeam?.code || 0,
      away_team_code: awayTeam?.code || 0,
      kickoff_time: fx.kickoff_time || '',
      home_score: fx.team_h_score ?? null,
      away_score: fx.team_a_score ?? null,
      finished: fx.finished || false,
      home_goalscorers: homeGoalscorers,
      away_goalscorers: awayGoalscorers,
      home_assists: mapStatList(assistsEntry?.h),
      away_assists: mapStatList(assistsEntry?.a),
    };

    // Validation: sum attributed goals vs actual scoreline
    if (fx.finished && fx.team_h_score != null && fx.team_a_score != null) {
      const homeAttributed = homeGoalscorers.reduce((sum, g) => sum + g.count, 0);
      const awayAttributed = awayGoalscorers.reduce((sum, g) => sum + g.count, 0);
      if (homeAttributed !== fx.team_h_score || awayAttributed !== fx.team_a_score) {
        const homeName = homeTeam?.name || 'Home';
        const awayName = awayTeam?.name || 'Away';
        const parts = [];
        if (homeAttributed !== fx.team_h_score) parts.push(`${homeAttributed} of ${fx.team_h_score} ${homeName} goals`);
        if (awayAttributed !== fx.team_a_score) parts.push(`${awayAttributed} of ${fx.team_a_score} ${awayName} goals`);
        scorerWarnings.push(`GW${fx.event || '?'} ${homeName} vs ${awayName}: scorer data incomplete — ${parts.join(', ')}`);
      }
    }
    if (existingMap[fx.id]) {
      toUpdate.push({ id: existingMap[fx.id].id, ...fixtureData });
    } else {
      toCreate.push(fixtureData);
    }
  });

  let created = 0, updated = 0;
  for (let i = 0; i < toCreate.length; i += 500) {
    const batch = toCreate.slice(i, i + 500);
    await base44.asServiceRole.entities.Fixture.bulkCreate(batch);
    created += batch.length;
  }
  for (let i = 0; i < toUpdate.length; i += 500) {
    const batch = toUpdate.slice(i, i + 500);
    await base44.asServiceRole.entities.Fixture.bulkUpdate(batch);
    updated += batch.length;
  }

  // Delete stale fixtures not in fresh FPL data
  const freshFixtureIds = new Set(fixtures.map(fx => fx.id));
  const staleFixtureFplIds = existing
    .filter(f => f.fpl_id && !freshFixtureIds.has(f.fpl_id))
    .map(f => f.fpl_id);
  let fixturesDeleted = 0;
  if (staleFixtureFplIds.length > 0) {
    await base44.asServiceRole.entities.Fixture.deleteMany({ fpl_id: { $in: staleFixtureFplIds } });
    fixturesDeleted = staleFixtureFplIds.length;
  }

  return { created, updated, fixturesDeleted, scorerWarnings };
}

async function syncStats(base44, gameweek, season) {
  const configs = await base44.asServiceRole.entities.ScoringConfig.filter({ is_active: true });
  const config = configs[0] || {
    points_per_goal_gk: 10, points_per_goal_def: 6, points_per_goal_mid: 5, points_per_goal_fwd: 4,
    points_per_cleansheet_gk: 4, points_per_cleansheet_def: 4, points_per_cleansheet_mid: 1, points_per_cleansheet_fwd: 0,
    points_per_assist: 2,
    points_per_appearance: 1, points_per_yellow_card: -1, points_per_red_card: -3,
    points_per_defensive_contribution: 2, bust_threshold: 21,
  };

  const players = await fetchAllPlayers(base44.asServiceRole.entities);
  const playerMap = {};
  players.forEach(p => { if (p.fpl_id) playerMap[p.fpl_id] = p; });

  const data = await fplFetch(`/event/${gameweek}/live/`);

  const existing = await base44.asServiceRole.entities.PlayerStat.filter({ gameweek });
  const existingMap = {};
  existing.forEach(s => { if (s.fpl_id) existingMap[s.fpl_id] = s; });

  const toCreate = [];
  const toUpdate = [];
  data.elements.forEach(el => {
    const player = playerMap[el.id];
    if (!player) return;
    const stats = el.stats;
    const goals = stats.goals_scored || 0;
    const assists = stats.assists || 0;
    const cleanSheets = stats.clean_sheets || 0;
    const minutes = stats.minutes || 0;
    const yellowCards = stats.yellow_cards || 0;
    const redCards = stats.red_cards || 0;
    const appearance = minutes > 0 ? 1 : 0;
    const dcHit = (el.explain || []).some(fx =>
      fx.stats && fx.stats.some(s => s.identifier === 'defensive_contribution' && s.points > 0)
    );
    const points = calculatePlayerPoints({
      goals, assists, clean_sheets: cleanSheets, minutes,
      yellow_cards: yellowCards, red_cards: redCards,
      defensive_contribution_hit: dcHit,
      position: player.position,
    }, config);

    const statData = {
      player_id: player.id, player_name: player.web_name, fpl_id: el.id,
      gameweek, season, goals, assists, clean_sheets: cleanSheets, minutes,
      yellow_cards: yellowCards, red_cards: redCards,
      defensive_contribution_hit: dcHit, points,
      position: player.position,
    };
    if (existingMap[el.id]) {
      toUpdate.push({ id: existingMap[el.id].id, ...statData });
    } else {
      toCreate.push(statData);
    }
  });

  let created = 0, updated = 0;
  for (let i = 0; i < toCreate.length; i += 500) {
    const batch = toCreate.slice(i, i + 500);
    await base44.asServiceRole.entities.PlayerStat.bulkCreate(batch);
    created += batch.length;
  }
  for (let i = 0; i < toUpdate.length; i += 500) {
    const batch = toUpdate.slice(i, i + 500);
    await base44.asServiceRole.entities.PlayerStat.bulkUpdate(batch);
    updated += batch.length;
  }

  const updatedStats = await base44.asServiceRole.entities.PlayerStat.filter({ gameweek });
  const statMap = {};
  updatedStats.forEach(s => { statMap[s.player_id] = s; });

  const gwPicks = await base44.asServiceRole.entities.Pick.filter({ gameweek });
  const pickUpdates = gwPicks.map(pick => {
    const pickStats = (pick.player_ids || []).map(pid => statMap[pid]);
    const playerPoints = pickStats.map(stat => calculatePlayerPoints(stat, config));
    const { total, isBust, score, tier, isNatural } = calculatePickTotal(playerPoints, config, pickStats);
    return { id: pick.id, total_points: total, is_bust: isBust, score, tier, is_natural: isNatural };
  });

  if (pickUpdates.length > 0) {
    await base44.asServiceRole.entities.Pick.bulkUpdate(pickUpdates);
  }

  const totalMinutes = data.elements.reduce((sum, el) => sum + ((el.stats && el.stats.minutes) || 0), 0);
  return { created, updated, picksUpdated: pickUpdates.length, hasMatchData: totalMinutes > 0 };
}