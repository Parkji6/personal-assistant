# Personal Assistant

An AI-powered personal assistant that helps with email management, calendar scheduling, task tracking, and general queries via Telegram.

## Features

### Morning Brief (Cron Job)
- **Daily 7 AM briefing** with weather, news, calendar events, emails, and tasks
- **AI-powered synthesis** using Claude to summarize and prioritize information
- **Multi-source integration**: Open-Meteo, RSS feeds, Google Calendar, Gmail, Notion
- **Graceful degradation**: Brief sends even if some sources are unavailable

### Interactive Telegram Bot (Day 5)
- **Chat with Claude**: Ask questions, get information, have conversations
- **Email search**: Find specific emails (e.g., "Did I get a job offer?")
- **Calendar management**: Create events with natural language (e.g., "Meeting tomorrow at 3pm")
- **Task management**: Add tasks to Notion with priority and due dates
- **Conversation memory**: Bot remembers last 5 messages for context

## Tech Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **AI**: Claude (Haiku 4.5 for bot, Sonnet 4.6 for synthesis) via Vercel AI Gateway
- **Database**: PostgreSQL (Supabase) with Drizzle ORM
- **APIs**: Google Calendar, Gmail, Notion, Telegram
- **Deployment**: Vercel (Fluid Compute)
- **Scheduling**: Vercel Cron Jobs

## Setup

### Prerequisites
- Node.js 24+
- Vercel account (for deployment)
- Google Cloud project (for Gmail/Calendar)
- Supabase project (PostgreSQL)
- Telegram Bot Token
- Notion API token

### Local Development

```bash
npm install

# Set environment variables
cp .env.example .env.local

# Run database migrations
npx drizzle-kit push

# Start dev server
npm run dev
```

### Environment Variables

```
VERCEL_OIDC_TOKEN=...              # Vercel AI Gateway auth
TELEGRAM_BOT_TOKEN=...              # Telegram bot token
TELEGRAM_WEBHOOK_SECRET=...         # Webhook secret
DATABASE_URL=postgresql://...       # Supabase connection string
NOTION_TOKEN=...                    # Notion API token
NOTION_TASKS_DB_ID=...              # Notion Tasks database ID
```

## Current Status

### ✅ Completed
- Morning brief with 5-section synthesis
- Telegram webhook & Claude integration
- Email search, calendar, and task action handlers
- Conversation memory
- Intent detection
- Database schema with Drizzle ORM

### ⚠️ Known Issues
- Database connectivity needs proper DATABASE_URL configuration
- Google access tokens need to be set up in Vercel environment

### 🚀 Next Steps
1. Fix DATABASE_URL in Vercel
2. Configure Google OAuth tokens
3. Test all action handlers with real data
4. Implement error recovery

## Testing

Message `@YourBotName` on Telegram:
- "Did I get any job offers?" → email search
- "Add meeting tomorrow at 3pm" → calendar event
- "Remind me to call dentist" → add task

## License

MIT
