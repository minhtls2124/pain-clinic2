import type { PainContext } from '@/types/api';

export type Severity = 'none' | 'mild' | 'moderate' | 'severe';

/** Phân mức theo quy ước thường dùng cho VAS/NRS 0–10. */
export function severityOf(score: number): Severity {
  if (score <= 0) return 'none';
  if (score < 4) return 'mild';
  if (score < 7) return 'moderate';
  return 'severe';
}

export const SEVERITY_META: Record<Severity, { label: string; color: string; badge: string }> = {
  none: { label: 'Không đau', color: 'var(--color-pain-none)', badge: 'bg-slate-100 text-slate-700 ring-slate-200' },
  mild: { label: 'Đau nhẹ', color: 'var(--color-pain-mild)', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  moderate: { label: 'Đau vừa', color: 'var(--color-pain-moderate)', badge: 'bg-amber-50 text-amber-800 ring-amber-200' },
  severe: { label: 'Đau nặng', color: 'var(--color-pain-severe)', badge: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

/** Các dải nền trên biểu đồ (y từ → đến) */
export const SEVERITY_BANDS: { from: number; to: number; severity: Exclude<Severity, 'none'> }[] = [
  { from: 0, to: 4, severity: 'mild' },
  { from: 4, to: 7, severity: 'moderate' },
  { from: 7, to: 10, severity: 'severe' },
];

export const CONTEXT_LABEL: Record<PainContext, string> = {
  BASELINE: 'Lần đầu',
  PRE_PROCEDURE: 'Trước thủ thuật',
  POST_PROCEDURE: 'Sau thủ thuật',
  FOLLOW_UP: 'Tái khám',
  SELF_REPORT: 'BN tự báo',
};

/**
 * Ngưỡng cải thiện có ý nghĩa lâm sàng cho đau mạn tính (khuyến cáo IMMPACT):
 * giảm ≥ 30% so với ban đầu = cải thiện vừa phải; ≥ 50% = cải thiện đáng kể.
 */
export const IMPROVEMENT_THRESHOLDS = [
  { ratio: 0.3, label: '−30%' },
  { ratio: 0.5, label: '−50%' },
] as const;

export function percentChange(baseline: number, current: number): number | null {
  if (baseline <= 0) return null;
  return ((current - baseline) / baseline) * 100;
}
