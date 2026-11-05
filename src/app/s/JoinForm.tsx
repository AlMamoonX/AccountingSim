"use client";

import { useActionState } from "react";
import { joinClass } from "@/app/actions/student";
import { SubmitButton } from "@/components/ui/client";

export function JoinForm() {
  const [state, action] = useActionState(joinClass, null);
  return (
    <form action={action} className="card hero rise rise-2">
      <div className="row" style={{ alignItems: "flex-end" }}>
        <label className="field" style={{ flex: "1 1 220px" }}>
          <span className="label">Join a class</span>
          <input
            className="input mono"
            name="code"
            placeholder="Class code, e.g. K7Q2MX"
            autoComplete="off"
            maxLength={12}
            style={{ textTransform: "uppercase", letterSpacing: ".12em" }}
            required
          />
        </label>
        <SubmitButton busy="Joining…">Join</SubmitButton>
      </div>
      {state && (
        <p className={`alert ${state.ok ? "ok" : "warn"}`} role="status" style={{ marginTop: 12 }}>
          {state.message}
        </p>
      )}
    </form>
  );
}
