/** All settings come from environment variables (see .env.example). Read at request time, not build time. */
const list = (v: string | undefined) =>
  (v ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export const env = {
  get appUrl() {
    return process.env.APP_URL || "http://localhost:3000";
  },
  /** Local development only: the code 0000 signs in without email. Never active in production builds. */
  get devOtpBypass() {
    return process.env.NODE_ENV === "development" && process.env.DEV_OTP_BYPASS !== "false";
  },
  get isProd() {
    return process.env.NODE_ENV === "production";
  },
  get teacherEmails() {
    return list(
      process.env.TEACHER_EMAILS ?? "aliya.albalushi@gutech.edu.om,asnssrr@gmail.com,dark99mam@gmail.com",
    );
  },
  get studentDomain() {
    return (process.env.STUDENT_EMAIL_DOMAIN || "student.gutech.edu.om").toLowerCase();
  },
  get resendKey() {
    return process.env.RESEND_API_KEY || "";
  },
  get mailFrom() {
    return process.env.MAIL_FROM || "AccountingSim <onboarding@resend.dev>";
  },
  get sessionSecret() {
    const s = process.env.SESSION_SECRET;
    if (!s && process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is not set");
    return s || "dev-only-secret";
  },
  get aiKey() {
    return process.env.DEEPSEEK_API_KEY || "";
  },
  get aiBaseUrl() {
    return process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
  },
  get aiModel() {
    return process.env.DEEPSEEK_MODEL || "deepseek-chat";
  },
  /** Set to true only if the chosen model accepts images. */
  get aiVision() {
    return (process.env.AI_VISION || "").toLowerCase() === "true";
  },
  get uploadDir() {
    return process.env.UPLOAD_DIR || "";
  },
};
