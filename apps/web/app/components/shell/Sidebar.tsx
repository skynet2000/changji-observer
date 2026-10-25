import { EDITORIAL } from "@aihot/site";
import { Link, useLocation, useSearchParams } from "react-router";
import { Text, useText } from "../../lib/text";
import { feedScopeHref, sidebar, sidebarIsActive } from "./nav";
import { useChangelogDot } from "./Header";
import { ThemeSwitch } from "./ThemeSwitch";
import { IntentLink } from "../ui/IntentLink";

/** Page navigation is separate from the feed's category filters. */
export function Sidebar({ changelogVersion }: { changelogVersion: string | null }) {
  const translate = useText();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const dot = useChangelogDot(changelogVersion);
  const feed = pathname === "/" || pathname === "/all";
  return <aside className="site-sidebar">
    <nav aria-label={translate("主导航")}>
      {sidebar().filter(section => section.items.length).map(section => <section key={section.title} className="sidebar-section">
        <h2><Text>{section.title}</Text></h2>
        {section.items.map(item => <IntentLink key={item.to}
          to={feed && (item.to === "/" || item.to === "/all") ? feedScopeHref(item.to, params) : item.to}
          aria-current={sidebarIsActive(item, pathname) ? "page" : undefined} className="sidebar-link">
          <item.icon size={19} /><span><Text>{item.label}</Text></span>
          {dot && item.changelog && <span className="size-1.5 rounded-full bg-hot" />}
        </IntentLink>)}
      </section>)}
    </nav>
    <div className="sidebar-footer">
      <div className="mb-4 flex items-center justify-between gap-2"><span><Text>外观</Text></span><ThemeSwitch className="w-[110px]" /></div>
      <div className="flex flex-wrap gap-x-4 gap-y-2"><Link to="/terms"><Text>使用规则</Text></Link><Link to="/privacy"><Text>隐私说明</Text></Link><a href={EDITORIAL.selectionEnabled ? "/feed.xml" : "/feed/all.xml"}>RSS</a></div>
    </div>
  </aside>;
}
