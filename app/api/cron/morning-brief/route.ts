import { isAuthorizedCron } from '@/lib/auth';
import { summarizeHeadlines } from '@/lib/claude';
import { fetchHeadlines, type Headline } from '@/lib/fetchers/news';
import { fetchWeather, type WeatherSnapshot } from '@/lib/fetchers/weather';
import { fetchEmails, type Email } from '@/lib/fetchers/gmail';
import { fetchCalendarEvents, type CalendarEvent } from '@/lib/fetchers/calendar';
import { fetchTasks, type NotionTask } from '@/lib/fetchers/notion';
import { escapeHtml, sendTelegram } from '@/lib/telegram';
import { getGoogleAccessToken, refreshGoogleAccessToken } from '@/lib/google';

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const now = new Date();
  const warsawTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Warsaw',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(now);

  const accessToken = await getGoogleAccessToken();
  const [weather, news, calendar, emails, tasks] = await Promise.allSettled([
    fetchWeather(),
    fetchHeadlines(),
    accessToken ? fetchCalendarEvents(accessToken) : Promise.resolve([]),
    accessToken ? fetchEmails(accessToken) : Promise.resolve([]),
    fetchTasks(),
  ]);

  // Summarize headlines via Claude (Haiku 4.5 over AI Gateway). Empty array on failure.
  const summaries =
    news.status === 'fulfilled' ? await summarizeHeadlines(news.value) : [];

  const text = composeBrief(warsawTime, weather, news, summaries, calendar, emails, tasks);

  try {
    await sendTelegram(text);
    return Response.json({
      ok: true,
      sentAt: now.toISOString(),
      sections: {
        weather: weather.status,
        news: news.status === 'fulfilled' ? news.value.length : 'rejected',
        summaries: summaries.length,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('morning-brief cron failed:', message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

function composeBrief(
  when: string,
  weather: PromiseSettledResult<WeatherSnapshot>,
  news: PromiseSettledResult<Headline[]>,
  summaries: string[],
  calendar: PromiseSettledResult<CalendarEvent[]>,
  emails: PromiseSettledResult<Email[]>,
  tasks: PromiseSettledResult<NotionTask[]>,
): string {
  const sections: string[] = [`<b>📅 Morning Brief — ${escapeHtml(when)}</b>`];

  if (weather.status === 'fulfilled') {
    sections.push(formatWeather(weather.value));
  } else {
    sections.push(`🌤 <b>Weather</b>\n<i>unavailable</i>`);
  }

  if (calendar.status === 'fulfilled' && calendar.value.length > 0) {
    sections.push(formatCalendar(calendar.value));
  }

  if (tasks.status === 'fulfilled' && tasks.value.length > 0) {
    sections.push(formatTasks(tasks.value));
  }

  if (emails.status === 'fulfilled' && emails.value.length > 0) {
    sections.push(formatEmails(emails.value));
  }

  if (news.status === 'fulfilled' && news.value.length > 0) {
    sections.push(formatNews(news.value, summaries));
  } else {
    sections.push(`📰 <b>Top headlines</b>\n<i>unavailable</i>`);
  }

  return sections.join('\n\n');
}

function formatWeather(w: WeatherSnapshot): string {
  const lines: string[] = ['🌤 <b>Weather</b>'];

  lines.push(
    `Now: ${Math.round(w.tempNow)}°C (feels ${Math.round(w.feelsLikeNow)}°C), ` +
      `${escapeHtml(w.conditionNow)}, wind ${Math.round(w.windNow)} km/h`,
  );
  lines.push(
    `Today: ${Math.round(w.tempMin)}°C → ${Math.round(w.tempMax)}°C ` +
      `(feels ${Math.round(w.feelsLikeMin)}°C → ${Math.round(w.feelsLikeMax)}°C)`,
  );

  // Bike-relevant wind context — only surface if today's gusts are notable
  if (w.gustsMax >= 30) {
    lines.push(
      `💨 Wind: max ${Math.round(w.windMax)} km/h, gusts up to ${Math.round(w.gustsMax)} km/h`,
    );
  }

  if (w.isDryToday) {
    lines.push('☂️ Dry all day');
  } else {
    const windows = w.rainWindows
      .map((rw) => `${pad(rw.fromHour)}:00–${pad(rw.toHour)}:00 (${rw.peakProb}%)`)
      .join(', ');
    lines.push(`☂️ Rain: ${windows}`);
  }

  return lines.join('\n');
}

function formatNews(headlines: Headline[], summaries: string[]): string {
  const hasSummaries = summaries.length === headlines.length;
  const lines: string[] = ['📰 <b>Top headlines</b>'];
  for (let i = 0; i < headlines.length; i++) {
    const h = headlines[i];
    lines.push(
      `${h.icon} <a href="${escapeHtml(h.link)}">${escapeHtml(truncate(h.title, 90))}</a> ` +
        `<i>${escapeHtml(h.source)}</i>`,
    );
    if (hasSummaries) {
      lines.push(`<blockquote>${escapeHtml(summaries[i])}</blockquote>`);
    }
  }
  return lines.join('\n');
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function formatCalendar(events: CalendarEvent[]): string {
  const lines: string[] = ["📅 <b>Today's Events</b>"];
  for (const event of events.slice(0, 5)) {
    const startTime = new Date(event.startTime).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
    lines.push(`${startTime} — ${escapeHtml(event.summary)}`);
    if (event.location) {
      lines.push(`<i>📍 ${escapeHtml(event.location)}</i>`);
    }
  }
  return lines.join('\n');
}

function formatEmails(emails: Email[]): string {
  const lines: string[] = ['📧 <b>Urgent Emails</b>'];
  for (const email of emails.slice(0, 3)) {
    lines.push(`<b>${escapeHtml(email.from)}</b>: ${escapeHtml(email.subject)}`);
    lines.push(`<i>${escapeHtml(email.snippet)}</i>`);
  }
  return lines.join('\n');
}

function formatTasks(tasks: NotionTask[]): string {
  const lines: string[] = ['📋 <b>Tasks</b>'];
  for (const task of tasks) {
    const date = task.dueDate
      ? new Date(task.dueDate).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        })
      : 'No date';

    const priority = task.priority ? `[${task.priority}]` : '';
    const status = task.status ? `(${task.status})` : '';

    lines.push(
      `• <b>${escapeHtml(task.title)}</b> ${priority} — ${date} ${status}`,
    );
  }
  return lines.join('\n');
}
