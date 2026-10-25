import { EDITORIAL } from "@aihot/site";
import { Text, useText } from "@aihot/web/lib/text";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { useLocation, useRevalidator, useSearchParams } from "react-router";
import { feedScopeHref, tabs, type TabKey } from "./nav";
import { noteScreen, rememberedTab, useScreen } from "./screens";
import { markBack } from "./transitions";
import { useChangelogDot } from "./Header";
import { IntentLink } from "../ui/IntentLink";

const subscribe = () => () => {};
const serverTab = () => null;
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * The phone tab bar (below lg). A page lights the tab it declares; pages reached from several tabs keep
 * the tab the reader came from. Tapping the tab you are on goes back to its first screen (sliding back,
 * as the bar's back button does); on that screen it scrolls to the top, and at the top it reloads the
 * page's data. Articles bring their own toolbar instead.
 */
export function TabBar({ changelogVersion }: { changelogVersion: string | null }) {
  const translate = useText();
  const screen = useScreen();
  const { pathname, search, key } = useLocation();
  const [params] = useSearchParams();
  const revalidator = useRevalidator();
  const dot = useChangelogDot(changelogVersion);
  const last = useRef<TabKey | undefined>(undefined);
  const restored = useSyncExternalStore(subscribe, () => rememberedTab(key), serverTab);
  const items = tabs();
  const requested = screen.tab ?? restored ?? last.current ?? screen.home;
  const active = requested && !items.some((t) => t.key === requested) ? (EDITORIAL.selectionEnabled ? "featured" : "all") : requested;
  useIsoLayoutEffect(() => {
    // Do not overwrite a saved entry with the server fallback before hydration reads this browser's tab.
    if (restored === null) return;
    last.current = active;
    noteScreen(screen.name, key, active);
  }, [active, key, screen.name, restored]);
  if (screen.toolbar) return null;
  return (
    <nav
      aria-label={translate("底部导航")}
      className="reader-tabbar fixed inset-x-0 bottom-0 z-40 bg-surface/90 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] shadow-[0_-1px_0_var(--line)] backdrop-blur-xl backdrop-saturate-150 lg:hidden"
    >
      <div className="mx-auto grid h-[58px] max-w-[640px] px-2" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((t) => {
          const on = t.key === active;
          const home = pathname === t.to || (!EDITORIAL.selectionEnabled && t.key === "all" && pathname === "/");
          const Icon = t.icon;
          return (
            <IntentLink
              key={t.key}
              to={on && home ? pathname + search : (pathname === "/" || pathname === "/all") && (t.to === "/" || t.to === "/all") ? feedScopeHref(t.to, params) : t.to}
              aria-current={on ? "page" : undefined}
              viewTransition={on && pathname !== t.to}
              onClick={(event) => {
                if (!on || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                if (!home) return markBack();
                event.preventDefault();
                if (window.scrollY > 0) {
                  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                  window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
                } else if (revalidator.state === "idle") {
                  void revalidator.revalidate();
                }
              }}
              className={`relative m-1 flex min-w-0 flex-col items-center justify-center gap-[2px] rounded-xl text-[11.5px] transition-colors ${on ? "bg-accent-soft font-semibold text-accent" : "text-ink-3 active:bg-bg-sunk active:text-ink"}`}
            >
              <Icon size={21} />
              <span className="max-w-full truncate px-0.5"><Text>{t.label}</Text></span>
              {dot && t.changelog && <span className="absolute left-[calc(50%+9px)] top-[7px] size-1.5 rounded-full bg-hot" aria-label={translate("有新的更新")} />}
            </IntentLink>
          );
        })}
      </div>
    </nav>
  );
}
