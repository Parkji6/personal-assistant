const NOTION_API_BASE = 'https://api.notion.com/v1';

export interface CreateTaskResult {
  success: boolean;
  message: string;
  taskId?: string;
}

export async function createNotionTask(
  token: string,
  dbId: string,
  title: string,
  priority?: 'High' | 'Medium' | 'Low',
  dueDate?: string // ISO 8601 (YYYY-MM-DD)
): Promise<CreateTaskResult> {
  if (!token || !dbId) {
    return { success: false, message: 'Notion credentials not configured' };
  }

  try {
    const properties: Record<string, any> = {
      Title: {
        title: [
          {
            text: {
              content: title,
            },
          },
        ],
      },
    };

    if (priority) {
      properties.Priority = {
        select: {
          name: priority,
        },
      };
    }

    if (dueDate) {
      properties['Due Date'] = {
        date: {
          start: dueDate,
        },
      };
    }

    const res = await fetch(`${NOTION_API_BASE}/pages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent: {
          database_id: dbId,
        },
        properties,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error('Notion task creation error:', error);
      return { success: false, message: `Notion ${res.status}: ${error.slice(0, 200)}` };
    }

    const data = await res.json();
    return {
      success: true,
      message: `Task "${title}" added to Notion`,
      taskId: data.id,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('createNotionTask failed:', message);
    return { success: false, message: `Failed to create task: ${message}` };
  }
}

export function parseTaskFromText(text: string): {
  title: string;
  priority?: 'High' | 'Medium' | 'Low';
  dueDate?: string;
} | null {
  // Look for patterns like "remind me to X" or "add task: X priority: high"
  const patterns = [
    /(?:remind me to|add task|todo|don't forget to)\s+(.+?)(?:\s+priority[:=]\s*(high|medium|low))?(?:\s+(?:due|by|until|before)\s+(.+?))?$/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const title = match[1]?.trim();
      const priority = match[2]?.toLowerCase() as 'High' | 'Medium' | 'Low' | undefined;
      const dueDateStr = match[3]?.trim();

      if (title) {
        return {
          title,
          priority: priority ? (priority[0].toUpperCase() + priority.slice(1)) as 'High' | 'Medium' | 'Low' : undefined,
          dueDate: dueDateStr ? parseDueDate(dueDateStr) : undefined,
        };
      }
    }
  }

  return null;
}

function parseDueDate(dateStr: string): string | undefined {
  // Simple parser: "tomorrow", "friday", "next week", or ISO dates
  const now = new Date();

  if (dateStr.toLowerCase() === 'today') {
    return now.toISOString().split('T')[0];
  }

  if (dateStr.toLowerCase() === 'tomorrow') {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }

  // Try to parse as a date (very basic)
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return undefined;
}
