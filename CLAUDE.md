# Project Tracker System — notes for Claude Code

## What this is
One place to track every Mober project: owner, tasks, progress, weekly review.
Built for Dennis Ng (CEO), Tiny (COO), Mandy (CFO) and project owners such as Tony Velhagen (Head of Operations Readiness).
Org rule: **one source of truth**. Don't create a second copy of project data anywhere (no localStorage records, no spreadsheets synced by hand).

## Stack
- Static site: `index.html`, `config.js`, `assets/app.js`, `assets/styles.css`. No build step, no framework. Hosted on GitHub Pages.
- Supabase: Postgres + Auth (email magic link) + Realtime. Schema in `supabase/schema.sql`, first project in `supabase/seed.sql`.
- The only external script is `@supabase/supabase-js@2.45.4` (UMD, jsDelivr). Keep versions pinned.

## Data model (see supabase/schema.sql)
- `profiles` — one per signed-in person. `role`: admin | member. First sign-in becomes admin.
- `projects` — name, code, goal, owner_id, sponsor_id, status (planning/active/on_hold/done), health (green/amber/red), start/end dates.
- `project_members` — extra people on a project; role editor | viewer.
- `tasks` — project_id, title, workstream, partner (free text), assignee_id, due_date, status (todo/doing/blocked/done), kind (task/output/milestone/review), note, done_at (set by trigger).
- `reviews` — one per project per week (`week_of` = Monday). Saving a review sets the project's health.

## Access rules
- Read: anyone signed in with an allowed email domain (`is_staff()`; domains also in `config.js`).
- Edit tasks/reviews: admin, project owner, sponsor, creator, or member with role editor (`can_edit_project`).
- Edit project details/members: admin, owner, sponsor, creator (`can_manage_project`). Delete project: admin only.
- The UI mirrors these rules in `canEdit` / `canManage`, but the database is the authority.

## App structure (assets/app.js)
- Hash routes: `#/` portfolio, `#/new`, `#/people`, `#/p/<id>/{tasks|overview|reviews|settings}`.
- All data loads once into `S` then stays live through one Realtime channel.
- Views render with template strings. Always pass user text through `esc()`.

## Conventions
- Mober terms: GDS (driver), GDA (helper), ORD (Operations Readiness Department), D-1 (day before deployment), T12 (absence notice 12h before call time), MBR (EV assignment number).
- Brand colors: navy #002c6b, green #77c129, yellow #ffc200. Fonts: Montserrat (headings), Source Sans 3 (body).
- Light and dark mode via tokens in `styles.css`. Keep phone width (390px) working with no sideways scroll.
- Dates are local `YYYY-MM-DD` strings; weeks start Monday. Timezone is Asia/Manila.
- Schema changes: add a new file `supabase/migrations/NNN_name.sql`, never edit live tables by hand. Keep `schema.sql` re-runnable.

## Testing
- `node --check assets/app.js` for syntax.
- Database: run `schema.sql` twice on a local Postgres with a stub `auth` schema to prove it is re-runnable and the rules hold.

## Next up (backlog)
1. Plan templates: load a list of planned tasks into a project and add them one at a time, like the Plan tab in Tony's first tracker.
2. Monday email to owners whose project has no review this week (Supabase scheduled function).
3. Task comments and an activity log.
4. CSV export of the portfolio.
5. Link projects to MoberOne modules once the moberx API is ready.
