import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const FPL_BASE = 'https://fantasy.premierleague.com/api';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
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

    const activeGw = gameweeks.find(g => g.is_active);
    const currentSeason = activeGw?.season;
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
        activeReport = { gameweek: activeGw.number, synced: true, finalized: allFinished };
      } catch (err) {
        activeReport = { gameweek: activeGw.number, synced: false, error: err.message };
      }
    }

    // 2. Backfill stats for every OTHER finished gameweek in the current
    //    season that hasn't been marked stats_synced yet. Each gameweek is
    //    wrapped in its own try/catch so one failure doesn't block the rest.
    //    Cap at 3 gameweeks per sync run to avoid timeouts — press Sync
    //    again to continue from the next unsynced gameweek.
    const MAX_BACKFILL_PER_RUN = 3;
    let backfillProcessed = 0;
    const remainingUnsynced = [];
    for (const gw of gameweeks) {
      if (gw.stats_synced) continue;
      if (activeGw && gw.number === activeGw.number) continue;
      if (currentSeason && gw.season !== currentSeason) continue;
      const gwFixtures = allFixtures.filter(f => f.gameweek === gw.number);
      if (gwFixtures.length === 0) continue;
      if (!gwFixtures.every(f => f.finished)) continue;

      if (backfillProcessed >= MAX_BACKFILL_PER_RUN) {
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
        seasonBackfill: { gameweeksUpdated: gwSeasonBackfilled, playerStatsUpdated: statSeasonBackfilled },
        seasonStatus,
        backfill: {
          maxPerRun: MAX_BACKFILL_PER_RUN,
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

  const existingPlayers = await base44.asServiceRole.entities.Player.list('', 600);
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
      gwsToUpdate.push({ id: gwMap[ev.id].id, deadline: ev.deadline_time, is_active: ev.is_current || false, season });
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

  return { playersCreated, playersUpdated, playersDeleted, gwsCreated, gwsUpdated };
}

async function syncFixtures(base44, bsData) {
  const fixtures = await fplFetch('/fixtures/');
  const teams = {};
  bsData.teams.forEach(t => { teams[t.id] = t; });

  const existing = await base44.asServiceRole.entities.Fixture.list('', 1000);
  const existingMap = {};
  existing.forEach(f => { if (f.fpl_id) existingMap[f.fpl_id] = f; });

  const toCreate = [];
  const toUpdate = [];
  fixtures.forEach(fx => {
    const homeTeam = teams[fx.team_h];
    const awayTeam = teams[fx.team_a];
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
    };
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

  return { created, updated, fixturesDeleted };
}

async function syncStats(base44, gameweek, season) {
  const configs = await base44.asServiceRole.entities.ScoringConfig.filter({ is_active: true });
  const config = configs[0] || {
    points_per_goal: 3, points_per_assist: 2, points_per_clean_sheet: 2,
    points_per_appearance: 1, points_per_yellow_card: -1, points_per_red_card: -3,
    points_per_defensive_contribution: 2, bust_threshold: 21,
  };

  const players = await base44.asServiceRole.entities.Player.list('', 600);
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
    const points =
      goals * (config.points_per_goal || 0) +
      assists * (config.points_per_assist || 0) +
      cleanSheets * (config.points_per_clean_sheet || 0) +
      appearance * (config.points_per_appearance || 0) +
      yellowCards * (config.points_per_yellow_card || 0) +
      redCards * (config.points_per_red_card || 0) +
      (dcHit ? (config.points_per_defensive_contribution || 0) : 0);

    const statData = {
      player_id: player.id, player_name: player.web_name, fpl_id: el.id,
      gameweek, season, goals, assists, clean_sheets: cleanSheets, minutes,
      yellow_cards: yellowCards, red_cards: redCards,
      defensive_contribution_hit: dcHit, points,
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
    const points = (pick.player_ids || []).map(pid => {
      const stat = statMap[pid];
      if (!stat) return 0;
      const appearance = stat.minutes > 0 ? 1 : 0;
      return (
        (stat.goals || 0) * (config.points_per_goal || 0) +
        (stat.assists || 0) * (config.points_per_assist || 0) +
        (stat.clean_sheets || 0) * (config.points_per_clean_sheet || 0) +
        appearance * (config.points_per_appearance || 0) +
        (stat.yellow_cards || 0) * (config.points_per_yellow_card || 0) +
        (stat.red_cards || 0) * (config.points_per_red_card || 0) +
        (stat.defensive_contribution_hit ? (config.points_per_defensive_contribution || 0) : 0)
      );
    });
    const total = points.reduce((sum, p) => sum + (p || 0), 0);
    const threshold = config?.bust_threshold || 21;
    const bonus = config?.blackjack_bonus || 10;
    let tier, score;
    if (total > threshold) {
      tier = 'bust';
      score = 0;
    } else if (total === threshold) {
      tier = 'blackjack';
      score = total + bonus;
    } else {
      tier = 'safe';
      score = total;
    }
    const isBust = tier === 'bust';
    return { id: pick.id, total_points: total, is_bust: isBust, score, tier };
  });

  if (pickUpdates.length > 0) {
    await base44.asServiceRole.entities.Pick.bulkUpdate(pickUpdates);
  }

  return { created, updated, picksUpdated: pickUpdates.length };
}