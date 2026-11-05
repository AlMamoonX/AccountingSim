import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth";
import { loadGradebook, STATUS_LABEL } from "@/lib/gradebook";

export const dynamic = "force-dynamic";

const INK = "FF1A0F3C";
const SAFFRON = "FFFFD43B";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me || me.role !== "teacher") return new Response("Not allowed", { status: 403 });
  const { id } = await params;
  const gb = await loadGradebook(id);
  if (!gb) return new Response("Not found", { status: 404 });

  const wb = new ExcelJS.Workbook();
  wb.creator = "AccountingSim";
  const ws = wb.addWorksheet("Marks", { views: [{ state: "frozen", ySplit: 5 }] });
  const muscat = (d: Date) => new Date(d.getTime() + 4 * 3600_000);

  ws.addRow([gb.ex.title]).font = { bold: true, size: 16 };
  ws.addRow([`Class: ${gb.cls.name}`, `Mode: ${gb.a.mode === "practice" ? "Practice" : "Graded"}`, `Numbers: ${gb.a.variantMode === "unique" ? "own per student" : "same for all"}`]);
  ws.addRow([`Deadline (Muscat): ${muscat(gb.a.deadline).toISOString().slice(0, 16).replace("T", " ")}`, `Exported: ${muscat(new Date()).toISOString().slice(0, 16).replace("T", " ")}`]);
  ws.addRow([]);

  const parts = gb.spec.parts;
  const header = ws.addRow(["Student email", "Status", "Handed in (Muscat)", "Mark", "Out of", "%", ...parts.map((p, i) => `${String.fromCharCode(65 + i)}: ${p.title}`)]);
  header.eachCell((c) => {
    c.font = { bold: true, color: { argb: SAFFRON } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
    c.alignment = { vertical: "middle", wrapText: true };
  });
  header.height = 32;

  for (const r of gb.rows) {
    const row = ws.addRow([
      r.email,
      STATUS_LABEL[r.status],
      r.submittedAt ? muscat(r.submittedAt).toISOString().slice(0, 16).replace("T", " ") : "",
      r.score ?? "",
      r.score != null ? r.max : "",
      r.score != null && r.max ? r.score / r.max : "",
      ...parts.map((p) => {
        const ps = r.partScores?.find((x) => x.partId === p.id);
        return ps ? `${ps.score}/${ps.max}` : "";
      }),
    ]);
    row.getCell(6).numFmt = "0%";
  }
  ws.columns.forEach((col, i) => {
    col.width = i === 0 ? 34 : i < 3 ? 20 : i < 6 ? 10 : 24;
  });

  const buf = await wb.xlsx.writeBuffer();
  const safe = `${gb.cls.name}-${gb.ex.title}`.replace(/[^A-Za-z0-9 _-]+/g, "").replace(/\s+/g, "_").slice(0, 80) || "marks";
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safe}.xlsx"`,
    },
  });
}
