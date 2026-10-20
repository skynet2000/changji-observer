import { useEffect, useSyncExternalStore } from "react";
import type { WebModule } from "@aihot/web/modules";
import { useLocation } from "react-router";
import { englishUi } from "./ui.ts";
import patterns from "./ui-patterns.json";

const key = "changji.language";
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
  try { localStorage.setItem(key, value); } catch { /* Reading still works without browser storage. */ }
  emit();
}
async function flush() {
  timer = undefined;
  if (pending || locale !== "en" || !queued.size) return;
  pending = true;
  const texts = [...queued].slice(0, 64); texts.forEach(text => queued.delete(text));
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
  finally { pending = false; emit(); if (queued.size) timer = setTimeout(flush, 50); }
}
const templates = patterns.map(source => ({ source, parts: source.split(/\{\{\d+\}\}/) }));
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
  if (/\p{Script=Han}/u.test(source) && !missing.has(source) && !queued.has(source)) {
    queued.add(source); timer ??= setTimeout(flush, 30);
  }
}
function lookup(source: string): string {
  if (locale !== "en") return source;
  if (Object.hasOwn(englishUi, source)) return englishUi[source];
  if (translations.has(source)) return translations.get(source)!;
  // Dates/counts are formatting, never separate model requests.
  const fullDate = source.match(/^(\d{4}) 年 (\d{1,2}) 月 (\d{1,2}) 日 · (星期[一二三四五六日])$/);
  if (fullDate) return `${new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(Number(fullDate[1]), Number(fullDate[2]) - 1, Number(fullDate[3]))))} · ${englishUi[fullDate[4]!]}`;
  const month = source.match(/^(\d{4}) 年 (\d{1,2}) 月$/);
  if (month) return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(Number(month[1]), Number(month[2]) - 1, 1)));
  const day = source.match(/^(\d{1,2})月(\d{1,2})日$/);
  if (day) return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(day[1]) - 1]} ${day[2]}`;
  const count = source.match(/^(\d+)\s*(条|件|家|篇|分钟)$/);
  if (count) return `${count[1]} ${count[2] === "分钟" ? "min" : count[2] === "家" ? "sources" : "items"}`;
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
    className="inline-flex min-h-11 items-center gap-1.5 rounded-control border border-line bg-surface px-3 text-[12px] font-medium text-ink-3 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
    <span className={lang === "zh" ? "text-accent" : ""}>中</span><span aria-hidden="true" className="text-ink-4">/</span><span className={lang === "en" ? "text-accent" : ""}>EN</span>
  </button>;
}
function LanguageStatus() {
  const { pathname } = useLocation();
  const lang = useLocale();
  useEffect(() => {
    try { const stored = localStorage.getItem(key); if (stored === "en") setLocale("en"); } catch { /* Default Chinese. */ }
    const changed = (event: StorageEvent) => { if (event.key === key) setLocale(event.newValue === "en" ? "en" : "zh"); };
    window.addEventListener("storage", changed);
    const refresh = setInterval(() => { missing.clear(); emit(); }, 60_000);
    return () => { clearInterval(refresh); window.removeEventListener("storage", changed); };
  }, []);
  useEffect(() => { missing.clear(); emit(); if (queued.size) timer ??= setTimeout(flush, 30); }, [pathname, lang]);
  return <div className="mb-3 flex items-center justify-end gap-3 border-b border-line-soft py-2" data-language-control="">
    {lang === "en" && <p className="min-w-0 text-[11px] leading-relaxed text-ink-4">AI translation · Original text is shown when a translation is pending. Dates use Beijing time.</p>}
    <LanguageControl />
  </div>;
}
export default { name: "language", text: useTranslation, root: { Top: LanguageStatus } } satisfies WebModule;
