import type { NotificationChannel, Prisma } from '@prisma/client';
import type { Tx } from '../../lib/prisma.js';

export type NotificationTemplate =
  | 'appointment.confirmed'
  | 'appointment.rescheduled'
  | 'appointment.cancelled'
  | 'appointment.reminder';

interface Recipient {
  phone?: string | null;
  email?: string | null;
}

/**
 * Transactional Outbox: chỉ GHI yêu cầu gửi vào bảng notification_outbox trong cùng
 * transaction với lịch hẹn. Worker (src/workers/notification.worker.ts) gửi thật sau.
 * → Lịch hẹn rollback thì không có tin nhắn "ma"; nhà mạng SMS chậm không làm chậm API.
 */
export async function enqueueNotification(
  tx: Tx,
  template: NotificationTemplate,
  to: Recipient,
  payload: Prisma.InputJsonObject,
) {
  const rows: { channel: NotificationChannel; recipient: string }[] = [];
  if (to.phone) rows.push({ channel: 'SMS', recipient: to.phone }); // Có thể đổi sang ZALO (Zalo ZNS)
  if (to.email) rows.push({ channel: 'EMAIL', recipient: to.email });
  if (rows.length === 0) return;

  await tx.notificationOutbox.createMany({
    data: rows.map((r) => ({ ...r, template, payload })),
  });
}

/** Nội dung tin nhắn theo template (thực tế nên tách ra file template / bảng cấu hình). */
export function renderMessage(template: string, p: Record<string, unknown>): string {
  switch (template) {
    case 'appointment.confirmed':
      return `[Phong kham Dau] Xac nhan lich ${p.code}: ${p.serviceName} voi ${p.providerName} luc ${p.time}. Vui long den truoc 15 phut.`;
    case 'appointment.rescheduled':
      return `[Phong kham Dau] Lich ${p.code} da doi sang ${p.time} (${p.providerName}).`;
    case 'appointment.cancelled':
      return `[Phong kham Dau] Lich ${p.code} luc ${p.time} da duoc huy.`;
    case 'appointment.reminder':
      return `[Phong kham Dau] Nhac lich: ${p.serviceName} luc ${p.time}. Ma lich ${p.code}.`;
    default:
      return JSON.stringify(p);
  }
}
