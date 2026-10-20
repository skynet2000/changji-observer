import { Text, useText } from "@aihot/web/lib/text";
import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import type { WebModule } from "@aihot/web/modules";
import { useReader, watchReader } from "./web/client.ts";
import { IconChevronRight } from "@aihot/web/components/icons";

function AccountControl() {
  const translate = useText();
  const status = useReader();
  const { pathname } = useLocation();
  if (!status.enabled || (!status.user && status.providers.length === 0)) return null;
  return <Link to="/account" aria-label={status.user ? `${status.user.name} · ${translate("读者账号")}` : translate("登录并同步")} aria-current={pathname === "/account" ? "page" : undefined}
    data-reader-entry="header" className={`reader-entry ${status.user ? "reader-entry-signed" : ""}`}>
    {status.user ? <><span aria-hidden="true" className="reader-avatar">{Array.from(status.user.name)[0]?.toUpperCase()}</span><span className="hidden max-w-28 truncate sm:inline">{status.user.name}</span></> : <><span><Text>登录</Text></span><IconChevronRight size={14} /></>}
  </Link>;
}
function Reader() { useEffect(watchReader, []); return null; }
const reader: WebModule = { name: "reader", root: { Bottom: Reader, AccountControl } };
export default reader;
