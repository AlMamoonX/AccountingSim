import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SignIn } from "./SignIn";
import { env } from "@/lib/env";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "teacher" ? "/t" : "/s");
  const { m } = await searchParams;
  return (
    <main className="page" style={{ maxWidth: 980 }}>
      <div className="grid-2" style={{ alignItems: "center", minHeight: "86vh" }}>
        <div className="rise">
          <svg className="cup" viewBox="0 0 120 120" aria-hidden>
            <g className="steam" fill="none" stroke="#1A0F3C" strokeWidth="5" strokeLinecap="round">
              <path d="M40 34c-6-8 6-12 0-20" />
              <path d="M58 34c-6-8 6-12 0-20" />
              <path d="M76 34c-6-8 6-12 0-20" />
            </g>
            <path d="M24 44h72v30a26 26 0 0 1-26 26H50a26 26 0 0 1-26-26z" fill="#fff" stroke="#1A0F3C" strokeWidth="5" />
            <path d="M96 52h6a12 12 0 0 1 0 24h-6" fill="none" stroke="#1A0F3C" strokeWidth="5" />
            <rect x="34" y="56" width="52" height="8" rx="4" fill="#FF4D8D" />
          </svg>
          <h1>
            Account&shy;ing&shy;Sim <span className="sticker">CS2 145</span>
          </h1>
          <p className="lead">Practise accounting on real businesses. Sign in with your GUtech email.</p>
        </div>
        <SignIn signedOut={m === "signed-out"} devBypass={env.devOtpBypass} />
      </div>
    </main>
  );
}
