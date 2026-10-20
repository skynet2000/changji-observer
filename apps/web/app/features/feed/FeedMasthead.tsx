import { Link } from "react-router";
import { Text } from "../../lib/text";
import { IconArrowUpRight } from "../../components/icons";

/** A compact editorial identity; filters and the actual news stay close to the first screen. */
export function FeedMasthead({ all = false }: { all?: boolean }) {
  return <section className="feed-masthead">
    <div>
      <p className="editorial-kicker">CHANGJI OBSERVER <span aria-hidden="true">/</span> <Text>互联网 · 公司 · 人</Text></p>
      <h1><Text>{all ? "行业变化，持续发生。" : "看见大厂的下一步。"}</Text></h1>
      <p className="feed-masthead-dek"><Text>{all ? "从业务竞争到组织变动，沿着时间读懂事情的来龙去脉。" : "追踪企业发展，关注职场处境。把分散的消息，读成有脉络的变化。"}</Text></p>
    </div>
    <Link to="/daily" className="edition-link"><span className="mono text-[10px] tracking-[0.16em]">THE BRIEF</span><span className="mt-2 flex items-center gap-5 text-[15px] font-semibold"><Text>读一份日报</Text><IconArrowUpRight size={20} /></span></Link>
  </section>;
}
