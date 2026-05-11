import { getGoogleRefreshToken, storeGoogleToken } from '@/lib/db';

export async function getGoogleAccessToken(): Promise<string | null> {
  const refreshToken = await getGoogleRefreshToken();
  if (!refreshToken) return null;

  return await refreshGoogleAccessToken(refreshToken);
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) throw new Error(`Refresh failed: ${response.status}`);
    const data = await response.json();

    // Store updated access token
    await storeGoogleToken(refreshToken, data.access_token);

    return data.access_token;
  } catch (error) {
    console.error('Failed to refresh Google token:', error);
    return null;
  }
}
