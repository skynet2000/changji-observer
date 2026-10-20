import { useEffect, useState } from "react";
import { Link } from "react-router";
import { SITE } from "@aihot/site";
import { Wordmark } from "@aihot/site/brand/Logo.tsx";
import { Text, useText } from "../../lib/text";
import { useChangelogSeen } from "../../lib/local-state";
import { webModules } from "../../site-modules";
import { inNav } from "./nav";

export function useChangelogDot(latestVersion: string | null): boolean {
  const seen = useChangelogSeen();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && inNav("/changelog") && !!latestVersion && (!seen || seen < latestVersion);
}

/** The account and language stay in the same top-right position on every page. */
export function Header() {
  const translate = useText();
  return <header className="site-header" data-site-header="">
    <div className="site-header-inner">
      <Link to="/" className="site-brand" aria-label={translate(`${SITE.name} 首页`)}><Wordmark size={25} /></Link>
      <span className="site-header-note"><Text>互联网 · 公司 · 人</Text></span>
      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
        {webModules().map(m => m.root?.ToolbarControl && <m.root.ToolbarControl key={m.name} />)}
        {webModules().map(m => m.root?.AccountControl && <m.root.AccountControl key={m.name} />)}
      </div>
    </div>
  </header>;
}
