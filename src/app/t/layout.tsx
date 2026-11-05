import { requireTeacher } from "@/lib/auth";
import { TopBar } from "@/components/ui/TopBar";

export const dynamic = "force-dynamic";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const me = await requireTeacher();
  return (
    <main className="page">
      <TopBar email={me.email} role="teacher" />
      {children}
    </main>
  );
}
