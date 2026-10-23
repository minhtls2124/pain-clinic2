import {
  ChartColumn,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  Pill,
  Receipt,
  Search,
  Settings,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Khung ứng dụng cho nhân viên phòng khám (desktop-first).
 * Menu nên lọc theo danh sách quyền từ GET /auth/me (RBAC) — ở đây hiển thị đầy đủ để demo.
 */
const NAV = [
  { href: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { href: '/appointments', label: 'Lịch hẹn', icon: CalendarDays },
  { href: '/patients/demo', label: 'Bệnh nhân', icon: Users },
  { href: '/encounters', label: 'Lượt khám', icon: ClipboardList },
  { href: '/pharmacy', label: 'Dược & Vật tư', icon: Pill },
  { href: '/billing', label: 'Thu ngân', icon: Receipt },
  { href: '/reports', label: 'Báo cáo', icon: ChartColumn },
];

export function ClinicShell({ active, children }: { active: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-white lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="grid size-8 place-items-center rounded-lg bg-brand text-sm font-bold text-white">P</span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Phòng khám Đau</p>
            <p className="text-[11px] text-muted">Pain Clinic MS</p>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active === item.href ? 'bg-brand-soft text-brand' : 'text-slate-600 hover:bg-canvas hover:text-ink',
              )}
            >
              <item.icon className="size-4" aria-hidden />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <span className="grid size-8 place-items-center rounded-full bg-sky-100 text-xs font-semibold text-sky-700">TL</span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium">BSCKII Trần Thị Lan</p>
              <p className="text-[11px] text-muted">Bác sĩ</p>
            </div>
            <Settings className="size-4 text-slate-400" aria-hidden />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-[env(safe-area-inset-top,0px)] z-10 flex h-14 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur lg:px-8">
          <label className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              placeholder="Tìm bệnh nhân theo tên, SĐT, mã BN…  ( / )"
              className="h-9 w-full rounded-lg border border-line bg-canvas pr-3 pl-9 text-sm placeholder:text-slate-400 focus:border-brand focus:bg-white focus:outline-none"
            />
          </label>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
