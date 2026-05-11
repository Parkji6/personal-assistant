CREATE TABLE "conversation_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"role" text NOT NULL,
	"message" text NOT NULL,
	"message_type" text,
	"image_url" text,
	"action_taken" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_preferences" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"urgentSenders" jsonb DEFAULT '[]'::jsonb,
	"urgentKeywords" jsonb DEFAULT '[]'::jsonb,
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "google_tokens" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"refreshToken" text NOT NULL,
	"accessToken" text,
	"expiresAt" timestamp,
	"scope" text,
	"updatedAt" timestamp DEFAULT now()
);
