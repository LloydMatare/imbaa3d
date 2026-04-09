import { pgTable, text, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";

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
