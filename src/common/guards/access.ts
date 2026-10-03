/**
 * access.ts — Aturan akses lintas aplikasi, murni (tanpa DB/Redis).
 *
 * Dipisah dari guard supaya keputusan keamanannya bisa diuji tanpa menjalankan
 * server: lihat access.check.ts.
 *
 * Model aksesnya:
 *   - Akun INTERNAL (pegawai) hanya masuk lewat aplikasi INTERNAL — seloko,
 *     super app sentral. Dari sana ia mengelola aplikasi lain sesuai role yang
 *     dipegangnya di aplikasi itu.
 *   - Akun PUBLIC (warga) hanya masuk ke aplikasi PUBLIC, dan hanya ke aplikasi
 *     tempat ia sudah mendaftar (punya penugasan role di sana).
 *   - Izin selalu dibaca pada APLIKASI PEMILIK modul, bukan pada pintu masuk.
 */
export type Audience = "INTERNAL" | "PUBLIC";

/** Boleh tidaknya jenis akun ini login ke aplikasi dengan audience tsb. */
export function canAccountUseApp(accountType: Audience, appAudience: Audience): boolean {
  return accountType === appAudience;
}

/**
 * Aplikasi yang izinnya dipakai untuk satu request, atau null bila ditolak.
 *
 * `owner` adalah aplikasi pemilik modul — WAJIB, ditetapkan di kode route.
 * Tidak ada nilai bawaan "pakai pintu masuk": dengan bawaan itu, modul inti
 * seloko (/api/users) membaca izin di aplikasi mana pun token terbit, sehingga
 * warga yang kebetulan memegang permission bernama sama di lapak ("user:list"
 * milik modul lapak sendiri) bisa membaca seluruh pengguna sistem.
 *
 * Hanya akun INTERNAL yang boleh menjangkau aplikasi lain dari pintu masuknya.
 * Akun PUBLIC terkunci di aplikasi tempat ia login.
 */
export function resolveTargetApp(
  accountType: Audience,
  gateway: string,
  owner: string,
): string | null {
  if (owner === gateway) return gateway;
  return accountType === "INTERNAL" ? owner : null;
}
