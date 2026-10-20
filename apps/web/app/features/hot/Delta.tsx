import { Text, useText } from "@aihot/web/lib/text";
import type { HotEntryView } from "@aihot/contracts/site";

/** Change against six hours before the ranking: up in the hot tone, down quiet, new stories marked new, none while sources are behind. */
export function Delta({ trend, pct, className = "" }: { trend: HotEntryView["trend"]; pct: number | null; className?: string }) {
  const translate = useText();
  const base = `inline-flex h-[22px] shrink-0 items-center gap-0.5 rounded-full px-2 text-[11.5px] font-medium tabular-nums ${className}`;
  if (trend === "unknown") return <span className={`${base} bg-bg-sunk text-ink-4 dark:bg-bg-muted/60`} title={translate("部分信源的采集暂时落后，先不和 6 小时前比较")}><Text>暂不比较</Text></span>;
  if (trend === "new" || pct === null) return <span className={`${base} bg-accent-soft text-accent`}><Text>新上榜</Text></span>;
  if (trend === "flat") return <span className={`${base} bg-bg-sunk text-ink-4 dark:bg-bg-muted/60`} title={translate("较 6 小时前")}><Text>持平</Text></span>;
  const up = trend === "up";
  return (
    <span className={`${base} ${up ? "bg-hot-soft text-hot" : "bg-bg-sunk text-ink-4 dark:bg-bg-muted/60"}`} title={translate("较 6 小时前")}>
      <Text>{up ? "↑" : "↓"}</Text> <Text>{Math.abs(Math.round(pct))}</Text>%
    </span>
  );
}
