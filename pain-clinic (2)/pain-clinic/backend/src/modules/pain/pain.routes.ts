import { Router } from 'express';
import { z } from 'zod';
import { forbidden, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { prisma } from '../../lib/prisma.js';
import { authenticate, currentUser, requirePermission } from '../../middleware/auth.js';
import { parsed, validate } from '../../middleware/validate.js';
import { hasPermission } from '../auth/permissions.js';
import type { AuthUser } from '../auth/auth.types.js';

/**
 * Dữ liệu cho biểu đồ theo dõi cơn đau (VAS/NRS) + mốc thủ thuật can thiệp
 * để bác sĩ thấy ngay hiệu quả của từng lần tiêm/phong bế.
 */
export const painRouter = Router({ mergeParams: true });
painRouter.use(authenticate);

const patientParam = z.object({ patientId: z.string().uuid() });
const seriesQuery = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  bodyRegion: z.string().optional(),
});

const createSchema = z
  .object({
    scale: z.enum(['VAS', 'NRS']),
    score: z.number().min(0).max(10).multipleOf(0.1).optional(),
    vasMm: z.number().int().min(0).max(100).optional(), // VAS gốc 0–100 mm
    bodyRegion: z.string().trim().min(1).max(100),
    painType: z.enum(['NOCICEPTIVE', 'NEUROPATHIC', 'MIXED', 'NOCIPLASTIC']).optional(),
    context: z.enum(['BASELINE', 'PRE_PROCEDURE', 'POST_PROCEDURE', 'FOLLOW_UP', 'SELF_REPORT']),
    encounterId: z.string().uuid().optional(),
    note: z.string().max(1000).optional(),
  })
  .refine((v) => v.score !== undefined || (v.scale === 'VAS' && v.vasMm !== undefined), {
    message: 'Cần score (0–10) hoặc vasMm (0–100) với thang VAS',
  });

function assertCanAccessPatient(user: AuthUser, patientId: string) {
  if (user.role === 'PATIENT' && user.patientId !== patientId) throw notFound('Bệnh nhân');
}

/** GET /api/v1/patients/:patientId/pain-series */
painRouter.get(
  '/pain-series',
  requirePermission('emr:read', 'pain:read:own'),
  validate('params', patientParam),
  validate('query', seriesQuery),
  async (req, res) => {
    const user = currentUser(req);
    const { patientId } = parsed(res, 'params', patientParam);
    const q = parsed(res, 'query', seriesQuery);
    assertCanAccessPatient(user, patientId);

    const range = { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(q.to) : undefined };
    const [assessments, procedures] = await Promise.all([
      prisma.painAssessment.findMany({
        where: { patientId, recordedAt: range, bodyRegion: q.bodyRegion },
        orderBy: { recordedAt: 'asc' },
        select: { id: true, scale: true, score: true, bodyRegion: true, context: true, recordedAt: true, note: true },
      }),
      prisma.procedureRecord.findMany({
        where: { encounter: { patientId }, performedAt: range },
        orderBy: { performedAt: 'asc' },
        select: { id: true, procedureType: true, level: true, laterality: true, performedAt: true, service: { select: { name: true } } },
      }),
    ]);

    await prisma.auditLog.create({
      data: { actorId: user.id, action: 'emr.read.pain_series', entity: 'Patient', entityId: patientId },
    });

    res.json({
      points: assessments.map((a) => ({ ...a, score: Number(a.score), recordedAt: a.recordedAt.toISOString() })),
      procedures: procedures.map((p) => ({
        id: p.id,
        type: p.procedureType,
        label: [p.service.name, p.level, p.laterality].filter(Boolean).join(' · '),
        performedAt: p.performedAt.toISOString(),
      })),
    });
  },
);

/** POST /api/v1/patients/:patientId/pain-assessments — BS/KTV ghi nhận, hoặc bệnh nhân tự báo */
painRouter.post(
  '/pain-assessments',
  requirePermission('pain:write', 'pain:write:own'),
  validate('params', patientParam),
  validate('body', createSchema),
  async (req, res) => {
    const user = currentUser(req);
    const { patientId } = parsed(res, 'params', patientParam);
    const body = parsed(res, 'body', createSchema);
    assertCanAccessPatient(user, patientId);
    if (!hasPermission(user.role, 'pain:write') && body.context !== 'SELF_REPORT') {
      throw forbidden('Bệnh nhân chỉ được tự báo mức đau (SELF_REPORT)');
    }

    const score = body.score ?? (body.vasMm ?? 0) / 10;
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.painAssessment.create({
        data: {
          patientId,
          encounterId: body.encounterId,
          scale: body.scale,
          score,
          vasMm: body.vasMm,
          bodyRegion: body.bodyRegion,
          painType: body.painType,
          context: body.context,
          note: body.note,
          recordedById: user.staffId ?? null,
        },
      });
      await audit(tx, user, 'emr.write.pain_assessment', 'Patient', patientId, { score });
      return row;
    });
    res.status(201).json({ data: { ...created, score: Number(created.score) } });
  },
);
