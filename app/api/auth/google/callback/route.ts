import { NextRequest, NextResponse } from 'next/server';
import { storeGoogleToken } from '@/lib/db';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.json({ error: `Google auth failed: ${error}` }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: 'Missing authorization code' }, { status: 400 });
  }

  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json({ error: `Token exchange failed: ${text}` }, { status: 400 });
    }

    const tokens = await response.json();
    const refreshToken = tokens.refresh_token;
    const accessToken = tokens.access_token;

    if (refreshToken) {
      await storeGoogleToken(refreshToken, accessToken);
    } else {
      console.warn('No refresh token received from Google');
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Google OAuth authorized. Refresh token stored. You can close this window.',
        hasRefreshToken: !!refreshToken,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('OAuth callback error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
