import type { ReactNode } from "react";

export function Progress({ value, color }: { value: number; color?: "teal" | "pink" }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div className="track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)}>
      {pct > 0 && <div className={`fill${color ? ` ${color}` : ""}`} style={{ width: `${pct * 100}%` }} />}
    </div>
  );
}

const BADGE = {
  ready: "b-teal",
  draft: "b-pink",
  graded: "b-pink",
  practice: "b-blue",
  error: "b-orange",
  info: "b-purple",
  plain: "b-yellow",
  ink: "b-ink",
} as const;

export function Badge({ kind, children }: { kind: keyof typeof BADGE; children: ReactNode }) {
  return <span className={`badge ${BADGE[kind]}`}>{children}</span>;
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export function PartBadge({ index }: { index: number }) {
  return (
    <span className={`part-badge${index % 3 === 1 ? " alt1" : index % 3 === 2 ? " alt2" : ""}`} aria-hidden>
      {LETTERS[index] ?? index + 1}
    </span>
  );
}

export function PageTitle({ title, sub, sticker }: { title: string; sub?: ReactNode; sticker?: string }) {
  return (
    <div className="rise rise-1">
      <h1>
        {title} {sticker && <span className="sticker">{sticker}</span>}
      </h1>
      {sub && <p className="lead">{sub}</p>}
    </div>
  );
}

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Muscat",
  });
}

export function fmtDay(d: Date | string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Muscat" });
}

export function pct(score: number | null | undefined, max: number | null | undefined) {
  if (score == null || !max) return "–";
  return `${Math.round((score / max) * 100)}%`;
}
