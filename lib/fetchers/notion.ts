export interface NotionTask {
  id: string;
  title: string;
  dueDate?: string; // ISO 8601 date (YYYY-MM-DD)
  priority?: 'High' | 'Medium' | 'Low';
  status?: 'Todo' | 'In Progress' | 'Done';
}

const NOTION_API_BASE = 'https://api.notion.com/v1';

export async function fetchTasks(): Promise<NotionTask[]> {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_TASKS_DB_ID;

  if (!token || !dbId) {
    console.warn('Notion credentials not configured');
    return [];
  }

  try {
    const res = await fetch(`${NOTION_API_BASE}/databases/${dbId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: {
          or: [
            { property: 'Status', select: { does_not_equal: 'Done' } },
          ],
        },
        sorts: [
          { property: 'Due Date', direction: 'ascending' },
          { property: 'Priority', direction: 'descending' },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`Notion API ${res.status}`);
    }

    const data = await res.json();
    const tasks = data.results
      .map((page: any) => parseNotionTask(page))
      .filter((task: any): task is NotionTask => task !== null)
      .slice(0, 5);
    return tasks;
  } catch (e) {
    console.error('fetchTasks failed:', e instanceof Error ? e.message : e);
    return [];
  }
}

function parseNotionTask(page: any): NotionTask | null {
  try {
    const props = page.properties;

    const titleProp = props.Title?.title?.[0]?.plain_text || '';
    const dueDateProp = props['Due Date']?.date?.start;
    const priorityProp = props.Priority?.select?.name;
    const statusProp = props.Status?.select?.name;

    if (!titleProp) return null;

    return {
      id: page.id,
      title: titleProp,
      dueDate: dueDateProp,
      priority: priorityProp as 'High' | 'Medium' | 'Low' | undefined,
      status: statusProp as 'Todo' | 'In Progress' | 'Done' | undefined,
    };
  } catch (e) {
    return null;
  }
}
