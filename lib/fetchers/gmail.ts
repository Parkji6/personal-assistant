export interface Email {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  internalDate: string;
  isUrgent: boolean;
}

const GMAIL_API_BASE = 'https://www.googleapis.com/gmail/v1';
const URGENT_SENDERS = ['noreply@github.com', 'notifications@github.com'];
const URGENT_KEYWORDS = ['urgent', 'action required', 'verify', 'alert', 'payment'];

export async function fetchEmails(accessToken: string): Promise<Email[]> {
  if (!accessToken) return [];

  try {
    // Fetch recent emails from last 24 hours
    const listUrl = new URL(`${GMAIL_API_BASE}/users/me/messages`);
    listUrl.searchParams.set('q', 'newer_than:1d');
    listUrl.searchParams.set('maxResults', '10');

    const listRes = await fetch(listUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status}`);
    const { messages = [] } = await listRes.json();

    if (messages.length === 0) return [];

    const emails = await Promise.allSettled(
      messages.map((msg: { id: string }) =>
        fetch(`${GMAIL_API_BASE}/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From,Subject`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
          .then((r) => r.json())
          .then((data) => parseEmailMetadata(data))
      )
    );

    return emails
      .filter((e) => e.status === 'fulfilled')
      .map((e) => (e as PromiseFulfilledResult<Email>).value)
      .filter((e) => e.isUrgent)
      .slice(0, 3); // Top 3 urgent emails
  } catch (e) {
    console.error('fetchEmails failed:', e instanceof Error ? e.message : e);
    return [];
  }
}

function parseEmailMetadata(data: any): Email {
  const headers = data.payload?.headers || [];
  const from = headers.find((h: any) => h.name === 'From')?.value || 'unknown';
  const subject = headers.find((h: any) => h.name === 'Subject')?.value || '(no subject)';
  const snippet = data.snippet || '';

  const isUrgent =
    URGENT_SENDERS.some((s) => from.toLowerCase().includes(s)) ||
    URGENT_KEYWORDS.some((k) => (subject + ' ' + snippet).toLowerCase().includes(k));

  return {
    id: data.id,
    from: from.split('<')[0].trim(),
    subject: subject.substring(0, 80),
    snippet: snippet.substring(0, 100),
    internalDate: data.internalDate,
    isUrgent,
  };
}
