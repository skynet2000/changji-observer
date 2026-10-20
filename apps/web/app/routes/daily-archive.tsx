import { Text, useText } from "@aihot/web/lib/text";
import { useLoaderData } from "react-router";
import { IntentLink } from "../components/ui/IntentLink";
import type { ReportIndexEntry, ReportIndexResponse } from "@aihot/contracts/site";
import { SITE, withSubject } from "@aihot/site";
import { apiGet, cachedPage } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { archiveLd, pageMeta } from "../lib/seo";
import { beijingDate } from "@aihot/contracts/time";
import { weekdayShort } from "../lib/format";
import { ReportLayout } from "../features/report/ReportLayout";
import { archiveGroups, ENTRIES_UNIT } from "../features/report/format";
import { Rows, SectionPage } from "../features/report/ReportPaper";
import { Nameplate } from "../features/report/Nameplate";
import type { Screen } from "../components/shell/screens";

export const handle: Screen = { tab: "daily", name: "往期" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: { request: Request }) {
  const { items: index } = await apiGet<ReportIndexResponse>("/api/site/reports/daily", { signal: request.signal });
  return cachedPage(600, { index, today: beijingDate(Date.now()) });
}

export function meta({ loaderData }: { loaderData?: { index: ReportIndexEntry[] } }) {
  const entries = (loaderData?.index ?? []).map((e: ReportIndexEntry) => ({ path: `/daily/${e.key}`, name: e.title ? `${e.key} · ${e.title}` : `${SITE.name} 日报 · ${e.key}` }));
  return pageMeta({ title: `${withSubject("日报")} · 历史存档`, description: `${SITE.name} 历史日报，按日期归档。`, path: "/daily/archive", image: "/og/pages/daily.png", jsonLd: archiveLd("/daily/archive", `${SITE.name} 日报 · 历史存档`, entries) });
}

export default function DailyArchive() {
  const translate = useText();
  const { index, today } = useLoaderData<typeof loader>();
  const months = archiveGroups("daily", index);
  return (
    <ReportLayout kind="daily" index={index} current={null} today={today} back={{ to: "/daily", label: "日报" }} title={translate("日报合订本")}>
      <div className="@container">
        <header className="pt-5 lg:pt-0">
          <div className="flex items-center justify-between gap-4 text-[12px] text-ink-4">
            <span><Text>{`${SITE.name} · ${withSubject("日报")}`}</Text></span>
            <span><Text>
              共 </Text><span className="num">{index[0]?.issueNumber ?? 0}</span><Text> 期
            </Text></span>
          </div>
          <div className="py-6 @[880px]:py-8">
            <h1 id="report-start" data-page-title="">
              <span className="sr-only"><Text>日报合订本</Text></span>
              <Nameplate which="archive" className="block h-[50px] w-auto @[520px]:h-[70px] @[880px]:h-[98px]" />
            </h1>
          </div>
          <div aria-hidden="true" className="border-t border-line-strong" />
        </header>
        {months.map((m) => (
          <SectionPage key={m.id} id={`m-${m.id}`} label={m.label}>
            <Rows items={m.entries}>
              {(e, cell) => (
                <IntentLink viewTransition key={e.key} to={`/daily/${e.key}`} className={`group flex gap-4 py-4 ${cell}`}>
                  <span className="flex w-9 shrink-0 flex-col items-center">
                    <span className="num text-[24px] font-black leading-none tracking-[-0.03em] text-ink transition-colors group-hover:text-accent"><Text>{e.key.slice(8, 10)}</Text></span>
                    <span className="mt-1.5 text-[10.5px] leading-none text-ink-4"><Text>{weekdayShort(e.key)}</Text></span>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-bold leading-[1.55] text-ink transition-colors group-hover:text-accent"><Text>{e.title ?? `${withSubject("日报")} ${e.key}`}</Text></span>
                    {!!e.count && (
                      <span className="mt-1 block text-[12px] text-ink-4">
                        <span className="num"><Text>{e.count}</Text></span><Text>{` ${ENTRIES_UNIT}`}</Text>
                      </span>
                    )}
                  </span>
                </IntentLink>
              )}
            </Rows>
          </SectionPage>
        ))}
      </div>
    </ReportLayout>
  );
}
