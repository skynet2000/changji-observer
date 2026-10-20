import { Link } from "react-router";
import { FEED_WELCOME } from "@aihot/site";

/** An empty, unfiltered home still explains what readers can expect here. */
export function FeedWelcome() {
  return (
    <section aria-labelledby="feed-welcome" className="mt-5 rounded-2xl border border-line bg-surface p-5 lg:p-8">
      <p className="text-[12px] font-semibold tracking-wider text-accent">{FEED_WELCOME.kicker}</p>
      <h2 id="feed-welcome" className="mt-3 text-[26px] font-semibold leading-snug text-ink lg:text-[32px]">{FEED_WELCOME.title}</h2>
      <p className="mt-3 max-w-2xl text-[14px] leading-7 text-ink-3">{FEED_WELCOME.lead}</p>
      <div className="mt-5 rounded-xl bg-bg-sunk px-4 py-3" role="status">
        <p className="text-[14px] font-semibold text-ink">{FEED_WELCOME.status}</p>
        <p className="mt-1 text-[13px] leading-6 text-ink-3">{FEED_WELCOME.statusDetail}</p>
      </div>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {FEED_WELCOME.directions.map((direction) => (
          <li key={direction.category}>
            <Link to={`/?category=${direction.category}`} className="block h-full rounded-xl border border-line p-4 transition-colors hover:bg-bg-sunk focus-visible:outline-2 focus-visible:outline-accent">
              <h3 className="text-[15px] font-semibold text-ink">{direction.title}<span aria-hidden="true" className="float-right text-ink-4">↗</span></h3>
              <p className="mt-2 text-[13px] leading-6 text-ink-3">{direction.description}</p>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-3 text-[13px] font-medium text-accent">
        <Link to="/topics">浏览全部主题 →</Link>
        <Link to="/all">查看全部动态 →</Link>
      </div>
    </section>
  );
}
