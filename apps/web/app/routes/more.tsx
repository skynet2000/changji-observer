import { Text, useText } from "@aihot/web/lib/text";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouteLoaderData } from "react-router";
import { POLICY, SITE } from "@aihot/site";
import type { loader as rootLoader } from "../root";
import { useChangelogDot } from "../components/shell/Header";
import { PhoneBar } from "../components/shell/PhoneBar";
import { inNav } from "../components/shell/nav";
import type { Screen } from "../components/shell/screens";
import { edgeTtl } from "../lib/api.server";
import { webModules } from "../site-modules";
import { pageMeta } from "../lib/seo";
import { setFontPreference, useFontPreference, useStarred } from "../lib/local-state";
import { Select } from "../components/ui/Controls";
import { ThemeSwitch } from "../components/shell/ThemeSwitch";
import { IconBookmark, IconChevronRight, IconGrid, IconHeart, IconMessage, IconMoon, IconPlug, IconSparkles } from "../components/icons";

export const handle: Screen = { tab: "me", name: "我的" };

export function headers() {
  return edgeTtl(300);
}

export function meta() {
  return pageMeta({ title: "我的", path: "/more", noindex: true });
}

/**
 * "我的", the phone's last tab (the address stays /more): this browser's bookmarks and appearance first,
 * then the tools, then the site's own pages.
 */
type Row = { to: string; label: string; icon: ReactNode; detail?: ReactNode };

/** The ways in that the agent page offers, the modules' first; its row names the first three. */
const agentWays = () => [...webModules().flatMap((m) => m.agentWays ?? []), "MCP", "RSS", "API"];

/** The modules' tools first, then the engine's. */
const tools = (): Row[] => [
  ...webModules().flatMap((m) => m.tools ?? []),
  ...(inNav("/topics") ? [{ to: "/topics", label: "主题", icon: <IconGrid size={20} /> }] : []),
  { to: "/agent", label: "Agent 接入", icon: <IconPlug size={20} />, detail: agentWays().slice(0, 3).join(" · ") },
];

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section>
      {title && <h2 className="px-4 pb-2 pt-6 text-[13px] font-semibold text-ink-3"><Text>{title}</Text></h2>}
      <ul className="card divide-y divide-line-soft overflow-hidden">{children}</ul>
    </section>
  );
}

function RowLink({ row, dot = false }: { row: Row; dot?: boolean }) {
  const translate = useText();
  return (
    <li>
      <Link viewTransition to={row.to} className="flex min-h-[52px] items-center gap-3 px-4 text-[16px] font-medium text-ink transition-colors active:bg-bg-sunk lg:hover:bg-bg-sunk">
        <span className="text-ink-3"><Text>{row.icon}</Text></span>
        <span className="flex flex-1 items-center gap-2">
          <Text>{row.label}</Text>
          {dot && <span className="size-[7px] rounded-full bg-hot" aria-label={translate("有新的更新")} />}
        </span>
        {row.detail && <span className="text-[14px] font-normal text-ink-4"><Text>{row.detail}</Text></span>}
        <IconChevronRight size={16} className="text-ink-4" />
      </Link>
    </li>
  );
}

export default function MorePage() {
  const translate = useText();
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const changelogDot = useChangelogDot(root?.changelogVersion ?? null);
  const starred = useStarred();
  const font = useFontPreference();
  // The count is this browser's: shown once the page runs here, never in the shared server copy.
  const [here, setHere] = useState(false);
  useEffect(() => setHere(true), []);
  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-8">
      <PhoneBar title={translate("我的")} large />
      <h1 className="hidden pb-4 pt-1 text-[22px] font-bold text-ink lg:block"><Text>我的</Text></h1>
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-4 2xl:grid-cols-3">
        <Group>
          <RowLink row={{ to: "/starred", label: "收藏", icon: <IconBookmark size={20} />, detail: here && starred.length > 0 ? <span className="num"><Text>{starred.length}</Text></span> : undefined }} />
          <li className="flex min-h-[56px] items-center gap-3 px-4 text-[16px] font-medium text-ink">
            <span className="text-ink-3">
              <IconMoon size={20} />
            </span>
            <span className="flex-1"><Text>外观</Text></span>
            <ThemeSwitch className="w-[126px]" />
          </li>
          <li className="flex min-h-[56px] items-center gap-3 px-4 text-[16px] font-medium text-ink">
            <span className="w-5 text-center text-ink-3" aria-hidden="true">Aa</span>
            <span className="flex-1"><Text>字体</Text></span>
            <Select aria-label={translate("字体")} value={font ?? "system"} onChange={(e) => setFontPreference(e.target.value === "browser" ? "browser" : null)}>
              <option value="system"><Text>默认字体</Text></option>
              <option value="browser"><Text>浏览器默认字体</Text></option>
            </Select>
          </li>
        </Group>
        <Group title={translate("工具与入口")}>
          {tools().map((r) => (
            <RowLink key={r.to} row={r} />
          ))}
        </Group>
        <Group title={translate("帮助与反馈")}>
          {inNav("/about") && <RowLink row={{ to: "/about", label: `关于 ${SITE.name}`, icon: <IconHeart size={20} /> }} />}
          {inNav("/changelog") && <RowLink row={{ to: "/changelog", label: "更新日志", icon: <IconSparkles size={20} /> }} dot={changelogDot} />}
          <RowLink row={{ to: "/feedback", label: "意见反馈", icon: <IconMessage size={20} /> }} />
        </Group>
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[12px] leading-[2] text-ink-4">
        <Link viewTransition to="/terms" className="hover:text-ink-2"><Text>{POLICY.terms.name}</Text></Link>
        <Link viewTransition to="/privacy" className="hover:text-ink-2"><Text>隐私说明</Text></Link>
        <a href="/feed.xml" className="hover:text-ink-2">RSS</a>
        {SITE.github && <a href={SITE.github} target="_blank" rel="noopener noreferrer" className="hover:text-ink-2"><Text>GitHub 开源</Text></a>}
        {SITE.icp && <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" className="hover:text-ink-2"><Text>{SITE.icp}</Text></a>}
      </div>
    </div>
  );
}
