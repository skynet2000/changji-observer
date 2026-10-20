// Original text for server-side corpus analysis. Callers publish aggregates, never these bodies.
// Reads the same current publication scope as the site's lists, including withdrawals and embargoes.
import { sql } from "../db.ts";
import { listedCondition } from "./scope.ts";

export interface CorpusDocument {
  id: string;
  factId: number | null;
  sourceId: string;
  title: string;
  url: string;
  publishedAt: Date;
  text: string;
}

export async function publishedCorpus(sourceIds: string[], since: Date, now = new Date(), limit = 10000): Promise<CorpusDocument[]> {
  return sql<CorpusDocument[]>`
    SELECT p.article_id AS id, p.fact_id AS "factId", p.source_id AS "sourceId",
      a.title, p.url, p.published_at AS "publishedAt", a.body_text AS text
    FROM publications p JOIN articles a ON a.id = p.article_id
    WHERE ${listedCondition(now)} AND p.source_id = ANY(${sourceIds}::text[])
      AND p.published_at >= ${since} AND p.published_at <= ${now}
      AND length(trim(coalesce(a.body_text, ''))) > 0
    ORDER BY p.published_at DESC, p.article_id DESC LIMIT ${limit}`;
}
