/**
 * Worker gửi thông báo từ bảng notification_outbox.
 * - FOR UPDATE SKIP LOCKED: chạy nhiều worker song song không gửi trùng.
 * - Retry với exponential backoff, tối đa MAX_ATTEMPTS lần rồi đánh dấu FAILED.
 * Chạy: npm run worker
 */
import { prisma } from '../lib/prisma.js';
import { renderMessage } from '../modules/notifications/notification.service.js';

const BATCH = 20;
const MAX_ATTEMPTS = 5;
const POLL_MS = 3_000;

interface OutboxRow {
  id: string;
  channel: 'SMS' | 'ZALO' | 'EMAIL';
  recipient: string;
  template: string;
  payload: Record<string, unknown>;
  attempts: number;
}

/** Thay bằng nhà cung cấp thật: eSMS/SpeedSMS (SMS), Zalo ZNS, Amazon SES / SMTP (email). */
interface Sender {
  send(row: OutboxRow, text: string): Promise<void>;
}
const consoleSender: Sender = {
  async send(row, text) {
    console.log(`→ [${row.channel}] ${row.recipient}: ${text}`);
  },
};

async function tick(sender: Sender) {
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<OutboxRow[]>`
      SELECT "id", "channel"::text AS "channel", "recipient", "template", "payload", "attempts"
      FROM "notification_outbox"
      WHERE "status" = 'PENDING' AND "nextAttemptAt" <= now()
      ORDER BY "createdAt"
      LIMIT ${BATCH}
      FOR UPDATE SKIP LOCKED`;

    for (const row of rows) {
      try {
        await sender.send(row, renderMessage(row.template, row.payload));
        await tx.notificationOutbox.update({
          where: { id: row.id },
          data: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 } },
        });
      } catch (err) {
        const attempts = row.attempts + 1;
        await tx.notificationOutbox.update({
          where: { id: row.id },
          data: {
            attempts,
            status: attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
            nextAttemptAt: new Date(Date.now() + 2 ** attempts * 30_000), // 1', 2', 4', 8'...
            lastError: String(err).slice(0, 500),
          },
        });
      }
    }
  }, { timeout: 60_000 });
}

let running = true;
process.on('SIGINT', () => (running = false));
process.on('SIGTERM', () => (running = false));

console.log('✓ Notification worker đang chạy');
while (running) {
  try {
    await tick(consoleSender);
  } catch (err) {
    console.error('[worker]', err);
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}
await prisma.$disconnect();
