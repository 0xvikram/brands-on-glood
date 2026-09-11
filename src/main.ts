import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";

import { TASKS, ROUND, MAX_POINTS, MAX_POINTS_WITHOUT_BONUS, computePoints } from "./data/rules";
import leaderboardData from "./data/leaderboard.json";
import type { HeroBrand } from "./scene/hero";

interface LeaderboardEntry {
  rank: number;
  name: string;
  slug: string;
  storeUrl: string;
  logo: string;
  color: string;
  verified: Record<string, number>;
}

const entries = leaderboardData as LeaderboardEntry[];

/* ---------------------------------------------------------------------- */
/* Nav: mobile toggle + smooth scroll + close-on-link-click                */
/* ---------------------------------------------------------------------- */

function initNav(): void {
  const nav = document.getElementById("site-nav");
  const toggle = document.getElementById("nav-toggle");
  const links = document.getElementById("nav-links");

  if (!nav || !toggle || !links) return;

  const closeMenu = () => {
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  };

  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  links.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", closeMenu);
  });

  document.addEventListener("click", (event) => {
    if (!nav.contains(event.target as Node)) closeMenu();
  });

  document.querySelectorAll<HTMLAnchorElement>("a[data-scroll]").forEach((a) => {
    a.addEventListener("click", (event) => {
      const targetId = a.getAttribute("href");
      if (!targetId || !targetId.startsWith("#")) return;
      const target = document.querySelector(targetId);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

/* ---------------------------------------------------------------------- */
/* Leaderboard                                                             */
/* ---------------------------------------------------------------------- */

function formatPoints(points: number): string {
  return `${points.toLocaleString("en-IN")} pts`;
}

function taskLabelById(id: string): string {
  return TASKS.find((t) => t.id === id)?.label ?? id;
}

interface RankedEntry {
  entry: LeaderboardEntry;
  points: number;
}

function renderLeaderboard(): RankedEntry[] {
  const ranked = [...entries]
    .map((entry) => ({ entry, points: computePoints(entry.verified) }))
    .sort((a, b) => b.points - a.points);

  const grid = document.getElementById("leaderboard-grid");
  const tableBody = document.getElementById("leaderboard-table-body");

  if (grid) {
    grid.innerHTML = ranked
      .map(({ entry, points }, index) => {
        const rank = index + 1;
        return `
          <div class="leaderboard-tile" data-rank="${rank}" data-slug="${entry.slug}">
            <div class="leaderboard-tile__rank">${rank}</div>
            <div class="leaderboard-tile__logo">
              <img src="${entry.logo}" alt="${entry.name} logo" loading="lazy" width="140" height="44" />
            </div>
            <div class="leaderboard-tile__points">${formatPoints(points)}</div>
            <span class="leaderboard-tile__name">${entry.name}</span>
          </div>
        `;
      })
      .join("");
  }

  if (tableBody) {
    tableBody.innerHTML = ranked
      .map(({ entry, points }, index) => {
        const rank = index + 1;
        const taskPills = Object.entries(entry.verified)
          .filter(([, count]) => count > 0)
          .map(([id, count]) => {
            const label = taskLabelById(id);
            return `<span class="task-pill">${label}${count > 1 ? ` ×${count}` : ""}</span>`;
          })
          .join("");

        return `
          <tr>
            <td>#${rank}</td>
            <td>${entry.name}</td>
            <td>${formatPoints(points)}</td>
            <td>${taskPills}</td>
            <td><a href="${entry.storeUrl}" target="_blank" rel="noopener">Visit store ↗</a></td>
          </tr>
        `;
      })
      .join("");
  }

  return ranked;
}

function initLeaderboardToggle(): void {
  const button = document.getElementById("toggle-leaderboard-table");
  const wrap = document.getElementById("leaderboard-table-wrap");
  if (!button || !wrap) return;

  button.addEventListener("click", () => {
    const isHidden = wrap.hasAttribute("hidden");
    if (isHidden) {
      wrap.removeAttribute("hidden");
      button.setAttribute("aria-expanded", "true");
      button.textContent = "Hide full leaderboard ↑";
    } else {
      wrap.setAttribute("hidden", "");
      button.setAttribute("aria-expanded", "false");
      button.textContent = "View full leaderboard →";
    }
  });
}

/* ---------------------------------------------------------------------- */
/* Rules: schedule text + points table                                    */
/* ---------------------------------------------------------------------- */

function renderRules(): void {
  const scheduleEl = document.getElementById("rules-schedule-text");
  if (scheduleEl) {
    scheduleEl.textContent = `Entries open ${ROUND.entriesOpen} and close ${ROUND.entriesClose}. The featured week runs ${ROUND.featuredStart} – ${ROUND.featuredEnd} on glood.ai, our social headers, and one dedicated post per brand on Instagram, LinkedIn and X.`;
  }

  const pointsBody = document.getElementById("rules-points-body");
  if (pointsBody) {
    pointsBody.innerHTML = TASKS.map(
      (task) => `
        <tr>
          <td>${task.label}</td>
          <td class="points-col">${task.points}</td>
          <td class="limit-col">${task.limitText}</td>
        </tr>
      `
    ).join("");
  }

  const foot = document.getElementById("points-table-foot");
  if (foot) {
    foot.textContent = `Maximum from tasks: ${MAX_POINTS_WITHOUT_BONUS.toLocaleString(
      "en-IN"
    )} points, plus the ${TASKS.find((t) => t.id === "creative_bonus")?.points ?? 0}-point weekly creative bonus (up to ${MAX_POINTS.toLocaleString(
      "en-IN"
    )} total).`;
  }

  updatePointsTableHint();
  window.addEventListener("resize", updatePointsTableHint);
}

/** Shows the "swipe to see all columns" hint only if the table still overflows at this width. */
function updatePointsTableHint(): void {
  const wrap = document.querySelector<HTMLElement>(".points-table-wrap");
  const hint = document.querySelector<HTMLElement>(".points-table-hint");
  if (!wrap || !hint) return;
  hint.classList.toggle("is-visible", wrap.scrollWidth > wrap.clientWidth + 1);
}

/* ---------------------------------------------------------------------- */
/* Join form: task checklist                                              */
/* ---------------------------------------------------------------------- */

function renderChecklist(): void {
  const checklist = document.getElementById("task-checklist");
  if (!checklist) return;

  checklist.innerHTML = TASKS.map((task) => {
    const hint = `(+${task.points} pt${task.points === 1 ? "" : "s"}${
      task.maxCount > 1 ? `, ${task.limitText}` : ""
    })`;

    if (task.maxCount > 1) {
      const options = Array.from({ length: task.maxCount + 1 }, (_, n) => n)
        .map((n) => `<option value="${n}">${n}</option>`)
        .join("");
      return `
        <div class="checklist-row checklist-row--count" data-task-id="${task.id}" data-points="${task.points}">
          <label for="taskcount-${task.id}">${task.label} <span class="hint">${hint}</span></label>
          <select id="taskcount-${task.id}" name="taskCount_${task.id}" aria-label="Number of times completed: ${task.label}">
            ${options}
          </select>
        </div>
      `;
    }

    return `
      <label class="checkbox-row" data-task-id="${task.id}" data-points="${task.points}">
        <input type="checkbox" name="tasks" value="${task.id}" />
        <span>${task.label} <span class="hint">${hint}</span></span>
      </label>
    `;
  }).join("");

  updateChecklistTotal();
  checklist.addEventListener("change", updateChecklistTotal);
}

/** Recomputes and displays the "points you'd earn" total from the live checklist state. */
function updateChecklistTotal(): void {
  const checklist = document.getElementById("task-checklist");
  const totalEl = document.getElementById("checklist-total");
  if (!checklist || !totalEl) return;

  let total = 0;
  checklist.querySelectorAll<HTMLElement>("[data-task-id]").forEach((row) => {
    const points = Number(row.dataset.points ?? 0);
    const checkbox = row.querySelector<HTMLInputElement>('input[type="checkbox"]');
    const select = row.querySelector<HTMLSelectElement>("select");
    if (checkbox) {
      if (checkbox.checked) total += points;
    } else if (select) {
      total += points * Number(select.value || 0);
    }
  });

  totalEl.innerHTML = `Points you'd earn: <strong>${total.toLocaleString("en-IN")}</strong>`;
}

/** Reads the current taskCounts (share/referral-style tasks) off the checklist. */
function readTaskCounts(): Record<string, number> {
  const checklist = document.getElementById("task-checklist");
  const counts: Record<string, number> = {};
  if (!checklist) return counts;

  checklist.querySelectorAll<HTMLSelectElement>(".checklist-row--count select").forEach((select) => {
    const row = select.closest<HTMLElement>("[data-task-id]");
    const taskId = row?.dataset.taskId;
    const value = Number(select.value || 0);
    if (taskId && value > 0) counts[taskId] = value;
  });

  return counts;
}

/* ---------------------------------------------------------------------- */
/* Join form: submission                                                  */
/* ---------------------------------------------------------------------- */

function buildMailtoFallback(payload: Record<string, unknown>): string {
  const subject = encodeURIComponent(`Brands on Glood entry — ${payload.brandName ?? ""}`);
  const lines = Object.entries(payload)
    .filter(([key]) => key !== "company")
    .map(([key, value]) => {
      if (Array.isArray(value)) return `${key}: ${value.join(", ") || "none"}`;
      if (value && typeof value === "object") {
        const pairs = Object.entries(value as Record<string, unknown>).map(([k, v]) => `${k}=${v}`);
        return `${key}: ${pairs.join(", ") || "none"}`;
      }
      return `${key}: ${value ?? ""}`;
    });
  const body = encodeURIComponent(
    `Hi Glood team,\n\nI'd like to join the Brands on Glood challenge. Here are my details:\n\n${lines.join(
      "\n"
    )}\n\n(This was sent because the join form couldn't reach the server — please confirm receipt.)`
  );
  return `mailto:hello@glood.ai?subject=${subject}&body=${body}`;
}

function initJoinForm(): void {
  const form = document.getElementById("join-form") as HTMLFormElement | null;
  const successEl = document.getElementById("form-success");
  const errorEl = document.getElementById("form-error");
  const submitBtn = document.getElementById("join-submit") as HTMLButtonElement | null;
  if (!form || !successEl || !errorEl) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    successEl.hidden = true;
    errorEl.hidden = true;

    const formData = new FormData(form);

    // Honeypot: bots fill hidden fields. Pretend success without submitting anywhere.
    if (String(formData.get("company") ?? "").trim().length > 0) {
      successEl.hidden = false;
      successEl.textContent = "Thanks! Your entry has been received.";
      form.reset();
      return;
    }

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const payload = {
      brandName: String(formData.get("brandName") ?? ""),
      storeUrl: String(formData.get("storeUrl") ?? ""),
      email: String(formData.get("email") ?? ""),
      platform: String(formData.get("platform") ?? ""),
      instagram: String(formData.get("instagram") ?? ""),
      linkedin: String(formData.get("linkedin") ?? ""),
      x: String(formData.get("x") ?? ""),
      logoUrl: String(formData.get("logoUrl") ?? ""),
      tasksCompleted: formData.getAll("tasks").map(String),
      taskCounts: readTaskCounts(),
      consent: formData.get("consent") === "on",
    };

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting…";
    }

    try {
      const response = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

      successEl.hidden = false;
      successEl.textContent =
        "Thanks! Your entry has been received. We'll verify your tasks within 48 hours and email you a confirmation.";
      form.reset();
    } catch {
      const mailto = buildMailtoFallback(payload);
      errorEl.hidden = false;
      errorEl.innerHTML = `We couldn't reach the server just now. No worries — <a href="${mailto}">click here to send us your entry by email</a> instead, and we'll take it from there.`;
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Entry";
      }
    }
  });
}

/* ---------------------------------------------------------------------- */
/* FAQ                                                                     */
/* ---------------------------------------------------------------------- */

function renderFaq(): void {
  const container = document.getElementById("faq-accordion");
  if (!container) return;

  const shareTask = TASKS.find((t) => t.id === "share");
  const referralTask = TASKS.find((t) => t.id === "referral");

  const faqItems: { question: string; answer: string }[] = [
    {
      question: "Who can participate?",
      answer:
        "Any live online store, Shopify or otherwise, with a public storefront. One entry per store, and you must own the rights to any logo you submit. Glood staff, agencies working for Glood, and their stores are excluded.",
    },
    {
      question: "How are points awarded?",
      answer: `Points come from completing tasks such as joining the challenge, installing Glood's free plan, sharing the campaign, and more. Every task is one-time unless noted — for example sharing counts ${shareTask ? `${shareTask.limitText}` : "per platform, up to a cap"}, and referrals count ${referralTask ? referralTask.limitText : "up to a cap"}. Points are added only after Glood verifies the task.`,
    },
    {
      question: "How long will my brand be featured?",
      answer: `Top 10 brands are featured for one full week, from ${ROUND.featuredStart} to ${ROUND.featuredEnd}, on glood.ai, our social headers, and one dedicated post per brand on Instagram, LinkedIn and X.`,
    },
    {
      question: "Is there a cost to participate?",
      answer:
        "No. No purchase or payment is required or accepted to enter or win the challenge.",
    },
    {
      question: "How do I submit proof for a task?",
      answer:
        "Submit links via the join form when you enter, or reply to the confirmation email afterwards. Glood verifies submissions within 48 hours; unverified tasks count for zero points.",
    },
    {
      question: "What happens if there's a tie?",
      answer:
        "Ties go to whichever store reached that point total first, based on our verification timestamps.",
    },
    {
      question: "Can I use purchased followers or fake engagement?",
      answer:
        "No. Purchased followers or engagement, multiple entries for one store, offensive or misleading content, and logos you don't own will all get an entry removed. Shopify App Store reviews also earn no points, since Shopify prohibits incentivised reviews.",
    },
  ];

  container.innerHTML = faqItems
    .map(
      (item, index) => `
        <details class="faq-item" ${index === 0 ? "open" : ""}>
          <summary>${item.question}</summary>
          <p>${item.answer}</p>
        </details>
      `
    )
    .join("");
}

/* ---------------------------------------------------------------------- */
/* Hero 3D scene: lazy-loaded so three.js doesn't bloat the main bundle    */
/* ---------------------------------------------------------------------- */

function mountHeroScene(ranked: RankedEntry[]): void {
  const container = document.getElementById("hero-scene");
  if (!container) return;

  const brands: HeroBrand[] = ranked.map(({ entry, points }, index) => ({
    rank: index + 1,
    name: entry.name,
    slug: entry.slug,
    logo: entry.logo,
    points,
    storeUrl: entry.storeUrl,
    color: entry.color,
  }));

  import("./scene/hero")
    .then(({ mountHero }) => mountHero(container, brands))
    .catch((err) => console.warn("[hero] failed to load 3D scene module:", err));
}

/* ---------------------------------------------------------------------- */
/* Boot                                                                    */
/* ---------------------------------------------------------------------- */

function boot(): void {
  initNav();
  const ranked = renderLeaderboard();
  initLeaderboardToggle();
  renderRules();
  renderChecklist();
  initJoinForm();
  renderFaq();
  mountHeroScene(ranked);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
