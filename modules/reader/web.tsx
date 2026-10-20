import { Text, useText } from "@aihot/web/lib/text";
import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import type { WebModule } from "@aihot/web/modules";
import { useReader, watchReader } from "./web/client.ts";
import { IconBookmark, IconChevronRight } from "@aihot/web/components/icons";

function AccountControl({ compact = false }: { compact?: boolean }) {
  const translate = useText();
  const status = useReader();
  const { pathname } = useLocation();
  if (!status.enabled || (!status.user && status.providers.length === 0)) return null;
  if (compact && pathname === "/account") return null;
  const label = status.user ? `${status.user.name}的读者账号` : "登录并同步";
  const avatar = status.user ? Array.from(status.user.name)[0]?.toUpperCase() : <IconBookmark size={17} />;
  return <Link to="/account" aria-label={translate(label)} aria-current={pathname === "/account" ? "page" : undefined}
    data-reader-entry={compact ? "toolbar" : "sidebar"}
    className={`flex items-center gap-2 rounded-control transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${compact
      ? "min-h-11 shrink-0 px-2 text-[13px] font-semibold text-accent hover:bg-accent-soft"
      : `w-full px-2.5 py-3 ${status.user ? "border border-line bg-surface hover:bg-bg-sunk" : "bg-accent text-accent-contrast hover:opacity-90"}`}`}>
    <span aria-hidden="true" className={`grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-semibold ${status.user ? "bg-accent-soft text-accent" : compact ? "bg-accent-soft" : "bg-white/15"}`}>{avatar}</span>
    {compact ? !status.user && <span><Text>登录</Text></span> : <>
      <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold">{status.user ? status.user.name : <Text>登录 / 注册</Text>}</span><span className={`mt-0.5 block text-[10px] ${status.user ? "text-ink-4" : "text-white/75"}`}><Text>{status.user ? "我的收藏与同步" : "收藏与已读，随身同步"}</Text></span></span>
      <IconChevronRight size={14} />
    </>}
  </Link>;
}
function Reader() { useEffect(watchReader, []); return null; }
const reader: WebModule = { name: "reader", root: { Bottom: Reader, AccountControl } };
export default reader;
