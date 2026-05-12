import { generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { searchEmails } from './actions/search-emails';
import { createCalendarEvent } from './actions/create-event';
import { createNotionTask } from './actions/create-task';
import { fetchCalendarEvents } from './fetchers/calendar';
import { fetchTasks } from './fetchers/notion';
import { getGoogleAccessToken as getGoogleAccessTokenFromDB } from './google';

export interface ConversationMessage {
  id: bigint;
  role: 'user' | 'assistant';
  message: string;
  actionTaken?: string;
  createdAt: Date;
}

export interface AIResponse {
  text: string;
  actionTaken?: string;
}

async function getGoogleAccessToken(): Promise<string | null> {
  // Prefer DB-backed refresh flow (always returns fresh token)
  const fromDB = await getGoogleAccessTokenFromDB();
  if (fromDB) return fromDB;

  // Fallback to env var (manually rotated, expires in ~1h)
  if (process.env.GOOGLE_ACCESS_TOKEN) {
    return process.env.GOOGLE_ACCESS_TOKEN;
  }
  return null;
}

const SYSTEM_PROMPT = `You are a personal assistant available via Telegram for the user.

You have these tools available — USE THEM, don't describe what you would do:
- search_emails: Search the user's Gmail. Use Gmail query syntax (e.g., "from:heineken", "subject:offer", "is:unread newer_than:7d").
- list_events: Read events from the user's Google Calendar. Pass timeMin/timeMax as ISO 8601 (defaults to today if omitted).
- create_event: Create a Google Calendar event. Requires title and ISO 8601 startTime.
- list_tasks: Read up to 5 open tasks from the user's Notion database (not-done, sorted by due date).
- create_task: Add a task to Notion. Requires title; priority and dueDate optional.

Rules:
- When the user asks about emails, ALWAYS call search_emails. Never say "I would search" — actually search.
- When the user asks about today's meetings/calendar/schedule, ALWAYS call list_events.
- When the user wants to schedule something, ALWAYS call create_event with real parameters.
- When the user asks about open tasks/todos, ALWAYS call list_tasks.
- When the user wants a reminder/task, ALWAYS call create_task.
- Use the actual tool results in your response. Never invent fake emails or fake data.
- If a tool returns no results, tell the user honestly: "No emails found".
- If a tool fails, tell the user the error.
- Keep responses short (Telegram is mobile).
- Current date is ${new Date().toISOString().split('T')[0]}.
- Use HTML formatting for Telegram: <b>bold</b>, <i>italic</i>. NO markdown.`;

export async function processMessage(
  messageText: string,
  conversationHistory: ConversationMessage[],
): Promise<AIResponse> {
  const messages = conversationHistory.map((msg) => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.message,
  }));

  messages.push({
    role: 'user',
    content: messageText,
  });

  let actionTaken: string | undefined;

  try {
    const response = await generateText({
      model: 'anthropic/claude-haiku-4-5-20251001',
      system: SYSTEM_PROMPT,
      messages,
      temperature: 0.3,
      stopWhen: stepCountIs(5),
      tools: {
        search_emails: tool({
          description: 'Search the user\'s Gmail inbox. Returns up to 5 matching emails.',
          inputSchema: z.object({
            query: z.string().describe('Gmail search query (e.g., "from:heineken", "subject:offer", "is:unread")'),
          }),
          execute: async ({ query }) => {
            const token = await getGoogleAccessToken();
            if (!token) {
              return { success: false, message: 'Gmail access not configured. Set GOOGLE_ACCESS_TOKEN.' };
            }
            actionTaken = 'search_emails';
            const result = await searchEmails(token, query);
            console.log('search_emails result:', JSON.stringify(result));
            return result;
          },
        }),
        list_events: tool({
          description: 'List upcoming events from the user\'s Google Calendar. Defaults to today if no range given.',
          inputSchema: z.object({
            timeMin: z.string().optional().describe('Start of range, ISO 8601. Optional — defaults to start of today.'),
            timeMax: z.string().optional().describe('End of range, ISO 8601. Optional — defaults to end of today.'),
          }),
          execute: async ({ timeMin, timeMax }) => {
            const token = await getGoogleAccessToken();
            if (!token) {
              return { success: false, message: 'Calendar access not configured.' };
            }
            actionTaken = 'list_events';
            const events = await fetchCalendarEvents(
              token,
              timeMin ? new Date(timeMin) : undefined,
              timeMax ? new Date(timeMax) : undefined,
            );
            console.log('list_events result:', JSON.stringify({ count: events.length }));
            return { success: true, events };
          },
        }),
        create_event: tool({
          description: 'Create an event in the user\'s Google Calendar.',
          inputSchema: z.object({
            title: z.string().describe('Event title'),
            description: z.string().optional().describe('Event description'),
            startTime: z.string().describe('Start time in ISO 8601 format (e.g., 2026-05-13T15:00:00Z)'),
            endTime: z.string().optional().describe('End time in ISO 8601 format. Defaults to 1 hour after start.'),
          }),
          execute: async ({ title, description, startTime, endTime }) => {
            const token = await getGoogleAccessToken();
            if (!token) {
              return { success: false, message: 'Calendar access not configured.' };
            }
            actionTaken = 'create_event';
            const result = await createCalendarEvent(
              token,
              title,
              description || 'Created via Telegram',
              new Date(startTime),
              endTime ? new Date(endTime) : undefined
            );
            console.log('create_event result:', JSON.stringify(result));
            return result;
          },
        }),
        list_tasks: tool({
          description: 'List up to 5 open tasks (not-done) from the user\'s Notion database, sorted by due date.',
          inputSchema: z.object({}),
          execute: async () => {
            actionTaken = 'list_tasks';
            const tasks = await fetchTasks();
            console.log('list_tasks result:', JSON.stringify({ count: tasks.length }));
            return { success: true, tasks };
          },
        }),
        create_task: tool({
          description: 'Add a task to the user\'s Notion database.',
          inputSchema: z.object({
            title: z.string().describe('Task title'),
            priority: z.enum(['High', 'Medium', 'Low']).optional().describe('Task priority'),
            dueDate: z.string().optional().describe('Due date in YYYY-MM-DD format'),
          }),
          execute: async ({ title, priority, dueDate }) => {
            const notionToken = process.env.NOTION_TOKEN;
            const notionDbId = process.env.NOTION_TASKS_DB_ID;
            if (!notionToken || !notionDbId) {
              return { success: false, message: 'Notion access not configured.' };
            }
            actionTaken = 'create_task';
            const result = await createNotionTask(notionToken, notionDbId, title, priority, dueDate);
            console.log('create_task result:', JSON.stringify(result));
            return result;
          },
        }),
      },
    });

    return {
      text: response.text || 'Done.',
      actionTaken,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('processMessage failed:', message);
    return {
      text: 'Sorry, something went wrong. Please try again.',
    };
  }
}
