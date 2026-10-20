// Public, server-rendered original posts. Never treat a login page or a collapsed post as full text.
import * as cheerio from "cheerio";
import { stripTags } from "../lib/text.ts";
import { sanitizeBody } from "../content/sanitize.ts";
import { parseLooseDate } from "./dates.ts";
import type { Candidate } from "./types.ts";

export function fromWeiboHtml(html: string, base: string): Candidate[] {
  const $ = cheerio.load(html);
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const node of $(".WB_feed_type[mid]").toArray()) {
    const card = $(node);
    // Reposts need the original author's context; this adapter admits original posts only.
    if (card.attr("isforward") === "1" || card.find(".WB_expand").length) continue;
    const date = card.find('[node-type="feed_list_item_date"]').first();
    const href = date.attr("href");
    if (!href) continue;
    let url: URL;
    try { url = new URL(href, base); } catch { continue; }
    if (!/^(www\.)?weibo\.com$/.test(url.hostname) || !/^\/\d+\/[A-Za-z0-9]+$/.test(url.pathname)) continue;
    const canonical = `https://weibo.com${url.pathname}`;
    if (seen.has(canonical)) continue;
    const publishedAt = parseLooseDate(date.attr("title"), "+08:00");
    if (!publishedAt) continue; // Relative labels cannot become today's publication time.
    const full = card.find('[node-type="feed_list_content_full"]').first();
    const content = (full.length ? full : card.find('[node-type="feed_list_content"]').first()).clone();
    const collapsed = content.find('[action-type="fl_unfold"]').length > 0;
    const author = content.attr("nick-name") ?? null;
    content.find('[action-type="fl_unfold"], .W_icon_feedpin').remove();
    content.find("img[alt]").each((_i, img) => { $(img).replaceWith($(img).attr("alt") ?? ""); });
    const bodyHtml = sanitizeBody(content.html() ?? "", canonical);
    const text = stripTags(bodyHtml).replace(/[\u200b-\u200d\ufeff]/g, "").trim();
    if (!text) continue;
    seen.add(canonical);
    out.push({ url: canonical, title: text.slice(0, 140), author, publishedAt,
      excerpt: text.slice(0, 2000), bodyText: collapsed ? null : text,
      bodyHtml: collapsed ? null : bodyHtml, bodyStatus: collapsed ? "pending" : "ok",
      raw: { weiboMid: card.attr("mid"), truncated: collapsed },
    });
  }
  return out;
}
