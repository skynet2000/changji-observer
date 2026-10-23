import { Text, useText } from "@aihot/web/lib/text";
import type { HotStripEntry } from "@aihot/contracts/site";
import { IntentLink } from "../../components/ui/IntentLink";
import { IconMinus, IconTrendDown, IconTrendUp } from "../../components/icons";

type Entry = Pick<HotStripEntry, "rank" | "title" | "heat" | "trend" | "storyPublicId" | "itemId"> & {
  badges?: Array<"surge" | "new" | "rising">;
};

/** The same ranked rows on the homepage and the full board; details live on the event page. */
export function RankList({ entries, label }: { entries: Entry[]; label: string }) {
  const translate = useText();
  const translateContent = useText(true);
  return <ol aria-label={translate(label)} className="hot-rank-list">
    {entries.map(e => {
      const to = e.storyPublicId ? `/story/${e.storyPublicId}` : e.itemId ? `/items/${e.itemId}` : "/hot";
      const badge = e.badges?.includes("surge") ? "爆" : e.badges?.includes("new") || e.trend === "new" ? "新" : e.badges?.includes("rising") ? "发酵中" : null;
      return <li key={e.rank}>
        <IntentLink viewTransition to={to} className="hot-rank-row">
          <span className={`hot-rank-number num ${e.rank <= 3 ? `hot-rank-${e.rank}` : ""}`}><Text>{e.rank}</Text></span>
          <span className="hot-rank-topic">
            <span className="hot-rank-title" title={translateContent(e.title)}><Text content>{e.title}</Text></span>
            {badge && <span className={`hot-rank-badge ${badge === "爆" ? "hot-rank-burst" : ""}`}><Text>{badge}</Text></span>}
          </span>
          <span className="hot-rank-heat num" aria-label={`${translate("热度指数")} ${Math.round(e.heat)}`}><Text>{Math.round(e.heat)}</Text></span>
          <span className="hot-rank-trend">
            {e.trend === "up" && <IconTrendUp size={14} className="text-hot" aria-label={translate("热度上升")} />}
            {e.trend === "down" && <IconTrendDown size={14} className="text-ink-4" aria-label={translate("热度回落")} />}
            {e.trend === "flat" && <IconMinus size={14} className="text-ink-4" aria-label={translate("热度持平")} />}
          </span>
        </IntentLink>
      </li>;
    })}
  </ol>;
}
