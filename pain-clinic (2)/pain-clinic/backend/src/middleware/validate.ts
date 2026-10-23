import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';

/**
 * Validate body/query/params bằng Zod. Kết quả đã parse (đã coerce kiểu) lưu ở res.locals
 * để controller dùng bản sạch thay vì req.* thô.
 */
export function validate<T extends ZodTypeAny>(source: 'body' | 'query' | 'params', schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) return next(result.error); // error-handler chuyển ZodError → 422
    res.locals[source] = result.data;
    next();
  };
}

export const parsed = <T extends ZodTypeAny>(res: Response, source: 'body' | 'query' | 'params', _schema: T) =>
  res.locals[source] as z.infer<T>;
