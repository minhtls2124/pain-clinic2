import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import type { AuthUser, JwtPayload } from '../modules/auth/auth.types.js';
import { hasAnyPermission, type Permission } from '../modules/auth/permissions.js';

/** Xác thực Bearer JWT → req.user */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(unauthorized());

  try {
    const payload = jwt.verify(header.slice(7), env.JWT_SECRET) as JwtPayload;
    const user: AuthUser = { id: payload.sub, role: payload.role, staffId: payload.sid, patientId: payload.pid };
    req.user = user;
    next();
  } catch {
    next(unauthorized());
  }
}

/** Cho qua nếu vai trò có ÍT NHẤT MỘT trong các quyền liệt kê (phạm vi :own kiểm tra tiếp ở service). */
export function requirePermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!hasAnyPermission(req.user.role, permissions)) return next(forbidden());
    next();
  };
}

/** Lấy req.user đã được authenticate gắn vào (ném 401 nếu thiếu — phòng lỗi cấu hình route). */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
