# Personal Assistant — Plan Review & Improvements (v1.1)

## Context

You wrote a solid scope doc for a 7 AM Telegram morning brief. This review tightens it before you start coding tomorrow. Goal: catch the things that will bite you on day 3 and replace outdated stack assumptions, without redesigning the project.

The original plan is structurally good. The shape — 5-section brief, parallel API fan-out, Claude synthesis, Telegram delivery, small dashboard — stays. What follows are surgical fixes, ordered by impact.

---

## 1. Critical risks your plan misses (read these first)

These four are quiet landmines. Each is a one-paragraph fix, but missing any of them costs a half-day mid-build.

### 1a. NewsAPI free tier prohibits production deployments
NewsAPI.org's developer plan is explicitly **development-only** — their ToS forbids hosting it on a public/production server. A Vercel-hosted cron likely violates this. They will shut off the key with no warning.

**Fix:** Default to RSS only for v1 — it's free, no quota, no key. Curate ~10 feeds (TechCrunch, Hacker News, Rzeczpospolita, Polityka Insight, plus a couple AI sources like The Verge AI / TechCrunch AI). Use Claude to dedupe and rank. If you outgrow RSS later, switch to **GNews** (free tier explicitly allows production), **TheNewsAPI**, or **Mediastack**.

### 1b. Vercel Cron is UTC — your 7 AM Warsaw shifts under DST
Vercel Cron expressions are UTC. Warsaw is CET (UTC+1) in winter, CEST (UTC+2) in summer. A single `0 6 * * *` fires at 7 AM in winter and 8 AM in summer.

**Fix:** Pick one of:
- **Simplest:** schedule `0 5 * * *` UTC (= 6 AM winter, 7 AM summer) and accept a 1-hour seasonal drift. Lower-effort.
- **Right way:** cron at `0 5 * * *` UTC always, and inside the handler check the current Europe/Warsaw hour. If it's not yet 7 AM local, exit early. Set a second cron `0 6 * * *` UTC as backup. Same handler, idempotency guard via DB ("did we already send today's brief?").
- **Recommended for v1:** Option 1. Move to option 2 in v2.

### 1c. Google OAuth "verification" trap
For a personal-use app calling Gmail + Calendar with restricted scopes, Google requires app verification before allowing any user (including you) past 100 logins, *unless* you keep the OAuth consent screen in **"Testing" mode** and add your own Google account as a test user. In Testing mode, your refresh tokens expire every 7 days — fatal for a daily cron.

**Fix:** Two options, both work:
- Keep the app in **Testing**, add yourself as a test user, accept that you re-auth weekly. Painful for a cron.
- Move the OAuth app to **"Production"** *without* requesting verification. For your own personal scopes (read-only Gmail + Calendar), this gives non-expiring refresh tokens because *you are the only test user and the app owner*. Most reliable path for a single-user assistant. **This is the standard workaround — not a hack.**

Either way: **store the refresh token in Postgres**, not env vars. Refresh access tokens server-side on each cron run.

### 1d. Telegram MarkdownV2 escapes are brutal
MarkdownV2 requires escaping `_*[]()~`>#+-=|{}.!` — a single un-escaped period in a URL silently fails the message send. Plain `Markdown` (legacy) is more forgiving but supports less formatting.

**Fix:** Use `parse_mode: "HTML"` with `<b>`, `<i>`, `<a>` — much simpler escaping rules (only `<`, `>`, `&`). Or use a vetted helper like `node-telegram-bot-api` with a markdown-escape utility. Don't hand-roll MarkdownV2.

---

## 2. Stack corrections (your knowledge is one cycle behind)

Your plan uses some Vercel/Next.js assumptions that no longer hold as of 2026-02:

| Plan says | Reality |
|---|---|
| Next.js 14 (App Router) | **Next.js 16** is current — has Cache Components (PPR + `use cache`). For this project, Next 15 is fine; 16 only matters if you build the dashboard with cached data. |
| Vercel Postgres | **No longer offered.** Use **Neon** (Postgres) via Vercel Marketplace — auto-provisions `DATABASE_URL`. Free tier is generous. |
| `vercel.json` config | **`vercel.ts` is now recommended** — typed config, dynamic logic. Use `@vercel/config`. Optional but nicer. |
| Edge Functions / Node-only middleware | **Fluid Compute** is now the default — full Node.js, lower cold starts, 300s default timeout. No special config needed. |
| Anthropic SDK directly | Strongly consider **Vercel AI Gateway**: one API key, model fallbacks, observability, zero data retention. Use plain `"anthropic/claude-sonnet-4-6"` strings via the AI SDK. Cheaper to wire, easier to swap models later. |

**Recommended exact model IDs:**
- Brief synthesis (one big call/day): `claude-sonnet-4-6`
- Email triage / categorization (cheap bulk): `claude-haiku-4-5-20251001`
- Both via AI SDK + Gateway, not direct SDK.

---

## 3. Refined architecture

```
┌─────────────────────────────────────────────────┐
│   Vercel Cron — 0 5 * * * UTC (≈7 AM Warsaw*)   │
│         /api/cron/morning-brief (Node 24)       │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│         Brief Orchestrator (Fluid Compute)      │
│                                                 │
│  Idempotency check: brief_log for today?        │
│  └─ if exists, exit (cron may double-fire)      │
│                                                 │
│  Step 1: Promise.allSettled on five fetchers    │
│  ├─ Open-Meteo  → weather                       │
│  ├─ Google Cal  → today's events                │
│  ├─ Gmail       → unread last 16h               │
│  ├─ RSS feeds   → headlines (parallel)          │
│  └─ Notion      → today's tasks                 │
│  Each has a 10s timeout + retry-once.           │
│                                                 │
│  Step 2: Compose prompt with whatever           │
│  succeeded. Skip sections with errors —         │
│  log them to brief_log.errors[].                │
│                                                 │
│  Step 3: Single call to Claude Sonnet 4.6 via   │
│  Vercel AI Gateway, structured prompt.          │
│                                                 │
│  Step 4: Telegram sendMessage (HTML mode).      │
│  Retry 3× on 5xx with exp backoff.              │
│                                                 │
│  Step 5: Insert brief_log row (success+content) │
│                                                 │
│  Step 6 (on hard failure):                      │
│  Send a short error message via Telegram so     │
│  silent failures don't go unnoticed.            │
└─────────────────────────────────────────────────┘

* DST acceptable drift: 6 AM in summer, 7 AM in winter.
  Switch to local-time gate in v2 if it bothers you.
```

---

## 4. Concrete database schema (Neon Postgres)

```sql
-- brief history + idempotency
CREATE TABLE brief_log (
  id            BIGSERIAL PRIMARY KEY,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  local_date    DATE NOT NULL,            -- Warsaw date, for idempotency
  status        TEXT NOT NULL,            -- 'sent' | 'partial' | 'failed'
  content_md    TEXT,                     -- final message text
  raw_inputs    JSONB,                    -- what each integration returned
  errors        JSONB,                    -- {section: error_message}
  claude_usage  JSONB,                    -- input/output tokens, cost
  UNIQUE(local_date)                      -- prevents double-send
);

-- single row, single user, for v1
CREATE TABLE preferences (
  id                   INT PRIMARY KEY DEFAULT 1,
  sections_enabled     JSONB NOT NULL,    -- {weather:true, calendar:true,...}
  news_topics          JSONB NOT NULL,    -- ['ai','poland','macro','science']
  rss_feeds            JSONB NOT NULL,    -- [{url, topic, weight}]
  email_urgent_rules   JSONB NOT NULL,    -- {senders:[], keywords:[]}
  weekend_mode         TEXT NOT NULL,     -- 'same' | 'lite' | 'skip'
  CONSTRAINT singleton CHECK (id = 1)
);

-- google oauth refresh tokens — keep here, NOT in env vars
CREATE TABLE google_tokens (
  id              INT PRIMARY KEY DEFAULT 1,
  refresh_token   TEXT NOT NULL,
  access_token    TEXT,
  expires_at      TIMESTAMPTZ,
  scope           TEXT,
  CONSTRAINT singleton CHECK (id = 1)
);
```

Use **Drizzle ORM** (TypeScript-first, plays nicely with Neon serverless driver). Skip Prisma — heavier, slower cold starts.

---

## 5. Error handling — concrete contract

Your plan says "graceful degradation" — that needs spec or you'll hand-wave it on day 9.

| Failure | Behavior |
|---|---|
| One integration times out (>10s) | Skip that section, log to `errors`, brief still sends with note "Calendar unavailable today" |
| Two+ integrations fail | Still send brief with available sections |
| Claude API fails | Send a fallback plain-text concatenation of raw fetched data so you're not blind |
| Telegram fails (network) | Retry 3× w/ exp backoff. If still failing, write to `brief_log.status='failed'` and emit a Vercel log error (you'll see it in the dashboard) |
| All fetchers fail | Send a one-line "🚨 Brief failed at [step]" Telegram message |
| Cron didn't fire (worst case — silent) | Add a **dead-man's-switch**: a second cron at noon checks if today's `brief_log` exists; if not, sends an alert |

---

## 6. Auth for the dashboard

Your plan: "unguessable URL or single env-var password."

**Better for ~zero effort:** Vercel **Deployment Protection** → "Vercel Authentication" mode. This puts SSO behind your Vercel account login. You log in with the same account you use to deploy. No code, no env vars, no auth flow to build. Switch on per-deployment in the project settings.

For v2 multi-user → Clerk via Vercel Marketplace (auto-provisions env vars).

---

## 7. Refined cost estimate

Your $3–6/month figure is high. Actuals at current Anthropic pricing:

- Sonnet 4.6 input ≈ $3/M tokens, output ≈ $15/M
- One brief: ~4k input + ~1k output → $0.012 + $0.015 = **~$0.027/day**
- Monthly: **~$0.80** for the synthesis call
- Email categorization on Haiku 4.5 (input $1/M, output $5/M) at maybe 2k in / 0.5k out: ~$0.005/day → **~$0.15/month**

**Realistic v1 total: ~$1–2/month.** Add prompt caching on the system prompt (free wins) and it stays flat as you iterate.

v2 proactive polling at 15-min intervals: with caching, more like **$5–10/month**, not $15–25.

---

## 8. What to add to your build plan

Insert into Week 1:
- **Day 1:** Add **dead-man's-switch cron** (noon UTC) to your "hello world" — same day as the morning cron. Two crons in one go.
- **Day 1.5:** Set up **Vercel AI Gateway** key. Drop Anthropic SDK from the dependency list.
- **Day 3 prep:** Before touching Google OAuth, decide Testing vs Production app mode (see §1c). Production-without-verification is the default recommendation.

Insert into Week 2:
- **Day 7:** Build the **prompt as a versioned file** (`prompts/morning-brief.v1.md`). Log prompt version in `brief_log` so you can diff outputs as you iterate.
- **Day 8.5:** Wire up `dead-man's-switch` cron to actually alert.

Add a **Day 11** for "Telegram reply commands" — even just `/sendnow` and `/skip-tomorrow`. Massive QoL, ~1hr build with `node-telegram-bot-api` webhook.

---

## 9. Resolved open questions (with reasoning)

I'd recommend you decide these now rather than wait:

1. **News fun category** → **Rotate** by day of week (Mon: science, Tue: culture, Wed: sports, Thu: weird-internet, Fri: longread). Two-line config in `preferences.news_topics`. More interesting than picking one.
2. **Weekend brief** → **Lite mode**: weather + tasks + 3 headlines. Skip email triage and calendar (you're not working). Set `weekend_mode='lite'` default.
3. **Email "urgent" rules** → Start with: (a) sender in VIP list (you'll edit in dashboard), (b) contains "?" addressed to you, (c) calendar invite, (d) financial/account keywords (`statement`, `payment`, `invoice`, `unauthorized`, `verify`). Tune after week 1.
4. **Notion schema** → Your proposal is good. **One add:** `Brief` (Checkbox) — lets you mark tasks "Don't surface in brief" without changing status. Otherwise reading the brief feels naggy on long-running tasks.

---

## 10. Files to create (greenfield reference)

```
app/
  api/cron/morning-brief/route.ts     # the orchestrator
  api/cron/dead-mans-switch/route.ts  # noon backup check
  api/auth/google/callback/route.ts   # OAuth callback
  api/telegram/webhook/route.ts       # for v1.5 /sendnow command
  dashboard/page.tsx                  # history + toggles
  dashboard/preferences/page.tsx
lib/
  fetchers/{weather,calendar,gmail,news,notion}.ts
  claude.ts                           # AI SDK + Gateway client
  telegram.ts                         # send + escape helpers
  db/schema.ts                        # Drizzle
  db/index.ts
prompts/
  morning-brief.v1.md
vercel.ts                             # cron schedules + framework config
drizzle.config.ts
.env.example
```

Cron schedule snippet for `vercel.ts`:
```ts
import { type VercelConfig } from '@vercel/config/v1';
export const config: VercelConfig = {
  framework: 'nextjs',
  crons: [
    { path: '/api/cron/morning-brief',    schedule: '0 5 * * *' },
    { path: '/api/cron/dead-mans-switch', schedule: '0 11 * * *' },
  ],
};
```

---

## 11. Verification plan (how you'll know v1 is done)

Run all of these on Day 10:

1. **End-to-end (happy path):** Hit `/api/cron/morning-brief` manually. Telegram message arrives in <30s with all 5 sections.
2. **Failure injection:** Temporarily break the Notion key. Re-run. Brief arrives with 4 sections + "Tasks unavailable" note. `brief_log.errors` populated.
3. **Idempotency:** Re-run the cron manually. Second call exits early (no duplicate Telegram).
4. **Dead-man's switch:** Comment out the morning cron handler body. Wait until noon UTC. Confirm alert fires.
5. **DST sanity:** Confirm cron schedule will be 6 AM (summer) / 7 AM (winter) Warsaw — accept the 1-hour drift, document it.
6. **Cost:** After 3 days running, check Vercel logs + Anthropic console — confirm under $0.10/day.
7. **Dashboard:** Toggle weather off → next manual run sends 4-section brief. Toggle back on → restored.
8. **7-day soak:** Let it run untouched. On Day 17, all 7 briefs in `brief_log`, all `status='sent'`.

---

## 12. What I'd skip from your plan

- **NewsAPI** — see §1a. RSS-only is genuinely better for this use case.
- **`unguessable URL` auth** — Vercel Deployment Protection is one click, free, real auth.
- **Manual Postgres provisioning** — use the Neon Marketplace integration, env vars auto-populate.

---

## Summary of changes vs your original

| # | Change | Why |
|---|---|---|
| 1 | RSS-only news | NewsAPI ToS blocks production use |
| 2 | DST-aware cron strategy | Without this, brief drifts seasonally |
| 3 | Google OAuth = Production-without-verification | Refresh tokens don't expire |
| 4 | Telegram HTML mode (not MarkdownV2) | Far simpler escaping |
| 5 | Neon (Marketplace) replaces Vercel Postgres | Vercel Postgres no longer exists |
| 6 | Vercel AI Gateway, not direct Anthropic SDK | Observability + fallbacks for free |
| 7 | Concrete DB schema with idempotency | Prevents double-sends, enables history |
| 8 | Dead-man's switch cron at noon | Catches silent failures |
| 9 | `vercel.ts` over `vercel.json` | Current best practice |
| 10 | Drizzle ORM | Better cold-start than Prisma on serverless |
| 11 | Versioned prompt file | Lets you diff outputs across iterations |
| 12 | Resolved 4 open questions with defaults | Unblocks Day 1 |
| 13 | Cost estimate corrected to $1–2/mo | Original was 3× too high |
| 14 | Vercel Deployment Protection for dashboard | Real auth, zero code |
| 15 | Day 11 for Telegram reply commands | Massive QoL win for ~1hr |