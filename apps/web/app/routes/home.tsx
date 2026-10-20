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
import { ActiveFilters, CategoryTabs, FeedBar, SearchField } from "../features/feed/Filters";

export const handle: Screen = { tab: "featured", name: "精选" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
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
      {/* Phones: the bar (精选 | 全部, filter, search), the filter in use, today's hot topics, the feed. */}
      <FeedBar base="/" category={filters.category} channel={filters.channel} />
      <ActiveFilters base="/" category={filters.category} channel={filters.channel} tag={filters.tag} />
      <FeedMasthead />
      <div className="hidden lg:block">
        <h2 className="sr-only"><Text>{title}</Text></h2>
        <div className="mb-4 mt-4 flex items-start justify-between gap-4">
          <CategoryTabs base="/" category={filters.category} channel={filters.channel} layoutId="home-cat-desk" className="min-w-0" />
          <SearchField keep={{ category: filters.category }} />
        </div>
      </div>

      <p className="mb-4 text-[12px] leading-relaxed text-ink-4"><Text>按原文发布时间排列 · 同一事件合并展示，可展开查看进展</Text></p>

      <div className={data.hot?.length && inNav("/hot") ? "feed-columns" : ""}>
        <div className="min-w-0">{data.cards.length === 0 && !hasFeedFilters(filters)
          ? <FeedWelcome />
          : <Timeline initial={data} filters={data.filters} />}</div>
        {data.hot && inNav("/hot") && <aside className="feed-aside"><HotTopics entries={data.hot} /><div className="editorial-aside-note"><span className="editorial-kicker">IN CONTEXT</span><h2><Text>消息之外，看见关联。</Text></h2><p><Text>同一事件的报道与进展归在一起，保留来源，方便你判断。</Text></p></div></aside>}
      </div>
    </div>
  );
}
