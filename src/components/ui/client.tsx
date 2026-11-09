"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** Submit button that shows a busy label while its form's server action runs. */
export function SubmitButton({
  children,
  busy,
  className = "btn btn-primary",
  disabled,
}: {
  children: ReactNode;
  busy?: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending || disabled} aria-busy={pending}>
      {pending ? (busy ?? "Working…") : children}
    </button>
  );
}

export function CopyButton({ text, className = "btn btn-secondary btn-small" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard blocked: nothing to do */
        }
      }}
    >
      <span key={String(copied)} className="fade-swap">
        {copied ? "Copied!" : "Copy"}
      </span>
    </button>
  );
}

/** A button that opens a small "Are you sure?" card. The confirm button submits `formAction` or calls onConfirm. */
export function ConfirmButton({
  label,
  question,
  confirmLabel = "Yes",
  className = "btn btn-secondary",
  onConfirm,
  formAction,
  disabled,
}: {
  label: ReactNode;
  question: ReactNode;
  confirmLabel?: string;
  className?: string;
  onConfirm?: () => void | Promise<void>;
  formAction?: (fd: FormData) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [alignLeft, setAlignLeft] = useState(false);
  // The card opens leftwards from the button's right edge; for buttons near the left of the screen
  // that pushes it off-screen, so open it rightwards instead.
  useLayoutEffect(() => {
    if (!open) return setAlignLeft(false);
    const r = popRef.current?.getBoundingClientRect();
    if (r && r.left < 8) setAlignLeft(true);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div className="pop-anchor" ref={ref}>
      <button type="button" className={className} onClick={() => setOpen((o) => !o)} aria-expanded={open} disabled={disabled}>
        {label}
      </button>
      {open && (
        <div className={alignLeft ? "popover popover-left" : "popover"} role="dialog" aria-label="Confirm" ref={popRef}>
          <div className="stack-sm">
            <div style={{ fontWeight: 700 }}>{question}</div>
            <div className="row">
              {formAction ? (
                <button
                  className="btn btn-primary btn-small"
                  formAction={formAction}
                  type="submit"
                  // Close after the browser has started the form submission.
                  onClick={() => setTimeout(() => setOpen(false), 0)}
                >
                  {confirmLabel}
                </button>
              ) : (
                <button
                  className="btn btn-primary btn-small"
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await onConfirm?.();
                    } finally {
                      setBusy(false);
                      setOpen(false);
                    }
                  }}
                >
                  {busy ? "Working…" : confirmLabel}
                </button>
              )}
              <button className="btn-text" type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Big radio cards. Renders a hidden input so it works inside a plain <form>. */
export function ChoiceGroup({
  name,
  label,
  options,
  defaultValue,
  onChange,
}: {
  name: string;
  label: string;
  options: { value: string; title: string; text?: string }[];
  defaultValue?: string;
  onChange?: (v: string) => void;
}) {
  const [value, setValue] = useState(defaultValue ?? options[0]?.value ?? "");
  const pick = (v: string) => {
    setValue(v);
    onChange?.(v);
  };
  return (
    <div className="field">
      <span className="label" id={`${name}-label`}>
        {label}
      </span>
      <div className="choices" role="radiogroup" aria-labelledby={`${name}-label`}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className="choice"
            onClick={() => pick(o.value)}
          >
            <strong>{o.title}</strong>
            {o.text && <span className="muted">{o.text}</span>}
            {value === o.value && (
              <span className="tick" aria-hidden>
                ✓
              </span>
            )}
          </button>
        ))}
      </div>
      <input type="hidden" name={name} value={value} />
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.value} role="tab" type="button" aria-selected={value === t.value} onClick={() => onChange(t.value)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function DropZone({
  name,
  accept,
  multiple,
  title,
  text,
  onFiles,
}: {
  name: string;
  accept: string;
  multiple?: boolean;
  title: string;
  text?: string;
  onFiles?: (files: File[]) => void;
}) {
  const [over, setOver] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const take = (list: FileList | null) => {
    const files = list ? Array.from(list) : [];
    setNames(files.map((f) => f.name));
    onFiles?.(files);
  };
  return (
    <label
      className={`dropzone${over ? " over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (input.current && e.dataTransfer.files.length) {
          input.current.files = e.dataTransfer.files;
          take(e.dataTransfer.files);
        }
      }}
    >
      <span className="icon" aria-hidden>
        ⬆
      </span>
      <strong className="card-title">{title}</strong>
      {text && <span className="muted">{text}</span>}
      {names.length > 0 && <span className="badge b-teal">{names.join(", ")}</span>}
      <input
        ref={input}
        className="sr-only"
        type="file"
        name={name}
        accept={accept}
        multiple={multiple}
        onChange={(e) => take(e.target.files)}
      />
    </label>
  );
}

/** Counts up from 0 over 900ms with ease-out quart. */
export function CountUp({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 900);
      setShown(value * (1 - Math.pow(1 - p, 4)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown.toFixed(decimals)}</>;
}

export function AiWorking({ steps, message }: { steps: string[]; message?: string }) {
  const [i, setI] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (message) {
      const start = Date.now();
      const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
      return () => clearInterval(t);
    }
    const t = setInterval(() => setI((x) => Math.min(x + 1, steps.length - 1)), 9000);
    return () => clearInterval(t);
  }, [steps.length, message]);
  return (
    <div className="card hero ai-working" role="status" aria-live="polite">
      <div className="ai-square" aria-hidden />
      <p key={i} className="card-title fade-swap">
        {message ?? steps[i]}
      </p>
      {!message && <ol className="steps">
        {steps.map((s, n) => (
          <li key={s} className={n === i ? "on" : n < i ? "done" : ""}>
            {n < i ? "✓ " : ""}
            {s}
          </li>
        ))}
      </ol>}
      <p className="muted">{message ? "The AI is writing your draft and checking its formulas. Keep this page open." : "This usually takes 30–90 seconds. Keep this page open."}</p>
      {message && <p className="mono" aria-live="off">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} elapsed</p>}
    </div>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="toast" role="status" key={message}>
      {message}
    </div>
  );
}
