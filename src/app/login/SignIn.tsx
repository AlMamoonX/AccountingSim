"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requestCodeAction, verifyCodeAction } from "@/app/actions/auth";

const SEND_ERRORS: Record<string, string> = {
  not_allowed: "This email isn't allowed. Use your @student.gutech.edu.om email.",
  too_soon: "A code was just sent. Wait a moment before asking for another.",
  too_many: "Too many codes asked for. Try again in an hour.",
  mail_failed: "We couldn't send the email. Try again in a minute.",
};
const VERIFY_ERRORS: Record<string, string> = {
  wrong_code: "That code isn't right. Check the email and try again.",
  expired: "That code has expired. Press Resend code.",
  too_many_tries: "Too many wrong tries. Press Resend code for a new one.",
  not_allowed: "This email isn't allowed.",
};

export function SignIn({ signedOut, devBypass }: { signedOut: boolean; devBypass: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(signedOut ? "You've been signed out, please sign in again." : null);
  const [shakeKey, setShakeKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const fail = (msg: string) => {
    setError(msg);
    setShakeKey((k) => k + 1);
  };

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await requestCodeAction(email);
      if (r.ok) {
        setStep("code");
        setCode("");
        setCooldown(60);
      } else {
        if (r.error === "too_soon" && r.wait) setCooldown(r.wait);
        if (r.error === "too_soon" && step === "email") setStep("code");
        fail(SEND_ERRORS[r.error]);
      }
    } catch {
      fail("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await verifyCodeAction(email, code);
      if (r.ok) router.replace(r.role === "teacher" ? "/t" : "/s");
      else fail(VERIFY_ERRORS[r.error]);
    } catch {
      fail("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card hero rise rise-2">
      <div key={shakeKey} className={shakeKey ? "shake" : undefined}>
        {step === "email" ? (
          <form className="stack-sm" onSubmit={send}>
            <h2>Sign in</h2>
            {devBypass && <p className="badge b-yellow">Local test mode: type any allowed email, then the code 0000</p>}
            <label className="field">
              <span className="label">University email</span>
              <input
                className="input mono"
                type="email"
                name="email"
                autoComplete="email"
                required
                placeholder="id@student.gutech.edu.om"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </label>
            {error && (
              <p className="alert warn" role="alert">
                {error}
              </p>
            )}
            <button className="btn btn-primary" type="submit" disabled={busy || !email}>
              {busy ? "Sending…" : "Send code"}
            </button>
          </form>
        ) : (
          <form className="stack-sm" onSubmit={verify}>
            <h2>Check your email</h2>
            <p className="muted">
              We sent a 6-digit code to <span className="mono">{email}</span>.
            </p>
            <label className="field">
              <span className="label">6-digit code</span>
              <input
                className="input code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]*"
                maxLength={7}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
                autoFocus
              />
            </label>
            {error && (
              <p className="alert warn" role="alert">
                {error}
              </p>
            )}
            <button className="btn btn-primary" type="submit" disabled={busy || (code.length !== 6 && !(devBypass && code === "0000"))}>
              {busy ? "Checking…" : "Verify"}
            </button>
            <div className="row-between">
              <button className="btn-text" type="button" disabled={busy || cooldown > 0} onClick={() => send()}>
                {cooldown > 0 ? `Resend code (${cooldown}s)` : "Resend code"}
              </button>
              <button
                className="btn-text"
                type="button"
                onClick={() => {
                  setStep("email");
                  setError(null);
                }}
              >
                Use another email
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
