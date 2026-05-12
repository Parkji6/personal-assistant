import { pgTable, text, timestamp, integer, jsonb, bigserial, bigint } from 'drizzle-orm/pg-core';

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

export const conversationHistory = pgTable('conversation_history', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).notNull(),
  role: text('role').notNull(), // 'user' | 'assistant'
  message: text('message').notNull(),
  messageType: text('message_type'), // 'text' | 'image'
  imageUrl: text('image_url'),
  actionTaken: text('action_taken'), // 'created_event', 'added_task', 'searched_emails', null
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
