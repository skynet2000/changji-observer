// Selected and all-news share event grouping, representative choice and publication chronology.
import type { TimelineFilters, TimelineResponse, TimelineCard } from "@aihot/contracts/site";
import { beijingDate, beijingMidnight } from "@aihot/contracts/time";
import { sql } from "../db.ts";
import { cachedByKey } from "../lib/cache.ts";
import { decodeCursor, encodeCursor, InvalidCursorError, queryBinding } from "../lib/cursor.ts";
import { ITEM_COLUMNS, ITEM_FROM, categoryCondition, channelCondition, tagCondition, toFeedItemSummary, type ItemRow } from "./items.ts";
import { foldableSelectionCondition, listedCondition, selectedCondition, ownFactEvidenceCondition } from "./scope.ts";
import { eventEntries } from "./event-entries.ts";

export interface TimelineQuery extends TimelineFilters { cursor?: string | null; limit?: number; now?: Date }
function filterSql(q: TimelineQuery) { return sql`${channelCondition(q.channel)} ${categoryCondition(q.category)} ${tagCondition(q.tag)}`; }
function binding(q: TimelineQuery) { return queryBinding({ c: q.channel, k: q.category, t: q.tag }); }
const groupedAnchors = cachedByKey(binding, (q: TimelineQuery) => queryGroupedAnchors(q, new Date()), { freshMs: 5000, maxStaleMs: 5000, maxKeys: 50 });
async function queryGroupedAnchors(q: TimelineQuery, now: Date) {
  const rows = await sql<{ gk: string; article_id: string; story_id: number | null; anchor_at: Date }[]>`
    WITH ${eventEntries(sql`SELECT p.article_id, 0 AS rel FROM publications p WHERE ${listedCondition(now)} ${filterSql(q)}`)}
    SELECT gk, article_id, story_id, anchor_at FROM entries WHERE selected ORDER BY anchor_at DESC, gk COLLATE "C" DESC`;
  return rows.map(r => ({ gk: r.gk, id: r.article_id, storyId: r.story_id, anchor: r.anchor_at.getTime() }));
}

/** Counts requested Beijing days over anchors already sorted newest first. */
export function countTimelineDays(grouped: readonly { anchor: number }[], days: ReadonlySet<string>): Record<string, number> {
  const firstBelow = (bound: number) => {
    let lo = 0, hi = grouped.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (grouped[mid]!.anchor >= bound) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const counts: Record<string, number> = {};
  for (const day of days) {
    const start = beijingMidnight(day).getTime();
    const count = firstBelow(start) - firstBelow(start + 86_400_000);
    if (count) counts[day] = count;
  }
  return counts;
}

export async function loadTimeline(q: TimelineQuery): Promise<Omit<TimelineResponse, "hot">> {
  const now = q.now ?? new Date(), limit = Math.min(Math.max(q.limit ?? 20, 1), 40), bind = binding(q);
  let after: { a: number; g: string } | null = null;
  if (q.cursor) {
    const c = decodeCursor<{ a: number; g: string; b: string }>("tl4", q.cursor);
    if (c.b !== bind || typeof c.a !== "number" || typeof c.g !== "string") throw new InvalidCursorError("cursor does not match this query");
    after = { a: c.a, g: c.g };
  }
  const grouped = q.now ? await queryGroupedAnchors(q, now) : await groupedAnchors(q);
  const start = after ? grouped.findIndex(g => g.anchor < after!.a || (g.anchor === after!.a && g.gk < after!.g)) : 0;
  const page = start < 0 ? [] : grouped.slice(start, start + limit);
  type Row = ItemRow & { fact_public_id: string | null; story_id: number | null; report_count: number; source_count: number; development_count: number };
  const rows = page.length ? await sql<Row[]>`
    SELECT ${ITEM_COLUMNS}, f.public_id AS fact_public_id, f.story_id, reports.*
    ${ITEM_FROM} LEFT JOIN facts f ON f.id = p.fact_id AND ${ownFactEvidenceCondition()} AND ${foldableSelectionCondition()}
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS report_count, count(DISTINCT p.source_id)::int AS source_count, count(DISTINCT p.fact_id)::int AS development_count
      FROM publications p JOIN facts member_fact ON member_fact.id = p.fact_id
      WHERE (CASE WHEN f.story_id IS NOT NULL THEN member_fact.story_id = f.story_id ELSE p.fact_id = f.id END)
        AND ${ownFactEvidenceCondition()} AND ${listedCondition(now)} ${filterSql(q)}
    ) reports ON true
    WHERE p.article_id IN ${sql(page.map(g => g.id))} AND ${selectedCondition(now)} ${filterSql(q)}` : [];
  const byId = new Map(rows.map(r => [r.id, r]));
  const cards: TimelineCard[] = page.flatMap(g => {
    const r = byId.get(g.id);
    if (!r) return [];
    return [{ key: g.gk, anchorAt: new Date(g.anchor).toISOString(), item: toFeedItemSummary(r),
      group: r.fact_public_id && r.report_count > 1 ? { factId: r.fact_public_id, reportCount: r.report_count,
        additionalSourceCount: r.source_count - 1,
        ...(r.story_id !== null ? { scope: "story" as const, developmentCount: r.development_count } : {}) } : null }];
  });
  const dayCounts = countTimelineDays(grouped, new Set(page.map(g => beijingDate(g.anchor))));
  const last = page.at(-1);
  const nextCursor = start >= 0 && start + limit < grouped.length && last ? encodeCursor("tl4", { a: last.anchor, g: last.gk, b: bind }) : null;
  return { filters: { channel: q.channel, category: q.category, tag: q.tag }, cards, nextCursor, dayCounts };
}
