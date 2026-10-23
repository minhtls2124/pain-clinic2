// Tạo một Prisma migration mới chứa prisma/sql/scheduling_constraints.sql,
// để các ràng buộc EXCLUDE/CHECK được theo dõi trong lịch sử migration như mọi thay đổi khác.
// Chạy SAU khi đã có migration "init": npm run db:constraints && npx prisma migrate dev
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'prisma', 'migrations');
const source = join(root, 'prisma', 'sql', 'scheduling_constraints.sql');

if (!existsSync(migrationsDir) || readdirSync(migrationsDir).filter((d) => /^\d{14}_/.test(d)).length === 0) {
  console.error('✖ Chưa có migration nào. Chạy trước: npx prisma migrate dev --name init');
  process.exit(1);
}

if (readdirSync(migrationsDir).some((d) => d.endsWith('_scheduling_constraints'))) {
  console.log('✓ Migration scheduling_constraints đã tồn tại — bỏ qua.');
  process.exit(0);
}

const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14); // YYYYMMDDHHmmss (UTC)
const target = join(migrationsDir, `${ts}_scheduling_constraints`);
mkdirSync(target, { recursive: true });
copyFileSync(source, join(target, 'migration.sql'));
console.log(`✓ Đã tạo ${target}/migration.sql\n→ Tiếp theo: npx prisma migrate dev`);
