import { useText } from "../../lib/text";

/** The site's editorial report title uses live type in both languages. */
export function Nameplate({ which, className = "" }: { which: "daily" | "weekly" | "monthly" | "archive"; className?: string }) {
  const translate = useText();
  const label = { daily: "互联网日报", weekly: "互联网周报", monthly: "互联网月报", archive: "往期日报" }[which];
  return <span className={`report-nameplate ${className}`}>{translate(label)}</span>;
}
