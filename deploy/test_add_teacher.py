"""Tests for deploy/add_teacher.py.  Run:  python -m unittest deploy/test_add_teacher.py -v"""
from pathlib import Path
import contextlib
import io
import os
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import add_teacher as at  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DEFAULTS = at.default_list(ROOT)
OLD = ["aliya.albalushi@gutech.edu.om", "asnssrr@gmail.com", "dark99mam@gmail.com"]
L = ",".join(OLD)
NEW = "rawahi.s96@gmail.com"

FORMATS = {
    "plain": f"APP_URL=x\nTEACHER_EMAILS={L}\nSECRET=s\n",
    "crlf": f"APP_URL=x\r\nTEACHER_EMAILS={L}\r\nSECRET=s\r\n",
    "double_quoted": f'APP_URL=x\nTEACHER_EMAILS="{L}"\nSECRET=s\n',
    "single_quoted": f"APP_URL=x\nTEACHER_EMAILS='{L}'\nSECRET=s\n",
    "export_prefix": f"APP_URL=x\nexport TEACHER_EMAILS={L}\nSECRET=s\n",
    "leading_space": f"APP_URL=x\n  TEACHER_EMAILS={L}\nSECRET=s\n",
    "space_around_eq": f"APP_URL=x\nTEACHER_EMAILS = {L}\nSECRET=s\n",
    "no_line_uses_default": "APP_URL=x\nSECRET=s\n",
    "empty_value_uses_default": "APP_URL=x\nTEACHER_EMAILS=\nSECRET=s\n",
    "spaces_in_list": "APP_URL=x\nTEACHER_EMAILS=aliya.albalushi@gutech.edu.om, asnssrr@gmail.com, dark99mam@gmail.com\nSECRET=s\n",
    "semicolons_mixed_case": "APP_URL=x\nTEACHER_EMAILS=Aliya.AlBalushi@gutech.edu.om;asnssrr@gmail.com;DARK99MAM@gmail.com\nSECRET=s\n",
    "no_final_newline": f"APP_URL=x\nSECRET=s\nTEACHER_EMAILS={L}",
    "commented_old_line": f"APP_URL=x\n# TEACHER_EMAILS=old@x.com\nTEACHER_EMAILS={L}\nSECRET=s\n",
    "duplicate_lines": f"APP_URL=x\nTEACHER_EMAILS=aliya.albalushi@gutech.edu.om\nTEACHER_EMAILS={L}\nSECRET=s\n",
}

# What the previous shell version wrote on top of each format (the state production may be in now).
BROKEN_BY_OLD_SCRIPT = {
    "quoted_then_appended": f'APP_URL=x\nSECRET=s\nTEACHER_EMAILS="{L}",{NEW}\n',
    "export_line_kept_plus_new_line": f"APP_URL=x\nexport TEACHER_EMAILS={L}\nSECRET=s\nTEACHER_EMAILS={NEW}\n",
    "default_replaced_by_single_email": f"APP_URL=x\nSECRET=s\nTEACHER_EMAILS={NEW}\n",
}


def app_sees(text: str) -> list[str]:
    """What the app accepts: Docker's env_file parse (last line wins, whole-value quotes stripped)
    followed by src/lib/env.ts (split on , ; whitespace, lowercase, empty -> default)."""
    val = None
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        k, _, v = line.partition("=")
        if k.strip() == "TEACHER_EMAILS":
            v = v.strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
                v = v[1:-1]
            val = v
    if not (val or "").strip():
        return list(DEFAULTS)
    return [e.strip().lower() for e in __import__("re").split(r"[,;\s]+", val) if e.strip()]


class Formats(unittest.TestCase):
    def test_every_format_keeps_old_doctors_and_adds_new(self):
        for name, text in FORMATS.items():
            with self.subTest(name):
                out, before, after = at.update(text, [NEW], DEFAULTS)
                seen = app_sees(out)
                for e in OLD + [NEW]:
                    self.assertIn(e, seen, f"{name}: app would not accept {e}\n{out}")
                self.assertEqual(sum(1 for l in out.splitlines() if "TEACHER_EMAILS=" in l and not l.lstrip().startswith("#")), 1)
                self.assertIn("APP_URL=x", out)
                self.assertIn("SECRET=s", out)

    def test_other_lines_and_line_endings_preserved(self):
        out, _, _ = at.update(FORMATS["crlf"], [NEW], DEFAULTS)
        self.assertNotIn("\n", out.replace("\r\n", ""))
        out, _, _ = at.update(FORMATS["commented_old_line"], [NEW], DEFAULTS)
        self.assertIn("# TEACHER_EMAILS=old@x.com", out)

    def test_already_present_is_a_no_op(self):
        text = f"TEACHER_EMAILS={L},{NEW}\n"
        _, before, after = at.update(text, [NEW.upper()], DEFAULTS)
        self.assertEqual(before, after)


class RecoverProduction(unittest.TestCase):
    def test_readding_old_doctors_repairs_every_broken_state(self):
        for name, text in BROKEN_BY_OLD_SCRIPT.items():
            with self.subTest(name):
                out, _, _ = at.update(text, OLD, DEFAULTS)
                seen = app_sees(out)
                for e in OLD + [NEW]:
                    self.assertIn(e, seen, f"{name}: {e} still locked out\n{out}")


class CommandLine(unittest.TestCase):
    def run_in(self, env_text: str, arg: str):
        d = Path(tempfile.mkdtemp())
        (d / "src/lib").mkdir(parents=True)
        (d / "src/lib/env.ts").write_text((ROOT / "src/lib/env.ts").read_text(encoding="utf-8"), encoding="utf-8")
        (d / ".env").write_text(env_text, encoding="utf-8")
        return self.run_in_dir(d, arg)

    def run_in_dir(self, d: Path, arg: str):
        cwd = os.getcwd()
        os.chdir(d)
        try:
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
                code = at.main(["add_teacher.py", arg])
        finally:
            os.chdir(cwd)
        return code, d, buf.getvalue()

    def test_writes_env_and_backup(self):
        extra = "new.doctor@example.com"
        code, d, out = self.run_in(FORMATS["no_line_uses_default"], extra)
        self.assertEqual(code, 0, out)
        (d / ".env.bak").write_text("ORIGINAL", encoding="utf-8")
        code2, _, _ = self.run_in_dir(d, "second.doctor@example.com")
        self.assertEqual(code2, 0)
        backups = sorted(d.glob(".env.bak-*"))
        self.assertGreaterEqual(len(backups), 1)
        self.assertIn(FORMATS["no_line_uses_default"], [b.read_text(encoding="utf-8") for b in backups])
        self.assertEqual((d / ".env.bak").read_text(encoding="utf-8"), "ORIGINAL", "existing .env.bak must never be overwritten")
        for e in OLD + [NEW, extra]:
            self.assertIn(e, app_sees((d / ".env").read_text(encoding="utf-8")))

    def test_rejects_invalid_email_and_leaves_env(self):
        for bad in ["", "rawahi.s96@gmail", "a@b.com;rm -rf /", "x y"]:
            with self.subTest(bad):
                code, d, _ = self.run_in(FORMATS["plain"], bad)
                self.assertEqual(code, 1)
                self.assertEqual((d / ".env").read_text(encoding="utf-8"), FORMATS["plain"])
                self.assertFalse(list(d.glob(".env.bak*")))

    def test_no_change_when_present(self):
        code, d, out = self.run_in(FORMATS["plain"], "DARK99MAM@gmail.com")
        self.assertEqual(code, 0)
        self.assertIn("unchanged", out)
        self.assertFalse(list(d.glob(".env.bak*")))

    def test_reads_real_default_list(self):
        self.assertTrue(set(OLD + [NEW]) <= set(DEFAULTS), DEFAULTS)


if __name__ == "__main__":
    unittest.main()
