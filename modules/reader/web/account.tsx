import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { pageMeta } from "@aihot/web/lib/seo";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import { endReader, importGuestReading, syncReader, useReader } from "./client.ts";

export const handle = { tab: "me", name: "读者账号" };
export const headers = () => ({ "Cache-Control": "private, no-store" });
export const meta = () => pageMeta({ title: "读者账号", path: "/account", noindex: true });
export default function Account() {
  const reader = useReader(); const [query] = useSearchParams();
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [confirmed, setConfirmed] = useState(false);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "操作失败，请重试。"); } finally { setBusy(false); }
  }
  const button = "rounded-control border border-line px-4 py-2 text-[14px] text-ink hover:bg-bg-sunk disabled:opacity-50";
  return <div className="mx-auto max-w-[640px] space-y-5 pb-8">
    <PhoneBar title="读者账号" />
    <h1 className="text-[26px] font-bold">登录，接着读</h1>
    <p className="text-ink-3">登录后跨设备同步收藏与已读。日常阅读始终无需登录。</p>
    {query.has("error") && <p role="alert">登录未完成或授权已过期，请重新尝试。</p>}
    {reader.loading ? <p role="status">正在读取账号状态…</p> : !reader.enabled || (!reader.user && reader.providers.length === 0) ? <p>读者登录尚未开放。收藏、已读仍保存在当前浏览器。</p> : !reader.user ? <section className="card space-y-4 p-5">
      <p className="text-[14px] text-ink-3">继续即表示同意<Link to="/terms" className="text-accent">使用规则</Link>和<Link to="/privacy" className="text-accent">隐私说明</Link>。只读取账号标识与昵称；不申请仓库、邮件或发帖权限。</p>
      <div className="flex flex-wrap gap-3">{reader.providers.map(p => <a className={button} href={`/api/reader/login/${p}`} key={p}>使用 {p === "google" ? "Google" : "GitHub"} 登录</a>)}</div>
      <p className="text-[13px] text-ink-4">Google 与 GitHub 暂为独立账号，请固定使用同一种方式。本机旧记录不会自动上传，可登录后手动导入。</p>
    </section> : <section className="card space-y-4 p-5">
      <p className="font-semibold">{reader.user.name} <span className="text-[13px] font-normal text-ink-4">· {reader.user.provider}</span></p>
      <p role="status" className="text-[14px] text-ink-3">{reader.message}</p>
      <div className="flex flex-wrap gap-3">
        <button disabled={busy} className={button} onClick={() => act(syncReader)}>立即同步</button>
        <button disabled={busy} className={button} onClick={() => act(importGuestReading)}>导入本机原有收藏与已读</button>
        <button disabled={busy} className={button} onClick={() => act(() => endReader())}>退出登录</button>
      </div>
      <p className="text-[13px] text-ink-4">离线时先保存在本机，联网后同步。退出后恢复匿名记录。收藏最多 500 条、已读最多 5000 条；同时操作时，本机尚未同步的修改在合并中优先，服务器用版本检查避免覆盖其他设备的更新。</p>
      <details className="border-t border-line pt-4"><summary className="cursor-pointer text-[14px] text-ink-3">删除读者账号</summary>
        <p className="my-3 text-[13px] text-ink-3">将永久删除本站账号、所有登录会话及云端收藏和已读。备份副本在轮转清理后移除。不会删除你的 Google 或 GitHub 账号。</p>
        <label className="block text-[14px]"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> 我确认删除本站账号与云端记录</label>
        <button disabled={busy || !confirmed} className={`${button} mt-3`} onClick={() => act(() => endReader(true))}>永久删除本站账号</button>
      </details>
    </section>}
    {!reader.user && reader.message && <p role="status" className="text-[14px] text-ink-3">{reader.message}</p>}
    {error && <p role="alert" className="text-[14px] text-hot">{error}</p>}
    <Link to="/starred" className="text-[14px] text-accent">返回收藏 →</Link>
  </div>;
}
