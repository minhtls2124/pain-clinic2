import { Prisma, type RoomType, type Service } from '@prisma/client';
import { env } from '../../config/env.js';
import { audit } from '../../lib/audit.js';
import {
  AppError,
  badRequest,
  conflict,
  forbidden,
  isExclusionViolation,
  notFound,
  unprocessable,
} from '../../lib/errors.js';
import { prisma, type Tx } from '../../lib/prisma.js';
import { addMinutes, businessCode, clinicDate, clinicDayRange, formatClinicTime } from '../../lib/time.js';
import type { AuthUser } from '../auth/auth.types.js';
import { enqueueNotification } from '../notifications/notification.service.js';
import type {
  AvailabilityQuery,
  CreateAppointmentInput,
  ListAppointmentsQuery,
  RescheduleInput,
  UpdateStatusInput,
} from './appointment.schema.js';
import {
  ACTIVE_STATUSES,
  canTransition,
  generateSlots,
  isWithinShifts,
  nearestSlots,
  type Interval,
  type Slot,
} from './scheduling.js';

const ACTIVE = [...ACTIVE_STATUSES];
const TX_OPTIONS = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 10_000 } as const;

/** Dữ liệu trả về cho client — chỉ những trường cần cho màn hình lịch. */
const appointmentView = {
  id: true,
  code: true,
  startAt: true,
  endAt: true,
  status: true,
  source: true,
  reason: true,
  version: true,
  patient: { select: { id: true, code: true, fullName: true, phone: true } },
  provider: { select: { id: true, title: true, user: { select: { fullName: true } } } },
  service: { select: { id: true, name: true, type: true, durationMin: true } },
  room: { select: { id: true, name: true } },
} satisfies Prisma.AppointmentSelect;

type ConflictType = 'OUTSIDE_WORKING_HOURS' | 'PROVIDER_BUSY' | 'PATIENT_BUSY' | 'ROOM_BUSY';

interface BookingTarget {
  excludeAppointmentId?: string;
  patientId: string;
  providerId: string;
  startAt: Date;
  endAt: Date;
  blockedUntil: Date;
  /** Các phòng có thể dùng (rỗng = dịch vụ không cần phòng). Sẽ chọn phòng trống đầu tiên. */
  candidateRoomIds: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
//  Lớp 2 — kiểm tra ở tầng ứng dụng, chạy BÊN TRONG transaction sau khi giữ advisory lock
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Advisory lock theo khóa nghiệp vụ (bác sĩ, bệnh nhân, nhóm phòng). Hai request đặt cùng
 * bác sĩ sẽ xếp hàng tuần tự; request thứ hai thấy lịch của request thứ nhất → trả 409 rõ ràng.
 * Khóa được sắp xếp trước khi lấy để tránh deadlock. Tự nhả khi transaction kết thúc.
 */
async function lockScheduleKeys(tx: Tx, keys: string[]) {
  for (const key of [...new Set(keys)].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }
}

/** Kiểm tra tất cả xung đột; trả về phòng được chọn (nếu dịch vụ cần phòng). */
async function assertBookable(tx: Tx, t: BookingTarget): Promise<{ roomId: string | null }> {
  const notSelf = t.excludeAppointmentId ? { not: t.excludeAppointmentId } : undefined;
  const conflicts: { type: ConflictType; startAt?: Date; endAt?: Date }[] = [];

  // (a) Nằm trong ca làm việc
  const shifts = await tx.workShift.findMany({
    where: { staffId: t.providerId, startAt: { lt: t.endAt }, endAt: { gt: t.startAt } },
    select: { startAt: true, endAt: true },
  });
  const shiftIntervals: Interval[] = shifts.map((s) => ({ start: s.startAt, end: s.endAt }));
  if (!isWithinShifts({ start: t.startAt, end: t.endAt }, shiftIntervals)) {
    throw unprocessable('OUTSIDE_WORKING_HOURS', 'Thời gian đã chọn nằm ngoài ca làm việc của bác sĩ/KTV');
  }

  // (b) Bác sĩ/KTV bận (tính cả thời gian đệm)
  const providerBusy = await tx.appointment.findMany({
    where: {
      id: notSelf,
      providerId: t.providerId,
      status: { in: ACTIVE },
      startAt: { lt: t.blockedUntil },
      blockedUntil: { gt: t.startAt },
    },
    select: { startAt: true, blockedUntil: true },
  });
  for (const a of providerBusy) conflicts.push({ type: 'PROVIDER_BUSY', startAt: a.startAt, endAt: a.blockedUntil });

  // (c) Bệnh nhân đã có lịch khác cùng giờ
  const patientBusy = await tx.appointment.findMany({
    where: {
      id: notSelf,
      patientId: t.patientId,
      status: { in: ACTIVE },
      startAt: { lt: t.endAt },
      endAt: { gt: t.startAt },
    },
    select: { startAt: true, endAt: true },
  });
  for (const a of patientBusy) conflicts.push({ type: 'PATIENT_BUSY', startAt: a.startAt, endAt: a.endAt });

  // (d) Phòng thủ thuật — chọn phòng trống đầu tiên trong danh sách ứng viên
  let roomId: string | null = null;
  if (t.candidateRoomIds.length > 0) {
    const roomBusy = await tx.appointment.findMany({
      where: {
        id: notSelf,
        roomId: { in: t.candidateRoomIds },
        status: { in: ACTIVE },
        startAt: { lt: t.blockedUntil },
        blockedUntil: { gt: t.startAt },
      },
      select: { roomId: true },
    });
    const busyRooms = new Set(roomBusy.map((r) => r.roomId));
    roomId = t.candidateRoomIds.find((id) => !busyRooms.has(id)) ?? null;
    if (!roomId) conflicts.push({ type: 'ROOM_BUSY' });
  }

  if (conflicts.length > 0) {
    throw conflict('SCHEDULE_CONFLICT', conflictMessage(conflicts[0]!.type), { conflicts });
  }
  return { roomId };
}

function conflictMessage(type: ConflictType): string {
  switch (type) {
    case 'PROVIDER_BUSY':
      return 'Bác sĩ/KTV đã có lịch trong khung giờ này';
    case 'PATIENT_BUSY':
      return 'Bệnh nhân đã có lịch hẹn khác trùng giờ';
    case 'ROOM_BUSY':
      return 'Không còn phòng thủ thuật trống trong khung giờ này';
    default:
      return 'Khung giờ không khả dụng';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function loadProvider(providerId: string) {
  const provider = await prisma.staff.findUnique({
    where: { id: providerId },
    select: { id: true, title: true, user: { select: { fullName: true, role: true, isActive: true } } },
  });
  if (!provider || !provider.user.isActive || !['DOCTOR', 'TECHNICIAN'].includes(provider.user.role)) {
    throw notFound('Bác sĩ/KTV');
  }
  return provider;
}

async function candidateRooms(service: Service, requestedRoomId?: string | null): Promise<string[]> {
  if (!service.requiresRoomType) return requestedRoomId ? [requestedRoomId] : [];
  const rooms = await prisma.room.findMany({
    where: { type: service.requiresRoomType, isActive: true, ...(requestedRoomId ? { id: requestedRoomId } : {}) },
    select: { id: true },
    orderBy: { name: 'asc' },
  });
  if (rooms.length === 0) {
    throw unprocessable('ROOM_REQUIRED', `Dịch vụ cần phòng loại ${service.requiresRoomType} nhưng không có phòng phù hợp`);
  }
  return rooms.map((r) => r.id);
}

function lockKeysFor(t: { providerId: string; patientId: string }, roomType: RoomType | null, roomIds: string[]) {
  const keys = [`provider:${t.providerId}`, `patient:${t.patientId}`];
  if (roomType) keys.push(`roomtype:${roomType}`);
  else roomIds.forEach((id) => keys.push(`room:${id}`));
  return keys;
}

/**
 * Lớp 3 bắt lỗi từ EXCLUDE constraint (23P01) → 409; kèm gợi ý các khung giờ trống gần nhất
 * để lễ tân/bệnh nhân chọn lại ngay, không phải tra lịch thủ công.
 */
async function withSuggestions(
  err: unknown,
  ctx: { providerId: string; service: Service; desired: Date; patientId?: string; excludeAppointmentId?: string },
): Promise<unknown> {
  const isScheduleConflict = err instanceof AppError && err.code === 'SCHEDULE_CONFLICT';
  if (!isScheduleConflict && !isExclusionViolation(err)) return err;

  const slots = await computeSlots({
    providerId: ctx.providerId,
    service: ctx.service,
    date: clinicDate(ctx.desired),
    notBefore: new Date(),
    patientId: ctx.patientId,
    excludeAppointmentId: ctx.excludeAppointmentId,
  });
  const suggestions = nearestSlots(slots, ctx.desired).map(toSlotDto);

  if (isScheduleConflict) {
    const e = err as AppError;
    return conflict(e.code, e.message, { ...(e.details as object), suggestions });
  }
  return conflict('SCHEDULE_CONFLICT', 'Khung giờ vừa được đặt bởi người khác, vui lòng chọn giờ khác', {
    suggestions,
  });
}

const toSlotDto = (s: Slot) => ({ startAt: s.startAt.toISOString(), endAt: s.endAt.toISOString() });

/** Bệnh nhân không được thấy giờ hẹn của bệnh nhân khác → bỏ chi tiết xung đột. */
function redactForPatient(err: unknown, actor: AuthUser): unknown {
  if (actor.role !== 'PATIENT' || !(err instanceof AppError) || err.status !== 409) return err;
  const { suggestions } = (err.details ?? {}) as { suggestions?: unknown };
  return conflict(err.code, 'Khung giờ này không còn trống, vui lòng chọn giờ khác', { suggestions });
}

function notificationPayload(a: {
  code: string;
  startAt: Date;
  service: { name: string };
  provider: { title: string | null; user: { fullName: string } };
}) {
  return {
    code: a.code,
    time: formatClinicTime(a.startAt),
    serviceName: a.service.name,
    providerName: [a.provider.title, a.provider.user.fullName].filter(Boolean).join(' '),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Use cases
// ─────────────────────────────────────────────────────────────────────────────

interface ComputeSlotsArgs {
  providerId: string;
  service: Service;
  date: string;
  notBefore: Date;
  patientId?: string;
  excludeAppointmentId?: string;
}

async function computeSlots(a: ComputeSlotsArgs): Promise<Slot[]> {
  const day = clinicDayRange(a.date);
  const notSelf = a.excludeAppointmentId ? { not: a.excludeAppointmentId } : undefined;

  const [shifts, providerAppts, patientAppts, rooms] = await Promise.all([
    prisma.workShift.findMany({
      where: { staffId: a.providerId, startAt: { lt: day.end }, endAt: { gt: day.start } },
      select: { startAt: true, endAt: true },
    }),
    prisma.appointment.findMany({
      where: { id: notSelf, providerId: a.providerId, status: { in: ACTIVE }, startAt: { lt: day.end }, blockedUntil: { gt: day.start } },
      select: { startAt: true, blockedUntil: true },
    }),
    a.patientId
      ? prisma.appointment.findMany({
          where: { id: notSelf, patientId: a.patientId, status: { in: ACTIVE }, startAt: { lt: day.end }, endAt: { gt: day.start } },
          select: { startAt: true, endAt: true },
        })
      : Promise.resolve([]),
    a.service.requiresRoomType
      ? prisma.room.findMany({
          where: { type: a.service.requiresRoomType, isActive: true },
          select: {
            appointments: {
              where: { id: notSelf, status: { in: ACTIVE }, startAt: { lt: day.end }, blockedUntil: { gt: day.start } },
              select: { startAt: true, blockedUntil: true },
            },
          },
        })
      : Promise.resolve(null),
  ]);

  // Cắt ca về trong phạm vi ngày (ca đêm vắt qua 0h)
  const clipped: Interval[] = shifts.map((s) => ({
    start: s.startAt < day.start ? day.start : s.startAt,
    end: s.endAt > day.end ? day.end : s.endAt,
  }));

  return generateSlots({
    shifts: clipped,
    busy: [
      ...providerAppts.map((x) => ({ start: x.startAt, end: x.blockedUntil })),
      ...patientAppts.map((x) => ({ start: x.startAt, end: x.endAt })),
    ],
    durationMin: a.service.durationMin,
    bufferAfterMin: a.service.bufferAfterMin,
    stepMin: env.SLOT_STEP_MINUTES,
    notBefore: a.notBefore,
    anyOfFree: rooms?.map((r) => r.appointments.map((x) => ({ start: x.startAt, end: x.blockedUntil }))),
  });
}

export async function getAvailability(q: AvailabilityQuery, actor: AuthUser) {
  const service = await prisma.service.findFirst({ where: { id: q.serviceId, isActive: true } });
  if (!service) throw notFound('Dịch vụ');
  if (actor.role === 'PATIENT' && !service.bookableOnline) {
    throw forbidden('Dịch vụ này cần bác sĩ chỉ định, vui lòng liên hệ lễ tân');
  }
  await loadProvider(q.providerId);

  const leadMin = actor.role === 'PATIENT' ? env.ONLINE_MIN_LEAD_MINUTES : 0;
  const slots = await computeSlots({
    providerId: q.providerId,
    service,
    date: q.date,
    notBefore: addMinutes(new Date(), leadMin),
    patientId: actor.role === 'PATIENT' ? actor.patientId : undefined,
  });

  return { date: q.date, providerId: q.providerId, serviceId: q.serviceId, durationMin: service.durationMin, slots: slots.map(toSlotDto) };
}

export async function createAppointment(input: CreateAppointmentInput, actor: AuthUser) {
  const isPatient = actor.role === 'PATIENT';
  if (isPatient && input.patientId && input.patientId !== actor.patientId) {
    throw forbidden('Bạn chỉ có thể đặt lịch cho chính mình');
  }
  const patientId = isPatient ? actor.patientId : input.patientId;
  if (!patientId) throw badRequest('PATIENT_REQUIRED', 'Thiếu patientId');

  const [service, provider, patient] = await Promise.all([
    prisma.service.findFirst({ where: { id: input.serviceId, isActive: true } }),
    loadProvider(input.providerId),
    prisma.patient.findUnique({ where: { id: patientId }, select: { id: true, phone: true, email: true } }),
  ]);
  if (!service) throw notFound('Dịch vụ');
  if (!patient) throw notFound('Bệnh nhân');
  if (isPatient && !service.bookableOnline) {
    throw forbidden('Dịch vụ này cần bác sĩ chỉ định, vui lòng liên hệ lễ tân');
  }

  const now = new Date();
  const minStart = addMinutes(now, isPatient ? env.ONLINE_MIN_LEAD_MINUTES : 0);
  if (input.startAt < minStart) {
    throw unprocessable(
      'START_TOO_EARLY',
      isPatient
        ? `Vui lòng đặt trước ít nhất ${env.ONLINE_MIN_LEAD_MINUTES} phút`
        : 'Không thể đặt lịch trong quá khứ',
    );
  }

  const startAt = input.startAt;
  const endAt = addMinutes(startAt, service.durationMin);
  const blockedUntil = addMinutes(endAt, service.bufferAfterMin);
  const roomIds = await candidateRooms(service, input.roomId);

  try {
    return await prisma.$transaction(async (tx) => {
      await lockScheduleKeys(tx, lockKeysFor({ providerId: provider.id, patientId }, service.requiresRoomType, roomIds));
      const { roomId } = await assertBookable(tx, {
        patientId,
        providerId: provider.id,
        startAt,
        endAt,
        blockedUntil,
        candidateRoomIds: roomIds,
      });

      const appointment = await tx.appointment.create({
        data: {
          code: businessCode('LH', startAt),
          patientId,
          providerId: provider.id,
          serviceId: service.id,
          roomId,
          startAt,
          endAt,
          blockedUntil,
          status: 'CONFIRMED',
          source: isPatient ? 'ONLINE' : 'COUNTER',
          reason: input.reason,
          note: input.note,
          createdById: actor.id,
        },
        select: appointmentView,
      });

      await enqueueNotification(tx, 'appointment.confirmed', patient, notificationPayload(appointment));
      await audit(tx, actor, 'appointment.create', 'Appointment', appointment.id, {
        startAt: startAt.toISOString(),
        providerId: provider.id,
      });
      return appointment;
    }, TX_OPTIONS);
  } catch (err) {
    throw redactForPatient(
      await withSuggestions(err, { providerId: provider.id, service, desired: startAt, patientId }),
      actor,
    );
  }
}

export async function listAppointments(q: ListAppointmentsQuery, actor: AuthUser) {
  if (actor.role === 'PATIENT' && !actor.patientId) throw forbidden('Tài khoản chưa liên kết hồ sơ bệnh nhân');
  const where: Prisma.AppointmentWhereInput = {
    providerId: q.providerId,
    status: q.status,
    patientId: actor.role === 'PATIENT' ? actor.patientId : q.patientId, // bệnh nhân luôn bị khoá về hồ sơ của mình
  };
  if (q.date) {
    const day = clinicDayRange(q.date);
    where.startAt = { gte: day.start, lt: day.end };
  }
  return prisma.appointment.findMany({ where, select: appointmentView, orderBy: { startAt: 'asc' }, take: 500 });
}

export async function rescheduleAppointment(id: string, input: RescheduleInput, actor: AuthUser) {
  const current = await prisma.appointment.findUnique({
    where: { id },
    include: { service: true, patient: { select: { phone: true, email: true } } },
  });
  if (!current) throw notFound('Lịch hẹn');
  if (!['PENDING', 'CONFIRMED'].includes(current.status)) {
    throw unprocessable('NOT_RESCHEDULABLE', 'Chỉ đổi giờ được lịch đang chờ hoặc đã xác nhận');
  }
  if (current.version !== input.version) {
    throw conflict('VERSION_MISMATCH', 'Lịch hẹn vừa được người khác cập nhật, vui lòng tải lại');
  }

  const providerId = input.providerId ?? current.providerId;
  await loadProvider(providerId);
  if (input.startAt < new Date()) throw unprocessable('START_TOO_EARLY', 'Không thể dời lịch về quá khứ');

  const service = current.service;
  const startAt = input.startAt;
  const endAt = addMinutes(startAt, service.durationMin);
  const blockedUntil = addMinutes(endAt, service.bufferAfterMin);
  const requestedRoom = input.roomId === undefined ? current.roomId : input.roomId;
  const roomIds = await candidateRooms(service, requestedRoom);

  try {
    return await prisma.$transaction(async (tx) => {
      await lockScheduleKeys(
        tx,
        lockKeysFor({ providerId, patientId: current.patientId }, service.requiresRoomType, roomIds),
      );
      const { roomId } = await assertBookable(tx, {
        excludeAppointmentId: id,
        patientId: current.patientId,
        providerId,
        startAt,
        endAt,
        blockedUntil,
        candidateRoomIds: roomIds,
      });

      // Optimistic lock: chỉ cập nhật nếu version chưa đổi
      const { count } = await tx.appointment.updateMany({
        where: { id, version: input.version },
        data: { providerId, roomId, startAt, endAt, blockedUntil, version: { increment: 1 } },
      });
      if (count === 0) throw conflict('VERSION_MISMATCH', 'Lịch hẹn vừa được người khác cập nhật, vui lòng tải lại');

      const updated = await tx.appointment.findUniqueOrThrow({ where: { id }, select: appointmentView });
      await enqueueNotification(tx, 'appointment.rescheduled', current.patient, notificationPayload(updated));
      await audit(tx, actor, 'appointment.reschedule', 'Appointment', id, {
        from: current.startAt.toISOString(),
        to: startAt.toISOString(),
      });
      return updated;
    }, TX_OPTIONS);
  } catch (err) {
    throw await withSuggestions(err, {
      providerId,
      service,
      desired: startAt,
      patientId: current.patientId,
      excludeAppointmentId: id,
    });
  }
}

export async function updateAppointmentStatus(id: string, input: UpdateStatusInput, actor: AuthUser) {
  const current = await prisma.appointment.findUnique({
    where: { id },
    include: {
      patient: { select: { phone: true, email: true } },
      provider: { select: { title: true, user: { select: { fullName: true, role: true } } } },
      service: { select: { name: true } },
    },
  });
  if (!current) throw notFound('Lịch hẹn');

  if (actor.role === 'PATIENT') {
    if (current.patientId !== actor.patientId) throw notFound('Lịch hẹn'); // không tiết lộ lịch người khác tồn tại
    if (input.status !== 'CANCELLED') throw forbidden('Bệnh nhân chỉ có thể huỷ lịch của mình');
  }
  if (!canTransition(current.status, input.status)) {
    throw unprocessable('INVALID_TRANSITION', `Không thể chuyển từ ${current.status} sang ${input.status}`);
  }
  if (input.status === 'CANCELLED' && !input.reason && actor.role !== 'PATIENT') {
    throw badRequest('REASON_REQUIRED', 'Cần nhập lý do huỷ lịch');
  }

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.appointment.updateMany({
      where: { id, version: input.version },
      data: {
        status: input.status,
        cancelReason: input.status === 'CANCELLED' ? (input.reason ?? 'Bệnh nhân huỷ qua portal') : undefined,
        version: { increment: 1 },
      },
    });
    if (count === 0) throw conflict('VERSION_MISMATCH', 'Lịch hẹn vừa được người khác cập nhật, vui lòng tải lại');

    // Tiếp đón: mở lượt khám (Encounter) — bước đầu của quy trình khám khép kín
    if (input.status === 'CHECKED_IN') {
      await tx.encounter.create({
        data: {
          code: businessCode('LK'),
          patientId: current.patientId,
          appointmentId: id,
          doctorId: current.provider.user.role === 'DOCTOR' ? current.providerId : null,
          status: 'CHECKED_IN',
          chiefComplaint: current.reason,
        },
      });
    }

    if (input.status === 'CANCELLED') {
      await enqueueNotification(tx, 'appointment.cancelled', current.patient, notificationPayload(current));
    }

    await audit(tx, actor, `appointment.status.${input.status.toLowerCase()}`, 'Appointment', id, {
      from: current.status,
      reason: input.reason ?? null,
    });

    return tx.appointment.findUniqueOrThrow({ where: { id }, select: appointmentView });
  }, TX_OPTIONS);
}
