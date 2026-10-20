// Text for a site's alternative-language presentation. It has the same public scope as the pages;
// report prose is read after withdrawn citations have been removed by loadReport.
import { sql } from "../db.ts";
import { listedCondition, selectedCondition, storyReportCondition } from "./scope.ts";
import { loadReport } from "./reports.ts";

const textKeys = new Set(["title", "summary", "reason", "label", "leadParagraph", "overview", "caption", "heading"]);
export function collectPublicText(value: unknown, into = new Set<string>()): Set<string> {
  if (!value || typeof value !== "object") return into;
  if ("available" in value && value.available === false) return into;
  for (const [key, part] of Object.entries(value)) {
    if (textKeys.has(key) && typeof part === "string" && /\p{Script=Han}/u.test(part)) into.add(part);
    else if (part && typeof part === "object") collectPublicText(part, into);
  }
  return into;
}

export async function publicTextValues(wanted?: readonly string[]): Promise<string[]> {
  const texts = new Set<string>();
  // New reports first, then newest items: history backfill never delays today's translations.
  for (const kind of ["daily", "weekly", "monthly"] as const) {
    const rows = await sql`SELECT key, content FROM reports WHERE kind=${kind} ORDER BY key DESC`;
    for (const row of rows) {
      if (wanted && ![...collectPublicText(row.content)].some(text => wanted.includes(text))) continue;
      collectPublicText(await loadReport(kind, row.key), texts);
    }
  }
  const now = new Date();
  const rows = await sql`SELECT p.title, p.summary, p.reason, st.title AS story_title
    FROM publications p JOIN sources s ON s.id=p.source_id
    LEFT JOIN stories st ON st.id=p.story_id AND st.merged_into IS NULL
    WHERE ((${listedCondition(now)}) OR (${selectedCondition(now)}) OR (${storyReportCondition(now)} AND p.story_id IS NOT NULL))
    ${wanted ? sql`AND (p.title=ANY(${[...wanted]}::text[]) OR p.summary=ANY(${[...wanted]}::text[])
      OR p.reason=ANY(${[...wanted]}::text[]) OR st.title=ANY(${[...wanted]}::text[]))` : sql``}
    ORDER BY p.timeline_at DESC`;
  for (const row of rows) {
    collectPublicText(row, texts);
    if (typeof row.story_title === "string" && /\p{Script=Han}/u.test(row.story_title)) texts.add(row.story_title);
  }
  return wanted ? [...texts].filter(text => wanted.includes(text)) : [...texts];
}
