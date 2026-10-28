// Reviewed correction for RSS wall-clock values previously interpreted eight hours late.
// The caller must compare the article URL and timestamp with the current source feed first.
import { sql } from "../db.ts";
import { audit, Conflict } from "../audit.ts";
import { stableJson } from "../lib/ids.ts";
import { emit } from "../modules.ts";
import { publishArticleTx } from "../publication/publish.ts";
import { STALE_ON_DISCOVERY_MS } from "../content/materials.ts";
import { correctStorySignalTime } from "../events/corrections.ts";

export async function correctVerifiedRssTime(id: string, input: {
  sourceId: string; url: string; revision: number; oldTime: string; correctedTime: string; requestId: string;
}, actor: string) {
  const old = new Date(input.oldTime), corrected = new Date(input.correctedTime);
  if (!Number.isFinite(+old) || !Number.isFinite(+corrected) || old.toISOString() !== input.oldTime
      || corrected.toISOString() !== input.correctedTime || +old - +corrected !== 8 * 3600_000)
    throw new Conflict("时间不是可核对的八小时时区偏差");
  return sql.begin(async tx => {
    const [a] = await tx<{ source_id:string; url:string; revision:number; published_at:Date|null; published_at_claim:Date|null;
      discovered_at:Date; timeline_at:Date; kind:string; offset:string|null }[]>`
      SELECT a.source_id,a.url,a.revision,a.published_at,a.published_at_claim,a.discovered_at,a.timeline_at,
        s.kind,s.config->>'publishedAtUtcOffset' AS offset FROM articles a JOIN sources s ON s.id=a.source_id
      WHERE a.id=${id} FOR UPDATE OF a`;
    if (!a) throw new Conflict("报道不存在");
    const [prior] = await tx`SELECT 1 FROM audit_log WHERE subject=${`content:${id}`}
      AND action='content.correct-rss-timezone' AND actor=${actor} AND request_id=${input.requestId}`;
    if (prior && a.published_at?.toISOString() === input.correctedTime) return { status:"unchanged" as const };
    if (a.source_id !== input.sourceId || a.url !== input.url || a.revision !== input.revision || a.kind !== "rss"
        || a.offset !== "+08:00" || a.published_at?.toISOString() !== input.oldTime
        || a.published_at_claim?.toISOString() !== input.oldTime || +corrected > +a.discovered_at || +corrected > Date.now())
      throw new Conflict("来源、版本或原时间已变化，请重新核验");
    if ((+a.discovered_at - +old > STALE_ON_DISCOVERY_MS) !== (+a.discovered_at - +corrected > STALE_ON_DISCOVERY_MS))
      throw new Conflict("更正会跨越历史回填边界，需单独复核");
    const [previous] = await tx<{ decision:unknown }[]>`SELECT to_jsonb(p)-ARRAY['published_at','timeline_at','sort_at','revision','updated_at'] AS decision
      FROM publications p WHERE article_id=${id}`;
    const timeline = +a.timeline_at === +old ? corrected : a.timeline_at;
    await tx`UPDATE articles SET published_at=${corrected}, published_at_claim=${corrected}, timeline_at=${timeline},updated_at=now() WHERE id=${id}`;
    const storyIds = await correctStorySignalTime(tx,id,old,corrected);
    if (previous) {
      await publishArticleTx(tx,id);
      const [next] = await tx<{ decision:unknown }[]>`SELECT to_jsonb(p)-ARRAY['published_at','timeline_at','sort_at','revision','updated_at'] AS decision
        FROM publications p WHERE article_id=${id}`;
      if (stableJson(previous.decision) !== stableJson(next?.decision)) throw new Conflict("日期更正不能改变公开内容或选稿决定");
      await emit("articleChanged", {id,kind:"content",reason:"verified RSS timezone correction",previousStoryIds:storyIds}, tx);
    }
    await audit(actor,"content.correct-rss-timezone",`content:${id}`,"核对 RSS 原始时间与原文均采用北京时间，纠正无时区时间被按 UTC 解析。",
      {publishedAt:input.oldTime,timelineAt:a.timeline_at.toISOString()},
      {publishedAt:input.correctedTime,timelineAt:timeline.toISOString(),sourceId:input.sourceId,url:input.url,stories:storyIds},
      {db:tx,requestId:input.requestId});
    return {status:"corrected" as const, stories:storyIds.length};
  });
}
