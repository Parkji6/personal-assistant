export function isAuthorizedCron(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // local dev — no secret configured, allow
  return request.headers.get('authorization') === `Bearer ${cronSecret}`;
}
