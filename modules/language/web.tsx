import { useEffect, useSyncExternalStore } from "react";
import type { WebModule } from "@aihot/web/modules";
import { useLocation } from "react-router";
import { englishUi } from "./ui.ts";
import patterns from "./ui-patterns.json";

let locale: "zh" | "en" = "zh";
let version = 0;
const listeners = new Set<() => void>();
const translations = new Map<string, string>();
const missing = new Set<string>();
const queued = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;
let pending = false;
const emit = () => { version++; for (const listener of listeners) listener(); };
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export function useLocale() { useSyncExternalStore(subscribe, () => version, () => 0); return locale; }
function setLocale(value: "zh" | "en") {
  locale = value;
  document.documentElement.lang = value === "en" ? "en" : "zh-CN";
  emit();
}
async function flush() {
  timer = undefined;
  if (pending || locale !== "en" || !queued.size) return;
  pending = true;
  const texts: string[] = [];
  let characters = 0;
  for (const text of queued) {
    // JSON escaping uses at most six bytes per UTF-16 unit; stay below the API's 128 KiB limit.
    if (texts.length >= 64 || (texts.length > 0 && characters + text.length > 16000)) break;
    texts.push(text); characters += text.length;
  }
  try {
    const response = await fetch("/api/language/lookup", { method: "POST", credentials: "omit", headers: { "content-type": "application/json" },
      body: JSON.stringify({ texts }), signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("translation unavailable");
    const data = await response.json() as { translations: Record<string, unknown> };
    for (const source of texts) {
      const value = data.translations?.[source];
      if (typeof value === "string") translations.set(source, value);
      else missing.add(source);
    }
  } catch { texts.forEach(text => missing.add(text)); }
  finally { texts.forEach(text => queued.delete(text)); pending = false; emit(); if (queued.size) timer = setTimeout(flush, 50); }
}
const templates = patterns.filter(source => source.replace(/\{\{\d+\}\}/g, "").length >= 4).map(source => ({ source, parts: source.split(/\{\{\d+\}\}/) }));
const quantity = (count: string, noun: string) => `${count} ${noun}${Number(count) === 1 ? "" : "s"}`;
function templateValues(source: string, parts: string[]): string[] | null {
  if (!source.startsWith(parts[0]!)) return null;
  let at = parts[0]!.length;
  const values: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    const separator = parts[i]!;
    // Adjacent slots are ambiguous; keep the original instead of guessing their boundary.
    if (!separator && i < parts.length - 1) return null;
    const end = separator ? source.indexOf(separator, at) : source.length;
    if (end < at) return null;
    values.push(source.slice(at, end)); at = end + separator.length;
  }
  return at === source.length ? values : null;
}
function requestText(source: string) {
  if (source.length <= 20000 && /\p{Script=Han}/u.test(source) && !missing.has(source) && !queued.has(source)) {
    queued.add(source); timer ??= setTimeout(flush, 30);
  }
}
function lookup(source: string, context: "interface" | "content" = "interface"): string {
  if (locale !== "en") return source;
  if (Object.hasOwn(englishUi, source)) return englishUi[source];
  if (context === "interface" && Object.hasOwn(englishUi, source.trim())) {
    return source.replace(source.trim(), englishUi[source.trim()]!);
  }
  if (context === "content") {
    if (translations.has(source)) return translations.get(source)!;
    requestText(source); return source;
  }
  // Dates/counts are formatting, never separate model requests.
  const fullDate = source.match(/^(\d{4}) 年 (\d{1,2}) 月 (\d{1,2}) 日 · (星期[一二三四五六日])$/);
  if (fullDate) return `${new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(Number(fullDate[1]), Number(fullDate[2]) - 1, Number(fullDate[3]))))} · ${englishUi[fullDate[4]!]}`;
  const month = source.match(/^(\d{4}) 年 (\d{1,2}) 月$/);
  if (month) return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(Number(month[1]), Number(month[2]) - 1, 1)));
  const day = source.match(/^(\d{1,2})月(\d{1,2})日$/);
  if (day) return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(day[1]) - 1]} ${day[2]}`;
  const dayTime = source.match(/^(\d{1,2}月\d{1,2}日) (\d{2}:\d{2})$/);
  if (dayTime) return `${lookup(dayTime[1]!)} ${dayTime[2]}`;
  const home = source.match(/^(.+) 首页$/);
  if (home) return `${home[1]} home`;
  const recent = source.match(/^(最近的|往期|历史)?(日报|周报|月报)(历史)?$/);
  if (recent) return `${recent[1] === "最近的" ? "Recent " : ""}${lookup(recent[2]!)}${recent[1] === "往期" || recent[1] === "历史" || recent[3] ? " archive" : ""}`;
  const calendarMonth = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"].indexOf(source.replace(/月$/, ""));
  if (source.endsWith("月") && calendarMonth >= 0) return new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2000, calendarMonth, 1)));
  const year = source.match(/^(\d{4}) 年$/);
  if (year) return year[1]!;
  const week = source.match(/^第\s*(\d+)\s*周$/);
  if (week) return `Week ${week[1]}`;
  const yearWeek = source.match(/^(\d{4}) 年第 (\d+) 周$/);
  if (yearWeek) return `${yearWeek[1]} · Week ${yearWeek[2]}`;
  const issueDate = source.match(/^(\d{1,2}月\d{1,2}日) · (?:第 (\d+) 期|(未出刊))$/);
  if (issueDate) return `${lookup(issueDate[1]!)} · ${issueDate[2] ? `Issue ${issueDate[2]}` : "Not published"}`;
  const issueCount = source.match(/^(本月|全年) (\d+) 期$/);
  if (issueCount) return `${quantity(issueCount[2]!, "issue")} ${issueCount[1] === "本月" ? "this month" : "this year"}`;
  const relative = source.match(/^(\d+)\s*(分钟|小时|天)前$/);
  if (relative) return `${quantity(relative[1]!, relative[2] === "分钟" ? "minute" : relative[2] === "小时" ? "hour" : "day")} ago`;
  const updatedAgo = source.match(/^(.+前)更新$/);
  const digestUpdated = source.match(/^AI 根据报道生成 · (.+前)更新$/);
  if (digestUpdated) return `AI-generated from reports · Updated ${lookup(digestUpdated[1]!)}`;
  if (updatedAgo) return `Updated ${lookup(updatedAgo[1]!)}`;
  const hotRange = source.match(/^过去 (\d+) 小时 · 已收录信源中的 (\d+) 个热点$/);
  if (hotRange) return `Past ${hotRange[1]} hours · ${quantity(hotRange[2]!, "trend")} across our sources`;
  if (source.startsWith("取消搜索：")) return `Clear search: ${source.slice(5)}`;
  const neighbour = source.match(/^(前一日|后一日) · (\d{1,2}月\d{1,2}日)$/);
  if (neighbour) return `${neighbour[1] === "前一日" ? "Previous day" : "Next day"} · ${lookup(neighbour[2]!)}`;
  const count = source.match(/^(\d+)\s*(条|件|家|篇|分钟)$/);
  if (count) return count[2] === "分钟" ? `${count[1]} min` : quantity(count[1]!, count[2] === "家" ? "source" : count[2] === "篇" ? "report" : "item");
  const participants = source.match(/^(\d+) 位参与者$/);
  if (participants) return quantity(participants[1]!, "participant");
  const sources = source.match(/^(\s*等 )?(\d+) 个来源$/);
  if (sources) return `${sources[1] ? " · " : ""}${quantity(sources[2]!, "source")}`;
  const progress = source.match(/^(\d+) 条进展 · (\d+) 篇报道$/);
  if (progress) return `${quantity(progress[1]!, "update")} · ${quantity(progress[2]!, "report")}`;
  const otherSources = source.match(/^另有 (\d+) 家信源报道$/);
  if (otherSources) return `${otherSources[1]} other source${Number(otherSources[1]) === 1 ? "" : "s"}`;
  if (translations.has(source)) return translations.get(source)!;
  for (const template of templates) {
    const match = templateValues(source, template.parts);
    if (!match) continue;
    const translated = englishUi[template.source] ?? translations.get(template.source);
    if (translated) return translated.replace(/\{\{(\d+)\}\}/g, (_, i) => match[Number(i)] ?? "");
    requestText(template.source);
    return source;
  }
  requestText(source);
  return source;
}
function useTranslation() {
  useLocale();
  return lookup;
}
function LanguageControl() {
  const lang = useLocale();
  return <button type="button" aria-label={lang === "zh" ? "Switch to English" : "Switch to Chinese"} title="中文 / English"
    onClick={() => setLocale(lang === "zh" ? "en" : "zh")}
    className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-[12px] font-medium text-ink-3 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
    <span className={lang === "zh" ? "text-accent" : ""}>中</span><span aria-hidden="true" className="text-ink-4">/</span><span className={lang === "en" ? "text-accent" : ""}>EN</span>
  </button>;
}
function LanguageStatus() {
  const { pathname } = useLocation();
  const lang = useLocale();
  useEffect(() => {
    // Older releases saved an English preference. Every fresh document now starts in Chinese.
    try { localStorage.removeItem("changji.language"); } catch { /* Storage is optional. */ }
    const refresh = setInterval(() => { missing.clear(); emit(); }, 60_000);
    return () => clearInterval(refresh);
  }, []);
  useEffect(() => { missing.clear(); emit(); if (queued.size) timer ??= setTimeout(flush, 30); }, [pathname, lang]);
  return lang === "en" ? <p className="mb-3 text-[11px] leading-relaxed text-ink-4" role="note">AI translation · Original text is shown when a translation is pending. Dates use Beijing time.</p> : null;
}
export default { name: "language", text: useTranslation, root: { Top: LanguageStatus, ToolbarControl: LanguageControl } } satisfies WebModule;
