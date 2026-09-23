import cron from 'node-cron';
import { runSync } from './sync';
import { dbPool } from './db';

const args = process.argv.slice(2);

async function main() {
  if (args.includes('--run-now')) {
    await runSync();
    if (dbPool) {
      await dbPool.end();
    }
    process.exit(0);
  }

  console.log('[Scheduler] Scheduling stock verification task every 2 days at 19:00 (7 PM)...');
  // "0 19 */2 * *" -> At 19:00 on every 2nd day-of-month
  cron.schedule('0 19 */2 * *', async () => {
    console.log(`[Scheduler] Triggering scheduled task at ${new Date().toISOString()}`);
    try {
      await runSync();
    } catch (error) {
      console.error('[Scheduler] Error during scheduled sync:', error);
    }
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
