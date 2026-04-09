import { pgTable, text, integer, timestamp, jsonb, boolean, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("User", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  image: text("image"),
  credits: integer("credits").notNull().default(5),
  stripeCustomerId: text("stripeCustomerId").unique(),
  createdAt: timestamp("createdAt", { precision: 3, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const projects = pgTable("Project", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").notNull().default("FULL_CONVERSION"),
  status: text("status").notNull().default("DRAFT"),
  floorPlanData: jsonb("floorPlanData"),
  sceneConfig: jsonb("sceneConfig"),
  thumbnailUrl: text("thumbnailUrl"),
  modelUrl: text("modelUrl"),
  isPublic: boolean("isPublic").notNull().default(false),
  // Unlisted access token for sharing private projects via /view/:id?token=...
  // Postgres UNIQUE allows multiple NULLs, so only set when sharing is enabled.
  shareToken: text("shareToken").unique(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp("createdAt", { precision: 3, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const creditTransactions = pgTable("CreditTransaction", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("userId").notNull().references(() => users.id, { onDelete: 'cascade' }),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  balanceAfter: integer("balanceAfter").notNull(),
  createdAt: timestamp("createdAt", { precision: 3, mode: 'date' }).notNull().defaultNow(),
});

export const payments = pgTable("Payment", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("userId").notNull().references(() => users.id, { onDelete: 'cascade' }),
  stripeCheckoutSessionId: text("stripeCheckoutSessionId").notNull().unique(),
  stripePaymentIntentId: text("stripePaymentIntentId").unique(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("usd"),
  creditsAdded: integer("creditsAdded").notNull(),
  status: text("status").notNull().default("PENDING"),
  createdAt: timestamp("createdAt", { precision: 3, mode: 'date' }).notNull().defaultNow(),
});

export const projectVersions = pgTable("ProjectVersion", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text("projectId").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  floorPlanData: jsonb("floorPlanData").notNull(),
  label: text("label"),
  createdAt: timestamp("createdAt", { precision: 3, mode: 'date' }).notNull().defaultNow(),
});

export const projectMembers = pgTable(
  "ProjectMember",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    projectId: text("projectId")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("viewer"),
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    projectUserUnique: uniqueIndex("ProjectMember_project_user").on(
      table.projectId,
      table.userId
    ),
  })
);

export const projectInvites = pgTable(
  "ProjectInvite",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    projectId: text("projectId")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("viewer"),
    token: text("token").notNull().unique(),
    invitedBy: text("invitedBy").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    projectEmailUnique: uniqueIndex("ProjectInvite_project_email").on(
      table.projectId,
      table.email
    ),
  })
);

// Phase 3: conversion job tracking (enables queued/processing/complete/failed UX and future async workers).
export const conversionJobs = pgTable("ConversionJob", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text("projectId")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  // QUEUED | PROCESSING | COMPLETE | FAILED
  status: text("status").notNull().default("QUEUED"),
  // floorplan | image (future)
  mode: text("mode").notNull().default("floorplan"),
  settings: jsonb("settings"),
  modelUrl: text("modelUrl"),
  error: text("error"),
  startedAt: timestamp("startedAt", { precision: 3, mode: "date" }),
  finishedAt: timestamp("finishedAt", { precision: 3, mode: "date" }),
  createdAt: timestamp("createdAt", { precision: 3, mode: "date" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
