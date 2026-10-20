import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { SITE } from "@aihot/site";
import { Wordmark } from "@aihot/site/brand/Logo.tsx";
import { Text, useText } from "../../lib/text";
import { useChangelogSeen } from "../../lib/local-state";
import { webModules } from "../../site-modules";
import { IconChevronDown } from "../icons";
import { Menu } from "../ui/Menu";
import { inNav, sidebar, sidebarIsActive } from "./nav";
import { ThemeSwitch } from "./ThemeSwitch";

export function useChangelogDot(latestVersion: string | null): boolean {
  const seen = useChangelogSeen();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && inNav("/changelog") && !!latestVersion && (!seen || seen < latestVersion);
}

/** One stable home for navigation and the reader account, on every screen size. */
export function Header({ changelogVersion }: { changelogVersion: string | null }) {
  const translate = useText();
  const { pathname } = useLocation();
  const dot = useChangelogDot(changelogVersion);
  const sections = sidebar();
  const primary = sections[0]?.items.slice(0, 4) ?? [];
  const secondary = [...(sections[0]?.items.slice(4) ?? []), ...sections.slice(1).flatMap(section => section.items)];
  return <header className="site-header" data-site-header="">
    <div className="site-header-inner">
      <Link to="/" className="shrink-0 text-ink" aria-label={translate(`${SITE.name} 首页`)}><Wordmark size={25} /></Link>
      <nav className="site-nav" aria-label={translate("主导航")}>
        {primary.map(item => <Link key={item.to} to={item.to} prefetch="intent" aria-current={sidebarIsActive(item, pathname) ? "page" : undefined} className="site-nav-link"><Text>{item.label}</Text></Link>)}
        {secondary.length > 0 && <Menu label="更多" trigger={<><span className="mr-1 text-[13px]"><Text>更多</Text></span><IconChevronDown size={13} /></>}>
          {close => <div className="min-w-48">{secondary.map(item => <Link role="menuitem" key={item.to} to={item.to} onClick={close} aria-current={sidebarIsActive(item, pathname) ? "page" : undefined} className="flex min-h-11 items-center gap-3 px-4 text-[13px] text-ink-3 hover:bg-accent-soft hover:text-accent"><item.icon size={16} /><Text>{item.label}</Text>{dot && item.changelog && <span className="size-1.5 rounded-full bg-hot" />}</Link>)}</div>}
        </Menu>}
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
        <ThemeSwitch className="hidden w-[92px] xl:grid" />
        {webModules().map(m => m.root?.ToolbarControl && <m.root.ToolbarControl key={m.name} />)}
        {webModules().map(m => m.root?.AccountControl && <m.root.AccountControl key={m.name} />)}
      </div>
    </div>
  </header>;
}
