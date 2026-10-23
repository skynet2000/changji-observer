import { Text } from "@aihot/web/lib/text";
import { Link } from "react-router";
import type { HotStripEntry } from "@aihot/contracts/site";
import { IconArrowRight } from "../../components/icons";
import { RankList } from "../hot/RankList";

/** Five ranked topics on desktop, three on phones; the complete board is one tap away. */
export function HotTopics({ entries }: { entries: HotStripEntry[] }) {
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
      <RankList entries={entries.slice(0, 5)} label="热点榜" />
    </section>
  );
}
