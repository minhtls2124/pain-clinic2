// Kiểu dữ liệu khớp với response của backend (src/modules/*/routes.ts)

export type PainContext = 'BASELINE' | 'PRE_PROCEDURE' | 'POST_PROCEDURE' | 'FOLLOW_UP' | 'SELF_REPORT';

export interface PainPoint {
  id: string;
  scale: 'VAS' | 'NRS';
  score: number; // 0–10
  bodyRegion: string;
  context: PainContext;
  recordedAt: string; // ISO
  note?: string | null;
}

export interface ProcedureMarker {
  id: string;
  type: string;
  label: string;
  performedAt: string; // ISO
}

export interface PainSeries {
  points: PainPoint[];
  procedures: ProcedureMarker[];
}

export interface ServiceOption {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  description?: string;
}

export interface ProviderOption {
  id: string;
  name: string;
  title: string;
  specialty: string;
}

export interface Slot {
  startAt: string;
  endAt: string;
}

export interface Availability {
  date: string;
  durationMin: number;
  slots: Slot[];
}

export interface AppointmentDto {
  id: string;
  code: string;
  startAt: string;
  endAt: string;
  status: string;
  service: { name: string };
  provider: { title: string | null; user: { fullName: string } };
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: { suggestions?: Slot[] } & Record<string, unknown> };
}
