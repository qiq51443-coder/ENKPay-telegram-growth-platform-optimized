/**
 * PeriodService — Server-side authoritative period calculation.
 *
 * A "period" is a fixed-length time slot aligned to UTC midnight.
 * Period 1 of the day starts at 00:00:00 UTC, period 2 starts at
 * durationSeconds later, etc.
 *
 * All timestamps are Unix milliseconds (ms).
 */

export interface PeriodInfo {
  /** 1-indexed period number within the current UTC day */
  periodNumber: number;
  /** UTC midnight timestamp (ms) for the current day */
  dayStartMs: number;
  /** Period start timestamp (ms) */
  periodStartMs: number;
  /** Period end timestamp (ms) — exclusive upper bound */
  periodEndMs: number;
  /** Human-readable label: YYYYMMDD-NNN (e.g. "20260321-042") */
  periodLabel: string;
  /** Milliseconds remaining until this period ends */
  remainingMs: number;
}

/**
 * Calculate the current period for a given duration.
 *
 * @param durationSeconds - Period length in seconds (e.g. 60, 300, 600)
 * @param nowMs           - Current time in Unix ms (defaults to Date.now())
 */
export function getCurrentPeriod(durationSeconds: number, nowMs: number = Date.now()): PeriodInfo {
  const durationMs = durationSeconds * 1000;
  const dayStartMs = Math.floor(nowMs / 86_400_000) * 86_400_000;
  const elapsedMs = nowMs - dayStartMs;
  const periodNumber = Math.floor(elapsedMs / durationMs) + 1; // 1-indexed
  const periodStartMs = dayStartMs + (periodNumber - 1) * durationMs;
  const periodEndMs = periodStartMs + durationMs;

  const d = new Date(dayStartMs);
  const dateStamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  const periodLabel = `${dateStamp}-${String(periodNumber).padStart(3, '0')}`;

  return {
    periodNumber,
    dayStartMs,
    periodStartMs,
    periodEndMs,
    periodLabel,
    remainingMs: periodEndMs - nowMs,
  };
}

/**
 * Calculate the NEXT period (the one users are about to bet on).
 * This is what should be used when placing a new order near a period boundary.
 */
export function getNextPeriod(durationSeconds: number, nowMs: number = Date.now()): PeriodInfo {
  const current = getCurrentPeriod(durationSeconds, nowMs);
  return getCurrentPeriod(durationSeconds, current.periodEndMs + 1);
}

/**
 * Resolve a period from a client-supplied period_start timestamp (ms).
 *
 * Validates that the period_start falls within an acceptable window
 * (current period OR next period). Throws if it's too far in the past or future.
 *
 * @param clientPeriodStartMs - Client-supplied period start (ms)
 * @param durationSeconds     - Period length in seconds
 * @param nowMs               - Current server time (ms)
 * @returns Resolved PeriodInfo for the period the client requested
 */
export function resolvePeriodFromClient(
  clientPeriodStartMs: number,
  durationSeconds: number,
  nowMs: number = Date.now()
): PeriodInfo {
  const durationMs = durationSeconds * 1000;
  const toleranceMs = 60_000; // 60s tolerance for clock skew (increased from 30s)

  // Snap the client timestamp to the nearest period boundary
  const dayStartMs = Math.floor(clientPeriodStartMs / 86_400_000) * 86_400_000;
  const elapsedMs = clientPeriodStartMs - dayStartMs;
  const periodNumber = Math.floor(elapsedMs / durationMs) + 1;
  const snappedPeriodStartMs = dayStartMs + (periodNumber - 1) * durationMs;

  // Verify the snapped period is within acceptable range
  const current = getCurrentPeriod(durationSeconds, nowMs);
  const minAllowed = current.periodStartMs - toleranceMs;
  const maxAllowed = current.periodEndMs + durationMs + toleranceMs; // allow up to next period

  if (snappedPeriodStartMs < minAllowed || snappedPeriodStartMs > maxAllowed) {
    const diffMs = snappedPeriodStartMs - nowMs;
    throw Object.assign(
      new Error(`period_start is out of acceptable range (diff: ${diffMs}ms)`),
      { statusCode: 400, code: 'PERIOD_OUT_OF_RANGE' }
    );
  }

  const d = new Date(dayStartMs);
  const dateStamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  const periodLabel = `${dateStamp}-${String(periodNumber).padStart(3, '0')}`;
  const periodEndMs = snappedPeriodStartMs + durationMs;

  return {
    periodNumber,
    dayStartMs,
    periodStartMs: snappedPeriodStartMs,
    periodEndMs,
    periodLabel,
    remainingMs: periodEndMs - nowMs,
  };
}

/**
 * Resolve period purely from a period_label string (format: YYYYMMDD-NNN).
 * This is useful as a fallback when period_start is not provided.
 *
 * @param periodLabel     - e.g. "20260321-042"
 * @param durationSeconds - Period length in seconds
 * @param nowMs           - Current server time (ms)
 */
export function resolvePeriodFromLabel(
  periodLabel: string,
  durationSeconds: number,
  nowMs: number = Date.now()
): PeriodInfo | null {
  const match = periodLabel.match(/^(\d{4})(\d{2})(\d{2})-(\d{3})$/);
  if (!match) return null;

  const [, yyyy, mm, dd, nnn] = match;
  const dayStartMs = Date.UTC(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
  const periodNumber = parseInt(nnn);
  const durationMs = durationSeconds * 1000;
  const periodStartMs = dayStartMs + (periodNumber - 1) * durationMs;
  const periodEndMs = periodStartMs + durationMs;

  const toleranceMs = 120_000; // 2 min tolerance
  if (periodStartMs < nowMs - toleranceMs || periodStartMs > nowMs + 2 * durationMs + toleranceMs) {
    return null; // out of range
  }

  return {
    periodNumber,
    dayStartMs,
    periodStartMs,
    periodEndMs,
    periodLabel,
    remainingMs: Math.max(0, periodEndMs - nowMs),
  };
}
