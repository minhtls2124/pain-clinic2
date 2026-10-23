import type { ApiErrorBody, AppointmentDto, Availability, PainSeries, Slot } from '@/types/api';
import { demoAvailability, demoPainSeries } from './demo-data';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
// Bật demo khi đặt =1, hoặc khi chưa cấu hình gì cả (vd: deploy Vercel lần đầu chưa có backend)
export const DEMO =
  process.env.NEXT_PUBLIC_DEMO_MODE === '1' ||
  (process.env.NEXT_PUBLIC_DEMO_MODE === undefined && process.env.NEXT_PUBLIC_API_URL === undefined);

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public suggestions: Slot[] = [],
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers, ...rest } = init;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    cache: 'no-store', // dữ liệu y tế: không cache ở tầng fetch
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      res.status,
      body?.error.code ?? 'HTTP_ERROR',
      body?.error.message ?? `Lỗi ${res.status}`,
      body?.error.details?.suggestions ?? [],
    );
  }
  return res.json() as Promise<T>;
}

/** Token: client đọc từ localStorage (demo). Production nên dùng cookie httpOnly + route handler. */
export const getClientToken = () => (typeof window === 'undefined' ? undefined : localStorage.getItem('pc_token') ?? undefined);

export async function getPainSeries(patientId: string, token?: string): Promise<PainSeries> {
  if (DEMO) return demoPainSeries;
  return request<PainSeries>(`/patients/${patientId}/pain-series`, { token });
}

export async function getAvailability(params: { providerId: string; serviceId: string; date: string }): Promise<Availability> {
  if (DEMO) {
    await sleep(250);
    return demoAvailability(params.date, 30);
  }
  const qs = new URLSearchParams(params).toString();
  return request<Availability>(`/appointments/availability?${qs}`, { token: getClientToken() });
}

export async function createAppointment(body: {
  providerId: string;
  serviceId: string;
  startAt: string;
  reason?: string;
}): Promise<AppointmentDto> {
  if (DEMO) {
    await sleep(500);
    // Giả lập tình huống "vừa có người đặt mất" để thấy luồng 409 + gợi ý giờ khác
    if (new Date(body.startAt).getUTCMinutes() === 45) {
      const t = new Date(body.startAt).getTime();
      throw new ApiError(409, 'SCHEDULE_CONFLICT', 'Khung giờ này vừa có người đặt, vui lòng chọn giờ khác', [
        { startAt: new Date(t - 30 * 60_000).toISOString(), endAt: new Date(t).toISOString() },
        { startAt: new Date(t + 30 * 60_000).toISOString(), endAt: new Date(t + 60 * 60_000).toISOString() },
      ]);
    }
    return {
      id: 'demo-appt',
      code: `LH-${body.startAt.slice(0, 10).replace(/-/g, '')}-DEMO01`,
      startAt: body.startAt,
      endAt: new Date(new Date(body.startAt).getTime() + 30 * 60_000).toISOString(),
      status: 'CONFIRMED',
      service: { name: '' },
      provider: { title: null, user: { fullName: '' } },
    };
  }
  const res = await request<{ data: AppointmentDto }>('/appointments', {
    method: 'POST',
    body: JSON.stringify(body),
    token: getClientToken(),
  });
  return res.data;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
