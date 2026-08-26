import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

/**
 * Deadline reminder.
 *
 * Runs on a schedule, works out whether the active gameweek's deadline is
 * inside the reminder window, and posts a single message to the pool's group
 * chat naming whoever still hasn't picked.
 *
 * Why a webhook rather than push notifications: Base44 has no built-in web
 * push, and rolling our own would mean a service worker plus every member on
 * an iPhone adding the site to their Home Screen before they'd receive
 * anything. A message in the group chat arrives as a phone notification via an
 * app everyone already has, with no per-member setup at all.
 *
 * The body carries BOTH `content` and `text` so the same payload works for a
 * Discord webhook (reads `content`) and a Slack webhook (reads `text`); each
 * ignores the key it doesn't use.
 */

const HOUR = 60 * 60 * 1000;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole.entities;

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { body = {}; }
    const isTest = body.test === true;

    // --- settings ---
    const settingsRows = await svc.PoolSettings.list('', 10);
    const settings = settingsRows.find((s: any) => s.reminder_webhook_url) || settingsRows[0];
    const webhook = settings?.reminder_webhook_url;

    if (!webhook) {
      return Response.json({ sent: false, reason: 'No webhook URL configured' });
    }
    if (!isTest && settings?.reminder_enabled === false) {
      return Response.json({ sent: false, reason: 'Reminders are switched off' });
    }

    // --- the gameweek we might be reminding about ---
    const gameweeks = await svc.Gameweek.list('number', 100);
    const sorted = [...gameweeks].sort((a: any, b: any) => a.number - b.number);
    const active = sorted.find((g: any) => g.is_active) || sorted[sorted.length - 1];

    if (!active) {
      return Response.json({ sent: false, reason: 'No active gameweek' });
    }
    if (!active.deadline) {
      return Response.json({ sent: false, reason: `Gameweek ${active.number} has no deadline set` });
    }

    const deadline = new Date(active.deadline).getTime();
    const msLeft = deadline - Date.now();
    const windowHours = Number(settings?.reminder_hours_before) || 24;

    if (!isTest) {
      if (msLeft <= 0) {
        return Response.json({ sent: false, reason: 'Deadline already passed' });
      }
      if (msLeft > windowHours * HOUR) {
        return Response.json({
          sent: false,
          reason: `Too early — ${Math.round(msLeft / HOUR)}h until deadline, window is ${windowHours}h`,
        });
      }
    }

    // Idempotency: one nudge per gameweek, however often this runs.
    const reminderKey = `${active.season || 'unknown'}:${active.number}`;
    if (!isTest && settings?.last_reminder_key === reminderKey) {
      return Response.json({ sent: false, reason: `Already reminded for ${reminderKey}` });
    }

    // --- who hasn't picked ---
    const [members, picks] = await Promise.all([
      svc.PoolMember.list('', 100),
      active.season
        ? svc.Pick.filter({ gameweek: active.number, season: active.season })
        : svc.Pick.filter({ gameweek: active.number }),
    ]);

    const pickedIds = new Set(
      picks.filter((p: any) => (p.player_ids || []).length > 0).map((p: any) => p.member_id)
    );
    const missing = members.filter((m: any) => !pickedIds.has(m.id));

    if (missing.length === 0 && !isTest) {
      // Everyone's in — mark it done so we don't check again this gameweek.
      if (settings?.id) {
        await svc.PoolSettings.update(settings.id, { last_reminder_key: reminderKey });
      }
      return Response.json({ sent: false, reason: 'Everyone has picked' });
    }

    // --- compose ---
    const hoursLeft = Math.max(0, Math.round(msLeft / HOUR));
    const names = missing.map((m: any) => m.name).filter(Boolean);
    const nameList = names.length <= 1
      ? (names[0] || 'nobody')
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

    let message: string;
    if (isTest) {
      message =
        `PL Blackjack test message. Gameweek ${active.number} locks in ${hoursLeft}h. ` +
        (names.length ? `Still to pick: ${nameList}.` : 'Everyone has picked.');
    } else if (names.length === 0) {
      message = `Gameweek ${active.number} locks in ${hoursLeft}h and everyone's in. Good luck.`;
    } else {
      const verb = names.length === 1 ? 'hasn\'t' : 'haven\'t';
      message =
        `Gameweek ${active.number} locks in ${hoursLeft}h and ${nameList} ${verb} picked yet. ` +
        `Get to 21, don't bust.`;
    }

    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // content -> Discord, text -> Slack. Each ignores the other's key.
      body: JSON.stringify({ content: message, text: message }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return Response.json(
        { sent: false, reason: `Webhook returned ${res.status}`, detail: detail.slice(0, 400) },
        { status: 502 }
      );
    }

    if (!isTest && settings?.id) {
      await svc.PoolSettings.update(settings.id, { last_reminder_key: reminderKey });
    }

    return Response.json({
      sent: true,
      gameweek: active.number,
      hoursLeft,
      missing: names,
      message,
      test: isTest,
    });
  } catch (err) {
    return Response.json({ sent: false, error: (err as Error).message }, { status: 500 });
  }
});
