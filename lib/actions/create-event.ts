const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

export interface CreateEventResult {
  success: boolean;
  message: string;
  eventId?: string;
}

export async function createCalendarEvent(
  accessToken: string,
  title: string,
  description: string,
  startTime: Date,
  endTime?: Date
): Promise<CreateEventResult> {
  if (!accessToken) {
    return { success: false, message: 'Calendar access not available' };
  }

  try {
    // If no end time, default to 1 hour after start
    if (!endTime) {
      endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
    }

    const event = {
      summary: title,
      description,
      start: {
        dateTime: startTime.toISOString(),
        timeZone: 'UTC',
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'UTC',
      },
    };

    const res = await fetch(`${CALENDAR_API_BASE}/calendars/primary/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error('Calendar creation error:', error);
      return { success: false, message: `Failed to create event: ${res.status}` };
    }

    const data = await res.json();
    return {
      success: true,
      message: `Event "${title}" created successfully`,
      eventId: data.id,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('createCalendarEvent failed:', message);
    return { success: false, message: `Failed to create event: ${message}` };
  }
}

export function parseEventFromText(text: string): { title: string; startTime: Date } | null {
  // Simple parser: look for patterns like "meeting tomorrow at 3pm" or "call john friday 2pm"
  // Returns null if parsing fails
  const patterns = [
    /(?:meeting|call|event|lunch)\s+(?:with\s+)?(.+?)\s+(?:tomorrow|today|next\s+(\w+))\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i,
    /(?:meeting|call|event)\s+(?:tomorrow|today|next\s+(\w+))\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s+(?:with\s+)?(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const title = match[1] || 'Event';
      const timeStr = match[3] || match[2];
      const startTime = parseTime(timeStr);
      if (startTime) {
        return { title: title.trim(), startTime };
      }
    }
  }

  return null;
}

function parseTime(timeStr: string): Date | null {
  const now = new Date();
  const [hourStr, ...rest] = timeStr.trim().toLowerCase().split(/[\s:]/);

  let hour = parseInt(hourStr);
  const minute = rest.length > 0 ? parseInt(rest[0]) : 0;
  const meridiem = rest[rest.length - 1];

  if (isNaN(hour) || isNaN(minute)) return null;

  // Convert 12-hour to 24-hour format
  if (meridiem === 'pm' && hour !== 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;

  const result = new Date(now);
  result.setHours(hour, minute, 0, 0);

  // If time is in the past today, assume it's tomorrow
  if (result < now) {
    result.setDate(result.getDate() + 1);
  }

  return result;
}
