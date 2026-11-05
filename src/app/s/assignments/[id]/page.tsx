import { notFound, redirect } from "next/navigation";
import { requireStudent } from "@/lib/auth";
import { assignmentState, ensureSubmission, studentAssignment } from "@/lib/data";
import { buildView, paramsForSeed, type StudentAnswers } from "@/lib/spec/engine";
import { MessageCard } from "@/components/ui/MessageCard";
import { fmtDate } from "@/components/ui/bits";
import { SolveClient } from "./SolveClient";

export default async function SolvePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireStudent();
  const data = await studentAssignment(id, me.id);
  if (!data) notFound();
  const { a, spec } = data;
  const st = assignmentState(a, data.sub);
  if (st.submitted) redirect(`/s/assignments/${id}/result`);
  if (!st.opened)
    return <MessageCard title="Not open yet." text={`This assignment opens ${fmtDate(a.opensAt)}.`} sticker="Soon" action={{ href: "/s", label: "Back to my assignments" }} />;
  const sub = data.sub ?? (st.closed ? null : await ensureSubmission(a, me.id));
  if (!sub) redirect("/messages/deadline");
  const view = buildView(spec, paramsForSeed(spec, sub.seed));
  return (
    <SolveClient
      assignmentId={id}
      view={view}
      initialAnswers={(sub.answers ?? {}) as StudentAnswers}
      mode={a.mode}
      deadline={a.deadline.toISOString()}
      closed={st.closed}
    />
  );
}
