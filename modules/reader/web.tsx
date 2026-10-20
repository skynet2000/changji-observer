import { useEffect } from "react";
import { Link } from "react-router";
import type { WebModule } from "@aihot/web/modules";
import { useReader, watchReader } from "./web/client.ts";

function Reader() {
  const status = useReader();
  useEffect(watchReader, []);
  if (!status.enabled || (!status.user && status.providers.length === 0)) return null;
  return <div className="fixed bottom-20 right-4 z-30 rounded-full border border-line bg-bg-raised px-4 py-2 text-[13px] shadow-sm lg:bottom-4">
    <Link to="/account" className="text-ink-2">{status.user ? `${status.user.name} · 账号` : "登录并同步"}</Link>
  </div>;
}
const reader: WebModule = { name: "reader", root: { Bottom: Reader } };
export default reader;
