# Project Tracker System

Mober's Project Tracker System. Track every project in one place: owners, tasks, progress, and the Monday review.

- **Portfolio**: all projects with health, progress, on-schedule %, overdue and blocked counts, and whose weekly review is missing.
- **Project**: tasks by week, an overview dashboard, the weekly review, and settings (owner, sponsor, team).
- **People**: everyone who has signed in. Admins set roles.

Sign-in is by email link, limited to @mober.ph addresses.

---

## Setup — one step at a time

### Step 1. Create the database
1. Open https://supabase.com/dashboard and click **New project**.
2. Name it `project-tracker-system`, choose region **Singapore**, set a database password, click **Create**.
3. Wait about 2 minutes until it is ready.

### Step 2. Add the tables
1. In the left menu click **SQL Editor**, then **New query**.
2. Open `supabase/schema.sql` from this folder, copy everything, paste it, click **Run**.
3. New query again. Paste `supabase/seed.sql`, click **Run**. This adds Tony's ORD onboarding project with its 30 tasks.

### Step 3. Connect the app
1. In Supabase click **Project Settings → API**.
2. Copy **Project URL** and the **anon public** key.
3. Open `config.js` and paste them in place of `YOUR-PROJECT-REF` and `YOUR-ANON-KEY`.

### Step 4. Put it on GitHub
1. Go to https://github.com/new. Name it `project-tracker-system`. Click **Create repository**.
2. Upload this whole folder (drag the files onto the page), then **Commit changes**.

### Step 5. Turn on the website
1. In the repository click **Settings → Pages**.
2. Under **Branch** choose `main` and `/ (root)`, click **Save**.
3. After a minute the address appears at the top, like `https://<your-account>.github.io/project-tracker-system/`.

### Step 6. Allow sign-in from that address
1. In Supabase click **Authentication → URL Configuration**.
2. Set **Site URL** to your GitHub Pages address from Step 5. Add the same address under **Redirect URLs**. Save.

### Step 7. Sign in first
Open the website and sign in with your @mober.ph email. **The first person to sign in becomes admin**, so do this before anyone else.

### Step 8. Invite the team
Send the link to Tiny, Tony and the others. After Tony signs in, open the ORD project → **Settings** → set **Owner** to Tony.

---

## Working on it with Claude Code
Open this folder in Claude Code. `CLAUDE.md` explains the structure, rules and backlog.

## Files
| File | What it is |
|---|---|
| `index.html` | The page |
| `config.js` | Supabase address and key |
| `assets/app.js` | All app logic |
| `assets/styles.css` | Look and feel |
| `supabase/schema.sql` | Tables and access rules |
| `supabase/seed.sql` | First project (ORD Workforce Onboarding) |
| `docs/SPEC.md` | What the system does and why |
