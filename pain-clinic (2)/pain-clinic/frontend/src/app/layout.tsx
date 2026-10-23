import type { Metadata, Viewport } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';
import './globals.css';

// Font hỗ trợ đầy đủ dấu tiếng Việt, rõ nét ở cỡ chữ nhỏ (bảng biểu, chỉ số)
const beVietnam = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-be-vietnam',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Phòng khám Đau', template: '%s · Phòng khám Đau' },
  description: 'Hệ thống quản lý phòng khám chuyên khoa điều trị đau',
};

export const viewport: Viewport = { themeColor: '#2563eb', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={beVietnam.variable}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
