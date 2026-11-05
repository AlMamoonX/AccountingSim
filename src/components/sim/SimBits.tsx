import { formatAmount } from "@/lib/spec/format";

/** Small-multiple line charts: one card per metric, months along the bottom. */
export function MetricCharts({ labels, series }: { labels: string[]; series: { label: string; values: number[]; kind: "money" | "count" | "percent" }[] }) {
  return (
    <div className="grid-auto" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
      {series.map((s, i) => (
        <LineChart key={s.label} label={s.label} values={s.values} labels={labels} kind={s.kind} color={["var(--purple)", "var(--teal)", "var(--pink)", "var(--blue)"][i % 4]} />
      ))}
    </div>
  );
}

function fmt(v: number, kind: string) {
  return kind === "percent" ? `${Math.round(v * 100)}%` : formatAmount(v);
}

export function LineChart({ label, values, labels, kind, color }: { label: string; values: number[]; labels: string[]; kind: string; color: string }) {
  const W = 260;
  const H = 110;
  const pad = 14;
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const x = (i: number) => (values.length <= 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (values.length - 1));
  const y = (v: number) => H - pad - ((v - min) / (max - min || 1)) * (H - 2 * pad);
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const last = values[values.length - 1] ?? 0;
  return (
    <figure className="card small" style={{ margin: 0 }}>
      <figcaption className="row-between">
        <span className="label">{label}</span>
        <span className="mono" style={{ fontSize: 20 }}>
          {fmt(last, kind)}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${label}: ${values.map((v, i) => `${labels[i]} ${fmt(v, kind)}`).join(", ")}`}>
        {min < 0 && <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--track)" strokeWidth={2} strokeDasharray="4 4" />}
        <polyline points={pts} fill="none" stroke={color} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
        {values.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={5} fill="#fff" stroke={color} strokeWidth={3} />
        ))}
      </svg>
      <div className="row-between hint" aria-hidden>
        {labels.map((l) => (
          <span key={l}>{l.slice(0, 3)}</span>
        ))}
      </div>
    </figure>
  );
}

export function EventCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="event-card" role="status">
      <span className="sticker" style={{ transform: "rotate(-6deg)" }}>
        This month
      </span>
      <h3 style={{ marginTop: 10 }}>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="stepper" aria-label="Month steps">
      {steps.map((s, i) => (
        <li key={s} className={i < current ? "done" : i === current ? "on" : ""} aria-current={i === current ? "step" : undefined}>
          <span className="mono">{i < current ? "✓" : i + 1}</span> {s}
        </li>
      ))}
    </ol>
  );
}

export interface BoardRow {
  rank: number;
  company: string;
  email?: string;
  mark: number;
  business: number;
  businessPct: number;
  accuracy: number | null;
  monthsDone: number;
  autoMonths: number;
  me?: boolean;
  href?: string;
}

export function Leaderboard({ rows, scoreLabel, showEmail }: { rows: BoardRow[]; scoreLabel: string; showEmail?: boolean }) {
  return (
    <div className="table-wrap">
      <table className="list">
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Company</th>
            {showEmail && <th>Student</th>}
            <th className="num">Mark</th>
            <th className="num" title={scoreLabel}>
              Business
            </th>
            <th className="num">Books</th>
            <th className="num">Months</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={showEmail ? 7 : 6} className="muted">
                No companies yet.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.company + r.rank + (r.email ?? "")} style={r.me ? { background: "var(--t-yellow)" } : undefined}>
              <td className="num">{r.rank}</td>
              <td style={{ fontWeight: 800 }}>
                {r.href ? <a href={r.href}>{r.company}</a> : r.company} {r.me && <span className="badge b-ink">You</span>}
              </td>
              {showEmail && <td className="mono">{r.email}</td>}
              <td className="num">{r.mark.toFixed(1)}</td>
              <td className="num">
                {formatAmount(r.business)} <span className="muted">({Math.round(r.businessPct * 100)}%)</span>
              </td>
              <td className="num">{r.accuracy == null ? "–" : `${Math.round(r.accuracy * 100)}%`}</td>
              <td className="num">
                {r.monthsDone}
                {r.autoMonths > 0 && <span className="muted"> ({r.autoMonths} auto)</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
