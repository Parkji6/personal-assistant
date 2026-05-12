export function isAuthorizedCron(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // Allow only in local dev. In production (Vercel), fail closed.
    if (process.env.VERCEL_ENV) return false;
    return true;
  }
  return request.headers.get('authorization') === `Bearer ${cronSecret}`;
}
