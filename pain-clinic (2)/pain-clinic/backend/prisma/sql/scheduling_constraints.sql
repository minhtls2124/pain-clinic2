-- =============================================================================
--  Ràng buộc tầng CSDL mà Prisma schema chưa biểu diễn được.
--  Đây là "lớp phòng thủ cuối cùng" chống trùng lịch: kể cả khi có bug ở tầng
--  ứng dụng hay hai request đến cùng lúc, PostgreSQL vẫn từ chối bản ghi chồng giờ.
--
--  Cách áp dụng: `npm run db:constraints` (tạo migration mới chứa file này),
--  sau đó `npx prisma migrate dev`. Xem README.
-- =============================================================================

-- btree_gist cho phép kết hợp so sánh "=" (uuid) với "&&" (range) trong cùng index GiST.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── Appointments ────────────────────────────────────────────────────────────
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_time_valid"
  CHECK ("endAt" > "startAt" AND "blockedUntil" >= "endAt");

-- 1 bác sĩ/KTV không có 2 lịch hoạt động chồng nhau (tính cả thời gian đệm sau thủ thuật).
-- Khoảng nửa mở [start, end): lịch 09:00–09:30 và 09:30–10:00 KHÔNG bị coi là trùng.
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_provider_no_overlap"
  EXCLUDE USING gist (
    "providerId" WITH =,
    tstzrange("startAt", "blockedUntil", '[)') WITH &&
  )
  WHERE ("status" IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'));

-- 1 phòng thủ thuật không bị đặt chồng.
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_room_no_overlap"
  EXCLUDE USING gist (
    "roomId" WITH =,
    tstzrange("startAt", "blockedUntil", '[)') WITH &&
  )
  WHERE ("roomId" IS NOT NULL AND "status" IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'));

-- 1 bệnh nhân không có 2 lịch cùng giờ (không tính thời gian đệm).
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_patient_no_overlap"
  EXCLUDE USING gist (
    "patientId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  )
  WHERE ("status" IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'));

-- ── Work shifts ─────────────────────────────────────────────────────────────
ALTER TABLE "work_shifts"
  ADD CONSTRAINT "work_shifts_time_valid" CHECK ("endAt" > "startAt");

ALTER TABLE "work_shifts"
  ADD CONSTRAINT "work_shifts_no_overlap"
  EXCLUDE USING gist (
    "staffId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  );

-- ── Data integrity khác ─────────────────────────────────────────────────────
ALTER TABLE "pain_assessments"
  ADD CONSTRAINT "pain_assessments_score_range" CHECK ("score" >= 0 AND "score" <= 10);

ALTER TABLE "pain_assessments"
  ADD CONSTRAINT "pain_assessments_vas_mm_range" CHECK ("vasMm" IS NULL OR ("vasMm" >= 0 AND "vasMm" <= 100));

ALTER TABLE "stock_batches"
  ADD CONSTRAINT "stock_batches_quantity_non_negative" CHECK ("quantity" >= 0);

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_amounts_non_negative"
  CHECK ("total" >= 0 AND "paidAmount" >= 0 AND "paidAmount" <= "total");
