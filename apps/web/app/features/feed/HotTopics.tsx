import { Text, useText } from "@aihot/web/lib/text";
import { Link } from "react-router";
import type { HotStripEntry } from "@aihot/contracts/site";
import { IconArrowRight, IconMinus, IconTrendDown, IconTrendUp } from "../../components/icons";

// As on the original list: the top three in the ranking colours at the heaviest weight.
const RANK_COLOR = ["text-[15px] font-black text-rank-1", "text-[15px] font-black text-rank-2", "text-[15px] font-black text-rank-3"];

function hrefOf(e: HotStripEntry): string {
  return e.storyPublicId ? `/story/${e.storyPublicId}` : e.itemId ? `/items/${e.itemId}` : "/hot";
}

/** Where the heat is heading, as a small arrow (a "新" mark for a story new to the ranking). */
function TrendMark({ trend }: { trend: HotStripEntry["trend"] }) {
  const translate = useText();
  if (trend === "up") return <IconTrendUp size={14} strokeWidth={2.2} className="text-hot" aria-label={translate("热度上升")} />;
  if (trend === "down") return <IconTrendDown size={14} strokeWidth={2.2} className="text-ink-4" aria-label={translate("热度回落")} />;
  if (trend === "new") return <span className="rounded-full bg-accent-soft px-1.5 text-[10.5px] font-semibold leading-4 text-accent"><Text>新</Text></span>;
  if (trend === "unknown") return null; // sources behind on collection: no comparison to show
  return <IconMinus size={14} strokeWidth={2.2} className="text-ink-4" aria-label={translate("热度持平")} />;
}

/** A compact top-three overview above the feed, with the complete ranking one tap away. */
export function HotTopics({ entries }: { entries: HotStripEntry[] }) {
  const translate = useText();
  if (entries.length === 0) return null;
  return (
    <section
      aria-labelledby="hot-topics"
      className="hot-editorial"
    >
      <div className="hot-editorial-heading">
        <h2 id="hot-topics" className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          <span className="relative flex size-2" aria-hidden="true">
            <span className="relative inline-flex size-2 rounded-full bg-hot" />
          </span><Text>
          全站热点
        </Text></h2>
        <Link to="/hot" className="group -my-2 -mr-1.5 inline-flex h-10 items-center gap-1 px-1.5 text-[12.5px] text-ink-3 transition-colors hover:text-accent lg:my-0 lg:mr-0 lg:h-auto lg:px-0"><Text>
          完整榜单 </Text><IconArrowRight size={13} className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </div>
      <ol className="hot-editorial-list">
        {entries.slice(0, 3).map((e, i) => (
          <li key={e.rank}>
            <Link viewTransition
              to={hrefOf(e)}
              className="hot-topic-link group"
            >
              <span className={`hot-topic-rank num ${RANK_COLOR[i] ?? "text-rank-rest"}`}><Text>{e.rank}</Text></span>
              <span className="hot-topic-title"><Text content>{e.title}</Text></span>
              <span className="hot-topic-meta">
                <span className="whitespace-nowrap text-right text-[12.5px] text-ink-4" title={translate("热度指数")}>
                  <span className="num text-[13.5px] font-semibold text-ink-2"><Text>{Math.round(e.heat)}</Text></span><span className="hidden lg:inline"><Text> 热度</Text></span>
                </span>
                <span className="flex w-5 justify-center">
                  <TrendMark trend={e.trend} />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
