import { TriangleAlert, CalendarPlus, FileText, Phone } from 'lucide-react';
import { ClinicShell } from '@/components/layout/clinic-shell';
import { VasTrendChart } from '@/components/pain/vas-trend-chart';
import { getPainSeries } from '@/lib/api';
import { demoPatient } from '@/lib/demo-data';

export const metadata = { title: 'Hồ sơ bệnh nhân' };

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Production: lấy token từ cookie httpOnly — const token = (await cookies()).get('pc_token')?.value
  // Không để lỗi kết nối backend làm sập cả trang; KHÔNG thay bằng dữ liệu mẫu (tránh nhầm hồ sơ thật)
  const series = await getPainSeries(id).catch((err: unknown) => {
    console.error('[patients/:id] getPainSeries failed:', err);
    return null;
  });
  const p = demoPatient; // TODO: GET /patients/:id

  return (
    <ClinicShell active="/patients/demo">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header hồ sơ */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-lg font-semibold text-brand">HN</span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{p.fullName}</h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                <span className="font-mono text-ink">{p.code}</span>
                <span>
                  {p.gender} · {p.age} tuổi
                </span>
                <span className="inline-flex items-center gap-1">
                  <Phone className="size-3.5" aria-hidden />
                  {p.phone}
                </span>
                <span>BHYT {p.insuranceNo}</span>
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3.5 py-2 text-sm font-medium hover:bg-canvas">
              <FileText className="size-4" aria-hidden /> Bệnh án
            </button>
            <button className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-hover">
              <CalendarPlus className="size-4" aria-hidden /> Đặt lịch tái khám
            </button>
          </div>
        </div>

        {/* Cảnh báo dị ứng — luôn hiển thị nổi bật ở đầu hồ sơ */}
        {p.allergies.length > 0 && (
          <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-800">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            <span className="font-semibold">Dị ứng:</span> {p.allergies.join(', ')}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
          {series ? (
            <VasTrendChart points={series.points} procedures={series.procedures} />
          ) : (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
              <p className="font-semibold">Không tải được dữ liệu thang điểm đau</p>
              <p className="mt-1">
                Không kết nối được máy chủ API. Kiểm tra biến môi trường <code>NEXT_PUBLIC_API_URL</code>, hoặc đặt{' '}
                <code>NEXT_PUBLIC_DEMO_MODE=1</code> để chạy bằng dữ liệu mẫu.
              </p>
            </section>
          )}

          <aside className="space-y-4">
            <Card title="Chẩn đoán chính">
              <p className="text-sm text-ink">{p.diagnosis}</p>
            </Card>
            <Card title="Kế hoạch điều trị">
              <ul className="list-disc space-y-1 pl-4 text-sm text-slate-700">
                <li>Pregabalin 75mg × 2 lần/ngày</li>
                <li>Vật lý trị liệu 3 buổi/tuần × 4 tuần</li>
                <li>Mục tiêu: VAS ≤ 3, đi bộ &gt; 30 phút</li>
              </ul>
            </Card>
            <Card title="Lịch hẹn sắp tới">
              <p className="text-sm text-slate-700">Tái khám · BSCKII Trần Thị Lan</p>
              <p className="text-sm text-muted">09:00 thứ Hai tuần tới</p>
            </Card>
          </aside>
        </div>
      </div>
    </ClinicShell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}
