'use client';

// Trang lỗi chung: thay cho màn hình trắng "Application error" của Next.js
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-3 px-4">
      <p className="text-sm font-semibold text-brand">Phòng khám Đau</p>
      <h1 className="text-2xl font-semibold">Đã có lỗi khi tải trang</h1>
      <p className="text-muted">
        Vui lòng thử lại. Nếu lỗi lặp lại, gửi mã lỗi bên dưới cho bộ phận kỹ thuật.
      </p>
      {error.digest && <p className="font-mono text-sm text-ink">Mã lỗi: {error.digest}</p>}
      <button onClick={reset} className="mt-2 w-fit rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover">
        Thử lại
      </button>
    </main>
  );
}
