import type { Db } from "../db.ts";

export type FailureKind = "quota" | "rate" | "server" | "auth" | "unknown";
interface Health { until: number; failures: number; reason: FailureKind | null; attemptId: number }

export class ProviderCoolingError extends Error {
  readonly service: string;
  readonly retryAfterMs: number;
  readonly reason: FailureKind | "probe";
  constructor(service: string, retryAfterMs: number, reason: FailureKind | "probe") {
    super(`${service} cooling down (${reason})`);
    this.service = service; this.retryAfterMs = retryAfterMs; this.reason = reason;
  }
}

export function failureKind(status: number | null, message: string): FailureKind | null {
  if (status === 434 || status === 429 && /quota|allowance|balance|额度|配额/i.test(message)) return "quota";
  if (status === 429) return "rate";
  if (status === 401 || status === 403) return "auth";
  if (status === null || status >= 500) return "server";
  return null;
}

export function retryAfterMs(value: string | null, now = Date.now()): number | null {
  if (!value?.trim()) return null;
  const n = Number(value);
  const ms = Number.isFinite(n) && n >= 0 ? n * 1000 : Date.parse(value) - now;
  return Number.isFinite(ms) && ms >= 0 ? Math.min(Math.ceil(ms), 86400_000) : null;
}

const keyOf = (scope: string) => `model.health.${scope}`;

// Called under the receipt service lock: all processes agree on the cooldown and recovery probe.
export async function checkModelHealth(tx: Db, service: string, scope: string, concurrency: number): Promise<number> {
  const [clock] = await tx<{ at: Date }[]>`SELECT clock_timestamp() AS at`;
  const now = clock!.at.getTime();
  const [row] = await tx<{ value: Health }[]>`SELECT value FROM settings WHERE key=${keyOf(scope)}`;
  const health = row?.value;
  if (health?.reason && health.until > now) throw new ProviderCoolingError(service, health.until - now, health.reason);
  const [active] = await tx<{ count: number }[]>`SELECT count(*)::int AS count
    FROM receipts r WHERE r.service=${service} AND r.status='pending'
      AND r.request->>'providerScope'=${scope} AND r.updated_at>clock_timestamp()-interval '10 minutes'`;
  if (health?.failures && active!.count > 0) throw new ProviderCoolingError(service, 2000, "probe");
  return active!.count >= concurrency ? 1000 : 0;
}

export async function recordModelHealth(tx: Db, service: string, scope: string, attemptId: number,
  failure?: { kind: FailureKind; retryAfterMs?: number | null }) {
  await tx`SELECT pg_advisory_xact_lock(hashtext(${"budget:" + service}))`;
  const [row] = await tx<{ value: Health }[]>`SELECT value FROM settings WHERE key=${keyOf(scope)}`;
  if (row && row.value.attemptId > attemptId) return; // Older in-flight answers cannot undo a newer rejection.
  if (!failure) {
    // Retain the successful attempt watermark so a late older rejection cannot reopen the circuit.
    const value: Health = { until: 0, failures: 0, reason: null, attemptId };
    await tx`INSERT INTO settings(key,value) VALUES(${keyOf(scope)},${tx.json({ ...value })})
      ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=clock_timestamp()`;
    return;
  }
  const failures = row ? row.value.failures + 1 : 1;
  const base = failure.kind === "quota" || failure.kind === "auth" ? 300_000
    : failure.kind === "unknown" ? 30_000 : failure.kind === "rate" ? 5000 : 2000;
  const ceiling = failure.kind === "quota" || failure.kind === "auth" ? 1800_000 : 60_000;
  const delay = Math.max(failure.retryAfterMs ?? 0, Math.min(ceiling, base * 2 ** Math.min(failures - 1, 8))) + Math.floor(Math.random() * 500);
  const [clock] = await tx<{ at: Date }[]>`SELECT clock_timestamp() AS at`;
  const value: Health = { until: clock!.at.getTime() + delay, failures, reason: failure.kind, attemptId };
  await tx`INSERT INTO settings(key,value) VALUES(${keyOf(scope)},${tx.json({ ...value })})
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=clock_timestamp()`;
}
