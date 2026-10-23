import type { Role } from './permissions.js';

/** Thông tin người dùng đã xác thực, gắn vào req.user bởi middleware authenticate. */
export interface AuthUser {
  id: string;
  role: Role;
  staffId?: string; // có nếu là nhân viên y tế
  patientId?: string; // có nếu là bệnh nhân dùng portal
}

export interface JwtPayload {
  sub: string;
  role: Role;
  sid?: string;
  pid?: string;
}
