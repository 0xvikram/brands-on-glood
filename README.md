# Brands on Glood

A campaign landing page for **Brands on Glood**: store brands complete marketing
tasks, earn points, and the top 10 on the leaderboard get their logo placed as
a sticker on a 3D `glood.ai` wordmark for one week across the site and socials.
No purchase or payment is required or accepted.

Built with Vite + vanilla TypeScript + Three.js — no framework, single page,
hash-anchor navigation.

## Local development

```bash
pnpm i
pnpm dev
```

This starts the Vite dev server. The `/api/join` serverless function is not
served by `pnpm dev` (that's Vite only) — use `vercel dev` instead if you need
to exercise the form end-to-end locally, after running `vercel link` and
`vercel env pull` (see below).

## Build

```bash
pnpm build
```

Type-checks with `tsc -b` and builds the static site into `dist/`. The
`api/` serverless function has its own `api/tsconfig.json` (checked separately
with `pnpm exec tsc --noEmit -p api`) since it targets the Node runtime rather
than the browser.

## Deploy

The project deploys to [Vercel](https://vercel.com) as a static site (`dist/`)
plus one serverless function (`api/join.ts`):

```bash
vercel --prod
```

`vercel.json` sets the build command, output directory, and long-lived cache
headers for `/assets/*` (immutable, hashed by Vite) and `/brands/*.svg` (1 day).

## Updating the leaderboard

The leaderboard is a hand-verified, hand-edited data file — there is no
automated task verification yet (see Next steps).

1. Edit `src/data/leaderboard.json`. Each entry has a `verified` map of task
   id → completed count (e.g. `{ "join": 1, "share": 2 }`).
2. Task ids, point values, and per-task limits live in `src/data/rules.ts`
   (`TASKS`) — this is the single source of truth for the rules section, the
   FAQ, the join-form checklist, and the points math. Never hardcode a point
   value anywhere else.
3. Points shown on the page are always **computed** from `verified` via
   `computePoints()` in `src/data/rules.ts`, never typed in directly, so the
   leaderboard and the rules table can't drift apart.

## Enabling the join-form storage (Vercel Blob)

The "Join the Challenge" form posts to `POST /api/join`. If a Blob store
isn't configured, the endpoint returns `503 { ok: false, reason:
"storage_not_configured" }` and the client shows a `mailto:hello@glood.ai`
fallback with the entry prefilled — the form still works end-to-end, just
without automatic storage.

To enable storage:

1. Create a Blob store, either in the Vercel dashboard (Storage → Create →
   Blob) or via the CLI:
   ```bash
   vercel link
   vercel blob store add brands-on-glood
   ```
2. Pull the resulting `BLOB_READ_WRITE_TOKEN` into your local env:
   ```bash
   vercel env pull
   ```
3. Redeploy (`vercel --prod`) so the production function also has the token.

See `.env.example` for the expected variable name.

### Reading stored entries

Each verified submission is stored as a private JSON blob at
`entries/<ISO timestamp>-<brand-slug>.json`. List or fetch them with:

```bash
vercel blob list
```

or browse the store in the Vercel dashboard (Storage → your store → Browser).
Entries are stored with `access: "private"`, so they aren't reachable by
guessing a URL — reading them requires the `BLOB_READ_WRITE_TOKEN` (or the
dashboard).

## Next steps

- Replace the 10 fictional brand entries and SVG wordmarks in
  `src/data/leaderboard.json` / `public/brands/` with real entrants as they join.
- Replace the campaign-target stats in the "A bigger stage" section (50K+
  visitors, 100K+ followers, 10 brands weekly) with real numbers once available.
- Automated task verification (currently manual, within 48 hours per the rules).
- An admin UI for editing leaderboard entries and verified tasks instead of
  hand-editing `leaderboard.json`.
- Email notifications on submission and on verification.
- Analytics on the campaign page and join funnel.
