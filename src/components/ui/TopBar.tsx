import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { NavLinks } from "./NavLinks";

export function TopBar({ email, role }: { email: string; role: "teacher" | "student" }) {
  return (
    <header className="topbar rise">
      <Link href={role === "teacher" ? "/t" : "/s"} className="logo">
        AccountingSim
      </Link>
      <NavLinks role={role} />
      <div className="who">
        <span className="mono">{email}</span>
        <span className="sr-only">{role === "teacher" ? "Doctor" : "Student"}</span>
        <form action={logoutAction}>
          <button className="btn btn-pill-white" type="submit">
            Log out
          </button>
        </form>
      </div>
    </header>
  );
}
