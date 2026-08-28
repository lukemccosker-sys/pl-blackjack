# See AGENTS.md

Follow the instructions in `AGENTS.md`.

## Architecture notes

Conventions worth knowing before changing things.

### Data fetching

All shared data goes through **`src/lib/queries.js`** (React Query). Do not add
`useState` + `useEffect` + `.subscribe()` fetching to a page — that pattern is
what made five pages each pull the whole season of `PlayerStat` rows
independently and refetch on every subscription event.

- `useActiveGameweek()`, `useScoringConfig()`, `usePlayers()`, `useMembers()`,
  `useFixtures()`, `usePicks()`, `useSeasonStats(season)`.
- `useEntitySync()` is mounted once in `Layout` and turns entity subscriptions
  into cache invalidations. Nothing else should subscribe.
- Season stats/picks are supersets of a gameweek's — derive "this gameweek" by
  filtering the cached season data, never by issuing another query.
- Pot records (`PotEntry`/`PotWeek`/`PotContribution`) stay on local state in
  `PotPanel`; they're small and mutated in place.

### Scoring

`base44/shared/scoring.js` is the single source of truth, imported by both the
client (`src/lib/scoring.js` re-exports it) and the sync function. Never
duplicate the maths.

- `src/lib/pot.js` — pot settlement. Ties split the pot; splitting happens in
  integer cents so shares always add back to the total.
- `src/lib/teamOfTheWeek.js` — searches over distinct *point values*, not a
  truncated list of top scorers. An earlier version capped the pool at the top
  30, which made 4- and 5-card blackjacks mathematically unreachable.
- `src/lib/playerForm.js` — club strength derived from finished fixtures,
  player form in pool points, and the picker's suggestion ranking.

### Known data-model gaps

- **`Fixture` has no `season` field.** Gameweek numbers repeat every year, so
  `filterFixturesToSeason()` in `playerForm.js` windows fixtures by the
  season's gameweek deadlines. `Fixture.list('', 500)` in `Fixtures.jsx` will
  truncate once there's more than one season of data.
- **Auth is a custom PIN layer** (`PoolMember.pin`, plaintext) on top of a
  Base44 client with `requiresAuth: false`. There is one real Base44 `User`
  (the owner), so **RLS cannot distinguish members** and entity access is
  effectively open. Picks are readable before the deadline and writable after
  it; this is a known, accepted trade-off for a small private pool. Backend
  functions gate on a `member_id` passed in the request body, which is
  spoofable — don't build anything security-critical on it.

### Gotcha: deleting files

The sandbox auto-commits as "External agent changes", but that only reliably
picks up files touched through the platform's own write path. A bare `rm` can
be left unstaged, and the file reappears when the sandbox is rebuilt from the
last commit. After deleting anything, run `git add -A` and confirm with
`git status --porcelain` that the tree is clean.

### UI conventions

- Mobile first; `Layout` constrains to `max-w-lg` and pins the profile avatar
  top-right. Use `PageHeader` for page titles — it reserves that corner.
- **Safe areas matter.** Installed to the Home Screen the app runs full-bleed
  (`viewport-fit=cover` plus a translucent status bar), so anything at the top
  or bottom edge lands under the system clock/battery or the home indicator.
  Use the `pt-safe` / `pb-safe` / `top-safe` / `pb-nav` / `pb-sheet` /
  `above-nav` helpers in `index.css` rather than raw `top-4` or `pb-20` on
  fixed or absolutely-positioned chrome.
- Tap targets are 44px minimum. Use `SegmentedControl` for view switches.
- Page view state belongs in the URL via `useUrlState`, so the phone back
  button and back-swipe work.
- Four bottom-nav tabs: Home, Picks, Standings, Football (Fixtures + Stats).
  Admin lives behind the avatar in Settings.

### Backend functions

`base44/functions/<name>/entry.ts` with an optional `function.jsonc` for cron.

- `syncFplData` — runs every 30 min via cron; `function_args.member_id` must be
  an admin `PoolMember` id or the schedule silently stops working.
- `remindPickers` — daily deadline nudge to a group-chat webhook. Posts
  `{content, text}` so one payload works for both Discord and Slack.
  `PoolSettings.last_reminder_key` keeps it to one message per gameweek.
