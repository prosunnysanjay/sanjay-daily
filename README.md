# Sanjay's Daily

A personal daily-driver app: tasks, timetable, habit/health tracking, projects, job search, business ideas, and motivation — all in one place, backed by Supabase.

## Project structure

```
src/
  components/
    PasswordGate.jsx   — login screen
    Home.jsx            — landing tab: stats, featured quote, navigation
    Daily.jsx           — today's tasks + grouped sections + per-day timetable
    Progress.jsx        — habit streaks + health metric trend charts
    Projects.jsx        — project cards (description, tools, concepts, image)
    Jobs.jsx             — dream companies + freelancing leads
    Earning.jsx          — content/business idea lists
    Motivate.jsx         — featured quote + your collection
  lib/
    supabase.js          — talks to your Supabase table (get/set/delete/list)
    utils.js              — shared helpers: IDs, undo stacks, drag-drop, export/import
  App.jsx                 — tab routing
  main.jsx                — React entry point
  index.css                — all styling (one shared design system)
public/
  manifest.json            — PWA manifest (Add to Home Screen)
  icon-192.png, icon-512.png
.github/workflows/deploy.yml — auto-builds and deploys to GitHub Pages on every push to main
```

Each tab is its own file. To change how the Daily tab works, you only need to open `Daily.jsx` — no hunting through one giant file.

## Local development

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173` with hot-reload.

## Running tests

```bash
npm test
```

26 tests cover every tab: adding/editing/deleting items, undo, reset, drag-drop wiring, and that data actually reaches Supabase.

## Building for production

```bash
npm run build
```

Outputs static files to `dist/`. This is what GitHub Pages serves.

## Deploying

Just `git push` to the `main` branch — the GitHub Actions workflow in `.github/workflows/deploy.yml` builds and deploys automatically. No manual steps.

**First-time setup on GitHub:** go to your repo's Settings → Pages → under "Build and deployment", set Source to "GitHub Actions". After that, every push deploys.

## Configuration you may need to change

- **`vite.config.js`** — the `base` path must match your actual GitHub repo name (`/your-repo-name/`). If you rename the repo, update this.
- **Supabase URL/key** — currently hardcoded in `src/lib/supabase.js` as a fallback, but can be overridden via environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` if you ever want to avoid committing them directly (GitHub Pages doesn't support secret env vars for static sites without extra setup, so for now the fallback values are what actually get used).
- **Password** — set in `src/components/PasswordGate.jsx`. Remember: this ships in the public JS bundle, visible to anyone who looks at dev tools. It's a deterrent, not real security.

## Known limitations

- No real authentication — one shared password, client-side only.
- Supabase free tier pauses projects after 7 days of inactivity — open the Supabase dashboard to unpause if that happens.
- No automatic backups on Supabase's free tier — use the Export button on the Home tab periodically.
- Each browser tab/session re-locks (password) when closed, by design (`sessionStorage`, not `localStorage`).
