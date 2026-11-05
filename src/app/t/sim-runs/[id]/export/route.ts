import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth";
import { leaderboard, loadRun } from "@/lib/sim/data";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me || me.role !== "teacher") return new Response("Not allowed", { status: 403 });
  const { id } = await params;
  const data = await loadRun(id);
  if (!data) return new Response("Not found", { status: 404 });
  const board = await leaderboard(data.run, data.spec);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Leaderboard", { views: [{ state: "frozen", ySplit: 4 }] });
  ws.addRow([data.spec.title]).font = { bold: true, size: 16 };
  ws.addRow([`Class: ${data.cls.name}`, `Months open: ${data.run.openedMonth}/${data.spec.months}`, `Weights: ${data.run.accountingWeight}% books / ${100 - data.run.accountingWeight}% business`]);
  ws.addRow([`Business score: ${data.spec.score.label}`]);
  const head = ws.addRow(["Rank", "Company", "Student email", "Final mark (/100)", "Business score", "Business %", "Books score", "Books max", "Books %", "Months done", "Auto-played months"]);
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFD43B" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A0F3C" } };
  });
  for (const b of board) {
    const r = ws.addRow([b.rank, b.player.companyName, b.email, b.mark, Math.round(b.business.raw * 100) / 100, b.business.pct, b.accScore, b.accMax, b.accMax ? b.accScore / b.accMax : 0, b.monthsDone, b.autoMonths]);
    r.getCell(6).numFmt = "0%";
    r.getCell(9).numFmt = "0%";
  }
  ws.columns.forEach((c, i) => (c.width = i === 1 || i === 2 ? 30 : 14));
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="simulation-${id.slice(0, 8)}.xlsx"`,
    },
  });
}
