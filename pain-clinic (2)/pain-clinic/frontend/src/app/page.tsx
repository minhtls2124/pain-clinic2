import { CalendarPlus, ChartLine } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 px-4 py-12">
      <div>
        <p className="text-sm font-semibold text-brand">Pain Clinic Management System</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Phòng khám Đau</h1>
        <p className="mt-2 text-muted">Chọn màn hình demo:</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <DemoCard href="/patients/demo" icon={<ChartLine className="size-5" />} title="Hồ sơ bệnh nhân · Biểu đồ VAS" desc="Màn hình bác sĩ (desktop): diễn biến cơn đau và các mốc thủ thuật." />
        <DemoCard href="/booking" icon={<CalendarPlus className="size-5" />} title="Đặt lịch khám trực tuyến" desc="Portal bệnh nhân (mobile): chọn dịch vụ, bác sĩ, khung giờ trống." />
      </div>
    </main>
  );
}

function DemoCard({ href, icon, title, desc }: { href: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Link href={href} className="group rounded-2xl border border-line bg-white p-5 shadow-sm transition hover:border-brand/50 hover:shadow">
      <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">{icon}</span>
      <h2 className="mt-3 font-semibold group-hover:text-brand">{title}</h2>
      <p className="mt-1 text-sm text-muted">{desc}</p>
    </Link>
  );
}
