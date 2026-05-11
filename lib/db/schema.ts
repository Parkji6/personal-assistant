import { pgTable, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';

export const googleTokens = pgTable('google_tokens', {
  id: integer().primaryKey().default(1),
  refreshToken: text().notNull(),
  accessToken: text(),
  expiresAt: timestamp(),
  scope: text(),
  updatedAt: timestamp().defaultNow(),
});

export const emailPreferences = pgTable('email_preferences', {
  id: integer().primaryKey().default(1),
  urgentSenders: jsonb().default([]),
  urgentKeywords: jsonb().default([]),
  updatedAt: timestamp().defaultNow(),
});
