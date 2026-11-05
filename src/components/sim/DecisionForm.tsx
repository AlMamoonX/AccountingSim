"use client";

import type { SimDecision } from "@/lib/sim/schema";
import { formatAmount } from "@/lib/spec/format";

/** Sliders, choices and yes/no switches for a month's decisions. */
export function DecisionControls({
  decisions,
  value,
  onChange,
  disabled,
}: {
  decisions: SimDecision[];
  value: Record<string, number>;
  onChange: (v: Record<string, number>) => void;
  disabled?: boolean;
}) {
  const set = (name: string, v: number) => onChange({ ...value, [name]: v });
  return (
    <div className="stack-sm">
      {decisions.map((d) => {
        const v = value[d.name] ?? d.default;
        return (
          <div key={d.name} className="decision">
            <div className="row-between">
              <label className="card-title" htmlFor={`d-${d.name}`} style={{ fontSize: 19 }}>
                {d.label}
              </label>
              {d.kind === "number" && (
                <span className="mono" style={{ fontSize: 22 }}>
                  {formatAmount(v)} {d.unit && <span className="hint">{d.unit}</span>}
                </span>
              )}
            </div>
            {d.help && <p className="hint">{d.help}</p>}
            {d.kind === "number" && (
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <input
                  id={`d-${d.name}`}
                  className="slider"
                  type="range"
                  min={d.min}
                  max={d.max}
                  step={d.step ?? "any"}
                  value={v}
                  disabled={disabled}
                  onChange={(e) => set(d.name, Number(e.target.value))}
                />
                <input
                  className="input num"
                  style={{ width: 120 }}
                  type="number"
                  aria-label={`${d.label} (exact)`}
                  min={d.min}
                  max={d.max}
                  step={d.step ?? "any"}
                  value={v}
                  disabled={disabled}
                  onChange={(e) => e.target.value !== "" && set(d.name, Number(e.target.value))}
                />
              </div>
            )}
            {(d.kind === "choice" || d.kind === "toggle") && (
              <div className="choices" role="radiogroup" aria-label={d.label}>
                {(d.kind === "toggle"
                  ? [
                      { value: 1, label: "Yes" },
                      { value: 0, label: "No" },
                    ]
                  : d.options!
                ).map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={v === o.value}
                    className="choice"
                    disabled={disabled}
                    onClick={() => set(d.name, o.value)}
                  >
                    <strong>{o.label}</strong>
                    {v === o.value && (
                      <span className="tick" aria-hidden>
                        ✓
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
