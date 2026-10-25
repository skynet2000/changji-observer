import { Text, useText } from "@aihot/web/lib/text";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouteLoaderData } from "react-router";
import { EDITORIAL, POLICY, SITE } from "@aihot/site";
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
import { IconArrowUpRight, IconBookmark, IconUser, IconChevronRight, IconGrid, IconHeart, IconMessage, IconMoon, IconPlug, IconSparkles } from "../components/icons";

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

function Group({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      {title && <h2 className="px-4 pb-2 pt-6 text-[13px] font-semibold text-ink-3"><Text>{title}</Text></h2>}
      <ul className="card divide-y divide-line-soft overflow-hidden">{children}</ul>
    </section>
  );
}

function RowLink({ row, dot = false }: { row: Row; dot?: boolean }) {
  const translate = useText();
  return (
    <li>
      <Link viewTransition to={row.to} className="flex min-h-[52px] items-center gap-3 px-4 text-[16px] font-medium text-ink transition-colors active:bg-bg-sunk">
        <span className="shrink-0 text-ink-3"><Text>{row.icon}</Text></span>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <Text>{row.label}</Text>
          {dot && <span className="size-[7px] rounded-full bg-hot" aria-label={translate("有新的更新")} />}
        </span>
        {row.detail && <span className="max-w-[45%] text-right text-[14px] font-normal text-ink-4"><Text>{row.detail}</Text></span>}
        <IconChevronRight size={16} className="shrink-0 text-ink-4" />
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
  const help: Row[] = [
    ...(inNav("/about") ? [{ to: "/about", label: `关于 ${SITE.name}`, icon: <IconHeart size={20} /> }] : []),
    ...(inNav("/changelog") ? [{ to: "/changelog", label: "更新日志", icon: <IconSparkles size={20} /> }] : []),
    { to: "/feedback", label: "意见反馈", icon: <IconMessage size={20} /> },
  ];
  const fontControl = <Select className="min-w-0 max-w-[65%] lg:w-full lg:max-w-[300px] lg:[&_select]:h-[34px] lg:[&_select]:text-[14px]" aria-label={translate("字体")} value={font ?? "system"} onChange={(e) => setFontPreference(e.target.value === "browser" ? "browser" : null)}>
    <option value="system"><Text>默认字体</Text></option>
    <option value="browser"><Text>浏览器默认字体</Text></option>
  </Select>;
  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-8 lg:max-w-[920px] lg:pt-5">
      <PhoneBar title={translate("我的")} large />
      <div className="hidden lg:block">
        <div className="mb-6">
          <h1 className="text-[32px] font-bold tracking-[-0.035em] text-ink"><Text>我的</Text></h1>
          <p className="mt-2 text-[15px] text-ink-3"><Text>收藏好内容，按自己的习惯阅读。</Text></p>
        </div>
        <div data-reading-desk="" className="rounded-[24px] border border-line bg-surface p-6 shadow-[var(--shadow-soft)] xl:p-8">
          <div data-reading-shortcuts="" className="grid grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] gap-4">
            <Link viewTransition to="/account" aria-label={`${translate("读者账号")} · ${translate("收藏与已读")}`} className="group relative flex min-h-[188px] flex-col justify-between overflow-hidden rounded-[18px] border border-[#2e4c78] bg-[#122645] p-6 text-[#f8faff] transition-colors hover:bg-[#19365d]">
              <IconUser size={136} className="pointer-events-none absolute -right-6 -top-5 opacity-[0.06]" aria-hidden="true" />
              <div className="relative flex items-center gap-2 text-[13px] text-[#b5caff]"><IconUser size={17} /><Text>读者账号</Text></div>
              <div className="relative my-4">
                <h2 className="text-[23px] font-semibold tracking-[-0.025em]"><Text>收藏与已读</Text></h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[#b9c9e0]"><Text>跨设备同步，换台设备接着读。</Text></p>
              </div>
              <div className="relative flex items-center justify-between text-[13px] font-medium"><Text>管理账号</Text><IconArrowUpRight size={19} /></div>
            </Link>
            <Link viewTransition to="/starred" aria-label={translate("收藏")} className="group flex min-h-[188px] flex-col justify-between rounded-[18px] border border-line bg-accent-softer p-6 transition-colors hover:border-accent/45 hover:bg-accent-soft">
              <div className="flex items-center justify-between text-[13px] font-medium text-ink-3"><Text>收藏</Text><IconBookmark size={20} className="text-accent" /></div>
              <div className="my-3 flex items-baseline gap-2"><span className="num text-[46px] font-semibold leading-none tracking-[-0.045em] text-ink">{here ? starred.length : "—"}</span><span className="text-[12px] text-ink-3"><Text>条收藏</Text></span></div>
              <div className="flex items-center justify-between text-[13px] font-medium text-accent"><Text>查看我的收藏</Text><IconArrowUpRight size={19} /></div>
            </Link>
          </div>
          <section className="mt-7 border-t border-line-soft pt-6" aria-labelledby="desktop-preferences">
            <h2 id="desktop-preferences" className="text-[16px] font-semibold text-ink"><Text>阅读偏好</Text></h2>
            <p className="mt-1 text-[12px] text-ink-3"><Text>这些设置仅保存在当前浏览器。</Text></p>
            <ul className="mt-5 grid grid-cols-2">
              <li className="min-w-0 pr-6">
                <div className="mb-3 flex items-center gap-2 text-[13px] font-medium text-ink-2"><IconMoon size={17} /><Text>外观</Text></div>
                <ThemeSwitch labels className="w-full max-w-[300px]" />
              </li>
              <li className="min-w-0 border-l border-line-soft pl-6">
                <div className="mb-3 flex items-center gap-2 text-[13px] font-medium text-ink-2"><span aria-hidden="true">Aa</span><Text>字体</Text></div>
                {fontControl}
              </li>
            </ul>
          </section>
          <nav aria-label={translate("工具与帮助")} className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-line-soft pt-4">
            {[...tools(), ...help].map(r => <Link key={r.to} viewTransition to={r.to} className="flex min-h-9 items-center gap-2 text-[13px] text-ink-3 transition-colors hover:text-accent [&_svg]:size-4">
              {r.icon}<Text>{r.label}</Text>
              {r.to === "/changelog" && changelogDot && <span className="size-[7px] rounded-full bg-hot" aria-label={translate("有新的更新")} />}
            </Link>)}
          </nav>
        </div>
      </div>
      <div className="lg:hidden">
        <Group title="阅读与偏好">
          <RowLink row={{ to: "/account", label: "读者账号", icon: <IconUser size={20} />, detail: translate("收藏与已读") }} />
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
            {fontControl}
          </li>
        </Group>
        <Group title="工具与入口">
          {tools().map((r) => (
            <RowLink key={r.to} row={r} />
          ))}
        </Group>
        <Group title="帮助与反馈">
          {help.map(r => <RowLink key={r.to} row={r} dot={r.to === "/changelog" && changelogDot} />)}
        </Group>
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[12px] leading-[2] text-ink-4">
        <Link viewTransition to="/terms" className="hover:text-ink-2"><Text>{POLICY.terms.name}</Text></Link>
        <Link viewTransition to="/privacy" className="hover:text-ink-2"><Text>隐私说明</Text></Link>
        <a href={EDITORIAL.selectionEnabled ? "/feed.xml" : "/feed/all.xml"} className="hover:text-ink-2">RSS</a>
        {SITE.github && <a href={SITE.github} target="_blank" rel="noopener noreferrer" className="hover:text-ink-2"><Text>GitHub 开源</Text></a>}
        {SITE.icp && <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" className="hover:text-ink-2"><Text>{SITE.icp}</Text></a>}
      </div>
    </div>
  );
}
