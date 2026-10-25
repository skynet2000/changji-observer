import { EDITORIAL } from "@aihot/site";
import { Text } from "@aihot/web/lib/text";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { RingMark } from "@aihot/site/brand/Logo.tsx";
import { PhoneBar } from "../components/shell/PhoneBar";
import type { Screen } from "../components/shell/screens";
import { titled } from "../lib/seo";

export const handle: Screen = { tab: "all" };

export function meta() {
  return [{ title: titled("搜索繁忙") }, { name: "robots", content: "noindex, follow" }];
}
export function headers() {
  return { "Cache-Control": "no-store" };
}

const RETRY_AFTER_SECONDS = 5;
const SEARCH_PARAMS = ["q", "tag", "channel", "category", "page", "tab"];

/** The busy page after an overloaded search: the same search can be tried again after a few seconds. */
export default function SearchBusy() {
  const { pathname, search } = useLocation();
  const [wait, setWait] = useState(RETRY_AFTER_SECONDS);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  const kept = new URLSearchParams();
  for (const [k, v] of new URLSearchParams(search)) if (SEARCH_PARAMS.includes(k)) kept.append(k, v);
  const base = pathname.startsWith("/all") ? "/all" : "/";
  const retry = kept.toString() ? `${base}?${kept}` : base;
  const hasSearch = kept.has("q");
  const button = "inline-flex h-9 items-center rounded-full px-4 text-[13.5px]";
  return (
    <>
    <PhoneBar back={{ to: base, label: base === "/all" || !EDITORIAL.selectionEnabled ? "资讯" : "精选" }} />
    <div className="mx-auto max-w-sm py-24 text-center" aria-live="polite">
      <RingMark className="mx-auto mb-5 size-10 text-accent" spinning />
      <h1 className="text-[20px] font-bold text-ink"><Text>搜索有点忙</Text></h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-3"><Text>现在搜索的人比较多，请 </Text><Text>{RETRY_AFTER_SECONDS}</Text><Text> 秒以后重试。列表浏览不受影响。</Text></p>
      <div className="mt-6 flex flex-wrap justify-center gap-2.5">
        {hasSearch &&
          (wait > 0 ? (
            <span aria-disabled="true" className={`${button} num cursor-default bg-bg-sunk font-medium text-ink-4`}><Text>{wait}</Text><Text> 秒后可重试</Text></span>
          ) : (
            <Link to={retry} className={`${button} bg-accent font-medium text-accent-contrast hover:bg-accent-ink`}><Text>重试这次搜索</Text></Link>
          ))}
        <Link to="/all" className={`${button} ${hasSearch ? "border border-line-strong bg-surface text-ink-2 hover:border-ink-4" : "bg-accent font-medium text-accent-contrast hover:bg-accent-ink"}`}><Text>浏览全部动态</Text></Link>
        {EDITORIAL.selectionEnabled && <Link to="/" className={`${button} border border-line-strong bg-surface text-ink-2 hover:border-ink-4`}><Text>回到精选</Text></Link>}
      </div>
    </div>
    </>
  );
}
