/**
 * A small, safe formula language (no eval).
 *
 *   numbers:      1200, 3.5
 *   names:        rent, A.total.cash, partA.r2.cash  (letters, digits, _ and dots)
 *   operators:    + - * /  ( )  == != < <= > >=  && || !
 *   functions:    sum(a, b, ...), min(...), max(...), abs(x), round(x, digits?), if(cond, a, b),
 *                 floor(x), ceil(x), pow(x, y)
 *
 * Comparisons return 1 (true) or 0 (false). "==" allows a 0.005 difference for rounding.
 */

export type Node =
  | { k: "num"; v: number }
  | { k: "name"; v: string }
  | { k: "un"; op: "-" | "!"; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "call"; fn: string; args: Node[] };

type Tok = { t: "num" | "name" | "op" | "("  | ")" | ","; v: string; pos: number };

const OPS = ["==", "!=", "<=", ">=", "&&", "||", "+", "-", "*", "/", "<", ">", "!"];
const FUNCS = new Set(["sum", "min", "max", "abs", "round", "if", "floor", "ceil", "pow"]);
export const EQ_TOLERANCE = 0.005;

export class ExprError extends Error {}

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+(\.\d+)?|\.\d+)/.exec(src.slice(i));
      if (!m) throw new ExprError(`Bad number at ${i} in "${src}"`);
      out.push({ t: "num", v: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)*/.exec(src.slice(i))!;
      out.push({ t: "name", v: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    if (c === "(" || c === ")" || c === ",") {
      out.push({ t: c, v: c, pos: i });
      i++;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (op) {
      out.push({ t: "op", v: op, pos: i });
      i += op.length;
      continue;
    }
    throw new ExprError(`Unexpected "${c}" in "${src}"`);
  }
  return out;
}

const PREC: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
};

export function parse(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const fail = (msg: string): never => {
    const open = toks.filter((t) => t.t === "(").length - toks.filter((t) => t.t === ")").length;
    const hint = open > 0 ? ` (${open} more "(" than ")": close every bracket)` : open < 0 ? ` (${-open} more ")" than "(")` : "";
    throw new ExprError(`${msg}${hint} in "${src}"`);
  };

  function primary(): Node {
    const t = toks[p++];
    if (!t) return fail("Unexpected end of formula");
    if (t.t === "num") return { k: "num", v: Number(t.v) };
    if (t.t === "op" && (t.v === "-" || t.v === "!")) return { k: "un", op: t.v, a: expr(7) };
    if (t.t === "op" && t.v === "+") return expr(7);
    if (t.t === "(") {
      const e = expr(0);
      if (toks[p++]?.t !== ")") fail("Missing )");
      return e;
    }
    if (t.t === "name") {
      if (peek()?.t === "(") {
        const fn = t.v.toLowerCase();
        if (!FUNCS.has(fn)) fail(`Unknown function ${t.v}`);
        p++;
        const args: Node[] = [];
        if (peek()?.t !== ")") {
          for (;;) {
            args.push(expr(0));
            if (peek()?.t === ",") {
              p++;
              continue;
            }
            break;
          }
        }
        if (toks[p++]?.t !== ")") fail("Missing ) after function arguments");
        return { k: "call", fn, args };
      }
      return { k: "name", v: t.v };
    }
    return fail(`Unexpected "${t.v}"`);
  }

  function expr(minPrec: number): Node {
    let left = primary();
    for (;;) {
      const t = peek();
      if (!t || t.t !== "op" || PREC[t.v] === undefined || PREC[t.v] < minPrec) break;
      p++;
      const right = expr(PREC[t.v] + 1);
      left = { k: "bin", op: t.v, a: left, b: right };
    }
    return left;
  }

  if (toks.length === 0) fail("Empty formula");
  const node = expr(0);
  if (p < toks.length) fail(`Unexpected "${toks[p].v}"`);
  return node;
}

export function names(node: Node, out = new Set<string>()): Set<string> {
  switch (node.k) {
    case "name":
      out.add(node.v);
      break;
    case "un":
      names(node.a, out);
      break;
    case "bin":
      names(node.a, out);
      names(node.b, out);
      break;
    case "call":
      node.args.forEach((a) => names(a, out));
      break;
  }
  return out;
}

export function evaluate(node: Node, resolve: (name: string) => number): number {
  const ev = (n: Node): number => evaluate(n, resolve);
  switch (node.k) {
    case "num":
      return node.v;
    case "name":
      return resolve(node.v);
    case "un":
      return node.op === "-" ? -ev(node.a) : ev(node.a) ? 0 : 1;
    case "bin": {
      if (node.op === "&&") return ev(node.a) && ev(node.b) ? 1 : 0;
      if (node.op === "||") return ev(node.a) || ev(node.b) ? 1 : 0;
      const a = ev(node.a);
      const b = ev(node.b);
      switch (node.op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          if (b === 0) throw new ExprError("Division by zero");
          return a / b;
        case "==":
          return Math.abs(a - b) <= EQ_TOLERANCE ? 1 : 0;
        case "!=":
          return Math.abs(a - b) > EQ_TOLERANCE ? 1 : 0;
        case "<":
          return a < b ? 1 : 0;
        case "<=":
          return a <= b + EQ_TOLERANCE ? 1 : 0;
        case ">":
          return a > b ? 1 : 0;
        case ">=":
          return a + EQ_TOLERANCE >= b ? 1 : 0;
      }
      throw new ExprError(`Unknown operator ${node.op}`);
    }
    case "call": {
      if (node.fn === "if") {
        if (node.args.length !== 3) throw new ExprError("if() needs 3 arguments");
        return ev(node.args[0]) ? ev(node.args[1]) : ev(node.args[2]);
      }
      const vals = node.args.map(ev);
      switch (node.fn) {
        case "sum":
          return vals.reduce((s, v) => s + v, 0);
        case "min":
          if (!vals.length) throw new ExprError("min() needs arguments");
          return Math.min(...vals);
        case "max":
          if (!vals.length) throw new ExprError("max() needs arguments");
          return Math.max(...vals);
        case "abs":
          return Math.abs(vals[0] ?? 0);
        case "floor":
          return Math.floor((vals[0] ?? 0) + 1e-9);
        case "ceil":
          return Math.ceil((vals[0] ?? 0) - 1e-9);
        case "pow": {
          const v = Math.pow(vals[0] ?? 0, vals[1] ?? 1);
          if (!Number.isFinite(v)) throw new ExprError("pow() result is not a number");
          return v;
        }
        case "round": {
          const d = Math.max(0, Math.min(6, Math.trunc(vals[1] ?? 0)));
          const f = 10 ** d;
          return Math.round((vals[0] ?? 0) * f) / f;
        }
      }
      throw new ExprError(`Unknown function ${node.fn}`);
    }
  }
}
