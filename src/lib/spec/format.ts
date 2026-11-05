/** Number display and parsing shared by the browser and the server. */

export function formatAmount(n: number): string {
  const r = Math.round(n * 100) / 100;
  const s = Math.abs(r).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return r < 0 ? `−${s}` : s;
}

/** Accepts "1,200", "-1200", "−1,200", "(1,200)", "OMR 1,200". Empty → null. Garbage → NaN. */
export function parseAmount(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[−–—]/g, "-").replace(/[A-Za-z\s,]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(s)) return NaN;
  const v = Number(s);
  return neg ? -v : v;
}
