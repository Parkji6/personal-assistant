import { NextRequest, NextResponse } from 'next/server';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback';

  if (!clientId) {
    return NextResponse.json({ error: 'GOOGLE_CLIENT_ID not set' }, { status: 400 });
  }

  const scope = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/calendar',
  ].join(' ');

  const params = new URLSearchParams();
  params.append('client_id', clientId);
  params.append('redirect_uri', redirectUri);
  params.append('response_type', 'code');
  params.append('scope', scope);
  params.append('access_type', 'offline');
  params.append('prompt', 'consent');

  const authUrl = `${GOOGLE_AUTH_URL}?${params}`;

  return NextResponse.redirect(authUrl);
}
