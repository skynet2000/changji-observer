import { useEffect, useRef, useState } from "react";
import { Text, useText } from "@aihot/web/lib/text";

const POSITION = "dachang-update-position";

/** An old but healthy tab gets a choice to update; it never reloads while someone is writing. */
export function VersionNotice({ release }: { release: string | null }) {
  const [latest, setLatest] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const dirty = useRef(false);
  const text = useText();
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(POSITION) ?? "null");
      sessionStorage.removeItem(POSITION);
      if (saved?.path === location.pathname + location.search + location.hash && Number.isFinite(saved.y)) {
        requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, saved.y)));
      }
    } catch { /* Reload still works when storage is unavailable. */ }
    if (!release || release === "dev") return;
    const controller = new AbortController();
    let checking = false, checkedAt = 0;
    const check = async () => {
      if (document.visibilityState === "hidden" || checking || Date.now() - checkedAt < 60_000) return;
      checking = true; checkedAt = Date.now();
      try {
        const r = await fetch("/api/health", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) });
        if (!r.ok) return;
        const body = await r.json();
        if (!controller.signal.aborted && body.ok === true && typeof body.release === "string" && body.release && body.release !== "dev" && body.release !== release) setLatest(body.release);
      } catch { /* A failed health probe is not a new deployment. */ }
      finally { checking = false; }
    };
    const edit = (event: Event) => {
      if (event.target instanceof HTMLElement && event.target.matches("textarea, select, input:not([type=search]):not([type=button]):not([type=submit])")) dirty.current = true;
    };
    void check();
    const timer = setInterval(check, 5 * 60_000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    document.addEventListener("input", edit, true);
    return () => {
      controller.abort(); clearInterval(timer);
      window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); document.removeEventListener("input", edit, true);
    };
  }, [release]);
  if (!latest || latest === dismissed) return null;
  const refresh = () => {
    if (dirty.current && !window.confirm(String(text("页面有未提交的输入，确定刷新吗？")))) return;
    try { sessionStorage.setItem(POSITION, JSON.stringify({ path: location.pathname + location.search + location.hash, y: window.scrollY })); } catch { /* Optional reading-position recovery. */ }
    window.location.reload();
  };
  return <aside role="status" className="fixed bottom-24 right-3 z-50 flex max-w-[calc(100vw-24px)] items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink shadow-lg lg:bottom-5 lg:right-5">
    <span><Text>网站已更新</Text></span>
    <button type="button" onClick={refresh} className="font-semibold text-accent"><Text>刷新查看</Text></button>
    <button type="button" onClick={() => setDismissed(latest)} className="text-ink-3"><Text>稍后</Text></button>
  </aside>;
}
