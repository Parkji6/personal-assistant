const API = 'https://api.telegram.org';
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = 500;

export type ParseMode = 'HTML' | 'MarkdownV2' | 'Markdown';

export interface SendOptions {
  parseMode?: ParseMode;
  disableNotification?: boolean;
  disableWebPagePreview?: boolean;
}

export class TelegramError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`Telegram ${status}: ${body}`);
    this.name = 'TelegramError';
  }
}

export function escapeHtml(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function sendTelegram(text: string, opts: SendOptions = {}): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  if (!chatId) throw new Error('TELEGRAM_CHAT_ID is not set');

  const url = `${API}/bot${token}/sendMessage`;
  const body = JSON.stringify({
    chat_id: chatId,
    text,
    parse_mode: opts.parseMode ?? 'HTML',
    disable_notification: opts.disableNotification ?? false,
    disable_web_page_preview: opts.disableWebPagePreview ?? true,
  });

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (res.ok) return;
      const respBody = await res.text();
      // 4xx = client error (bad token, malformed payload) — don't retry
      if (res.status < 500) throw new TelegramError(res.status, respBody);
      lastError = new TelegramError(res.status, respBody);
    } catch (e) {
      if (e instanceof TelegramError && e.status < 500) throw e;
      lastError = e;
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS * 3 ** (attempt - 1)));
    }
  }
  throw lastError;
}
