import { z } from 'zod';

/** ISO 8601 BẮT BUỘC có múi giờ (Z hoặc +07:00) — tránh lệch giờ khi client gửi giờ "trần". */
const isoDateTime = z
  .string()
  .datetime({ offset: true, message: 'Cần ISO 8601 có múi giờ, vd 2026-11-02T09:00:00+07:00' })
  .transform((s) => new Date(s));

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng YYYY-MM-DD');

export const createAppointmentSchema = z.object({
  patientId: z.string().uuid().optional(), // bỏ trống khi bệnh nhân tự đặt (lấy từ token)
  providerId: z.string().uuid(),
  serviceId: z.string().uuid(),
  roomId: z.string().uuid().optional(),
  startAt: isoDateTime,
  reason: z.string().trim().max(500).optional(),
  note: z.string().trim().max(1000).optional(),
});
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const availabilityQuerySchema = z.object({
  providerId: z.string().uuid(),
  serviceId: z.string().uuid(),
  date: ymd,
});
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export const listAppointmentsQuerySchema = z.object({
  date: ymd.optional(),
  providerId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
});
export type ListAppointmentsQuery = z.infer<typeof listAppointmentsQuerySchema>;

export const rescheduleSchema = z.object({
  startAt: isoDateTime,
  providerId: z.string().uuid().optional(),
  roomId: z.string().uuid().nullable().optional(),
  version: z.number().int().min(0), // optimistic locking
});
export type RescheduleInput = z.infer<typeof rescheduleSchema>;

export const updateStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
  reason: z.string().trim().max(500).optional(),
  version: z.number().int().min(0),
});
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });
