import { Text, useText } from "@aihot/web/lib/text";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { SITE } from "@aihot/site";
import { RingMark } from "@aihot/site/brand/Logo.tsx";
import { pageMeta } from "@aihot/web/lib/seo";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import { IconArrowRight, IconBookmark, IconGithub } from "@aihot/web/components/icons";
import { endReader, importGuestReading, syncReader, useReader } from "./client.ts";

export const handle = { tab: "me", name: "读者账号" };
export const headers = () => ({ "Cache-Control": "private, no-store" });
export const meta = () => pageMeta({ title: "读者账号", path: "/account", noindex: true });

function GoogleMark() {
  return <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z" />
    <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.97-3.38.97-2.6 0-4.81-1.76-5.6-4.12H3.05v2.59A10 10 0 0 0 12 22Z" />
    <path fill="#FBBC05" d="M6.4 13.93a6 6 0 0 1 0-3.86V7.48H3.05a10 10 0 0 0 0 9.04l3.35-2.59Z" />
    <path fill="#EA4335" d="M12 5.95c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.48l3.35 2.59c.79-2.36 3-4.12 5.6-4.12Z" />
  </svg>;
}

export default function Account() {
  const translate = useText();
  const reader = useReader(); const [query] = useSearchParams();
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [confirmed, setConfirmed] = useState(false);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "操作失败，请重试。"); } finally { setBusy(false); }
  }
  const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-line-strong px-4 py-2 text-[14px] font-medium text-ink transition-colors hover:bg-bg-sunk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50";
  const unavailable = !reader.enabled || (!reader.user && reader.providers.length === 0);
  return <div className="account-page mx-auto max-w-[640px] pb-8">
    <PhoneBar title={translate("读者账号")} back={{ to: "/", label: "返回阅读" }} />
    <div className="mx-auto max-w-[440px] pt-6 sm:pt-12 lg:pt-14">
      <div className="mb-6 flex items-center justify-center gap-2 text-accent"><RingMark className="size-6" /><span className="text-[15px] font-bold tracking-wide"><Text>{SITE.name}</Text></span></div>
      <section className="account-card overflow-hidden rounded-sheet border border-line bg-surface shadow-[0_16px_64px_rgba(25,36,52,0.06)]">
        <div className="px-6 pb-7 pt-8 sm:px-8">
          <div className="mb-7 text-center">
            {reader.user && <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-accent-soft text-[22px] font-semibold text-accent" aria-hidden="true">{Array.from(reader.user.name)[0]}</div>}
            <h1 data-page-title="" className="text-[27px] font-bold tracking-[-0.03em] text-ink"><Text>{reader.user ? "我的阅读记录" : `登录${SITE.name}`}</Text></h1>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-3">{reader.user ? `${reader.user.name} · ${reader.user.provider === "google" ? "Google" : "GitHub"}` : <Text>收藏好内容，换台设备接着读。</Text>}</p>
          </div>
          {query.has("error") && <p role="alert" className="mb-4 rounded-control bg-hot-soft p-3 text-[13px] text-hot"><Text>登录未完成或授权已过期，请重新尝试。</Text></p>}
          {reader.loading ? <p role="status" className="py-6 text-center text-[14px] text-ink-3"><Text>正在读取账号状态…</Text></p> : unavailable ? <p className="text-[14px] leading-relaxed text-ink-3"><Text>读者登录尚未开放。收藏、已读仍保存在当前浏览器。</Text></p> : !reader.user ? <>
            <div className="space-y-3">{reader.providers.map(p => <a href={`/api/reader/login/${p}`} key={p}
              className={`flex min-h-12 items-center justify-center gap-3 rounded-control border text-[14px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${p === "google" ? "border-line-strong bg-surface text-ink hover:bg-bg-sunk" : "border-ink bg-ink text-bg hover:opacity-90"}`}>
              {p === "google" ? <GoogleMark /> : <IconGithub size={20} />}<Text>{p === "google" ? "使用 Google 登录" : "使用 GitHub 登录"}</Text></a>)}</div>
            <p className="mt-4 text-center text-[12px] text-ink-4"><Text>无需设置密码 · 首次登录自动创建账号</Text></p>
            <div className="mt-7 flex items-start gap-3 border-t border-line-soft pt-5"><IconBookmark size={18} className="mt-0.5 shrink-0 text-accent" /><p className="text-[12px] leading-relaxed text-ink-3"><Text>跨设备同步收藏与已读。日常阅读无需登录，本机旧记录由你选择是否导入。</Text></p></div>
          </> : <>
            <p role="status" className="mb-5 rounded-control bg-accent-soft px-3 py-2.5 text-[13px] leading-relaxed text-accent"><Text>{reader.message}</Text></p>
            <Link to="/starred" className="flex min-h-12 items-center justify-center gap-2 rounded-control bg-accent text-[14px] font-semibold text-accent-contrast hover:opacity-90"><Text>查看我的收藏</Text><IconArrowRight size={16} /></Link>
            <div className="mt-3 grid grid-cols-2 gap-3"><button disabled={busy} className={button} onClick={() => act(syncReader)}><Text>立即同步</Text></button><button disabled={busy} className={button} onClick={() => act(() => endReader())}><Text>退出登录</Text></button></div>
            <div className="mt-6 border-t border-line-soft pt-5"><h2 className="text-[13px] font-semibold"><Text>导入本机记录</Text></h2><p className="mb-3 mt-1 text-[12px] leading-relaxed text-ink-4"><Text>将此浏览器原有的收藏与已读合并到当前账号。</Text></p><button disabled={busy} className={`${button} w-full`} onClick={() => act(importGuestReading)}><Text>导入本机原有收藏与已读</Text></button></div>
          </>}
          {error && <p role="alert" className="mt-4 rounded-control bg-hot-soft p-3 text-[13px] text-hot"><Text>{error}</Text></p>}
          {!reader.user && reader.message && <p role="status" className="mt-4 text-[12px] leading-relaxed text-ink-3"><Text>{reader.message}</Text></p>}
        </div>
        <div className="border-t border-line-soft bg-bg-sunk/50 px-6 py-4 text-center text-[11px] leading-relaxed text-ink-4 sm:px-8">
          <Text>{reader.user ? "离线时先保存在本机，联网后自动同步。" : <><Text>继续即表示同意</Text><Link to="/terms" className="mx-1 text-ink-3 underline underline-offset-2"><Text>使用规则</Text></Link><Text>和</Text><Link to="/privacy" className="ml-1 text-ink-3 underline underline-offset-2"><Text>隐私说明</Text></Link></>}</Text>
        </div>
      </section>
      <p className="mt-5 text-center text-[12px] leading-relaxed text-ink-4"><Text>Google 与 GitHub 暂为独立账号，请固定使用同一种方式。</Text></p>
      {reader.user && <details className="mt-5 rounded-control border border-line p-4 text-[12px] text-ink-3"><summary className="cursor-pointer"><Text>账号与数据管理</Text></summary>
        <p className="mt-3 leading-relaxed"><Text>收藏最多 500 条、已读最多 5000 条。退出后恢复本机匿名记录。删除本站账号将永久删除云端记录及所有会话，备份副本随七天轮转清理；不会删除你的 Google 或 GitHub 账号。</Text></p>
        <label className="mt-4 flex items-start gap-2"><input className="mt-0.5" type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><Text>我确认删除本站账号与云端记录</Text></label>
        <button disabled={busy || !confirmed} className={`${button} mt-3 w-full text-hot`} onClick={() => act(() => endReader(true))}><Text>永久删除本站账号</Text></button>
      </details>}
      {!reader.user && <div className="mt-6 text-center"><Link to="/starred" className="text-[13px] text-ink-3 hover:text-accent"><Text>查看我的收藏</Text></Link></div>}
    </div>
  </div>;
}
