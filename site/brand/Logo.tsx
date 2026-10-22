import { SITE } from "../site.ts";

/** Two company boundaries and one observation point, legible even as a small app icon. */
function ObservationMark({ className = "", spinning = false }: { className?: string; spinning?: boolean }) {
  return <svg viewBox="0 0 40 40" fill="none" className={className} aria-hidden="true">
    <rect width="40" height="40" rx="12" fill="#10213d" />
    <g className={spinning ? "brand-mark-spinning" : undefined}>
      <path d="M18 10h-6l-4 4v16" stroke="#93b7ff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 30h6l4-4V10" stroke="#65dfeb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </g>
    <circle cx="20" cy="20" r="3.5" fill="#fff" />
  </svg>;
}

export function Wordmark({ size = 24, className = "", title = SITE.name }: { size?: number; className?: string; title?: string }) {
  return <span className={`brand-wordmark inline-flex items-center gap-[0.45em] font-black leading-none tracking-[-0.04em] ${className}`} style={{ fontSize: Math.round(size * 0.92) }} aria-label={title} role="img">
    <ObservationMark className="size-[1.5em] shrink-0" />
    <span aria-hidden="true">{SITE.name}</span>
  </span>;
}

/** Shared brand mark for the account entry and loading states. */
export function RingMark({ className = "", spinning = false }: { className?: string; spinning?: boolean }) {
  return <ObservationMark className={className} spinning={spinning} />;
}
