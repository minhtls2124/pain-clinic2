export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppError(400, code, message, details);
export const unauthorized = (message = 'Chưa đăng nhập hoặc phiên đã hết hạn') =>
  new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Bạn không có quyền thực hiện thao tác này') =>
  new AppError(403, 'FORBIDDEN', message);
export const notFound = (entity: string) => new AppError(404, 'NOT_FOUND', `${entity} không tồn tại`);
export const conflict = (code: string, message: string, details?: unknown) =>
  new AppError(409, code, message, details);
export const unprocessable = (code: string, message: string, details?: unknown) =>
  new AppError(422, code, message, details);

/** PostgreSQL SQLSTATE 23P01 = exclusion_violation (ràng buộc chống trùng lịch ở tầng DB). */
export function isExclusionViolation(err: unknown): boolean {
  const text = err instanceof Error ? `${err.message} ${JSON.stringify(err)}` : String(err);
  return text.includes('23P01') || text.includes('violates exclusion constraint');
}
