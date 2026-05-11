# Personal Assistant Project - Calendar Milestones

Based on **Plan V1.1**, I've created 8 calendar events to track your personal assistant development. Each event contains the specific tasks and references to the plan sections.

---

## 📅 Calendar Events Created

### **Day 1: Setup Cron & Vercel AI Gateway** (May 10)
**Duration:** Full day (9 AM - 5 PM)

What to build:
1. Deploy "hello world" with two crons (morning at 0 5 UTC + dead-mans-switch at 0 11 UTC)
2. Set up Vercel AI Gateway key
3. Remove direct Anthropic SDK from dependencies

**Why now:** Getting the scaffold in place early prevents rework later.

---

### **Day 1.5: Google OAuth Decision & Setup** (May 10, 5-6 PM)
**Critical decision point:**
- Choose **Production-without-verification** (recommended) vs Testing mode
- Plan V1 recommends Production for single-user apps (avoids 7-day token refresh)
- Store refresh tokens in Postgres, not env vars

**Why it matters:** This decision affects reliability of your daily crons.

---

### **Day 3: Build Fetchers & Data Integrations** (May 12)
**Duration:** Full day (9 AM - 5 PM)

Build the five parallel fetchers (each with 10s timeout + retry-once):
- Open-Meteo (weather)
- Google Calendar (today's events)
- Gmail (unread last 16h)
- RSS feeds (10 curated feeds, parallel)
- Notion (today's tasks)

Each should have proper error handling logged to `brief_log.errors[]`.

---

### **Day 7: Versioned Prompt File & Logging** (May 16)
**Duration:** Full day (9 AM - 5 PM)

Create the prompt system:
1. Build `prompts/morning-brief.v1.md`
2. Set up structured prompt with all 5 sections
3. Configure logging in brief_log table
4. Enable prompt version tracking (lets you diff across iterations)

**Why Day 7:** By now you should know what works; this locks it in.

---

### **Day 8.5: Dead-Man's Switch Alert Integration** (May 17)
**Duration:** Half day (9 AM - 12 PM)

Wire up the noon UTC cron to actually alert:
1. Verify noon UTC cron (0 11 * * *) fires
2. Check if today's brief_log exists
3. Send Telegram alert if brief failed
4. Test by temporarily disabling morning cron

**Why:** Catches silent failures before you notice.

---

### **Day 10: End-to-End Verification Testing** (May 20)
**Duration:** Full day (9 AM - 5 PM)

Run complete verification checklist:
1. ✅ End-to-end: Hit `/api/cron/morning-brief` manually → all 5 sections in <30s
2. ✅ Failure injection: Break Notion key → 4 sections + error note
3. ✅ Idempotency: Re-run cron → no duplicate Telegram messages
4. ✅ Dead-man's switch: Comment out morning cron → noon alert fires
5. ✅ DST check: Confirm 6 AM summer / 7 AM winter Warsaw time
6. ✅ Cost: Verify <$0.10/day after 3 days running
7. ✅ Dashboard: Toggle sections on/off → updates work
8. ✅ Telegram responses: Test command handling if added

**Gate before v1 release.**

---

### **Day 11: Telegram Reply Commands** (May 21)
**Duration:** 2 hours (9 AM - 11 AM)

Quick QoL feature - add interactive commands:
1. Set up webhook with `node-telegram-bot-api`
2. Implement `/sendnow` (trigger brief manually)
3. Implement `/skip-tomorrow` (skip next day's brief)
4. Test both commands

**Why:** Massive usability win for ~1hr of work.

---

### **Day 17: 7-Day Soak Test Complete - v1 Ready** (May 26)
**Duration:** 3 hours (9 AM - 12 PM)

Final verification:
- [ ] All 7 briefs in `brief_log` with `status='sent'`
- [ ] No missed days or failed sends
- [ ] Cost tracking confirms ~$1-2/month actual
- [ ] Dashboard stable, all integrations working
- [ ] Telegram reliability confirmed

**v1 is now production-ready.**

---

## 🎯 Critical Design Decisions (Already Made for You)

| Decision | Choice | Why |
|----------|--------|-----|
| News source | RSS-only (10 curated feeds) | NewsAPI ToS forbids production use |
| Database | Neon (via Vercel Marketplace) | Vercel Postgres no longer exists |
| Claude model | Sonnet 4.6 (via Vercel AI Gateway) | Observability + cost savings |
| OAuth mode | Production-without-verification | Non-expiring refresh tokens |
| Telegram format | HTML (not MarkdownV2) | Far simpler escaping |
| Cron schedule | 0 5 UTC (6 AM summer, 7 AM winter) | Acceptable DST drift; upgrade in v2 |
| Dashboard auth | Vercel Deployment Protection | Real auth, zero code |

---

## 📊 Cost Estimate (Corrected)

- **Sonnet 4.6 synthesis:** ~$0.027/day → **~$0.80/month**
- **Haiku 4.5 email triage:** ~$0.005/day → **~$0.15/month**
- **Total realistic v1:** **~$1–2/month** (original plan was 3× too high)

With prompt caching on system prompt, cost stays flat as you iterate.

---

## 🔧 Key Technical Details

**Cron Schedule** (`vercel.ts`):
```typescript
export const config: VercelConfig = {
  framework: 'nextjs',
  crons: [
    { path: '/api/cron/morning-brief',    schedule: '0 5 * * *' },
    { path: '/api/cron/dead-mans-switch', schedule: '0 11 * * *' },
  ],
};
```

**Database Schema** (Neon Postgres via Drizzle):
- `brief_log` — history + idempotency (unique on `local_date`)
- `preferences` — sections, news topics, email rules, weekend mode
- `google_tokens` — refresh token storage (not env vars)

**Graceful Degradation:**
- One integration fails → skip section, note in brief
- Two+ fail → still send with available sections
- Claude fails → send raw data concatenation
- Telegram fails → retry 3× w/ backoff, log error

---

## 📝 Open Questions Resolved

| Question | Answer | Why |
|----------|--------|-----|
| Which news category? | Rotate by day of week (Mon: science, Tue: culture, etc) | More interesting |
| Weekend brief? | Lite mode: weather + tasks + 3 headlines | Avoid work-related clutter |
| Email "urgent" rules? | VIP list + "?" + calendar invites + financial keywords | Good baseline to tune |
| Notion schema addition? | Add `Brief` checkbox | Lets you hide tasks without changing status |

---

## 🚀 Files to Create (Scaffold)

```
app/
  api/cron/
    morning-brief/route.ts
    dead-mans-switch/route.ts
  api/auth/google/callback/route.ts
  api/telegram/webhook/route.ts        (Day 11)
  dashboard/page.tsx
  dashboard/preferences/page.tsx

lib/
  fetchers/
    weather.ts      (Open-Meteo)
    calendar.ts     (Google Cal)
    gmail.ts        (Gmail)
    news.ts         (RSS)
    notion.ts       (Notion)
  claude.ts         (AI SDK + Gateway)
  telegram.ts       (send + escape)
  db/
    schema.ts       (Drizzle)
    index.ts

prompts/
  morning-brief.v1.md

vercel.ts
drizzle.config.ts
.env.example
```

---

## ⚠️ Critical Gotchas (Don't Miss These)

1. **NewsAPI ToS violation** — Production deployments forbidden. Use RSS.
2. **Vercel Cron is UTC** — Schedule at 0 5 UTC; expect 6-7 AM Warsaw depending on DST.
3. **Google OAuth refresh tokens expire** — Use Production mode without verification (avoids 7-day expiry).
4. **Telegram MarkdownV2 is brutal** — Use HTML parse mode instead.
5. **Idempotency via `brief_log`** — Prevents double-sends if cron fires twice.
6. **Dead-man's switch cron** — Catches silent failures before you notice.

---

## 📖 Where to Read More

- **§1: Critical Risks** — Plan V1
- **§3: Refined Architecture** — Plan V1
- **§8: Build Plan** — Plan V1
- **§11: Verification Plan** — Plan V1
- **§12: What to Skip** — Plan V1

---

**Next Steps:**
1. ✅ Review calendar events (May 10 - May 26)
2. ✅ Start Day 1 on May 10
3. ⏰ Hit each milestone on schedule
4. ✅ Complete verification on Day 10
5. 🎉 Launch v1 on Day 17

Good luck! This is a solid, well-scoped project. 🚀
