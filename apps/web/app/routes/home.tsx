import { FEED_EDITORIAL } from "@aihot/site";
import { Text } from "@aihot/web/lib/text";
import { redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/home";
import type { TimelineResponse } from "@aihot/contracts/site";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { filterParams, hasFeedFilters, itemListLd, listPath, pageMeta, readFilters, siteLd } from "../lib/seo";
import { inNav } from "../components/shell/nav";
import type { Screen } from "../components/shell/screens";
import { Timeline } from "../features/feed/Timeline";
import { FeedMasthead } from "../features/feed/FeedMasthead";
import { FeedWelcome } from "../features/feed/FeedWelcome";
import { HotTopics } from "../features/feed/HotTopics";
import { ActiveFilters, CategoryTabs, FeedBar, FilterButton, SearchField } from "../features/feed/Filters";

export const handle: Screen = { tab: "featured", name: "精选" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  // Source channels remain an API capability; reader feeds always include every source.
  if (url.searchParams.has("channel")) {
    url.searchParams.delete("channel");
    throw redirect(url.pathname + url.search);
  }
  const q = url.searchParams.get("q");
  // Search lives on /all; keep the parameters so old links still land on results.
  if (q && q.trim()) throw redirect(`/all${url.search}`);
  const filters = readFilters(url.searchParams);
  const upstream = new Headers();
  const data = await loadOr404<TimelineResponse>(listPath("/api/site/timeline", filterParams(filters)), { responseHeaders: upstream, signal: request.signal });
  return cachedPage(60, { data, filters }, upstream);
}

export function meta({ loaderData }: Route.MetaArgs) {
  const path = listPath("/", loaderData ? filterParams(loaderData.filters) : {});
  const titles = loaderData?.data.cards.map((c) => c.item.title) ?? [];
  return pageMeta({ path, noindex: hasFeedFilters(loaderData?.filters), jsonLd: path === "/" ? [...siteLd(), itemListLd("/", "精选", titles)] : undefined });
}

export default function Home() {
  const { data, filters } = useLoaderData<typeof loader>();
  const title = filters.tag ? `#${filters.tag}` : "精选";
  return (
    <div className="pb-6">
      {/* Phones: the page title, visible categories, active tags, then the news. */}
      <FeedBar base="/" category={filters.category} />
      <CategoryTabs base="/" category={filters.category} className="mobile-category-tabs lg:hidden" />
      <ActiveFilters base="/" tag={filters.tag} />
      <FeedMasthead />
      <div className="hidden lg:block">
        <h2 className="sr-only"><Text>{title}</Text></h2>
        <div className="feed-filter-row">
          <CategoryTabs base="/" category={filters.category} />
          <div className="ml-auto flex items-center gap-3">
            <FilterButton desktop base="/" category={filters.category} />
            <SearchField keep={{ category: filters.category, tag: filters.tag }} />
          </div>
        </div>
      </div>

      <p className="mb-4 text-[12px] leading-relaxed text-ink-4"><Text>按原文发布时间排列 · 同一事件合并展示，可展开查看进展</Text></p>

      <div className={data.hot?.length && inNav("/hot") ? "feed-columns" : ""}>
        <div className="min-w-0">{data.cards.length === 0 && !hasFeedFilters(filters)
          ? <FeedWelcome />
          : <Timeline initial={data} filters={data.filters} />}</div>
        {data.hot && inNav("/hot") && <aside className="feed-aside"><HotTopics entries={data.hot} /><div className="editorial-aside-note"><span className="editorial-kicker">IN CONTEXT</span><h2><Text>{FEED_EDITORIAL.contextTitle}</Text></h2><p><Text>{FEED_EDITORIAL.contextLead}</Text></p></div></aside>}
      </div>
    </div>
  );
}
