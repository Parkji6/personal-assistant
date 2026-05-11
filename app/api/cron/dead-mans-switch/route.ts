import { isAuthorizedCron } from '@/lib/auth';

// Day 1: stub. Day 8.5 wires this up to check brief_log for today and
// alert via Telegram if the morning brief did not run.
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return new Response('Unauthorized', { status: 401 });
  }

  console.log('dead-mans-switch: alive at', new Date().toISOString());
  return Response.json({ ok: true, note: 'stub — wires up on Day 8.5' });
}
