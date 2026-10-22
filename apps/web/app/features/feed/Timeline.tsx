import { Text, useText } from "@aihot/web/lib/text";
// The day-grouped feed (精选 home, topics): a time rail with cards on desktop, rows under grey day bars on
// phones. Keeps its place across back navigation and loads further pages. There is no "new items"
// prompt: readers refresh for the latest head — on phones also by tapping the tab again.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigation } from "react-router";
import { Collapse } from "../../components/ui/Presence";
import type { TimelineCard, TimelineFilters, TimelineResponse } from "@aihot/contracts/site";
import { FeedItem } from "./FeedItem";
import { IconChevronDown } from "../../components/icons";
import { RingMark } from "@aihot/site/brand/Logo.tsx";
import { EmptyState } from "../../components/ui/Page";
import { beijingDate, beijingWeekday } from "@aihot/contracts/time";
import { monthDay, weekdayShort } from "../../lib/format";
import { isHydrated } from "../../lib/hydration";
import { markRead, useReadSet } from "../../lib/local-state";
import { filterParams, listPath } from "../../lib/seo";
import { isReload, readSnapshot, restoreAnchor, saveSnapshot, useSaveOnLeave } from "../../lib/restore";

const AUTO_BATCHES = 3;

interface ListState {
  version: 2;
  cards: TimelineCard[];
  nextCursor: string | null;
  dayCounts: Record<string, number>;
  collapsed: string[];
  batches: number;
}

function fromResponse(r: TimelineResponse): ListState {
  return { version: 2, cards: r.cards, nextCursor: r.nextCursor, dayCounts: r.dayCounts, collapsed: [], batches: 1 };
}

/** Sticky day header under the phone bar: a quiet row on desktop, a grey full-width bar on phones. */
export function DayHeader({ day, today, count, collapsed, onToggle, aside }: { day: string; today: string; count: number | null; collapsed?: boolean; onToggle?: () => void; aside?: React.ReactNode }) {
  const translate = useText();
  const date = monthDay(day);
  const weekday = beijingWeekday(day);
  const short = weekdayShort(day);
  const phoneRow = (
    <>
      <span className="text-[14px] font-bold text-ink"><Text>{day === today ? "今天" : date}</Text></span>
      {day === today && <span className="text-[12.5px] text-ink-4"><Text>{date}</Text></span>}
      <span className="text-[12.5px] text-ink-4"><Text>{short}</Text></span>
      <span className="ml-auto flex items-center gap-1 text-[12.5px] text-ink-4">
        {aside}
        {count !== null && (
          <span className="num"><Text>{`${count} 条`}</Text></span>
        )}
        {onToggle && <IconChevronDown size={15} className={`transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`} />}
      </span>
    </>
  );
  return (
    <div className="feed-day sticky top-[var(--bar-h)] z-20 bg-bg">
      {/* Phones: a full-width day bar; on the timeline the whole bar folds the day. */}
      {onToggle ? (
        <button type="button" onClick={onToggle} aria-expanded={!collapsed} aria-label={translate(`${collapsed ? "展开" : "收起"}${date}`)} className="flex h-11 w-full items-center gap-2 text-left lg:hidden">
          <Text>{phoneRow}</Text>
        </button>
      ) : (
        <div className="flex h-9 items-center gap-2 lg:hidden"><Text>{phoneRow}</Text></div>
      )}
      {/* Desktop: date text shares the page's left edge, regardless of how many digits it has. */}
      <div className="hidden h-11 items-center gap-3 lg:flex">
        {onToggle ? (
          <button type="button" onClick={onToggle} aria-expanded={!collapsed} className="whitespace-nowrap text-left text-[18px] font-semibold leading-6 text-ink">
            <Text>{date}</Text>
          </button>
        ) : (
          <time dateTime={day} className="whitespace-nowrap text-[18px] font-semibold leading-6 text-ink"><Text>{date}</Text></time>
        )}
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            aria-label={translate(collapsed ? `展开${date}` : `收起${date}`)}
            className="grid size-6 place-items-center justify-self-center rounded-full text-ink-4 transition-colors hover:bg-bg-sunk hover:text-ink"
          >
            <IconChevronDown size={14} className={`transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`} />
          </button>
        ) : null}
        <span className="text-[13px] text-ink-4">
          <Text>{weekday}</Text>
          {count !== null && (
            <>
              <Text>{" · "}</Text>
              <span className="num"><Text>{`${count} 条`}</Text></span>
            </>
          )}
        </span>
        {aside && <span className="ml-auto text-[12px] text-ink-4">{aside}</span>}
      </div>
    </div>
  );
}

/**
 * One reading card; its source line holds the time on every screen size.
 */
export function TimelineSlot({ children, fresh = false, delay = 0, dataKey }: { children: React.ReactNode; fresh?: boolean; delay?: number; dataKey?: string }) {
  return (
    <li
      data-card-key={dataKey}
      className={`group/slot ${fresh ? "animate-fade-up" : ""}`}
      style={fresh ? { animationDelay: `${delay}ms` } : undefined}
    >
      <div className="pb-3 lg:pb-4">
        {children}
      </div>
    </li>
  );
}

export function Timeline({ initial, filters }: { initial: TimelineResponse; filters: TimelineFilters }) {
  const translate = useText();
  const location = useLocation();
  const navigation = useNavigation();
  const readSet = useReadSet();
  const historyKey = location.key;

  // Back navigation (client side): restore synchronously from the snapshot. A full reload restores
  // after hydration so the first client render matches the server HTML.
  const [state, setState] = useState<ListState>(() => {
    if (isHydrated()) {
      const snap = readSnapshot<ListState>(historyKey);
      if (snap?.data.version === 2 && snap.data.cards.length > 0) return snap.data;
    }
    return fromResponse(initial);
  });
  const restoredRef = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [freshKeys, setFreshKeys] = useState<Set<string>>(() => new Set());
  const stateRef = useRef(state);
  stateRef.current = state;

  // Filters (i.e. the loader data) changed. A page still loading for the old filters is cancelled, and a
  // response that arrives anyway is dropped (it belongs to another list and cursor). Back or forward to a
  // filter already visited restores what that history entry had loaded and folded; a new one starts over.
  const filterKey = listPath("/api/site/timeline", filterParams(filters));
  const lastFilterKey = useRef(filterKey);
  const pageRequest = useRef<AbortController | null>(null);
  useEffect(() => () => pageRequest.current?.abort(), []);
  useLayoutEffect(() => {
    if (lastFilterKey.current !== filterKey) {
      lastFilterKey.current = filterKey;
      pageRequest.current?.abort();
      pageRequest.current = null;
      setLoadingMore(false);
      setLoadError(false);
      const snap = readSnapshot<ListState>(historyKey);
      if (snap?.data.version === 2 && snap.data.cards.length > 0) {
        setState(snap.data);
        restoreAnchor(snap.anchor, snap.scrollY);
      } else {
        setState(fromResponse(initial));
      }
    }
  }, [filterKey, initial, historyKey]);

  // The same list with new data (the tab tapped again at the top, or the brand tapped): start over from
  // the fresh head. A change of filters is handled above.
  const lastData = useRef({ initial, filterKey });
  useLayoutEffect(() => {
    const prev = lastData.current;
    lastData.current = { initial, filterKey };
    if (prev.initial === initial || prev.filterKey !== filterKey) return;
    pageRequest.current?.abort();
    pageRequest.current = null;
    setLoadingMore(false);
    setLoadError(false);
    setState(fromResponse(initial));
  }, [initial, filterKey]);

  useLayoutEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const snap = readSnapshot<ListState>(historyKey);
    if (!isHydrated()) {
      // A full load keeps the server's fresh list when the reader reloaded; after a back/forward
      // that reloaded the document, it restores the saved list and position.
      if (snap?.data.version === 2 && snap.data.cards.length > 0 && !isReload()) {
        setState(snap.data);
        requestAnimationFrame(() => restoreAnchor(snap.anchor, snap.scrollY));
      }
      return;
    }
    if (snap?.data.version === 2 && snap.data.cards.length > 0) restoreAnchor(snap.anchor, snap.scrollY);
  }, [historyKey]);

  // Save the snapshot whenever we leave this history entry.
  useEffect(() => {
    if (navigation.state === "loading" && navigation.location && navigation.location.key !== historyKey) {
      saveSnapshot(historyKey, stateRef.current);
    }
  }, [navigation.state, navigation.location, historyKey]);
  useSaveOnLeave(historyKey, () => stateRef.current);

  const loadMore = useCallback(async () => {
    const s = stateRef.current;
    if (!s.nextCursor || pageRequest.current) return;
    const key = listPath("/api/site/timeline", filterParams(filters));
    const controller = new AbortController();
    pageRequest.current = controller;
    const current = () => lastFilterKey.current === key && !controller.signal.aborted;
    setLoadingMore(true);
    setLoadError(false);
    try {
      const res = await fetch(listPath("/api/site/timeline", { ...filterParams(filters), cursor: s.nextCursor }), { signal: controller.signal });
      if (res.status === 400) {
        // Cursor no longer fits: start over from the head.
        const head = await fetch(key, { signal: controller.signal });
        if (!head.ok) throw new Error(String(head.status));
        if (current()) setState(fromResponse((await head.json()) as TimelineResponse));
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const page = (await res.json()) as TimelineResponse;
      if (!current()) return;
      setState((prev) => {
        const seen = new Set(prev.cards.map((c) => c.key));
        const added = page.cards.filter((c) => !seen.has(c.key));
        setFreshKeys(new Set(added.map((c) => c.key)));
        return {
          ...prev,
          cards: [...prev.cards, ...added],
          nextCursor: page.nextCursor,
          dayCounts: { ...prev.dayCounts, ...page.dayCounts },
          batches: prev.batches + 1,
        };
      });
    } catch {
      if (current()) setLoadError(true);
    } finally {
      if (pageRequest.current === controller) {
        pageRequest.current = null;
        setLoadingMore(false);
      }
    }
  }, [filters]);

  // Auto-load a few batches when the sentinel nears the viewport, then hand over to a button.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !state.nextCursor || state.batches >= AUTO_BATCHES) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadMore();
    }, { rootMargin: "900px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [state.nextCursor, state.batches, loadMore]);

  const today = beijingDate(Date.now());
  const days = useMemo(() => {
    const out: Array<{ day: string; cards: TimelineCard[] }> = [];
    for (const c of state.cards) {
      const d = beijingDate(c.anchorAt);
      const last = out[out.length - 1];
      if (last && last.day === d) last.cards.push(c);
      else out.push({ day: d, cards: [c] });
    }
    return out;
  }, [state.cards]);

  const toggleDay = (day: string) =>
    setState((s) => ({ ...s, collapsed: s.collapsed.includes(day) ? s.collapsed.filter((d) => d !== day) : [...s.collapsed, day] }));

  let order = 0;
  return (
    <div className="relative">
      {days.length === 0 && (
        <div className="lg:card">
          <EmptyState title={translate("这个筛选下还没有精选内容")}><Text>换个类别看看，或者去全部动态里找找。</Text></EmptyState>
        </div>
      )}

      {days.map(({ day, cards }) => {
        const collapsed = state.collapsed.includes(day);
        const count = state.dayCounts[day] ?? cards.length;
        return (
          <section key={day} aria-label={translate(day)} className="lg:mb-1">
            <DayHeader day={day} today={today} count={count} collapsed={collapsed} onToggle={() => toggleDay(day)} />
            <Collapse open={!collapsed}>
                <ol className="lg:pt-1">
                  {cards.map((c) => {
                    const fresh = freshKeys.has(c.key);
                    const delay = fresh ? Math.min(order++, 10) * 40 : 0;
                    return (
                      <TimelineSlot key={c.key} dataKey={c.key} fresh={fresh} delay={delay}>
                        <FeedItem item={c.item} group={c.group} filters={filters} read={readSet.has(c.item.id)} onOpen={markRead} at={c.anchorAt} />
                      </TimelineSlot>
                    );
                  })}
                </ol>
            </Collapse>
          </section>
        );
      })}

      <div ref={sentinel} aria-hidden="true" />
      <FeedEnd loading={loadingMore} error={loadError} hasMore={!!state.nextCursor} manual={state.batches >= AUTO_BATCHES} empty={state.cards.length === 0} onMore={loadMore} />
    </div>
  );
}

/** The foot of a paged list: loading, retry, "加载更多" after a few automatic pages, or the end. */
function FeedEnd({ loading, error, hasMore, manual, empty, onMore }: { loading: boolean; error: boolean; hasMore: boolean; manual: boolean; empty: boolean; onMore: () => void }) {
  return (
    <div className="flex justify-center py-6">
      {loading ? (
        <span className="inline-flex items-center gap-2 text-[12.5px] text-ink-4">
          <RingMark className="size-4 text-accent" spinning /><Text> 正在加载
        </Text></span>
      ) : error ? (
        <button type="button" onClick={onMore} className="h-9 rounded-full border border-hot/30 px-4 text-[13px] text-hot hover:bg-hot-soft"><Text>
          加载失败，点此重试
        </Text></button>
      ) : hasMore ? (
        manual && (
          <button type="button" onClick={onMore} className="h-9 rounded-full border border-line-strong bg-surface px-5 text-[13px] font-medium text-ink-2 transition-colors hover:border-ink-4 hover:text-ink"><Text>
            加载更多
          </Text></button>
        )
      ) : (
        !empty && <span className="text-[12px] text-ink-4"><Text>已经到底了</Text></span>
      )}
    </div>
  );
}
