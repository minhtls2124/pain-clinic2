import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../modules/auth/auth.types.js';
import type { Tx } from './prisma.js';

/** Ghi nhật ký kiểm toán trong CÙNG transaction với thao tác nghiệp vụ. */
export function audit(
  tx: Tx,
  actor: AuthUser | null,
  action: string,
  entity: string,
  entityId: string | null,
  meta?: Prisma.InputJsonValue,
) {
  return tx.auditLog.create({
    data: { actorId: actor?.id ?? null, action, entity, entityId, meta },
  });
}
