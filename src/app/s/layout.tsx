import { requireStudent } from "@/lib/auth";
import { TopBar } from "@/components/ui/TopBar";

export const dynamic = "force-dynamic";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const me = await requireStudent();
  return (
    <main className="page">
      <TopBar email={me.email} role="student" />
      {children}
    </main>
  );
}
