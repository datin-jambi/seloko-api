/**
 * reset.ts — Pengosongan tabel untuk `--reset`.
 */
import { prisma } from "./utils.js";

/**
 * Kosongkan tabel RBAC + navigasi.
 *
 * Urutan mengikuti arah foreign key: anak lebih dulu, meski onDelete Cascade
 * sudah terpasang — supaya tidak bergantung padanya.
 *
 * Catatan: ini hanya menghapus BARIS, bukan tabel. Untuk membangun ulang skema
 * dari nol pakai `npm run db:migrate:reset`.
 */
export async function resetTables(): Promise<void> {
  console.log("🧹 --reset: mengosongkan tabel RBAC & navigasi…");

  await prisma.page.deleteMany();
  await prisma.article.deleteMany();
  await prisma.articleCategory.deleteMany();
  await prisma.banner.deleteMany();
  await prisma.bapendaUptd.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.userAppRole.deleteMany();
  await prisma.menuRole.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.user.deleteMany();
  await prisma.application.deleteMany();
}
