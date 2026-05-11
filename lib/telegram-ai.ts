import { generateText } from 'ai';

export interface ConversationMessage {
  id: bigint;
  role: 'user' | 'assistant';
  message: string;
  actionTaken?: string;
  createdAt: Date;
}

export interface AIResponse {
  text: string;
  intent?: 'search_emails' | 'create_event' | 'add_task' | 'general_chat';
  actionDetails?: Record<string, string | number>;
}

const SYSTEM_PROMPT = `You are a personal assistant available via Telegram. You help with:

1. **Email search** — Search for specific emails (e.g., "did I get a job offer?")
2. **Calendar management** — Create events in Google Calendar
3. **Task management** — Add tasks to Notion
4. **General chat** — Answer questions and provide information

**User context**: The user is job hunting, so they care about job offers and related emails.

**How to detect intent**:
- If user asks about emails, jobs, or messages → intent: "search_emails"
- If user mentions "tomorrow/next week" + "meeting/call/lunch" → intent: "create_event"
- If user says "remind me", "add task", "don't forget" → intent: "add_task"
- Otherwise → intent: "general_chat"

**For action intents**, extract relevant details in your response:
- For emails: mention the search query you'll use
- For events: extract title, date, time
- For tasks: extract title, priority (if mentioned), due date (if mentioned)

**Important**:
- Always respond conversationally, don't just output JSON
- DO NOT ask for confirmation — just state the action directly
- Be concise (this is Telegram, keep it short)
- If you detect an action, state it clearly in your response

**Examples**:
User: "Did I get any offers?"
Response: "🔍 Searching for job offer emails..."

User: "Add a meeting with Jane tomorrow at 2pm"
Response: "📅 Creating a meeting with Jane tomorrow at 2pm..."

User: "Remind me to call the dentist"
Response: "✅ Adding 'Call the dentist' to your tasks..."`;

export async function processMessage(
  messageText: string,
  conversationHistory: ConversationMessage[],
): Promise<AIResponse> {
  // Format conversation history for Claude
  const messages = conversationHistory.map((msg) => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.message,
  }));

  // Add current message
  messages.push({
    role: 'user',
    content: messageText,
  });

  try {
    const response = await generateText({
      model: 'anthropic/claude-haiku-4-5-20251001',
      system: SYSTEM_PROMPT,
      messages,
      temperature: 0.7,
    });

    // Parse response to detect intent
    const text = response.text.toLowerCase();
    let intent: AIResponse['intent'] = 'general_chat';

    if (
      text.includes('search') && (text.includes('email') || text.includes('gmail'))
    ) {
      intent = 'search_emails';
    } else if (
      (text.includes('add') || text.includes('create')) &&
      (text.includes('event') ||
        text.includes('meeting') ||
        text.includes('calendar'))
    ) {
      intent = 'create_event';
    } else if (
      (text.includes('add') || text.includes('create')) &&
      (text.includes('task') ||
        text.includes('notion') ||
        text.includes('remind'))
    ) {
      intent = 'add_task';
    }

    return {
      text: response.text,
      intent,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('processMessage failed:', message);
    return {
      text: "Sorry, I'm having trouble processing your message. Please try again.",
      intent: 'general_chat',
    };
  }
}

export function extractActionDetails(
  text: string,
  intent: AIResponse['intent'],
): Record<string, string | number> | undefined {
  if (intent === 'search_emails') {
    // Extract email search query from the message
    const match = text.match(/(?:search|find|check|look for)(?:\s+(?:my|your))?\s+(.+?)(?:\.|$)/i);
    return { query: match ? match[1].trim() : 'unspecified' };
  } else if (intent === 'create_event') {
    // Extract event details (simple parsing)
    return { eventDescription: text };
  } else if (intent === 'add_task') {
    // Extract task details
    return { taskDescription: text };
  }
  return undefined;
}
