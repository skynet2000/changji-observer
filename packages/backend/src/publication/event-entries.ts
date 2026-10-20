import { sql } from "../db.ts";
import { reportTime } from "./items.ts";
import { ownFactEvidenceCondition, foldableSelectionCondition } from "./scope.ts";

/** Only confirmed memberships fold; composites, mentions and ungrouped reports stay separate. */
const poolFact = () => sql`CASE WHEN ${ownFactEvidenceCondition()} AND ${foldableSelectionCondition()} THEN p.fact_id END`;
/** Original publication time, with a distinct identity for unconfirmed or composite reports. */
export function eventEntries(candidates: ReturnType<typeof sql>) {
  return sql`candidates AS (${candidates}), matched AS MATERIALIZED (
    SELECT p.article_id, p.selected, p.score, s.tier, c.rel,
      ${reportTime()} AS report_at, (${poolFact()}) AS fact_id,
      CASE WHEN ${ownFactEvidenceCondition()} AND ${foldableSelectionCondition()} THEN f.story_id END AS story_id
    FROM candidates c JOIN publications p ON p.article_id = c.article_id
    JOIN sources s ON s.id = p.source_id LEFT JOIN facts f ON f.id = p.fact_id
  ), dated AS (
    SELECT *, min(report_at) OVER (PARTITION BY coalesce('f' || fact_id::text, 'a' || article_id)) AS fact_at
    FROM matched
  ), entries AS MATERIALIZED (
    SELECT coalesce('s' || story_id::text, 'f' || fact_id::text, 'a' || article_id) AS gk, story_id,
      (array_agg(article_id ORDER BY rel DESC, selected DESC, fact_at DESC, (tier = 'T1') DESC,
        score DESC NULLS LAST, report_at ASC, article_id COLLATE "C" ASC))[1] AS article_id,
      max(fact_at) AS anchor_at, max(rel) AS rel, bool_or(selected) AS selected
    FROM dated GROUP BY gk, story_id
  )`;
}

