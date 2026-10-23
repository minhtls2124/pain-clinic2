/**
 * Dữ liệu mẫu để chạy thử. Mật khẩu mọi tài khoản: Demo@123
 * Chạy: npm run db:seed   (hoặc tự động sau `prisma migrate reset`)
 */
import { PrismaClient, type RoomType, type ServiceType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const OFFSET = process.env.CLINIC_UTC_OFFSET ?? '+07:00';
const at = (ymd: string, hhmm: string) => new Date(`${ymd}T${hhmm}:00${OFFSET}`);
const ymdOf = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const daysFromToday = (n: number) => ymdOf(new Date(Date.now() + n * 86_400_000));

async function main() {
  const passwordHash = await bcrypt.hash('Demo@123', 10);

  // ── Người dùng & nhân sự ────────────────────────────────────────────────
  const mkStaff = async (email: string, fullName: string, role: 'ADMIN' | 'DOCTOR' | 'TECHNICIAN' | 'RECEPTIONIST' | 'PHARMACIST', extra: { title?: string; specialty?: string; color?: string } = {}) =>
    prisma.user.create({
      data: { email, fullName, role, passwordHash, staff: { create: extra } },
      include: { staff: true },
    });

  await mkStaff('admin@painclinic.vn', 'Quản trị hệ thống', 'ADMIN');
  const drLan = await mkStaff('bs.lan@painclinic.vn', 'Trần Thị Lan', 'DOCTOR', { title: 'BSCKII', specialty: 'Gây mê hồi sức – Điều trị đau', color: '#2563eb' });
  const drMinh = await mkStaff('bs.minh@painclinic.vn', 'Lê Quang Minh', 'DOCTOR', { title: 'ThS.BS', specialty: 'Phục hồi chức năng', color: '#0284c7' });
  const ktvHa = await mkStaff('ktv.ha@painclinic.vn', 'Phạm Thu Hà', 'TECHNICIAN', { title: 'KTV', specialty: 'Vật lý trị liệu', color: '#0891b2' });
  await mkStaff('letan@painclinic.vn', 'Nguyễn Văn Tâm', 'RECEPTIONIST');
  await mkStaff('duocsi@painclinic.vn', 'Đỗ Mai Anh', 'PHARMACIST');

  // ── Bệnh nhân (1 người có tài khoản portal) ────────────────────────────
  const patientUser = await prisma.user.create({
    data: { phone: '0912345678', email: 'benhnhan@example.com', fullName: 'Hoàng Văn Nam', role: 'PATIENT', passwordHash },
  });
  const nam = await prisma.patient.create({
    data: {
      code: 'BN-000001',
      userId: patientUser.id,
      fullName: 'Hoàng Văn Nam',
      dateOfBirth: new Date('1971-04-12'),
      gender: 'MALE',
      phone: '0912345678',
      email: 'benhnhan@example.com',
      occupation: 'Lái xe',
      insuranceNo: 'DN4010123456789',
      histories: {
        create: [
          { type: 'MEDICAL', description: 'Thoát vị đĩa đệm L4-L5, đau rễ L5 trái', icd10Code: 'M51.1' },
          { type: 'MEDICAL', description: 'Tăng huyết áp, đang dùng Amlodipin 5mg', icd10Code: 'I10' },
        ],
      },
    },
  });
  await prisma.patient.create({
    data: { code: 'BN-000002', fullName: 'Vũ Thị Hồng', dateOfBirth: new Date('1985-09-30'), gender: 'FEMALE', phone: '0987654321' },
  });

  // ── Phòng & dịch vụ ─────────────────────────────────────────────────────
  const rooms: { name: string; type: RoomType }[] = [
    { name: 'P.101 – Phòng khám 1', type: 'CONSULT' },
    { name: 'P.102 – Phòng khám 2', type: 'CONSULT' },
    { name: 'P.201 – Thủ thuật 1 (C-arm)', type: 'PROCEDURE' },
    { name: 'P.202 – Thủ thuật 2 (Siêu âm)', type: 'PROCEDURE' },
    { name: 'P.301 – Vật lý trị liệu', type: 'PHYSIOTHERAPY' },
  ];
  await prisma.room.createMany({ data: rooms });

  const services: { code: string; name: string; type: ServiceType; durationMin: number; bufferAfterMin?: number; price: number; requiresRoomType?: RoomType; bookableOnline?: boolean }[] = [
    { code: 'KB-LD', name: 'Khám chuyên khoa đau (lần đầu)', type: 'CONSULTATION', durationMin: 30, price: 300_000, bookableOnline: true },
    { code: 'KB-TK', name: 'Tái khám', type: 'CONSULTATION', durationMin: 15, price: 200_000, bookableOnline: true },
    { code: 'TT-NMC', name: 'Tiêm ngoài màng cứng', type: 'PROCEDURE', durationMin: 45, bufferAfterMin: 15, price: 2_500_000, requiresRoomType: 'PROCEDURE' },
    { code: 'TT-PBTK', name: 'Phong bế thần kinh dưới siêu âm', type: 'PROCEDURE', durationMin: 30, bufferAfterMin: 10, price: 1_500_000, requiresRoomType: 'PROCEDURE' },
    { code: 'VLTL', name: 'Vật lý trị liệu (45 phút)', type: 'PHYSIOTHERAPY', durationMin: 45, price: 250_000, requiresRoomType: 'PHYSIOTHERAPY', bookableOnline: true },
    { code: 'CLS-MRI-CSTL', name: 'MRI cột sống thắt lưng', type: 'IMAGING', durationMin: 30, price: 1_800_000 },
  ];
  for (const s of services) await prisma.service.create({ data: s });
  const svc = Object.fromEntries((await prisma.service.findMany()).map((s) => [s.code, s]));

  // ── Ca làm việc 14 ngày tới (T2–T7: 07:30–11:30, 13:30–17:00) ───────────
  const shiftRows = [];
  for (let i = 0; i < 14; i++) {
    const d = daysFromToday(i);
    if (new Date(`${d}T12:00:00${OFFSET}`).getUTCDay() === 0) continue; // nghỉ Chủ nhật
    for (const staff of [drLan.staff!, drMinh.staff!, ktvHa.staff!]) {
      shiftRows.push({ staffId: staff.id, startAt: at(d, '07:30'), endAt: at(d, '11:30') });
      shiftRows.push({ staffId: staff.id, startAt: at(d, '13:30'), endAt: at(d, '17:00') });
    }
  }
  await prisma.workShift.createMany({ data: shiftRows });

  // ── Kho thuốc & vật tư chuyên khoa ──────────────────────────────────────
  const items = [
    { sku: 'T-LIDO2', name: 'Lidocain 2% 2ml', activeIngredient: 'Lidocaine', strength: '2%', kind: 'DRUG', unit: 'ống', minStock: 50, salePrice: 5_000 },
    { sku: 'T-BUPI5', name: 'Bupivacain 0,5% 20ml', activeIngredient: 'Bupivacaine', strength: '0,5%', kind: 'DRUG', unit: 'lọ', minStock: 20, salePrice: 95_000 },
    { sku: 'T-DEPO40', name: 'Methylprednisolon acetat 40mg/ml', activeIngredient: 'Methylprednisolone', strength: '40 mg/ml', kind: 'DRUG', unit: 'lọ', minStock: 15, salePrice: 120_000 },
    { sku: 'T-PREGA75', name: 'Pregabalin 75mg', activeIngredient: 'Pregabalin', strength: '75 mg', kind: 'DRUG', unit: 'viên', minStock: 200, salePrice: 8_000 },
    { sku: 'T-PARA500', name: 'Paracetamol 500mg', activeIngredient: 'Paracetamol', strength: '500 mg', kind: 'DRUG', unit: 'viên', minStock: 500, salePrice: 1_000 },
    { sku: 'VT-TUOHY18', name: 'Kim Tuohy 18G', kind: 'CONSUMABLE', unit: 'cái', minStock: 20, salePrice: 150_000 },
    { sku: 'VT-SPINAL22', name: 'Kim tủy sống 22G', kind: 'CONSUMABLE', unit: 'cái', minStock: 30, salePrice: 45_000 },
    { sku: 'VT-LOR', name: 'Bơm tiêm mất kháng lực (LOR)', kind: 'CONSUMABLE', unit: 'cái', minStock: 20, salePrice: 60_000 },
  ] as const;
  for (const it of items) {
    const item = await prisma.inventoryItem.create({ data: { ...it } });
    await prisma.stockBatch.createMany({
      data: [
        { itemId: item.id, lotNo: `${it.sku}-A`, expiryDate: new Date(Date.now() + 60 * 86_400_000), quantity: it.minStock, costPrice: Math.round(it.salePrice * 0.7) },
        { itemId: item.id, lotNo: `${it.sku}-B`, expiryDate: new Date(Date.now() + 400 * 86_400_000), quantity: it.minStock * 3, costPrice: Math.round(it.salePrice * 0.7) },
      ],
    });
  }
  const lido = await prisma.inventoryItem.findUniqueOrThrow({ where: { sku: 'T-LIDO2' } });
  await prisma.allergy.create({ data: { patientId: nam.id, substance: 'Iod cản quang', reaction: 'Mề đay', severity: 'MODERATE' } });

  // ── Lịch sử điều trị & thang điểm đau cho biểu đồ VAS ──────────────────
  const history: { daysAgo: number; vas: number; ctx: 'BASELINE' | 'PRE_PROCEDURE' | 'POST_PROCEDURE' | 'FOLLOW_UP' | 'SELF_REPORT'; proc?: 'NMC' | 'PBTK' }[] = [
    { daysAgo: 84, vas: 8.2, ctx: 'BASELINE' },
    { daysAgo: 77, vas: 7.9, ctx: 'FOLLOW_UP' },
    { daysAgo: 70, vas: 8.0, ctx: 'PRE_PROCEDURE', proc: 'NMC' },
    { daysAgo: 69, vas: 5.5, ctx: 'POST_PROCEDURE' },
    { daysAgo: 63, vas: 5.0, ctx: 'SELF_REPORT' },
    { daysAgo: 56, vas: 4.6, ctx: 'FOLLOW_UP' },
    { daysAgo: 42, vas: 5.2, ctx: 'SELF_REPORT' },
    { daysAgo: 35, vas: 5.8, ctx: 'PRE_PROCEDURE', proc: 'PBTK' },
    { daysAgo: 34, vas: 3.6, ctx: 'POST_PROCEDURE' },
    { daysAgo: 21, vas: 3.1, ctx: 'FOLLOW_UP' },
    { daysAgo: 10, vas: 2.8, ctx: 'SELF_REPORT' },
    { daysAgo: 3, vas: 2.5, ctx: 'FOLLOW_UP' },
  ];
  let n = 0;
  for (const h of history) {
    const day = new Date(Date.now() - h.daysAgo * 86_400_000);
    const encounter = h.ctx === 'SELF_REPORT' ? null : await prisma.encounter.create({
      data: {
        code: `LK-SEED-${++n}`,
        patientId: nam.id,
        doctorId: drLan.staff!.id,
        status: 'CLOSED',
        chiefComplaint: 'Đau thắt lưng lan chân trái',
        startedAt: day,
        closedAt: day,
        diagnoses: { create: [{ icd10Code: 'M51.1', description: 'Thoát vị đĩa đệm L4-L5 có bệnh lý rễ', isPrimary: true }] },
      },
    });
    await prisma.painAssessment.create({
      data: {
        patientId: nam.id,
        encounterId: encounter?.id,
        scale: 'VAS',
        score: h.vas,
        vasMm: Math.round(h.vas * 10),
        bodyRegion: 'Thắt lưng – chân trái',
        painType: 'MIXED',
        context: h.ctx,
        recordedById: h.ctx === 'SELF_REPORT' ? null : drLan.staff!.id,
        recordedAt: day,
      },
    });
    if (encounter && h.proc) {
      await prisma.procedureRecord.create({
        data: {
          encounterId: encounter.id,
          serviceId: h.proc === 'NMC' ? svc['TT-NMC']!.id : svc['TT-PBTK']!.id,
          procedureType: h.proc === 'NMC' ? 'EPIDURAL_STEROID_INJECTION' : 'NERVE_BLOCK',
          performedById: drLan.staff!.id,
          laterality: 'LEFT',
          level: h.proc === 'NMC' ? 'L4-L5' : 'Rễ L5',
          guidance: h.proc === 'NMC' ? 'FLUOROSCOPY' : 'ULTRASOUND',
          consentSigned: true,
          performedAt: new Date(day.getTime() + 3600_000),
          supplies: { create: [{ itemId: lido.id, quantity: 2 }] },
        },
      });
    }
  }

  console.log('✓ Seed xong. Đăng nhập: letan@painclinic.vn / Demo@123 — bệnh nhân: 0912345678 / Demo@123');
  console.log(`  Bệnh nhân demo: ${nam.id}  |  BS Lan (providerId): ${drLan.staff!.id}  |  Dịch vụ khám lần đầu: ${svc['KB-LD']!.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
