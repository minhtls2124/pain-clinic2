import { ChevronLeft, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { SlotPicker } from '@/components/booking/slot-picker';
import { demoProviders, demoServices } from '@/lib/demo-data';

export const metadata = { title: 'Đặt lịch khám' };

export default function BookingPage() {
  // Production: lấy danh sách từ API (dịch vụ bookableOnline=true, bác sĩ đang hoạt động)
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-[env(safe-area-inset-top,0px)] z-10 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <Link href="/" className="-ml-2 grid size-9 place-items-center rounded-lg hover:bg-canvas" aria-label="Quay lại">
            <ChevronLeft className="size-5" />
          </Link>
          <div className="leading-tight">
            <h1 className="text-base font-semibold">Đặt lịch khám</h1>
            <p className="text-xs text-muted">Phòng khám chuyên khoa Đau</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5">
        <p className="mb-5 flex items-start gap-2 rounded-xl bg-brand-soft px-3.5 py-3 text-sm text-blue-900">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
          Các thủ thuật can thiệp (tiêm ngoài màng cứng, phong bế thần kinh…) cần bác sĩ chỉ định sau khi khám, nên không đặt trực
          tuyến được.
        </p>
        <SlotPicker services={demoServices} providers={demoProviders} />
      </main>
    </div>
  );
}
