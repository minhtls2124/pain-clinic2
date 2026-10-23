import { env } from '../config/env.js';

export const addMinutes = (d: Date, minutes: number) => new Date(d.getTime() + minutes * 60_000);

/** Khoảng [00:00, 24:00) của một ngày theo giờ phòng khám, trả về dạng UTC Date. */
export function clinicDayRange(date: string, offset = env.CLINIC_UTC_OFFSET): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00${offset}`);
  if (Number.isNaN(start.getTime())) throw new Error(`Ngày không hợp lệ: ${date}`);
  return { start, end: addMinutes(start, 24 * 60) };
}

/** Định dạng "HH:mm dd/MM/yyyy" theo giờ phòng khám (dùng cho nội dung SMS/Zalo). */
export function formatClinicTime(d: Date, offset = env.CLINIC_UTC_OFFSET): string {
  const sign = offset.startsWith('-') ? -1 : 1;
  const [h, m] = offset.slice(1).split(':').map(Number);
  const local = new Date(d.getTime() + sign * ((h ?? 0) * 60 + (m ?? 0)) * 60_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(local.getUTCHours())}:${p(local.getUTCMinutes())} ${p(local.getUTCDate())}/${p(local.getUTCMonth() + 1)}/${local.getUTCFullYear()}`;
}

/** Ngày (YYYY-MM-DD) theo giờ phòng khám của một thời điểm UTC. */
export function clinicDate(d: Date, offset = env.CLINIC_UTC_OFFSET): string {
  const sign = offset.startsWith('-') ? -1 : 1;
  const [h, m] = offset.slice(1).split(':').map(Number);
  return new Date(d.getTime() + sign * ((h ?? 0) * 60 + (m ?? 0)) * 60_000).toISOString().slice(0, 10);
}

/** Mã nghiệp vụ dễ đọc: LH-20261102-7K3Q9A (cột code có @unique làm chốt chặn cuối). */
export function businessCode(prefix: string, at = new Date()): string {
  const ymd = at.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
  return `${prefix}-${ymd}-${rand}`;
}
