/**
 * RBAC — mỗi vai trò có một tập quyền cố định. Quyền dạng "<tài nguyên>:<hành động>[:phạm vi]".
 * Phạm vi ":own" được kiểm tra thêm ở tầng service (bệnh nhân chỉ thao tác trên hồ sơ của mình).
 *
 * Tách bảng quyền khỏi middleware giúp: (1) test được, (2) sau này chuyển sang lưu DB
 * (bảng roles/permissions) mà không phải sửa route.
 */
export type Role = 'ADMIN' | 'DOCTOR' | 'TECHNICIAN' | 'RECEPTIONIST' | 'PHARMACIST' | 'PATIENT';

export const PERMISSIONS = [
  // Lịch hẹn
  'appointment:read:any',
  'appointment:read:own',
  'appointment:create:any', // Lễ tân đặt cho bất kỳ bệnh nhân
  'appointment:create:own', // Bệnh nhân tự đặt
  'appointment:update:any', // Đổi giờ, check-in, đổi trạng thái
  'appointment:cancel:own',
  'schedule:manage', // Quản lý ca trực
  // Hồ sơ bệnh án
  'patient:read',
  'patient:write',
  'emr:read',
  'emr:write',
  'pain:read:own',
  'pain:write',
  'pain:write:own', // Bệnh nhân tự báo mức đau qua portal
  'order:write', // Chỉ định CLS
  'prescription:write',
  'procedure:write',
  // Dược & kho
  'inventory:read',
  'inventory:manage',
  'prescription:dispense',
  // Thu ngân & báo cáo
  'billing:manage',
  'report:view',
  // Hệ thống
  'user:manage',
  'audit:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const CLINICAL_READ: Permission[] = ['patient:read', 'emr:read', 'appointment:read:any'];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS, // toàn quyền
  DOCTOR: [
    ...CLINICAL_READ,
    'patient:write',
    'emr:write',
    'pain:write',
    'order:write',
    'prescription:write',
    'procedure:write',
    'appointment:update:any',
    'inventory:read',
    'report:view',
  ],
  TECHNICIAN: [...CLINICAL_READ, 'pain:write', 'procedure:write', 'appointment:update:any', 'inventory:read'],
  RECEPTIONIST: [
    'patient:read',
    'patient:write',
    'appointment:read:any',
    'appointment:create:any',
    'appointment:update:any',
    'schedule:manage',
    'billing:manage',
  ],
  PHARMACIST: ['patient:read', 'inventory:read', 'inventory:manage', 'prescription:dispense'],
  PATIENT: ['appointment:read:own', 'appointment:create:own', 'appointment:cancel:own', 'pain:read:own', 'pain:write:own'],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function hasAnyPermission(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}
