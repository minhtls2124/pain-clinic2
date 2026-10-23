/**
 * Logic lập lịch THUẦN (không phụ thuộc DB/Express) → test đơn vị dễ dàng.
 * Mọi khoảng thời gian là nửa mở [start, end).
 */

export type AppointmentStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

/** Các trạng thái còn "chiếm chỗ" trên lịch — PHẢI khớp với WHERE của EXCLUDE constraint. */
export const ACTIVE_STATUSES = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'] as const satisfies readonly AppointmentStatus[];

export interface Interval {
  start: Date;
  end: Date;
}

export const overlaps = (a: Interval, b: Interval): boolean => a.start < b.end && b.start < a.end;

/** Gộp các khoảng chồng/nối tiếp nhau (ca sáng 07:30–11:30 + ca 11:30–17:00 → một khoảng). */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: Interval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start <= last.end) {
      if (cur.end > last.end) last.end = new Date(cur.end);
    } else {
      out.push({ start: new Date(cur.start), end: new Date(cur.end) });
    }
  }
  return out;
}

/** Lịch hẹn có nằm TRỌN trong ca làm việc (sau khi gộp các ca liền kề) không? */
export function isWithinShifts(target: Interval, shifts: Interval[]): boolean {
  return mergeIntervals(shifts).some((s) => s.start <= target.start && target.end <= s.end);
}

export interface SlotOptions {
  shifts: Interval[];
  /** Khoảng đã bị chiếm của bác sĩ (startAt → blockedUntil), bệnh nhân, phòng... */
  busy: Interval[];
  durationMin: number;
  bufferAfterMin: number;
  stepMin: number;
  /** Không trả slot bắt đầu trước thời điểm này (now + lead time). */
  notBefore: Date;
  /**
   * Nhóm tài nguyên thay thế được (vd: 2 phòng thủ thuật). Slot hợp lệ nếu CÒN ÍT NHẤT MỘT
   * tài nguyên trống. Mỗi phần tử là danh sách khoảng bận của một tài nguyên.
   */
  anyOfFree?: Interval[][];
}

export interface Slot {
  startAt: Date;
  endAt: Date;
}

const MIN = 60_000;

/**
 * Sinh danh sách khung giờ trống.
 * - Slot bắt đầu căn theo bước stepMin tính từ đầu ca.
 * - Buổi khám (start→end) phải nằm trọn trong ca; thời gian đệm sau thủ thuật được phép tràn ca
 *   nhưng vẫn không được đè lên lịch khác.
 */
export function generateSlots(opts: SlotOptions): Slot[] {
  const { durationMin, bufferAfterMin, stepMin, notBefore } = opts;
  const busy = mergeIntervals(opts.busy);
  const slots: Slot[] = [];

  for (const shift of mergeIntervals(opts.shifts)) {
    for (let t = shift.start.getTime(); t + durationMin * MIN <= shift.end.getTime(); t += stepMin * MIN) {
      const startAt = new Date(t);
      if (startAt < notBefore) continue;
      const endAt = new Date(t + durationMin * MIN);
      const blocked: Interval = { start: startAt, end: new Date(endAt.getTime() + bufferAfterMin * MIN) };
      if (busy.some((b) => overlaps(blocked, b))) continue;
      if (opts.anyOfFree && !opts.anyOfFree.some((pool) => !pool.some((b) => overlaps(blocked, b)))) continue;
      slots.push({ startAt, endAt });
    }
  }
  return slots;
}

/** Gợi ý các slot gần thời điểm mong muốn nhất (dùng khi trả 409 trùng lịch). */
export function nearestSlots(slots: Slot[], desired: Date, limit = 3): Slot[] {
  return [...slots]
    .sort((a, b) => Math.abs(a.startAt.getTime() - desired.getTime()) - Math.abs(b.startAt.getTime() - desired.getTime()))
    .slice(0, limit)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

/**
 * Máy trạng thái lịch hẹn. CHECKED_IN = tiếp đón → mở Encounter (bệnh án lượt khám).
 */
export const APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export const canTransition = (from: AppointmentStatus, to: AppointmentStatus): boolean =>
  APPOINTMENT_TRANSITIONS[from].includes(to);

export const isActive = (s: AppointmentStatus): boolean => (ACTIVE_STATUSES as readonly string[]).includes(s);
