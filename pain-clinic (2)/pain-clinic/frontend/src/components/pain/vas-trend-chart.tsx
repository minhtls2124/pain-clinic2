'use client';

import { Activity, Syringe, TrendingDown, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CONTEXT_LABEL,
  IMPROVEMENT_THRESHOLDS,
  SEVERITY_BANDS,
  SEVERITY_META,
  percentChange,
  severityOf,
} from '@/lib/pain';
import { cn, formatShortDate } from '@/lib/utils';
import type { PainPoint, ProcedureMarker } from '@/types/api';

/**
 * Biểu đồ theo dõi cơn đau VAS/NRS (0–10) theo thời gian.
 * - Nền chia dải mức độ: nhẹ / vừa / nặng
 * - Mốc thủ thuật can thiệp (tiêm NMC, phong bế...) → thấy ngay hiệu quả từng lần can thiệp
 * - Đường tham chiếu −30% / −50% so với điểm ban đầu (ngưỡng cải thiện có ý nghĩa lâm sàng)
 * - Phân biệt điểm đo tại phòng khám và điểm bệnh nhân tự báo
 * SVG thuần, không phụ thuộc thư viện biểu đồ → nhẹ, kiểm soát tuyệt đối, dễ in ấn.
 */

type RangeKey = '30' | '90' | 'all';
const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: '30', label: '30 ngày', days: 30 },
  { key: '90', label: '90 ngày', days: 90 },
  { key: 'all', label: 'Tất cả', days: null },
];

const M = { top: 34, right: 52, bottom: 30, left: 34 }; // lề biểu đồ (px)
const DAY = 86_400_000;

interface Props {
  points: PainPoint[];
  procedures?: ProcedureMarker[];
  title?: string;
  height?: number;
  className?: string;
}

export function VasTrendChart({ points, procedures = [], title = 'Diễn biến mức độ đau', height = 300, className }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(wrapRef);
  const [range, setRange] = useState<RangeKey>('all');
  const [hover, setHover] = useState<number | null>(null);

  const sorted = useMemo(
    () => [...points].sort((a, b) => +new Date(a.recordedAt) - +new Date(b.recordedAt)),
    [points],
  );

  // Điểm ban đầu: lần BASELINE đầu tiên, nếu không có thì điểm sớm nhất (tính trên TOÀN BỘ dữ liệu)
  const baseline = sorted.find((p) => p.context === 'BASELINE') ?? sorted[0];
  const latest = sorted[sorted.length - 1];

  const { visible, visibleProcs, xMin, xMax } = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)?.days ?? null;
    const lastT = latest ? +new Date(latest.recordedAt) : Date.now();
    const from = days ? lastT - days * DAY : -Infinity;
    const vis = sorted.filter((p) => +new Date(p.recordedAt) >= from);
    const procs = procedures.filter((p) => +new Date(p.performedAt) >= from);
    const times = [...vis.map((p) => +new Date(p.recordedAt)), ...procs.map((p) => +new Date(p.performedAt))];
    const min = days ? lastT - days * DAY : Math.min(...times, lastT);
    const max = Math.max(...times, min + DAY);
    const pad = (max - min) * 0.03;
    return { visible: vis, visibleProcs: procs, xMin: min - pad, xMax: max + pad };
  }, [sorted, procedures, range, latest]);

  const innerW = Math.max(0, width - M.left - M.right);
  const innerH = height - M.top - M.bottom;
  const x = (t: number) => M.left + ((t - xMin) / (xMax - xMin || 1)) * innerW;
  const y = (score: number) => M.top + (1 - score / 10) * innerH;

  const coords = visible.map((p) => ({ p, cx: x(+new Date(p.recordedAt)), cy: y(p.score) }));
  const linePath = coords.map((c, i) => `${i ? 'L' : 'M'}${c.cx.toFixed(1)},${c.cy.toFixed(1)}`).join(' ');
  const areaPath =
    coords.length > 1
      ? `${linePath} L${coords[coords.length - 1]!.cx.toFixed(1)},${y(0)} L${coords[0]!.cx.toFixed(1)},${y(0)} Z`
      : '';

  const xTicks = useMemo(() => timeTicks(xMin, xMax, innerW < 420 ? 4 : 6), [xMin, xMax, innerW]);
  const change = baseline && latest ? percentChange(baseline.score, latest.score) : null;
  const hovered = hover !== null ? coords[hover] : undefined;

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (coords.length === 0) return;
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    let best = 0;
    for (let i = 1; i < coords.length; i++) {
      if (Math.abs(coords[i]!.cx - px) < Math.abs(coords[best]!.cx - px)) best = i;
    }
    setHover(best);
  }

  return (
    <section className={cn('rounded-2xl border border-line bg-white shadow-sm', className)} aria-label={title}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Activity className="size-4 text-brand" aria-hidden />
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            Thang VAS/NRS 0–10{baseline ? ` · ${baseline.bodyRegion}` : ''}
          </p>
        </div>
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm" role="tablist" aria-label="Khoảng thời gian">
          {RANGES.map((r) => (
            <button
              key={r.key}
              role="tab"
              aria-selected={range === r.key}
              onClick={() => setRange(r.key)}
              className={cn(
                'rounded-md px-3 py-1.5 font-medium transition-colors',
                range === r.key ? 'bg-white text-brand shadow-sm' : 'text-slate-600 hover:text-ink',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chỉ số tóm tắt */}
      <dl className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
        <Stat label="Hiện tại">
          {latest ? (
            <span className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold">{latest.score.toFixed(1)}</span>
              <SeverityBadge score={latest.score} />
            </span>
          ) : (
            '—'
          )}
        </Stat>
        <Stat label="Ban đầu">
          {baseline ? (
            <span className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold">{baseline.score.toFixed(1)}</span>
              <span className="text-xs text-muted">{formatShortDate(baseline.recordedAt)}</span>
            </span>
          ) : (
            '—'
          )}
        </Stat>
        <Stat label="Thay đổi">
          {change === null ? (
            '—'
          ) : (
            <span
              className={cn(
                'flex items-center gap-1.5 text-2xl font-semibold',
                change <= -30 ? 'text-pain-mild' : change > 0 ? 'text-pain-severe' : 'text-ink',
              )}
            >
              {change <= 0 ? <TrendingDown className="size-5" aria-hidden /> : <TrendingUp className="size-5" aria-hidden />}
              {change > 0 ? '+' : ''}
              {change.toFixed(0)}%
            </span>
          )}
        </Stat>
        <Stat label="Đánh giá / Thủ thuật">
          <span className="text-2xl font-semibold">
            {points.length}
            <span className="mx-1 text-slate-300">/</span>
            {procedures.length}
          </span>
        </Stat>
      </dl>
      {change !== null && change <= -30 && (
        <p className="border-t border-line bg-emerald-50/60 px-5 py-2 text-sm text-emerald-800">
          Đã đạt mức cải thiện có ý nghĩa lâm sàng (giảm ≥ 30% so với ban đầu).
        </p>
      )}

      {/* Biểu đồ */}
      <div ref={wrapRef} className="relative px-1 pt-2 pb-1 select-none">
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`${title}: ${visible.length} lần đánh giá, mới nhất ${latest?.score ?? '—'}/10`}
            onPointerMove={onPointerMove}
            onPointerLeave={() => setHover(null)}
            className="touch-pan-y"
          >
            <defs>
              <linearGradient id="vas-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.18" />
                <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Dải mức độ đau */}
            {SEVERITY_BANDS.map((b) => (
              <g key={b.severity}>
                <rect
                  x={M.left}
                  width={innerW}
                  y={y(b.to)}
                  height={y(b.from) - y(b.to)}
                  fill={SEVERITY_META[b.severity].color}
                  opacity={0.05}
                />
                <text
                  x={M.left + innerW + 6}
                  y={(y(b.to) + y(b.from)) / 2}
                  dominantBaseline="middle"
                  className="text-[10px] font-medium"
                  fill={SEVERITY_META[b.severity].color}
                >
                  {SEVERITY_META[b.severity].label.replace('Đau ', '')}
                </text>
              </g>
            ))}

            {/* Lưới ngang & trục Y */}
            {[0, 2, 4, 6, 8, 10].map((v) => (
              <g key={v}>
                <line x1={M.left} x2={M.left + innerW} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeDasharray={v === 0 ? undefined : '2 4'} />
                <text x={M.left - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" className="fill-slate-500 text-[11px]">
                  {v}
                </text>
              </g>
            ))}

            {/* Trục X */}
            {xTicks.map((t) => (
              <text key={t} x={x(t)} y={height - 8} textAnchor="middle" className="fill-slate-500 text-[11px]">
                {formatShortDate(new Date(t))}
              </text>
            ))}

            {/* Ngưỡng cải thiện −30% / −50% */}
            {baseline &&
              IMPROVEMENT_THRESHOLDS.map((th) => {
                const yy = y(baseline.score * (1 - th.ratio));
                return (
                  <g key={th.label}>
                    <line x1={M.left} x2={M.left + innerW} y1={yy} y2={yy} stroke="var(--color-pain-mild)" strokeDasharray="6 4" strokeOpacity={0.7} />
                    <text x={M.left + 4} y={yy - 4} className="text-[10px] font-medium" fill="var(--color-pain-mild)" stroke="white" strokeWidth={3} paintOrder="stroke">
                      {th.label} ban đầu
                    </text>
                  </g>
                );
              })}

            {/* Mốc thủ thuật */}
            {visibleProcs.map((p, i) => {
              const px = x(+new Date(p.performedAt));
              return (
                <g key={p.id}>
                  <title>{p.label}</title>
                  <line x1={px} x2={px} y1={M.top - 6} y2={y(0)} stroke="var(--color-brand-accent)" strokeDasharray="3 3" strokeOpacity={0.8} />
                  <circle cx={px} cy={M.top - 16} r={10} fill="var(--color-brand-accent)" />
                  <text x={px} y={M.top - 16} textAnchor="middle" dominantBaseline="central" className="fill-white text-[11px] font-semibold">
                    {procedures.indexOf(p) + 1 || i + 1}
                  </text>
                </g>
              );
            })}

            {/* Đường xu hướng */}
            {areaPath && <path d={areaPath} fill="url(#vas-area)" />}
            {coords.length > 1 && (
              <path d={linePath} fill="none" stroke="var(--color-brand)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            )}

            {/* Đường dóng khi hover */}
            {hovered && (
              <line x1={hovered.cx} x2={hovered.cx} y1={M.top} y2={y(0)} stroke="var(--color-brand)" strokeOpacity={0.25} />
            )}

            {/* Điểm đo */}
            {coords.map((c, i) => {
              const self = c.p.context === 'SELF_REPORT';
              const active = i === hover;
              return (
                <circle
                  key={c.p.id}
                  cx={c.cx}
                  cy={c.cy}
                  r={active ? 6 : 4.5}
                  fill={self ? 'white' : 'var(--color-brand)'}
                  stroke={self ? 'var(--color-brand-accent)' : 'white'}
                  strokeWidth={self ? 2 : 1.5}
                  strokeDasharray={self ? '2 1.5' : undefined}
                />
              );
            })}
          </svg>
        )}

        {/* Tooltip */}
        {hovered && (
          <div
            className="pointer-events-none absolute z-10 w-52 rounded-xl border border-line bg-white/95 p-3 text-sm shadow-lg backdrop-blur"
            style={{
              left: Math.min(Math.max(hovered.cx - 104, 4), Math.max(4, width - 212)),
              top: Math.max(hovered.cy - 118, 0),
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">{formatShortDate(hovered.p.recordedAt)}</span>
              <span className="text-xs text-muted">{CONTEXT_LABEL[hovered.p.context]}</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-semibold text-ink">{hovered.p.score.toFixed(1)}</span>
              <span className="text-xs text-muted">/10 · {hovered.p.scale}</span>
              <SeverityBadge score={hovered.p.score} className="ml-auto" />
            </div>
            {hovered.p.note && <p className="mt-1.5 line-clamp-2 text-xs text-slate-600">{hovered.p.note}</p>}
          </div>
        )}
      </div>

      {/* Chú giải + danh sách thủ thuật (dễ đọc trên mobile hơn nhãn trong biểu đồ) */}
      <div className="flex flex-col gap-3 border-t border-line px-5 py-4 text-sm">
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-muted">
          <LegendDot className="bg-brand" label="Đo tại phòng khám" />
          <LegendDot className="border-2 border-dashed border-brand-accent bg-white" label="Bệnh nhân tự báo" />
          <li className="flex items-center gap-1.5">
            <span className="h-0 w-4 border-t-2 border-dashed border-pain-mild" aria-hidden />
            Ngưỡng cải thiện
          </li>
        </ul>
        {procedures.length > 0 && (
          <ol className="space-y-1.5">
            {procedures.map((p, i) => (
              <li key={p.id} className="flex items-start gap-2 text-slate-700">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-accent text-[11px] font-semibold text-white">
                  {i + 1}
                </span>
                <Syringe className="mt-0.5 size-3.5 shrink-0 text-brand-accent" aria-hidden />
                <span>
                  <span className="font-medium">{p.label}</span>
                  <span className="whitespace-nowrap text-muted"> · {formatShortDate(p.performedAt)}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Bảng dữ liệu ẩn cho trình đọc màn hình */}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>Ngày</th>
            <th>Điểm</th>
            <th>Bối cảnh</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((p) => (
            <tr key={p.id}>
              <td>{formatShortDate(p.recordedAt)}</td>
              <td>{p.score}</td>
              <td>{CONTEXT_LABEL[p.context]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white px-5 py-3">
      <dt className="text-xs font-medium tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-1 text-ink">{children}</dd>
    </div>
  );
}

export function SeverityBadge({ score, className }: { score: number; className?: string }) {
  const meta = SEVERITY_META[severityOf(score)];
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', meta.badge, className)}>
      {meta.label}
    </span>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={cn('size-2.5 rounded-full', className)} aria-hidden />
      {label}
    </li>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function useElementWidth(ref: React.RefObject<HTMLElement | null>) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => entry && setW(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** Mốc trục thời gian: chia đều theo ngày, làm tròn về 0h. */
function timeTicks(min: number, max: number, count: number): number[] {
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) return [];
  const stepDays = Math.max(1, Math.round(span / DAY / count));
  const start = Math.ceil(min / DAY) * DAY;
  const ticks: number[] = [];
  for (let t = start; t <= max; t += stepDays * DAY) ticks.push(t);
  return ticks;
}
