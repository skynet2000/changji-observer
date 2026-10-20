import { addDays, beijingDate, beijingTime } from "@aihot/contracts/time";
import { EDITION_TIMES } from "@aihot/site";
import { sql } from "../db.ts";

/** First edition with live material in its window; initial archive imports do not start a daily. */
export async function firstDailyDate(): Promise<string | null> {
  const [row] = await sql<{ report: string | null; live: Date | null }[]>`
    SELECT (SELECT min(key) FROM reports WHERE kind = 'daily') AS report,
      (SELECT min(a.discovered_at) FROM articles a JOIN sources s ON s.id = a.source_id
       WHERE NOT a.backfill AND s.participation_mode = 'editorial') AS live`;
  const live = row!.live;
  const date = live && addDays(beijingDate(live), beijingTime(live) < EDITION_TIMES.daily ? 0 : 1);
  return [row!.report, date].filter((d): d is string => d !== null).sort()[0] ?? null;
}
