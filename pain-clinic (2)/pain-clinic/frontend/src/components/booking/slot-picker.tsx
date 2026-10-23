'use client';

import { CircleAlert, CalendarCheck2, CircleCheck, Clock, LoaderCircle, Stethoscope, Sun, Sunset } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ApiError, createAppointment, getAvailability } from '@/lib/api';
import { clinicHour, cn, formatFullDate, formatTime, formatVnd, toClinicYmd } from '@/lib/utils';
import type { AppointmentDto, ProviderOption, ServiceOption, Slot } from '@/types/api';

/**
 * Đặt lịch khám trực tuyến (mobile-first).
 * Lớp chống trùng lịch thứ nhất: chỉ hiển thị khung giờ còn trống từ API availability.
 * Nếu giữa lúc chọn và lúc xác nhận có người khác đặt mất → API trả 409 kèm gợi ý giờ gần nhất.
 */
interface Props {
  services: ServiceOption[];
  providers: ProviderOption[];
  days?: number;
}

export function SlotPicker({ services, providers, days = 14 }: Props) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const [providerId, setProviderId] = useState(providers[0]?.id ?? '');
  const dates = useMemo(() => upcomingDates(days), [days]);
  const [date, setDate] = useState(dates[0] ?? '');
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [conflict, setConflict] = useState<{ message: string; suggestions: Slot[] } | null>(null);
  const [booked, setBooked] = useState<AppointmentDto | null>(null);

  const service = services.find((s) => s.id === serviceId);
  const provider = providers.find((p) => p.id === providerId);

  useEffect(() => {
    if (!serviceId || !providerId || !date) return;
    let cancelled = false;
    setSlots(null);
    setLoadError(null);
    getAvailability({ providerId, serviceId, date })
      .then((a) => {
        if (cancelled) return;
        setSlots(a.slots);
        // Giữ lựa chọn nếu vẫn còn trống (vd: chọn từ gợi ý sang ngày khác), ngược lại bỏ chọn
        setSelected((prev) => (prev && a.slots.some((s) => s.startAt === prev.startAt) ? prev : null));
      })
      .catch((e: unknown) => !cancelled && setLoadError(e instanceof Error ? e.message : 'Không tải được lịch trống'));
    return () => {
      cancelled = true;
    };
  }, [serviceId, providerId, date]);

  const groups = useMemo(() => {
    const morning = (slots ?? []).filter((s) => clinicHour(s.startAt) < 12);
    const afternoon = (slots ?? []).filter((s) => clinicHour(s.startAt) >= 12);
    return [
      { key: 'am', label: 'Buổi sáng', icon: Sun, items: morning },
      { key: 'pm', label: 'Buổi chiều', icon: Sunset, items: afternoon },
    ];
  }, [slots]);

  async function submit() {
    if (!selected || !service || !provider) return;
    setSubmitting(true);
    setConflict(null);
    try {
      const appt = await createAppointment({
        providerId,
        serviceId,
        startAt: selected.startAt,
        reason: reason.trim() || undefined,
      });
      setBooked(appt);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setConflict({ message: e.message, suggestions: e.suggestions });
        setSlots((prev) => prev?.filter((s) => s.startAt !== selected.startAt) ?? prev); // bỏ slot vừa mất
        setSelected(null);
      } else {
        setConflict({ message: e instanceof Error ? e.message : 'Đặt lịch thất bại', suggestions: [] });
      }
    } finally {
      setSubmitting(false);
    }
  }

  function pickSuggestion(s: Slot) {
    const ymd = toClinicYmd(s.startAt);
    if (ymd !== date) setDate(ymd);
    setSelected(s);
    setConflict(null);
  }

  // ── Màn hình thành công ───────────────────────────────────────────────────
  if (booked && service && provider) {
    return (
      <div className="rounded-2xl border border-line bg-white p-6 text-center shadow-sm">
        <CircleCheck className="mx-auto size-12 text-pain-mild" aria-hidden />
        <h2 className="mt-3 text-lg font-semibold">Đặt lịch thành công</h2>
        <p className="mt-1 text-sm text-muted">Mã lịch hẹn của bạn</p>
        <p className="mt-1 font-mono text-lg font-semibold tracking-wider text-brand">{booked.code}</p>
        <dl className="mt-5 space-y-2 rounded-xl bg-canvas p-4 text-left text-sm">
          <Row label="Dịch vụ" value={service.name} />
          <Row label="Bác sĩ" value={`${provider.title} ${provider.name}`} />
          <Row label="Thời gian" value={`${formatTime(booked.startAt)} · ${formatFullDate(booked.startAt)}`} />
        </dl>
        <p className="mt-4 text-sm text-muted">
          Tin nhắn xác nhận đã được gửi tới số điện thoại của bạn. Vui lòng đến trước 15 phút và mang theo thẻ BHYT, phim
          chụp/kết quả xét nghiệm cũ (nếu có).
        </p>
        <button
          onClick={() => {
            setBooked(null);
            setSelected(null);
            setReason('');
          }}
          className="mt-5 w-full rounded-xl border border-line px-4 py-2.5 text-sm font-medium hover:bg-canvas"
        >
          Đặt thêm lịch khác
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-28 sm:pb-0">
      {/* 1. Dịch vụ */}
      <Section step={1} title="Chọn dịch vụ">
        <div className="grid gap-2">
          {services.map((s) => (
            <Choice key={s.id} active={s.id === serviceId} onClick={() => setServiceId(s.id)}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">{s.name}</p>
                  {s.description && <p className="mt-0.5 text-xs text-muted">{s.description}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-ink">{formatVnd(s.price)}</p>
                  <p className="mt-0.5 flex items-center justify-end gap-1 text-xs text-muted">
                    <Clock className="size-3" aria-hidden /> {s.durationMin} phút
                  </p>
                </div>
              </div>
            </Choice>
          ))}
        </div>
      </Section>

      {/* 2. Bác sĩ */}
      <Section step={2} title="Chọn bác sĩ">
        <div className="grid gap-2 sm:grid-cols-2">
          {providers.map((p) => (
            <Choice key={p.id} active={p.id === providerId} onClick={() => setProviderId(p.id)}>
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand">
                  {initials(p.name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">
                    {p.title} {p.name}
                  </p>
                  <p className="truncate text-xs text-muted">{p.specialty}</p>
                </div>
              </div>
            </Choice>
          ))}
        </div>
      </Section>

      {/* 3. Ngày */}
      <Section step={3} title="Chọn ngày">
        <div className="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {dates.map((d) => {
            const dt = new Date(`${d}T12:00:00+07:00`);
            const active = d === date;
            return (
              <button
                key={d}
                onClick={() => setDate(d)}
                aria-pressed={active}
                className={cn(
                  'flex w-16 shrink-0 snap-start flex-col items-center rounded-xl border py-2 transition-colors',
                  active ? 'border-brand bg-brand text-white shadow-sm' : 'border-line bg-white hover:border-brand/40',
                )}
              >
                <span className={cn('text-[11px] font-medium uppercase', active ? 'text-blue-100' : 'text-muted')}>
                  {weekdayShort(dt)}
                </span>
                <span className="text-lg leading-tight font-semibold">{dt.getUTCDate()}</span>
                <span className={cn('text-[11px]', active ? 'text-blue-100' : 'text-muted')}>Th{dt.getUTCMonth() + 1}</span>
              </button>
            );
          })}
        </div>
      </Section>

      {/* 4. Giờ */}
      <Section step={4} title="Chọn giờ khám">
        {conflict && (
          <div role="alert" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="flex items-start gap-2 font-medium">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {conflict.message}
            </p>
            {conflict.suggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
                <span className="text-xs">Giờ trống gần nhất:</span>
                {conflict.suggestions.map((s) => (
                  <button
                    key={s.startAt}
                    onClick={() => pickSuggestion(s)}
                    className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    {formatTime(s.startAt)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {loadError ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{loadError}</p>
        ) : slots === null ? (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" aria-busy="true" aria-label="Đang tải lịch trống">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : slots.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-white p-6 text-center text-sm text-muted">
            <CalendarCheck2 className="mx-auto mb-2 size-6 text-slate-400" aria-hidden />
            Ngày này không còn khung giờ trống. Vui lòng chọn ngày khác.
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map(
              (g) =>
                g.items.length > 0 && (
                  <div key={g.key}>
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted uppercase">
                      <g.icon className="size-3.5" aria-hidden /> {g.label}
                      <span className="text-slate-400 normal-case">· {g.items.length} khung giờ trống</span>
                    </p>
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                      {g.items.map((s) => {
                        const active = selected?.startAt === s.startAt;
                        return (
                          <button
                            key={s.startAt}
                            onClick={() => setSelected(s)}
                            aria-pressed={active}
                            className={cn(
                              'h-10 rounded-lg border text-sm font-medium tabular-nums transition-colors',
                              active
                                ? 'border-brand bg-brand text-white shadow-sm'
                                : 'border-line bg-white text-ink hover:border-brand hover:text-brand',
                            )}
                          >
                            {formatTime(s.startAt)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ),
            )}
          </div>
        )}
      </Section>

      {/* 5. Lý do */}
      <Section step={5} title="Triệu chứng / lý do khám" optional>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="VD: Đau thắt lưng lan xuống chân trái 3 tháng nay, tê bì về đêm…"
          className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
        />
      </Section>

      {/* Thanh xác nhận: dính đáy trên mobile */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] backdrop-blur sm:pb-4 sm:static sm:rounded-2xl sm:border sm:px-5 sm:py-4 sm:shadow-sm">
        <div className="mx-auto flex max-w-xl items-center gap-3 sm:max-w-none">
          <div className="min-w-0 flex-1 text-sm">
            {selected ? (
              <>
                <p className="flex items-center gap-1.5 font-semibold text-ink">
                  <Stethoscope className="size-4 text-brand" aria-hidden />
                  {formatTime(selected.startAt)} · {formatFullDate(selected.startAt)}
                </p>
                <p className="truncate text-xs text-muted">
                  {service?.name} · {provider?.title} {provider?.name}
                </p>
              </>
            ) : (
              <p className="text-muted">Chọn một khung giờ để tiếp tục</p>
            )}
          </div>
          <button
            onClick={submit}
            disabled={!selected || submitting}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitting && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            Xác nhận đặt lịch
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components & helpers ────────────────────────────────────────────────

function Section({ step, title, optional, children }: { step: number; title: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="grid size-5 place-items-center rounded-full bg-brand-soft text-[11px] text-brand">{step}</span>
        {title}
        {optional && <span className="font-normal text-muted">(không bắt buộc)</span>}
      </h3>
      {children}
    </section>
  );
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'w-full rounded-xl border bg-white p-3.5 text-left transition-all',
        active ? 'border-brand ring-2 ring-brand/15' : 'border-line hover:border-brand/40',
      )}
    >
      {children}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}

const initials = (name: string) =>
  name
    .split(' ')
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const weekdayShort = (d: Date) => WEEKDAYS[d.getUTCDay()] ?? '';

/** N ngày làm việc kế tiếp (bỏ Chủ nhật) theo giờ phòng khám; sau 15h bắt đầu từ ngày mai. */
function upcomingDates(n: number): string[] {
  const out: string[] = [];
  const startOffset = clinicHour(new Date()) >= 15 ? 1 : 0;
  for (let i = startOffset; out.length < n && i < n * 2 + 1; i++) {
    const ymd = toClinicYmd(new Date(Date.now() + i * 86_400_000));
    if (new Date(`${ymd}T12:00:00+07:00`).getUTCDay() !== 0) out.push(ymd);
  }
  return out;
}
