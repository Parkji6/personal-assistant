import type { VercelConfig } from '@vercel/config/v1';

// Vercel Cron schedules are UTC. Warsaw is UTC+1 (winter) / UTC+2 (summer).
// 0 5 UTC = 7am winter / 6am summer. Acceptable DST drift for v1.
// 0 11 UTC = 1pm winter / 12pm summer (dead-man's-switch backup check).
export const config: VercelConfig = {
  framework: 'nextjs',
  crons: [
    { path: '/api/cron/morning-brief', schedule: '0 5 * * *' },
    { path: '/api/cron/dead-mans-switch', schedule: '0 11 * * *' },
  ],
};

export default config;
