import { Router } from 'express';
import { authenticate, currentUser, requirePermission } from '../../middleware/auth.js';
import { parsed, validate } from '../../middleware/validate.js';
import {
  availabilityQuerySchema,
  createAppointmentSchema,
  idParamSchema,
  listAppointmentsQuerySchema,
  rescheduleSchema,
  updateStatusSchema,
} from './appointment.schema.js';
import * as service from './appointment.service.js';

export const appointmentRouter = Router();
appointmentRouter.use(authenticate);

/**
 * GET /api/v1/appointments/availability?providerId=&serviceId=&date=YYYY-MM-DD
 * Danh sách khung giờ trống (lớp 1 chống trùng: UI chỉ cho chọn slot còn trống).
 */
appointmentRouter.get(
  '/availability',
  requirePermission('appointment:create:any', 'appointment:create:own'),
  validate('query', availabilityQuerySchema),
  async (req, res) => {
    res.json(await service.getAvailability(parsed(res, 'query', availabilityQuerySchema), currentUser(req)));
  },
);

/** GET /api/v1/appointments?date=&providerId=&status= — bảng lịch trong ngày cho lễ tân/bác sĩ */
appointmentRouter.get(
  '/',
  requirePermission('appointment:read:any', 'appointment:read:own'),
  validate('query', listAppointmentsQuerySchema),
  async (req, res) => {
    res.json({ data: await service.listAppointments(parsed(res, 'query', listAppointmentsQuerySchema), currentUser(req)) });
  },
);

/**
 * POST /api/v1/appointments — đặt lịch (online hoặc tại quầy).
 * 201: lịch đã tạo | 409: trùng lịch (kèm suggestions) | 422: ngoài ca / quá sớm
 */
appointmentRouter.post(
  '/',
  requirePermission('appointment:create:any', 'appointment:create:own'),
  validate('body', createAppointmentSchema),
  async (req, res) => {
    const appointment = await service.createAppointment(parsed(res, 'body', createAppointmentSchema), currentUser(req));
    res.status(201).location(`/api/v1/appointments/${appointment.id}`).json({ data: appointment });
  },
);

/** PATCH /api/v1/appointments/:id/reschedule — đổi giờ / đổi bác sĩ (chỉ nhân viên) */
appointmentRouter.patch(
  '/:id/reschedule',
  requirePermission('appointment:update:any'),
  validate('params', idParamSchema),
  validate('body', rescheduleSchema),
  async (req, res) => {
    const { id } = parsed(res, 'params', idParamSchema);
    res.json({ data: await service.rescheduleAppointment(id, parsed(res, 'body', rescheduleSchema), currentUser(req)) });
  },
);

/** PATCH /api/v1/appointments/:id/status — xác nhận, check-in, huỷ, vắng mặt... */
appointmentRouter.patch(
  '/:id/status',
  requirePermission('appointment:update:any', 'appointment:cancel:own'),
  validate('params', idParamSchema),
  validate('body', updateStatusSchema),
  async (req, res) => {
    const { id } = parsed(res, 'params', idParamSchema);
    res.json({ data: await service.updateAppointmentStatus(id, parsed(res, 'body', updateStatusSchema), currentUser(req)) });
  },
);
