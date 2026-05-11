import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { googleTokens } from './schema';
import { eq } from 'drizzle-orm';

let db: ReturnType<typeof drizzle> | null = null;

function getDb() {
  if (!db) {
    const client = postgres(process.env.DATABASE_URL || '');
    db = drizzle(client);
  }
  return db;
}

export async function storeGoogleToken(refreshToken: string, accessToken: string) {
  try {
    const database = getDb();
    await database
      .insert(googleTokens)
      .values({
        id: 1,
        refreshToken,
        accessToken,
        expiresAt: new Date(Date.now() + 3600000),
      })
      .onConflictDoUpdate({
        target: googleTokens.id,
        set: {
          refreshToken,
          accessToken,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
    console.log('Google token stored');
  } catch (error) {
    console.error('Failed to store token:', error);
  }
}

export async function getGoogleRefreshToken(): Promise<string | null> {
  try {
    const database = getDb();
    const result = await database.select().from(googleTokens).where(eq(googleTokens.id, 1));
    return result[0]?.refreshToken || null;
  } catch (error) {
    console.error('Failed to get token:', error);
    return null;
  }
}
