const GMAIL_API_BASE = 'https://www.googleapis.com/gmail/v1';

export interface SearchResult {
  success: boolean;
  message: string;
  emails?: Array<{
    from: string;
    subject: string;
    snippet: string;
    date: string;
  }>;
}

export async function searchEmails(accessToken: string, query: string): Promise<SearchResult> {
  if (!accessToken) {
    return { success: false, message: 'Gmail access not available' };
  }

  try {
    const listUrl = new URL(`${GMAIL_API_BASE}/users/me/messages`);
    listUrl.searchParams.set('q', query);
    listUrl.searchParams.set('maxResults', '5');

    const listRes = await fetch(listUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!listRes.ok) {
      return { success: false, message: `Gmail search failed: ${listRes.status}` };
    }

    const { messages = [] } = await listRes.json();

    if (messages.length === 0) {
      return { success: true, message: `No emails found for "${query}"`, emails: [] };
    }

    const emails = await Promise.allSettled(
      messages.map((msg: { id: string }) =>
        fetch(`${GMAIL_API_BASE}/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From,Subject,Date`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
          .then((r) => r.json())
          .then((data) => parseEmailForSearch(data))
      )
    );

    const results = emails
      .filter((e) => e.status === 'fulfilled')
      .map((e) => (e as PromiseFulfilledResult<any>).value);

    return {
      success: true,
      message: `Found ${results.length} email(s)`,
      emails: results,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('searchEmails failed:', message);
    return { success: false, message: `Search failed: ${message}` };
  }
}

function parseEmailForSearch(data: any) {
  const headers = data.payload?.headers || [];
  const from = headers.find((h: any) => h.name === 'From')?.value || 'unknown';
  const subject = headers.find((h: any) => h.name === 'Subject')?.value || '(no subject)';
  const date = headers.find((h: any) => h.name === 'Date')?.value || '';
  const snippet = data.snippet || '';

  return {
    from: from.split('<')[0].trim(),
    subject: subject.substring(0, 100),
    snippet: snippet.substring(0, 150),
    date,
  };
}
