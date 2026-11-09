"""Add doctor emails to TEACHER_EMAILS in the server's .env without ever dropping an existing doctor.

Usage (from the app directory):  python3 deploy/add_teacher.py email[,email...]

The app's effective list is what it accepts today: every email found in any TEACHER_EMAILS
assignment (quoted, `export`-prefixed, indented or not), or, when there is none or it is empty,
the built-in default from src/lib/env.ts. The new file keeps every other line, holds exactly one
unquoted TEACHER_EMAILS line, and is checked to contain the old list plus the new emails before it
replaces .env. The previous file is kept as .env.bak-<timestamp>; existing backups are never overwritten.
"""
from __future__ import annotations

from pathlib import Path
import os
import re
import sys
import time

EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
ASSIGN = re.compile(r"^\s*(?:export\s+)?TEACHER_EMAILS\s*=(.*)$")
DEFAULT = re.compile(r'TEACHER_EMAILS\?\.trim\(\)\s*\|\|\s*"([^"]*)"')


def default_list(root: Path) -> list[str]:
    src = (root / "src/lib/env.ts").read_text(encoding="utf-8")
    m = DEFAULT.search(src)
    if not m:
        raise SystemExit("Could not read the default doctor list from src/lib/env.ts; .env left unchanged.")
    return emails_in(m.group(1))


def emails_in(text: str) -> list[str]:
    return [e.lower() for e in EMAIL.findall(text)]


def unique(items):
    seen, out = set(), []
    for i in items:
        if i not in seen:
            seen.add(i)
            out.append(i)
    return out


def effective(lines: list[str], defaults: list[str]) -> list[str]:
    found = []
    for line in lines:
        m = ASSIGN.match(line.rstrip("\r\n"))
        if m:
            found += emails_in(m.group(1))
    return unique(found) if found else list(defaults)


def update(env_text: str, add: list[str], defaults: list[str]) -> tuple[str, list[str], list[str]]:
    newline = "\r\n" if "\r\n" in env_text else "\n"
    lines = env_text.splitlines(keepends=True)
    add = unique(e.strip().lower() for e in add)
    before = effective(lines, defaults)
    after = unique(before + add)
    kept = [l for l in lines if not ASSIGN.match(l.rstrip("\r\n"))]
    if kept and not kept[-1].endswith(("\n", "\r")):
        kept[-1] += newline
    text = "".join(kept) + f"TEACHER_EMAILS={','.join(after)}{newline}"
    check = effective(text.splitlines(keepends=True), [])
    if not set(before) | set(add) <= set(check):
        raise SystemExit("Safety check failed: the new list would drop a doctor; .env left unchanged.")
    return text, before, check


def main(argv: list[str]) -> int:
    raw = argv[1] if len(argv) > 1 else ""
    add = unique(e.strip().lower() for e in re.split(r"[,;\s]+", raw) if e.strip())
    bad = [e for e in add if not EMAIL.fullmatch(e)]
    if not add or bad:
        print(f"Not a valid email: {', '.join(bad) or '(none given)'}", file=sys.stderr)
        return 1
    root = Path.cwd()
    env = root / ".env"
    original = env.read_text(encoding="utf-8")
    text, before, after = update(original, add, default_list(root))
    if before == after:
        print("Doctor emails already present; .env unchanged.")
        return 0
    stamp, n = time.strftime("%Y%m%d-%H%M%S"), 0
    while True:
        backup = root / (f".env.bak-{stamp}" + (f"-{n}" if n else ""))
        try:
            fd = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            break
        except FileExistsError:
            n += 1
    with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
        f.write(original)
    tmp = root / ".env.tmp"
    tmp.write_text(text, encoding="utf-8")
    os.chmod(tmp, 0o600)
    os.replace(tmp, env)
    print(f"TEACHER_EMAILS now has {len(after)} doctors (was {len(before)}); added: {', '.join(e for e in after if e not in before)}.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
