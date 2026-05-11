import { NextRequest, NextResponse } from 'next/server';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { conversationHistory } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { processMessage, extractActionDetails, type ConversationMessage } from '@/lib/telegram-ai';
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

    // Fetch conversation history
    const history = await getConversationHistory(userId, 5);

    // Process message with Claude
    const aiResponse = await processMessage(messageText, history);

    // Store user message
    await storeMessage(userId, 'user', messageText);

    // Store assistant response
    const actionDetails = extractActionDetails(aiResponse.text, aiResponse.intent);
    await storeMessage(
      userId,
      'assistant',
      aiResponse.text,
      aiResponse.intent !== 'general_chat' ? aiResponse.intent : undefined,
    );

    // Send response to Telegram (async, don't wait)
    sendTelegramMessage(chatId, aiResponse.text).catch((e) => {
      console.error('Failed to send response:', e);
    });

    // Return 200 immediately to Telegram
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Webhook handler error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
