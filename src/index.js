"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_cron_1 = __importDefault(require("node-cron"));
const sync_1 = require("./sync");
const db_1 = require("./db");
const args = process.argv.slice(2);
async function main() {
    if (args.includes('--run-now')) {
        await (0, sync_1.runSync)();
        if (db_1.dbPool) {
            await db_1.dbPool.end();
        }
        process.exit(0);
    }
    console.log('[Scheduler] Scheduling stock verification task every 2 days at 19:00 (7 PM)...');
    // "0 19 */2 * *" -> At 19:00 on every 2nd day-of-month
    node_cron_1.default.schedule('0 19 */2 * *', async () => {
        console.log(`[Scheduler] Triggering scheduled task at ${new Date().toISOString()}`);
        try {
            await (0, sync_1.runSync)();
        }
        catch (error) {
            console.error('[Scheduler] Error during scheduled sync:', error);
        }
    });
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
