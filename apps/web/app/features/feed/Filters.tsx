import { Text, useText } from "@aihot/web/lib/text";
// Categories are always visible; the phone sheet also offers source filters and a reset action.
import { useEffect, useRef, useState } from "react";
import { Form, Link, useNavigation, useSearchParams } from "react-router";
import { READER_CATEGORY_OPTIONS, readerCategory, readerCategoryLabel, CHANNEL_LABELS, type CategoryKey, type ChannelKey } from "@aihot/contracts/taxonomy";
import { IconCheck, IconClose, IconFilter, IconSearch } from "../../components/icons";
import { Sheet } from "../../components/ui/Sheet";
import { IntentLink } from "../../components/ui/IntentLink";
import { BarButton, PhoneBar } from "../../components/shell/PhoneBar";
import { openSearch } from "../search/SearchOverlay";

/** Same page with some query parameters changed (paging state dropped). */
function hrefWith(base: string, params: URLSearchParams, patch: Record<string, string | null>) {
  const sp = new URLSearchParams(params);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === "") sp.delete(k);
    else sp.set(k, v);
  }
  sp.delete("page");
  sp.delete("cursor");
  sp.delete("deep");
  sp.delete("anchorAt");
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

/** Category, source channel, tag and search are independent filters. */
function filterOptions(base: string, params: URLSearchParams, noneLabel: string) {
  return [
    { key: "all", label: noneLabel, to: hrefWith(base, params, { category: null }) },
    ...READER_CATEGORY_OPTIONS.map(({ key, label }) => ({ key, label, to: hrefWith(base, params, { category: key }) })),
  ];
}

function filterKey(category: CategoryKey | null): string {
  return category ? readerCategory(category) : "all";
}

/** Desktop: the filter as a row of tabs beside the search field. */
export function CategoryTabs({ base, category, className = "" }: { base: string; category: CategoryKey | null; className?: string }) {
  const translate = useText();
  const [params] = useSearchParams();
  const rail = useRef<HTMLElement>(null);
  const activeLabel = translate(category ? readerCategoryLabel(category) : "全部");
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const reveal = () => {
      const active = el.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active || !el.clientWidth || el.scrollWidth <= el.clientWidth) return;
      const track = el.getBoundingClientRect(), choice = active.getBoundingClientRect();
      if (choice.left < track.left + 12) el.scrollLeft += choice.left - track.left - 12;
      else if (choice.right > track.right - 12) el.scrollLeft += choice.right - track.right + 12;
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(el);
    return () => observer.disconnect();
  }, [category, activeLabel]);
  return <nav ref={rail} aria-label={translate("筛选")} className={`category-tabs ${className}`}>
    {filterOptions(base, params, "全部").map(option => <IntentLink key={option.key} to={option.to} preventScrollReset
      aria-current={option.key === filterKey(category) ? "page" : undefined}><Text>{option.label}</Text></IntentLink>)}
  </nav>;
}

/** The phone page title and tools. Page switching lives only in the bottom navigation. */
export function FeedBar({ base, category, channel }: { base: "/" | "/all"; category: CategoryKey | null; channel: ChannelKey }) {
  return <PhoneBar
    leading={<h1 className="pl-2.5 text-[20px] font-semibold text-ink"><Text>{base === "/" ? "精选" : "全部动态"}</Text></h1>}
    actions={
      <>
        <FilterButton base={base} category={category} channel={channel} />
        <SearchButton />
      </>
    }
  />;
}

/** The same category control is available while reading a feed or searching it. */
export function FilterButton({ base, category, channel, desktop = false }: { base: string; category: CategoryKey | null; channel: ChannelKey; desktop?: boolean }) {
  const translate = useText();
  const [params] = useSearchParams();
  const [sheet, setSheet] = useState(false);
  const count = Number(!!category) + Number(channel !== "all") + Number(params.has("tag"));
  const filtered = count > 0;
  return <>
    {desktop ? <button type="button" aria-label={translate(filtered ? "筛选（已选）" : "筛选")} onClick={() => setSheet(true)}
      className={`inline-flex min-h-[42px] shrink-0 items-center gap-2 rounded-full border px-4 text-[13px] font-medium transition-colors ${filtered ? "border-accent/30 bg-accent-soft text-accent" : "border-line text-ink-2 hover:bg-bg-sunk"}`}>
      <IconFilter size={17} /><Text>筛选</Text>{filtered && <span className="num">{count}</span>}
    </button> : <BarButton label={filtered ? "筛选（已选）" : "筛选"} on={filtered} onClick={() => setSheet(true)}>
      <IconFilter size={21} />
      {filtered && <span aria-hidden="true" className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-accent text-[10px] font-semibold text-accent-contrast ring-2 ring-bg">{count}</span>}
    </BarButton>}
    <FilterSheet open={sheet} onClose={() => setSheet(false)} base={base} active={filterKey(category)} channel={channel} filtered={filtered} centered={desktop} />
  </>;
}

/** Phones: the filter as a sheet of options, the one in use ticked; choosing one applies it. */
function FilterSheet({ open, onClose, base, active, channel, filtered, centered }: { open: boolean; onClose: () => void; base: string; active: string; channel: ChannelKey; filtered: boolean; centered: boolean }) {
  const translate = useText();
  const [params] = useSearchParams();
  return (
    <Sheet open={open} onClose={onClose} title={translate("筛选")} centered={centered}>
      <div className="px-4 pb-2">
      <h3 className="mb-2 mt-2 text-[12px] font-medium text-ink-4"><Text>栏目</Text></h3>
      <nav aria-label={translate("栏目")} className="grid grid-cols-2 gap-2">
        {filterOptions(base, params, "不限").map((o) => {
          const on = o.key === active;
          return (
              <Link
                key={o.key}
                to={o.to}
                onClick={onClose}
                aria-current={on ? "true" : undefined}
                className={`flex min-h-11 items-center justify-between rounded-tile border px-3 text-[14px] transition-colors active:bg-bg-sunk ${o.key === "all" ? "col-span-2" : ""} ${on ? "border-accent/30 bg-accent-soft font-semibold text-accent" : "border-line text-ink hover:bg-bg-sunk"}`}
              >
                <Text>{o.label}</Text>
                {on && <IconCheck size={19} strokeWidth={2.2} />}
              </Link>
          );
        })}
      </nav>
      <p className="mt-3 text-[12px] leading-relaxed text-ink-4"><Text>点击即生效；各项条件叠加筛选。</Text></p>
      <h3 className="mb-2 mt-5 text-[12px] font-medium text-ink-4"><Text>内容来源</Text></h3>
      <nav aria-label={translate("内容来源")} className="grid grid-cols-2 gap-2">
        {(["all", "news", "x", "firstParty"] as const).map(key => <Link key={key} to={hrefWith(base, params, { channel: key === "all" ? null : key })} onClick={onClose}
          aria-current={key === channel ? "true" : undefined}
          className={`flex min-h-11 items-center justify-between rounded-tile border px-3 text-[14px] ${key === channel ? "border-accent/30 bg-accent-soft font-semibold text-accent" : "border-line text-ink hover:bg-bg-sunk"}`}>
          <Text>{key === "all" ? "全部来源" : CHANNEL_LABELS[key]}</Text>{key === channel && <IconCheck size={17} />}
        </Link>)}
      </nav>
      {filtered && <Link to={hrefWith(base, params, { category: null, channel: null, tag: null })} onClick={onClose} className="mt-5 flex min-h-11 items-center justify-center rounded-tile bg-bg-sunk text-[14px] font-medium text-ink-2"><Text>清除筛选</Text></Link>}
      </div>
    </Sheet>
  );
}

/** Empty lists offer a way out without making readers hunt for the filter controls. */
export function FilterRecovery({ base }: { base: "/" | "/all" }) {
  const [params] = useSearchParams();
  const filtered = ["category", "channel", "tag"].some(key => params.has(key));
  return <div className="flex flex-wrap justify-center gap-x-5 gap-y-3 text-[13px] font-medium text-accent">
    {filtered && <Link to={hrefWith(base, params, { category: null, channel: null, tag: null })} className="inline-flex min-h-11 items-center hover:underline"><Text>清除筛选</Text></Link>}
    {base === "/" && <Link to={hrefWith("/all", params, {})} className="inline-flex min-h-11 items-center hover:underline"><Text>查看全部动态</Text></Link>}
  </div>;
}

/** Phones: the filter and tag in use as chips under the bar; each one clears itself when tapped. */
export function ActiveFilters({ base, channel, tag }: { base: string; channel: ChannelKey; tag: string | null }) {
  const translate = useText();
  const [params] = useSearchParams();
  const sourceLabel = channel !== "all" ? CHANNEL_LABELS[channel] : null;
  if (!sourceLabel && !tag) return null;
  const chip = "inline-flex min-h-11 max-w-full items-center gap-1 rounded-full bg-accent-soft pl-3 pr-2 text-[13px] font-medium text-accent transition-opacity active:opacity-60";
  return (
    <div className="flex flex-wrap gap-2 pb-3 pt-1">
      {sourceLabel && <Link to={hrefWith(base, params, { channel: null })} aria-label={translate(`取消筛选：${translate(sourceLabel)}`)} className={chip}><Text>{sourceLabel}</Text><IconClose size={14} /></Link>}
      {tag && (
        <Link to={hrefWith(base, params, { tag: null })} aria-label={translate(`取消标签：${tag}`)} className={chip}>
          <span className="truncate">#<Text>{tag}</Text></span>
          <IconClose size={14} strokeWidth={2} className="shrink-0" />
        </Link>
      )}
    </div>
  );
}

/** Phones: the magnifier in a bar; the search opens over the page with the keyboard up. */
function SearchButton() {
  return (
    <BarButton label="搜索" onClick={(event) => openSearch("", event.currentTarget)}>
      <IconSearch size={21} />
    </BarButton>
  );
}

function useSlashFocus(ref: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement)?.isContentEditable)) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ref]);
}

/** Desktop search field (GET /all?q=…): at the end of the filter row as the same grey track, at the height of md tabs, with a "/" hint. */
export function SearchField({ defaultValue = "", keep = {} }: { defaultValue?: string; keep?: Record<string, string | null> }) {
  const translate = useText();
  const [value, setValue] = useState(defaultValue);
  const navigation = useNavigation();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setValue(defaultValue), [defaultValue]);
  useSlashFocus(inputRef);
  const searching = navigation.state === "loading" && navigation.location?.pathname === "/all" && !!new URLSearchParams(navigation.location.search).get("q");
  const hidden = Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null));

  return (
    <Form method="get" action="/all" role="search" className="group relative w-full shrink-0 lg:w-60">
      <Text>{hidden}</Text>
      <label htmlFor="site-search" className="sr-only"><Text>
        搜索标题、摘要与正文
      </Text></label>
      <IconSearch size={16} className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${searching ? "text-accent" : "text-ink-4 group-focus-within:text-ink-3"}`} />
      <input
        ref={inputRef}
        id="site-search"
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={translate("搜索标题、摘要…")}
        maxLength={200}
        autoComplete="off"
        className="h-[42px] w-full rounded-full bg-bg-sunk pl-10 pr-10 text-[14px] text-ink outline-none ring-1 ring-inset ring-line-soft transition-[background-color,box-shadow] placeholder:text-ink-4 hover:ring-line-strong focus:bg-surface focus:shadow-[0_0_0_3px_var(--accent-soft)] focus:ring-accent dark:bg-bg-muted/60 dark:focus:bg-surface"
      />
      {value ? (
        <button
          type="button"
          aria-label={translate("清空")}
          onClick={() => {
            setValue("");
            inputRef.current?.focus();
          }}
          className="absolute right-3 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-ink-4 transition-colors hover:bg-bg-sunk hover:text-ink"
        >
          <IconClose size={13} />
        </button>
      ) : (
        <kbd className="mono pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 rounded-mark border border-line-strong bg-surface px-1.5 text-[10.5px] leading-4 text-ink-4 lg:block">/</kbd>
      )}
    </Form>
  );
}
