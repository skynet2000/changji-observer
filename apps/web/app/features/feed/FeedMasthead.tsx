import { FEED_EDITORIAL } from "@aihot/site";
import { Link } from "react-router";
import { Text } from "../../lib/text";
import { IconArrowUpRight } from "../../components/icons";

/** A compact editorial identity; filters and the actual news stay close to the first screen. */
export function FeedMasthead({ all = false }: { all?: boolean }) {
  return <section className="feed-masthead">
    <div>
      <p className="editorial-kicker">{FEED_EDITORIAL.imprint} <span aria-hidden="true">/</span> <Text>{FEED_EDITORIAL.kicker}</Text></p>
      <h1><Text>{all ? FEED_EDITORIAL.allTitle : FEED_EDITORIAL.featuredTitle}</Text></h1>
      <p className="feed-masthead-dek"><Text>{all ? FEED_EDITORIAL.allLead : FEED_EDITORIAL.featuredLead}</Text></p>
    </div>
    <Link to="/daily" className="edition-link"><span className="mono text-[10px] tracking-[0.16em]">THE BRIEF</span><span className="mt-2 flex items-center gap-5 text-[15px] font-semibold"><Text>读一份日报</Text><IconArrowUpRight size={20} /></span></Link>
  </section>;
}
