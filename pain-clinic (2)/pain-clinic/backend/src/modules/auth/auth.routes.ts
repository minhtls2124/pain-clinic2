import bcrypt from 'bcryptjs';
import { Router } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { unauthorized } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { authenticate, currentUser } from '../../middleware/auth.js';
import { parsed, validate } from '../../middleware/validate.js';
import type { JwtPayload } from './auth.types.js';
import { ROLE_PERMISSIONS } from './permissions.js';

export const authRouter = Router();

const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', 10);

const loginSchema = z.object({
  login: z.string().trim().min(3), // email hoặc số điện thoại
  password: z.string().min(6),
});

/** POST /api/v1/auth/login → { token, user } */
authRouter.post('/login', validate('body', loginSchema), async (_req, res) => {
  const { login, password } = parsed(res, 'body', loginSchema);
  const user = await prisma.user.findFirst({
    where: { isActive: true, OR: [{ email: login.toLowerCase() }, { phone: login }] },
    include: { staff: { select: { id: true } }, patient: { select: { id: true } } },
  });
  // So sánh hash kể cả khi không có user để thời gian phản hồi đồng đều (chống dò tài khoản)
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw unauthorized('Sai thông tin đăng nhập');

  const payload: JwtPayload = { sub: user.id, role: user.role, sid: user.staff?.id, pid: user.patient?.id };
  const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] });

  res.json({
    token,
    user: { id: user.id, fullName: user.fullName, role: user.role, staffId: user.staff?.id, patientId: user.patient?.id },
  });
});

/** GET /api/v1/auth/me — thông tin + danh sách quyền (frontend dùng để ẩn/hiện menu) */
authRouter.get('/me', authenticate, (req, res) => {
  const user = currentUser(req);
  res.json({ user, permissions: ROLE_PERMISSIONS[user.role] });
});
