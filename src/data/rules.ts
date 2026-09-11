// Single source of truth for the points table, the FAQ, the rules section,
// the leaderboard math, and the join form's task checklist.
// Nothing outside this file should hardcode a point value, a limit, or a date.

export interface Task {
  /** Stable id used as the key in leaderboard.json's `verified` map and in form field names. */
  id: string;
  /** Short label used in the checklist, table and form. */
  label: string;
  /** A slightly longer description, used in the rules section list. */
  description: string;
  /** Points awarded per verified completion. */
  points: number;
  /** Maximum number of times this task can be verified per store. */
  maxCount: number;
  /** Human-readable limit, shown in the points table. */
  limitText: string;
}

export const TASKS: Task[] = [
  {
    id: "join",
    label: "Join the challenge with store details",
    description: "Submit your store name, URL and contact email via the join form.",
    points: 50,
    maxCount: 1,
    limitText: "once",
  },
  {
    id: "install",
    label: "Install the Glood free plan on your store",
    description: "Add Glood's free plan to your storefront — no card required.",
    points: 150,
    maxCount: 1,
    limitText: "once",
  },
  {
    id: "share",
    label: "Share the campaign post and tag @glood_ai",
    description: "Repost or share the campaign announcement and tag @glood_ai.",
    points: 100,
    maxCount: 3,
    limitText: "per platform, max 3 (Instagram, LinkedIn, X)",
  },
  {
    id: "logo_mock",
    label: "Post a mock of your logo on the Glood 3D logo",
    description: "Share a mock-up of your brand's sticker on the glood.ai 3D wordmark.",
    points: 100,
    maxCount: 1,
    limitText: "once",
  },
  {
    id: "referral",
    label: "Refer a store that joins and is verified",
    description: "Invite another store owner — points land once their entry is verified.",
    points: 150,
    maxCount: 5,
    limitText: "max 5",
  },
  {
    id: "roast",
    label: "Run Roast My Store and share the score",
    description: "Run Glood's free Roast My Store report and share the result.",
    points: 75,
    maxCount: 1,
    limitText: "once",
  },
  {
    id: "demo",
    label: "Book and attend a Glood demo call",
    description: "Book a live walkthrough with the Glood team and attend it.",
    points: 200,
    maxCount: 1,
    limitText: "once",
  },
  {
    id: "growth_story",
    label: "Publish a growth-story post about your store (150+ words)",
    description: "Write and publish a 150+ word post about your growth story with Glood.",
    points: 100,
    maxCount: 1,
    limitText: "once",
  },
  {
    id: "creative_bonus",
    label: "Creative bonus, judged weekly for the best post",
    description: "Glood's team picks one standout post each week for a bonus.",
    points: 250,
    maxCount: 1,
    limitText: "one winner per week",
  },
];

/** Sum of points if a single store maxed out every task. Computed, never hardcoded. */
export const MAX_POINTS = TASKS.reduce((sum, t) => sum + t.points * t.maxCount, 0);

/** Sum of points from every task except the judged creative bonus — the "guaranteed" ceiling. */
export const MAX_POINTS_WITHOUT_BONUS = TASKS.filter((t) => t.id !== "creative_bonus").reduce(
  (sum, t) => sum + t.points * t.maxCount,
  0
);

export interface RoundSchedule {
  entriesOpen: string;
  entriesClose: string;
  featuredStart: string;
  featuredEnd: string;
}

export const ROUND: RoundSchedule = {
  entriesOpen: "Mon 15 Sep 2026, 00:00 IST",
  entriesClose: "Sun 28 Sep 2026, 23:59 IST",
  featuredStart: "Mon 5 Oct 2026",
  featuredEnd: "Sun 11 Oct 2026",
};

/** Compute total verified points for a brand from its `verified` task-id -> count map. */
export function computePoints(verified: Record<string, number>): number {
  return TASKS.reduce((sum, task) => {
    const rawCount = verified[task.id] ?? 0;
    const cappedCount = Math.min(rawCount, task.maxCount);
    return sum + cappedCount * task.points;
  }, 0);
}
