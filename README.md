# Personal Assistant

A proactive personal AI assistant that delivers a morning brief via Telegram each day at ~7 AM Warsaw time. Five sections: weather, calendar, email triage, news digest, today's tasks. Built with Next.js 16 on Vercel.

See [`docs/PLAN-v1.1.md`](docs/PLAN-v1.1.md) for the full plan and [`docs/MILESTONES.md`](docs/MILESTONES.md) for the day-by-day build schedule.

## Day 1 status

End-to-end pipeline scaffolded:

- `app/api/cron/morning-brief/route.ts` — sends a hello-world Telegram message
- `app/api/cron/dead-mans-switch/route.ts` — noon backup cron stub (wires up on Day 8.5)
- `lib/telegram.ts` — HTML-mode send with 3× exponential-backoff retry on 5xx
- `vercel.ts` — typed config; two crons at `0 5 * * *` and `0 11 * * *` UTC

## Local dev

```bash
cp .env.example .env.local      # fill in TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
npm run dev
curl http://localhost:3000/api/cron/morning-brief
```

The Telegram message should land within ~1 second.

## Deploy

```bash
vercel link                     # one-time: link to a Vercel project
vercel env add TELEGRAM_BOT_TOKEN production
vercel env add TELEGRAM_CHAT_ID production
vercel deploy --prod
```

Vercel auto-generates `CRON_SECRET` once it detects crons in `vercel.ts`. The route handlers verify the `Authorization: Bearer ${CRON_SECRET}` header in production.

## Testing the cron without waiting until 5 AM UTC

In the Vercel dashboard → Crons → click "Run". Or hit the route URL directly with the right header:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://<your-deployment>.vercel.app/api/cron/morning-brief
```

## Stack

- Next.js 16 (App Router) + React 19, Tailwind v4
- Vercel Functions (Fluid Compute, Node 24)
- Telegram Bot API (HTML parse mode — far simpler escapes than MarkdownV2)
- Coming next: Vercel AI Gateway → Claude Sonnet 4.6, Neon Postgres + Drizzle, Google OAuth, Notion, Open-Meteo, RSS
