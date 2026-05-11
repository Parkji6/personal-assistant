import { NextRequest, NextResponse } from 'next/server';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { conversationHistory, googleTokens } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { processMessage, extractActionDetails, type ConversationMessage } from '@/lib/telegram-ai';
import { searchEmails } from '@/lib/actions/search-emails';
import { createCalendarEvent, parseEventFromText } from '@/lib/actions/create-event';
import { createNotionTask, parseTaskFromText } from '@/lib/actions/create-task';
import crypto from 'crypto';

const client = postgres(process.env.DATABASE_URL || '');
const db = drizzle(client);

interface TelegramMessage {
  message_id: number;
  chat: { id: number };
  text?: string;
  photo?: Array<{ file_id: string }>;
  from: { id: number; username?: string };
}

interface TelegramUpdate {
  update_id: number;
  message: TelegramMessage;
}

function verifyTelegramSignature(req: NextRequest): boolean {
  // Telegram signature verification
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
  if (!secret) return true; // Skip if no secret set

  const signature = req.headers.get('x-telegram-bot-api-secret-token');
  if (!signature) return false;

  return signature === secret;
}

async function getConversationHistory(userId: number, limit: number = 5) {
  try {
    const history = await db
      .select()
      .from(conversationHistory)
      .where(eq(conversationHistory.userId, userId))
      .orderBy(desc(conversationHistory.createdAt))
      .limit(limit);

    return history.reverse() as ConversationMessage[];
  } catch (error) {
    console.error('Failed to fetch conversation history:', error);
    return [];
  }
}

async function storeMessage(
  userId: number,
  role: 'user' | 'assistant',
  message: string,
  actionTaken?: string,
) {
  try {
    await db.insert(conversationHistory).values({
      userId,
      role,
      message,
      messageType: 'text',
      actionTaken,
    });
  } catch (error) {
    console.error('Failed to store message:', error);
  }
}

async function getGoogleAccessToken(): Promise<string | null> {
  // Try env var first (faster, no database query)
  if (process.env.GOOGLE_ACCESS_TOKEN) {
    return process.env.GOOGLE_ACCESS_TOKEN;
  }

  // Fall back to database (may fail if database is down)
  try {
    const tokens = await db.select().from(googleTokens).limit(1);
    return tokens[0]?.accessToken || null;
  } catch (error) {
    console.error('Failed to get Google access token from DB:', error);
    return null;
  }
}

async function sendTelegramMessage(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN not set');
    return;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error('Telegram sendMessage failed:', error);
    }
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
  }
}

async function executeAction(
  intent: string,
  text: string,
  chatId: number
): Promise<void> {
  if (intent === 'search_emails') {
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) {
      sendTelegramMessage(chatId, '❌ Gmail access not configured');
      return;
    }

    // Extract search query from the message
    const match = text.match(/(?:search|find|check|look for)(?:\s+(?:for|about))?\s+(.+?)(?:\.|$)/i);
    const query = match ? match[1].trim() : text;

    const result = await searchEmails(accessToken, query);
    let response = result.message;

    if (result.success && result.emails && result.emails.length > 0) {
      response += '\n\n';
      result.emails.forEach((email) => {
        response += `📧 <b>${email.subject}</b>\n`;
        response += `From: ${email.from}\n`;
        response += `${email.snippet}\n\n`;
      });
    }

    sendTelegramMessage(chatId, response).catch((e) => {
      console.error('Failed to send email search result:', e);
    });
  } else if (intent === 'create_event') {
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) {
      sendTelegramMessage(chatId, '❌ Calendar access not configured');
      return;
    }

    const parsed = parseEventFromText(text);
    if (!parsed) {
      sendTelegramMessage(chatId, '❌ Could not parse event details. Try: "meeting tomorrow at 3pm"');
      return;
    }

    const result = await createCalendarEvent(
      accessToken,
      parsed.title,
      `Created via Telegram`,
      parsed.startTime
    );

    sendTelegramMessage(chatId, result.success ? `✅ ${result.message}` : `❌ ${result.message}`).catch(
      (e) => {
        console.error('Failed to send calendar result:', e);
      }
    );
  } else if (intent === 'add_task') {
    const notionToken = process.env.NOTION_TOKEN;
    const notionDbId = process.env.NOTION_TASKS_DB_ID;

    if (!notionToken || !notionDbId) {
      sendTelegramMessage(chatId, '❌ Notion access not configured');
      return;
    }

    const parsed = parseTaskFromText(text);
    if (!parsed) {
      sendTelegramMessage(chatId, '❌ Could not parse task details. Try: "remind me to call dentist"');
      return;
    }

    const result = await createNotionTask(
      notionToken,
      notionDbId,
      parsed.title,
      parsed.priority,
      parsed.dueDate
    );

    sendTelegramMessage(chatId, result.success ? `✅ ${result.message}` : `❌ ${result.message}`).catch(
      (e) => {
        console.error('Failed to send task result:', e);
      }
    );
  }
}

export async function POST(request: NextRequest) {
  // Verify signature
  if (!verifyTelegramSignature(request)) {
    return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as TelegramUpdate;
    const { message: tgMessage, update_id } = body;

    if (!tgMessage || !tgMessage.text) {
      // Ignore non-text messages for now
      return NextResponse.json({ ok: true });
    }

    const userId = tgMessage.from.id;
    const chatId = tgMessage.chat.id;
    const messageText = tgMessage.text;

    console.log(`[${update_id}] User ${userId}: ${messageText}`);

    // Fetch conversation history (skip if database is down)
    let history = [];
    try {
      history = await getConversationHistory(userId, 5);
    } catch (e) {
      console.warn('Skipping conversation history due to DB error');
    }

    // Process message with Claude
    const aiResponse = await processMessage(messageText, history);

    // Store messages async (don't block response if DB is down)
    Promise.all([
      storeMessage(userId, 'user', messageText),
      storeMessage(
        userId,
        'assistant',
        aiResponse.text,
        aiResponse.intent !== 'general_chat' ? aiResponse.intent : undefined,
      ),
    ]).catch((e) => {
      console.warn('Failed to store messages:', e instanceof Error ? e.message : e);
    });

    // Send response to Telegram (async, don't wait)
    sendTelegramMessage(chatId, aiResponse.text).catch((e) => {
      console.error('Failed to send response:', e);
    });

    // Execute action if intent detected (async, don't wait)
    if (aiResponse.intent && aiResponse.intent !== 'general_chat') {
      executeAction(aiResponse.intent, aiResponse.text, chatId).catch((e) => {
        console.error('Failed to execute action:', e);
      });
    }

    // Return 200 immediately to Telegram
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Webhook handler error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
