import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const FPL_BASE = 'https://fantasy.premierleague.com/api';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, gameweek, member_id } = body;

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

    if (action === 'players') {
      return await syncPlayers(base44);
    } else if (action === 'fixtures') {
      return await syncFixtures(base44);
    } else if (action === 'stats') {
      if (!gameweek) return Response.json({ error: 'Gameweek required' }, { status: 400 });
      return await syncStats(base44, gameweek);
    } else {
      return Response.json({ error: 'Invalid action' }, { status: 400 });
    }
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

async function syncPlayers(base44) {
  const data = await fplFetch('/bootstrap-static/');
  const teams = {};
  data.teams.forEach(t => { teams[t.id] = t; });
  const positionMap = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };

  const existing = await base44.asServiceRole.entities.Player.list('', 600);
  const existingMap = {};
  existing.forEach(p => { if (p.fpl_id) existingMap[p.fpl_id] = p; });

  const toCreate = [];
  const toUpdate = [];
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
    if (existingMap[el.id]) {
      toUpdate.push({ id: existingMap[el.id].id, ...playerData });
    } else {
      toCreate.push(playerData);
    }
  });

  let created = 0, updated = 0;
  for (let i = 0; i < toCreate.length; i += 500) {
    const batch = toCreate.slice(i, i + 500);
    await base44.asServiceRole.entities.Player.bulkCreate(batch);
    created += batch.length;
  }
  for (let i = 0; i < toUpdate.length; i += 500) {
    const batch = toUpdate.slice(i, i + 500);
    await base44.asServiceRole.entities.Player.bulkUpdate(batch);
    updated += batch.length;
  }
  return Response.json({ success: true, created, updated, total: data.elements.length });
}

async function syncFixtures(base44) {
  const [fixtures, bsData] = await Promise.all([
    fplFetch('/fixtures/'),
    fplFetch('/bootstrap-static/'),
  ]);
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
  return Response.json({ success: true, created, updated, total: fixtures.length });
}

async function syncStats(base44, gameweek) {
  const configs = await base44.asServiceRole.entities.ScoringConfig.filter({ is_active: true });
  const config = configs[0] || {
    points_per_goal: 3, points_per_assist: 2, points_per_clean_sheet: 2,
    points_per_appearance: 1, points_per_yellow_card: 1, points_per_red_card: 3,
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
    const points =
      goals * (config.points_per_goal || 0) +
      assists * (config.points_per_assist || 0) +
      cleanSheets * (config.points_per_clean_sheet || 0) +
      appearance * (config.points_per_appearance || 0) +
      yellowCards * (config.points_per_yellow_card || 0) +
      redCards * (config.points_per_red_card || 0);

    const statData = {
      player_id: player.id,
      player_name: player.web_name,
      fpl_id: el.id,
      gameweek,
      goals, assists, clean_sheets: cleanSheets, minutes,
      yellow_cards: yellowCards, red_cards: redCards, points,
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
  return Response.json({ success: true, created, updated, gameweek });
}