# Personal Assistant

An AI-powered personal assistant that delivers a daily morning brief to Telegram and lets you chat with the bot to read your Gmail, manage your Google Calendar, and add tasks to Notion.

Single-user. Built for me, but the source is here if it's useful.

## Features

### Daily Morning Brief
Cron-triggered every morning (~7 AM Warsaw time) — sends a single Telegram message containing:
- Weather (current temp, feels-like, wind, rain windows) via Open-Meteo
- Today's calendar events (Google Calendar)
- Open tasks (Notion)
- Urgent emails (Gmail)
- Top headlines from 5 categorized RSS feeds, each summarized by Claude

Graceful degradation — if any source is unavailable, the brief still sends with the others.

### Interactive Telegram Bot
Two-way conversation with tool-calling. Claude executes real API calls and uses the actual results in its responses.

Available tools:
- `search_emails` — Gmail search with native query syntax
- `list_events` / `create_event` — Google Calendar read/write
- `list_tasks` / `create_task` — Notion database read/write

Conversation history (last 20 messages) is persisted in Postgres for context across turns.

## Tech Stack

- **Framework**: Next.js 16 (App Router) on Vercel Fluid Compute
- **AI**: Claude via Vercel AI Gateway — Haiku 4.5 for bot conversations, Sonnet for headline synthesis
- **Database**: Supabase Postgres + Drizzle ORM
- **Integrations**: Google OAuth (Gmail + Calendar), Notion API, Telegram Bot API
- **Scheduling**: Vercel Cron

## Architecture

```
Telegram → /api/telegram/webhook → Claude (tools) → Gmail/Calendar/Notion APIs
                                       ↓
                                  Supabase (conversation history)

Vercel Cron → /api/cron/morning-brief → fetch 5 sources in parallel
                                          ↓
                                     Claude (summarize headlines)
                                          ↓
                                     Telegram sendMessage
```

Google access tokens are auto-refreshed via a stored refresh token in the database. No long-lived bearer tokens in env vars.

## Setup

### Prerequisites
- Node.js 24+
- Vercel account (auto-deploys from `main`)
- Supabase project (Postgres)
- Google Cloud OAuth client (Gmail + Calendar scopes)
- Telegram bot (via [@BotFather](https://t.me/botfather))
- Notion integration with access to a Tasks database

### Local Development

```bash
npm install
cp .env.example .env.local      # fill in real values
npx drizzle-kit push             # apply migrations
npm run dev
```

### Environment Variables

```
# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=                # chat ID where morning brief is sent
TELEGRAM_WEBHOOK_SECRET=         # arbitrary random string
ALLOWED_TELEGRAM_USER_IDS=       # comma-separated allowlist (fail closed)

# Cron auth (Vercel sets this automatically when crons exist)
CRON_SECRET=

# AI
AI_GATEWAY_API_KEY=              # or rely on VERCEL_OIDC_TOKEN on Vercel

# Google OAuth (Gmail readonly + Calendar full)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=             # https://<your-domain>/api/auth/google/callback

# Notion
NOTION_TOKEN=
NOTION_TASKS_DB_ID=              # 32-char hex UUID of the database (not the page)

# Database
DATABASE_URL=                    # Supabase Postgres connection string
```

### One-time Google authorization
After deploying, visit `https://<your-domain>/api/auth/google` and grant permissions. The callback stores a long-lived refresh token in the database — the bot then auto-refreshes access tokens on every request.

### Telegram webhook
Register the webhook to point at your production domain:

```bash
curl -X POST "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://<your-domain>/api/telegram/webhook","secret_token":"<your-secret>"}'
```

## Security

- Webhook requests verified via `secret_token` header
- User-level allowlist (`ALLOWED_TELEGRAM_USER_IDS`) — bot rejects everyone else by default
- Cron endpoints require `Bearer $CRON_SECRET` in production (fail closed if unset)
- Google tokens stored in Postgres, never in env vars
- Error messages sent to the user are sanitized — internals never leak

## License

MIT
