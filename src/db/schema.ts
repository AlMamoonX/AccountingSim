import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  serial,
  boolean,
  jsonb,
  real,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  role: text("role", { enum: ["teacher", "student"] }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("otp_email_idx").on(t.email)],
);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256 of the cookie token
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const classes = pgTable("classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  teacherId: uuid("teacher_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  joinCode: text("join_code").notNull().unique(),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const enrollments = pgTable(
  "enrollments",
  {
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.classId, t.studentId] })],
);

export const courseDocuments = pgTable("course_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  lecture: text("lecture"),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  storedPath: text("stored_path").notNull(),
  status: text("status", { enum: ["reading", "ready", "failed"] }).notNull().default("reading"),
  error: text("error"),
  pages: integer("pages").notNull().default(0),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const docChunks = pgTable(
  "doc_chunks",
  {
    id: serial("id").primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => courseDocuments.id, { onDelete: "cascade" }),
    pageNo: integer("page_no").notNull(),
    text: text("text").notNull(),
  },
  (t) => [index("chunk_doc_idx").on(t.documentId)],
);

export const exercises = pgTable("exercises", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  businessName: text("business_name").notNull().default(""),
  status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
  spec: jsonb("spec").notNull(),
  warnings: jsonb("warnings").notNull().default([]),
  request: jsonb("request"),
  sources: jsonb("sources").notNull().default([]),
  parentId: uuid("parent_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const exerciseVersions = pgTable(
  "exercise_versions",
  {
    id: serial("id").primaryKey(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    spec: jsonb("spec").notNull(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("version_ex_idx").on(t.exerciseId)],
);

export const assignments = pgTable("assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  exerciseId: uuid("exercise_id")
    .notNull()
    .references(() => exercises.id),
  classId: uuid("class_id")
    .notNull()
    .references(() => classes.id, { onDelete: "cascade" }),
  opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
  deadline: timestamp("deadline", { withTimezone: true }).notNull(),
  mode: text("mode", { enum: ["practice", "graded"] }).notNull(),
  variantMode: text("variant_mode", { enum: ["same", "unique"] }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    seed: integer("seed").notNull(),
    answers: jsonb("answers").notNull().default({}),
    status: text("status", { enum: ["in_progress", "submitted"] }).notNull().default("in_progress"),
    score: real("score"),
    maxScore: real("max_score"),
    partScores: jsonb("part_scores"),
    progress: real("progress").notNull().default(0),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sub_unique").on(t.assignmentId, t.studentId)],
);

export const aiLogs = pgTable("ai_logs", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  model: text("model").notNull(),
  exerciseId: uuid("exercise_id"),
  ok: boolean("ok").notNull(),
  error: text("error"),
  response: text("response"),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  ms: integer("ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type ClassRow = typeof classes.$inferSelect;
export type ExerciseRow = typeof exercises.$inferSelect;
export type AssignmentRow = typeof assignments.$inferSelect;
export type SubmissionRow = typeof submissions.$inferSelect;

/* ---------------- company simulations ---------------- */

export const sims = pgTable("sims", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  businessName: text("business_name").notNull().default(""),
  status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
  spec: jsonb("spec").notNull(),
  warnings: jsonb("warnings").notNull().default([]),
  request: jsonb("request"),
  sources: jsonb("sources").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const simVersions = pgTable(
  "sim_versions",
  {
    id: serial("id").primaryKey(),
    simId: uuid("sim_id")
      .notNull()
      .references(() => sims.id, { onDelete: "cascade" }),
    spec: jsonb("spec").notNull(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sim_version_idx").on(t.simId)],
);

export const simRuns = pgTable("sim_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  simId: uuid("sim_id")
    .notNull()
    .references(() => sims.id),
  classId: uuid("class_id")
    .notNull()
    .references(() => classes.id, { onDelete: "cascade" }),
  openedMonth: integer("opened_month").notNull().default(1),
  deadline: timestamp("deadline", { withTimezone: true }).notNull(),
  accountingWeight: integer("accounting_weight").notNull().default(70),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const simPlayers = pgTable(
  "sim_players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => simRuns.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyName: text("company_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sim_player_unique").on(t.runId, t.studentId)],
);

export const simMonths = pgTable(
  "sim_months",
  {
    playerId: uuid("player_id")
      .notNull()
      .references(() => simPlayers.id, { onDelete: "cascade" }),
    month: integer("month").notNull(),
    decisions: jsonb("decisions").notNull(),
    answers: jsonb("answers").notNull().default({}),
    step: text("step", { enum: ["record", "done"] }).notNull().default("record"),
    accScore: real("acc_score"),
    accMax: real("acc_max"),
    auto: boolean("auto").notNull().default(false),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
    doneAt: timestamp("done_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.month] })],
);

export type SimRow = typeof sims.$inferSelect;
export type SimRunRow = typeof simRuns.$inferSelect;
export type SimPlayerRow = typeof simPlayers.$inferSelect;
export type SimMonthRow = typeof simMonths.$inferSelect;
