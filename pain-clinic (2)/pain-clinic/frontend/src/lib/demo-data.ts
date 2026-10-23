/**
 * Dữ liệu mẫu cho chế độ NEXT_PUBLIC_DEMO_MODE=1 — xem giao diện mà không cần backend.
 * Khớp với prisma/seed.ts của backend.
 */
import type { Availability, PainPoint, PainSeries, ProviderOption, ServiceOption, Slot } from '@/types/api';

const DAY = 86_400_000;
const ago = (d: number, h = 9) => new Date(Date.now() - d * DAY + (h - 9) * 3_600_000).toISOString();

export const demoPatient = {
  id: 'demo',
  code: 'BN-000001',
  fullName: 'Hoàng Văn Nam',
  age: 55,
  gender: 'Nam',
  phone: '0912 345 678',
  insuranceNo: 'DN4010123456789',
  diagnosis: 'M51.1 · Thoát vị đĩa đệm L4-L5 có bệnh lý rễ',
  allergies: ['Iod cản quang (mề đay)'],
};

const raw: [number, number, PainSeries['points'][number]['context'], string?][] = [
  [84, 8.2, 'BASELINE', 'Đau lan mặt sau đùi – cẳng chân trái, tê ngón cái'],
  [77, 7.9, 'FOLLOW_UP'],
  [70, 8.0, 'PRE_PROCEDURE'],
  [69, 5.5, 'POST_PROCEDURE', 'Giảm đau rõ sau 24h, đi lại được'],
  [63, 5.0, 'SELF_REPORT'],
  [56, 4.6, 'FOLLOW_UP'],
  [42, 5.2, 'SELF_REPORT', 'Đau tăng sau chuyến lái xe đường dài'],
  [35, 5.8, 'PRE_PROCEDURE'],
  [34, 3.6, 'POST_PROCEDURE'],
  [21, 3.1, 'FOLLOW_UP'],
  [10, 2.8, 'SELF_REPORT'],
  [3, 2.5, 'FOLLOW_UP', 'Duy trì VLTL 3 buổi/tuần'],
];

export const demoPainSeries: PainSeries = {
  points: raw.map(([d, score, context, note], i): PainPoint => ({
    id: `p${i}`,
    scale: 'VAS',
    score,
    bodyRegion: 'Thắt lưng – chân trái',
    context,
    recordedAt: ago(d),
    note: note ?? null,
  })),
  procedures: [
    { id: 'pr1', type: 'EPIDURAL_STEROID_INJECTION', label: 'Tiêm ngoài màng cứng · L4-L5 · Trái', performedAt: ago(70, 10) },
    { id: 'pr2', type: 'NERVE_BLOCK', label: 'Phong bế rễ L5 dưới siêu âm · Trái', performedAt: ago(35, 10) },
  ],
};

export const demoServices: ServiceOption[] = [
  { id: 'svc-kb', name: 'Khám chuyên khoa đau (lần đầu)', durationMin: 30, price: 300_000, description: 'Đánh giá toàn diện, đo VAS, tư vấn hướng điều trị' },
  { id: 'svc-tk', name: 'Tái khám', durationMin: 15, price: 200_000, description: 'Theo dõi đáp ứng điều trị' },
  { id: 'svc-vltl', name: 'Vật lý trị liệu', durationMin: 45, price: 250_000, description: 'Sóng ngắn, kéo giãn, bài tập vận động' },
];

export const demoProviders: ProviderOption[] = [
  { id: 'dr-lan', name: 'Trần Thị Lan', title: 'BSCKII', specialty: 'Gây mê hồi sức – Điều trị đau' },
  { id: 'dr-minh', name: 'Lê Quang Minh', title: 'ThS.BS', specialty: 'Phục hồi chức năng' },
];

/** Sinh slot giả lập: ca 07:30–11:30 & 13:30–17:00, một số giờ đã kín (cố định theo ngày). */
export function demoAvailability(date: string, durationMin: number): Availability {
  const slots: Slot[] = [];
  const seed = Number(date.replace(/-/g, '')) % 7;
  const blocks: [string, string][] = [
    ['07:30', '11:30'],
    ['13:30', '17:00'],
  ];
  for (const [from, to] of blocks) {
    let t = new Date(`${date}T${from}:00+07:00`).getTime();
    const end = new Date(`${date}T${to}:00+07:00`).getTime();
    let i = 0;
    for (; t + durationMin * 60_000 <= end; t += 15 * 60_000, i++) {
      if ((i + seed) % 5 === 0 || (i + seed) % 7 === 0) continue; // đã có người đặt
      if (t < Date.now() + 2 * 3_600_000) continue; // lead time 2h
      slots.push({ startAt: new Date(t).toISOString(), endAt: new Date(t + durationMin * 60_000).toISOString() });
    }
  }
  return { date, durationMin, slots };
}
