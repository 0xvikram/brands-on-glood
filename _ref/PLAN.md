# Brands on Glood — landing page, 3D sticker logo, competition rules, deploy

## Context

Glood.ai wants a "Brands on Glood" campaign page (mock supplied by Vikram): store brands complete marketing tasks, earn points, and the top 10 on the leaderboard get their logo placed as a sticker on a 3D glood.ai wordmark for one week across the site and socials. No money changes hands. The earlier claude.ai artifact (bidding on letter counters) is dropped. Deliverable by morning: a public, fully responsive, deployed link with a refined working 3D hero, ten dedicated sticker spots, published competition rules, a live top‑10 leaderboard, and a working "Join the Challenge" form, with the code in a GitHub repo.

Constraints (from memory + machine): $0 tooling, no third‑party OAuth signups; 6.7 GB RAM laptop with ~1.6 GB free, so agents run sequentially and the build stays light. Vercel CLI is logged in (account singhvikram90200), `gh` is logged in as 0xvikram, wrangler is absent → deploy on **Vercel**.

## Decisions

- **Stack**: Vite + vanilla TypeScript + Three.js (npm ESM). No framework. Single page, hash anchors. CSS custom properties, Google Fonts `Plus Jakarta Sans` (matches the mock's type). Palette from the mock and brand: teal `#014458`, deep navy text `#0B3A47`, coral accent `#E8674A`, page ground `#F7FAFB`, mist `#E3F0F2`, warm tint `#FBEFEA` for the leaderboard band.
- **Brands shown**: 10 **fictional** store brands with original SVG wordmarks in `public/brands/`. The mock uses Nike/Levi's etc.; real trademarks presented as competitors would be misleading and a legal problem. Spots 9–10 can show "Your brand here?" placeholders if fewer than 10 fictional entries look better; all 10 spots exist in the scene regardless.
- **Leaderboard data**: static `src/data/leaderboard.json` committed to the repo (rank, brand, points, logo, store URL, verified tasks). Glood verifies tasks manually per the rules, so a hand‑edited JSON is the honest v1 source of truth. Points on the page are computed from the verified task list, never typed in.
- **Join form**: `POST /api/join` Vercel serverless function (`api/join.ts`). Stores entries in **Vercel Blob** (first‑party, hobby free allowance) when `BLOB_READ_WRITE_TOKEN` exists; otherwise returns 503 and the UI shows a `mailto:hello@glood.ai` fallback with the entry prefilled. Honeypot + basic validation. During execution try `vercel blob store add brands-on-glood` and `vercel env pull`; if the CLI cannot create a store, ship with the fallback and say so in the handoff.
- **Second 3D visual** ("A Bigger Stage" section): rendered once from the same WebGL renderer with a second camera into a 2D `<canvas>` via `drawImage`, so the page has exactly one WebGL context.
- **Repo**: `github.com/0xvikram/brands-on-glood`, default branch `main`. Vercel project `brands-on-glood`, production URL `brands-on-glood.vercel.app`. Commits carry the session attribution lines.

## Page sections (in order, per mock)

1. **Nav**: glood.ai wordmark, links (The Challenge, How it works, Leaderboard, Rules, FAQ), "Join the Challenge" button. Sticky, collapses to a menu under 860px.
2. **Hero**: eyebrow "Brands on Glood", H1 "Your brand could be on Glood next.", lede, two CTAs (Join / How it works), three proof chips. Right: the 3D scene. Hand‑drawn "Your brand here?" annotation and "Real brands. Real growth." caption. Hero stacks with scene under text on mobile.
3. **How it works**: three numbered cards (Complete tasks → Climb the leaderboard → Get featured). Numbering is real sequence.
4. **Live leaderboard**: warm band, 10 tiles (rank medal, logo, points), "View full leaderboard" expands a table with verified tasks per brand. Data from `leaderboard.json`.
5. **Rules of the challenge**: the full rules below, as scannable groups with a points table. This section is new versus the mock and required by Vikram.
6. **A bigger stage**: copy + stats (50K+ visitors, 100K+ followers, 10 brands weekly — mark as campaign targets, not claims, unless Vikram supplies real numbers) + the second 3D render.
7. **Why participate**: four benefit cards.
8. **CTA band**: "Ready to put your brand on Glood?" + join form modal/inline.
9. **FAQ**: accordion, 6–8 questions, answers consistent with the rules.
10. **Footer**: wordmark, tagline, links, socials.

## Competition rules (content to publish verbatim‑ish)

**Eligibility.** Any live online store (Shopify or otherwise) with a public storefront. One entry per store. You must own the rights to the logo you submit and grant Glood a one‑week licence to display it. Glood staff, agencies working for Glood, and their stores are excluded.

**Round 1 schedule.** Entries open Mon 15 Sep 2026 00:00 IST, close Sun 28 Sep 2026 23:59 IST. Featured week: Mon 5 Oct – Sun 11 Oct 2026 on glood.ai, social headers, and one dedicated post per brand on Instagram, LinkedIn and X.

**Winning.** The top 10 by verified points at close take the 10 spots. Rank decides the spot: #1 is the top‑centre sticker, then clockwise. Ties go to whoever reached the score first.

**Points (one‑time unless stated).**

| Task | Points | Limit |
|---|---|---|
| Join the challenge with store details | 50 | once |
| Install the Glood free plan on your store | 150 | once |
| Share the campaign post and tag @glood_ai | 100 | per platform, max 3 (IG, LinkedIn, X) |
| Post a mock of your logo on the Glood 3D logo | 100 | once |
| Refer a store that joins and is verified | 150 | max 5 |
| Run Roast My Store and share the score | 75 | once |
| Book and attend a Glood demo call | 200 | once |
| Publish a growth‑story post about your store (150+ words) | 100 | once |
| Creative bonus, judged weekly for the best post | 250 | one winner per week |

Maximum from tasks: 1,925 plus bonuses.

**Verification.** Submit links via the join form or the follow‑up email. Glood verifies within 48 hours; unverified tasks count for zero. Leaderboard updates daily.

**Not allowed.** Purchased followers or engagement, multiple entries for one store, offensive or misleading content, or logos you do not own. Any of these removes the entry. **Shopify App Store reviews earn no points**, because Shopify prohibits incentivised reviews.

**The fine print.** No purchase or payment is required or accepted. Glood's decisions on verification and disputes are final. Glood may edit the schedule with notice on this page.

## 3D hero specification (the part that must be refined)

- **Geometry**: extrude the real glood.ai wordmark (SVG paths already fetched: `/tmp/…/scratchpad/wordmark.svg`, viewBox 141×48) with `SVGLoader` + `ExtrudeGeometry`, depth ≈ 9, bevel on, high `curveSegments`. Add the ".ai" dot and letters as part of the same group.
- **Material/look** (match mock: white glossy letters on a soft light ground): `MeshPhysicalMaterial` white, clearcoat 1, roughness 0.25, env map from `RoomEnvironment` via PMREM. Soft contact shadow under the logo (shadow‑catching plane with `ShadowMaterial`, PCFSoft). Subtle key light warm, fill cool, rim.
- **Stickers**: 10 `RoundedBoxGeometry` tiles (three/examples), white frosted with a slight tilt toward the camera, front face carrying the brand SVG rasterised to a `CanvasTexture` at 512px. Arranged on an ellipse around the wordmark, #1 top‑centre then clockwise, each tile at a slightly different depth and gentle float (`sin` offset). Empty spots show a dashed tile with "Your brand here?".
- **Interaction**: limited `OrbitControls` (no zoom/pan, azimuth ±35°, polar ±15°), slow auto‑rotate, mouse parallax when idle, hover lifts a tile and shows a tooltip (brand, rank, points), click scrolls to that leaderboard row. Touch drag works.
- **Performance/robustness**: DPR capped at 1.5, render loop paused when the hero is offscreen (IntersectionObserver) or the tab hidden, `prefers-reduced-motion` disables auto‑rotate and float, WebGL‑unavailable fallback shows a pre‑rendered PNG (`public/hero-fallback.png`, captured during build QA). Total three.js chunk tree‑shaken; no post‑processing.
- **Responsiveness**: scene canvas is `aspect-ratio: 5/4` on mobile and 1/1 to 4/3 on desktop, `max-width:100%`; camera FOV/zoom fitted to the wordmark bounds on resize so it never crops.

## Repo layout

```
brands-on-glood/
  index.html
  src/main.ts            page boot, sections, form, FAQ, nav
  src/scene/hero.ts      3D scene, stickers, interaction, fallback
  src/scene/wordmark.ts  SVG path constants → shapes
  src/data/leaderboard.json
  src/data/rules.ts      tasks + points table (single source for section, FAQ, form)
  src/styles/*.css
  public/brands/*.svg    10 fictional brand marks
  public/hero-fallback.png
  api/join.ts            Vercel function → Blob (or 503)
  vercel.json, package.json, tsconfig.json, README.md
```

## Execution workflow (Sonnet builds, Fable reviews, in a loop)

Agents run **one at a time** (RAM). Each build agent is `Agent(subagent_type: general-purpose, model: sonnet)` with a precise brief and the repo path; Fable (this session) reviews by reading the diff, running `pnpm build`, and taking Playwright screenshots at 390, 768 and 1440 px. First step installs the Chromium runtime for screenshots: `npx playwright install chromium` (one‑time, ~150 MB).

1. **Scaffold + static sections** (Sonnet): Vite TS project, all sections with real copy, styles, nav, FAQ, rules table from `rules.ts`, leaderboard from JSON, form UI, 10 fictional brand SVGs. `pnpm build` passes.
   → Fable review: layout at three widths, copy vs rules, a11y basics (focus states, labels, contrast). Findings go back to a Sonnet fix pass.
2. **3D hero** (Sonnet): implement `hero.ts` to the spec above, plus the second‑view render and fallback PNG capture.
   → Fable review: screenshot the hero at three widths, check tiles readable, no cropping, FPS sane (log `renderer.info`), reduced‑motion path, offscreen pause, WebGL fallback by forcing it. Fix pass.
3. **API + deploy** (Sonnet): `api/join.ts`, `vercel.json`, README. Create GitHub repo (`gh repo create 0xvikram/brands-on-glood --public --source . --push`), `vercel link`, try Blob store creation, `vercel --prod`.
   → Fable review: hit the production URL with Playwright at three widths, submit the form once (test entry, then note it), confirm 200/503 path, Lighthouse‑style sanity (no console errors, images sized).
4. **Polish loop**: repeat review→fix until a review pass yields no blocking findings (target ≥2 clean cycles), then final commit + push + `vercel --prod`.
5. **Handoff**: final message with the live URL, repo URL, what is verified, Blob status, and the two things Vikram should replace (fictional brands → real entrants; target stats → real numbers).

## Verification

- `pnpm build` clean, no TypeScript errors.
- Playwright screenshots of the **live** URL at 390/768/1440 saved to the scratchpad; hero visible above the fold at every width, no horizontal scroll.
- Console has no errors on load; WebGL fallback verified by disabling WebGL in one run.
- Leaderboard sums match `rules.ts` values; rules section, FAQ and form list the same tasks.
- Form: successful POST returns 200 with Blob configured, or 503 with the mailto fallback shown.
- Repo pushed, Vercel production deployment tied to the pushed commit.

## Out of scope tonight

Real brand logos, automated task verification, admin UI for editing points, email notifications, analytics. These are listed in the README as next steps.
