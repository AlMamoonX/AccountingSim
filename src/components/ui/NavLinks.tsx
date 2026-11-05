"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const DOCTOR = [
  { href: "/t", label: "Home", match: (p: string) => p === "/t" || p.startsWith("/t/assignments") },
  { href: "/t/classes", label: "Classes", match: (p: string) => p.startsWith("/t/classes") },
  { href: "/t/lectures", label: "Lectures", match: (p: string) => p.startsWith("/t/lectures") },
  { href: "/t/exercises", label: "Exercises", match: (p: string) => p.startsWith("/t/exercises") },
  { href: "/t/sims", label: "Simulations", match: (p: string) => p.startsWith("/t/sims") || p.startsWith("/t/sim-runs") },
];
const STUDENT = [{ href: "/s", label: "My assignments", match: (p: string) => p.startsWith("/s") }];

export function NavLinks({ role }: { role: "teacher" | "student" }) {
  const path = usePathname();
  const items = role === "teacher" ? DOCTOR : STUDENT;
  return (
    <nav className="nav" aria-label="Main">
      {items.map((n) => (
        <Link key={n.href} href={n.href} aria-current={n.match(path) ? "page" : undefined}>
          {n.label}
        </Link>
      ))}
    </nav>
  );
}
