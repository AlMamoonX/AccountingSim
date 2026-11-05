import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { Badge, PageTitle, fmtDay } from "@/components/ui/bits";
import { ConfirmButton, SubmitButton } from "@/components/ui/client";
import { deleteLecture, retryLecture, updateLecture } from "@/app/actions/teacher";
import { UploadForm } from "./UploadForm";

export default async function LecturesPage() {
  const db = await getDb();
  const docs = await db.select().from(schema.courseDocuments).orderBy(desc(schema.courseDocuments.createdAt));
  return (
    <div className="stack">
      <PageTitle
        title="Lecture library"
        sub="Upload the course slides and exercise sheets. The AI uses them as its reference, so exercises match how the course teaches."
      />
      <UploadForm />
      <section className="stack-sm rise rise-3">
        <h2>Files ({docs.length})</h2>
        {docs.length === 0 && <p className="card small muted">No files yet.</p>}
        <div className="stack-sm">
          {docs.map((d) => (
            <article key={d.id} className="card small">
              <div className="row-between">
                <div className="stack-sm" style={{ gap: 4 }}>
                  <div className="row">
                    {d.status === "ready" && <Badge kind="ready">Ready</Badge>}
                    {d.status === "reading" && <Badge kind="info">Reading…</Badge>}
                    {d.status === "failed" && <Badge kind="error">Couldn&apos;t read</Badge>}
                    {d.lecture && <Badge kind="plain">{d.lecture}</Badge>}
                  </div>
                  <h3>{d.title}</h3>
                  <p className="muted">
                    <span className="mono">{d.fileName}</span> · {d.pages} {d.pages === 1 ? "page" : "pages"} · {fmtDay(d.createdAt)}
                  </p>
                  {d.status === "failed" && d.error && <p className="alert warn">{d.error}</p>}
                  {d.status === "ready" && d.pages > 0 && /\.(png|jpe?g|webp)$/i.test(d.fileName) && (
                    <p className="hint">Image: the AI only uses it if the server is set up for an AI that reads images.</p>
                  )}
                </div>
                <div className="row">
                  {d.status !== "ready" && (
                    <form action={retryLecture.bind(null, d.id)}>
                      <SubmitButton className="btn btn-secondary btn-small" busy="Reading…">
                        Try again
                      </SubmitButton>
                    </form>
                  )}
                  <form>
                    <ConfirmButton
                      className="btn-text danger"
                      label="Delete"
                      question={`Delete “${d.title}”? The AI will stop using it.`}
                      confirmLabel="Delete"
                      formAction={deleteLecture.bind(null, d.id)}
                    />
                  </form>
                </div>
              </div>
              <details style={{ marginTop: 8 }}>
                <summary className="btn-text" style={{ display: "inline-flex" }}>
                  Edit name
                </summary>
                <form action={updateLecture.bind(null, d.id)} className="row" style={{ marginTop: 8, alignItems: "flex-end" }}>
                  <label className="field" style={{ flex: "2 1 220px" }}>
                    <span className="label">Title</span>
                    <input className="input" name="title" defaultValue={d.title} />
                  </label>
                  <label className="field" style={{ flex: "1 1 140px" }}>
                    <span className="label">Lecture</span>
                    <input className="input" name="lecture" defaultValue={d.lecture ?? ""} placeholder="Lecture 5" />
                  </label>
                  <SubmitButton className="btn btn-secondary btn-small">Save</SubmitButton>
                </form>
              </details>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
