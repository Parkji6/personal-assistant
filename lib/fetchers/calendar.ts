export interface CalendarEvent {
  id: string;
  summary: string;
  startTime: string;
  endTime: string;
  location?: string;
}

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

export async function fetchCalendarEvents(
  accessToken: string,
  timeMin?: Date,
  timeMax?: Date,
): Promise<CalendarEvent[]> {
  if (!accessToken) return [];

  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const startBound = timeMin ?? todayStart;
    const endBound = timeMax ?? todayEnd;

    const url = new URL(`${CALENDAR_API_BASE}/calendars/primary/events`);
    url.searchParams.set('timeMin', startBound.toISOString());
    url.searchParams.set('timeMax', endBound.toISOString());
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', '10');

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) throw new Error(`Calendar fetch failed: ${res.status}`);
    const { items = [] } = await res.json();

    return items.map((event: any) => ({
      id: event.id,
      summary: event.summary || '(no title)',
      startTime: event.start?.dateTime || event.start?.date || '',
      endTime: event.end?.dateTime || event.end?.date || '',
      location: event.location,
    }));
  } catch (e) {
    console.error('fetchCalendarEvents failed:', e instanceof Error ? e.message : e);
    return [];
  }
}
