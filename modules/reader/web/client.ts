import { useSyncExternalStore } from "react";
import { getReadIds, getStarred, readJson, replaceReadingState, subscribeReadingState, writeRaw } from "@aihot/web/lib/local-state";
import { emptyState, mergeReading, sameReading, type ReadingState } from "../state.ts";

interface Session {
  enabled: boolean; providers: string[]; user: { id: string; name: string; provider: string } | null;
  csrf?: string; state?: ReadingState; version?: number;
}
const initial: Session & { message: string; loading: boolean } = { enabled: false, providers: [], user: null, message: "", loading: true };
let status = initial;
const listeners = new Set<() => void>();
const publish = (patch: Partial<typeof status>) => { status = { ...status, ...patch }; for (const fn of listeners) fn(); };
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const useReader = () => useSyncExternalStore(subscribe, () => status, () => initial);
const OWNER = "changji-reader-snapshot-v1", GUEST = "changji-guest-reading-v1";
const local = (): ReadingState => ({ starred: getStarred(), read: getReadIds() });
type Owner = { id: string; base: ReadingState };
const owner = () => readJson(OWNER) as Owner | null;
const guest = () => readJson(GUEST) as ReadingState | null;
const pendingKey = (id: string) => `changji-reader-pending-v1:${id}`;
let applying = false;
function replace(state: ReadingState) {
  applying = true;
  try { if (!replaceReadingState(state)) throw Error("浏览器存储不可用，云端记录没有丢失，请导出本机收藏后重试。"); }
  finally { applying = false; }
}
function restoreGuest(preservePending = true) {
  const current = owner();
  if (!current) return;
  if (preservePending && !writeRaw(pendingKey(current.id), JSON.stringify({ base: current.base, state: local() }))) throw Error("登录已过期，但本机记录未能备份。请先导出收藏，再重新登录。");
  if (!preservePending) writeRaw(pendingKey(current.id), null);
  replace(guest() ?? emptyState()); writeRaw(OWNER, null); writeRaw(GUEST, null);
}
let inFlight: Promise<boolean> | null = null;
export function syncReader(): Promise<boolean> {
  if (inFlight) return inFlight;
  inFlight = synchronize().finally(() => { inFlight = null; });
  return inFlight;
}
async function synchronize(): Promise<boolean> {
  try {
    const response = await fetch("/api/reader/session", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw Error("暂时无法连接同步服务，本机记录会保留。");
    const remote = await response.json() as Session;
    publish({ ...remote, loading: false });
    if (!remote.user) { restoreGuest(); return true; }
    const previous = owner();
    if (previous?.id !== remote.user.id) {
      if (previous) restoreGuest();
      if (!guest() && !writeRaw(GUEST, JSON.stringify(local()))) throw Error("浏览器无法保存本机记录，暂不切换到云端。");
      const pending = readJson(pendingKey(remote.user.id)) as { base: ReadingState; state: ReadingState } | null;
      replace(pending ? mergeReading(pending.base, pending.state, remote.state!) : remote.state!);
      if (!writeRaw(OWNER, JSON.stringify({ id: remote.user.id, base: remote.state }))) throw Error("浏览器无法保存同步状态。");
      publish({ message: "云端记录已加载。本机原有记录可在下方选择导入。" });
      return true;
    }
    const beforeRequest = local();
    const merged = mergeReading(previous.base, beforeRequest, remote.state!);
    let cloud = remote;
    if (!sameReading(merged, remote.state!)) {
      publish({ message: "正在同步…" });
      const result = await fetch("/api/reader/state", { method: "PUT", headers: { "content-type": "application/json", "x-csrf-token": remote.csrf! },
        body: JSON.stringify({ userId: remote.user.id, version: remote.version, state: merged }), signal: AbortSignal.timeout(15_000) });
      if (result.status === 409) { publish({ message: "其他设备有更新，稍后自动合并。" }); return false; }
      if (!result.ok) throw Error("同步尚未成功，本机记录已保留，请稍后重试。");
      cloud = { ...remote, ...await result.json() };
    }
    // Cookie/account changes in another tab must never import the previous reader's data into a new one.
    if (owner()?.id !== remote.user.id) return false;
    const next = mergeReading(beforeRequest, local(), cloud.state!);
    replace(next);
    if (!writeRaw(OWNER, JSON.stringify({ id: remote.user.id, base: cloud.state }))) throw Error("无法保存同步状态，请检查浏览器存储。");
    publish({ ...cloud, message: sameReading(next, cloud.state!) ? "收藏与已读已同步" : "本机还有新操作，稍后继续同步。" });
    if (sameReading(next, cloud.state!)) writeRaw(pendingKey(remote.user.id), null);
    return sameReading(next, cloud.state!);
  } catch (error) {
    publish({ loading: false, message: error instanceof Error ? error.message : "同步暂不可用，本机记录会保留。" });
    return false;
  }
}

export function watchReader() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const edited = () => {
    if (applying || !status.user) return;
    clearTimeout(timer); timer = setTimeout(() => { void syncReader(); }, 700);
  };
  const unsub = subscribeReadingState(edited);
  const refresh = () => { if (document.visibilityState === "visible") void syncReader(); };
  document.addEventListener("visibilitychange", refresh); window.addEventListener("online", refresh);
  const poll = setInterval(() => { if (status.user) refresh(); }, 30_000);
  void syncReader();
  return () => { unsub(); clearTimeout(timer); clearInterval(poll); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("online", refresh); };
}

export async function importGuestReading() {
  if (!status.user || owner()?.id !== status.user.id) return;
  replace(mergeReading(emptyState(), guest() ?? emptyState(), local()));
  await syncReader();
}
export async function endReader(deleteAccount = false) {
  if (!status.user) return;
  if (!deleteAccount && !await syncReader()) throw Error("请先完成同步再退出，避免遗漏本机的新操作。");
  const result = await fetch(deleteAccount ? "/api/reader/account" : "/api/reader/logout", { method: deleteAccount ? "DELETE" : "POST",
    headers: { "x-csrf-token": status.csrf! }, signal: AbortSignal.timeout(15_000) });
  if (!result.ok) throw Error("操作未完成，请刷新后重试。");
  restoreGuest(false); publish({ user: null, csrf: undefined, state: undefined, version: undefined, message: deleteAccount ? "账号及云端阅读记录已删除。" : "已退出，恢复为本机匿名记录。" });
}
