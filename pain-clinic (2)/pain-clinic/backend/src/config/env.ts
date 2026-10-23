import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET phải dài tối thiểu 32 ký tự'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  CLINIC_UTC_OFFSET: z
    .string()
    .regex(/^[+-]\d{2}:\d{2}$/, 'Định dạng ±HH:MM')
    .default('+07:00'),
  ONLINE_MIN_LEAD_MINUTES: z.coerce.number().int().min(0).default(120),
  SLOT_STEP_MINUTES: z.coerce.number().int().min(5).max(60).default(15),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('✖ Biến môi trường không hợp lệ:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
