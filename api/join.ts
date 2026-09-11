import type { VercelRequest, VercelResponse } from "@vercel/node";
import { put } from "@vercel/blob";

/**
 * POST /api/join
 *
 * Receives the "Join the Challenge" form submission from src/main.ts and, when
 * a Blob store is configured, persists it as a JSON object. When no store is
 * configured the client falls back to a mailto: link, so this handler simply
 * reports that storage isn't set up (503) rather than failing hard.
 *
 * Payload shape sent by the client (see initJoinForm() in src/main.ts):
 * {
 *   brandName: string;       // required
 *   storeUrl: string;        // required, http(s) URL
 *   email: string;           // required
 *   platform: string;        // required, <select>
 *   instagram: string;       // optional handle
 *   linkedin: string;        // optional handle
 *   x: string;                // optional handle
 *   logoUrl: string;         // optional URL
 *   tasksCompleted: string[]; // optional, checkbox values
 *   taskCounts: { [taskId]: number }; // optional, per-task repeat counts (e.g. share/referral), 0-10 each
 *   consent: boolean;        // required, must be true
 * }
 *
 * The rendered <form> also carries a hidden honeypot field named "company"
 * (see index.html #field-company). The client already short-circuits and
 * never sends it when filled in, but this handler still accepts an optional
 * `company` key so a bot posting directly to this endpoint (bypassing the
 * browser form) is also caught: any non-empty value is treated as spam and
 * answered with a quiet 200 that stores nothing.
 */

const MAX_BODY_BYTES = 20 * 1024; // ~20KB
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REQUIRED_STRING_FIELDS = ["brandName", "storeUrl", "email", "platform"] as const;
const OPTIONAL_STRING_FIELDS = ["instagram", "linkedin", "x", "logoUrl"] as const;

interface JoinPayload {
  brandName: string;
  storeUrl: string;
  email: string;
  platform: string;
  instagram: string;
  linkedin: string;
  x: string;
  logoUrl: string;
  tasksCompleted: string[];
  /** Per-task repeat counts for tasks with a per-platform/per-referral limit (e.g. { share: 2, referral: 1 }). */
  taskCounts: Record<string, number>;
  consent: boolean;
}

function jsonError(res: VercelResponse, status: number, reason: string): void {
  res.status(status).json({ ok: false, reason });
}

/** Resolve the origin(s) this deployment should treat as "same-origin". */
function allowedOrigins(req: VercelRequest): string[] {
  const host = req.headers.host;
  if (!host) return [];
  return [`https://${host}`, `http://${host}`];
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "entry";
}

/**
 * Validates and narrows an unknown parsed body into a JoinPayload.
 * Returns either { ok: true, data } or { ok: false, reason }.
 */
function validate(body: unknown): { ok: true; data: JoinPayload } | { ok: false; reason: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, reason: "invalid_body" };
  }
  const record = body as Record<string, unknown>;

  for (const field of REQUIRED_STRING_FIELDS) {
    const value = record[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      return { ok: false, reason: `missing_${field}` };
    }
    if (value.length > 500) {
      return { ok: false, reason: `${field}_too_long` };
    }
  }

  const brandName = (record.brandName as string).trim();
  const storeUrl = (record.storeUrl as string).trim();
  const email = (record.email as string).trim();
  const platform = (record.platform as string).trim();

  if (!isHttpUrl(storeUrl)) {
    return { ok: false, reason: "invalid_store_url" };
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return { ok: false, reason: "invalid_email" };
  }

  const optional: Record<string, string> = {};
  for (const field of OPTIONAL_STRING_FIELDS) {
    const value = record[field];
    if (value === undefined || value === null || value === "") {
      optional[field] = "";
      continue;
    }
    if (typeof value !== "string" || value.length > 500) {
      return { ok: false, reason: `invalid_${field}` };
    }
    optional[field] = value.trim();
  }
  if (optional.logoUrl && !isHttpUrl(optional.logoUrl)) {
    return { ok: false, reason: "invalid_logo_url" };
  }

  let tasksCompleted: string[] = [];
  if (record.tasksCompleted !== undefined) {
    if (
      !Array.isArray(record.tasksCompleted) ||
      record.tasksCompleted.some((t) => typeof t !== "string") ||
      record.tasksCompleted.length > 50
    ) {
      return { ok: false, reason: "invalid_tasks_completed" };
    }
    tasksCompleted = record.tasksCompleted as string[];
  }

  let taskCounts: Record<string, number> = {};
  if (record.taskCounts !== undefined) {
    if (typeof record.taskCounts !== "object" || record.taskCounts === null || Array.isArray(record.taskCounts)) {
      return { ok: false, reason: "invalid_task_counts" };
    }
    const rawCounts = record.taskCounts as Record<string, unknown>;
    const keys = Object.keys(rawCounts);
    if (keys.length > 10) {
      return { ok: false, reason: "invalid_task_counts" };
    }
    for (const key of keys) {
      const value = rawCounts[key];
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 10) {
        return { ok: false, reason: "invalid_task_counts" };
      }
      taskCounts[key] = value;
    }
  }

  if (record.consent !== true) {
    return { ok: false, reason: "consent_required" };
  }

  return {
    ok: true,
    data: {
      brandName,
      storeUrl,
      email,
      platform,
      instagram: optional.instagram,
      linkedin: optional.linkedin,
      x: optional.x,
      logoUrl: optional.logoUrl,
      taskCounts,
      tasksCompleted,
      consent: true,
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // --- CORS: same-origin only, never a wildcard. ---
  const origin = req.headers.origin;
  if (typeof origin === "string") {
    if (!allowedOrigins(req).includes(origin)) {
      jsonError(res, 403, "origin_not_allowed");
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    jsonError(res, 405, "method_not_allowed");
    return;
  }

  // --- Body size limit (~20KB). Content-Length is the fast check; the ---
  // --- serialized-length check below catches bodies without a header.  ---
  const contentLength = Number(req.headers["content-length"] ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    jsonError(res, 413, "payload_too_large");
    return;
  }

  let rawBody: unknown = req.body;
  if (typeof rawBody === "string") {
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
      jsonError(res, 413, "payload_too_large");
      return;
    }
    try {
      rawBody = JSON.parse(rawBody);
    } catch {
      jsonError(res, 400, "invalid_json");
      return;
    }
  }

  if (rawBody === undefined || rawBody === null) {
    jsonError(res, 400, "invalid_json");
    return;
  }
  if (Buffer.byteLength(JSON.stringify(rawBody), "utf8") > MAX_BODY_BYTES) {
    jsonError(res, 413, "payload_too_large");
    return;
  }

  const body = rawBody as Record<string, unknown>;

  // --- Honeypot: silently accept without storing. ---
  const honeypot = body.company;
  if (typeof honeypot === "string" && honeypot.trim().length > 0) {
    res.status(200).json({ ok: true });
    return;
  }

  const result = validate(body);
  if (!result.ok) {
    jsonError(res, 400, result.reason);
    return;
  }
  const entry = result.data;

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    res.status(503).json({ ok: false, reason: "storage_not_configured" });
    return;
  }

  const receivedAt = new Date().toISOString();
  const slug = slugify(entry.brandName);
  const pathname = `entries/${receivedAt}-${slug}.json`;

  try {
    const blob = await put(
      pathname,
      JSON.stringify({ ...entry, receivedAt }, null, 2),
      {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
      }
    );
    res.status(200).json({ ok: true, id: blob.pathname });
  } catch (err) {
    // Never leak the token or a stack trace to the client — log server-side only.
    console.error("[api/join] failed to store entry:", err);
    res.status(500).json({ ok: false, reason: "storage_error" });
  }
}
