import crypto from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { env } from "./env";
import { sendLoginCode } from "./mail";

const COOKIE = "accsim_session";
const SESSION_DAYS = 30;
const CODE_MINUTES = 10;
const MAX_TRIES = 5;
const RESEND_SECONDS = 60;
const MAX_CODES_PER_HOUR = 6;

export type Role = "teacher" | "student";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function roleForEmail(email: string): Role | null {
  const e = normalizeEmail(email);
  if (env.teacherEmails.includes(e)) return "teacher";
  if (/^[^@\s]+@[^@\s]+$/.test(e) && e.endsWith(`@${env.studentDomain}`)) return "student";
  return null;
}

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const codeHash = (email: string, code: string) => sha(`${env.sessionSecret}:${email}:${code}`);

export type SendResult = { ok: true } | { ok: false; error: "not_allowed" | "too_soon" | "too_many" | "mail_failed"; wait?: number };

export async function requestCode(rawEmail: string): Promise<SendResult> {
  const email = normalizeEmail(rawEmail);
  if (!roleForEmail(email)) return { ok: false, error: "not_allowed" };
  const db = await getDb();
  const hourAgo = new Date(Date.now() - 3600_000);
  const recent = await db
    .select()
    .from(schema.otpCodes)
    .where(and(eq(schema.otpCodes.email, email), gt(schema.otpCodes.createdAt, hourAgo)))
    .orderBy(desc(schema.otpCodes.createdAt));
  if (recent[0]) {
    const age = (Date.now() - recent[0].createdAt.getTime()) / 1000;
    if (age < RESEND_SECONDS) return { ok: false, error: "too_soon", wait: Math.ceil(RESEND_SECONDS - age) };
  }
  if (recent.length >= MAX_CODES_PER_HOUR) return { ok: false, error: "too_many" };

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(schema.otpCodes).values({
    email,
    codeHash: codeHash(email, code),
    expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000),
  });
  try {
    await sendLoginCode(email, code, CODE_MINUTES);
  } catch (e) {
    console.error("[mail] failed to send login code", e);
    return { ok: false, error: "mail_failed" };
  }
  return { ok: true };
}

export type VerifyResult = { ok: true; role: Role } | { ok: false; error: "wrong_code" | "expired" | "too_many_tries" | "not_allowed" };

export async function verifyCode(rawEmail: string, rawCode: string): Promise<VerifyResult> {
  const email = normalizeEmail(rawEmail);
  const role = roleForEmail(email);
  if (!role) return { ok: false, error: "not_allowed" };
  const code = rawCode.replace(/\D/g, "");
  const db = await getDb();
  if (env.devOtpBypass && code === "0000") return startSession(email, role);
  const [otp] = await db
    .select()
    .from(schema.otpCodes)
    .where(and(eq(schema.otpCodes.email, email), isNull(schema.otpCodes.usedAt)))
    .orderBy(desc(schema.otpCodes.createdAt))
    .limit(1);
  if (!otp || otp.expiresAt < new Date()) return { ok: false, error: "expired" };
  if (otp.attempts >= MAX_TRIES) return { ok: false, error: "too_many_tries" };
  const good =
    code.length === 6 && crypto.timingSafeEqual(Buffer.from(codeHash(email, code)), Buffer.from(otp.codeHash));
  if (!good) {
    await db.update(schema.otpCodes).set({ attempts: otp.attempts + 1 }).where(eq(schema.otpCodes.id, otp.id));
    return { ok: false, error: otp.attempts + 1 >= MAX_TRIES ? "too_many_tries" : "wrong_code" };
  }
  await db.update(schema.otpCodes).set({ usedAt: new Date() }).where(eq(schema.otpCodes.id, otp.id));
  return startSession(email, role);
}

async function startSession(email: string, role: Role): Promise<VerifyResult> {
  const db = await getDb();
  let [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!user) {
    [user] = await db.insert(schema.users).values({ email, role }).returning();
  } else if (user.role !== role) {
    [user] = await db.update(schema.users).set({ role }).where(eq(schema.users.id, user.id)).returning();
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(schema.sessions).values({ id: sha(token), userId: user.id, expiresAt });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: env.isProd && env.appUrl.startsWith("https"),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return { ok: true, role };
}

export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const [row] = await db
    .select({ user: schema.users, expiresAt: schema.sessions.expiresAt })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(eq(schema.sessions.id, sha(token)))
    .limit(1);
  if (!row || row.expiresAt < new Date()) return null;
  // The allowlist decides the role on every request, so removing a teacher email takes effect at once.
  const role = roleForEmail(row.user.email);
  if (!role) return null;
  return { ...row.user, role };
});

export async function requireUser(role?: Role) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?m=signed-out");
  if (role && user.role !== role) redirect("/messages/no-access");
  return user;
}

export const requireTeacher = () => requireUser("teacher");
export const requireStudent = () => requireUser("student");

export async function logout() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(schema.sessions).where(eq(schema.sessions.id, sha(token)));
  }
  jar.delete(COOKIE);
}
